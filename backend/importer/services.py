"""
Import service — orchestrates parsing, matching, and saving swim results.

Flow:
1. User uploads file
2. System parses and extracts structured data (preview)
3. System matches swimmers to existing DB entries
4. User reviews matches, confirms or adjusts
5. System saves confirmed data to DB
"""
import re
from datetime import date
from django.db import transaction

from .parsers.detector import detect_and_parse, detect_and_parse_upload
from .matcher import match_all_results, find_matching_swimmer, resolve_country
from swimmers.models import Swimmer
from championships.models import Championship, Result
from core.models import Event, Country


# Map keywords in meet names to country codes
MEET_COUNTRY_KEYWORDS = {
    'liban': 'LBN', 'lebanon': 'LBN', 'lebanese': 'LBN',
    'algérie': 'ALG', 'algeria': 'ALG', 'algérien': 'ALG',
    'tunisie': 'TUN', 'tunisia': 'TUN', 'tunisien': 'TUN',
    'maroc': 'MAR', 'morocco': 'MAR', 'marocain': 'MAR', 'trone': 'MAR',
    'egypt': 'EGY', 'egypte': 'EGY', 'egyptian': 'EGY',
    'jordan': 'JOR', 'jordanie': 'JOR',
    'kuwait': 'KWT', 'koweït': 'KWT',
    'saudi': 'KSA', 'saoudite': 'KSA',
    'qatar': 'QAT',
    'bahrain': 'BHR', 'bahreïn': 'BHR',
    'oman': 'OMA',
    'emirates': 'UAE', 'émirats': 'UAE', 'dubai': 'UAE', 'hamilton': 'UAE',
    'iraq': 'IRQ', 'irak': 'IRQ',
    'syria': 'SYR', 'syrie': 'SYR',
    'palestine': 'PLE',
    'yemen': 'YEM', 'yémen': 'YEM',
    'libya': 'LBY', 'libye': 'LBY',
    'sudan': 'SUD', 'soudan': 'SUD',
    'oran': 'ALG', 'setif': 'ALG', 'alger': 'ALG',
    'rades': 'TUN', 'tunis': 'TUN',
    'marrakech': 'MAR', 'casablanca': 'MAR', 'rabat': 'MAR',
    'doha': 'QAT', 'manama': 'BHR',
}


def _detect_country_from_meet(meet_name, location=''):
    """Detect the country from meet name and location text."""
    text = f'{meet_name} {location}'.lower()
    for keyword, code in MEET_COUNTRY_KEYWORDS.items():
        if keyword in text:
            return resolve_country(code)
    return None


def parse_file(file_path=None, uploaded_file=None):
    """
    Step 1: Parse a file and return structured preview data.
    Returns dict with meet info, events, and results for review.
    """
    if uploaded_file:
        parsed = detect_and_parse_upload(uploaded_file)
    elif file_path:
        parsed = detect_and_parse(file_path)
    else:
        raise ValueError('Must provide file_path or uploaded_file')

    return _build_preview(parsed)


