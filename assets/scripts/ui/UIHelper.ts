import { Button, Color, Graphics, Label, Node, Sprite, UIOpacity, UITransform, Vec3, Widget, tween } from 'cc';
import { AudioManager } from '../core/AudioManager';
import { ResManager } from '../core/ResManager';
import { SaveManager } from '../core/SaveManager';
import { BeadFinishId, LevelData, PegboardStyleId, RGB, cellColorIndex, hexToRgb } from '../core/Types';

export interface PegboardPalette {
    body: Color;
    innerBorder: Color;
    outerBorder: Color;
    tab: Color;
    rivet: Color;
    pegDefault: Color;
    pegSelected: Color;
    holeBg: Color;
    isDark: boolean;
}

export function getPegboardPalette(style: PegboardStyleId = SaveManager.ins.activePegboard): PegboardPalette {
    switch (style) {
        case 'sakura':
            return {
                body: new Color(255, 236, 242, 240),
                innerBorder: new Color(255, 248, 250, 245),
                outerBorder: new Color(244, 192, 208, 235),
                tab: new Color(255, 224, 234, 240),
                rivet: new Color(234, 168, 188, 190),
                pegDefault: new Color(255, 244, 248, 240),
                pegSelected: new Color(255, 206, 222, 255),
                holeBg: new Color(255, 236, 242, 255),
                isDark: false,
            };
        case 'mint':
            return {
                body: new Color(232, 250, 245, 240),
                innerBorder: new Color(248, 255, 252, 245),
                outerBorder: new Color(172, 226, 212, 235),
                tab: new Color(220, 246, 238, 240),
                rivet: new Color(140, 204, 188, 190),
                pegDefault: new Color(244, 255, 252, 240),
                pegSelected: new Color(196, 242, 230, 255),
                holeBg: new Color(232, 250, 245, 255),
                isDark: false,
            };
        case 'night':
            return {
                body: new Color(46, 44, 78, 245),
                innerBorder: new Color(118, 114, 174, 210),
                outerBorder: new Color(84, 80, 138, 240),
                tab: new Color(58, 56, 98, 240),
                rivet: new Color(245, 196, 92, 220),
                pegDefault: new Color(86, 84, 132, 240),
                pegSelected: new Color(152, 128, 226, 255),
                holeBg: new Color(46, 44, 78, 255),
                isDark: true,
            };
        case 'acrylic':
        default:
            return {
                body: new Color(252, 247, 241, 235),
                innerBorder: new Color(255, 255, 255, 245),
                outerBorder: new Color(224, 204, 184, 230),
                tab: new Color(248, 240, 232, 235),
                rivet: new Color(214, 194, 174, 160),
                pegDefault: new Color(255, 252, 248, 240),
                pegSelected: new Color(255, 224, 218, 255),
                holeBg: new Color(252, 246, 238, 255),
                isDark: false,
            };
    }
}

export function applyBeadFinishRgb(rgb: RGB, finish: BeadFinishId): RGB {
    if (finish === 'pearl') {
        return {
            r: Math.min(255, Math.round(rgb.r * 0.8 + 255 * 0.2)),
            g: Math.min(255, Math.round(rgb.g * 0.8 + 248 * 0.2)),
            b: Math.min(255, Math.round(rgb.b * 0.8 + 252 * 0.2)),
        };
    }
    if (finish === 'jelly') {
        return {
            r: Math.min(255, Math.round(rgb.r * 1.06 + 8)),
            g: Math.min(255, Math.round(rgb.g * 1.06 + 8)),
            b: Math.min(255, Math.round(rgb.b * 1.06 + 8)),
        };
    }
    return rgb;
}

export const THEME = {
    bg: new Color(255, 247, 238, 255),          // #FFF7EE warm craft table
    card: new Color(255, 255, 255, 248),        // #FFFFFF frosted card
    cardBorder: new Color(235, 218, 200, 255),  // #EBDAC8
    primary: new Color(255, 107, 139, 255),     // #FF6B8B coral pink
    primaryDark: new Color(224, 72, 106, 255),
    accent: new Color(255, 179, 71, 255),       // #FFB347 warm honey
    mint: new Color(45, 196, 182, 255),         // #2DC4B6 mint
    text: new Color(62, 42, 36, 255),           // #3E2A24 warm espresso
    textSub: new Color(138, 112, 98, 255),      // #8A7062
    pegboard: new Color(252, 247, 241, 235),    // frosted acrylic pegboard
    pegDot: new Color(214, 194, 174, 255),
    highlight: new Color(255, 224, 212, 255),
    gold: new Color(245, 166, 35, 255),
};

