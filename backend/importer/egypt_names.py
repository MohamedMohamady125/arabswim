"""Egyptian name handling.

Egyptian federation meets (Hy-Tek MEET MANAGER) export athlete names
cut at exactly 15 characters ("Hager Ahmed Nas"), while the companion
meet-program/results PDFs print the (near) full names.  Egyptian names
also vary between meets because club managers register different
subsets of the same 3–6 part name ("Mohamed Hany Mohamady" vs
"Mohamed Hany Elsayed Ahmed Mohamady").

This module is pure Python (no Django) so it can be used by the
pre-import repair command, the swimmer matcher and tests alike.
"""
import re

# Hy-Tek Excel exports cap names at 15 characters.  A stripped length of
# 14 can also be a truncation (the cut landed on the space after a word).
TRUNC_LEN = 15


def norm_name(s):
    """Casefold + collapse whitespace; keep letters order untouched."""
    return re.sub(r'\s+', ' ', (s or '').strip()).casefold()


def is_truncated_length(name):
    """Could this Excel name be a Hy-Tek 15-char truncation?"""
    return len((name or '').strip()) >= TRUNC_LEN - 1


def is_name_extension(short, long):
    """True when `long` extends `short` the way Hy-Tek truncation cuts.

    - 15-char cut lands mid-word → plain prefix ("Hager Ahmed Nas" →
      "Hager Ahmed Nasser").
    - 14-char (stripped) cut landed on a space → the full name must
      continue with a NEW word ("Yassin Hussein" → "Yassin Hussein
      Mohamed"), never extend the last word, otherwise "Ali Hassan" would
      wrongly extend to "Ali Hassanein".
    """
    s, l = norm_name(short), norm_name(long)
    if not s or len(l) <= len(s):
        return False
    if len((short or '').strip()) >= TRUNC_LEN:
        return l.startswith(s)
    return l.startswith(s + ' ')


def is_subset_name(a, b):
    """True when the shorter name is a plausible subset of the longer one.

    Egyptian registration variants keep the first two parts (given name +
    father's name) and drop/keep later parts: "Mohamed Hany Mohamady" ⊂
    "Mohamed Hany Elsayed Ahmed Mohamady".  Rule: first two tokens equal,
    and ALL remaining tokens of the shorter name appear in the longer
    name's remaining tokens, in order.
    """
    ta, tb = norm_name(a).split(), norm_name(b).split()
    if len(ta) > len(tb):
        ta, tb = tb, ta
    if len(ta) < 2 or ta[:2] != tb[:2]:
        return False
    rest_short, rest_long = ta[2:], tb[2:]
    it = iter(rest_long)
    return all(tok in it for tok in rest_short)


def names_equivalent(a, b):
    """Same person's name in two of the Egyptian source spellings?"""
    na, nb = norm_name(a), norm_name(b)
    if na == nb:
        return True
    return (is_name_extension(a, b) or is_name_extension(b, a)
            or is_subset_name(a, b))


def pick_fullest_name(names):
    """Longest variant = most complete name."""
    return max(names, key=lambda n: (len(norm_name(n)), n)) if names else ''


# ── PDF full-name extraction ─────────────────────────────────────────────
#
# Hy-Tek meet-program pages are two-column; naive text extraction
# interleaves the columns and garbles names.  We extract the full page
# AND each half separately, parse every line strictly, and keep only
# lines that scan cleanly (rank/lane, name tokens, age, team).  Garbled
# cross-column lines fail the token scan and are dropped — the clean
# version of the same entry always appears in one of the half crops.

_NAME_TOKEN = re.compile(r"[A-Za-z][A-Za-z.'’\-]*$")
_TIME_TOKEN = re.compile(r'^[Xx]?[JB]?(?:NT|NS|DQ|SCR|DFS|\d{0,2}:?\d{1,2}[.:]\d{2})')


def parse_result_line(line):
    """Parse one Hy-Tek program/results line → (name, age, team) or None.

    Accepts lines starting with a place/lane number, '---' (exhibition)
    or '*n' (tied place). Rejects anything whose name section contains a
    non-name token (digits glued in by column interleaving).
    """
    toks = line.split()
    if len(toks) < 4:
        return None
    head = toks[0]
    if not (head == '---' or head.lstrip('*').isdigit()):
        return None
    name_toks = []
    age = None
    rest = []
    for i in range(1, len(toks)):
        t = toks[i]
        if t.isdigit() and name_toks:
            age = int(t)
            rest = toks[i + 1:]
            break
        if _NAME_TOKEN.match(t):
            name_toks.append(t)
        else:
            return None  # garbled line
    if age is None or not (5 <= age <= 79) or len(name_toks) < 2:
        return None
    if not rest:
        return None
    # Team = tokens up to the first time-ish token
    team_toks = []
    for t in rest:
        if _TIME_TOKEN.match(t):
            break
        team_toks.append(t)
    if not team_toks:
        return None
    return ' '.join(name_toks), age, ' '.join(team_toks)


_RANK_HEAD = re.compile(r'\*?\d{1,3}$|---$')


