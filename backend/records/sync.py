"""Keep automatic records under the country the swim was swum for.

A record row copies the swimmer's country at the moment it is created. When
an admin later records a nationality change, the swimmer's results are
re-stamped (swimmers.models.restamp_result_nationalities) — the record rows
must follow, otherwise a swim made for Saudi Arabia keeps showing as a
Tunisian record.

Only automatic rows that point at a result are touched. Hand-entered records
(MANUAL / IMPORT) are the admin's word and are never changed here.
"""
from django.db.models import F, Q

from .models import Record

ARAB_REGIONS = ('ARAB', 'GCC')


def stale_records(swimmer=None):
    """Automatic records whose country differs from their result's country."""
    qs = (Record.objects
          .filter(source='AUTO', result__isnull=False, result__nationality__isnull=False)
          .exclude(country_id=F('result__nationality_id')))
    if swimmer is not None:
        qs = qs.filter(swimmer=swimmer)
    return qs


def _still_valid(record_type, country):
    """Can a record of this scope be held for `country`? (National never
    carries over: a national record belongs to one country's book.)"""
    if record_type == 'ARAB':
        return country.region in ARAB_REGIONS
    if record_type == 'GCC':
        return country.region == 'GCC'
    return False


def _fastest_eligible(record_type, event_id, pool, sex, country_id, is_relay):
    """Fastest swim on file that may hold this record book."""
    from championships.models import Result
    qs = Result.objects.filter(event_id=event_id, is_hc=False, time_centiseconds__gt=0)
    if pool != 'OW':
        qs = qs.filter(championship__pool=pool)
    if not is_relay:
        qs = qs.filter(swimmer__sex=sex)
    if record_type == 'NATIONAL':
        qs = qs.filter(Q(nationality_id=country_id)
                       | Q(nationality__isnull=True, swimmer__nationality_id=country_id))
    elif record_type == 'GCC':
        qs = qs.filter(nationality__region='GCC')
    else:
        qs = qs.filter(nationality__region__in=ARAB_REGIONS)
    return (qs.select_related('swimmer', 'event', 'championship', 'nationality')
            .order_by('time_centiseconds', 'championship__date', 'id').first())


def resync_swimmer_records(swimmer):
    """Bring one swimmer's automatic records in line with their results.

    - Arab / GCC record the swimmer can still hold: the country label follows
      the result.
    - Anything else (a national record of the country they did NOT swim for,
      a GCC record of a swimmer who was not GCC at the time): the row is
      removed and that record book is handed back to its fastest eligible swim.
    - The swimmer's results are then checked again, so the swim is entered in
      the books of the country it was really swum for.

    Returns counts: {'relabelled', 'removed', 'created'}.
    """
    from championships.models import Result
    from .auto import check_and_update_records

    out = {'relabelled': 0, 'removed': 0, 'created': 0}
    stale = list(stale_records(swimmer).select_related('result__nationality', 'event', 'swimmer'))
    if not stale:
        return out

    reopen = set()
    for rec in stale:
        country = rec.result.nationality
        if _still_valid(rec.record_type, country):
            Record.objects.filter(pk=rec.pk).update(country=country)
            out['relabelled'] += 1
        else:
            reopen.add((rec.record_type, rec.event_id, rec.pool, rec.swimmer.sex,
                        rec.country_id if rec.record_type == 'NATIONAL' else None,
                        rec.event.is_relay))
            rec.delete()
            out['removed'] += 1

    before = Record.objects.count()
    results = (Result.objects.filter(swimmer=swimmer)
               .select_related('swimmer', 'event', 'championship', 'nationality')
               .order_by('championship__date', 'id'))
    for r in results:
        check_and_update_records(r)
    for key in reopen:
        best = _fastest_eligible(*key)
        if best is not None:
            check_and_update_records(best)
    out['created'] = max(0, Record.objects.count() - before)
    return out