export function createNode(name: string, parent: Node, w = 100, h = 100): Node {
    const n = new Node(name);
    n.setParent(parent);
    const ui = n.addComponent(UITransform);
    ui.setContentSize(w, h);
    return n;
}

export function addFullStretchWidget(node: Node, top = 0, bottom = 0, left = 0, right = 0): Widget {
    const w = node.getComponent(Widget) || node.addComponent(Widget);
    w.isAlignTop = w.isAlignBottom = w.isAlignLeft = w.isAlignRight = true;
    w.top = top;
    w.bottom = bottom;
    w.left = left;
    w.right = right;
    w.updateAlignment();
    return w;
}

export function createUiSprite(name: string, parent: Node, uiKey: string, w: number, h: number): Sprite | null {
    const sf = ResManager.ins.getUi(uiKey);
    if (!sf) return null;
    const n = createNode(name, parent, w, h);
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    if (sf.insetLeft > 0 || sf.insetRight > 0 || sf.insetTop > 0 || sf.insetBottom > 0) {
        sp.type = Sprite.Type.SLICED;
    }
    sp.spriteFrame = sf;
    return sp;
}

export function drawRoundedBox(
    g: Graphics,
    w: number,
    h: number,
    radius: number,
    fill: Color,
    stroke?: Color,
    strokeWidth = 2,
    shadow = false,
): void {
    g.clear();
    if (shadow) {
        g.fillColor = new Color(92, 61, 46, 20);
        g.roundRect(-w / 2, -h / 2 - 6, w, h, radius);
        g.fill();
        g.fillColor = new Color(92, 61, 46, 16);
        g.roundRect(-w / 2 + 2, -h / 2 - 3, w - 4, h, radius);
        g.fill();
    }
    g.fillColor = fill;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.fill();
    if (stroke && strokeWidth > 0) {
        g.strokeColor = stroke;
        g.lineWidth = strokeWidth;
        g.roundRect(-w / 2, -h / 2, w, h, radius);
        g.stroke();
    }
}

export function createLabel(
    name: string,
    parent: Node,
    text: string,
    fontSize: number,
    color: Color = THEME.text,
    bold = false,
    maxW?: number,
    maxH?: number,
): Label {
    const n = new Node(name);
    n.setParent(parent);
    const ui = n.addComponent(UITransform);
    const lbl = n.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = fontSize;
    lbl.lineHeight = Math.round(fontSize * 1.25);
    lbl.color = color;
    lbl.isBold = bold;
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    if (maxW && maxW > 0) {
        ui.setContentSize(maxW, maxH || Math.round(fontSize * 1.5));
        lbl.overflow = Label.Overflow.SHRINK;
    }
    return lbl;
}

/** Left-aligned bounded label that NEVER overflows or collides with adjacent controls. */
export function createLeftLabel(
    name: string,
    parent: Node,
    text: string,
    x: number,
    y: number,
    maxW: number,
    h: number,
    fontSize: number,
    color: Color = THEME.text,
    bold = false,
): Label {
    const lbl = createLabel(name, parent, text, fontSize, color, bold, maxW, h);
    lbl.horizontalAlign = Label.HorizontalAlign.LEFT;
    lbl.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    lbl.node.setPosition(x, y, 0);
    return lbl;
}

export function createIconSprite(name: string, parent: Node, iconKey: string, size: number): Sprite | null {
    const sf = ResManager.ins.getIcon(iconKey);
    if (!sf) return null;
    const n = createNode(name, parent, size, size);
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = sf;
    return sp;
}

function pickButtonTextureKey(bgColor: Color): string {
    if (bgColor.r > 235 && bgColor.g > 155 && bgColor.b < 110) return 'btn_gold';
    if (bgColor.r > 220 && bgColor.g < 140 && bgColor.b > 110 && bgColor.b < 180) return 'btn_pink';
    if (bgColor.b > 210 && bgColor.r > 110 && bgColor.g < 150) return 'btn_purple';
    if (bgColor.g > 170 && bgColor.b > 160 && bgColor.r < 120) return 'btn_mint';
    return 'btn_cream';
}