def _parse_flow_column(toks):
    """Parse text-stream-ordered tokens of one Hy-Tek column row.

    Long names physically overlap the Age/Team columns, so x-sorted text
    interleaves their glyphs ("Moham 1e6d SalBeamnk").  The PDF content
    stream, however, draws each field whole, in the order
    [team ...] [time] [age] [name ...] [lane] ['_____'] — recover
    (name, age, team) from that pattern.
    """
    ti = None
    for i, t in enumerate(toks):
        if _TIME_TOKEN.match(t) and not t.isdigit():
            ti = i
            break
    if not ti or ti + 2 >= len(toks):   # no time, or no team before it
        return None
    team_toks = toks[:ti]
    if not all(_NAME_TOKEN.match(t) or t.isdigit() for t in team_toks):
        return None
    age_t = toks[ti + 1]
    if not age_t.isdigit():
        return None
    age = int(age_t)
    if not (5 <= age <= 79):
        return None
    rest = list(toks[ti + 2:])
    # Strip trailing lane/place numbers and '_____' blanks
    while rest and (set(rest[-1]) == {'_'} or rest[-1].lstrip('*').isdigit()
                    or rest[-1] == '---'):
        rest.pop()
    if len(rest) < 2 or not all(_NAME_TOKEN.match(t) for t in rest):
        return None
    return ' '.join(rest), age, ' '.join(team_toks)


def _page_entries(page):
    """All clean (name, age, team) parses from one Hy-Tek page.

    Words come from the text stream (use_text_flow) so overlapping fields
    stay intact tokens.  Each physical line is parsed three ways: x-sorted
    full line, x-sorted per column (split at the right column's rank-number
    x), and stream-ordered per column via _parse_flow_column.  The strict
    parsers drop anything garbled.
    """
    words = page.extract_words(use_text_flow=True)
    if not words:
        return set()
    rows = {}
    for w in words:
        rows.setdefault(round(w['top'] / 3), []).append(w)
    lines = [ws for _, ws in sorted(rows.items())]

    # Right-column start: rank-like token past 40% width with a clear gap
    # before it (in x order).  Median of candidates, robust to strays.
    cut_xs = []
    for ws in lines:
        xs = sorted(ws, key=lambda w: w['x0'])
        for i in range(1, len(xs)):
            w = xs[i]
            if (w['x0'] > page.width * 0.40 and _RANK_HEAD.match(w['text'])
                    and w['x0'] - xs[i - 1]['x1'] > 8):
                cut_xs.append(w['x0'])
    boundary = None
    if len(cut_xs) >= 3:
        cut_xs.sort()
        boundary = cut_xs[len(cut_xs) // 2] - 1

    entries = set()
    for ws in lines:
        columns = [ws]
        if boundary is not None:
            left = [w for w in ws if w['x0'] < boundary]
            right = [w for w in ws if w['x0'] >= boundary]
            if left and right:
                columns = [ws, left, right]
        for col in columns:
            xsorted = ' '.join(w['text'] for w in sorted(col, key=lambda w: w['x0']))
            parsed = parse_result_line(xsorted)
            if parsed:
                entries.add(parsed)
            parsed = _parse_flow_column([w['text'] for w in col])
            if parsed:
                entries.add(parsed)
    return entries


def extract_pdf_entries(pdf_path):
    """All (full_name, age, team) entries found in one Hy-Tek PDF."""
    import pdfplumber
    entries = set()
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            try:
                entries |= _page_entries(page)
            except Exception:
                continue
    return entries


class NameRepairIndex:
    """Lookup of full names (from PDFs) used to expand truncated names."""

    def __init__(self, entries):
        # norm full name -> {'name': best raw spelling, 'ages': set, 'teams': set}
        self.by_norm = {}
        for name, age, team in entries:
            key = norm_name(name)
            rec = self.by_norm.setdefault(
                key, {'name': name, 'ages': set(), 'teams': set()})
            rec['ages'].add(age)
            rec['teams'].add(team)

    def __len__(self):
        return len(self.by_norm)

    @staticmethod
    def _team_key(team):
        return re.sub(r'[^A-Z0-9]', '', (team or '').upper())

    def repair(self, truncated, age=None, team=None):
        """Full name for a truncated Excel name, or (None, reason).

        Returns (full_name, 'repaired') on a unique confident match,
        (None, 'ambiguous') when several different people share the
        prefix, (None, 'no_match') when the PDFs know no extension.
        """
        cands = [rec for key, rec in self.by_norm.items()
                 if is_name_extension(truncated, rec['name'])]
        if not cands:
            return None, 'no_match'
        # Collapse chains: PDF columns truncate too, so "Yehia Khaled
        # Ahmed" and "Yehia Khaled Ahmed Abozead" are one person — keep
        # only names not extended by another candidate.
        tips = [c for c in cands
                if not any(c is not o and is_name_extension(c['name'], o['name'])
                           for o in cands)]
        if len(tips) > 1 and age is not None:
            aged = [c for c in tips if age in c['ages']]
            if aged:
                tips = aged
        if len(tips) > 1 and team:
            tk = self._team_key(team)
            teamed = [c for c in tips
                      if any(self._team_key(t) == tk or
                             (tk and self._team_key(t).startswith(tk[:5]))
                             for t in c['teams'])]
            if teamed:
                tips = teamed
        distinct = {norm_name(c['name']) for c in tips}
        if len(distinct) == 1:
            return tips[0]['name'], 'repaired'
        return None, 'ambiguous'
