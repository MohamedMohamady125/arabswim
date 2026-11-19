"""Social media links typed by owners. Postel's Law: accept a full link, a
bare handle or an @handle, and always store a working https link."""

BASES = {
    'instagram': 'https://instagram.com/',
    'facebook': 'https://facebook.com/',
    'youtube': 'https://youtube.com/@',
    'tiktok': 'https://tiktok.com/@',
    'x': 'https://x.com/',
}
PLATFORMS = tuple(BASES)


def social_url(platform, value):
    v = (value or '').strip()
    if not v:
        return ''
    low = v.lower()
    if low.startswith(('http://', 'https://')):
        return v
    if low.startswith('www.') or '/' in v:
        return 'https://' + v.lstrip('/')
    return BASES[platform] + v.lstrip('@')


def clean_social_fields(attrs, prefix='', suffix='_url'):
    """Normalise every social field present in a serializer's validated data."""
    for p in PLATFORMS:
        key = f'{prefix}{p}{suffix}'
        if key in attrs:
            attrs[key] = social_url(p, attrs[key])[:200]
    return attrs
