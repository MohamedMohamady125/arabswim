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

    # Determine which scopes this swimmer can break records in
    scopes = []
    region = nat.region if nat else ''

    # National record — always applicable
    scopes.append(('NATIONAL', nat.id))

    # Regional records based on swimmer's region
    if region in ('ARAB', 'GCC'):
        scopes.append(('ARAB', None))  # None = no country filter
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
