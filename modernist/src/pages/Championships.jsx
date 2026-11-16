import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getChampionships } from '../api/championships'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg, FilterBar, ShowMore } from '../components/ui'
import { formatDateRange, formatNumber, mediaUrl, MONTHS_FULL } from '../utils'
import { useAuth } from '../context/AuthContext'
import Pic from '../components/Pic'

function parseMeetDate(d) {
  if (!d) return null
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1])
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

// Postel's Law: search ignores case, accents and punctuation ("elite", "Élite").
const fold = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').trim()
const POOL_LABEL = { LCM: '50m', SCM: '25m' }
const POOL_WORDS = { LCM: '50m long course lcm', SCM: '25m short course scm' }

export default function Championships() {
  const { isAdmin } = useAuth()
  const [meets, setMeets] = useState([])
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [search, setSearch] = useState('')
  // Hick/Tesler: the list opens on the latest year instead of every meet ever.
  // null = "latest year" default, '' = all years, otherwise the chosen year.
  const [yearChoice, setYearChoice] = useState(null)
  const [pool, setPool] = useState('ALL')
  const [country, setCountry] = useState('')
  const [classification, setClassification] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setFailed(false)
      try {
        const [meetsRes, countriesRes] = await Promise.allSettled([
          getChampionships({ page_size: 500, ordering: '-date', ...(isAdmin ? { include_unpublished: 1 } : {}) }),
          getCountries(),
        ])
        if (!alive) return
        const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
        const list = (d) => (Array.isArray(d) ? d : d?.results || [])
        setFailed(meetsRes.status !== 'fulfilled')
        setMeets(list(val(meetsRes)))
        // Arab/GCC federations first, rest after (matches Swimmers/Clubs filters)
        const all = list(val(countriesRes))
        const arab = all.filter((c) => c.region === 'ARAB' || c.region === 'GCC')
        const rest = all.filter((c) => c.region !== 'ARAB' && c.region !== 'GCC')
        setCountries([...arab, ...rest])
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [isAdmin, reloadKey])

  const years = useMemo(() => {
    const ys = new Set()
    meets.forEach((m) => {
      const d = parseMeetDate(m.date)
      if (d) ys.add(d.getFullYear())
    })
    return [...ys].sort((a, b) => b - a)
  }, [meets])

  // Default year = the latest year that already has a meet on or before today
  // (so a single far-future calendar entry does not hide the current season).
  const defaultYear = useMemo(() => {
    const now = new Date().getFullYear()
    return years.find((y) => y <= now) ?? years[0] ?? ''
  }, [years])
  // Searching without having picked a year looks through every year.
  const year = yearChoice === null ? (search.trim() ? '' : defaultYear) : yearChoice
  const setYear = (v) => setYearChoice(v === '' ? '' : +v)

  const classifications = useMemo(() => {
    const map = new Map()
    meets.forEach((m) => {
      if (m.classification && m.classification_name) map.set(String(m.classification), m.classification_name)
    })
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [meets])

  const filtered = useMemo(() => {
    const words = fold(search).split(' ').filter(Boolean)
    return meets
      .map((m) => ({ m, d: parseMeetDate(m.date) }))
      .filter(({ m, d }) => {
        if (words.length) {
          const hay = fold(`${m.name} ${m.location || ''} ${m.country_detail?.name || ''} ${m.country_detail?.code || ''} ${d ? `${d.getFullYear()} ${MONTHS_FULL[d.getMonth()]}` : ''} ${POOL_WORDS[m.pool] || ''}`)
          if (!words.every((w) => hay.includes(w))) return false
        }
        if (year && (!d || d.getFullYear() !== +year)) return false
        if (pool !== 'ALL' && m.pool !== pool) return false
        if (country && String(m.country) !== String(country)) return false
        if (classification && String(m.classification) !== String(classification)) return false
        return true
      })
      .sort((a, b) => (b.d?.getTime() || 0) - (a.d?.getTime() || 0))
  }, [meets, search, year, pool, country, classification])

  const groups = useMemo(() => {
    const out = []
    let cur = null
    filtered.forEach(({ m, d }) => {
      const key = d ? `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}` : 'Undated'
      if (!cur || cur.key !== key) {
        cur = { key, items: [] }
        out.push(cur)
      }
      cur.items.push(m)
    })
    return out
  }, [filtered])

  // Featured meet: nearest upcoming, else most recent
  const featured = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dated = meets
      .map((m) => ({ m, d: parseMeetDate(m.date) }))
      .filter((x) => x.d)
    const upcoming = dated.filter((x) => x.d > today).sort((a, b) => a.d - b.d)
    if (upcoming[0]) return { ...upcoming[0], isUpcoming: true }
    const past = dated.sort((a, b) => b.d - a.d)
    return past[0] ? { ...past[0], isUpcoming: false } : null
  }, [meets])

  const clearFilters = () => { setSearch(''); setYearChoice(null); setCountry(''); setClassification(''); setPool('ALL') }
  const filtersActive = !!(search || yearChoice !== null || country || classification || pool !== 'ALL')

  // Per-year totals for the year picker and the "earlier years" links at the end.
  const yearCounts = useMemo(() => {
    const map = new Map()
    meets.forEach((m) => {
      const d = parseMeetDate(m.date)
      if (d) map.set(d.getFullYear(), (map.get(d.getFullYear()) || 0) + 1)
    })
    return map
  }, [meets])
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }, [])
  const otherYears = year === '' ? [] : years.filter((y) => y !== +year)

  if (loading) return <Loading label="Loading championships" />

  return (
    <div>
      <PageHead title="Championships" />

      {/* featured meet (desktop only) */}
      {featured && (
        <div className="rule-b hide-mobile" style={{ display: 'flex', flexWrap: 'wrap' }}>
          {featured.m.meet_photo && (
            <div className="hide-mobile" style={{ width: 220, alignSelf: 'stretch', flex: 'none', borderRight: '2px solid var(--color-divider)', overflow: 'hidden' }}>
              <Pic kind="meet" w={320}
                src={featured.m.meet_photo}
                alt={featured.m.name}
                className="grayscale"
                style={{ width: '100%', height: '100%', maxHeight: 150 }}
              />
            </div>
          )}
          <div className="pad" style={{ flex: 1, minWidth: 260 }}>
            <div className="kicker" style={{ marginBottom: 8 }}>{featured.isUpcoming ? 'Next meet' : 'Latest meet'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Flag code={featured.m.country_detail?.code} name={featured.m.country_detail?.name} large />
              <Link to={`/meets/${featured.m.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <h2 style={{ margin: 0, letterSpacing: '-0.02em' }}>{featured.m.name}</h2>
              </Link>
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 8 }}>
              {featured.m.location}
              {featured.m.country_detail ? `${featured.m.location ? ', ' : ''}${featured.m.country_detail.name}` : ''}
              {' · '}{formatDateRange(featured.m.date, featured.m.end_date)}
            </div>
          </div>
        </div>
      )}

      {/* filter bar — Common Region: every filter in one bar with the count.
          Hick's Law: search, year and pool up front; country and classification
          (rarely used) sit behind "More filters". */}
      <div className="meets-fb">
      <FilterBar count={failed ? null : filtered.length} noun={filtered.length === 1 ? 'meet' : 'meets'} active={filtersActive} onClear={clearFilters}>
        <input
          className="input"
          type="search"
          aria-label="Search meets"
          style={{ width: 220, appearance: 'none', WebkitAppearance: 'none' }}
          placeholder="Search meets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select" aria-label="Year" style={{ width: 150, minWidth: 110 }} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y} ({yearCounts.get(y) || 0})</option>)}
        </select>
        <Seg
          options={[{ value: 'ALL', label: 'All pools' }, { value: 'LCM', label: '50m' }, { value: 'SCM', label: '25m' }]}
          value={pool}
          onChange={setPool}
        />
        <ShowMore label="More filters" lessLabel="Fewer filters" defaultOpen={!!(country || classification)}>
          <select className="select" aria-label="Country" style={{ width: 190, minWidth: 126 }} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {classifications.length > 0 && (
            <select className="select" aria-label="Classification" style={{ width: 190, minWidth: 150 }} value={classification} onChange={(e) => setClassification(e.target.value)}>
              <option value="">All classifications</option>
              {classifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </ShowMore>
      </FilterBar>
      </div>

      {groups.length === 0 && (failed
        ? (
          <Empty label="The meets could not be loaded" hint="Check your connection and try again.">
            <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
          </Empty>
        )
        : meets.length === 0
        ? <Empty label="No meets to show yet" hint="Meets appear here as soon as they are added. Check back later." />
        : (
          <Empty label="No meets match these filters" hint="Try another year or country, or clear the filters.">
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>Clear filters</button>
          </Empty>
        ))}

      {groups.map((g) => (
        <div key={g.key} className="rule-b">
          <div className="pad" style={{ paddingBottom: 10 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, letterSpacing: '0.02em', color: 'var(--color-accent-800)' }}>
              {g.key}
              <span className="asw-num" style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: 'var(--color-neutral-700)' }}>{g.items.length}</span>
            </h2>
          </div>
          {g.items.map((m, i) => {
            const hasResults = (m.results_count ?? 0) > 0
            const md = parseMeetDate(m.date)
            const me = parseMeetDate(m.end_date) || md
            const upcoming = md && md > today
            const running = m.is_live || (md && me && md <= today && me >= today && !hasResults)
            return (
              <div key={m.id} className={i < g.items.length - 1 ? 'hair-b' : ''}>
                {/* the whole row IS the link — no expander, no extra chrome */}
                <Link
                  to={`/meets/${m.id}`}
                  className="meet-row"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '16px 32px',
                    flexWrap: 'wrap', cursor: 'pointer',
                    color: 'inherit', textDecoration: 'none',
                  }}
                >
                  {/* List rows show the host flag only — the meet's own
                      logo/photo lives inside the meet page header. */}
                  <Flag code={m.country_detail?.code} name={m.country_detail?.name} large placeholder />
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>
                      {m.name}
                      {isAdmin && m.is_published === false && <span className="tag tag-neutral" style={{ marginLeft: 8, fontSize: 11, verticalAlign: 'middle' }}>Unpublished</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 3 }}>
                      {isAdmin && m.location ? `${m.location}, ` : ''}
                      {m.country_detail?.name || ''}
                      {' · '}{formatDateRange(m.date, m.end_date)}
                      {isAdmin && m.classification_name ? ` · ${m.classification_name}` : ''}
                    </div>
                  </div>
                  {/* Status first, pool second — the two facts people scan for. */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 'none' }}>
                    {m.is_live
                      ? <span className="tag tag-outline" style={{ borderColor: 'var(--asw-slow)', color: 'var(--asw-slow)' }}>Live</span>
                      : running ? <span className="tag tag-neutral">In progress</span>
                      : upcoming ? <span className="tag tag-neutral">Upcoming</span> : null}
                    {POOL_LABEL[m.pool] && <span className="tag tag-neutral" title={m.pool === 'LCM' ? 'Long course (50m pool)' : 'Short course (25m pool)'}>{POOL_LABEL[m.pool]}</span>}
                  </div>
                  {isAdmin && (
                    <div className="micro hide-mobile" style={{ textAlign: 'right', minWidth: 150 }}>
                      {hasResults ? (
                        <>
                          <span className="asw-num" style={{ color: 'var(--color-text)' }}>{formatNumber(m.results_count ?? 0)}</span> results
                          {' · '}
                          <span className="asw-num" style={{ color: 'var(--color-text)' }}>{formatNumber(m.swimmers_count ?? 0)}</span> swimmers
                        </>
                      ) : (
                        <span className="tag tag-neutral">No results</span>
                      )}
                    </div>
                  )}
                </Link>
              </div>
            )
          })}
        </div>
      ))}

      {/* Peak-End / Goal-Gradient: the list ends with where to go next rather
          than just stopping. */}
      {!failed && otherYears.length > 0 && (
        <div className="pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="kicker" style={{ marginRight: 4 }}>Other years</span>
          {otherYears.map((y) => (
            <button key={y} type="button" className="btn btn-ghost" style={{ minHeight: 36 }} onClick={() => { setYearChoice(y); window.scrollTo({ top: 0 }) }}>
              {y} <span className="asw-num" style={{ marginLeft: 6, color: 'var(--color-neutral-700)' }}>{yearCounts.get(y) || 0}</span>
            </button>
          ))}
          <button type="button" className="btn btn-ghost" style={{ minHeight: 36 }} onClick={() => { setYearChoice(''); window.scrollTo({ top: 0 }) }}>All years</button>
        </div>
      )}
    </div>
  )
}
