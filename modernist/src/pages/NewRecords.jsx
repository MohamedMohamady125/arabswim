import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getNewRecords } from '../api/records'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty } from '../components/ui'
import { formatDate, RECORD_TYPES } from '../utils'

const TYPE_LABEL = Object.fromEntries(RECORD_TYPES.map((t) => [t.value, t.label]))

export default function NewRecords() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getNewRecords()
      .then((res) => {
        if (!alive) return
        const d = res.data
        setRecords(Array.isArray(d) ? d : d?.results || [])
      })
      .catch(() => { if (alive) setRecords([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const groups = useMemo(() => {
    const map = new Map()
    records.forEach((r) => {
      const key = r.record_type || 'OTHER'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    })
    return [...map.entries()]
  }, [records])

  if (loading) return <Loading label="Loading new records" />

  return (
    <div>
      <PageHead kicker="Record books" title="New records" sub="Records set recently across all scopes" />

      {records.length === 0 && <Empty label="No new records yet" />}

      {groups.map(([type, rows]) => (
        <div key={type} className="rule-b pad">
          <div className="kicker" style={{ marginBottom: 12 }}>
            {TYPE_LABEL[type] || type} records · {rows.length}
          </div>
          <div
            className="cellgrid grid-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(3, rows.length)}, 1fr)` }}
          >
            {rows.map((r) => (
              <div key={r.id}>
                <div className="card-kicker">{r.record_type} record · {r.pool}</div>
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
      ))}
    </div>
  )
}
