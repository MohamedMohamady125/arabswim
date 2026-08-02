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
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [meetsRes, countriesRes] = await Promise.allSettled([
          getChampionships({ page_size: 500, ordering: '-date' }),
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return meets
      .map((m) => ({ m, d: parseMeetDate(m.date) }))
      .filter(({ m, d }) => {
        if (q && !`${m.name} ${m.location || ''}`.toLowerCase().includes(q)) return false
        if (year && (!d || d.getFullYear() !== +year)) return false
        if (pool !== 'ALL' && m.pool !== pool) return false
        if (country && String(m.country) !== String(country)) return false
        return true
      })
      .sort((a, b) => (b.d?.getTime() || 0) - (a.d?.getTime() || 0))
  }, [meets, search, year, pool, country])

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
      <PageHead kicker="Competition" title="Championships" sub={`${formatNumber(meets.length)} meets in the database`} />

      {/* featured meet */}
      {featured && (
        <div className="rule-b" style={{ display: 'flex', flexWrap: 'wrap' }}>
          {featured.m.meet_photo && (
            <div className="hide-mobile" style={{ width: 300, flex: 'none', borderRight: '2px solid var(--color-divider)' }}>
              <img
                src={mediaUrl(featured.m.meet_photo)}
                alt={featured.m.name}
                className="grayscale"
                style={{ width: '100%', height: '100%', minHeight: 140, objectFit: 'cover' }}
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
              {' · '}<span className="tag tag-dark" style={{ verticalAlign: 'middle' }}>{featured.m.pool}</span>
            </div>
          </div>
        </div>
      )}

      {/* filter bar */}
      <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="Search meets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Seg
          options={[{ value: 'ALL', label: 'All pools' }, { value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]}
          value={pool}
          onChange={setPool}
        />
        <select className="select" style={{ width: 120 }} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="select" style={{ width: 190 }} value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(search || year || country || pool !== 'ALL') && (
          <button className="btn btn-ghost" onClick={() => { setSearch(''); setYear(''); setCountry(''); setPool('ALL') }}>Clear</button>
        )}
      </div>

      {groups.length === 0 && <Empty label="No meets match these filters" />}

      {groups.map((g) => (
        <div key={g.key} className="rule-b">
          <div className="pad" style={{ paddingBottom: 12, display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div className="kicker">{g.key}</div>
            <span className="micro" style={{ marginLeft: 'auto' }}>
              <span className="asw-num" style={{ color: 'var(--color-text)' }}>{g.items.length}</span>
              {' '}meet{g.items.length !== 1 ? 's' : ''}
            </span>
          </div>
          {g.items.map((m, i) => {
            const isExpanded = expandedId === m.id
            const hasResults = (m.results_count ?? 0) > 0
            return (
              <div key={m.id} className={i < g.items.length - 1 || isExpanded ? 'hair-b' : ''}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 32px',
                    flexWrap: 'wrap', cursor: 'pointer',
                    background: isExpanded ? 'var(--color-surface)' : undefined,
                  }}
                >
                  <Flag code={m.country_detail?.code} name={m.country_detail?.name} large />
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <Link to={`/meets/${m.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, lineHeight: 1.2 }}>{m.name}</div>
                    </Link>
                    <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 3 }}>
                      {m.location}
                      {m.country_detail ? `${m.location ? ', ' : ''}${m.country_detail.name}` : ''}
                      {' · '}{formatDateRange(m.date, m.end_date)}
                      {m.classification_name ? ` · ${m.classification_name}` : ''}
                    </div>
                  </div>
                  <span className="tag tag-dark">{m.pool}</span>
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
                  <span className="micro" style={{ fontSize: 10, width: 12, textAlign: 'center' }}>{isExpanded ? '▴' : '▾'}</span>
                </div>

                {/* expanded actions */}
                {isExpanded && (
                  <div style={{ padding: '12px 32px 18px', background: 'var(--color-surface)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {hasResults && (
                      <>
                        <Link className="btn btn-primary" to={`/meets/${m.id}?tab=results`}>View results</Link>
                        <Link className="btn btn-secondary" to={`/meets/${m.id}?tab=medals`}>Medals</Link>
                        <Link className="btn btn-secondary" to={`/meets/${m.id}?tab=statistics`}>Statistics</Link>
                      </>
                    )}
                    <Link className="btn btn-secondary" to={`/meets/${m.id}?tab=gallery`}>Gallery</Link>
                    {isAdmin && !hasResults && (
                      <Link className="btn btn-primary" to={`/import?championship=${m.id}`}>Import results</Link>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
