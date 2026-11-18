"""Records typed in or imported on the New Records page, read as swims.

Such a record has no meet result behind it (by design it never shows inside
a meet), but it is still a real swim: it must count in the rankings and in a
swimmer's rank positions. Everything that ranks swimmers reads these rows
through here, so the rules are the same everywhere:

- only hand-entered rows (MANUAL / IMPORT) — an automatic record already has
  its meet result in the rankings;
- the swim counts for the country the record is saved to (the country picked
  for a national record), otherwise the swimmer's own;
- non-Arab holders (region OTHER, e.g. a world record) never rank;
- a row is one swim: the caller keeps each swimmer's fastest and lets a meet
  result win a tie, so the same swim is never listed twice.
"""
from collections import namedtuple

from .models import Record

HandSwim = namedtuple('HandSwim', 'record swimmer swimmer_id event_id pool time_cs date nat age age_cap')


def hand_entered_swims(event_ids=None, pool=None, gender=None, year=None, swimmer_id=None):
    qs = (Record.objects
          .filter(source__in=Record.HAND_ENTERED, time_centiseconds__gt=0)
          .select_related('swimmer', 'swimmer__nationality', 'country', 'event'))
    if event_ids is not None:
        qs = qs.filter(event_id__in=list(event_ids))
    if pool:
        qs = qs.filter(pool=pool)
    if gender:
        qs = qs.filter(swimmer__sex=gender)
    if year:
        qs = qs.filter(result_date__year=year)
    if swimmer_id:
        qs = qs.filter(swimmer_id=swimmer_id)
    rows = []
    for rec in qs:
        s = rec.swimmer
        nat = rec.country or s.nationality
        if nat is None or nat.region == 'OTHER':
            continue
        born = s.date_of_birth.year if s.date_of_birth else s.birth_year
        age = rec.result_date.year - born if born else None
        cap = None
        if rec.age_category and rec.age_category.startswith('U'):
            try:
                cap = int(rec.age_category[1:])
            except ValueError:
                cap = None
        rows.append(HandSwim(rec, s, s.id, rec.event_id, rec.pool, rec.time_centiseconds,
                             rec.result_date, nat, age, cap))
    return rows


def in_scope(nat, scope, country_id=None):
    """Same scope rule the rankings apply to a meet result's country."""
    if scope == 'national' and country_id:
        return nat.id == country_id
    if scope == 'arab':
        return nat.region in ('ARAB', 'GCC')
    if scope == 'gcc':
        return nat.region == 'GCC'
    return True


def fits_age(row, max_age):
    """Age-group filter. Known birth year: age in the year of the swim. Unknown:
    only a record filed in an age category at or under the limit qualifies."""
    if row.age is not None:
        return row.age <= max_age
    return row.age_cap is not None and row.age_cap <= max_age


def fastest_per_swimmer(rows):
    best = {}
    for r in rows:
        cur = best.get(r.swimmer_id)
        if cur is None or (r.time_cs, r.date) < (cur.time_cs, cur.date):
            best[r.swimmer_id] = r
    return best
