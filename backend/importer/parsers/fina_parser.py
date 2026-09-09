"""FINA World (Swimming) Championships "Results Summary" parser.

OMEGA/Swiss-Timing produce a very specific results book for the FINA (now
World Aquatics) World Championships — both the 50m long-course and the 25m
short-course editions. Every event is printed as a full-page "Results
Summary" (Heats / Semifinals) or "Results" (Final / Swim-Off), one page per
round, e.g.::

    Event 1   Men's 400m Freestyle Heats
    Event 101 Men's 400m Freestyle Final
    Event 204 Women's 50m Breaststroke Semifinals
    Event 404 Women's 50m Breaststroke Swim-Off

The generic ``omega_parser`` mishandles this layout: it treats the recurring
"Results Summary" banner as a skippable cross-round page (so it drops every
heat), never reads the "Date of Birth" column, and can't tell a "Swim-Off"
apart from a final (which mis-awards medals). This dedicated parser reads the
format field-by-field instead.

Two body layouts appear:

  Layout A — Heats & Semifinals ("Results Summary"), with a DOB column::

      Rank Heat Lane Name              Date of Birth NAT R.T. [50m 100m …] Time Behind Q/R/?
      1    3    4    RAPSYS Danas      21 MAY 1995   LTU 0.65             3:36.65      Q

  Layout B — Final & Swim-Off ("Results"), NAT only, no DOB::

      Rank Lane Name           NAT R.T. Time    Behind
      1    4    RAPSYS Danas   LTU 0.66  3:34.01 CR

Splits are printed inline (events up to 200m — one number per 50m between
R.T. and the final Time) or on "50m 24.34 100m 51.67 …" lines below the row
(events of 400m and longer). Relays print the country on the entry line and
one indented leg line per swimmer::

      1 2 2 United States of America 1:44.92 Q
        BAKER Kathleen 0.64 26.89 26.89   <- name RT legsplit cumulative

Round handling:
  * Heats      -> 'Heats'
  * Semifinals -> 'Semis'
  * Final      -> 'Finals'
  * Swim-Off   -> 'Semis'  (a tie-break heat, never a medal round — World
                            Aquatics rules; keeping it 'Semis' means the medal
                            engine, which only awards the Final, ignores it).

Every round is kept (``keep_prelims=True``) so heats/semis swims still count
for records, rankings and athlete profiles; only the Final decides medals.
"""
import re

from .base import (
    ParsedMeet, ParsedEvent, ParsedResult,
    parse_time_to_centiseconds, normalize_stroke, normalize_event_name,
)

SOURCE_FORMAT = 'fina_worlds'

# ---- Line patterns -------------------------------------------------------

# "Event 101 Men's 400m Freestyle Final"  /  "... 4x50m Medley Relay Heats"
EVENT_HEADER = re.compile(
    r"^Event\s+(\d+)\s+(Men's|Women's|Mixed)\s+(.+?)\s+"
    r"(Heats|Semifinals|Final|Swim-?Off)$",
    re.IGNORECASE | re.MULTILINE,
)

# Session/date line under the header: "11 DEC 2018 - 19:00 400m Nage Libre …"
DATE_LINE = re.compile(r'^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\s*-\s*\d{1,2}:\d{2}\b')

# Meet dates: "December 11 - 16, 2018"  or  "December 11 - January 5, 2019"
MEET_DATE = re.compile(
    r'^([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*(?:([A-Za-z]+)\s+)?(\d{1,2}),\s*(\d{4})')

# Location: "Hangzhou (CHN)"
LOCATION = re.compile(r'^([A-Za-z .\'-]+)\s+\(([A-Z]{3})\)\s*$')

_TIME = r'(?:\d{1,2}:)?\d{1,2}\.\d{2}'
TIME_TOKEN = re.compile(r'^' + _TIME + r'$')