def _build_preview(parsed_meet):
    """Convert ParsedMeet to a JSON-serializable preview dict."""
    events = []
    all_swimmers = {}  # unique swimmers by normalized name

    # Detect country from meet info
    inferred_country = _detect_country_from_meet(
        parsed_meet.meet_name, parsed_meet.location
    )
    inferred_country_code = inferred_country.code if inferred_country else ''

    # Determine meet year for birth_year calculation from age
    meet_year = 0
    if parsed_meet.date_text:
        m = re.search(r'(\d{4})', parsed_meet.date_text)
        if m:
            meet_year = int(m.group(1))
    if not meet_year:
        meet_year = date.today().year

    for event in parsed_meet.events:
        is_relay = 'relay' in event.event_name.lower() or '4x' in event.event_name.lower() or '4×' in event.event_name.lower()

        event_data = {
            'event_name': event.event_name,
            'distance': event.distance,
            'stroke': event.stroke,
            'gender': event.gender,
            'round_type': event.round_type,
            'age_group': event.age_group,
            'is_relay': is_relay,
            'results': [],
        }

        for r in event.results:
            if r.status not in ('OK', 'TLD') or r.time_centiseconds <= 0:
                continue

            # Use inferred country if no nationality on the result
            nat_code = r.nationality_code or inferred_country_code

            # Compute birth_year and age from each other when one is missing
            birth_year = r.birth_year
            age = r.age
            if not birth_year and age:
                birth_year = meet_year - age
            elif birth_year and not age:
                age = meet_year - birth_year

            # Calculate FINA points if not already provided
            fina_points = r.fina_points
            gender_for_event = r.gender or event.gender
            if not fina_points and r.time_centiseconds > 0:
                from .points import calculate_points
                fina_points = calculate_points(
                    r.time_centiseconds,
                    event.event_name,
                    gender_for_event,
                    parsed_meet.pool,
                )

            result_data = {
                'swimmer_name': r.swimmer_name,
                'time_text': r.time_text,
                'time_centiseconds': r.time_centiseconds,
                'rank': r.rank,
                'birth_year': birth_year,
                'age': age,
                'nationality_code': nat_code,
                'club': r.club,
                'fina_points': fina_points,
                'gender': gender_for_event,
                'is_relay': is_relay,
            }
            if r.split_times:
                result_data['split_times'] = r.split_times
            event_data['results'].append(result_data)

            # Track unique swimmers (skip relay team names)
            if not is_relay:
                key = r.swimmer_name.upper()
                if key not in all_swimmers:
                    all_swimmers[key] = {
                        'name': r.swimmer_name,
                        'birth_year': birth_year,
                        'nationality_code': nat_code,
                        'gender': r.gender or event.gender,
                        'club': r.club,
                        'age': r.age,
                        'results_count': 0,
                    }
                all_swimmers[key]['results_count'] += 1

        if event_data['results']:
            events.append(event_data)

    # Extra metadata from Excel files
    excel_meet_country = getattr(parsed_meet, '_excel_meet_country', '')
    excel_classification = getattr(parsed_meet, '_excel_classification', '')
    excel_sub_classification = getattr(parsed_meet, '_excel_sub_classification', '')

    # If no inferred country from meet name, try the Excel meet country column
    if not inferred_country_code and excel_meet_country:
        ec = _detect_country_from_meet(excel_meet_country)
        if ec:
            inferred_country_code = ec.code

    return {
        'meet': {
            'name': parsed_meet.meet_name,
            'location': parsed_meet.location,
            'date': parsed_meet.date_text,
            'date_end': getattr(parsed_meet, 'date_end', ''),
            'pool': parsed_meet.pool,
            'format': parsed_meet.source_format,
            'inferred_country': inferred_country_code,
            'classification': excel_classification,
            'sub_classification': excel_sub_classification,
        },
        'stats': {
            'total_events': len(events),
            'total_results': sum(len(e['results']) for e in events),
            'total_swimmers': len(all_swimmers),
        },
        'events': events,
        'swimmers': list(all_swimmers.values()),
    }


ARAB_COUNTRY_CODES = {
    'ALG', 'BHR', 'COM', 'DJI', 'EGY', 'IRQ', 'JOR', 'KWT', 'LBN',
    'LBY', 'MTN', 'MAR', 'OMA', 'PLE', 'QAT', 'KSA', 'SOM', 'SUD',
    'SYR', 'TUN', 'UAE', 'YEM',
}


def match_swimmers_preview(preview_data):
    """
    Step 2: Match extracted swimmers against database.
    Returns enriched preview with match suggestions.
    Only shows Arab nationality swimmers for matching — other swimmers'
    results are kept but they don't need accounts created.
    """
    swimmers = preview_data.get('swimmers', [])
    matched = []

    from .parsers.base import ParsedResult

    for s in swimmers:
        # Skip non-Arab swimmers in matching (their results are still imported)
        nat_code = s.get('nationality_code', '').upper()
        if nat_code and nat_code not in ARAB_COUNTRY_CODES:
            continue
        # Create a minimal ParsedResult for matching
        pr = ParsedResult(
            swimmer_name=s['name'],
            time_text='',
            birth_year=s.get('birth_year', 0),
            nationality_code=s.get('nationality_code', ''),
            age=s.get('age', 0),
        )

        swimmer, confidence, match_type = find_matching_swimmer(pr, threshold=92)

        match_info = {
            'parsed_name': s['name'],
            'birth_year': s.get('birth_year', 0),
            'nationality_code': s.get('nationality_code', ''),
            'gender': s.get('gender', ''),
            'club': s.get('club', ''),
            'results_count': s.get('results_count', 0),
            'match_type': match_type,
            'confidence': confidence,
            'matched_swimmer': None,
        }

        if swimmer:
            match_info['matched_swimmer'] = {
                'id': swimmer.id,
                'name': swimmer.name,
                'nationality': swimmer.nationality.name if swimmer.nationality else '',
                'date_of_birth': str(swimmer.date_of_birth) if swimmer.date_of_birth else '',
                'sex': swimmer.sex,
            }

        matched.append(match_info)

    # Sort: new swimmers first, then by confidence ascending (least confident matches need review)
    matched.sort(key=lambda x: (x['match_type'] != 'new', x['confidence']))

    return matched


