"""Saudi Swimming Federation scraper → standard Individual/Relay Excel.

Self-contained port of the repo-root scrape_saudi.py (parsers/fetch) and
build_saudi_missing.py (conversion to the standard 2-sheet import format),
so it runs on the deployed backend without those local scripts.

Crawls https://saudiswmmingfederation.com/vue_resultats_ssf/ drilling
    year -> competition -> styles(round+gender) -> categories -> result rows
         -> per-swimmer detail page.

The public entry points used by the view layer are:
    latest_saudi_national_date()   -> cutoff date (last KSA national meet in DB)
    find_new_comps(cutoff, cb)     -> competitions dated after the cutoff
    crawl_meet(comp)               -> (individual_records, relay_records)
    IND_COLS / REL_COLS            -> column order for the output workbook
"""
import concurrent.futures as cf
import gzip
import re
import time
import urllib.parse
import urllib.request
from collections import OrderedDict
from datetime import date

from bs4 import BeautifulSoup

BASE = "https://saudiswmmingfederation.com"
LIST_PATH = "/vue_resultats_ssf/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

TIME_RE = re.compile(r"\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2}")
ROUND_LABEL = {"2": "Prelim", "9": "Final", "1": "TimedFinal"}
GENDER_LABEL = {"1": "Men", "2": "Women"}


# --------------------------------------------------------------------------- #
# Fetching (network only — the deployed filesystem is ephemeral)
# --------------------------------------------------------------------------- #
def fetch(url, retries=3, delay=0.2):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept-Encoding": "gzip",
                "Accept-Language": "en,ar;q=0.8",
            })
            raw = urllib.request.urlopen(req, timeout=45).read()
            try:
                raw = gzip.decompress(raw)
            except OSError:
                pass
            html = raw.decode("utf-8", "replace")
            time.sleep(delay)
            return html
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(delay * (attempt + 1) * 2)
    if last:
        raise last
    return ""


def abs_url(href):
    return href if href.startswith("http") else BASE + href


def qs(url):
    return {k: v[0] for k, v in urllib.parse.parse_qs(
        urllib.parse.urlparse(url).query).items()}


# --------------------------------------------------------------------------- #
# Parsers
# --------------------------------------------------------------------------- #
def parse_competitions(html):
    soup = BeautifulSoup(html, "html.parser")
    out, seen = [], set()
    for a in soup.select("main a[href]"):
        href = a.get("href", "")
        if "competition=" not in href or "action=" in href:
            continue
        p = qs(abs_url(href))
        key = (p.get("competition"), p.get("date"), p.get("lieu"))
        if key in seen or not p.get("competition"):
            continue
        seen.add(key)
        out.append({
            "competition": p.get("competition", ""),
            "date": p.get("date", ""),
            "lieu": p.get("lieu", ""),
            "url": abs_url(href),
        })
    return out


def parse_styles(html):
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for a in soup.select("main a[href]"):
        href = a.get("href", "")
        if "style=" not in href or "round=" not in href or "category=" in href:
            continue
        p = qs(abs_url(href))
        out.append({
            "style": p.get("style", ""),
            "round": p.get("round", ""),
            "gender": p.get("gender", ""),
            "label": a.get_text(" ", strip=True),
            "url": abs_url(href),
        })
    return out


def parse_categories(html):
    soup = BeautifulSoup(html, "html.parser")
    out, seen = [], set()
    for a in soup.select("main a[href]"):
        href = a.get("href", "")
        if "category=" not in href or "swimmer=" in href:
            continue
        p = qs(abs_url(href))
        cat = p.get("category", "")
        if cat in seen:
            continue
        seen.add(cat)
        out.append({
            "category": cat,
            "label": a.get_text(" ", strip=True),
            "url": abs_url(href),
        })
    return out


def parse_result_rows(html):
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for a in soup.select("main a[href]"):
        href = a.get("href", "")
        if "swimmer=" not in href:
            continue
        p = qs(abs_url(href))
        text = a.get_text(" ", strip=True)
        toks = text.split()
        rank = toks[0] if toks and toks[0].isdigit() else ""
        club_code = toks[-1] if toks else ""
        out.append({
            "rank": rank,
            "club_code": club_code,
            "swimmer_id": p.get("swimmer", ""),
            "row_text": text,
            "url": abs_url(href),
        })
    return out


