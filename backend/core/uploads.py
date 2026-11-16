"""Shared validation for user-uploaded files.

Every upload endpoint must call one of these before saving the file.
Returns an error string (for a 400 response) or None when the file is OK.
"""

MAX_IMAGE_SIZE = 15 * 1024 * 1024   # 15 MB raw; core.images shrinks it on save
MAX_IMAGE_PIXELS = 60_000_000       # ~60 megapixels (decompression-bomb guard)
MAX_PDF_SIZE = 40 * 1024 * 1024     # 40 MB (full meet result books)
MAX_IMPORT_SIZE = 250 * 1024 * 1024  # 250 MB (multi-meet raw CSV dumps run ~190 MB; Omega books ~90 MB)

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
IMPORT_EXTENSIONS = {'.pdf', '.xlsx', '.xls', '.csv', '.html', '.htm'}


def _extension(name):
    name = (name or '').lower()
    dot = name.rfind('.')
    return name[dot:] if dot != -1 else ''


def validate_image(uploaded_file):
    """Validate an image upload: extension whitelist, size cap, and real
    image content (verified by Pillow)."""
    if uploaded_file is None:
        return 'No file provided'
    if _extension(uploaded_file.name) not in IMAGE_EXTENSIONS:
        return 'Only JPG, PNG, GIF or WEBP images are allowed'
    if uploaded_file.size > MAX_IMAGE_SIZE:
        return 'Image is too large (max 15 MB)'
    try:
        from PIL import Image
        pos = uploaded_file.tell()
        img = Image.open(uploaded_file)
        too_big = img.width * img.height > MAX_IMAGE_PIXELS
        img.verify()
        uploaded_file.seek(pos)
        if too_big:
            return 'Image dimensions are too large'
    except Exception:
        return 'File is not a valid image'
    return None


def validate_pdf(uploaded_file):
    if uploaded_file is None:
        return 'No file provided'
    if _extension(uploaded_file.name) != '.pdf':
        return 'Only PDF files are allowed'
    if uploaded_file.size > MAX_PDF_SIZE:
        return 'PDF is too large (max 40 MB)'
    pos = uploaded_file.tell()
    header = uploaded_file.read(5)
    uploaded_file.seek(pos)
    if header != b'%PDF-':
        return 'File is not a valid PDF'
    return None


def validate_import_file(uploaded_file):
    if uploaded_file is None:
        return 'No file provided'
    if _extension(uploaded_file.name) not in IMPORT_EXTENSIONS:
        return 'Only PDF, Excel (.xlsx/.xls), CSV or HTML result files are allowed'
    if uploaded_file.size > MAX_IMPORT_SIZE:
        return 'File is too large (max 250 MB)'
    return None
