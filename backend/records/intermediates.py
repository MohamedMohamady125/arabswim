"""Lead-in (intermediate) split times for record purposes.

In swimming, a time taken from the START of an individual race at a shorter
standard distance is an official time for that distance: the first 50 of a
100 Freestyle can break the 50 Freestyle record, the first 100 of a 200
Breaststroke the 100 Breaststroke record, and so on — for every event
(user rule 2026-11-04).

Rules enforced here:
- Individual races only. Relay lead-offs are covered by the separate relay
  first-leg rule; legs 2-4 are flying starts and never count.
- The stroke carries over unchanged — no IM (its opening laps are butterfly
  swum inside a medley, not a butterfly race) and no open water.
- Only prefix times from the very start count. Mid-race segments are
  structurally excluded because only cumulative sums from lap 1 are taken.
- The split chain must be confirmed by the official final time (within
  2s or 3%), otherwise the splits are treated as unreliable and skipped.
"""
from .models import IntermediateTime

_STROKES = {'Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly'}


def leading_splits_cs(result):
    """Return [(distance, centiseconds-from-start)] for every stored split
    marker SHORT of the race distance, or [] when the race/splits don't
    qualify. Handles both split storage formats (per-lap and cumulative)."""
    event = result.event
    if event.is_relay or event.stroke not in _STROKES:
        return []
    if result.is_hc or not result.time_centiseconds or result.time_centiseconds <= 0:
        return []
    splits = result.splits or []
    if len(splits) < 2 or not all(isinstance(s, dict) for s in splits):
        return []

    from importer.parsers.base import parse_time_to_centiseconds
    pts = []
    for s in splits:
        d = s.get('distance')
        cs = parse_time_to_centiseconds(str(s.get('time') or ''))
        if not isinstance(d, (int, float)) or not cs or cs <= 0:
            return []  # one unreadable entry poisons the whole chain
        pts.append((int(d), cs))
    pts.sort(key=lambda p: p[0])
    dists = [d for d, _ in pts]
    if len(set(dists)) != len(dists) or dists[-1] > event.distance or dists[0] <= 0:
        return []

    total = result.time_centiseconds
    tol = max(200, total * 3 // 100)
    vals = [cs for _, cs in pts]

    out = []
    if dists[-1] == event.distance and abs(sum(vals) - total) <= tol:
        # per-lap format: prefix sums are the times from the start
        run = 0
        for d, cs in pts:
            run += cs
            if d < event.distance:
                out.append((d, run))
    elif all(b > a for a, b in zip(vals, vals[1:])) and abs(vals[-1] - total) <= tol:
        # cumulative format: values already run from the start
        out = [(d, cs) for d, cs in pts if d < event.distance]
    else:
        return []  # format unconfirmed — don't mint record times from it

    for (_, c1), (_, c2) in zip(out, out[1:]):
        if c2 <= c1:
            return []
    return out


def sync_intermediate_times(result):
    """Rebuild the stored IntermediateTime rows for one result; returns the
    rows (only distances that exist as real individual events)."""
    from core.models import Event as EventModel
    pairs = leading_splits_cs(result)
    IntermediateTime.objects.filter(result=result).delete()
    if not pairs:
        return []
    rows = []
    for d, cs in pairs:
        ev = EventModel.objects.filter(
            distance=d, stroke=result.event.stroke, is_relay=False).first()
        if ev:
            rows.append(IntermediateTime(result=result, event=ev,
                                         time_centiseconds=cs))
    if rows:
        IntermediateTime.objects.bulk_create(rows, ignore_conflicts=True)
    return rows