# Layout A individual row (Heats/Semis): rank heat lane NAME dob NAT rt <rest>
ROW_A = re.compile(
    r'^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s+'      # rank heat lane
    r'(.+?)\s+'                                    # name
    r'(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\s+'          # date of birth
    r'([A-Z]{2,4})\s+'                              # NAT code
    r'(\d\.\d{2})\s+'                               # reaction time
    r'(.+)$'                                        # rest: [splits] time [behind] [note]
)

# Layout A status row (DSQ/DNS/…): heat lane NAME dob NAT STATUS  (no rank/rt)
ROW_A_STATUS = re.compile(
    r'^(\d{1,3})\s+(\d{1,3})\s+'
    r'(.+?)\s+'
    r'(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\s+'
    r'([A-Z]{2,4})\s+'
    r'(DSQ|DNS|DNF|NS|SCR|WDR|DID NOT START)\s*$',
    re.IGNORECASE,
)

# Layout B individual row (Final/Swim-Off): rank lane NAME NAT rt <rest>
ROW_B = re.compile(
    r'^(\d{1,3})\s+(\d{1,3})\s+'                   # rank lane
    r'(.+?)\s+'                                     # name
    r'([A-Z]{2,4})\s+'                             # NAT code
    r'(\d\.\d{2})\s+'                              # reaction time
    r'(.+)$'                                       # rest
)

# Layout B status row: rank? lane NAME NAT STATUS
ROW_B_STATUS = re.compile(
    r'^(\d{1,3})\s+'
    r'(.+?)\s+'
    r'([A-Z]{2,4})\s+'
    r'(DSQ|DNS|DNF|NS|SCR|WDR)\s*$',
    re.IGNORECASE,
)

# Relay entry line (Heats): rank heat lane COUNTRY time [behind] [note]
REL_TEAM_A = re.compile(
    r'^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s+'
    r'(.+?)\s+'
    r'(' + _TIME + r')'
    r'(?:\s+' + _TIME + r')?'
    r'(?:\s+([A-Za-z?]+))?\s*$'
)
# Relay entry line (Final): rank lane [CODE -] COUNTRY time [behind] [note]
REL_TEAM_B = re.compile(
    r'^(\d{1,3})\s+(\d{1,3})\s+'
    r'(.+?)\s+'
    r'(' + _TIME + r')'
    r'(?:\s+' + _TIME + r')?'
    r'(?:\s+([A-Za-z?]+))?\s*$'
)
# Relay team that was disqualified: leading nums, COUNTRY, STATUS
REL_TEAM_STATUS = re.compile(
    r'^(\d{1,3}\s+){1,3}(.+?)\s+(DSQ|DNS|DNF|NS|SCR|WDR)\s*$', re.IGNORECASE)

# Relay leg line: NAME rt legsplit [(place)] cumulative
REL_LEG = re.compile(
    r'^(.+?)\s+(\d\.\d{2})\s+(' + _TIME + r')'
    r'(?:\s+\(=?\d+\))?\s+(' + _TIME + r')\s*$'
)

# A "50m 24.34 100m 51.67 …" cumulative-split line (Final adds a "(1)" place)
SPLIT_LABEL = re.compile(r'(\d{2,4})m\s+(?:\(=?\d+\)\s+)?(' + _TIME + r')')

_MONTHS = {'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
           'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12}
_MONTH_NAMES = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
    'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11,
    'december': 12,
}

_ROUND_MAP = {
    'heats': 'Heats',
    'semifinals': 'Semis',
    'final': 'Finals',
    'swim-off': 'Semis',
    'swimoff': 'Semis',
}

_NOTE_TOKENS = {
    'Q', 'R', '?', 'CR', 'WR', 'WJ', 'NR', 'AR', 'OR', 'ER', 'WC', '=',
    'DNS', 'DNF', 'DSQ', 'NS',
}