@transaction.atomic
def confirm_import(preview_data, swimmer_decisions, championship_id=None, championship_details=None):
    """
    Step 3: Confirm and save the imported data.

    Args:
        preview_data: The preview from parse_file()
        swimmer_decisions: Dict mapping parsed_name -> {
            'action': 'match' | 'create' | 'skip',
            'swimmer_id': int (for 'match'),
        }
        championship_id: Existing championship to add results to (optional)
        championship_details: Dict from the user-editable form with:
            name, country, pool, date, end_date, location,
            classification_category, classification, sub_classification

    Returns: Summary of what was saved.
    """
    meet_info = preview_data['meet']

    # Resolve the country for swimmers fallback
    meet_country = None
    if championship_details and championship_details.get('country'):
        try:
            meet_country = Country.objects.get(id=int(championship_details['country']))
        except (Country.DoesNotExist, ValueError):
            pass
    if not meet_country:
        meet_country = _detect_country_from_meet(
            meet_info.get('name', ''), meet_info.get('location', '')
        )
    if not meet_country:
        meet_country = _most_common_country(preview_data)
    if not meet_country:
        meet_country = Country.objects.first()

    # Get or create championship
    if championship_id:
        championship = Championship.objects.get(id=championship_id)
    elif championship_details:
        # Use user-provided details from the form
        champ_date = _parse_date(championship_details.get('date', ''))
        champ_kwargs = {
            'name': championship_details.get('name') or meet_info.get('name', 'Imported Meet'),
            'date': champ_date,
            'pool': championship_details.get('pool') or meet_info.get('pool', 'LCM'),
            'country': meet_country,
            'location': championship_details.get('location', ''),
        }
        # Optional end date
        end_date_str = championship_details.get('end_date', '')
        if end_date_str:
            champ_kwargs['end_date'] = _parse_date(end_date_str)
        # Optional classification fields (2 levels only)
        for field in ('classification', 'sub_classification'):
            val = championship_details.get(field)
            if val:
                champ_kwargs[field + '_id'] = int(val)

        championship = Championship.objects.create(**champ_kwargs)
    else:
        championship_date = _parse_date(meet_info.get('date', ''))
        pool = meet_info.get('pool', 'LCM')

        championship = Championship.objects.create(
            name=meet_info.get('name', 'Imported Meet'),
            date=championship_date,
            pool=pool,
            country=meet_country,
            location=meet_info.get('location', ''),
        )

    # Build event cache
    event_cache = {}
    for db_event in Event.objects.all():
        event_cache[db_event.name.upper()] = db_event

    # Process results
    created_swimmers = 0
    matched_swimmers = 0
    skipped_swimmers = 0
    created_results = 0
    skipped_results = 0
    skipped_details = []

    # Map swimmer names to Swimmer objects
    swimmer_map = {}

    for event_data in preview_data['events']:
        # Find or create the event
        db_event = _find_event(event_data, event_cache)
        if not db_event:
            continue

        is_relay = event_data.get('is_relay', False)

        for result_data in event_data['results']:
            parsed_name = result_data['swimmer_name']
            name_upper = parsed_name.upper()

            relay_gender = result_data.get('gender', '') or event_data.get('gender', 'M') or 'M'
            relay_key = f"{name_upper}_{relay_gender}"

            if is_relay or result_data.get('is_relay', False):
                if relay_key not in swimmer_map:
                    # Try to find existing placeholder with matching sex
                    existing_placeholder = Swimmer.objects.filter(name__iexact=parsed_name, sex=relay_gender).first()
                    if existing_placeholder:
                        swimmer_map[relay_key] = existing_placeholder
                    else:
                        # Resolve nationality for the team
                        nationality = None
                        nat_code = result_data.get('nationality_code', '')
                        if nat_code:
                            nationality = resolve_country(nat_code)
                        if not nationality:
                            nationality = meet_country
                        if not nationality:
                            nationality = Country.objects.first()

                        swimmer_map[relay_key] = Swimmer.objects.create(
                            name=parsed_name,
                            date_of_birth=None,
                            birth_year=None,
                            nationality=nationality,
                            sex=relay_gender,
                            club=parsed_name,
                        )
                        created_swimmers += 1
            else:
                # Individual: normal swimmer matching
                if name_upper not in swimmer_map:
                    decision = swimmer_decisions.get(parsed_name, swimmer_decisions.get(name_upper, {}))
                    action = decision.get('action', 'auto')

                    if action == 'skip':
                        swimmer_map[name_upper] = None
                        skipped_swimmers += 1
                    elif action == 'match' and decision.get('swimmer_id'):
                        swimmer_map[name_upper] = Swimmer.objects.get(id=decision['swimmer_id'])
                        matched_swimmers += 1
                    elif action == 'create':
                        swimmer_map[name_upper] = _create_swimmer(result_data, meet_country)
                        created_swimmers += 1
                    else:
                        # Auto: try to match, create if new
                        from .parsers.base import ParsedResult as PR
                        pr = PR(
                            swimmer_name=parsed_name,
                            time_text='',
                            birth_year=result_data.get('birth_year', 0),
                            nationality_code=result_data.get('nationality_code', ''),
                            age=result_data.get('age', 0),
                        )
                        swimmer, conf, mtype = find_matching_swimmer(pr, threshold=92)
                        if swimmer:
                            swimmer_map[name_upper] = swimmer
                            matched_swimmers += 1
                        else:
                            swimmer_map[name_upper] = _create_swimmer(result_data, meet_country)
                            created_swimmers += 1

            lookup_key = relay_key if (is_relay or result_data.get('is_relay', False)) else name_upper
            swimmer = swimmer_map.get(lookup_key)
            if not swimmer:
                skipped_results += 1
                skipped_details.append({
                    'swimmer': parsed_name,
                    'event': event_data.get('event_name', ''),
                    'reason': 'Swimmer skipped by user',
                })
                continue

            # Create result (skip duplicates)
            time_cs = result_data['time_centiseconds']
            if time_cs <= 0:
                skipped_results += 1
                skipped_details.append({
                    'swimmer': parsed_name,
                    'event': event_data.get('event_name', ''),
                    'reason': 'Invalid time',
                })
                continue

            # Compute age at competition
            age_at_comp = result_data.get('age', 0)
            if not age_at_comp and swimmer.date_of_birth and championship.date:
                age_at_comp = championship.date.year - swimmer.date_of_birth.year

            # Determine team
            if is_relay or result_data.get('is_relay', False):
                team = parsed_name  # For relay, team = the team name itself
            else:
                team = result_data.get('club', '').strip()

            # Update swimmer's club if they don't have one yet
            if team and not swimmer.club and not (is_relay or result_data.get('is_relay', False)):
                swimmer.club = team
                swimmer.save(update_fields=['club'])

            round_type = event_data.get('round_type', '') or ''

            existing = Result.objects.filter(
                swimmer=swimmer,
                championship=championship,
                event=db_event,
                round_type=round_type,
            ).first()

            if existing:
                # Keep the better time
                if time_cs < existing.time_centiseconds:
                    existing.time_centiseconds = time_cs
                    existing.fina_points = result_data.get('fina_points', 0) or existing.fina_points
                    if team:
                        existing.team = team
                    existing.save()
                    created_results += 1
                else:
                    from .parsers.base import format_centiseconds
                    skipped_results += 1
                    existing_time = format_centiseconds(existing.time_centiseconds)
                    new_time = format_centiseconds(time_cs)
                    if existing.time_centiseconds == time_cs:
                        reason = f'Duplicate — same time {existing_time} already exists'
                    else:
                        reason = f'Duplicate — existing time {existing_time} is better than {new_time}'
                    skipped_details.append({
                        'swimmer': parsed_name,
                        'event': event_data.get('event_name', ''),
                        'round': round_type,
                        'reason': reason,
                    })
            else:
                # Parse relay swimmer splits into structured data
                relay_swimmers = None
                if is_relay or result_data.get('is_relay', False):
                    raw_splits = result_data.get('split_times', [])
                    if raw_splits:
                        relay_swimmers = []
                        for split_str in raw_splits:
                            # Format: "Ali TAMER SAYED 0:50.38"
                            # Find the time at the end
                            import re as _re
                            m = _re.search(r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})$', split_str.strip())
                            if m:
                                swimmer_name = split_str[:m.start()].strip()
                                split_time = m.group(1)
                                relay_swimmers.append({'name': swimmer_name, 'split_time': split_time})
                            else:
                                relay_swimmers.append({'name': split_str.strip(), 'split_time': ''})

                # Use existing fina_points or calculate if missing
                fina_pts = result_data.get('fina_points', 0) or 0
                if not fina_pts and time_cs > 0:
                    from .points import calculate_points
                    gender_code = result_data.get('gender', 'M') or 'M'
                    fina_pts = calculate_points(
                        time_cs,
                        event_data.get('event_name', db_event.name),
                        gender_code,
                        championship.pool,
                    )

                Result.objects.create(
                    swimmer=swimmer,
                    championship=championship,
                    event=db_event,
                    round_type=round_type,
                    team=team,
                    time_centiseconds=time_cs,
                    fina_points=fina_pts or None,
                    age_at_competition=age_at_comp or None,
                    relay_swimmers=relay_swimmers,
                )
                created_results += 1

    # Auto-create teams from club names found in this import
    from teams.utils import auto_create_teams
    teams_created = auto_create_teams()

    return {
        'championship_id': championship.id,
        'championship_name': championship.name,
        'created_swimmers': created_swimmers,
        'matched_swimmers': matched_swimmers,
        'skipped_swimmers': skipped_swimmers,
        'created_results': created_results,
        'skipped_results': skipped_results,
        'skipped_details': skipped_details,
        'teams_created': teams_created,
    }


