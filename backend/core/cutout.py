"""Swimmer portraits: cut the person out, centre them, give them the brand
background.

The stored file is the cut-out itself with a TRANSPARENT background (PNG);
the site paints Arab Swim navy behind it (Pic.jsx, token --asw-portrait-bg),
so the colour lives in one place. The hidden colour under the transparent
pixels is that same navy, so anything that ignores transparency still shows
navy, never white or black.

Runs on the server for every swimmer photo, whoever uploads it. Uses a local
segmentation model (IS-Net general use, Apache-2.0) through onnxruntime, so
no photo ever leaves the server.

Never raises: when the model, the runtime or the picture is unusable the
caller keeps the original upload.
"""
import hashlib
import io
import logging
import os
import subprocess
import sys
import tempfile
import threading
import urllib.request

log = logging.getLogger(__name__)

MODEL_NAME = 'isnet-general-use.onnx'
MODEL_URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx'
MODEL_MD5 = 'fc16ebd8b0c10d971d3513d564d01e29'
MODEL_INPUT = 1024

# The frame every portrait is delivered in (= IMAGE_KINDS.person in Pic.jsx)
RATIO = 4 / 5
HEADROOM = 0.07      # white above the head
MARGIN = 0.05        # white beside / below a subject that is not cut by the photo edge
MAX_HEADROOM = 0.16  # broad shoulders are trimmed by the frame rather than shrinking the head
EDGE = 0.015         # subject within this share of an edge counts as cut by it
WORK_SIDE = 2000     # the photo is worked on at this size at most
OUT_SIDE = 1600      # longest side of the result
# Marks a file that has been through here (the backfill command skips these).
# '-wb' was the earlier white-background version: those are done again.
MARK = '-cut'
OLD_MARKS = ('-wb',)
# Sits in front of the mark on files made by the current rules (refine_mask,
# remove_halo, colours not mixed with navy). A marked file without it was made
# by the first version and is put right by repair().
VERSION = '-v2'
# Arab Swim navy (#102e56 = --color-accent-800 in theme.css)
BRAND_NAVY = (16, 46, 86)

_lock = threading.Lock()


def model_path():
    return os.environ.get('CUTOUT_MODEL') or os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'models', MODEL_NAME)


def ensure_model():
    """Path of the model file, downloading it once if it is not there."""
    path = model_path()
    if os.path.isfile(path) and os.path.getsize(path) > 1_000_000:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f'{path}.{os.getpid()}.part'
    md5 = hashlib.md5()
    try:
        with urllib.request.urlopen(MODEL_URL, timeout=120) as r, open(tmp, 'wb') as out:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                md5.update(chunk)
                out.write(chunk)
        if md5.hexdigest() != MODEL_MD5:
            raise ValueError('model checksum mismatch')
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return path


def person_mask(img):
    """Foreground mask (PIL 'L', same size as img) for an RGB image."""
    import numpy as np
    import onnxruntime as ort
    from PIL import Image

    so = ort.SessionOptions()
    so.intra_op_num_threads = 2
    so.inter_op_num_threads = 1
    so.enable_cpu_mem_arena = False   # give the memory back after each photo
    so.log_severity_level = 3
    small = img.resize((MODEL_INPUT, MODEL_INPUT), Image.LANCZOS)
    a = np.asarray(small, dtype=np.float32)
    a = a / max(float(a.max()), 1e-6) - 0.5
    x = np.expand_dims(a.transpose(2, 0, 1), 0).astype(np.float32)
    # one photo at a time per process; the session is not kept, uploads are rare
    with _lock:
        sess = ort.InferenceSession(ensure_model(), so, providers=['CPUExecutionProvider'])
        pred = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
        del sess
    lo, hi = float(pred.min()), float(pred.max())
    if hi - lo < 1e-6:
        return None
    pred = (pred - lo) / (hi - lo)
    mask = Image.fromarray((pred * 255).astype('uint8'), mode='L')
    return mask.resize(img.size, Image.LANCZOS)


