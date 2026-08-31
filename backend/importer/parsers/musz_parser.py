"""
Parser for MÚSZ (Magyar Úszó Szövetség) live-results PDF format.

Produced by LIVE.MUSZ.HU for Hungarian championships (e.g. the
"CXXVI. ORSZÁGOS BAJNOKSÁG" at Duna Aréna).

Format characteristics:
  - Header (every page):
        CXXVI. ORSZÁGOS BAJNOKSÁG
        Duna Aréna
        2024. 04. 10., 17:00:00 (S4)
  - A national-record table is printed on the right of each event, its rows
    interleaved into the text stream (skip them):
        RESULTS Age Record Name Location Date
        adult 01:50.34 MILÁK Kristóf Budapest 2022. jún. 21.
        17 01:53.79 MILÁK Kristóf Netanya (ISR) 2017. jún. 30.
  - Event title:  "Men's 200m Butterfly" / "Men's 4x100m Medley Relay"
    (the same physical line often carries a record-table row after it)
  - Event number: "13. Event"          Round: "A Final" / "B Final" / "Final"
  - Column header: "RNK Lane Name YOB NAT Club Time Gap AQUA"
  - Individual row:
        1. 2 / 4 MILÁK Kristóf 2000 Budapesti Honvéd SE 01:54.90 885
        (rank. heat / lane  SURNAME Given  YOB  [NAT]  Club  Time [+Gap] AQUA)
      * Name is Hungarian order: SURNAME(uppercase) Given(title) -> flipped.
      * NAT is an optional 3-letter code, validated via resolve_country so a
        club that starts with 3 capitals ("UNI Győri…", "FTC") is not eaten.
      * Club can wrap onto the next line ("TURKIYE SWIMMING\nFEDERATION").
  - Per-swimmer split lines ("R.Idő 00.69 50m 24.91 …", "29.37 30.62 …",
    "Coach: …") are skipped.
  - Relay row:
        1. 1 / 4 BVSC-ZUGLÓ BVSC-Zugló 03:40.34 826
    followed by "Váltó tagok Reakció Egyéni Idő" and four leg lines:
        1. KOVÁCS Benedek Bendegúz (M1998) 00.16 55.45
"""
import re

from .base import (
    ParsedResult, ParsedEvent, ParsedMeet,
    parse_time_to_centiseconds, normalize_stroke, normalize_event_name,
    merge_duplicate_events,
)

# Standard IOC/FINA 3-letter nationality codes. Used to decide whether the
# token after a swimmer's birth year is a nationality code or the start of a
# club name — Hungarian clubs frequently begin with a 3-capital abbreviation
# ("UNI Győri…", "FTC", "KSI", "MÚSZ WA") that must NOT be read as a country.
# Kept static (not DB-backed) so the split is correct even for entrants whose
# country isn't yet in our database; downstream matching resolves the code.
IOC_CODES = frozenset("""
AFG ALB ALG AND ANG ANT ARG ARM ARU ASA AUS AUT AZE BAH BAN BAR BDI BEL BEN
BER BHU BIH BIZ BLR BOL BOT BRA BRN BRU BUL BUR CAF CAM CAN CAY CGO CHA CHI
CHN CIV CMR COD COK COL COM CPV CRC CRO CUB CYP CZE DEN DJI DMA DOM ECU EGY
ERI ESA ESP EST ETH FIJ FIN FRA FSM GAB GAM GBR GBS GEO GEQ GER GHA GRE GRN
GUA GUI GUM GUY HAI HKG HON HUN INA IND IRI IRL IRQ ISL ISR ITA IVB JAM JOR
JPN KAZ KEN KGZ KIR KOR KOS KSA KUW LAO LAT LBA LBN LBR LCA LES LIE LTU LUX
MAD MAR MAS MAW MDA MDV MEX MGL MHL MKD MLI MLT MNE MON MOZ MRI MTN MYA NAM
NCA NED NEP NGR NIG NOR NRU NZL OMA PAK PAN PAR PER PHI PLE PLW PNG POL POR
PRK PUR QAT ROU RSA RUS RWA SAM SEN SEY SGP SIN SKN SLE SLO SMR SOL SOM SRB
SRI STP SUD SUI SUR SVK SWE SWZ SYR TAN TCH TGA THA TJK TKM TLS TOG TPE TTO
TUN TUR TUV UAE UGA UKR URU USA UZB VAN VEN VIE VIN YEM ZAM ZIM
""".split())


