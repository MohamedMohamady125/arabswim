"""One image pipeline for every upload.

Ingest (normalize_*): every ImageField upload is cleaned once, on save —
rotation fixed from EXIF, metadata (GPS etc.) stripped, colours converted to
sRGB, longest side capped, re-encoded to JPEG (photos) or PNG (anything with
real transparency), and given a content-hashed name so a URL never changes
its content.

Delivery (derived_image): /img/<width>/<path> returns a copy sized for the
slot that shows it, as WebP when the browser accepts it, cached on disk.
Layout (cover / contain, focal position) is the frontend's job; the server
only guarantees a clean, light, correctly oriented file of the right size.
"""
import hashlib
import io
import os
import re

from PIL import Image, ImageChops, ImageOps

# Longest side kept for the stored master copy
MASTER_MAX_SIDE = 2560
# Refuse to decode anything bigger than this (decompression-bomb guard)
MAX_PIXELS = 60_000_000
# Delivery widths. A request is rounded UP to the next bucket, so the number
# of cached variants per image is bounded no matter what a client asks for.
WIDTHS = (64, 128, 256, 384, 512, 768, 1024, 1600)
DERIVED_DIR = '_derived'
# Portraits that are cut out onto white and centred on upload (core/cutout.py)
PORTRAIT_FIELDS = {('swimmers', 'swimmer', 'photo'), ('core', 'photorequest', 'photo')}
JPEG_QUALITY = 88
WEBP_QUALITY = 82


def _has_real_alpha(img):
    """True when the image has an alpha channel that is actually used."""
    if img.mode in ('RGBA', 'LA'):
        lo, _hi = img.getchannel('A').getextrema()
        return lo < 250
    if img.mode == 'P' and 'transparency' in img.info:
        return True
    return False


def _to_srgb(img):
    """Convert an image with an embedded colour profile to sRGB (best effort)."""
    icc = img.info.get('icc_profile')
    if not icc:
        return img
    try:
        from PIL import ImageCms
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        dst = ImageCms.createProfile('sRGB')
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGBA' if _has_real_alpha(img) else 'RGB')
        out = ImageCms.profileToProfile(img, src, dst, outputMode=img.mode)
        out.info.pop('icc_profile', None)
        return out
    except Exception:
        return img


def _open(data):
    img = Image.open(io.BytesIO(data))
    if img.width * img.height > MAX_PIXELS:
        raise ValueError('image too large')
    return img


def _slug(stem):
    stem = re.sub(r'[^A-Za-z0-9_-]+', '-', stem or '').strip('-').lower()
    return stem[:40] or 'image'


def normalize_image_bytes(data, filename):
    """Clean raw upload bytes. Returns (new_bytes, new_filename), or None when
    the file should be stored untouched (animated GIF, unreadable, SVG...)."""
    try:
        img = _open(data)
        if getattr(img, 'is_animated', False):
            return None
        src_format = (img.format or '').upper()
        img.load()
    except Exception:
        return None
    try:
        img = ImageOps.exif_transpose(img)
        img = _to_srgb(img)
        alpha = _has_real_alpha(img)
        if alpha:
            img = img.convert('RGBA')
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        if max(img.size) > MASTER_MAX_SIDE:
            img.thumbnail((MASTER_MAX_SIDE, MASTER_MAX_SIDE), Image.LANCZOS)

        jpeg = {'format': 'JPEG', 'quality': JPEG_QUALITY, 'optimize': True, 'progressive': True}
        buf = io.BytesIO()
        ext = '.jpg'
        if alpha:
            img.save(buf, format='PNG', optimize=True)
            ext = '.png'
        elif src_format == 'PNG':
            # Flat graphics (logos, crests) stay lossless; a PNG that is
            # really a photo is far too heavy and becomes a JPEG.
            img.save(buf, format='PNG', optimize=True)
            ext = '.png'
            if buf.tell() > 1_500_000:
                buf = io.BytesIO()
                img.save(buf, **jpeg)
                ext = '.jpg'
        else:
            img.save(buf, **jpeg)
        out = buf.getvalue()
    except Exception:
        return None
    stem = os.path.splitext(os.path.basename(filename or ''))[0]
    digest = hashlib.sha1(out).hexdigest()[:10]
    return out, f'{_slug(stem)}-{digest}{ext}'


def _is_cutout(data):
    """True for a picture with a really transparent background."""
    try:
        img = _open(data)
        img.load()
        return _has_real_alpha(img)
    except Exception:
        return False


def normalize_fieldfile(instance, field):
    """Normalise a not-yet-saved upload sitting on an ImageField (in place)."""
    from django.core.files.base import ContentFile
    ff = getattr(instance, field.name, None)
    if not ff or getattr(ff, '_committed', True):
        return
    try:
        f = ff.file
        f.seek(0)
        data = f.read()
        f.seek(0)
    except Exception:
        return
    name = ff.name
    meta = instance._meta
    if (meta.app_label, meta.model_name, field.name) in PORTRAIT_FIELDS:
        from django.conf import settings
        if getattr(settings, 'PORTRAIT_CUTOUT', True):
            from core.cutout import isolate_upload, is_marked, marked_name
            if is_marked(name) and _is_cutout(data):
                # A portrait that has already been cut out, re-framed by hand
                # in the crop tool ("Crop and zoom" on the saved photo): keep
                # the person's framing — cutting it out again would re-centre
                # it and soften the edge.
                name = marked_name(name)
            else:
                cut = isolate_upload(data, name)
                if cut:
                    data, name = cut
    res = normalize_image_bytes(data, name)
    if not res:
        return
    new_bytes, new_name = res
    setattr(instance, field.name, ContentFile(new_bytes, name=new_name))


