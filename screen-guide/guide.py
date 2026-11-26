#!/usr/bin/env python3
"""
screen-guide/guide.py — Universal Screen Pack helper (shot & point).
Usage:
  python3 screen-guide/guide.py shot [--grid]
  python3 screen-guide/guide.py point <x_percent> <y_percent> "<label>"
"""

import math
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

GUIDE_DIR = Path(__file__).resolve().parent
LATEST_PATH = GUIDE_DIR / "latest.png"
POINTED_PATH = GUIDE_DIR / "pointed.png"


def detect_os() -> str:
    sys_name = platform.system()
    if sys_name == "Linux" and os.environ.get("WAYLAND_DISPLAY"):
        return "Linux (Wayland)"
    return sys_name


def draw_grid(img) -> None:
    from PIL import ImageDraw, ImageFont

    draw = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    font = ImageFont.load_default()

    for pct in range(10, 100, 10):
        x = int(w * pct / 100)
        y = int(h * pct / 100)
        draw.line([(x, 0), (x, h)], fill=(255, 255, 255, 55), width=1)
        draw.line([(0, y), (w, y)], fill=(255, 255, 255, 55), width=1)
        draw.text((x + 4, 6), f"{pct}%", fill=(255, 255, 255, 160), font=font)
        draw.text((6, y + 4), f"{pct}%", fill=(255, 255, 255, 160), font=font)


def cmd_shot(with_grid: bool = False) -> int:
    GUIDE_DIR.mkdir(parents=True, exist_ok=True)
    os_name = platform.system()

    try:
        if os_name == "Darwin":
            subprocess.run(["screencapture", "-x", str(LATEST_PATH)], check=True)
        elif os_name == "Linux":
            if shutil.which("grim") and os.environ.get("WAYLAND_DISPLAY"):
                subprocess.run(["grim", str(LATEST_PATH)], check=True)
            elif shutil.which("scrot"):
                subprocess.run(["scrot", "-o", str(LATEST_PATH)], check=True)
            elif shutil.which("import"):
                subprocess.run(["import", "-window", "root", str(LATEST_PATH)], check=True)
            else:
                from PIL import ImageGrab
                img = ImageGrab.grab()
                img.save(LATEST_PATH)
        else:
            from PIL import ImageGrab
            img = ImageGrab.grab()
            img.save(LATEST_PATH)
    except Exception as exc:
        print(f"Screenshot unavailable in current headless session ({detect_os()}): {exc}", file=sys.stderr)
        return 1

    if with_grid and LATEST_PATH.exists():
        from PIL import Image
        img = Image.open(LATEST_PATH).convert("RGBA")
        draw_grid(img)
        img.save(LATEST_PATH)

    print(f"Saved screenshot to {LATEST_PATH}")
    return 0


def cmd_point(x_pct: float, y_pct: float, label: str) -> int:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Pillow is required for local PNG annotation. Install with: pip install pillow", file=sys.stderr)
        return 1

    if not LATEST_PATH.exists():
        print(f"No screenshot found at {LATEST_PATH}. Run 'shot' first.", file=sys.stderr)
        return 1

    img = Image.open(LATEST_PATH).convert("RGBA")
    w, h = img.size
    tip_x = max(0.0, min(100.0, x_pct)) / 100.0 * w
    tip_y = max(0.0, min(100.0, y_pct)) / 100.0 * h

    # Place tail offset toward screen center so it never clips off-edge
    dx = -130 if tip_x > w * 0.5 else 130
    dy = -110 if tip_y > h * 0.5 else 110
    tail_x = max(40.0, min(w - 40.0, tip_x + dx))
    tail_y = max(40.0, min(h - 40.0, tip_y + dy))

    draw = ImageDraw.Draw(img, "RGBA")
    angle = math.atan2(tip_y - tail_y, tip_x - tail_x)
    head_len = 34
    head_angle = math.pi / 6

    left_x = tip_x - head_len * math.cos(angle - head_angle)
    left_y = tip_y - head_len * math.sin(angle - head_angle)
    right_x = tip_x - head_len * math.cos(angle + head_angle)
    right_y = tip_y - head_len * math.sin(angle + head_angle)

    # White outline
    draw.line([(tail_x, tail_y), (tip_x, tip_y)], fill=(255, 255, 255, 255), width=14)
    draw.polygon([(tip_x, tip_y), (left_x, left_y), (right_x, right_y)], fill=(255, 255, 255, 255))

    # Big red-orange arrow
    draw.line([(tail_x, tail_y), (tip_x, tip_y)], fill=(255, 69, 0, 255), width=8)
    draw.polygon([(tip_x, tip_y), (left_x, left_y), (right_x, right_y)], fill=(255, 69, 0, 255))

    # Dark pill near the tail
    font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), label, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad_x, pad_y = 14, 8
    pill_w = tw + pad_x * 2
    pill_h = th + pad_y * 2
    px0 = max(8.0, min(w - pill_w - 8.0, tail_x - pill_w / 2))
    py0 = max(8.0, min(h - pill_h - 8.0, tail_y - pill_h / 2))

    draw.rounded_rectangle(
        [px0, py0, px0 + pill_w, py0 + pill_h],
        radius=pill_h / 2,
        fill=(15, 23, 42, 235),
        outline=(255, 255, 255, 210),
        width=2,
    )
    draw.text((px0 + pad_x, py0 + pad_y - 1), label, fill=(255, 255, 255, 255), font=font)

    img.save(POINTED_PATH)
    print(f"Annotated screenshot saved to {POINTED_PATH}")

    # Open in default image viewer when running on a desktop session
    if os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY") or platform.system() in ("Darwin", "Windows"):
        opener = "open" if platform.system() == "Darwin" else "xdg-open"
        if shutil.which(opener):
            subprocess.Popen([opener, str(POINTED_PATH)])

    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    cmd = sys.argv[1].lower()
    if cmd == "shot":
        return cmd_shot(with_grid="--grid" in sys.argv[2:])
    if cmd == "point" and len(sys.argv) >= 5:
        return cmd_point(float(sys.argv[2]), float(sys.argv[3]), " ".join(sys.argv[4:]))

    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
