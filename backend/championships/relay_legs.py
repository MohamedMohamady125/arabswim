"""Link the names printed on a relay to the swimmers' profiles.

A relay result stores its squad as a list of legs ({name, split_time, …}).
The medal each athlete earns, the relay on their profile and the link on the
meet page all depend on knowing WHICH profile a leg is. Results sheets print
the same person differently on a relay and on an individual race — HY-TEK
relays shorten middle names to an initial ("Sari T ARBAEIN" for the profile
"Sari TURKI ARBAEIN") or drop them ("Fatma DOUMA" for "Fatma Ezzahra DOUMA")
— so an exact name comparison silently loses the athlete's relay medal.

`link_relay_legs` resolves every leg once and writes the profile id onto the
leg (`swimmer_id`), which is what the profile, the medals and the meet page
read first. A leg that already carries an id (matched by hand) is never
changed.
"""
import re

from swimmers.models import Swimmer


def _parts(name):
    """Upper-cased name words; punctuation is a word break."""
    return re.sub(r'[^\w\s]', ' ', (name or '').upper()).split()


def _middles_fit(short, long):
    """Every word of `short` appears, in order, in `long` — a single letter
    stands for a word that starts with it."""
    i = 0
    for word in short:
        while i < len(long):
            other = long[i]
            i += 1
            if word == other or (len(word) == 1 and len(other) > 1 and other.startswith(word)):
                break
        else:
            return False
    return True


def names_fit(leg_name, profile_name):
    """True when a relay-sheet name is a shortened form of a profile name:
    same first and last word, and the middle words agree — initials stand for
    full middle names, and middle names may be left out on the relay sheet.
    The profile may only be the shorter one when the extra words on the sheet
    are bare initials."""
    a, b = _parts(leg_name), _parts(profile_name)
    if len(a) < 2 or len(b) < 2 or len(a[0]) < 2 or len(a[-1]) < 2:
        return False
    if a[0] != b[0] or a[-1] != b[-1]:
        return False
    am, bm = a[1:-1], b[1:-1]
    if len(am) <= len(bm):
        return _middles_fit(am, bm)
    # the sheet has more middle words than the profile: each of the sheet's
    # words must be on the profile or be a bare initial
    extra_ok = all(len(w) == 1 or w in bm for w in am)
    return extra_ok and _middles_fit(bm, [w for w in am if len(w) > 1])


def _age_range(category):
    """(low, high) ages named by a category such as "Boy's 13-14", "19+" or
    "19 and above" (high is None for an "and over" group)."""
    from core.age_categories import age_range
    return age_range(category)


def _age_fits(swimmer, age_range, year, must_know=False):
    """A known birth year must agree with the relay's age category (one year
    of slack: categories are set by year of birth, ages by birthday).
    `must_know`: when the relay names an age category, a swimmer with no
    birth year on file does not fit."""
    born = swimmer.birth_year or (swimmer.date_of_birth.year if swimmer.date_of_birth else None)
    if not age_range or not year:
        return True
    if not born:
        return not must_know
    low, high = age_range
    age = year - born
    return age >= low - 1 and (high is None or age <= high + 1)


def _exact(name, nationality_id):
    """Same name, or the same words in another order ("Adam Hamza ERRAFIY"
    on the relay, "Hamza Adam ERRAFIY" on the profile). The relay's country
    is preferred when several swimmers share a name."""
    qs = Swimmer.objects.filter(is_relay_team=False, name__iexact=name)
    if nationality_id:
        match = qs.filter(nationality_id=nationality_id).first()
        if match:
            return match
    match = qs.first()
    if match:
        return match
    words = frozenset(w for w in _parts(name) if any(c.isalpha() for c in w))
    if len(words) < 2:
        return None
    cand = Swimmer.objects.filter(is_relay_team=False)
    for w in words:
        cand = cand.filter(name__icontains=w)
    if nationality_id:
        cand = cand.filter(nationality_id=nationality_id)
    for s in cand[:12]:
        if frozenset(w for w in _parts(s.name) if any(c.isalpha() for c in w)) == words:
            return s
    return None