# "Men's 200m Butterfly" / "Women's 4x100m Medley Relay" at line start.
# Stroke text stops before the interleaved record-table age number.
EVENT_TITLE = re.compile(
    r"^(Men's|Women's|Mixed)\s+"
    r"(\d+)(?:x(\d+))?m\s+"
    r"([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]*?)"
    r"(?=\s+\d|\s*$)"
)

# Individual / relay result row: "1. 2 / 4 …"
RESULT_ROW = re.compile(r'^(\d{1,3})\.\s+(\d{1,3})\s*/\s*(\d{1,3})\s+(.+)$')

# A time such as "01:54.90" or "22.15"
TIME_RE = re.compile(r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})')

# A birth year inside a result row
YEAR_RE = re.compile(r'\b(19\d{2}|20\d{2})\b')

# Relay leg: "1. KOVÁCS Benedek Bendegúz (M1998) 00.16 55.45"
RELAY_LEG = re.compile(
    r'^(\d{1,2})\.\s+(.+?)\s+\(([MW])(\d{4})\)\s+.*?'
    r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\s*$'
)

# Record-table row: "adult 01:50.34 …" or "17 01:53.79 …"
RECORD_ROW = re.compile(
    r'^(adult|\d{1,2})\s+(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\b')

# Meet date: "2024. 04. 10., 17:00:00 (S4)"
DATE_RE = re.compile(r'(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.')

ROUND_MAP = {
    'a final': 'Finals',
    'final': 'Finals',
    'b final': 'Consolation',
    'c final': 'Consolation',
}


def detect_format(text):
    """True for MÚSZ / LIVE.MUSZ.HU results PDFs."""
    if 'RNK Lane Name YOB NAT Club' in text:
        return True
    return 'ORSZÁGOS BAJNOKSÁG' in text and 'R.Idő' in text


def _format_name(raw):
    """Flip Hungarian "SURNAME Given" order to "Given SURNAME".

    The surname is the leading run of all-uppercase tokens; the given
    name(s) follow in title case. "MILÁK Kristóf" -> "Kristóf MILÁK",
    "TURNALI Polat Uzer" -> "Polat Uzer TURNALI".
    """
    tokens = raw.split()
    surname = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if any(c.isalpha() for c in tok) and tok == tok.upper():
            surname.append(tok)
            i += 1
        else:
            break
    given = tokens[i:]
    if not surname or not given:
        return raw.strip()
    return ' '.join(given) + ' ' + ' '.join(surname)


