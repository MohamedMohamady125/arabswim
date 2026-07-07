"""
Swimmer matching and deduplication service.

Matching rules (STRICT):
1. Exact name match (case-insensitive) + birth year match → 100% confidence
2. Exact name match (case-insensitive) + age is consistent across meets → 100%
3. Exact name match only (no birth year to compare) → 95%
4. NO fuzzy matching for auto-decisions — if the name isn't exact, it's a new swimmer.

Age consistency: a swimmer aged 15 at a 2022 meet (born ~2007) should be
aged 17 at a 2024 meet. We check if birth_year matches within ±1 year tolerance.
"""
import re
from swimmers.models import Swimmer
from core.models import Country


_country_cache = None

# Alternate country codes seen in source files (IOC vs ISO vs FINA vs
# legacy variants) mapped to the code stored in our Country table.
# Meet PDFs mostly use IOC codes; Excel/World Aquatics exports use ISO.
COUNTRY_CODE_ALIASES = {
    # Gulf
    'KUW': 'KWT',               # IOC Kuwait -> ISO (DB code)
    'BRN': 'BHR', 'BAH': 'BHR',  # IOC / legacy Bahrain
    'SAU': 'KSA',               # ISO Saudi Arabia -> IOC (DB code)
    'ARE': 'UAE',               # ISO UAE -> IOC (DB code)
    'OMN': 'OMA',               # ISO Oman -> IOC (DB code)
    # Levant
    'LIB': 'LBN',               # old IOC Lebanon -> ISO (DB code)
    'PAL': 'PLE', 'PSE': 'PLE',  # legacy / ISO Palestine -> IOC (DB code)
    # North Africa
    'LBA': 'LBY',               # IOC Libya -> ISO (DB code)
    'DZA': 'ALG',               # ISO Algeria -> IOC (DB code)
    'SDN': 'SUD',               # ISO Sudan -> IOC (DB code)
    'MRT': 'MTN',               # ISO Mauritania -> IOC (DB code)
    'MOR': 'MAR',               # legacy Morocco
    # Egypt
    'UAR': 'EGY',               # historic (United Arab Republic)
}


def get_country_map():
    global _country_cache
    if _country_cache is None:
        _country_cache = {}
        by_code = {}
        for c in Country.objects.all():
            by_code[c.code.upper()] = c
            _country_cache[c.code.upper()] = c
            _country_cache[c.name.upper()] = c
        for alias, target in COUNTRY_CODE_ALIASES.items():
            if target in by_code:
                _country_cache[alias] = by_code[target]
    return _country_cache


def resolve_country(code):
    if not code:
        return None
    cmap = get_country_map()
    return cmap.get(code.upper())


# Broad classifications that any swimmer can appear in — they never
# distinguish two same-named athletes.
_BROAD_CATEGORIES = {
    '', 'OPEN', 'TC', 'TOUTES CATEGORIES', 'TOUTES CATÉGORIES',
    'CAT. GENERALE', 'CAT. GÉNÉRALE', 'GENERALE', 'GÉNÉRALE',
    'CATEGORIE GENERALE', 'CATÉGORIE GÉNÉRALE', 'GENERAL', 'ALL AGES',
}

# Mutually exclusive French age bands (a swimmer belongs to exactly one
# per season).
_FRENCH_BANDS = {'POUSSINS', 'BENJAMINS', 'MINIMES', 'CADETS', 'JUNIORS', 'SENIORS'}

_AGE_RANGE_RE = re.compile(r'(\d{1,2})\s*-\s*(\d{1,2})')
_AGE_PLUS_RE = re.compile(r'(\d{1,2})\s*\+')


def category_band(category):
    """The exclusive age-band label of a category, or '' when broad/absent."""
    c = (category or '').strip()
    if c.upper() in _BROAD_CATEGORIES:
        return ''
    return c


def _age_range(band):
    """Numeric age range (lo, hi) implied by a band label, or None."""
    m = _AGE_RANGE_RE.search(band)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = _AGE_PLUS_RE.search(band)
    if m:
        return int(m.group(1)), 99
    return None