function getWhiteLabelOutline(uiKey: string): Color | null {
    switch (uiKey) {
        case 'btn_pink':
            return new Color(138, 24, 62, 220);
        case 'btn_purple':
            return new Color(66, 32, 144, 220);
        case 'btn_mint':
            return new Color(16, 96, 82, 220);
        case 'btn_gold':
        case 'btn_hero_gold':
            return new Color(142, 64, 10, 230);
        default:
            return null;
    }
}

export function createPillButton(
    name: string,
    parent: Node,
    text: string,
    w: number,
    h: number,
    bgColor: Color,
    textColor: Color,
    onClick: () => void,
    fontSize = 24,
    borderColor?: Color,
    iconKey?: string,
    iconSize = 28,
    uiKeyOverride?: string,
): Node {
    const n = createNode(name, parent, w, h);
    const uiKey = uiKeyOverride || pickButtonTextureKey(bgColor);
    const sf = ResManager.ins.getUi(uiKey);
    if (sf) {
        // Add 18px visual margin for the soft baked drop shadow in button sprites
        const bgNode = createNode('Bg', n, w + 18, h + 18);
        bgNode.setPosition(0, -2, 0);
        const sp = bgNode.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        if (sf.insetLeft > 0 || sf.insetRight > 0 || sf.insetTop > 0 || sf.insetBottom > 0) {
            sp.type = Sprite.Type.SLICED;
        }
        sp.spriteFrame = sf;
    } else {
        const g = n.addComponent(Graphics);
        drawRoundedBox(g, w, h, h / 2, bgColor, borderColor, borderColor ? 2 : 0, true);
    }

    const usableW = Math.max(40, w - 36);
    if (iconKey && ResManager.ins.getIcon(iconKey)) {
        if (text.length > 0) {
            const gap = 12;
            const safeIcon = Math.min(iconSize, h - 18);
            let estW = 0;
            for (let i = 0; i < text.length; i++) {
                estW += text.charCodeAt(i) > 127 ? fontSize : fontSize * 0.64;
            }
            const labelMaxW = Math.max(24, usableW - safeIcon - gap);
            const drawTextW = Math.min(estW + 4, labelMaxW);
            const totalW = safeIcon + gap + drawTextW;
            const leftStart = -totalW / 2;
            const ic = createIconSprite('Icon', n, iconKey, safeIcon);
            if (ic) ic.node.setPosition(leftStart + safeIcon / 2, 1, 0);
            const lbl = createLabel('Label', n, text, fontSize, textColor, true, labelMaxW, h - 10);
            lbl.enableWrapText = false;
            lbl.horizontalAlign = Label.HorizontalAlign.LEFT;
            lbl.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
            lbl.node.setPosition(leftStart + safeIcon + gap, 2, 0);
            if (textColor.r > 235 && textColor.g > 235 && textColor.b > 235) {
                const oc = getWhiteLabelOutline(uiKey);
                if (oc) {
                    lbl.enableOutline = true;
                    lbl.outlineColor = oc;
                    lbl.outlineWidth = 2;
                }
            }
        } else {
            createIconSprite('Icon', n, iconKey, Math.min(iconSize, h - 12));
        }
    } else if (text.length > 0) {
        const lbl = createLabel('Label', n, text, fontSize, textColor, true, usableW, h - 10);
        lbl.enableWrapText = false;
        lbl.node.setPosition(0, 2, 0);
        if (textColor.r > 235 && textColor.g > 235 && textColor.b > 235) {
            const oc = getWhiteLabelOutline(uiKey);
            if (oc) {
                lbl.enableOutline = true;
                lbl.outlineColor = oc;
                lbl.outlineWidth = 2;
            }
        }
    }

    const btn = n.addComponent(Button);
    btn.transition = Button.Transition.SCALE;
    btn.zoomScale = 0.94;
    n.on(Button.EventType.CLICK, onClick);
    return n;
}