def _relay_team_name(mid):
    """Relay rows print the team name twice (uppercase then title case):
    "BVSC-ZUGLÓ BVSC-Zugló" -> "BVSC-Zugló". Fall back to the raw string."""
    toks = mid.split()
    n = len(toks)
    if n >= 2 and n % 2 == 0:
        first, second = toks[:n // 2], toks[n // 2:]
        if ' '.join(first).upper() == ' '.join(second).upper():
            return ' '.join(second)
    return mid.strip()


def _parse_individual_row(rest, event):
    """Parse the tail of an individual result row into a ParsedResult."""
    ym = YEAR_RE.search(rest)
    if not ym:
        return None
    name_raw = rest[:ym.start()].strip()
    after = rest[ym.end():].strip()
    birth_year = int(ym.group(1))

    tm = TIME_RE.search(after)
    if not tm:
        return None
    time_text = tm.group(1)
    between = after[:tm.start()].strip()
    tail = after[tm.end():]

    # Optional 3-letter nationality code, only if it resolves to a real country
    nat_code = ''
    club = between
    toks = between.split()
    if toks and toks[0] in IOC_CODES:
        nat_code = toks[0]
        club = ' '.join(toks[1:]).strip()

    fina_points = 0
    nums = re.findall(r'\d+', tail)
    if nums:
        fina_points = int(nums[-1])

    time_cs = parse_time_to_centiseconds(time_text)
    if time_cs <= 0:
        return None

    return ParsedResult(
        swimmer_name=_format_name(name_raw),
        time_text=time_text,
        time_centiseconds=time_cs,
        birth_year=birth_year,
        nationality_code=nat_code,
        club=club,
        fina_points=fina_points,
        gender=event.gender,
        round_type=event.round_type,
        event_name=event.event_name,
    )


def _parse_relay_row(rest, event):
    """Parse the tail of a relay result row into a ParsedResult."""
    tm = TIME_RE.search(rest)
    if not tm:
        return None
    time_text = tm.group(1)
    team_name = _relay_team_name(rest[:tm.start()].strip())
    tail = rest[tm.end():]
    nums = re.findall(r'\d+', tail)
    fina_points = int(nums[-1]) if nums else 0

    time_cs = parse_time_to_centiseconds(time_text)
    if time_cs <= 0 or not team_name:
        return None

    return ParsedResult(
        swimmer_name=team_name,
        time_text=time_text,
        time_centiseconds=time_cs,
        club=team_name,
        fina_points=fina_points,
        gender=event.gender,
        round_type=event.round_type,
        event_name=event.event_name,
    )


def parse(text):
    """Parse MÚSZ PDF text into a ParsedMeet."""
    lines = text.split('\n')
    meet = ParsedMeet(source_format='musz')

    for line in lines[:6]:
        s = line.strip()
        if 'ORSZÁGOS BAJNOKSÁG' in s:
            meet.meet_name = s
        elif s == 'Duna Aréna' or (s and not meet.location and 'Aréna' in s):
            meet.location = s
    for line in lines[:8]:
        dm = DATE_RE.search(line)
        if dm:
            meet.date_text = f'{dm.group(1)}-{int(dm.group(2)):02d}-{int(dm.group(3)):02d}'
            break

    current_event = None
    current_is_relay = False
    current_relay_result = None
    pending_event = None       # title seen, waiting for its round line
    pending_club_result = None  # result whose club may wrap to the next line

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        # --- structural skips (also end any club wrap) ---
        if (line.startswith('Printed:') or line.startswith('Page:') or
                line.startswith('@') or line.startswith('RESULTS Age Record') or
                line.startswith('RNK Lane Name') or line.startswith('Coach') or
                line.startswith('R.Idő') or line.startswith('Váltó tagok')):
            pending_club_result = None
            continue

        # Record-table row (interleaved on the right of the page)
        if RECORD_ROW.match(line):
            pending_club_result = None
            continue

        # --- event title ---
        tm = EVENT_TITLE.match(line)
        if tm:
            pending_club_result = None
            gender = {'women': 'F', 'mixed': 'X'}.get(
                tm.group(1).lower().rstrip("'s"), 'M')
            is_relay = tm.group(3) is not None or 'relay' in tm.group(4).lower()
            if tm.group(3):
                distance = int(tm.group(2)) * int(tm.group(3))
            else:
                distance = int(tm.group(2))
            stroke = normalize_stroke(tm.group(4))
            pending_event = {
                'gender': gender,
                'distance': distance,
                'stroke': stroke,
                'is_relay': is_relay,
                'event_name': normalize_event_name(distance, stroke, is_relay),
            }
            continue

        # --- round line -> materialize the event ---
        if line.lower() in ROUND_MAP and pending_event:
            pending_club_result = None
            ev = ParsedEvent(
                event_name=pending_event['event_name'],
                distance=pending_event['distance'],
                stroke=pending_event['stroke'],
                gender=pending_event['gender'],
                round_type=ROUND_MAP[line.lower()],
            )
            meet.events.append(ev)
            current_event = ev
            current_is_relay = pending_event['is_relay']
            current_relay_result = None
            continue

        # --- relay leg lines attach to the current relay team ---
        if current_is_relay and current_relay_result is not None:
            lm = RELAY_LEG.match(line)
            if lm:
                leg_name = _format_name(lm.group(2).strip())
                current_relay_result.split_times.append(
                    f'{leg_name} {lm.group(5)}')
                continue

        # --- result row ---
        rowm = RESULT_ROW.match(line)
        if rowm and current_event is not None:
            rest = rowm.group(4)
            if current_is_relay:
                res = _parse_relay_row(rest, current_event)
                if res:
                    res.rank = int(rowm.group(1))
                    current_event.results.append(res)
                    current_relay_result = res
                pending_club_result = None
            else:
                res = _parse_individual_row(rest, current_event)
                if res:
                    res.rank = int(rowm.group(1))
                    current_event.results.append(res)
                    pending_club_result = res
            continue

        # --- club wrap continuation (e.g. "FEDERATION") ---
        if pending_club_result is not None and any(c.isalpha() for c in line):
            extra = line.strip()
            pending_club_result.club = (
                f'{pending_club_result.club} {extra}').strip()
            pending_club_result = None
            continue

        pending_club_result = None

    meet.events = [e for e in meet.events if e.results]
    merge_duplicate_events(meet)
    return meet
