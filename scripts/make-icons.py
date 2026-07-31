#!/usr/bin/env python3
"""Generate the PWA icon set into public/.

Rerun after changing BRAND or GLYPH:
    python3 scripts/make-icons.py

Sizes follow what installers actually ask for:
  icon-192 / icon-512      any-purpose, used by Android + desktop Chrome
  icon-maskable-512        Android adaptive icons; glyph kept inside the safe zone
  apple-touch-icon (180)   iOS home screen; must be opaque, iOS applies its own mask
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BRAND = "#E5683C"  # the same orange the in-app logo tile uses
FG = "#FFFFFF"
GLYPH = "S"
FONT_PATH = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"

PUBLIC = Path(__file__).resolve().parent.parent / "public"


def render(size: int, glyph_ratio: float, radius_ratio: float | None) -> Image.Image:
    """Draw one icon.

    glyph_ratio  fraction of the canvas the glyph's box may occupy. Maskable
                 icons need a smaller value so Android can crop to a circle
                 without clipping the letter.
    radius_ratio corner rounding, or None for a full-bleed square.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if radius_ratio is None:
        draw.rectangle([0, 0, size, size], fill=BRAND)
    else:
        draw.rounded_rectangle(
            [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=BRAND
        )

    # Binary-search a font size that fits the glyph into the target box.
    target = size * glyph_ratio
    lo, hi, best = 1, size * 2, 1
    while lo <= hi:
        mid = (lo + hi) // 2
        box = ImageFont.truetype(FONT_PATH, mid).getbbox(GLYPH)
        if max(box[2] - box[0], box[3] - box[1]) <= target:
            best, lo = mid, mid + 1
        else:
            hi = mid - 1

    font = ImageFont.truetype(FONT_PATH, best)
    box = font.getbbox(GLYPH)
    draw.text(
        ((size - (box[2] + box[0])) / 2, (size - (box[3] + box[1])) / 2),
        GLYPH,
        font=font,
        fill=FG,
    )
    return img


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, 0.60, 0.22),
        ("icon-512.png", 512, 0.60, 0.22),
        # Android crops maskable icons to a shape inside the middle 80%.
        ("icon-maskable-512.png", 512, 0.44, None),
        # iOS rounds the corners itself, so ship a full square.
        ("apple-touch-icon.png", 180, 0.60, None),
    ]
    for name, size, glyph_ratio, radius in jobs:
        out = PUBLIC / name
        render(size, glyph_ratio, radius).save(out)
        print(f"wrote public/{name} ({size}x{size})")


if __name__ == "__main__":
    main()
