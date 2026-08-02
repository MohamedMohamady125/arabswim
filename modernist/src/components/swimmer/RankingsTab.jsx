import { useEffect, useState } from 'react'
import { getSwimmerRankings, getSwimmerEvents } from '../../api/swimmers'
import { Loading, Empty, Seg } from '../ui'

export const ordSuffix = (n) => {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  const l = n % 10
  return l === 1 ? 'st' : l === 2 ? 'nd' : l === 3 ? 'rd' : 'th'
}

export default function RankingsTab({ swimmerId, swimmer }) {
  const [rankings, setRankings] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeScope, setActiveScope] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([getSwimmerRankings(swimmerId), getSwimmerEvents(swimmerId)])
      .then(([r, e]) => { if (alive) { setRankings(r.data); setEvents(e.data || []) } })
      .catch(() => { if (alive) setRankings([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [swimmerId])

  if (loading) return <Loading label="Loading rankings" />
  if (!rankings || rankings.length === 0) return <Empty label="No ranking data available" />

  const eventMap = {}
  for (const e of events) {
    eventMap[`${e.event_id}-${e.pool}`] = e.event_name
    eventMap[`${e.event_id}`] = e.event_name
  }
  const eventName = (r) =>
    (eventMap[`${r.event_id}-${r.pool}`] || eventMap[`${r.event_id}`] || `Event ${r.event_id}`).toUpperCase()

  const scopeSet = new Set()
  for (const r of rankings) for (const s of Object.keys(r.rankings || {})) scopeSet.add(s)
  const scopes = ['national', 'arab', 'gcc'].filter((s) => scopeSet.has(s))
  const scopeLabel = { national: 'National', arab: 'Arab', gcc: 'GCC' }
  const scope = scopes.includes(activeScope) ? activeScope : scopes[0]

  const pools = [...new Set(rankings.map((r) => r.pool))].sort((a) => (a === 'LCM' ? -1 : 1))
  const genderLabel = swimmer?.sex === 'M' ? "Men's" : "Women's"

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Seg
          options={scopes.map((s) => ({ value: s, label: scopeLabel[s] }))}
          value={scope}
          onChange={setActiveScope}
        />
      </div>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: `repeat(${pools.length}, 1fr)`, gap: 32, alignItems: 'start' }}>
        {pools.map((pool) => {
          const rows = rankings
            .filter((r) => r.pool === pool && r.rankings?.[scope])
            .sort((a, b) => a.rankings[scope].rank - b.rankings[scope].rank)
          if (rows.length === 0) {
            return <Empty key={pool} label={`No ${scopeLabel[scope]} rankings (${pool})`} />
          }
          const selected = rows.find((r) => r.event_id === selectedEventId) || rows[0]
          const sel = selected.rankings[scope]
          return (
            <div key={pool}>
              {/* Header bar */}
              <div style={{ background: 'var(--color-accent-800)', color: '#fff', padding: '8px 12px', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center' }}>
                {genderLabel} {eventName(selected)} · {pool}
              </div>

              {/* Hero rank + time */}
              <div className="rule-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '20px 0' }}>
                <div style={{ background: 'var(--color-accent)', color: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'flex-start' }}>
                  <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 52, lineHeight: 1 }}>{sel.rank}</span>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, marginLeft: 2, marginTop: 4 }}>{ordSuffix(sel.rank)}</span>
                </div>
                <span className="asw-time" style={{ fontSize: 52, lineHeight: 1, color: 'var(--color-accent)' }}>{selected.best_time}</span>
              </div>

              {/* Event rows */}
              <div>
                {rows.map((r) => {
                  const rk = r.rankings[scope]
                  const isSel = r.event_id === selected.event_id
                  return (
                    <button key={`${r.event_id}-${r.pool}`} type="button"
                      onClick={() => setSelectedEventId(r.event_id)}
                      className="hair-b"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '10px 8px', border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left',
                        background: isSel ? 'var(--color-accent-100)' : 'transparent',
                        color: isSel ? 'var(--color-accent)' : 'inherit',
                      }}>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 12, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {eventName(r)}
                      </span>
                      <span className="asw-num" style={{ flex: 'none', fontSize: 12, fontWeight: 600, color: isSel ? 'var(--color-accent)' : 'var(--color-neutral-600)' }}>
                        {rk.rank}{rk.total ? `/${rk.total}` : ''}
                      </span>
                      <span className="asw-time" style={{ flex: 'none', width: 76, textAlign: 'right', fontSize: 13 }}>
                        {r.best_time}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