def detect_format(text):
    """True for the OMEGA FINA World Championships Results-Summary book.

    Keyed on the tight combination that only this format carries: an OMEGA
    footer, a per-round header ("Event N Men's … Final/Heats/Semifinals"),
    the "Date of Birth" heats column and the "Event Number" sub-header. This
    is deliberately narrow so ordinary OMEGA meets keep using omega_parser.
    """
    lower = text.lower()
    if 'report created by omega' not in lower:
        return False
    if 'date of birth' not in lower or 'event number' not in lower:
        return False
    return bool(EVENT_HEADER.search(text))


def _iso_from_dmy(day, mon3, year):
    m = _MONTHS.get(mon3.upper())
    if not m:
        return ''
    return f'{int(year):04d}-{m:02d}-{int(day):02d}'


def _parse_event_title(title):
    """('4x50m Medley Relay') -> (distance, stroke, is_relay). distance is the
    full relay distance (4x50 -> 200) so normalize_event_name derives legs."""
    relay = bool(re.search(r'relay', title, re.IGNORECASE))
    mrel = re.search(r'(\d+)\s*x\s*(\d+)\s*m', title, re.IGNORECASE)
    if mrel:
        distance = int(mrel.group(1)) * int(mrel.group(2))
        stroke_text = title[mrel.end():]
    else:
        mind = re.search(r'(\d+)\s*m', title)
        distance = int(mind.group(1)) if mind else 0
        stroke_text = title[mind.end():] if mind else title
    stroke = normalize_stroke(stroke_text)
    return distance, stroke, relay


def _split_rest(rest, n_inline):
    """Split the tail after R.T. into (split_cumulatives, time_text, status).

    ``rest`` looks like "[s1 s2 …] TIME [BEHIND] [NOTE…]". Trailing note
    tokens (Q, R, CR, WR, ?, …) are stripped first; the remaining numeric
    time tokens are then n_inline cumulative splits, the final time, and an
    optional "behind" gap (absent for the leader)."""
    tokens = rest.split()
    # Strip trailing non-time note tokens.
    while tokens and not TIME_TOKEN.match(tokens[-1]):
        tokens.pop()
    if not tokens:
        return [], '', ''
    times = [t for t in tokens if TIME_TOKEN.match(t)]
    if len(times) >= n_inline + 2:
        splits = times[:n_inline]
        time_text = times[n_inline]        # then a "behind" gap follows
    elif len(times) >= n_inline + 1:
        splits = times[:n_inline]
        time_text = times[n_inline]
    else:
        # Fewer numbers than expected (rare extraction hiccup): last is time.
        splits = times[:-1]
        time_text = times[-1]
    return splits, time_text, 'OK'


