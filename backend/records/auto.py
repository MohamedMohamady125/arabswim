"""Auto-detect records from results.

When a result is created or imported, check if it beats the existing
record for any applicable scope (NATIONAL, ARAB, GCC). If so, create
or update the Record entry.
"""
from .models import Record


# Map swimmer nationality region to which record scopes they can break
REGION_SCOPES = {
    'ARAB': ['NATIONAL', 'ARAB'],
    'GCC': ['NATIONAL', 'ARAB', 'GCC'],
}


def check_and_update_records(result):
    """Check if a result breaks any existing records and update accordingly.

    Called after result creation (import or manual add).
    Returns a list of record types broken.
    """
    if result.is_hc or result.time_centiseconds <= 0:
        return []
    if result.event.is_relay and result.event.distance < 400:
        return []  # 4x50 relays don't count for records

    swimmer = result.swimmer
    if swimmer.is_relay_team:
        # For relays, the "swimmer" is the team placeholder — still check
        pass

    nat = result.nationality or swimmer.nationality
    if not nat:
        return []

    pool = result.championship.pool if result.championship_id else 'LCM'
    event = result.event
    time_cs = result.time_centiseconds
    meet_date = result.championship.date if result.championship_id else None
    meet_name = result.championship.name if result.championship_id else ''
    location = result.championship.location if result.championship_id else ''

    # First-leg relay rule: if this is a relay event and the swimmer is an
    # individual (not a team placeholder) with a first-leg split time,
    # check records on the individual event with the split time instead.
    if event.is_relay and not swimmer.is_relay_team:
        legs = result.relay_swimmers or []
        if len(legs) == 1 and isinstance(legs[0], dict) and legs[0].get('split_time'):
            from importer.parsers.base import parse_time_to_centiseconds
            split_cs = parse_time_to_centiseconds(legs[0]['split_time'])
            if split_cs > 0:
                # Find the individual event (e.g. "100 M Freestyle" from "4x100 M Freestyle Relay")
                ind_distance = event.distance // 4 if event.distance else 0
                if ind_distance:
                    from core.models import Event as EventModel
                    ind_event = EventModel.objects.filter(
                        distance=ind_distance, stroke=event.stroke,
                        is_relay=False).first()
                    if ind_event:
                        event = ind_event
                        time_cs = split_cs

    # Determine which scopes this swimmer can break records in
    scopes = []
    region = nat.region if nat else ''

    # Only track records for Arab/GCC swimmers
    if region not in ('ARAB', 'GCC'):
        return []

    # National record
    scopes.append(('NATIONAL', nat.id))

    # Regional records
    scopes.append(('ARAB', None))
    if region == 'GCC':
        scopes.append(('GCC', None))

    broken = []
    for scope, country_id in scopes:
        # Find existing record for this event + scope + pool
        existing = Record.objects.filter(
            event=event,
            record_type=scope,
            pool=pool,
        )
        if scope == 'NATIONAL' and country_id:
            existing = existing.filter(country_id=country_id)

        # Filter by gender for individual events
        if not event.is_relay:
            existing = existing.filter(swimmer__sex=swimmer.sex)

        best = existing.order_by('time_centiseconds').first()

        if best and time_cs >= best.time_centiseconds:
            continue  # Not a record

        # New record! Create it
        Record.objects.create(
            swimmer=swimmer,
            event=event,
            record_type=scope,
            pool=pool,
            time_centiseconds=time_cs,
            location=location,
            meet_name=meet_name,
            country=nat,
            result_date=meet_date or __import__('datetime').date.today(),
            result=result,
            is_new=True,
        )
        broken.append(scope)

    return broken
