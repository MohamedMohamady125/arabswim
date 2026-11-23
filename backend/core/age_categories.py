"""What an age-category name means.

A result keeps its age category exactly as the source file wrote it
("19 and above", "19+", "Men's 18/Under", "13-14", "Open" …) — the name shown
on the site is the meet's own wording. Whenever the backend has to reason
about a category (is this the same group as that one? how old are its
swimmers? is it an open event?) it asks this module, never the raw text, so
every spelling of the same group is understood the same way.

    category_key("19 and above") == category_key("19+") == category_key("19 & Over") == '19+'
    category_key("Men's 18/Under") == category_key("U18") == 'U18'
    category_key("Boy's 13-14") == category_key("13 - 14") == '13-14'
    category_key("Women's Open") == category_key("") == ''          (open)

The frontend mirrors `category_key` in utils.js (`normCategory`); keep the
two in step.
"""
import re

# the sex is carried by its own field; in a category name it is only wording
_GENDER_WORDS = re.compile(
    r"\b(men|women|mens|womens|boys|girls|boy|girl|male|female|mixed|mixte|garcons|garçons|"
    r"filles|messieurs|dames|hommes|femmes)(?:['‘’]s|s['‘’]|['‘’])?(?=\W|$)",
    re.IGNORECASE)

# categories every swimmer can appear in — they name no age group
_OPEN_WORDS = {
    '', 'open', 'tc', 'toutes categories', 'toutes catégories',
    'cat generale', 'cat générale', 'generale', 'générale',
    'categorie generale', 'catégorie générale', 'general', 'all ages', 'absolute',
}

_UNDER = (re.compile(r'\b(?:u|under)\s*[-/]?\s*(\d{1,2})\b'),
          re.compile(r'\b(\d{1,2})\s*(?:[/&-]|and|et)?\s*(?:under|below|younger|u|moins)\b'))
_OVER = (re.compile(r'\b(\d{1,2})\s*(?:\+|plus\b)'),
         re.compile(r'\b(\d{1,2})\s*(?:[/&-]|and|et)?\s*(?:over|above|older|up|o)\b'),
         re.compile(r'\b(?:over|above)\s*(\d{1,2})\b'))
_RANGE = re.compile(r'\b(\d{1,2})\s*(?:-|–|—|to|a|à|/)\s*(\d{1,2})\b')


def _plain(label):
    """Lower-cased wording with the gender words and punctuation noise gone."""
    text = re.sub(r'\s+', ' ', str(label or '').replace('\xa0', ' ')).strip()
    if text.lower() == 'nan':
        return ''
    text = _GENDER_WORDS.sub(' ', text)
    return re.sub(r'\s+', ' ', text).strip(" \t-–—/&,.").lower()


def age_range(label):
    """(youngest, oldest) age a category covers; `oldest` is None for an
    "and over" group. None when the name states no ages (Open, Cadets …)."""
    low = _plain(label)
    if not low:
        return None
    for rx in _UNDER:
        m = rx.search(low)
        if m:
            return 0, int(m.group(1))
    m = _RANGE.search(low)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if a <= b:
            return a, b
    for rx in _OVER:
        m = rx.search(low)
        if m:
            return int(m.group(1)), None
    return None


def is_open(label):
    """True for a category that names no age group (blank, Open, TC …)."""
    return re.sub(r'[\s.\-]+', ' ', _plain(label)).strip() in _OPEN_WORDS


def category_key(label):
    """One key per age group, whatever the spelling: '' for open, 'U18',
    '19+', '13-14'; a name with no ages in it keys on its own squashed
    wording ("Cadets" → 'cadets')."""
    if is_open(label):
        return ''
    rng = age_range(label)
    if rng:
        lo, hi = rng
        if hi is None:
            return f'{lo}+'
        return f'U{hi}' if lo == 0 else f'{lo}-{hi}'
    return re.sub(r'[\s_\-]+', '', _plain(label))


def same_category(a, b):
    """True when two names describe the same age group."""
    return category_key(a) == category_key(b)


def clean_label(label):
    """A category name as the source wrote it, minus stray whitespace.
    Never rewrites the wording."""
    text = re.sub(r'\s+', ' ', str(label or '').replace('\xa0', ' ')).strip()
    return '' if text.lower() == 'nan' else text
