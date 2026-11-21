import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getChampionships, getClassifications } from '../api/championships'
import { getMedalSummary, getMedalClubSummary, getMedalSwimmerSummary } from '../api/medals'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Empty, Seg, FilterBar, Skeleton } from '../components/ui'
import MedalStandings from '../components/MedalStandings'
import { mediaUrl, nameInitials } from '../utils'
import Pic from '../components/Pic'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])
// Postel's Law: name search ignores case, accents and extra spaces
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const FIRST_ROWS = 25 // Miller's Law / Pareto: the top of the table first, the long tail on request

function ClubLogo({ logo, name, size = 24 }) {
  const [failed, setFailed] = useState(false)
  const initials = nameInitials(name)
  const base = {
    width: size, height: size, flex: 'none', borderRadius: '50%',
    border: '1px solid var(--color-neutral-300)',
  }
  if (logo && !failed) {
    return (
      <Pic kind="logo" w={96} src={logo} width={size} height={size}
        onError={() => setFailed(true)}
        style={{ ...base, background: '#fff' }} />
    )
  }
  return (
    <span style={{
      ...base, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.max(10.5, size * 0.38), fontWeight: 700, letterSpacing: '.02em',
      background: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)',
    }}>{initials}</span>
  )
}

// Regional classifications → only the Arab countries that belong to that
// region. Everything else (Olympic, World, Arab, National, Islamic, Other…)
// shows the full Arab country list.
const GCC_CODES = ['KSA', 'KWT', 'QAT', 'BHR', 'UAE', 'OMA']
const CATEGORY_COUNTRIES = {
  GCC: GCC_CODES,
  Asian: [...GCC_CODES, 'IRQ', 'YEM', 'LBN', 'PLE', 'JOR', 'SYR'],
  African: ['EGY', 'SUD', 'COM', 'SOM', 'DJI', 'LBY', 'TUN', 'ALG', 'MAR', 'MTN'],
  Mediterranean: ['MAR', 'ALG', 'TUN', 'LBY', 'EGY', 'LBN', 'SYR'],
}

