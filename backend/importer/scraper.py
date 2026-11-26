"""Scraper for Hy-Tek "Meet Results" HTML sites (ESF Egypt federation).

The federation publishes results as a Hy-Tek MM real-time HTML export:
a frameset page whose ``evtindex.htm`` lists sessions (with dates) and
one ``.htm`` page per event; each event page holds fixed-width ``<pre>``
result blocks, one per age group.

``scrape_meet(url)`` walks the whole site and returns clean rows in the
exact 16-column layout of the federation's own Excel exports — the
format the importer already fully supports — so the generated file can
be uploaded through the normal import flow (including PDF name repair).
"""
import re
import time
from html import unescape
from urllib.parse import urljoin
from urllib.request import Request, urlopen

EXCEL_COLUMNS = [
    'Event #', 'Event', 'Gender', 'Age Group', 'Distance', 'Stroke',
    'Rank', 'Name', 'Age', 'Team', 'Seed Time', 'Finals Time',
    'Points', 'Status', 'Session', 'Date',
]

_STATUS_TOKENS = {'DQ', 'NS', 'DNF', 'DNS', 'SCR', 'DFS'}
_UA = 'Mozilla/5.0 (compatible; ArabSwim results importer)'


def _fetch(url, timeout=30):
    req = Request(url, headers={'User-Agent': _UA})
    with urlopen(req, timeout=timeout) as resp:
        data = resp.read()
    for enc in ('utf-8', 'latin-1'):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode('utf-8', errors='replace')


def _strip_tags(html):
    return unescape(re.sub(r'<[^>]+>', '', html))


def _find_index_url(base_url):
    """Resolve the frameset base page to its event index page."""
    if not base_url.endswith('/'):
        # Allow passing .../results or the evtindex/frameset page itself
        if not re.search(r'\.html?$', base_url, re.I):
            base_url += '/'
    html = _fetch(base_url)
    m = re.search(r'<frame[^>]+name=["\']?index["\']?[^>]+src=["\']([^"\']+)',
                  html, re.I)
    if not m:
        m = re.search(r'src=["\']([^"\']*evtindex[^"\']*)["\']', html, re.I)
    if m:
        return urljoin(base_url, m.group(1)), html
    if 'Session' in html and re.search(r'href=["\'][^"\']+\.htm', html, re.I):
        return base_url, html  # user pasted the index page directly
    raise ValueError(
        'This does not look like a Hy-Tek meet results page '
        '(no event index found)')


def parse_event_index(html):
    """Parse evtindex.htm → (meet_name, date_text, [(href, session, date)]).

    Sessions appear as ``<h3>Session 1 - 9:00 AM<br>Tuesday 3/14/2023</h3>``
    followed by the event links of that session.
    """
    meet_name = ''
    m = re.search(r'<h2[^>]*>(.*?)</h2>', html, re.I | re.S)
    if m:
        meet_name = ' '.join(_strip_tags(m.group(1)).split())
    date_m = re.search(
        r'(\d{1,2}/\d{1,2}/\d{4})\s*-\s*(\d{1,2}/\d{1,2}/\d{4})', html)
    date_text = f'{date_m.group(1)} - {date_m.group(2)}' if date_m else ''

    links = []
    session = ''
    session_date = ''
    parts = re.split(r'(<h3>.*?</h3>|<a\s+href[^>]*>.*?</a>)', html,
                     flags=re.I | re.S)
    for part in parts:
        low = part.lower()
        if low.startswith('<h3>'):
            text = ' '.join(unescape(re.sub(r'<[^>]+>', ' ', part)).split())
            sm = re.search(r'(Session\s+\d+)', text, re.I)
            dm = re.search(r'([A-Za-z]+day\s+\d{1,2}/\d{1,2}/\d{4})', text)
            session = sm.group(1) if sm else text
            session_date = dm.group(1) if dm else session_date
        elif low.startswith('<a'):
            hm = re.search(r'href=["\']([^"\']+\.html?)["\']', part, re.I)
            if not hm:
                continue
            href = hm.group(1)
            if 'lastevt' in href.lower() or '://' in href:
                continue
            links.append((href, session, session_date))
    # Deduplicate hrefs, keep first (session-ordered) occurrence
    seen = set()
    uniq = []
    for href, sess, d in links:
        if href not in seen:
            seen.add(href)
            uniq.append((href, sess, d))
    return meet_name, date_text, uniq


