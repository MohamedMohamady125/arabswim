import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getChampionships } from '../api/championships'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg } from '../components/ui'
import { formatDateRange, formatNumber, mediaUrl, MONTHS_FULL } from '../utils'
import { useAuth } from '../context/AuthContext'

function parseMeetDate(d) {
  if (!d) return null
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1])
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export default function Championships() {
  const { isAdmin } = useAuth()
  const [meets, setMeets] = useState([])
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')
  const [pool, setPool] = useState('ALL')
  const [country, setCountry] = useState('')
  const [classification, setClassification] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [meetsRes, countriesRes] = await Promise.allSettled([
          getChampionships({ page_size: 500, ordering: '-date', ...(isAdmin ? { include_unpublished: 1 } : {}) }),
          getCountries(),
        ])
        if (!alive) return
        const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
        const list = (d) => (Array.isArray(d) ? d : d?.results || [])
        setMeets(list(val(meetsRes)))
        setCountries(list(val(countriesRes)))
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  const years = useMemo(() => {
    const ys = new Set()
    meets.forEach((m) => {
      const d = parseMeetDate(m.date)
      if (d) ys.add(d.getFullYear())
    })
    return [...ys].sort((a, b) => b - a)
  }, [meets])

  const classifications = useMemo(() => {
    const map = new Map()
    meets.forEach((m) => {
      if (m.classification && m.classification_name) map.set(String(m.classification), m.classification_name)
    })
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [meets])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return meets
      .map((m) => ({ m, d: parseMeetDate(m.date) }))
      .filter(({ m, d }) => {
        if (q && !`${m.name} ${m.location || ''}`.toLowerCase().includes(q)) return false
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

  if (loading) return <Loading label="Loading championships" />

  return (
    <div>
      <PageHead title="Championships" />

      {/* featured meet (desktop only) */}
      {featured && (
        <div className="rule-b hide-mobile" style={{ display: 'flex', flexWrap: 'wrap' }}>
          {featured.m.meet_photo && (
            <div className="hide-mobile" style={{ width: 220, alignSelf: 'stretch', flex: 'none', borderRight: '2px solid var(--color-divider)', overflow: 'hidden' }}>
              <img
                src={mediaUrl(featured.m.meet_photo)}
                alt={featured.m.name}
                className="grayscale"
                style={{ width: '100%', height: '100%', maxHeight: 150, objectFit: 'cover', display: 'block' }}
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

      {/* filter bar */}
      <div className="rule-b meets-filters" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="Search meets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Seg
          options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]}
          value={pool}
          onChange={(v) => setPool(pool === v ? 'ALL' : v)}
        />
        <select className="select" style={{ width: 120 }} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="select" style={{ width: 190 }} value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {classifications.length > 0 && (
          <select className="select" style={{ width: 190 }} value={classification} onChange={(e) => setClassification(e.target.value)}>
            <option value="">All classifications</option>
            {classifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {(search || year || country || classification || pool !== 'ALL') && (
          <button className="btn btn-ghost" onClick={() => { setSearch(''); setYear(''); setCountry(''); setClassification(''); setPool('ALL') }}>Clear</button>
        )}
      </div>

      {groups.length === 0 && <Empty label="No meets match these filters" />}

      {groups.map((g) => (
        <div key={g.key} className="rule-b">
          <div className="pad" style={{ paddingBottom: 10 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, letterSpacing: '0.02em', color: 'var(--color-accent-800)' }}>{g.key}</div>
          </div>
          {g.items.map((m, i) => {
            const hasResults = (m.results_count ?? 0) > 0
            return (
              <div key={m.id} className={i < g.items.length - 1 ? 'hair-b' : ''}>
                {/* the whole row IS the link — no expander, no extra chrome */}
                <Link
                  to={`/meets/${m.id}`}
                  className="meet-row"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 32px',
                    flexWrap: 'wrap', cursor: 'pointer',
                    color: 'inherit', textDecoration: 'none',
                  }}
                >
                  {/* List rows show the host flag only — the meet's own
                      logo/photo lives inside the meet page header. */}
                  <Flag code={m.country_detail?.code} name={m.country_detail?.name} large placeholder />
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, lineHeight: 1.2 }}>
                      {m.name}
                      {isAdmin && m.is_published === false && <span className="tag tag-neutral" style={{ marginLeft: 8, fontSize: 10, verticalAlign: 'middle' }}>Unpublished</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 3 }}>
                      {isAdmin && m.location ? `${m.location}, ` : ''}
                      {m.country_detail?.name || ''}
                      {' · '}{formatDateRange(m.date, m.end_date)}
                      {isAdmin && m.classification_name ? ` · ${m.classification_name}` : ''}
                    </div>
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
    </div>
  )
}
