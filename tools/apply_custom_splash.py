#!/usr/bin/env python3
"""
Restore custom Perler-bead LaunchScreen art & patch built Cocos splashScreen settings
so Cocos CLI builds never revert to the dark 'Created with Cocos' splash.
"""
import base64
import json
import os
import shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LAUNCH_SRC_DIR = os.path.join(ROOT, "settings", "launch")
IOS_NATIVE_DIR = os.path.join(ROOT, "native", "engine", "ios")
LOGO_PATH = os.path.join(ROOT, "settings", "splash_logo.png")


def restore_ios_launch_images():
    if not os.path.isdir(LAUNCH_SRC_DIR) or not os.path.isdir(IOS_NATIVE_DIR):
        return
    for name in (
        "LaunchScreenBackground.png",
        "LaunchScreenBackgroundPortrait.png",
        "LaunchScreenBackgroundLandscape.png",
    ):
        src = os.path.join(LAUNCH_SRC_DIR, name)
        dst = os.path.join(IOS_NATIVE_DIR, name)
        if os.path.isfile(src):
            shutil.copy2(src, dst)
            print(f"[splash] restored {os.path.relpath(dst, ROOT)}")


def patch_settings_json(settings_path: str, logo_data_uri: str, total_time: int):
    if not os.path.isfile(settings_path):
        return
    with open(settings_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["splashScreen"] = {
        "displayRatio": 0.48,
        "totalTime": total_time,
        "watermarkLocation": "default",
        "autoFit": True,
        "logo": {
            "type": "custom",
            "base64": logo_data_uri,
        },
        "background": {
            "type": "color",
            "color": {
                "x": 1.0,
                "y": 0.9686,
                "z": 0.9333,
                "w": 1.0,
            },
        },
    }
    with open(settings_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    print(f"[splash] patched {os.path.relpath(settings_path, ROOT)} (totalTime={total_time})")


def patch_web_shell():
    css_path = os.path.join(ROOT, "build", "web-mobile", "style.css")
    if os.path.isfile(css_path):
        with open(css_path, "r", encoding="utf-8") as f:
            css = f.read()
        if "background-color: #333;" in css:
            css = css.replace("background-color: #333;", "background-color: #FFF7EE;")
            with open(css_path, "w", encoding="utf-8") as f:
                f.write(css)
            print("[splash] updated build/web-mobile/style.css background to #FFF7EE")

    html_path = os.path.join(ROOT, "build", "web-mobile", "index.html")
    if os.path.isfile(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()
        if "<title>Cocos Creator | pindou</title>" in html:
            html = html.replace("<title>Cocos Creator | pindou</title>", "<title>趣味拼豆 | Pindou</title>")
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(html)
            print("[splash] updated build/web-mobile/index.html title")


def main():
    restore_ios_launch_images()
    if not os.path.isfile(LOGO_PATH):
        raise FileNotFoundError(f"Missing splash logo: {LOGO_PATH}")
    with open(LOGO_PATH, "rb") as f:
        logo_b64 = base64.b64encode(f.read()).decode("ascii")
    logo_uri = f"data:image/png;base64,{logo_b64}"

    patch_settings_json(os.path.join(ROOT, "build", "ios", "data", "src", "settings.json"), logo_uri, 0)
    patch_settings_json(os.path.join(ROOT, "build", "web-mobile", "src", "settings.json"), logo_uri, 900)
    patch_settings_json(os.path.join(ROOT, "build", "android", "data", "src", "settings.json"), logo_uri, 600)
    patch_settings_json(os.path.join(ROOT, "build", "android", "assets", "src", "settings.json"), logo_uri, 600)
    patch_web_shell()


if __name__ == "__main__":
    main()
