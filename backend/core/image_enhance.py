"""Mild automatic photo enhancement for uploaded images.

Applied once per photo (on upload, or via the enhance_photos command for
files uploaded before this existed): fixes EXIF rotation, stretches flat
contrast, and applies a light unsharp mask. Settings are deliberately
gentle — running it twice on the same file is safe but pointless, so the
command should only be run once over historical data.

Logos and transparent PNGs are left alone (autocontrast/sharpen ruins
flat graphics); only photographic content should go through this.
"""
import io
import os

from PIL import Image, ImageOps
from PIL.ImageFilter import UnsharpMask

JPEG_QUALITY = 92


def enhance_pil_image(img):
    """Return an enhanced copy of a PIL image (photographic content)."""
    img = ImageOps.exif_transpose(img)
    has_alpha = img.mode in ('RGBA', 'LA', 'P') and 'transparency' in img.info or img.mode == 'RGBA'
    if has_alpha:
        # keep alpha untouched, enhance the RGB channels only
        rgba = img.convert('RGBA')
        alpha = rgba.getchannel('A')
        rgb = rgba.convert('RGB')
        rgb = ImageOps.autocontrast(rgb, cutoff=1)
        rgb = rgb.filter(UnsharpMask(radius=1.5, percent=60, threshold=3))
        out = rgb.convert('RGBA')
        out.putalpha(alpha)
        return out
    rgb = img.convert('RGB')
    rgb = ImageOps.autocontrast(rgb, cutoff=1)
    rgb = rgb.filter(UnsharpMask(radius=1.5, percent=60, threshold=3))
    return rgb


def enhance_image_bytes(data, filename):
    """Enhance raw image bytes; returns (new_bytes, ok). GIFs (animated)
    and unreadable files come back unchanged with ok=False."""
    ext = os.path.splitext(filename or '')[1].lower()
    if ext == '.gif':
        return data, False
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        return data, False
    out = enhance_pil_image(img)
    buf = io.BytesIO()
    if ext == '.png' or out.mode == 'RGBA':
        out.save(buf, format='PNG', optimize=True)
    elif ext == '.webp':
        out.save(buf, format='WEBP', quality=JPEG_QUALITY)
    else:
        out.save(buf, format='JPEG', quality=JPEG_QUALITY, optimize=True,
                 progressive=True)
    return buf.getvalue(), True


def enhance_uploaded_image(uploaded_file):
    """Enhance a Django UploadedFile in place (best effort). Returns a new
    ContentFile ready to be assigned to an ImageField, or the original
    file when enhancement isn't possible."""
    from django.core.files.base import ContentFile
    pos = uploaded_file.tell()
    uploaded_file.seek(0)
    data = uploaded_file.read()
    uploaded_file.seek(pos)
    new_data, ok = enhance_image_bytes(data, uploaded_file.name)
    if not ok:
        return uploaded_file
    return ContentFile(new_data, name=uploaded_file.name)