DETAIL_KEYS = OrderedDict([
    ("Name :", "name_en"),
    ("الاسم كامل/Name :", "name_ar"),
    ("الجنس/Gender :", "gender"),
    ("الجنسية/Nationality :", "nationality"),
    ("تاريخ الميلاد/Date of birth :", "dob"),
    ("النادي/Club :", "club_name"),
    ("تاريخ البطولة/Competition date :", "comp_date"),
    ("المسبح/Pool :", "pool"),
    ("رقم اللاعب/Affiliation number :", "affiliation"),
    ("السباق/Swimming style :", "style"),
    ("الحارة/Lane :", "lane"),
    ("التصفية/Heat :", "heat"),
    ("نقاط الفينا/FINA Points :", "fina_points"),
    ("المعامل/Coefficient :", "coefficient"),
    ("مجموع النقط/Total points :", "total_points"),
    ("الزمن المحقق/Time achieved :", "time"),
    ("زمن التسجيل/Entry Time :", "entry_time"),
    ("نقاط الخصم/Discount points :", "discount_points"),
    ("فارق الزمن/Time difference :", "time_diff"),
])


def parse_swimmer_detail(html):
    soup = BeautifulSoup(html, "html.parser")
    data = {v: "" for v in DETAIL_KEYS.values()}
    for li in soup.select("main li"):
        st = li.find("strong")
        if not st:
            continue
        label = st.get_text(strip=True)
        key = DETAIL_KEYS.get(label)
        if not key:
            continue
        val = li.get_text(" ", strip=True)
        if val.startswith(label):
            val = val[len(label):]
        data[key] = val.strip()
    return data


# --------------------------------------------------------------------------- #
# Conversion to the standard Individual/Relay Excel format
# --------------------------------------------------------------------------- #
STROKE = {
    'freestyle': 'Freestyle', 'backstroke': 'Backstroke',
    'breaststroke': 'Breaststroke', 'butterfly': 'Butterfly', 'medley': 'IM',
}
STROKE_RELAY = dict(STROKE, medley='Medley')

NAT_MAP = {
    'EG': 'EGY', 'JO': 'JOR', 'SY': 'SYR', 'TN': 'TUN', 'TR': 'TUR',
    'US': 'USA', 'SA': 'KSA', 'BH': 'BRN', 'QA': 'QAT', 'LB': 'LBN',
    'PS': 'PLE', 'SD': 'SUD', 'MA': 'MAR', 'DZ': 'ALG', 'YE': 'YEM',
    'IQ': 'IRQ', 'KW': 'KUW', 'OM': 'OMA', 'AE': 'UAE',
    'GB': 'GBR', 'FR': 'FRA', 'ES': 'ESP', 'IT': 'ITA', 'DE': 'GER',
    'NL': 'NED', 'PT': 'POR', 'PL': 'POL', 'SE': 'SWE', 'DK': 'DEN',
    'FI': 'FIN', 'NO': 'NOR', 'CZ': 'CZE', 'SK': 'SVK', 'RO': 'ROU',
    'RS': 'SRB', 'RU': 'RUS', 'GR': 'GRE', 'IE': 'IRL', 'AT': 'AUT',
    'BE': 'BEL', 'LT': 'LTU', 'HU': 'HUN', 'CH': 'SUI', 'UA': 'UKR',
    'CA': 'CAN', 'BR': 'BRA', 'AR': 'ARG', 'MX': 'MEX', 'CO': 'COL',
    'VE': 'VEN', 'CL': 'CHI', 'PE': 'PER',
    'CN': 'CHN', 'JP': 'JPN', 'KR': 'KOR', 'IN': 'IND', 'PK': 'PAK',
    'BD': 'BAN', 'TH': 'THA', 'VN': 'VIE', 'PH': 'PHI', 'MY': 'MAS',
    'SG': 'SGP', 'LK': 'SRI', 'KZ': 'KAZ', 'MN': 'MGL', 'AF': 'AFG',
    'BT': 'BHU', 'AU': 'AUS', 'NZ': 'NZL', 'ZA': 'RSA',
}

CAT_MAP = {
    '7_8': '7-8 Years', '9_10': '9-10 Years', '11_12': '11-12 Years',
    '13_14': '13-14 Years', '15_17': '15-17 Years', '18_99': 'Open',
}
ROUND_MAP = {'1': 'Timed Final', '2': 'Heats', '9': 'Final'}
MEDAL = {1: 'Gold', 2: 'Silver', 3: 'Bronze'}
STATUS_RE = re.compile(r'\b(DQ|DNS|DNF|DNQ|NT|WD|SCR)\b', re.I)

