import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getChampionships } from '../api/championships'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg } from '../components/ui'
import { formatDateRange, MONTHS_FULL } from '../utils'

function parseMeetDate(d) {
  if (!d) return null
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1])
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export default function Championships() {
  const [meets, setMeets] = useState([])
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState('')
  const [pool, setPool] = useState('ALL')
  const [country, setCountry] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [meetsRes, countriesRes] = await Promise.allSettled([
          getChampionships({ page_size: 300 }),
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
    return meets
      .map((m) => ({ m, d: parseMeetDate(m.date) }))
      .filter(({ m, d }) => {
        if (year && (!d || d.getFullYear() !== +year)) return false
        if (pool !== 'ALL' && m.pool !== pool) return false
        if (country && String(m.country) !== String(country)) return false
        return true
      })
      .sort((a, b) => (b.d?.getTime() || 0) - (a.d?.getTime() || 0))
  }, [meets, year, pool, country])

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

  if (loading) return <Loading label="Loading championships" />

  return (
    <div>
      <PageHead kicker="Competition" title="Championships" sub={`${meets.length.toLocaleString('en-US')} meets in the database`} />

      {/* filter bar */}
      <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
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
        {(year || country || pool !== 'ALL') && (
          <button className="btn btn-ghost" onClick={() => { setYear(''); setCountry(''); setPool('ALL') }}>Clear</button>
        )}
      </div>

      {groups.length === 0 && <Empty label="No meets match these filters" />}

      {groups.map((g) => (
        <div key={g.key} className="rule-b">
          <div className="pad" style={{ paddingBottom: 12 }}>
            <div className="kicker">{g.key}</div>
          </div>
          {g.items.map((m, i) => (
            <div
              key={m.id}
              className={i < g.items.length - 1 ? 'hair-b' : ''}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 32px', flexWrap: 'wrap' }}
            >
              <Flag code={m.country_detail?.code} name={m.country_detail?.name} large />
              <div style={{ flex: 1, minWidth: 220 }}>
                <Link to={`/meets/${m.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, lineHeight: 1.2 }}>{m.name}</div>
                </Link>
                <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 3 }}>
                  {m.location}
                  {m.country_detail ? `, ${m.country_detail.name}` : ''}
                  {' · '}{formatDateRange(m.date, m.end_date)}
                  {m.classification_name ? ` · ${m.classification_name}` : ''}
                </div>
              </div>
              <span className="tag tag-dark">{m.pool}</span>
              <div className="micro hide-mobile" style={{ textAlign: 'right', minWidth: 150 }}>
                <span className="asw-num" style={{ color: 'var(--color-text)' }}>{(m.results_count ?? 0).toLocaleString('en-US')}</span> results
                {' · '}
                <span className="asw-num" style={{ color: 'var(--color-text)' }}>{(m.swimmers_count ?? 0).toLocaleString('en-US')}</span> swimmers
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