/** Draw a single crisp 3D hollow Perler bead at (cx, cy) with radius `r`. */
export function drawSingle3DBead(
    g: Graphics,
    cx: number,
    cy: number,
    r: number,
    rgb: RGB,
    holeBg: Color,
    shadow = true,
    finish: BeadFinishId = SaveManager.ins.activeBeadFinish,
): void {
    const tinted = applyBeadFinishRgb(rgb, finish);
    const darkR = Math.max(0, tinted.r - 42);
    const darkG = Math.max(0, tinted.g - 42);
    const darkB = Math.max(0, tinted.b - 42);
    const lightR = Math.min(255, tinted.r + 65);
    const lightG = Math.min(255, tinted.g + 65);
    const lightB = Math.min(255, tinted.b + 65);
    const bodyAlpha = finish === 'jelly' ? 222 : 255;

    if (shadow) {
        g.fillColor = new Color(56, 36, 26, 34);
        g.circle(cx + r * 0.06, cy - r * 0.14, r * 1.02);
        g.fill();
    }
    g.fillColor = new Color(darkR, darkG, darkB, bodyAlpha);
    g.circle(cx, cy - r * 0.04, r);
    g.fill();

    g.fillColor = new Color(tinted.r, tinted.g, tinted.b, bodyAlpha);
    g.circle(cx, cy + r * 0.04, r * 0.92);
    g.fill();

    if (finish === 'jelly') {
        g.fillColor = new Color(255, 255, 255, 215);
        g.circle(cx - r * 0.3, cy + r * 0.34, r * 0.28);
        g.fill();
        g.fillColor = new Color(lightR, lightG, lightB, 140);
        g.circle(cx + r * 0.28, cy - r * 0.26, r * 0.16);
        g.fill();
    } else if (finish === 'pearl') {
        g.fillColor = new Color(255, 252, 255, 200);
        g.circle(cx - r * 0.28, cy + r * 0.32, r * 0.28);
        g.fill();
        g.fillColor = new Color(255, 240, 248, 120);
        g.circle(cx + r * 0.24, cy + r * 0.18, r * 0.18);
        g.fill();
    } else {
        g.fillColor = new Color(lightR, lightG, lightB, 175);
        g.circle(cx - r * 0.34, cy + r * 0.36, r * 0.22);
        g.fill();
    }

    const rHole = r * 0.36;
    g.fillColor = new Color(darkR, darkG, darkB, 180);
    g.circle(cx, cy, rHole * 1.18);
    g.fill();
    g.fillColor = holeBg;
    g.circle(cx, cy - r * 0.02, rHole * 0.88);
    g.fill();

    if (finish === 'sparkle' && r >= 4) {
        const sx = cx + r * 0.42;
        const sy = cy + r * 0.42;
        const sr = Math.max(1.8, r * 0.28);
        g.fillColor = new Color(255, 255, 255, 245);
        g.moveTo(sx, sy + sr);
        g.lineTo(sx + sr * 0.34, sy + sr * 0.34);
        g.lineTo(sx + sr, sy);
        g.lineTo(sx + sr * 0.34, sy - sr * 0.34);
        g.lineTo(sx, sy - sr);
        g.lineTo(sx - sr * 0.34, sy - sr * 0.34);
        g.lineTo(sx - sr, sy);
        g.lineTo(sx - sr * 0.34, sy + sr * 0.34);
        g.close();
        g.fill();
    }
}