def subject_frame(mask, ratio=RATIO):
    """Where the 4:5 frame goes around the subject.

    mask: 2-D numpy array, 0..255. Returns (left, top, width, height) in mask
    pixels (may reach outside the picture — that part is filled with white),
    or None when there is no clear subject.

    The head is centred with a little white above it. A side where the photo
    itself cuts the body (shoulders, torso) stays flush with the frame edge
    instead of floating in white.
    """
    import numpy as np
    h, w = mask.shape
    on = mask > 128
    share = float(on.mean())
    if share < 0.03 or share > 0.97:
        return None
    # ignore specks: a row/column belongs to the subject when 1.5% of it is set
    cols = np.where(on.mean(axis=0) > 0.015)[0]
    rows = np.where(on.mean(axis=1) > 0.015)[0]
    if not len(cols) or not len(rows):
        return None
    x0, x1, y0, y1 = int(cols[0]), int(cols[-1]) + 1, int(rows[0]), int(rows[-1]) + 1
    bw, bh = x1 - x0, y1 - y0
    cut_l, cut_r = x0 <= EDGE * w, x1 >= w - EDGE * w
    cut_t, cut_b = y0 <= EDGE * h, y1 >= h - EDGE * h

    ml = 0 if cut_l else MARGIN
    mr = 0 if cut_r else MARGIN
    mt = 0 if cut_t else HEADROOM
    mb = 0 if cut_b else MARGIN
    fh = max(bh / (1 - mt - mb), min(bw / (1 - ml - mr) / ratio, bh / (1 - MAX_HEADROOM - mb)))
    fw = fh * ratio

    # horizontal: centre the head, but keep the whole body inside the margins
    head = on[y0:y0 + max(1, int(bh * 0.3)), x0:x1]
    xs = head.sum(axis=0).astype(float)
    cx = x0 + float((xs * np.arange(bw)).sum() / xs.sum()) if xs.sum() else (x0 + x1) / 2
    if cut_l and not cut_r:
        left = x0
    elif cut_r and not cut_l:
        left = x1 - fw
    else:
        left = cx - fw / 2
        lo, hi = x1 + mr * fw - fw, x0 - ml * fw
        if lo <= hi:
            left = min(max(left, lo), hi)

    # vertical: a body cut by the bottom edge sits on the bottom of the frame
    if cut_b:
        top = y1 - fh
    elif cut_t:
        top = y0
    else:
        top = y0 - mt * fh - (fh * (1 - mt - mb) - bh) / 2
    return left, top, fw, fh


# How sure the model must be. Above CORE_HI a pixel is the swimmer, full stop.
# Between the two it is the swimmer only where it is a real edge (hair, the
# outline of an arm): a thin strip with solid swimmer on one side and clear
# background on the other. A wide half-sure area (a mascot held next to the
# swimmer, another person's arm, a banner) is REMOVED, never left as a
# see-through ghost.
CORE_LO, CORE_HI = 0.70, 0.90
FRINGE_LO = 0.15
FRINGE_REACH = 0.008   # how far from the solid swimmer a soft edge may reach (share of the long side)
ISLAND = 0.25          # a separate piece smaller than this share of the main one is dropped
SLIVER = 0.011         # anything thinner than twice this share of the long side is a sliver
OPEN_SIDE = 640        # slivers are found on a copy this small
LABEL_SIDE = 256       # pieces and holes are found on a copy this small


def _ramp(a, lo, hi):
    import numpy as np
    return np.clip((a - lo) / (hi - lo), 0.0, 1.0)


def _spread(labels, inside, limit=4000):
    """Grow labels to their neighbours while staying inside `inside`."""
    import numpy as np
    for _ in range(limit):
        p = np.pad(labels, 1)
        new = np.where(inside, np.maximum.reduce(
            [p[1:-1, 1:-1], p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]]), 0)
        if (new == labels).all():
            break
        labels = new
    return labels


