"""Check the arithmetic that a medal table must satisfy, and flag every
place it doesn't — so a silently-short count (a dropped podium row, a
split identity, a name-flip that loses a relay medal) is caught instead of
shipping as a number nobody can tell is wrong.

The invariants, per the medal model:

  * Every podium (a distinct event x age-category x sex x scope that awarded
    anything) should hand out exactly one GOLD, one SILVER and one BRONZE —
    unless fewer than three swimmers contested it, or a tie inflates a rank.
    A podium that comes back with two medals is the signature of a dropped
    result row.
  * Golds = number of podiums. Always.
  * The grand total reconciles three ways: summed by athlete, by country,
    and by medal row. A split identity or an orphaned medal breaks this.

Read-only. Reports; changes nothing.

    python manage.py audit_medals                 # every championship
    python manage.py audit_medals --champ 179      # one meet
    python manage.py audit_medals --only-flagged   # hide clean meets
"""
from collections import defaultdict

from django.core.management.base import BaseCommand

from championships.models import Championship
from medals.models import Medal

_RANK = {'GOLD': 1, 'SILVER': 2, 'BRONZE': 3}


class Command(BaseCommand):
    help = 'Audit medal-count invariants for one or all championships.'

    def add_arguments(self, parser):
        parser.add_argument('--champ', type=int, help='Only this championship id.')
        parser.add_argument('--only-flagged', action='store_true',
                            help='Suppress championships with no anomalies.')

    def handle(self, *args, **opts):
        qs = Championship.objects.all().order_by('id')
        if opts['champ']:
            qs = qs.filter(id=opts['champ'])

        grand_flags = 0
        for champ in qs:
            flags = self._audit_one(champ, opts['only_flagged'])
            grand_flags += flags

        style = self.style.ERROR if grand_flags else self.style.SUCCESS
        self.stdout.write(style(f'\n{grand_flags} anomalies across {qs.count()} meet(s).'))

    def _audit_one(self, champ, only_flagged):
        medals = list(
            Medal.objects.filter(championship=champ)
            .select_related('result', 'result__swimmer', 'swimmer', 'event')
        )
        if not medals:
            return 0

        # A relay awards the same placing to every leg swimmer, so its podium
        # is counted by team (distinct result), not by swimmer, and its field
        # is a count of teams. Individual podiums are counted by swimmer and
        # split by sex; relays are mixed and are not.
        def is_relay(m):
            return bool(m.result_id and m.result.swimmer
                        and m.result.swimmer.is_relay_team)

        # How many entrants actually contested each podium — a genuinely small
        # field legitimately awards fewer than three medals.
        contested = defaultdict(set)  # individuals: (event, sex, cat) -> swimmers
        relay_field = defaultdict(set)  # relays: (event, sex, cat) -> team result ids
        for r in (champ.results.filter(is_hc=False, is_manual=False)
                  .select_related('swimmer')):
            if not r.event_id or not r.swimmer_id:
                continue
            if r.swimmer.is_relay_team:
                # "4x100 M Freestyle Relay" reuses one event_id for the men's,
                # women's and mixed races (M = metres), so the team's own sex
                # (M/F/X), not the event, separates the three podiums.
                relay_field[(r.event_id, r.swimmer.sex, r.category or '')].add(r.id)
            else:
                contested[(r.event_id, r.swimmer.sex, r.category or '')].add(r.swimmer_id)

        # Group awarded medals into podiums.
        podiums = defaultdict(list)
        for m in medals:
            cat = m.result.category if m.result_id else ''
            if is_relay(m):
                # Key by the relay team's sex (M/F/X), taken from the team
                # result — not the leg swimmer's sex, which would split a
                # mixed team across two podiums.
                podiums[(m.event_id, m.result.swimmer.sex, cat, m.scope, 'R')].append(m)
            else:
                sex = m.swimmer.sex if m.swimmer_id else ''
                podiums[(m.event_id, sex, cat, m.scope, 'I')].append(m)

        lines = []
        n_gold = 0
        for (event_id, sex, cat, scope, kind), ms in sorted(
                podiums.items(), key=lambda kv: str(kv[0])):
            if kind == 'R':
                # Collapse leg medals to one placing per team.
                placings = {x.result_id: x.medal_type for x in ms}
                types = list(placings.values())
                field = len(relay_field.get((event_id, sex, cat), set())) or len(types)
            else:
                types = [x.medal_type for x in ms]
                field = len(contested.get((event_id, sex, cat), set())) or len(types)
            golds = types.count('GOLD')
            n_gold += golds
            expected = min(3, field)
            ev = ms[0].event.name if ms[0].event_id else f'event {event_id}'
            sex_label = 'mixed' if sex in ('', 'X') else sex
            label = f'{ev} [{sex_label} {cat or "open"} {scope}]'

            if golds != 1:
                lines.append(f'    {label}: {golds} golds (expected 1)')
            if len(types) < expected:
                missing = [t for t in ('GOLD', 'SILVER', 'BRONZE')
                           if t not in types][:expected - len(types)]
                lines.append(
                    f'    {label}: {len(types)} medals for a field of {field} '
                    f'— missing {", ".join(missing) or "a place"}')

        # Three-way reconciliation.
        total = len(medals)
        by_ath = sum(1 for m in medals if m.swimmer_id)
        by_country = sum(1 for m in medals if m.nationality_id)
        if by_ath != total:
            lines.append(f'    {total - by_ath} medal(s) have no swimmer')
        if by_country != total:
            lines.append(f'    {total - by_country} medal(s) have no country')

        n_podium = len(podiums)
        if n_gold != n_podium:
            lines.append(
                f'    golds ({n_gold}) != podiums ({n_podium})')

        if lines:
            self.stdout.write(self.style.WARNING(
                f'[{champ.id}] {champ.name}: {len(lines)} flag(s)'))
            for ln in lines:
                self.stdout.write(ln)
        elif not only_flagged:
            self.stdout.write(
                f'[{champ.id}] {champ.name}: OK '
                f'({total} medals, {n_podium} podiums)')
        return len(lines)