def normalize_on_save(sender, instance, raw=False, **kwargs):
    """pre_save hook: clean every freshly uploaded ImageField, whatever code
    path (API view, serializer, Django admin, script) put it there."""
    if raw:
        return
    from django.db.models import ImageField
    for field in sender._meta.concrete_fields:
        if isinstance(field, ImageField):
            normalize_fieldfile(instance, field)


# ---------------------------------------------------------------- delivery

def bucket_width(w):
    try:
        w = int(w)
    except (TypeError, ValueError):
        w = WIDTHS[-1]
    for b in WIDTHS:
        if w <= b:
            return b
    return WIDTHS[-1]


def trim_borders(img):
    """Cut empty margins off a logo: transparent edges, or a flat near-white
    background shared by all four corners (a coloured backdrop is part of the
    badge and is kept). Leaves the image alone when unsure."""
    w, h = img.size
    box = None
    if img.mode == 'RGBA':
        box = img.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        if box == (0, 0, w, h):
            box = None
    if box is None:
        rgb = img.convert('RGB')
        corners = [rgb.getpixel(p) for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
        base = corners[0]
        if min(base) >= 236 and all(max(abs(c[i] - base[i]) for i in range(3)) <= 10 for c in corners):
            diff = ImageChops.difference(rgb, Image.new('RGB', rgb.size, base)).convert('L')
            box = diff.point(lambda p: 255 if p > 14 else 0).getbbox()
    if not box:
        return img
    bw, bh = box[2] - box[0], box[3] - box[1]
    if bw < 0.2 * w or bh < 0.2 * h or (bw, bh) == (w, h):
        return img
    return img.crop(box)


def derived_image(media_root, rel_path, width, trim=False, webp=True):
    """Return (absolute_path, content_type) of a cached, resized copy of
    media_root/rel_path, creating it on first use. Returns None when the
    source is missing or is not a still image we can process (the caller
    then serves the original file)."""
    from django.utils._os import safe_join
    try:
        src = safe_join(str(media_root), rel_path)
    except Exception:
        return None
    if not os.path.isfile(src) or rel_path.startswith(DERIVED_DIR):
        return None
    st = os.stat(src)
    width = bucket_width(width)
    key = hashlib.sha1(f'{rel_path}|{int(st.st_mtime)}|{st.st_size}'.encode()).hexdigest()[:16]
    stem = f'{key}-{width}{"-t" if trim else ""}'
    out_dir = os.path.join(str(media_root), DERIVED_DIR, key[:2])
    wanted = (('.webp', 'image/webp'),) if webp else (('.png', 'image/png'), ('.jpg', 'image/jpeg'))
    for ext, ctype in wanted:
        p = os.path.join(out_dir, stem + ext)
        if os.path.isfile(p):
            return p, ctype
    try:
        with open(src, 'rb') as fh:
            img = _open(fh.read())
        if getattr(img, 'is_animated', False):
            return None
        img.load()
        img = ImageOps.exif_transpose(img)
        alpha = _has_real_alpha(img)
        img = img.convert('RGBA' if alpha else 'RGB')
        if trim:
            img = trim_borders(img)
        if img.width > width:
            img = img.resize((width, max(1, round(img.height * width / img.width))), Image.LANCZOS)
        os.makedirs(out_dir, exist_ok=True)
        if webp:
            ext, ctype, kw = '.webp', 'image/webp', {'format': 'WEBP', 'quality': WEBP_QUALITY, 'method': 4}
        elif alpha:
            ext, ctype, kw = '.png', 'image/png', {'format': 'PNG', 'optimize': True}
        else:
            ext, ctype, kw = '.jpg', 'image/jpeg', {'format': 'JPEG', 'quality': JPEG_QUALITY, 'optimize': True, 'progressive': True}
        out = os.path.join(out_dir, stem + ext)
        tmp = f'{out}.{os.getpid()}.tmp'
        img.save(tmp, **kw)
        os.replace(tmp, out)
        return out, ctype
    except Exception:
        return None


def serve_image(request, width, path):
    """GET /img/<width>/<path under MEDIA_ROOT>[?trim=1]"""
    from django.conf import settings
    from django.http import FileResponse
    from django.views.static import serve
    webp = 'image/webp' in request.META.get('HTTP_ACCEPT', '')
    res = derived_image(settings.MEDIA_ROOT, path, width, trim=request.GET.get('trim') == '1', webp=webp)
    if not res:
        # missing (404) or not processable (animated GIF, odd format): original
        return serve(request, path, document_root=settings.MEDIA_ROOT)
    out, ctype = res
    resp = FileResponse(open(out, 'rb'), content_type=ctype)
    # New uploads carry a content hash in their name, so a URL's content is stable
    resp['Cache-Control'] = 'public, max-age=2592000, stale-while-revalidate=604800'
    resp['Vary'] = 'Accept'
    return resp