/** Draw a miniature Perler bead preview of a level onto a Graphics component. */
export function drawLevelThumbnail(
    g: Graphics,
    level: LevelData,
    boxSize: number,
    filledSet: Set<number> | null,
    ironed: boolean,
    showFullPreview = true,
    pegStyle: PegboardStyleId = SaveManager.ins.activePegboard,
    beadFinish: BeadFinishId = SaveManager.ins.activeBeadFinish,
): void {
    g.clear();
    const boardPal = getPegboardPalette(pegStyle);

    // Soft acrylic pegboard pad
    g.fillColor = boardPal.body;
    g.roundRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize, 20);
    g.fill();
    g.strokeColor = boardPal.outerBorder;
    g.lineWidth = 2;
    g.roundRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize, 20);
    g.stroke();

    const maxDim = Math.max(level.width, level.height);
    const cell = (boxSize * 0.84) / maxDim;
    const startX = -(level.width * cell) / 2;
    const startY = (level.height * cell) / 2;
    const palette = level.colors.map(hexToRgb);
    const fastMode = maxDim >= 44;

    for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
            const cIdx = cellColorIndex(level, x, y);
            if (cIdx === 0) continue;
            const idx = y * level.width + x;
            const isFilled = filledSet ? filledSet.has(idx) : false;
            const cx = startX + (x + 0.5) * cell;
            const cy = startY - (y + 0.5) * cell;

            if (!isFilled) {
                if (showFullPreview) {
                    const rgb = palette[cIdx - 1];
                    g.fillColor = new Color(rgb.r, rgb.g, rgb.b, boardPal.isDark ? 128 : 96);
                    if (fastMode) {
                        g.rect(cx - cell * 0.4, cy - cell * 0.4, cell * 0.8, cell * 0.8);
                    } else {
                        g.circle(cx, cy, cell * 0.35);
                    }
                    g.fill();
                } else {
                    g.fillColor = boardPal.isDark ? new Color(110, 108, 162, 200) : new Color(224, 206, 188, 235);
                    if (fastMode) {
                        g.rect(cx - cell * 0.32, cy - cell * 0.32, cell * 0.64, cell * 0.64);
                    } else {
                        g.circle(cx, cy, cell * 0.28);
                    }
                    g.fill();
                }
                continue;
            }

            const rgb = applyBeadFinishRgb(palette[cIdx - 1], beadFinish);
            if (ironed) {
                g.fillColor = new Color(rgb.r, rgb.g, rgb.b, beadFinish === 'jelly' ? 232 : 255);
                if (fastMode) {
                    g.rect(cx - cell * 0.52, cy - cell * 0.52, cell * 1.04, cell * 1.04);
                    g.fill();
                } else {
                    g.roundRect(cx - cell * 0.52, cy - cell * 0.52, cell * 1.04, cell * 1.04, cell * 0.14);
                    g.fill();
                    if (x + 1 < level.width && cellColorIndex(level, x + 1, y) > 0) {
                        g.rect(cx, cy - cell * 0.48, cell * 0.55, cell * 0.96);
                        g.fill();
                    }
                    if (y + 1 < level.height && cellColorIndex(level, x, y + 1) > 0) {
                        g.rect(cx - cell * 0.48, cy - cell * 0.55, cell * 0.96, cell * 0.55);
                        g.fill();
                    }
                    g.fillColor = new Color(255, 255, 255, beadFinish === 'jelly' || beadFinish === 'sparkle' ? 95 : 50);
                    g.circle(cx - cell * 0.15, cy + cell * 0.15, cell * 0.16);
                    g.fill();
                }
            } else if (fastMode) {
                g.fillColor = new Color(rgb.r, rgb.g, rgb.b, beadFinish === 'jelly' ? 226 : 255);
                g.rect(cx - cell * 0.45, cy - cell * 0.45, cell * 0.9, cell * 0.9);
                g.fill();
            } else {
                drawSingle3DBead(g, cx, cy, cell * 0.44, palette[cIdx - 1], boardPal.holeBg, false, beadFinish);
            }
        }
    }
}

function drawRoyalGoldStar(g: Graphics, cx: number, cy: number, r: number, color: Color): void {
    g.fillColor = color;
    g.moveTo(cx, cy + r);
    g.lineTo(cx + r * 0.28, cy + r * 0.28);
    g.lineTo(cx + r, cy);
    g.lineTo(cx + r * 0.28, cy - r * 0.28);
    g.lineTo(cx, cy - r);
    g.lineTo(cx - r * 0.28, cy - r * 0.28);
    g.lineTo(cx - r, cy);
    g.lineTo(cx - r * 0.28, cy + r * 0.28);
    g.close();
    g.fill();
}

function drawRoyalGoldDinar(g: Graphics, r: number): void {
    g.fillColor = new Color(188, 114, 16, 255);
    g.circle(0, -r * 0.08, r);
    g.fill();
    g.fillColor = new Color(255, 206, 52, 255);
    g.circle(0, 0, r * 0.94);
    g.fill();
    g.strokeColor = new Color(214, 140, 22, 255);
    g.lineWidth = 2;
    g.circle(0, 0, r * 0.72);
    g.stroke();
    drawRoyalGoldStar(g, 0, 0, r * 0.44, new Color(255, 248, 204, 240));
}