def parse(text):
    meet = ParsedMeet(source_format=SOURCE_FORMAT, keep_prelims=True)
    meet.pool = 'SCM'  # default; detector overrides from filename/title

    lines = text.split('\n')

    # ---- meet metadata (first occurrences) ----
    for ln in lines[:40]:
        s = ln.strip()
        if not meet.meet_name and 'championships' in s.lower():
            meet.meet_name = s
        if not meet.location:
            mloc = LOCATION.match(s)
            if mloc and 'championship' not in s.lower():
                meet.location = s
        if not meet.date_text:
            md = MEET_DATE.match(s)
            if md:
                mon1 = _MONTH_NAMES.get(md.group(1).lower())
                mon2 = _MONTH_NAMES.get((md.group(3) or md.group(1)).lower())
                year = int(md.group(5))
                if mon1:
                    meet.date_text = f'{year:04d}-{mon1:02d}-{int(md.group(2)):02d}'
                if mon2:
                    # end month may roll into the next year (Dec–Jan meets)
                    end_year = year
                    meet.date_end = f'{end_year:04d}-{mon2:02d}-{int(md.group(4)):02d}'
        if 'lcm' in s.lower() or '(50m)' in s.lower():
            meet.pool = 'LCM'
        if '(25m)' in s.lower() or 'scm' in s.lower():
            meet.pool = 'SCM'

    events = {}          # key -> ParsedEvent
    cur = None           # dict describing the event/round currently being read
    last_result = None   # last individual/relay result (for below-row splits)
    last_team = None      # last relay team result (for leg lines)

    def get_event(distance, stroke, gender, relay, round_type, date_text):
        name = normalize_event_name(distance, stroke, relay)
        key = (name, gender, round_type)
        ev = events.get(key)
        if ev is None:
            ev = ParsedEvent(
                event_name=name, distance=distance, stroke=stroke,
                gender=gender, round_type=round_type, date_text=date_text,
            )
            events[key] = ev
            meet.events.append(ev)
        elif date_text and not ev.date_text:
            ev.date_text = date_text
        return ev

    for ln in lines:
        s = ln.strip()
        if not s:
            continue

        # -- event/round header --
        mh = EVENT_HEADER.match(s)
        if mh:
            gender = {'men': 'M', 'women': 'F', 'mixed': 'X'}[
                mh.group(2).split("'")[0].lower()]
            distance, stroke, relay = _parse_event_title(mh.group(3))
            round_word = mh.group(4).lower().replace('swimoff', 'swim-off')
            round_type = _ROUND_MAP.get(round_word, 'Finals')
            # Layout follows the printed body, not the medal round: Heats and
            # Semifinals carry a DOB column (Layout A); Final and Swim-Off do
            # not (Layout B). Swim-Off maps to the 'Semis' medal round but is
            # still a Layout-B page, so track the two independently.
            layout = 'A' if round_word in ('heats', 'semifinals') else 'B'
            cur = {
                'distance': distance, 'stroke': stroke, 'gender': gender,
                'relay': relay, 'round_type': round_type, 'layout': layout,
                'date': '', 'ev': None,
                'n_inline': (distance // 50 - 1) if (0 < distance <= 200
                                                     and not relay) else 0,
            }
            last_result = last_team = None
            continue

        if cur is None:
            continue

        # -- per-event session date --
        md = DATE_LINE.match(s)
        if md and not cur['date']:
            cur['date'] = _iso_from_dmy(md.group(1), md.group(2), md.group(3))
            continue

        # Skip the world/championship-record reference lines and legends.
        if re.match(r'^(WR|CR|WJ|WC|AR|NR|OR|ER)\b', s):
            continue
        if s.startswith('Legend:') or s.startswith('Official Timekeeping'):
            continue

        def ev():
            if cur['ev'] is None:
                cur['ev'] = get_event(cur['distance'], cur['stroke'],
                                      cur['gender'], cur['relay'],
                                      cur['round_type'], cur['date'])
            return cur['ev']

        # -- relay (team entry line + indented leg lines) --
        if cur['relay']:
            leg = REL_LEG.match(s)
            if leg and last_team is not None and not s[0].isdigit():
                name = leg.group(1).strip()
                legsplit = leg.group(3)
                last_team.split_times.append(f'{name} {legsplit}')
                continue
            tmatch = (REL_TEAM_A if cur['layout'] == 'A'
                      else REL_TEAM_B).match(s)
            # Fall back to the other arity if the primary didn't fit.
            if not tmatch:
                tmatch = (REL_TEAM_B if cur['layout'] == 'A'
                          else REL_TEAM_A).match(s)
            if tmatch and s[0].isdigit():
                groups = tmatch.groups()
                country = groups[-3].strip()
                time_text = groups[-2]
                rank = int(tmatch.group(1))
                code, cname = _split_country(country)
                res = ParsedResult(
                    swimmer_name=cname, time_text=time_text,
                    time_centiseconds=parse_time_to_centiseconds(time_text),
                    event_name=ev().event_name, gender=cur['gender'],
                    rank=rank, nationality_code=code, club=cname,
                    round_type=cur['round_type'],
                )
                ev().results.append(res)
                last_team = res
                last_result = res
                continue
            st = REL_TEAM_STATUS.match(s)
            if st and s[0].isdigit():
                country = st.group(2).strip()
                code, cname = _split_country(country)
                res = ParsedResult(
                    swimmer_name=cname, time_text='', time_centiseconds=0,
                    event_name=ev().event_name, gender=cur['gender'],
                    nationality_code=code, club=cname,
                    round_type=cur['round_type'],
                    status=st.group(3).upper()[:3],
                )
                ev().results.append(res)
                last_team = res
                last_result = res
                continue
            continue  # ignore other lines inside a relay page

        # -- individual --
        ra = ROW_A.match(s)
        if ra and cur['layout'] == 'A':
            name = ra.group(4).strip()
            birth_year = int(ra.group(7))
            nat = ra.group(8)
            splits, time_text, _ = _split_rest(ra.group(10), cur['n_inline'])
            res = ParsedResult(
                swimmer_name=name, time_text=time_text,
                time_centiseconds=parse_time_to_centiseconds(time_text),
                event_name=ev().event_name, gender=cur['gender'],
                rank=int(ra.group(1)), birth_year=birth_year,
                nationality_code=nat, round_type=cur['round_type'],
                split_times=[f'{d}m {t}' for d, t in _label_splits(
                    splits, cur['distance'])],
            )
            ev().results.append(res)
            last_result = res
            continue

        rb = ROW_B.match(s)
        if rb and cur['layout'] == 'B' and not cur['relay']:
            name = rb.group(3).strip()
            nat = rb.group(4)
            splits, time_text, _ = _split_rest(rb.group(6), cur['n_inline'])
            res = ParsedResult(
                swimmer_name=name, time_text=time_text,
                time_centiseconds=parse_time_to_centiseconds(time_text),
                event_name=ev().event_name, gender=cur['gender'],
                rank=int(rb.group(1)), nationality_code=nat,
                round_type=cur['round_type'],
                split_times=[f'{d}m {t}' for d, t in _label_splits(
                    splits, cur['distance'])],
            )
            ev().results.append(res)
            last_result = res
            continue

        # -- status rows (DSQ/DNS) --
        sa = ROW_A_STATUS.match(s)
        if sa and cur['layout'] == 'A':
            res = ParsedResult(
                swimmer_name=sa.group(3).strip(), time_text='',
                time_centiseconds=0, event_name=ev().event_name,
                gender=cur['gender'], birth_year=int(sa.group(6)),
                nationality_code=sa.group(7), round_type=cur['round_type'],
                status=sa.group(8).upper()[:3],
            )
            ev().results.append(res)
            last_result = None
            continue
        sb = ROW_B_STATUS.match(s)
        if sb and cur['layout'] == 'B':
            res = ParsedResult(
                swimmer_name=sb.group(2).strip(), time_text='',
                time_centiseconds=0, event_name=ev().event_name,
                gender=cur['gender'], nationality_code=sb.group(3),
                round_type=cur['round_type'], status=sb.group(4).upper()[:3],
            )
            ev().results.append(res)
            last_result = None
            continue

        # -- below-row cumulative splits (400m+ events) --
        if last_result is not None and SPLIT_LABEL.search(s) and s[0].isdigit():
            for d, t in SPLIT_LABEL.findall(s):
                last_result.split_times.append(f'{int(d)}m {t}')
            continue

    _dedupe_splits(meet)
    return meet


def _split_country(text):
    """('USA - United States of America') -> ('USA', 'United States of America').
    A bare country name returns ('', name)."""
    m = re.match(r'^([A-Z]{2,4})\s*-\s*(.+)$', text)
    if m:
        return m.group(1), m.group(2).strip()
    return '', text.strip()


def _label_splits(cumulative_times, distance):
    """Attach a 50m-multiple distance label to each inline cumulative split."""
    out = []
    for i, t in enumerate(cumulative_times):
        out.append((50 * (i + 1), t))
    return out


def _dedupe_splits(meet):
    """A 50m individual event has no meaningful split; drop any captured."""
    for ev in meet.events:
        if ev.distance and ev.distance <= 50 and not ev.round_type.endswith('Relay'):
            for r in ev.results:
                r.split_times = []