IND_COLS = ['Events', 'Classification', 'Sub-Classification', 'Category',
            'Round', 'Medal', 'Swimmer Name', 'Club', 'Time', 'YoB', 'DoB',
            'Nationality', 'Gender', 'Pool', 'Championships Name',
            'Meet City', 'Meet Country', 'Date']
REL_COLS = ['Events', 'Relay', 'Classification', 'Sub-Classification',
            'Category', 'Round', 'Medal', 'Team Time', 'Team Name',
            'Swimmer Name', 'Split Time', 'YoB', 'DoB', 'Nationality',
            'Gender', 'Pool', 'Championships Name', 'Meet City',
            'Meet Country', 'Date']


def nat(code):
    c = str(code or '').strip().upper()
    if len(c) == 2 and c in NAT_MAP:
        return NAT_MAP[c]
    return c or 'KSA'


def fmt_time(detail_time, row_text):
    """Return Excel-style time ('36.74', '2:37.68') or a status ('DQ','NT')."""
    t = (detail_time or '').strip()
    m = TIME_RE.search(t)
    if not m:
        m = TIME_RE.search(row_text or '')
    if m:
        tok = m.group(0)
        if ':' in tok:
            mm, rest = tok.split(':', 1)
            mm = mm.lstrip('0')
            out = rest if mm == '' else f'{mm}:{rest}'
        else:
            out = tok
        if re.fullmatch(r'0*[:.]?0*\.00', out) or float(re.sub(r'[:.]', '', out) or 0) == 0:
            return 'NT'
        return out
    st = STATUS_RE.search(row_text or '')
    if st and st.group(1).upper() == 'DQ':
        return 'DQ'
    return 'NT'


def is_relay(style):
    s = style.lower()
    return s.startswith('4 x') or s.startswith('4x') or 'relay' in s


def event_name(style):
    """'50m Freestyle' -> '50 M Freestyle'; '4 x 100m Medley' -> '4×100 M Medley Relay'."""
    s = style.strip()
    if is_relay(s):
        m = re.search(r'(\d+)\s*[xX]\s*(\d+)\s*m\s*([A-Za-z]+)', s)
        if m:
            legs, dist, stroke = m.groups()
            return f'{legs}×{dist} M {STROKE_RELAY.get(stroke.lower(), stroke.title())} Relay'
        return s
    m = re.match(r'(\d+)\s*m\s*([A-Za-z]+)', s)
    if m:
        dist, stroke = m.groups()
        return f'{dist} M {STROKE.get(stroke.lower(), stroke.title())}'
    return s


def category_name(cat_code, cat_label, gw):
    code = CAT_MAP.get(cat_code)
    if not code:
        lab = (cat_label or '').replace(' - ', '-').replace('years', 'Years').strip()
        code = re.sub(r'\s+', ' ', lab) or (cat_code or '')
    prefix = "Men's" if gw == 'Men' else "Women's"
    return f'{prefix} {code}'


def gender_word(code):
    return GENDER_LABEL.get(code, 'Men')


def pool_label(pool):
    p = str(pool or '').strip()
    if p.startswith('25'):
        return 'SCM'
    if p.startswith('50'):
        return 'LCM'
    return ''