_EVENT_TITLE = re.compile(
    r'Event\s+(\d+[A-Z]?)\s+(Girls|Boys|Women|Men|Mixed)\s+(.*?)\s+'
    r'(\d+)\s+(LC|SC)\s+Met[er]{2}\s+(.+)', re.I)


def _parse_event_title(line):
    """'Event 1  Girls 15 Year Olds 200 LC Meter Breaststroke' → meta dict."""
    m = _EVENT_TITLE.search(line)
    if not m:
        return None
    num, gender_w, age_group, dist, course, stroke = m.groups()
    stroke = ' '.join(stroke.split())
    dist = int(dist)
    is_relay = 'relay' in stroke.lower()
    if is_relay:
        leg = dist // 4 if dist % 4 == 0 else dist
        event_text = (f'Event {num}  {gender_w} {age_group} 4x{leg} '
                      f'{course} Meter {stroke}')
        dist = leg
    else:
        event_text = ' '.join(line.split())
    return {
        'num': num.rstrip('OABC') or num,
        'event': event_text,
        'gender': 'Female' if gender_w.lower() in ('girls', 'women') else
                  ('Male' if gender_w.lower() in ('boys', 'men') else 'Mixed'),
        'age_group': age_group.strip(),
        'distance': dist,
        'stroke': stroke,
        'is_relay': is_relay,
    }


def _split_result_line(line, is_relay):
    """One fixed-width result row → (rank, name, age, team, seed, finals, pts).

    Individual: ``  1 Janat Kareem Mo  15 SHROK   2:43.25  2:42.81  639``
    Relay:      ``  1 SMOHA  'A'            NT    4:12.95   602``
    """
    toks = line.split()
    if len(toks) < 3:
        return None
    head = toks[0]
    if not (head == '--' or head == '---' or head.lstrip('*').isdigit()):
        return None
    rank = head.lstrip('*') if head.lstrip('*').isdigit() else ''

    # Trailing numeric = points; before it: finals; before that: seed
    tail = toks[1:]
    points = ''
    if tail and tail[-1].isdigit() and not _is_timeish(tail[-1]):
        points = tail[-1]
        tail = tail[:-1]
    if len(tail) < 2 or not _is_timeish(tail[-1]):
        return None
    finals = tail[-1]
    seed = tail[-2] if _is_timeish(tail[-2]) else ''
    body = tail[:-2] if seed else tail[:-1]

    if is_relay:
        team = ' '.join(body)
        return rank, '', '', team, seed, finals, points
    # body = name tokens + age + team tokens; age = first standalone 1-2
    # digit token scanning from the end of the name section
    age = ''
    age_i = None
    for i, t in enumerate(body):
        if i > 0 and t.isdigit() and len(t) <= 2 and 5 <= int(t) <= 79:
            age, age_i = t, i
            break
    if age_i is None:
        return None
    name = ' '.join(body[:age_i])
    team = ' '.join(body[age_i + 1:])
    if not name or not team:
        return None
    return rank, name, age, team, seed, finals, points


def _is_timeish(tok):
    t = tok.upper()
    if t in _STATUS_TOKENS or t == 'NT':
        return True
    return bool(re.match(r'^[Xx]?[JB]?\d{0,2}:?\d{1,2}[.:]\d{2}$', tok))