function spawnJewelSparkle(layer: Node, x: number, y: number, color: Color, size = 14): void {
    const sp = createNode('JewelSpark', layer, size * 2, size * 2);
    sp.setPosition(x, y, 0);
    const op = sp.addComponent(UIOpacity);
    op.opacity = 255;
    drawRoyalGoldStar(sp.addComponent(Graphics), 0, 0, size, color);
    sp.setScale(0.25, 0.25, 1);
    tween(sp)
        .parallel(
            tween().to(0.22, { scale: new Vec3(1.25, 1.25, 1), angle: 35 }, { easing: 'backOut' }),
            tween().by(0.42, { position: new Vec3((Math.random() - 0.5) * 34, 18 + Math.random() * 24, 0) }, { easing: 'cubicOut' }),
        )
        .to(0.18, { scale: new Vec3(0.1, 0.1, 1) })
        .call(() => { if (sp.isValid) sp.destroy(); })
        .start();
    tween(op).delay(0.16).to(0.26, { opacity: 0 }).start();
}

/**
 * Opulent Middle-Eastern style coin burst: golden starburst, 3D-spinning dinar coins,
 * jewel sparkles, target impact halo, floating `+{amount}` gold popup, and Hijaz chime SFX.
 */
export function playCoinBurstEffect(
    parent: Node,
    fromPos: Vec3,
    targetPos: Vec3,
    amount: number,
    targetPulseNode?: Node | null,
    coinCount = 10,
    playSound = true,
): void {
    if (!parent || !parent.isValid) return;

    const layer = createNode('CoinBurstFX', parent, 10, 10);
    layer.setPosition(0, 0, 0);
    layer.setSiblingIndex(parent.children.length - 1);

    const isGrand = amount >= 120 || coinCount >= 11;
    if (playSound) {
        AudioManager.ins.playCoin(isGrand);
    }

    // 1. Origin Royal Sunburst Rays + Golden Shockwave Halo
    const burst = createNode('Sunburst', layer, 220, 220);
    burst.setPosition(fromPos.x, fromPos.y, 0);
    const burstOp = burst.addComponent(UIOpacity);
    burstOp.opacity = 235;
    const bg = burst.addComponent(Graphics);
    bg.fillColor = new Color(255, 218, 86, 135);
    for (let r = 0; r < 8; r++) {
        const a = (Math.PI * 2 * r) / 8;
        const a1 = a - 0.14;
        const a2 = a + 0.14;
        bg.moveTo(0, 0);
        bg.lineTo(Math.cos(a1) * 102, Math.sin(a1) * 102);
        bg.lineTo(Math.cos(a2) * 102, Math.sin(a2) * 102);
        bg.close();
    }
    bg.fill();
    bg.strokeColor = new Color(255, 226, 104, 215);
    bg.lineWidth = 5;
    bg.circle(0, 0, 56);
    bg.stroke();
    burst.setScale(0.35, 0.35, 1);
    tween(burst)
        .parallel(
            tween().to(0.48, { scale: new Vec3(isGrand ? 1.55 : 1.25, isGrand ? 1.55 : 1.25, 1), angle: 42 }, { easing: 'cubicOut' }),
            tween(burstOp).to(0.48, { opacity: 0 }, { easing: 'quadIn' }),
        )
        .call(() => { if (burst.isValid) burst.destroy(); })
        .start();

    // Jewel sparkles at origin (Royal Gold, Emerald, Ruby accents)
    const jewelColors = [
        new Color(255, 228, 92, 255),
        new Color(45, 216, 184, 255),
        new Color(255, 107, 148, 255),
    ];
    const sparkTotal = isGrand ? 10 : 6;
    for (let s = 0; s < sparkTotal; s++) {
        const ang = (Math.PI * 2 * s) / sparkTotal + Math.random() * 0.4;
        const dist = 28 + Math.random() * 44;
        spawnJewelSparkle(
            layer,
            fromPos.x + Math.cos(ang) * dist,
            fromPos.y + Math.sin(ang) * dist,
            jewelColors[s % jewelColors.length],
            isGrand ? 16 : 12,
        );
    }

    // 2. Cascading 3D-Spinning Gold Dinar Coins
    const totalCoins = Math.max(6, Math.min(18, isGrand ? Math.max(14, coinCount) : coinCount));
    let finishedCount = 0;

    for (let i = 0; i < totalCoins; i++) {
        const coin = createNode(`FlyCoin_${i}`, layer, 44, 44);
        coin.setPosition(fromPos.x, fromPos.y, 0);
        coin.setScale(0.32, 0.32, 1);

        const ic = createIconSprite('Ic', coin, 'icon_coin', 42);
        if (!ic) {
            drawRoyalGoldDinar(coin.addComponent(Graphics), 20);
        }

        const angle = (Math.PI * 2 * i) / totalCoins + (Math.random() - 0.5) * 0.42;
        const spread = (isGrand ? 64 : 48) + Math.random() * 54;
        const scatterPos = new Vec3(
            fromPos.x + Math.cos(angle) * spread,
            fromPos.y + Math.sin(angle) * spread + 18,
            0,
        );
        const delay = i * 0.036;

        tween(coin)
            .delay(delay)
            .to(
                0.18,
                { position: scatterPos, scale: new Vec3(1.18, 1.18, 1) },
                { easing: 'backOut' },
            )
            // 3D coin flip spin while arcing toward target
            .to(0.11, { scale: new Vec3(0.22, 1.08, 1) })
            .to(0.11, { scale: new Vec3(1.04, 1.04, 1) })
            .to(
                0.24,
                { position: new Vec3(targetPos.x, targetPos.y, 0), scale: new Vec3(0.78, 0.78, 1) },
                { easing: 'cubicIn' },
            )
            .call(() => {
                if (finishedCount === 0 || finishedCount === Math.floor(totalCoins / 2) || finishedCount === totalCoins - 1) {
                    // Golden impact ring at target
                    const hitRing = createNode('HitRing', layer, 90, 90);
                    hitRing.setPosition(targetPos.x, targetPos.y, 0);
                    const hOp = hitRing.addComponent(UIOpacity);
                    hOp.opacity = 220;
                    const hg = hitRing.addComponent(Graphics);
                    hg.strokeColor = new Color(255, 214, 72, 240);
                    hg.lineWidth = 4;
                    hg.circle(0, 0, 34);
                    hg.stroke();
                    hitRing.setScale(0.6, 0.6, 1);
                    tween(hitRing)
                        .parallel(
                            tween().to(0.28, { scale: new Vec3(1.65, 1.65, 1) }, { easing: 'cubicOut' }),
                            tween(hOp).to(0.28, { opacity: 0 }),
                        )
                        .call(() => { if (hitRing.isValid) hitRing.destroy(); })
                        .start();

                    spawnJewelSparkle(
                        layer,
                        targetPos.x + (Math.random() - 0.5) * 38,
                        targetPos.y + (Math.random() - 0.5) * 24,
                        jewelColors[finishedCount % jewelColors.length],
                        13,
                    );

                    if (targetPulseNode && targetPulseNode.isValid) {
                        tween(targetPulseNode)
                            .to(0.07, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'quadOut' })
                            .to(0.13, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                            .start();
                    }
                }
                finishedCount++;
                if (coin.isValid) coin.destroy();
                if (finishedCount >= totalCoins && layer.isValid) {
                    tween(layer).delay(0.45).call(() => {
                        if (layer.isValid) layer.destroy();
                    }).start();
                }
            })
            .start();
    }

    if (amount > 0) {
        const floatNode = createNode('CoinFloatTxt', parent, 260, 56);
        floatNode.setPosition(targetPos.x, targetPos.y + 22, 0);
        floatNode.setSiblingIndex(parent.children.length - 1);
        const op = floatNode.addComponent(UIOpacity);
        op.opacity = 255;

        const lbl = createLabel('Lbl', floatNode, `✦ +${amount} ✦`, 32, new Color(255, 224, 82, 255), true, 260, 50);
        lbl.enableOutline = true;
        lbl.outlineColor = new Color(98, 46, 8, 250);
        lbl.outlineWidth = 4;

        floatNode.setScale(0.45, 0.45, 1);
        tween(floatNode)
            .to(0.18, { scale: new Vec3(1.24, 1.24, 1) }, { easing: 'backOut' })
            .to(0.12, { scale: new Vec3(1.04, 1.04, 1) })
            .parallel(
                tween().by(0.75, { position: new Vec3(0, 60, 0) }, { easing: 'cubicOut' }),
                tween(op).delay(0.22).to(0.53, { opacity: 0 }, { easing: 'quadIn' }),
            )
            .call(() => {
                if (floatNode.isValid) floatNode.destroy();
            })
            .start();
    }
}
