import os
from PIL import Image

"""
Generate multi-size .ico and tray icons from source PNG.

Usage:
    python scripts/generate-icon.py

Requires: pip install Pillow
"""

# Paths
src_path = r"C:\Users\Admin\WorkBuddy\2026-07-02-11-38-07\export\指纹浏览器图标_完整版.png"
project_root = r"d:\00-work\mywork\my-fingerprint-browser"
public_dir = os.path.join(project_root, "public")

# Create public directory if it doesn't exist
os.makedirs(public_dir, exist_ok=True)

# Load the source image
img = Image.open(src_path)

# Convert to RGBA if needed (for transparency support)
if img.mode != 'RGBA':
    img = img.convert('RGBA')

# Create multi-size .ico file (used for app icon, window icon, and installer)
# Standard Windows icon sizes
sizes = [(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)]

ico_path = os.path.join(public_dir, "icon.ico")
img.save(
    ico_path,
    format='ICO',
    sizes=sizes
)

# Verify
ico_check = Image.open(ico_path)
print(f"Created multi-size .ico: {ico_path}")
print(f"  Sizes included: {ico_check.info.get('sizes', set())}")

# Create a dedicated 16x16 tray icon PNG for crisp tray display
tray_icon = img.resize((16, 16), Image.LANCZOS)
tray_path = os.path.join(public_dir, "tray-icon.png")
tray_icon.save(tray_path, format='PNG')
print(f"Created tray icon: {tray_path}")

# Also create a 2x tray icon for high DPI displays (32x32)
tray_icon_2x = img.resize((32, 32), Image.LANCZOS)
tray_2x_path = os.path.join(public_dir, "tray-icon@2x.png")
tray_icon_2x.save(tray_2x_path, format='PNG')
print(f"Created tray icon @2x: {tray_2x_path}")

print("Done!")