def parse_event_page(html, session='', date=''):
    """All rows from one event page's <pre> blocks."""
    rows = []
    for pre in re.findall(r'<pre>(.*?)</pre>', html, re.I | re.S):
        meta = None
        for raw_line in _strip_tags(pre).splitlines():
            line = raw_line.rstrip()
            if not line.strip():
                continue
            title = _parse_event_title(line)
            if title:
                meta = title
                continue
            if meta is None or set(line.strip()) <= {'='}:
                continue
            low = line.lower()
            if ('name' in low or 'team' in low) and (
                    'seed' in low or 'finals' in low):
                continue  # column header line
            parsed = _split_result_line(line, meta['is_relay'])
            if not parsed:
                continue
            rank, name, age, team, seed, finals, points = parsed
            status = 'OK'
            fu = finals.upper()
            if fu in _STATUS_TOKENS:
                status, finals = ('NS' if fu == 'DNS' else fu), ''
            rows.append({
                'Event #': meta['num'],
                'Event': meta['event'],
                'Gender': meta['gender'],
                'Age Group': '' if meta['is_relay'] else meta['age_group'],
                'Distance': meta['distance'],
                'Stroke': meta['stroke'],
                'Rank': rank,
                'Name': name,
                'Age': age,
                'Team': team,
                'Seed Time': '' if seed.upper() == 'NT' else seed,
                'Finals Time': finals,
                'Points': points,
                'Status': status,
                'Session': session,
                'Date': date,
            })
    return rows


def scrape_meet(base_url, progress_cb=None, delay=0.15):
    """Scrape a whole Hy-Tek meet site → (meet_name, date_text, rows)."""
    index_url, _ = _find_index_url(base_url)
    meet_name, date_text, links = parse_event_index(_fetch(index_url))
    if not links:
        raise ValueError('No event pages found in the meet index')
    rows = []
    for i, (href, session, date) in enumerate(links):
        if progress_cb:
            progress_cb(i + 1, len(links))
        try:
            page = _fetch(urljoin(index_url, href))
        except Exception:
            continue  # single missing page shouldn't kill the scrape
        rows.extend(parse_event_page(page, session=session, date=date))
        if delay:
            time.sleep(delay)
    return meet_name, date_text, rows


def _first_int(value, default):
    m = re.search(r'\d+', str(value or ''))
    return int(m.group()) if m else default


def _finals_cs(value):
    """Finals time as centiseconds for sorting; blank/DQ sort last."""
    from .parsers.base import parse_time_to_centiseconds
    cs = parse_time_to_centiseconds(str(value or ''))
    return cs if cs > 0 else 10 ** 9


# A result is the same swim across two overlapping links when these match.
_MERGE_DEDUP_FIELDS = ('Event', 'Gender', 'Age Group', 'Name', 'Finals Time', 'Rank')


def merge_meets(parts):
    """Combine several scraped links for ONE meet into a single result set.

    ``parts`` is a list of ``(meet_name, date_text, rows)`` tuples (one per
    pasted link). Returns a single ``(meet_name, date_text, rows)`` in which
    cross-link duplicates are removed, the rows are sorted into a coherent
    program order (event → age group → rank → time), and ``Event #`` is
    renumbered so events coming from different links never collide.

    A single part is returned unchanged, so single-link scrapes behave
    exactly as before.
    """
    parts = [p for p in parts if p and p[2]]
    if not parts:
        return '', '', []
    if len(parts) == 1:
        return parts[0]

    meet_name = next((m for m, _, _ in parts if m), '')
    date_text = next((d for _, d, _ in parts if d), '')

    seen = set()
    tagged = []  # (source_link_index, row)
    for src, (_, _, rows) in enumerate(parts):
        for r in rows:
            key = tuple(str(r.get(f, '')).strip().lower() for f in _MERGE_DEDUP_FIELDS)
            if key in seen:
                continue
            seen.add(key)
            tagged.append((src, r))

    tagged.sort(key=lambda t: (
        str(t[1].get('Gender', '')),
        _first_int(t[1].get('Distance'), 0),
        str(t[1].get('Stroke', '')),
        _first_int(t[1].get('Age Group'), 999),
        _first_int(t[1].get('Rank'), 10 ** 6),
        _finals_cs(t[1].get('Finals Time')),
    ))

    # Renumber Event # per (source link, original event number), in the new
    # reading order, so merged events are unique and sequential.
    evno = {}
    out = []
    for src, r in tagged:
        ekey = (src, str(r.get('Event #', '')))
        if ekey not in evno:
            evno[ekey] = len(evno) + 1
        out.append({**r, 'Event #': evno[ekey]})
    return meet_name, date_text, out