def bands_conflict(cat_a, cat_b):
    """True when two categories cannot describe the same swimmer at one meet.

    'Cadets' vs 'Minimes' → conflict (disjoint French bands).
    '13-14' vs '15-16' → conflict (disjoint numeric ranges).
    'Juniors' vs 'Seniors/Juniors' → no conflict (shared band token).
    Anything vs a broad category ('', Open, TC, générale…) → no conflict.
    Unknown/mixed labels → no conflict (never split on a guess).
    """
    a, b = category_band(cat_a), category_band(cat_b)
    if not a or not b or a.upper() == b.upper():
        return False
    tokens_a = {t.strip().upper() for t in a.split('/')}
    tokens_b = {t.strip().upper() for t in b.split('/')}
    if tokens_a & tokens_b:
        return False
    if tokens_a <= _FRENCH_BANDS and tokens_b <= _FRENCH_BANDS:
        return True
    range_a, range_b = _age_range(a), _age_range(b)
    if range_a and range_b:
        return range_a[1] < range_b[0] or range_b[1] < range_a[0]
    return False


def _candidate_conflicts_by_category(swimmer, band, meet_date):
    """True when a DB swimmer's known age bands rule out this result.

    Looks at the candidate's existing results in meets close in time
    (categories shift as swimmers age, so old meets prove nothing).
    Only rejects when every nearby banded result conflicts.
    """
    if not band:
        return False
    from championships.models import Result
    nearby = Result.objects.filter(swimmer=swimmer).exclude(
        category='').select_related('championship')
    has_conflict = False
    for r in nearby:
        other = category_band(r.category)
        if not other:
            continue
        if meet_date and r.championship.date:
            if abs((r.championship.date - meet_date).days) > 400:
                continue
        if bands_conflict(other, band):
            has_conflict = True
        else:
            return False  # compatible band nearby — could be the same person
    return has_conflict