def refine_mask(mask):
    """Model confidence (PIL 'L') -> final alpha (PIL 'L'): solid swimmer,
    soft only along true edges, nothing see-through anywhere else."""
    import numpy as np
    from PIL import Image, ImageFilter

    p = np.asarray(mask, dtype=np.float32) / 255.0
    h, w = p.shape
    scale = LABEL_SIDE / max(h, w)
    sw, sh = max(1, round(w * scale)), max(1, round(h * scale))

    def small(arr):   # bool, full size -> bool, small
        return np.asarray(Image.fromarray((arr * 255).astype('uint8'), 'L')
                          .resize((sw, sh), Image.BILINEAR)) > 127

    def full(arr, grow=0.0):   # bool, small -> float 0..1, full size (optionally grown)
        im = Image.fromarray((arr * 255).astype('uint8'), 'L').resize((w, h), Image.BILINEAR)
        if grow:
            im = im.filter(ImageFilter.GaussianBlur(grow))
        return np.asarray(im, dtype=np.float32) / 255.0

    core = p >= (CORE_LO + CORE_HI) / 2
    sm = small(core)
    if not sm.any():
        return mask
    # 1. separate pieces: keep the swimmer, drop bystanders and specks
    labels = _spread(np.where(sm, np.arange(1, sm.size + 1).reshape(sm.shape), 0), sm)
    ids, counts = np.unique(labels[labels > 0], return_counts=True)
    main = np.isin(labels, ids[counts >= ISLAND * counts.max()])
    # 2. holes: a half-sure patch fully inside the swimmer (a crest, a medal,
    #    something held in front of the chest) belongs to the swimmer
    outside = ~main
    seed = np.zeros_like(main)
    seed[0, :] = seed[-1, :] = seed[:, 0] = seed[:, -1] = True
    reached = _spread((seed & outside).astype(np.int32), outside) > 0
    enclosed = full(outside & ~reached, grow=1 / scale) > 0.5

    near_main = full(main, grow=1.5 / scale) > 0.15
    solid = _ramp(p, CORE_LO, CORE_HI) * near_main
    solid = np.maximum(solid, _ramp(p, FRINGE_LO, 0.35) * enclosed)

    # 3. slivers: a thin spike or rim hanging off the swimmer (the edge of
    #    something that was removed next to them) goes too
    side = OPEN_SIDE / max(h, w)
    ow, oh = max(1, round(w * side)), max(1, round(h * side))
    r = max(1, round(SLIVER * max(ow, oh)))
    shrunk = (Image.fromarray(((solid > 0.5) * 255).astype('uint8'), 'L')
              .resize((ow, oh), Image.BILINEAR).point(lambda v: 255 if v > 127 else 0)
              .filter(ImageFilter.MinFilter(2 * r + 1)))
    opened = shrunk.filter(ImageFilter.MaxFilter(2 * r + 3)).resize((w, h), Image.BILINEAR)
    solid = solid * _ramp(np.asarray(opened, dtype=np.float32) / 255.0, 0.3, 0.7)
    #    ...and where a wide half-sure area was removed right beside the
    #    swimmer, its outline stays stuck to them: cut that seam back
    gone = (p > FRINGE_LO) & (solid < 0.1)
    wide = np.asarray(Image.fromarray((gone * 255).astype('uint8'), 'L')
                      .filter(ImageFilter.GaussianBlur(3 * r / side)), dtype=np.float32) / 255.0
    seam = _ramp(wide, 0.25, 0.45)
    if seam.any():
        back = np.asarray(shrunk.filter(ImageFilter.MaxFilter(3)).resize((w, h), Image.BILINEAR),
                          dtype=np.float32) / 255.0
        solid = solid * (1 - seam + seam * _ramp(back, 0.3, 0.7))

    # 4. soft edges: only between solid swimmer and clear background
    reach = max(2.0, FRINGE_REACH * max(h, w))

    def blur(arr):
        return np.asarray(Image.fromarray((arr * 255).astype('uint8'), 'L')
                          .filter(ImageFilter.GaussianBlur(reach)), dtype=np.float32) / 255.0
    by_swimmer = _ramp(blur(solid > 0.5), 0.04, 0.25)
    by_background = _ramp(blur(p < FRINGE_LO), 0.04, 0.25)
    fringe = _ramp(p, FRINGE_LO, CORE_LO) * by_swimmer * by_background

    alpha = Image.fromarray((np.maximum(solid, fringe) * 255).round().astype('uint8'), 'L')
    # pull the outline in by a pixel: the outermost ring is where the old
    # background still shows through
    return alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))


