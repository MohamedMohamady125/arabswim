import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getLiveMeets } from '../api/championships'
import { formatDateRange, formatNumber } from '../utils'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty } from '../components/ui'

// Days elapsed within the meet window (1-based), clamped to [1, total]
function dayProgress(meet) {
  const start = new Date(meet.date?.split('/').reverse().join('-') || meet.date)
  const end = new Date(meet.end_date ? meet.end_date.split('/').reverse().join('-') : start)
  if (Number.isNaN(start.getTime())) return null
  const total = Math.max(1, Math.round((end - start) / 86400000) + 1)
  const current = Math.min(total, Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000) + 1))
  return { current, total }
}

export default function Live() {
  const [meets, setMeets] = useState(null)

  useEffect(() => {
    getLiveMeets().then((res) => setMeets(res.data)).catch(() => setMeets([]))
  }, [])

  if (!meets) return <Loading label="Loading live meets" />

  return (
    <div>
      <PageHead
        kicker="Live"
        title="Live results"
        sub="Meets happening right now — results are added session by session as they come in."
      />
      {meets.length === 0 ? (
        <Empty label="No meets are live right now. Check the calendar for upcoming meets." />
      ) : (
        <div className="pad-lg" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {meets.map((m) => {
            const prog = dayProgress(m)
            return (
              <Link key={m.id} to={`/meets/${m.id}`} className="card-link" style={{
                border: '1px solid var(--color-neutral-200)', borderRadius: 8,
                padding: '18px 20px', textDecoration: 'none', color: 'inherit', display: 'block',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span className="tag" style={{
                    background: '#c0392b', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'pulse 1.4s ease-in-out infinite' }} />
                    LIVE
                  </span>
                  {prog && <span className="micro">Day {prog.current} of {prog.total}</span>}
                </div>
                <div style={{ fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 17, lineHeight: 1.25, marginBottom: 8 }}>
                  {m.name}
                </div>
                <div className="micro" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {m.country_detail && <Flag code={m.country_detail.code} />}
                  {m.location || m.country_detail?.name}
                  {' · '}{formatDateRange(m.date, m.end_date)}
                </div>
                <div className="micro" style={{ marginTop: 8 }}>
                  <span className="asw-num" style={{ fontWeight: 700 }}>{formatNumber(m.results_count || 0)}</span> results
                  {' · '}
                  <span className="asw-num" style={{ fontWeight: 700 }}>{formatNumber(m.swimmers_count || 0)}</span> swimmers so far
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