export default function Medals() {
  const [classifications, setClassifications] = useState([])
  const [category, setCategory] = useState('Arab')
  const touched = useRef(false) // true once the user picks a category themselves
  const [allMeets, setAllMeets] = useState(null) // every championship, fetched once (null = not loaded)
  const [moreCats, setMoreCats] = useState(false) // categories without any championship stay behind "More"
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [failed, setFailed] = useState(false) // the tally request itself failed (not "no medals")
  const [tryKey, setTryKey] = useState(0)
  const [championship, setChampionship] = useState('')
  const [gender, setGender] = useState('')
  const [scope, setScope] = useState('country')
  const [country, setCountry] = useState('')
  const [countries, setCountries] = useState([])
  const [summary, setSummary] = useState([])
  const [clubRows, setClubRows] = useState([])
  const [swimmerRows, setSwimmerRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false) // categories never arrived → no endless "Loading"

  useEffect(() => {
    getClassifications()
      .then((res) => { const cs = list(res.data); setClassifications(cs); if (cs.length === 0) setLoadFailed(true) })
      .catch(() => { setClassifications([]); setLoadFailed(true) })
    getCountries({ has_swimmers: true })
      .then((res) => setCountries(list(res.data).filter((c) => c.region === 'ARAB' || c.region === 'GCC')))
      .catch(() => setCountries([]))
    // One request for every championship: fills the picker for any category
    // without a refetch (Doherty) and tells us which categories hold data.
    getChampionships({ page_size: 1000 })
      .then((res) => setAllMeets(list(res.data)))
      .catch(() => setAllMeets([]))
  }, [])

  const classificationId = useMemo(
    () => classifications.find((c) => c.name === category)?.id || null,
    [classifications, category],
  )

  const isNational = category === 'National'

  // Countries that belong to the selected classification's region
  const regionCountries = useMemo(() => {
    const codes = CATEGORY_COUNTRIES[category]
    if (!codes) return countries
    const order = new Map(codes.map((c, i) => [c, i]))
    return countries
      .filter((c) => order.has(c.code))
      .sort((a, b) => order.get(a.code) - order.get(b.code))
  }, [countries, category])

  // Default view per category: club tally for National, country tally otherwise.
  useEffect(() => {
    setChampionship('')
    setScope(isNational ? 'club' : 'country')
  }, [category, isNational])

  const meetCount = useMemo(() => {
    const n = {}
    for (const m of allMeets || []) { const k = m.classification_name || ''; n[k] = (n[k] || 0) + 1 }
    return n
  }, [allMeets])

  const meets = useMemo(
    () => (allMeets || [])
      .filter((m) => m.classification_name === category)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    [allMeets, category],
  )

  // Tesler's Law: don't open on an empty default. Arab first; when it holds no
  // championships yet, land on the first category that does.
  useEffect(() => {
    if (touched.current || !allMeets || classifications.length === 0) return
    if (meetCount[category]) return
    const first = classifications.find((c) => meetCount[c.name])
    if (first) setCategory(first.name)
  }, [allMeets, classifications, meetCount, category])

  // a new selection starts again from the top of the table
  useEffect(() => { setQuery(''); setShowAll(false) }, [category, scope, championship, gender, country])

  useEffect(() => {
    if (!classificationId) return
    let alive = true
    setLoading(true); setFailed(false)
    const params = {}
    if (championship) params.championship = championship
    else params.classification = classificationId
    if (gender) params.gender = gender
    // National mixes every federation's championships → filter by host
    // country; Arab/GCC tallies → medals won by that nation's swimmers
    if (country) params[isNational ? 'host_country' : 'country'] = country
    Promise.allSettled([
      isNational ? Promise.resolve(null) : getMedalSummary(params),
      isNational ? getMedalClubSummary(params) : Promise.resolve(null),
      // Full swimmer tally within a championship; capped list globally
      getMedalSwimmerSummary({ ...params, limit: championship ? 'all' : 100 }),
    ]).then(([sRes, cRes, swRes]) => {
      if (!alive) return
      const val = (r) => (r.status === 'fulfilled' && r.value ? list(r.value.data) : [])
      // a failed request is not "no medals": say so and offer a retry
      setFailed([sRes, cRes, swRes].some((r) => r.status === 'rejected'))
      setSummary(val(sRes))
      setClubRows(val(cRes))
      setSwimmerRows(val(swRes))
      setLoading(false)
    })
    return () => { alive = false }
  }, [classificationId, championship, gender, country, isNational, tryKey])

  // For country scope: merge API results with full Arab country list so every country shows
  const rows = useMemo(() => {
    // Blank buckets (medals with no club / no swimmer name) never rank as rows
    if (scope === 'club') return clubRows.filter((r) => r.result__team || r.team_id)
    if (scope === 'swimmer') return swimmerRows.filter((r) => r.swimmer__name)
    const byCode = {}
    for (const r of summary) byCode[r.swimmer__nationality__code] = r
    const merged = regionCountries.map((c) => byCode[c.code] || {
      swimmer__nationality__name: c.name,
      swimmer__nationality__code: c.code,
      swimmer__nationality__flag_url: c.flag_url,
      gold: 0, silver: 0, bronze: 0, total: 0,
    })
    merged.sort((a, b) => (b.gold - a.gold) || (b.silver - a.silver) || (b.bronze - a.bronze))
    // Nothing won for this selection → show the empty state, not an all-zero table
    if (!merged.some((r) => (r.gold || 0) + (r.silver || 0) + (r.bronze || 0) > 0)) return []
    return merged
  }, [scope, summary, clubRows, swimmerRows, regionCountries])

  // National + country filter → only show that federation's meets in the picker
  const visibleMeets = useMemo(
    () => (isNational && country
      ? meets.filter((m) => String(m.country?.id ?? m.country) === String(country))
      : meets),
    [meets, isNational, country],
  )

  const scopeOptions = [
    ...(!isNational ? [{ value: 'country', label: 'Country' }] : []),
    ...(isNational ? [{ value: 'club', label: 'Club' }] : []),
    { value: 'swimmer', label: 'Swimmer' },
  ]

  const countrySelect = (
    <select
      className="select" aria-label="Country" style={{ flex: '1 1 150px', width: 'auto', minWidth: 0, maxWidth: 280 }} value={country}
      onChange={(e) => { setCountry(e.target.value); setChampionship('') }}
    >
      <option value="">All countries</option>
      {regionCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )

  // Hick's Law: categories that hold championships are the tabs; the ones with
  // nothing in the database yet wait behind "More" (the current one always shows).
  const { classificationTabs, hiddenCats } = useMemo(() => {
    const opt = (c) => ({ value: c.name, label: c.name })
    if (!allMeets) return { classificationTabs: classifications.map(opt), hiddenCats: 0 }
    const withData = classifications.filter((c) => meetCount[c.name] || c.name === category)
    const empty = classifications.filter((c) => !meetCount[c.name] && c.name !== category)
    return {
      // every category is a tab (asked 2026-11-21 — no "More categories" button)
      classificationTabs: [...withData, ...empty].map(opt),
      hiddenCats: 0,
    }
  }, [classifications, allMeets, meetCount, category, moreCats])

  const countryIdByCode = useMemo(() => Object.fromEntries(countries.map((c) => [c.code, c.id])), [countries])

  // Chunking: the championship picker is grouped by year, newest first
  const meetsByYear = useMemo(() => {
    const groups = []
    for (const m of visibleMeets) {
      const y = String(m.date || '').slice(0, 4) || 'Undated'
      const g = groups[groups.length - 1]
      if (g && g.year === y) g.items.push(m); else groups.push({ year: y, items: [m] })
    }
    return groups
  }, [visibleMeets])

  const noun = scope === 'country' ? 'countries' : scope === 'club' ? 'clubs' : 'swimmers'
  const nameOf = (r) => (scope === 'country' ? `${r.swimmer__nationality__name} ${r.swimmer__nationality__code}` : scope === 'club' ? r.result__team : r.swimmer__name)
  // rank is fixed before searching, so a found club keeps its real position
  const ranked = useMemo(() => rows.map((r, i) => ({ ...r, _rank: i + 1 })), [rows])
  const q = norm(query)
  const found = q ? ranked.filter((r) => norm(nameOf(r)).includes(q)) : ranked
  const capped = !q && !showAll && found.length > FIRST_ROWS + 5
  const filtersActive = !!(country || championship || gender || query)
  const clearAll = () => { setCountry(''); setChampionship(''); setGender(''); setQuery('') }
  const selectedMeet = championship ? meets.find((m) => String(m.id) === String(championship)) : null

  return (
    <div>
      <PageHead title="Medal Tables" />

      {/* Classification tab bar — same 32px gutter as the rest of the page;
          phone keeps the edge-to-edge swipe strip via the mobile .tabbar rule */}
      <div className="rule-b tabbar" style={{ padding: '16px 32px', overflowX: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Seg tabs options={classificationTabs} value={category} onChange={(v) => { touched.current = true; setCategory(v); setCountry('') }} />
        {hiddenCats > 0 && (
          <button type="button" className="btn btn-ghost showmore" style={{ flex: 'none', whiteSpace: 'nowrap' }} aria-expanded={moreCats} onClick={() => setMoreCats((o) => !o)}>
            {moreCats ? 'Fewer categories' : `More categories (${hiddenCats})`}
          </button>
        )}
      </div>

      {/* Common Region: every filter of the table in one bar, with the result
          count and a way back to the default (Working Memory) */}
      <FilterBar count={loading || loadFailed || failed ? null : found.length} noun={found.length === 1 ? noun.replace(/ies$/, 'y').replace(/s$/, '') : noun} active={filtersActive} onClear={clearAll}>
        <Seg options={scopeOptions} value={scope} onChange={setScope} />
        <Seg
          options={[{ value: '', label: 'All' }, { value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }]}
          value={gender}
          onChange={setGender}
        />
        {/* National → country picker leads, same slot either way */}
        {countrySelect}
        <select className="select" aria-label="Championship" style={{ flex: '2 1 220px', width: 'auto', minWidth: 0, maxWidth: 380 }} value={championship} onChange={(e) => setChampionship(e.target.value)}>
          <option value="">All {category} championships{visibleMeets.length ? ` (${visibleMeets.length})` : ''}</option>
          {meetsByYear.map((g) => (
            <optgroup key={g.year} label={g.year}>
              {g.items.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </optgroup>
          ))}
        </select>
        {scope !== 'country' && (
          <input
            className="input" type="search" autoComplete="off"
            style={{ flex: '1 1 160px', width: 'auto', minWidth: 0, maxWidth: 220 }}
            placeholder={scope === 'club' ? 'Find a club' : 'Find a swimmer'}
            aria-label={scope === 'club' ? 'Find a club' : 'Find a swimmer'}
            value={query} onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </FilterBar>

      {loadFailed ? (
        <Empty label="Medal tables could not be loaded" hint="Reload the page or try again in a moment." />
      ) : loading ? (
        <div className="pad"><Skeleton rows={8} height={34} /></div>
      ) : failed ? (
        <Empty label="Medal table could not be loaded" hint="Check your connection and try again.">
          <button type="button" className="btn btn-secondary" onClick={() => setTryKey((k) => k + 1)}>Try again</button>
        </Empty>
      ) : rows.length === 0 ? (
        <Empty
          label={allMeets && meets.length === 0 ? `No ${category} championships in the database yet` : 'No medals recorded for this selection'}
          hint={allMeets && meets.length === 0 ? 'Pick another category above.' : 'Try another category, country or championship.'}
        >
          {(country || championship || gender) && (
            <button type="button" className="btn btn-secondary" onClick={clearAll}>Clear filters</button>
          )}
        </Empty>
      ) : found.length === 0 ? (
        <Empty label={`No ${scope === 'club' ? 'club' : 'swimmer'} matches "${query.trim()}"`} hint="Check the spelling or try part of the name.">
          <button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>Clear search</button>
        </Empty>
      ) : (
        <div className="pad">
          {/* Working Memory: say what the table covers and how it is ordered */}
          <div className="micro" style={{ marginBottom: 12 }}>
            {selectedMeet ? selectedMeet.name : `All ${category} championships`}
            {' · '}ranked by gold, then silver, then bronze
            {scope === 'swimmer' && !championship && rows.length >= 100 ? ' · top 100 swimmers' : ''}
          </div>
          <MedalStandings
            rows={capped ? found.slice(0, FIRST_ROWS) : found}
            showPodium={!q}
            rankOf={(row) => row._rank}
            entityHeader={scope === 'country' ? 'Country' : scope === 'club' ? 'Club' : 'Swimmer'}
            rowKey={(row, i) => (scope === 'country'
              ? row.swimmer__nationality__code
              : scope === 'club' ? (row.team_id ?? row.result__team) : row.swimmer__id) ?? i}
            renderPodiumChip={(row) => (
              scope === 'club' ? (
                <>
                  <ClubLogo logo={row.team_logo} name={row.result__team} size={20} />
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.result__team || '—'}</span>
                </>
              ) : (
                <>
                  <Flag code={row.swimmer__nationality__code} name={row.swimmer__nationality__name} />
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {scope === 'swimmer' ? row.swimmer__name : row.swimmer__nationality__code}
                  </span>
                </>
              )
            )}
            renderEntity={(row) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                {scope === 'country' && (
                  <>
                    <Flag code={row.swimmer__nationality__code} name={row.swimmer__nationality__name} />
                    {/* Law of Similarity: countries open their federation, like clubs and swimmers open theirs */}
                    {countryIdByCode[row.swimmer__nationality__code]
                      ? <Link to={`/countries/${countryIdByCode[row.swimmer__nationality__code]}?tab=medals`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 700 }}>{row.swimmer__nationality__name}</Link>
                      : <span style={{ fontWeight: 700 }}>{row.swimmer__nationality__name}</span>}
                  </>
                )}
                {scope === 'club' && (
                  <>
                    <ClubLogo logo={row.team_logo} name={row.result__team} />
                    {row.team_id
                      ? <Link to={`/teams/${row.team_id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 700 }}>{row.result__team || '—'}</Link>
                      : <span style={{ fontWeight: 700 }}>{row.result__team || '—'}</span>}
                  </>
                )}
                {scope === 'swimmer' && (
                  <>
                    <Flag code={row.swimmer__nationality__code} name={row.swimmer__nationality__name} />
                    <Link to={`/swimmers/${row.swimmer__id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 700 }}>{row.swimmer__name}</Link>
                  </>
                )}
              </span>
            )}
          />
          {capped && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAll(true)}>
                Show all {found.length.toLocaleString('en-US')} {noun}
              </button>
              <span className="micro">Showing the top {FIRST_ROWS}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
