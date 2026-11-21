"""
ClipForge API — Server-Side Text Ad Renderer (Phase 6).

Renders customizable text ads and lower thirds into transparent PNG assets
using Pillow so preview and export look identical across all resolutions.
"""

from __future__ import annotations

import io
import os
from typing import Tuple

from PIL import Image, ImageColor, ImageDraw, ImageFont


def hex_to_rgba(hex_color: str, opacity: float = 1.0) -> Tuple[int, int, int, int]:
    """Convert hex color string (#RRGGBB or #RGB) + opacity (0..1) to (r, g, b, a)."""
    try:
        rgb = ImageColor.getrgb(hex_color)
        alpha = int(max(0.0, min(1.0, opacity)) * 255)
        return (rgb[0], rgb[1], rgb[2], alpha)
    except Exception:
        alpha = int(max(0.0, min(1.0, opacity)) * 255)
        return (255, 255, 255, alpha)


def get_font(font_name: str = "Roboto", size: int = 36) -> ImageFont.ImageFont:
    """
    Attempt to load a TrueType font supporting Cyrillic/Unicode,
    falling back to system fonts or Pillow default.
    """
    # Candidate paths for Linux, Windows, or bundled directory
    candidates = [
        # Bundled
        os.path.join(os.path.dirname(__file__), "..", "fonts", f"{font_name}.ttf"),
        # Linux standard
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        # Windows standard
        "C:\\Windows\\Fonts\\arial.ttf",
        "C:\\Windows\\Fonts\\segoeui.ttf",
        "arial.ttf",
    ]

    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                continue

    try:
        return ImageFont.truetype("arial.ttf", size=size)
    except Exception:
        return ImageFont.load_default()


def render_text_ad_png(
    text: str,
    font_name: str = "Roboto",
    font_size: int = 36,
    text_color: str = "#FFFFFF",
    stroke_color: str | None = None,
    bg_color: str | None = None,
    bg_opacity: float = 0.8,
    padding: int = 24,
) -> Tuple[bytes, int, int]:
    """
    Render a text string to a transparent PNG byte buffer with optional background and stroke.

    Returns:
        (png_bytes, width, height)
    """
    font = get_font(font_name, font_size)

    # Calculate text bounding box (left, top, right, bottom)
    dummy_img = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    dummy_draw = ImageDraw.Draw(dummy_img)

    bbox = dummy_draw.textbbox((0, 0), text, font=font)
    text_w = max(1, bbox[2] - bbox[0])
    text_h = max(1, bbox[3] - bbox[1])

    # Dimensions with padding
    width = text_w + padding * 2
    height = text_h + padding * 2

    # Create transparent canvas
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Draw rounded rectangle background if specified
    if bg_color:
        rgba_bg = hex_to_rgba(bg_color, bg_opacity)
        radius = min(12, height // 4)
        draw.rounded_rectangle(
            [(0, 0), (width, height)],
            radius=radius,
            fill=rgba_bg,
        )

    # Position text centered within padded canvas
    x = padding - bbox[0]
    y = padding - bbox[1]

    rgba_text = hex_to_rgba(text_color, 1.0)
    stroke_kwargs = {}
    if stroke_color:
        stroke_kwargs["stroke_width"] = max(1, font_size // 15)
        stroke_kwargs["stroke_fill"] = hex_to_rgba(stroke_color, 1.0)

    draw.text((x, y), text, font=font, fill=rgba_text, **stroke_kwargs)

    # Save to PNG in-memory buffer
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    buf.seek(0)
    return buf.getvalue(), width, height