def normalize_for_matching(name):
    """Normalize a name for comparison."""
    name = name.upper().strip()
    # Remove punctuation except spaces
    name = re.sub(r'[^\w\s]', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def _get_swimmer_birth_year(swimmer):
    """Get the birth year from a swimmer, checking both fields."""
    if swimmer.birth_year:
        return swimmer.birth_year
    if swimmer.date_of_birth:
        return swimmer.date_of_birth.year
    return 0


def find_matching_swimmer(parsed_result, threshold=92, category='', meet_date=None):
    """
    Find the best matching swimmer in the database.

    STRICT matching only:
    - Name must be an EXACT match (case-insensitive)
    - Birth year must match (±1 year tolerance) if both are available
    - If names match exactly but birth years differ by >1 → NOT a match (different person)
    - If names match exactly and no birth year to compare → match with 95% confidence,
      unless the result's age category conflicts with the candidate's known
      age band in meets around the same date (same name, different kid).

    Returns: (swimmer_or_None, confidence_score, match_type)
    """
    name = parsed_result.swimmer_name
    birth_year = parsed_result.birth_year

    if not name:
        return None, 0, 'skip'

    normalized = normalize_for_matching(name)

    # Find all swimmers with exact name match (case-insensitive)
    # Check both the raw name and the normalized version
    candidates = list(Swimmer.objects.filter(name__iexact=name, is_relay_team=False))
    if not candidates:
        # Single pass over (id, name) pairs — much cheaper than hydrating
        # full Swimmer objects. Exact-normalized matches are preferred over
        # word-order matches ("Ali TAMER SAYED" vs "Ali SAYED TAMER").
        sorted_normalized = ' '.join(sorted(normalized.split()))
        normalized_ids = []
        word_order_ids = []
        for sid, sname in Swimmer.objects.filter(
                is_relay_team=False).values_list('id', 'name'):
            norm = normalize_for_matching(sname)
            if norm == normalized:
                normalized_ids.append(sid)
            elif ' '.join(sorted(norm.split())) == sorted_normalized:
                word_order_ids.append(sid)
        matched_ids = normalized_ids or word_order_ids
        if matched_ids:
            candidates = list(Swimmer.objects.filter(id__in=matched_ids))

    if not candidates:
        return None, 0, 'new'

    # We have exact name matches — now check birth year
    if birth_year:
        for swimmer in candidates:
            db_birth_year = _get_swimmer_birth_year(swimmer)
            if db_birth_year:
                # Both have birth year — must match within ±1 year
                if abs(db_birth_year - birth_year) <= 1:
                    return swimmer, 100, 'exact'
                # else: same name, different birth year = different person, keep checking
            else:
                # DB swimmer has no birth year — name matches, accept it
                return swimmer, 95, 'exact'

        # All candidates had birth years but none matched — this is a NEW person
        # with the same name but different age
        return None, 0, 'new'
    else:
        # No birth year in the import data — accept the first exact name
        # match whose known age band doesn't rule it out.
        band = category_band(category)
        for swimmer in candidates:
            if not _candidate_conflicts_by_category(swimmer, band, meet_date):
                return swimmer, 95, 'exact'
        # Every same-named swimmer belongs to a conflicting age band:
        # this is a different athlete with the same name.
        return None, 0, 'new'


def match_all_results(parsed_meet, threshold=92):
    """Match all results in a parsed meet to existing swimmers."""
    matches = []
    name_cache = {}

    for event in parsed_meet.events:
        for result in event.results:
            if result.status != 'OK':
                continue

            cache_key = (
                normalize_for_matching(result.swimmer_name),
                result.birth_year,
            )

            if cache_key in name_cache:
                swimmer, confidence, match_type = name_cache[cache_key]
            else:
                swimmer, confidence, match_type = find_matching_swimmer(result, threshold)
                name_cache[cache_key] = (swimmer, confidence, match_type)

            matches.append({
                'result': result,
                'swimmer': swimmer,
                'confidence': confidence,
                'match_type': match_type,
                'event': event,
            })

    return matches


def find_potential_duplicates():
    """Find potential duplicate swimmers in the database.
    Only flags exact name matches with consistent birth years."""
    # Group by sorted-word normalized name (covers both exact-normalized
    # and word-order matches) — O(n) instead of O(n²) pairwise scan.
    groups = {}
    for s in Swimmer.objects.filter(is_relay_team=False):
        key = ' '.join(sorted(normalize_for_matching(s.name).split()))
        groups.setdefault(key, []).append(s)

    duplicates = []
    for members in groups.values():
        if len(members) < 2:
            continue
        for i, s1 in enumerate(members):
            by1 = _get_swimmer_birth_year(s1)
            for s2 in members[i + 1:]:
                by2 = _get_swimmer_birth_year(s2)
                # If both have birth years, they must match
                if by1 and by2 and abs(by1 - by2) > 1:
                    continue
                score = 100 if by1 and by2 and abs(by1 - by2) <= 1 else 95
                duplicates.append((s1, s2, score))

    duplicates.sort(key=lambda x: x[2], reverse=True)
    return duplicates


def merge_swimmers(keep_swimmer, remove_swimmer):
    """Merge remove_swimmer into keep_swimmer."""
    from championships.models import Result
    from records.models import Record
    from medals.models import Medal
    from swimmers.models import SwimmerNickname

    Result.objects.filter(swimmer=remove_swimmer).update(swimmer=keep_swimmer)
    Record.objects.filter(swimmer=remove_swimmer).update(swimmer=keep_swimmer)
    Medal.objects.filter(swimmer=remove_swimmer).update(swimmer=keep_swimmer)

    existing_nicks = set(keep_swimmer.nicknames.values_list('nickname', flat=True))
    for nick in remove_swimmer.nicknames.all():
        if nick.nickname not in existing_nicks:
            nick.swimmer = keep_swimmer
            nick.save()
        else:
            nick.delete()

    if not keep_swimmer.email and remove_swimmer.email:
        keep_swimmer.email = remove_swimmer.email
    if not keep_swimmer.phone and remove_swimmer.phone:
        keep_swimmer.phone = remove_swimmer.phone
    if not keep_swimmer.photo and remove_swimmer.photo:
        keep_swimmer.photo = remove_swimmer.photo
    if not keep_swimmer.club and remove_swimmer.club:
        keep_swimmer.club = remove_swimmer.club
    # If keep_swimmer has no birth year but remove does, take it
    if not keep_swimmer.birth_year and remove_swimmer.birth_year:
        keep_swimmer.birth_year = remove_swimmer.birth_year
    if not keep_swimmer.date_of_birth and remove_swimmer.date_of_birth:
        keep_swimmer.date_of_birth = remove_swimmer.date_of_birth
    keep_swimmer.save()

    remove_swimmer.delete()
    return keep_swimmer
