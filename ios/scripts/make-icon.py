"""
Generates the ZeroSlip app icon at 1024x1024.
Design: yellow caution background with a bold black exclamation mark,
echoing the universal "Caution: Wet Floor" sign.
"""

from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

SIZE = 1024

# --- Background: caution yellow with subtle vertical highlight ---
CAUTION_YELLOW = (255, 199, 44)  # #FFC72C
img = Image.new("RGBA", (SIZE, SIZE), CAUTION_YELLOW + (255,))

# Soft white highlight from top (gives a hint of depth without being shiny)
highlight = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
hdraw = ImageDraw.Draw(highlight)
for y in range(SIZE):
    alpha = int(45 * max(0.0, 1 - y / (SIZE * 0.55)))
    hdraw.line([(0, y), (SIZE, y)], fill=(255, 255, 255, alpha))
img = Image.alpha_composite(img, highlight)

# Slight darker vignette at the bottom-right for depth
shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sdraw = ImageDraw.Draw(shadow)
for y in range(SIZE):
    a_y = max(0.0, (y / SIZE - 0.55) / 0.45)
    alpha = int(40 * a_y)
    sdraw.line([(0, y), (SIZE, y)], fill=(0, 0, 0, alpha))
img = Image.alpha_composite(img, shadow)

# --- Foreground: a tilted black sign panel with a yellow "!" ---
# Build on a separate layer so we can rotate it.
sign = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sdraw = ImageDraw.Draw(sign)

cx, cy = SIZE // 2, SIZE // 2

# Sign panel — tall rounded rectangle representing one face of a wet-floor A-frame
panel_w = int(SIZE * 0.46)
panel_h = int(SIZE * 0.74)
px0 = cx - panel_w // 2
py0 = cy - panel_h // 2
px1 = cx + panel_w // 2
py1 = cy + panel_h // 2
radius = int(SIZE * 0.05)
BLACK = (15, 15, 15, 255)
sdraw.rounded_rectangle([px0, py0, px1, py1], radius=radius, fill=BLACK)

# Inner highlight on the panel — thin lighter rim
rim = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
rdraw = ImageDraw.Draw(rim)
rdraw.rounded_rectangle(
    [px0 + 3, py0 + 3, px1 - 3, py1 - 3],
    radius=radius - 3,
    outline=(255, 255, 255, 25),
    width=2,
)
sign = Image.alpha_composite(sign, rim)

# "!" mark in caution yellow — fills most of the panel
mark_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
mdraw = ImageDraw.Draw(mark_layer)

bar_w = int(panel_w * 0.22)
bar_h = int(panel_h * 0.50)
bar_x0 = cx - bar_w // 2
bar_y0 = py0 + int(panel_h * 0.12)
bar_x1 = cx + bar_w // 2
bar_y1 = bar_y0 + bar_h
mdraw.rounded_rectangle(
    [bar_x0, bar_y0, bar_x1, bar_y1],
    radius=bar_w // 3,
    fill=CAUTION_YELLOW + (255,),
)

# Dot below
dot_d = int(bar_w * 1.05)
dot_y = bar_y1 + int(panel_h * 0.09)
mdraw.ellipse(
    [cx - dot_d // 2, dot_y, cx + dot_d // 2, dot_y + dot_d],
    fill=CAUTION_YELLOW + (255,),
)

sign = Image.alpha_composite(sign, mark_layer)

# Tilt the whole sign 6 degrees for a touch of energy
sign = sign.rotate(-6, resample=Image.BICUBIC, expand=False)

# Composite onto background
img = Image.alpha_composite(img, sign)

# Final: flatten and save as RGB (App Store icons must not have alpha)
out = img.convert("RGB")

ROOT = Path(__file__).resolve().parents[1]
out_dir = ROOT / "BORSystems" / "Assets.xcassets" / "AppIcon.appiconset"
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "AppIcon-1024.png"
out.save(out_path, "PNG", optimize=True)
print(f"wrote {out_path}")

# Also write a smaller preview to /tmp so we can inspect
preview = out.resize((256, 256), Image.LANCZOS)
preview.save("/tmp/bor-icon-preview.png", "PNG")
print("preview: /tmp/bor-icon-preview.png")