def _create_swimmer(result_data, fallback_country=None):
    """Create a new swimmer from parsed result data."""
    birth_year = result_data.get('birth_year', 0) or None

    gender = result_data.get('gender', 'M')
    if gender not in ('M', 'F'):
        gender = 'M'

    # Resolve nationality: explicit code > fallback from meet
    nationality = None
    nat_code = result_data.get('nationality_code', '')
    if nat_code:
        nationality = resolve_country(nat_code)
    if not nationality:
        nationality = fallback_country
    if not nationality:
        nationality = Country.objects.first()

    club = result_data.get('club', '').strip()

    swimmer = Swimmer.objects.create(
        name=result_data['swimmer_name'],
        date_of_birth=None,
        birth_year=birth_year,
        nationality=nationality,
        sex=gender,
        club=club,
    )

    return swimmer


def _most_common_country(preview_data):
    """Find the most common nationality code in the parsed data."""
    from collections import Counter
    codes = Counter()
    for s in preview_data.get('swimmers', []):
        code = s.get('nationality_code', '')
        if code:
            codes[code] += 1
    if codes:
        most_common_code = codes.most_common(1)[0][0]
        return resolve_country(most_common_code)
    return None


def _find_event(event_data, event_cache):
    """Find a matching Event in the database."""
    event_name = event_data.get('event_name', '')
    is_relay = event_data.get('is_relay', False) or 'relay' in event_name.lower() or '4x' in event_name.lower() or '4×' in event_name.lower()

    # Try exact match
    if event_name.upper() in event_cache:
        return event_cache[event_name.upper()]

    # Try constructing standard name
    distance = event_data.get('distance', 0)
    stroke = event_data.get('stroke', '')
    if distance and stroke:
        if is_relay:
            leg_dist = distance // 4 if distance >= 200 else distance
            standard_name = f'4x{leg_dist} M {stroke} Relay'
        else:
            standard_name = f'{distance} M {stroke}'
        if standard_name.upper() in event_cache:
            return event_cache[standard_name.upper()]

    # Try partial match (but don't match relay to individual or vice versa)
    # Skip partial matching for relay events — they need exact name match
    # because Men's, Women's, and Mixed relays are different events
    if not is_relay:
        for db_name, db_event in event_cache.items():
            if str(distance) in db_name and stroke.upper() in db_name:
                if not db_event.is_relay:
                    return db_event

    # Create new event if not found
    if distance and stroke:
        if is_relay:
            leg_dist = distance // 4 if distance >= 200 else distance
            final_name = event_name or f'4x{leg_dist} M {stroke} Relay'
        else:
            final_name = event_name or f'{distance} M {stroke}'
        event = Event.objects.create(
            name=final_name,
            distance=distance,
            stroke=stroke,
            is_relay=is_relay,
            sort_order=99,
        )
        event_cache[event.name.upper()] = event
        return event

    return None


def _parse_date(date_text):
    """Try to parse a date from various formats."""
    if not date_text:
        return date.today()

    # Skip non-date text
    if 'qualifying' in date_text.lower() or 'record' in date_text.lower():
        return date.today()

    # Try DD/MM/YYYY or D/M/YYYY
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', date_text)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass

    # Try DD-MM-YYYY
    m = re.search(r'(\d{1,2})-(\d{1,2})-(\d{4})', date_text)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass

    # Try YYYY-MM-DD
    m = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', date_text)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass

    # Try to extract just a year
    m = re.search(r'(\d{4})', date_text)
    if m:
        return date(int(m.group(1)), 1, 1)

    return date.today()
