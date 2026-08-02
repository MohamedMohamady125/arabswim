import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRecords } from '../api/records'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg } from '../components/ui'
import { formatDate, RECORD_TYPES, mediaUrl } from '../utils'

const TYPE_LABEL = Object.fromEntries(RECORD_TYPES.map((t) => [t.value, t.label]))
const SCOPE_ORDER = ['NATIONAL', 'ARAB', 'GCC', 'AFRICAN', 'ASIAN', 'MEDITERRANEAN', 'ISLAMIC', 'WORLD']

const SCOPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'NATIONAL', label: 'National' },
  { value: 'ARAB', label: 'Arab' },
  { value: 'GCC', label: 'GCC' },
  { value: 'AFRICAN', label: 'African' },
  { value: 'ASIAN', label: 'Asian' },
  { value: 'MEDITERRANEAN', label: 'Mediterranean' },
  { value: 'ISLAMIC', label: 'Islamic' },
  { value: 'WORLD', label: 'World' },
]

export default function NewRecords() {
  const [records, setRecords] = useState([])
  const [scope, setScope] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = { is_new: 'true' }
    if (scope) params.record_type = scope
    getRecords(params)
      .then((res) => {
        if (!alive) return
        const d = res.data
        setRecords(Array.isArray(d) ? d : d?.results || [])
      })
      .catch(() => { if (alive) setRecords([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [scope])

  const groups = useMemo(() => {
    const map = new Map()
    records.forEach((r) => {
      const key = r.record_type || 'OTHER'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    })
    // Fixed scope order: national first, then regional and continental books
    return [...map.entries()].sort(([a], [b]) => {
      const ai = SCOPE_ORDER.indexOf(a)
      const bi = SCOPE_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }, [records])

  return (
    <div>
      <PageHead kicker="Record books" title="New records" sub="Recently broken records across all scopes" />

      {/* scope filter */}
      <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Seg options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
      </div>

      {loading ? (
        <Loading label="Loading new records" />
      ) : records.length === 0 ? (
        <Empty label="No new records match this scope" />
      ) : (
        groups.map(([type, rows]) => (
          <div key={type} className="rule-b pad">
            <div className="sect-head">
              <h4 style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {TYPE_LABEL[type] || type} records
              </h4>
              <span className="micro asw-num">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
            </div>
            <div
              className="cellgrid grid-3"
              style={{ gridTemplateColumns: `repeat(${Math.min(3, rows.length)}, 1fr)` }}
            >
              {rows.map((r) => (
                <div key={r.id}>
                  {r.swimmer_detail?.photo ? (
                    <img
                      src={mediaUrl(r.swimmer_detail.photo)}
                      alt={r.swimmer_detail?.name}
                      className="grayscale"
                      style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', objectPosition: 'top', display: 'block', marginBottom: 10 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%', aspectRatio: '4 / 3', marginBottom: 10,
                        background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 34, color: 'var(--color-accent)',
                      }}
                    >
                      {(r.swimmer_detail?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}
                    </div>
                  )}
                  <div className="card-kicker">
                    {r.record_type} record · {r.pool} <span className="tag tag-dark" style={{ marginLeft: 6 }}>New</span>
                  </div>
                  <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, margin: '4px 0 2px' }}>
                    {r.formatted_time}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {r.event_detail?.name} · {r.swimmer_detail?.sex === 'F' ? 'Women' : 'Men'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <Flag code={r.swimmer_detail?.nationality_detail?.code} name={r.swimmer_detail?.nationality_detail?.name} />
                    {r.swimmer && !r.swimmer_detail?.is_relay_team ? (
                      <Link to={`/swimmers/${r.swimmer}`} style={{ color: 'inherit', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                        {r.swimmer_detail?.name}
                      </Link>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{r.swimmer_detail?.name}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 6 }}>
                    {[r.meet_name, r.location].filter(Boolean).join(' · ')}
                    {r.result_date ? ` · ${formatDate(r.result_date)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