def crawl_meet(comp, workers=8):
    """Return (individual_records, relay_records) for one competition."""
    cr_url = comp['url'] + '&action=competition_result'
    styles = parse_styles(fetch(cr_url))
    ind_recs, rel_recs = [], []

    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        leaf_jobs = []
        for st, cats in zip(styles, ex.map(
                lambda s: parse_categories(fetch(s['url'])), styles)):
            if not cats:
                cats = [{'category': '', 'label': '', 'url': st['url']}]
            for cat in cats:
                leaf_jobs.append((st, cat))

        row_jobs = []
        for (st, cat), rows in zip(leaf_jobs, ex.map(
                lambda j: parse_result_rows(fetch(j[1]['url'])), leaf_jobs)):
            for row in rows:
                row_jobs.append((st, cat, row))

        def handle(job):
            st, cat, row = job
            return st, cat, row, parse_swimmer_detail(fetch(row['url']))

        meta = dict(
            champ=comp['competition'].strip().title(),
            city=comp['lieu'].strip().title(),
            country='Saudi Arabia',
            date='/'.join(reversed(comp['date'].split('-'))),  # DD/MM/YYYY
        )
        for st, cat, row, detail in ex.map(handle, row_jobs):
            if not detail.get('time') and not detail.get('club_name'):
                continue
            gw = gender_word(st['gender']) if st['gender'] in GENDER_LABEL \
                else ('Women' if detail.get('gender') == 'F' else 'Men')
            gender_excel = 'Male' if gw == 'Men' else 'Female'
            rnd = ROUND_MAP.get(st['round'], 'Timed Final')
            ev = event_name(detail.get('style') or st['style'])
            cat_excel = category_name(cat['category'], cat['label'], gw)
            tval = fmt_time(detail.get('time'), row['row_text'])
            rank = int(row['rank']) if str(row['rank']).isdigit() else None
            valid = tval not in ('DQ', 'DNS', 'DNF', 'DNQ', 'NT', 'WD', 'SCR')
            medal = MEDAL.get(rank) if (valid and rnd in ('Timed Final', 'Final')) else None
            dob = detail.get('dob', '')
            yob = dob[:4] if len(dob) >= 4 and dob[:4].isdigit() else ''

            if is_relay(detail.get('style') or st['style']):
                rel_recs.append({
                    'Events': ev,
                    'Relay': "Men's" if gw == 'Men' else "Women's",
                    'Classification': 'National',
                    'Sub-Classification': 'Saudi Arabia',
                    'Category': cat_excel,
                    'Round': rnd,
                    'Medal': medal,
                    'Team Time': tval,
                    'Team Name': detail.get('club_name', ''),
                    'Swimmer Name': None,
                    'Split Time': None,
                    'YoB': None,
                    'DoB': None,
                    'Nationality': nat(detail.get('nationality')),
                    'Gender': gender_excel,
                    'Pool': pool_label(detail.get('pool')),
                    'Championships Name': meta['champ'],
                    'Meet City': meta['city'],
                    'Meet Country': meta['country'],
                    'Date': meta['date'],
                })
            else:
                ind_recs.append({
                    'Events': ev,
                    'Classification': 'National',
                    'Sub-Classification': 'Saudi Arabia',
                    'Category': cat_excel,
                    'Round': rnd,
                    'Medal': medal,
                    'Swimmer Name': detail.get('name_en', ''),
                    'Club': detail.get('club_name', ''),
                    'Time': tval,
                    'YoB': yob,
                    'DoB': dob,
                    'Nationality': nat(detail.get('nationality')),
                    'Gender': gender_excel,
                    'Pool': pool_label(detail.get('pool')),
                    'Championships Name': meta['champ'],
                    'Meet City': meta['city'],
                    'Meet Country': meta['country'],
                    'Date': meta['date'],
                })
    return ind_recs, rel_recs


# --------------------------------------------------------------------------- #
# Cutoff + new-meet discovery
# --------------------------------------------------------------------------- #
def latest_saudi_national_date():
    """Date of the most recent Saudi national meet already in the DB.

    Used as the cutoff: only meets dated strictly after this are scraped.
    Falls back to the latest KSA meet of any classification, then None.
    """
    from championships.models import Championship
    base = Championship.objects.filter(country__code='KSA')
    national = base.filter(classification__name__iexact='National').order_by('-date').first()
    if national:
        return national.date
    any_ksa = base.order_by('-date').first()
    return any_ksa.date if any_ksa else None


def _parse_site_date(s):
    try:
        y, m, d = str(s).split('-')
        return date(int(y), int(m), int(d))
    except (ValueError, AttributeError):
        return None


def find_new_comps(cutoff, progress_cb=None):
    """Competitions on the SSF site dated strictly after ``cutoff``.

    Scans year listing pages from the current year back to the cutoff's year
    (or just the current year when there's no cutoff yet).
    """
    this_year = date.today().year
    first_year = cutoff.year if cutoff else this_year
    out = []
    for year in range(this_year, first_year - 1, -1):
        if progress_cb:
            progress_cb(f'Scanning {year} competitions…')
        comps = parse_competitions(fetch(f'{BASE}{LIST_PATH}?annee={year}'))
        for c in comps:
            d = _parse_site_date(c.get('date'))
            if d is None:
                continue
            if cutoff is None or d > cutoff:
                c['_date'] = d
                out.append(c)
    out.sort(key=lambda c: c['_date'])
    for c in out:
        c.pop('_date', None)
    return out