class LegResolver:
    """Resolves relay leg names for one championship.

    Order of trust:
      1. the id already on the leg (matched by hand at import);
      2. the exact name (any word order);
      3. a shortened form of exactly one swimmer of the same country who
         swam at this meet — the squad is small, so this is safe;
      4. failing that, a shortened form of exactly one swimmer of that
         country anywhere on the site.
    Steps 3 and 4 also require the right sex (unless the relay is mixed) and
    a birth year that agrees with the relay's age category (step 4 needs the
    birth year to be on file when the relay names a category). Two candidates
    means no match: a medal is never given on a guess.
    """

    def __init__(self, championship):
        self.championship = championship
        d = championship.date
        self.year = getattr(d, 'year', None) or (int(str(d)[:4]) if str(d or '')[:4].isdigit() else None)
        self._squads = None
        self._cache = {}

    def _squad(self, nationality_id):
        if self._squads is None:
            self._squads = {}
            rows = (self.championship.results
                    .filter(swimmer__is_relay_team=False)
                    .select_related('swimmer'))
            seen = set()
            for r in rows:
                nat = r.nationality_id or r.swimmer.nationality_id
                if (nat, r.swimmer_id) in seen:
                    continue
                seen.add((nat, r.swimmer_id))
                self._squads.setdefault(nat, []).append(r.swimmer)
        return self._squads.get(nationality_id, [])

    def _pick(self, candidates, name, sex, age_range, must_know_age=False):
        hits = {}
        for s in candidates:
            if sex in ('M', 'F') and s.sex in ('M', 'F') and s.sex != sex:
                continue
            if not names_fit(name, s.name):
                continue
            if not _age_fits(s, age_range, self.year, must_know_age):
                continue
            hits[s.id] = s
        return hits

    def resolve(self, leg, result):
        """The Swimmer for one leg of `result`, or None."""
        if isinstance(leg, dict):
            name = (leg.get('name') or '').strip()
            sid = leg.get('swimmer_id')
        else:
            name, sid = str(leg or '').strip(), None
        if sid:
            s = Swimmer.objects.filter(id=sid, is_relay_team=False).first()
            if s:
                return s
        if not name or re.search(r'\d', name):
            return None
        team = result.swimmer
        nat = result.nationality_id or (team.nationality_id if team else None)
        sex = team.sex if team else ''
        key = (name.upper(), nat, sex, result.category or '')
        if key not in self._cache:
            self._cache[key] = self._lookup(name, nat, sex, _age_range(result.category))
        return self._cache[key]

    def _lookup(self, name, nat, sex, age_range):
        match = _exact(name, nat)
        if match:
            return match
        if not nat:
            return None
        hits = self._pick(self._squad(nat), name, sex, age_range)
        if len(hits) == 1:
            return next(iter(hits.values()))
        if hits:
            return None  # two squad members fit — do not guess
        parts = _parts(name)
        if len(parts) < 2:
            return None
        wider = Swimmer.objects.filter(
            is_relay_team=False, nationality_id=nat,
            name__istartswith=parts[0], name__icontains=parts[-1])[:60]
        # outside the squad the age must be confirmed, not merely unknown
        hits = self._pick(wider, name, sex, age_range, must_know_age=True)
        return next(iter(hits.values())) if len(hits) == 1 else None


def link_relay_legs(championship):
    """Write the matched profile id onto every relay leg of a championship
    that has none yet. Returns the number of legs newly linked."""
    from .models import Result
    resolver = LegResolver(championship)
    linked = 0
    rows = (championship.results
            .filter(relay_swimmers__isnull=False, swimmer__is_relay_team=True)
            .select_related('swimmer'))
    for r in rows:
        legs = r.relay_swimmers
        if not isinstance(legs, list) or not legs:
            continue
        changed = False
        for leg in legs:
            if not isinstance(leg, dict) or leg.get('swimmer_id'):
                continue
            s = resolver.resolve(leg, r)
            if s:
                leg['swimmer_id'] = s.id
                changed = True
                linked += 1
        if changed:
            # a plain UPDATE: linking a name must not fire the result signals
            # (records and rankings do not depend on it)
            Result.objects.filter(pk=r.pk).update(relay_swimmers=legs)
    return linked