HALO_BAND = 0.014      # how deep into the outline old background may hide (share of the long side)


def backdrop_colour(img, where):
    """The old background's colour (RGB floats) when it is one plain colour
    (a wall, a studio backdrop), else None. `where`: bool array of pixels
    known to be background."""
    import numpy as np
    px = np.asarray(img, dtype=np.float32)[where]
    if len(px) < 200:
        return None
    if len(px) > 40000:
        px = px[:: len(px) // 40000]
    mid = np.median(px, axis=0)
    spread = np.median(np.abs(px - mid).sum(axis=1))
    return mid if spread < 45 else None


def remove_halo(img, mask, backdrop):
    """Hair and curls let the old wall show through, and the model calls
    those gaps "swimmer": a pale ring around dark hair. Along the outline,
    a pixel that has the wall's colour while the swimmer just inside it has
    a clearly different one is wall, and goes. A white shirt on a white wall
    is left alone (inside and wall look the same there)."""
    import numpy as np
    from PIL import Image, ImageFilter
    if backdrop is None:
        return mask
    a = np.asarray(mask, dtype=np.float32) / 255.0
    band = max(2.0, HALO_BAND * max(mask.size))
    solid = a >= 0.98
    deep = np.asarray(Image.fromarray((solid * 255).astype('uint8'), 'L')
                      .filter(ImageFilter.GaussianBlur(band / 2)), dtype=np.float32) / 255.0 > 0.97
    if not deep.any():
        return mask
    rgb = np.asarray(img, dtype=np.float32)
    w8 = deep.astype(np.float32)
    num = np.asarray(Image.fromarray((rgb * w8[..., None]).astype('uint8'), 'RGB')
                     .filter(ImageFilter.GaussianBlur(band)), dtype=np.float32)
    den = np.asarray(Image.fromarray((w8 * 255).astype('uint8'), 'L')
                     .filter(ImageFilter.GaussianBlur(band)), dtype=np.float32) / 255.0
    rim = (a > 0) & ~deep & (den > 0.03)
    if not rim.any():
        return mask
    inside = num[rim] / den[rim][:, None]
    like_wall = np.sqrt(((rgb[rim] - backdrop) ** 2).sum(axis=1))
    contrast = np.sqrt(((inside - backdrop) ** 2).sum(axis=1))
    keep = np.where(contrast > 90, _ramp(like_wall, 28, np.maximum(60, 0.55 * contrast)), 1.0)
    out = a.copy()
    out[rim] = a[rim] * keep
    return Image.fromarray((out * 255).round().astype('uint8'), 'L').filter(ImageFilter.GaussianBlur(0.6))


def clean_edges(img, mask):
    """Edge pixels are a mix of the swimmer and the OLD background (a white
    wall leaves a pale halo once the photo sits on navy). Replace their colour
    with the nearest solid swimmer colour, bled outwards."""
    import numpy as np
    from PIL import Image, ImageFilter
    m = np.asarray(mask)
    solid = m >= 250
    edge = (m > 0) & ~solid
    if not edge.any() or not solid.any():
        return img
    rgb = np.asarray(img, dtype=np.float32)
    w = solid.astype(np.float32)
    radius = max(2, round(max(img.size) / 400))
    num = np.asarray(Image.fromarray((rgb * w[..., None]).astype('uint8'), 'RGB')
                     .filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32)
    den = np.asarray(Image.fromarray((w * 255).astype('uint8'), 'L')
                     .filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0
    ok = edge & (den > 0.04)
    out = rgb.copy()
    out[ok] = np.clip(num[ok] / den[ok][:, None], 0, 255)
    return Image.fromarray(out.astype('uint8'), 'RGB')


def compose(img, mask, frame):
    """RGB photo + mask + frame -> RGBA portrait: transparent outside the
    swimmer, brand navy hidden under the transparent pixels."""
    from PIL import Image
    left, top, fw, fh = frame
    size = (max(1, round(fw)), max(1, round(fh)))
    at = (-round(left), -round(top))
    alpha = Image.new('L', size, 0)
    alpha.paste(mask, at)
    rgb = Image.new('RGB', size, BRAND_NAVY)
    rgb.paste(img, at)
    # the swimmer's own colours at full strength (mixing navy in here and
    # again on the page darkened every soft edge); navy only where nothing shows
    rgb.paste(BRAND_NAVY, (0, 0), alpha.point(lambda a: 255 if a == 0 else 0))
    out = rgb.convert('RGBA')
    out.putalpha(alpha)
    return out


def isolate(img):
    """PIL image -> RGBA portrait, 4:5, swimmer centred, background transparent.
    None = leave the upload as it is."""
    import numpy as np
    from PIL import Image

    img = img.convert('RGB')
    if max(img.size) > WORK_SIDE:
        img.thumbnail((WORK_SIDE, WORK_SIDE), Image.LANCZOS)
    mask = person_mask(img)
    if mask is None:
        return None
    # decide every pixel (swimmer / edge / gone) before anything is measured
    sure_background = np.asarray(mask) < FRINGE_LO * 255
    mask = refine_mask(mask)
    mask = remove_halo(img, mask, backdrop_colour(img, sure_background))
    frame = subject_frame(np.asarray(mask))
    if frame is None:
        return None
    # take the old background's colour out of the soft edge
    out = compose(clean_edges(img, mask), mask, frame)
    if max(out.size) > OUT_SIDE:
        out.thumbnail((OUT_SIDE, OUT_SIDE), Image.LANCZOS)
    return out


def repair(cut):
    """A cut-out saved by the earlier version -> (the same picture in the same
    framing with every pixel decided again, share of the swimmer's area that
    was see-through junk). The original upload is not kept, so this works
    from the cut-out itself.

    The earlier version stretched the model's 40..215 into the alpha and mixed
    navy into soft pixels; both are undone first."""
    import numpy as np
    from PIL import Image
    rgba = cut.convert('RGBA')
    a = np.asarray(rgba.getchannel('A'), dtype=np.float32)
    conf = np.where(a <= 0, 0, np.where(a >= 255, 255, a * 175 / 255 + 40))
    new = refine_mask(Image.fromarray(conf.astype('uint8'), 'L'))
    n = np.asarray(new, dtype=np.float32)
    body = max(1.0, float((n > 128).sum()))
    ghost = float(((a > 20) & (a < 235) & (n < 10)).sum()) / body
    m = (a / 255.0)[..., None]
    rgb = np.asarray(rgba.convert('RGB'), dtype=np.float32)
    navy = np.array(BRAND_NAVY, dtype=np.float32)
    plain = np.where(m > 0.05, (rgb - navy * (1 - m)) / np.maximum(m, 0.05), rgb)
    img = Image.fromarray(np.clip(plain, 0, 255).astype('uint8'), 'RGB')
    # the wall's colour survives only in the old soft edge
    new = remove_halo(img, new, backdrop_colour(img, (a > 12) & (a < 110)))
    return compose(clean_edges(img, new), new, (0, 0, rgba.width, rgba.height)), ghost


def isolate_bytes(data, filename=''):
    """Raw upload bytes -> (png_bytes, filename) or None to keep the upload."""
    try:
        from PIL import Image, ImageOps
        img = Image.open(io.BytesIO(data))
        if getattr(img, 'is_animated', False) or img.width * img.height > 60_000_000:
            return None
        img.load()
        img = ImageOps.exif_transpose(img)
        if img.mode in ('RGBA', 'LA', 'P'):
            # a transparent upload is laid on white first
            rgba = img.convert('RGBA')
            flat = Image.new('RGB', rgba.size, (255, 255, 255))
            flat.paste(rgba, mask=rgba.getchannel('A'))
            img = flat
        out = isolate(img)
        if out is None:
            return None
        buf = io.BytesIO()
        out.save(buf, format='PNG')
        return buf.getvalue(), marked_name(filename)
    except Exception:
        log.exception('portrait cut-out failed; keeping the upload as it is')
        return None


def source_stem(filename):
    """File stem with any cut-out mark (and the content hash after it) removed:
    'ali-wb-0a1b2c3d4e' -> 'ali'. The name the upload had before it was cut out."""
    import re
    stem = os.path.splitext(os.path.basename(filename or ''))[0]
    for mark in (MARK,) + OLD_MARKS:
        stem = re.sub(rf'({re.escape(VERSION)})?{re.escape(mark)}(-[0-9a-f]{{10}})?$', '', stem)
    return stem


def marked_name(filename):
    return f'{source_stem(filename) or "photo"}{VERSION}{MARK}.png'


def is_current(filename):
    """True for a cut-out made by the current rules."""
    stem = os.path.splitext(os.path.basename(filename or ''))[0]
    return stem.endswith(VERSION + MARK) or f'{VERSION}{MARK}-' in stem


def repair_bytes(data, filename=''):
    """A first-version cut-out (file bytes) -> (png_bytes, filename) by the
    current rules, or None to leave it."""
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        img.load()
        if img.mode not in ('RGBA', 'LA', 'P'):
            return None
        out, _ = repair(img)
        buf = io.BytesIO()
        out.save(buf, format='PNG')
        return buf.getvalue(), marked_name(filename)
    except Exception:
        log.exception('portrait repair failed; keeping the file as it is')
        return None


def is_marked(filename):
    """True for a stored file that already is a current cut-out (name carries the mark)."""
    stem = os.path.splitext(os.path.basename(filename or ''))[0]
    return stem.endswith(MARK) or f'{MARK}-' in stem


def isolate_upload(data, filename=''):
    """isolate_bytes in a child process. The model needs about 1 GB for a
    couple of seconds; if the server cannot spare it only the child dies and
    the upload is kept as it is, instead of the web worker going down."""
    try:
        with tempfile.TemporaryDirectory() as d:
            src, dst = os.path.join(d, 'in'), os.path.join(d, 'out.png')
            with open(src, 'wb') as fh:
                fh.write(data)
            subprocess.run([sys.executable, os.path.abspath(__file__), src, dst],
                           timeout=180, capture_output=True, check=False)
            if os.path.isfile(dst) and os.path.getsize(dst) > 0:
                with open(dst, 'rb') as fh:
                    return fh.read(), marked_name(filename)
    except Exception:
        log.exception('portrait cut-out failed; keeping the upload as it is')
    return None


if __name__ == '__main__':
    # `python core/cutout.py fetch` — used by the Dockerfile to bake the model in
    if sys.argv[1:] == ['fetch']:
        print(ensure_model())
    else:
        src, dst = sys.argv[1], sys.argv[2]
        res = isolate_bytes(open(src, 'rb').read(), src)
        if res:
            open(dst, 'wb').write(res[0])
        print('ok' if res else 'left as is')
