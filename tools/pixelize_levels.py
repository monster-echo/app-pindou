#!/usr/bin/env python3
"""
Pindou Blockbuster Level Pixelizer & Bead Previewer
Converts HD illustrations and public-domain masterpieces into crisp,
playable Perler-bead LevelData JSON entries + bead-rendered previews.
"""

from __future__ import annotations

import collections
import json
import math
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
    return f"#{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}"


def color_dist(c1: Tuple[int, int, int], c2: Tuple[int, int, int]) -> float:
    # Weighted perceptual Euclidean distance (redmean approximation)
    rmean = (c1[0] + c2[0]) * 0.5
    dr = c1[0] - c2[0]
    dg = c1[1] - c2[1]
    db = c1[2] - c2[2]
    return math.sqrt(
        (2.0 + rmean / 256.0) * dr * dr
        + 4.0 * dg * dg
        + (2.0 + (255.0 - rmean) / 256.0) * db * db
    )


def flood_remove_bg(img: Image.Image, thresh: float = 34.0) -> Image.Image:
    """Flood-fill exterior background from borders using perceptual color distance."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()

    # Sample corners to estimate background color
    corners = [
        px[0, 0][:3],
        px[w - 1, 0][:3],
        px[0, h - 1][:3],
        px[w - 1, h - 1][:3],
    ]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    # Only run if corners are relatively uniform (e.g. solid white/cream backdrop)
    if max(color_dist(c, bg) for c in corners) > 65.0:
        return rgba

    visited = bytearray(w * h)
    q = collections.deque()

    def try_push(x: int, y: int):
        idx = y * w + x
        if visited[idx]:
            return
        r, g, b, a = px[x, y]
        if a < 128 or color_dist((r, g, b), bg) <= thresh:
            visited[idx] = 1
            q.append((x, y))

    for x in range(w):
        try_push(x, 0)
        try_push(x, h - 1)
    for y in range(h):
        try_push(0, y)
        try_push(w - 1, y)

    while q:
        cx, cy = q.popleft()
        px[cx, cy] = (0, 0, 0, 0)
        if cx > 0:
            try_push(cx - 1, cy)
        if cx + 1 < w:
            try_push(cx + 1, cy)
        if cy > 0:
            try_push(cx, cy - 1)
        if cy + 1 < h:
            try_push(cx, cy + 1)

    return rgba


def crop_to_content(rgba: Image.Image, pad_ratio: float = 0.03) -> Image.Image:
    bbox = rgba.getbbox()
    if not bbox:
        return rgba
    x0, y0, x1, y1 = bbox
    cw = x1 - x0
    ch = y1 - y0
    pad = max(2, int(max(cw, ch) * pad_ratio))
    nx0 = max(0, x0 - pad)
    ny0 = max(0, y0 - pad)
    nx1 = min(rgba.width, x1 + pad)
    ny1 = min(rgba.height, y1 + pad)
    return rgba.crop((nx0, ny0, nx1, ny1))


def fit_on_canvas(rgba: Image.Image, target_w: int, target_h: int, sampling: str) -> Tuple[List[List[Optional[Tuple[int, int, int]]]], int, int]:
    """Resize preserving aspect ratio (or fill for full-bleed paintings) and return RGB grid."""
    if sampling == "painterly":
        # Center-crop to match target aspect ratio cleanly for full-bleed art
        src_ar = rgba.width / rgba.height
        dst_ar = target_w / target_h
        if abs(src_ar - dst_ar) > 0.04:
            if src_ar > dst_ar:
                new_w = int(rgba.height * dst_ar)
                left = (rgba.width - new_w) // 2
                rgba = rgba.crop((left, 0, left + new_w, rgba.height))
            else:
                new_h = int(rgba.width / dst_ar)
                top = (rgba.height - new_h) // 2
                rgba = rgba.crop((0, top, rgba.width, top + new_h))
        # Subtle saturation & sharpness boost for crisp bead colors
        rgb = rgba.convert("RGB")
        rgb = ImageEnhance.Color(rgb).enhance(1.18)
        rgb = ImageEnhance.Contrast(rgb).enhance(1.08)
        rgb = rgb.resize((target_w, target_h), Image.Resampling.LANCZOS)
        px = rgb.load()
        grid: List[List[Optional[Tuple[int, int, int]]]] = []
        for y in range(target_h):
            row = []
            for x in range(target_w):
                row.append(px[x, y])
            grid.append(row)
        return grid, target_w, target_h

    # Crisp cel-shaded / sprite mode: preserve aspect ratio inside target_w x target_h
    scale = min(target_w / rgba.width, target_h / rgba.height)
    rw = max(4, round(rgba.width * scale))
    rh = max(4, round(rgba.height * scale))

    # Supersample to 4x grid then pick dominant/center-weighted pixel per cell to avoid muddy halos
    ss = 4
    hi = rgba.resize((rw * ss, rh * ss), Image.Resampling.BILINEAR)
    hpx = hi.load()

    off_x = (target_w - rw) // 2
    off_y = (target_h - rh) // 2
    grid = [[None for _ in range(target_w)] for _ in range(target_h)]

    for gy in range(rh):
        for gx in range(rw):
            opaque_samples = []
            for sy in range(ss):
                for sx in range(ss):
                    r, g, b, a = hpx[gx * ss + sx, gy * ss + sy]
                    if a >= 150:
                        opaque_samples.append((r, g, b))
            if len(opaque_samples) < (ss * ss) // 2:
                continue
            # Pick median-like representative (closest to medoid of opaque samples, avoiding dark-white edge averages)
            best_c = opaque_samples[0]
            if len(opaque_samples) > 1:
                avg = tuple(sum(c[i] for c in opaque_samples) / len(opaque_samples) for i in range(3))
                # Prefer darker/saturated pixel if near border mix, otherwise closest to cluster
                best_c = min(opaque_samples, key=lambda c: color_dist(c, avg))
            grid[off_y + gy][off_x + gx] = best_c

    return grid, target_w, target_h


def quantize_grid(
    grid: List[List[Optional[Tuple[int, int, int]]]],
    max_colors: int,
    min_color_gap: float = 28.0,
    despeckle_passes: int = 1,
) -> Tuple[List[str], List[str], int]:
    """Quantize non-empty grid cells to <= max_colors (max 35), merge close colors, despeckle, return (colors_hex, rows_str, total)."""
    h = len(grid)
    w = len(grid[0])
    max_colors = min(35, max(2, max_colors))

    pts = []
    coords = []
    for y in range(h):
        for x in range(w):
            c = grid[y][x]
            if c is not None:
                pts.append(c)
                coords.append((x, y))

    if not pts:
        return ["#000000"], ["0" * w for _ in range(h)], 0

    # Weight vibrant/saturated pixels 3x during palette discovery so neon fireworks,
    # bright eyes, and small accent details never get swallowed by large dark/bg regions.
    sample_pts: List[Tuple[int, int, int]] = []
    for c in pts:
        sample_pts.append(c)
        mx = max(c)
        mn = min(c)
        sat = mx - mn
        if sat > 90 or (mx > 215 and mn > 160):
            sample_pts.append(c)
            sample_pts.append(c)

    # Pack points into a 1D-tall RGB image and use PIL MEDIANCUT quantization
    strip = Image.new("RGB", (len(sample_pts), 1))
    strip.putdata(sample_pts)
    q_strip = strip.quantize(colors=max_colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal_raw = q_strip.getpalette() or []
    # Map every original pixel to its nearest discovered palette color
    # Extract distinct palette entries from MEDIANCUT first
    raw_counts = collections.Counter(q_strip.getdata())
    used_indices = [idx for idx, _ in raw_counts.most_common()]
    raw_palette = [(pal_raw[i * 3], pal_raw[i * 3 + 1], pal_raw[i * 3 + 2]) for i in used_indices]

    # Merge perceptually near-duplicate palette entries
    palette: List[Tuple[int, int, int]] = []
    for rgb in raw_palette:
        if not any(color_dist(rgb, p_rgb) < min_color_gap for p_rgb in palette):
            palette.append(rgb)

    # Assign each grid cell to closest merged palette color
    sums = [[0, 0, 0, 0] for _ in range(len(palette))]
    idx_grid = [[0 for _ in range(w)] for _ in range(h)]
    for (x, y), orig_rgb in zip(coords, pts):
        ci = min(range(len(palette)), key=lambda i: color_dist(orig_rgb, palette[i])) + 1
        idx_grid[y][x] = ci
        sums[ci - 1][0] += orig_rgb[0]
        sums[ci - 1][1] += orig_rgb[1]
        sums[ci - 1][2] += orig_rgb[2]
        sums[ci - 1][3] += 1

    for i in range(len(palette)):
        cnt = sums[i][3]
        if cnt > 0:
            palette[i] = (
                round(sums[i][0] / cnt),
                round(sums[i][1] / cnt),
                round(sums[i][2] / cnt),
            )

    # Smart despeckle: snap isolated 1-pixel noise specks to majority neighbor IF brightness/hue difference isn't an intentional eye glint
    for _ in range(despeckle_passes):
        new_grid = [row[:] for row in idx_grid]
        for y in range(h):
            for x in range(w):
                c = idx_grid[y][x]
                if c == 0:
                    continue
                neigh = []
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and idx_grid[ny][nx] > 0:
                        neigh.append(idx_grid[ny][nx])
                if not neigh:
                    continue
                if c not in neigh and len(neigh) >= 3:
                    maj = collections.Counter(neigh).most_common(1)[0][0]
                    # Preserve high-contrast intentional details (e.g. eye sparkle or dark pupil)
                    if color_dist(palette[c - 1], palette[maj - 1]) < 185.0:
                        new_grid[y][x] = maj
        idx_grid = new_grid

    # Compact palette so only actually used colors remain, ordered by frequency
    final_counts = collections.Counter()
    for y in range(h):
        for x in range(w):
            if idx_grid[y][x] > 0:
                final_counts[idx_grid[y][x]] += 1

    remap: Dict[int, int] = {}
    final_palette: List[Tuple[int, int, int]] = []
    for old_c, _ in final_counts.most_common():
        if len(final_palette) < 35:
            final_palette.append(palette[old_c - 1])
            remap[old_c] = len(final_palette)
        else:
            # Map overflow to closest color in top 35
            target = min(range(35), key=lambda k: color_dist(palette[old_c - 1], final_palette[k])) + 1
            remap[old_c] = target

    rows_str = []
    total = 0
    for y in range(h):
        chars = []
        for x in range(w):
            c = idx_grid[y][x]
            if c == 0:
                chars.append("0")
            else:
                nc = remap[c]
                chars.append(BASE36[nc])
                total += 1
        rows_str.append("".join(chars))

    colors_hex = [rgb_to_hex(rgb) for rgb in final_palette]
    return colors_hex, rows_str, total


def render_bead_preview(colors: List[str], rows: List[str], out_path: Path, cell_px: int = 8) -> None:
    """Render a realistic hollow Perler-bead preview image on a warm craft background."""
    h = len(rows)
    w = len(rows[0])
    pad = 16
    img_w = w * cell_px + pad * 2
    img_h = h * cell_px + pad * 2
    im = Image.new("RGB", (img_w, img_h), (252, 246, 238))
    draw = ImageDraw.Draw(im)

    rgb_pal = [
        (int(hx[1:3], 16), int(hx[3:5], 16), int(hx[5:7], 16))
        for hx in colors
    ]

    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            idx = BASE36.index(ch)
            if idx == 0:
                continue
            r, g, b = rgb_pal[idx - 1]
            cx = pad + x * cell_px + cell_px / 2
            cy = pad + y * cell_px + cell_px / 2
            rad = cell_px * 0.46
            draw.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=(r, g, b))
            if cell_px >= 6:
                hr = cell_px * 0.14
                draw.ellipse((cx - hr, cy - hr, cx + hr, cy + hr), fill=(246, 238, 228))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    im.save(out_path)


def convert_image_to_level(
    src_path: Path,
    target_w: int,
    target_h: int,
    max_colors: int,
    sampling: str = "crisp",
    remove_bg: bool = True,
    bg_thresh: float = 34.0,
    min_color_gap: float = 28.0,
    despeckle_passes: int = 1,
) -> Tuple[List[str], List[str], int]:
    img = Image.open(src_path)
    if remove_bg:
        rgba = flood_remove_bg(img, thresh=bg_thresh)
        rgba = crop_to_content(rgba, pad_ratio=0.02)
    else:
        rgba = img.convert("RGBA")

    grid, _, _ = fit_on_canvas(rgba, target_w, target_h, sampling=sampling)
    return quantize_grid(
        grid,
        max_colors=max_colors,
        min_color_gap=min_color_gap,
        despeckle_passes=despeckle_passes,
    )
