"""Arabic→English name-matching dashboard.

Many athletes exist twice in the database: once under an Arabic-script name
(from an Arabic source file) and once under a Latin/English name (from an
English source). This module finds, for each Arabic-named swimmer, the English
profiles that are most likely the SAME athlete so an admin can merge them (or
rename the Arabic profile into a brand-new English one).

Scoring signals, strongest first:
  * Shared identical race results — the same (championship, event, round, time)
    swum by both profiles is near-proof of the same athlete, since the same
    meet imported from two sources yields two profiles with identical rows.
  * Same exact date of birth, or same birth year.
  * Transliterated name similarity (soft tie-breaker).
"""
from difflib import SequenceMatcher

# --- Arabic detection & transliteration ------------------------------------

_ARABIC_RANGE = (0x0600, 0x06FF)

# Rough Arabic-letter → Latin map, enough to compare spellings fuzzily.
_TRANSLIT = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ء': '', 'ئ': '', 'ؤ': '',
    'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
    'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
    'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a',
    'ـ': '', 'ّ': '', 'َ': '', 'ُ': '', 'ِ': '', 'ْ': '', 'ً': '',
    'ٌ': '', 'ٍ': '', 'ئ': '', 'ٱ': 'a',
}


def is_arabic(name):
    """True if the name contains any Arabic-script character."""
    for ch in (name or ''):
        if _ARABIC_RANGE[0] <= ord(ch) <= _ARABIC_RANGE[1]:
            return True
    return False


def transliterate(name):
    """Best-effort Arabic→Latin transliteration for fuzzy name comparison."""
    out = []
    for ch in (name or ''):
        if _ARABIC_RANGE[0] <= ord(ch) <= _ARABIC_RANGE[1]:
            out.append(_TRANSLIT.get(ch, ''))
        else:
            out.append(ch)
    return ''.join(out).lower()


def _norm(s):
    return ''.join(c for c in (s or '').lower() if c.isalnum() or c.isspace()).strip()


def name_similarity(arabic_name, english_name):
    """0..1 similarity of a transliterated Arabic name vs an English name,
    order-insensitive on the word level (handles reversed given/surname)."""
    a = _norm(transliterate(arabic_name))
    b = _norm(english_name)
    if not a or not b:
        return 0.0
    direct = SequenceMatcher(None, a, b).ratio()
    # Order-insensitive: sort the word tokens so "mohamed ali" ~ "ali mohamed".
    a2 = ' '.join(sorted(a.split()))
    b2 = ' '.join(sorted(b.split()))
    sorted_ratio = SequenceMatcher(None, a2, b2).ratio()
    return max(direct, sorted_ratio)


# --- Candidate scoring ------------------------------------------------------

def _result_keys(swimmer_id):
    """Set of (championship, event, round, time) tuples for a swimmer's real
    swims (positive times only)."""
    from championships.models import Result
    return set(
        Result.objects.filter(swimmer_id=swimmer_id, time_centiseconds__gt=0)
        .values_list('championship_id', 'event_id', 'round_type', 'time_centiseconds')
    )


def candidates_for(arabic_swimmer, country_id, limit=8):
    """Return ranked English-profile candidates for one Arabic-named swimmer.

    Each candidate dict: id, name, club, birth_year, date_of_birth, score,
    shared_results, same_dob, same_year, name_sim, reasons[]."""
    from championships.models import Result
    from .models import Swimmer

    ar_keys = _result_keys(arabic_swimmer.id)
    champ_ids = {k[0] for k in ar_keys}

    # Tally shared identical rows against other same-country swimmers that
    # appear in the same championships — bounded, index-backed query.
    shared = {}
    if champ_ids:
        rows = (Result.objects
                .filter(championship_id__in=champ_ids, time_centiseconds__gt=0,
                        swimmer__nationality_id=country_id)
                .exclude(swimmer_id=arabic_swimmer.id)
                .values_list('swimmer_id', 'championship_id', 'event_id',
                             'round_type', 'time_centiseconds'))
        for sid, cid, eid, rt, t in rows:
            if (cid, eid, rt, t) in ar_keys:
                shared[sid] = shared.get(sid, 0) + 1

    # Also surface name-only candidates (no shared swims) from the same country.
    cand_ids = set(shared)
    pool = (Swimmer.objects
            .filter(nationality_id=country_id, is_relay_team=False)
            .exclude(id=arabic_swimmer.id)
            .exclude(id__in=cand_ids))
    if arabic_swimmer.sex:
        pool = pool.filter(sex=arabic_swimmer.sex)
    translit = _norm(transliterate(arabic_swimmer.name))
    # Keep the pool small: only English-named profiles whose first token roughly
    # matches, scored fully below.
    for s in pool.only('id', 'name', 'sex', 'club', 'birth_year', 'date_of_birth'):
        if is_arabic(s.name):
            continue
        if name_similarity(arabic_swimmer.name, s.name) >= 0.55:
            cand_ids.add(s.id)

    if not cand_ids:
        return []

    swimmers = (Swimmer.objects.filter(id__in=cand_ids)
                .only('id', 'name', 'sex', 'club', 'birth_year', 'date_of_birth'))

    scored = []
    for s in swimmers:
        if is_arabic(s.name):
            continue  # a candidate must be an English profile
        if arabic_swimmer.sex and s.sex and s.sex != arabic_swimmer.sex:
            continue
        n_shared = shared.get(s.id, 0)
        sim = name_similarity(arabic_swimmer.name, s.name)
        same_dob = bool(arabic_swimmer.date_of_birth and s.date_of_birth
                        and arabic_swimmer.date_of_birth == s.date_of_birth)
        same_year = bool(arabic_swimmer.birth_year and s.birth_year
                         and arabic_swimmer.birth_year == s.birth_year)

        # A single shared time is often a coincidental tie between two
        # different athletes, so weight it lightly; two or more shared rows
        # means the same meet was imported under both names — near-proof.
        if n_shared >= 2:
            shared_score = n_shared * 55
        elif n_shared == 1:
            shared_score = 18
        else:
            shared_score = 0
        score = shared_score + (30 if same_dob else 0) + \
            (0 if same_dob else (20 if same_year else 0)) + round(sim * 40)
        if score <= 0:
            continue

        reasons = []
        if n_shared:
            reasons.append(f'{n_shared} identical race result'
                           f'{"s" if n_shared != 1 else ""}')
        if same_dob:
            reasons.append('same date of birth')
        elif same_year:
            reasons.append('same birth year')
        if sim >= 0.5:
            reasons.append(f'name {round(sim * 100)}% similar')

        scored.append({
            'id': s.id,
            'name': s.name,
            'club': s.club,
            'birth_year': s.birth_year,
            'date_of_birth': s.date_of_birth.isoformat() if s.date_of_birth else None,
            'score': score,
            'shared_results': n_shared,
            'same_dob': same_dob,
            'same_year': same_year,
            'name_sim': round(sim, 3),
            'reasons': reasons,
        })

    scored.sort(key=lambda c: (-c['score'], -c['shared_results'], c['name']))
    return scored[:limit]
