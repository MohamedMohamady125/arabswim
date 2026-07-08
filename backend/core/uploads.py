"""Shared validation for user-uploaded files.

Every upload endpoint must call one of these before saving the file.
Returns an error string (for a 400 response) or None when the file is OK.
"""

MAX_IMAGE_SIZE = 5 * 1024 * 1024    # 5 MB
MAX_PDF_SIZE = 40 * 1024 * 1024     # 40 MB (full meet result books)
MAX_IMPORT_SIZE = 120 * 1024 * 1024  # 120 MB (Omega/Swiss-Timing books with embedded fonts hit ~90 MB)

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
IMPORT_EXTENSIONS = {'.pdf', '.xlsx', '.xls', '.html', '.htm'}


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
        return 'Image is too large (max 5 MB)'
    try:
        from PIL import Image
        pos = uploaded_file.tell()
        img = Image.open(uploaded_file)
        img.verify()
        uploaded_file.seek(pos)
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
        return 'Only PDF, Excel (.xlsx/.xls) or HTML result files are allowed'
    if uploaded_file.size > MAX_IMPORT_SIZE:
        return 'File is too large (max 50 MB)'
    return None
