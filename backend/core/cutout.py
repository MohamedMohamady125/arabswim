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
    out = Image.new('RGBA', (max(1, round(fw)), max(1, round(fh))), BRAND_NAVY + (0,))
    out.paste(img, (-round(left), -round(top)), mask)
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
    frame = subject_frame(np.asarray(mask))
    if frame is None:
        return None
    # firm up the soft edge, then take the old background out of what is left of it
    mask = mask.point(lambda a: 0 if a < 40 else 255 if a > 215 else int((a - 40) * 255 / 175))
    out = compose(clean_edges(img, mask), mask, frame)
    if max(out.size) > OUT_SIDE:
        out.thumbnail((OUT_SIDE, OUT_SIDE), Image.LANCZOS)
    return out


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
        stem = re.sub(rf'{re.escape(mark)}(-[0-9a-f]{{10}})?$', '', stem)
    return stem


def marked_name(filename):
    return f'{source_stem(filename) or "photo"}{MARK}.png'


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
