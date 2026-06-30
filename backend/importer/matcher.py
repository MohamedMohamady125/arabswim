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


def get_country_map():
    global _country_cache
    if _country_cache is None:
        _country_cache = {}
        for c in Country.objects.all():
            _country_cache[c.code.upper()] = c
            _country_cache[c.name.upper()] = c
            aliases = {
                'KUW': 'KWT', 'BRN': 'BHR', 'BAH': 'BHR',
                'UAE': 'UAE', 'KSA': 'KSA', 'SAU': 'KSA',
                'ALG': 'ALG', 'MAR': 'MAR', 'TUN': 'TUN',
                'EGY': 'EGY', 'JOR': 'JOR', 'LBN': 'LBN', 'LIB': 'LBN',
                'IRQ': 'IRQ', 'SYR': 'SYR', 'OMA': 'OMA',
                'BHR': 'BHR', 'QAT': 'QAT', 'SUD': 'SUD',
                'YEM': 'YEM', 'LBY': 'LBY', 'PLE': 'PLE', 'PAL': 'PLE',
                'SOM': 'SOM', 'MTN': 'MTN', 'MRT': 'MTN',
                'DJI': 'DJI', 'COM': 'COM',
            }
            if c.code.upper() in aliases.values():
                for alias, target in aliases.items():
                    if target == c.code.upper():
                        _country_cache[alias] = c
    return _country_cache


def resolve_country(code):
    if not code:
        return None
    cmap = get_country_map()
    return cmap.get(code.upper())


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


def find_matching_swimmer(parsed_result, threshold=92):
    """
    Find the best matching swimmer in the database.

    STRICT matching only:
    - Name must be an EXACT match (case-insensitive)
    - Birth year must match (±1 year tolerance) if both are available
    - If names match exactly but birth years differ by >1 → NOT a match (different person)
    - If names match exactly and no birth year to compare → match with 95% confidence

    Returns: (swimmer_or_None, confidence_score, match_type)
    """
    name = parsed_result.swimmer_name
    birth_year = parsed_result.birth_year

    if not name:
        return None, 0, 'skip'

    normalized = normalize_for_matching(name)

    # Find all swimmers with exact name match (case-insensitive)
    # Check both the raw name and the normalized version
    candidates = list(Swimmer.objects.filter(name__iexact=name))
    if not candidates:
        # Try normalized match
        all_swimmers = Swimmer.objects.all()
        for s in all_swimmers:
            if normalize_for_matching(s.name) == normalized:
                candidates.append(s)

    if not candidates:
        # Also try with words sorted (handles "Ali TAMER SAYED" vs "Ali SAYED TAMER")
        sorted_normalized = ' '.join(sorted(normalized.split()))
        for s in Swimmer.objects.all():
            if ' '.join(sorted(normalize_for_matching(s.name).split())) == sorted_normalized:
                candidates.append(s)

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
        # No birth year in the import data — accept first exact name match
        return candidates[0], 95, 'exact'


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
    swimmers = list(Swimmer.objects.all())
    duplicates = []
    seen = set()

    for i, s1 in enumerate(swimmers):
        n1 = normalize_for_matching(s1.name)
        by1 = _get_swimmer_birth_year(s1)
        for s2 in swimmers[i+1:]:
            n2 = normalize_for_matching(s2.name)

            # Exact name match only
            if n1 != n2:
                # Also check sorted words
                if ' '.join(sorted(n1.split())) != ' '.join(sorted(n2.split())):
                    continue

            by2 = _get_swimmer_birth_year(s2)

            # If both have birth years, they must match
            if by1 and by2 and abs(by1 - by2) > 1:
                continue

            score = 100 if by1 and by2 and abs(by1 - by2) <= 1 else 95

            pair = tuple(sorted([s1.id, s2.id]))
            if pair not in seen:
                seen.add(pair)
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
