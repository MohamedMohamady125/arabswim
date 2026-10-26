import { useEffect, useState } from 'react'
import { getSwimmerRankings, getSwimmerEvents, getSwimmerRankingHistory } from '../../api/swimmers'
import { Loading, Empty, Seg } from '../ui'

/* Season-by-season rank in one event: where each year's season best placed
   among that season's field (national/arab). Rank 1 = tallest column. */
function RankingHistory({ swimmerId, rankings, eventName, scope, scopeLabel }) {
  const [histEvent, setHistEvent] = useState(null)
  const [hist, setHist] = useState(null)

  const options = rankings
    .filter((r, i, arr) => arr.findIndex((x) => x.event_id === r.event_id && x.pool === r.pool) === i)
    // best rank first, so the default selection is the swimmer's strongest
    // event (matching the hero card above) instead of arbitrary API order
    .sort((a, b) => (a.rankings?.[scope]?.rank ?? Infinity) - (b.rankings?.[scope]?.rank ?? Infinity))
  const sel = options.find((o) => histEvent && o.event_id === histEvent.event_id && o.pool === histEvent.pool)
    || options[0]

  useEffect(() => {
    if (!sel) return
    let alive = true
    setHist(null)
    getSwimmerRankingHistory(swimmerId, { event: sel.event_id, pool: sel.pool })
      .then((r) => { if (alive) setHist(r.data) })
      .catch(() => { if (alive) setHist({ seasons: [] }) })
    return () => { alive = false }
  }, [swimmerId, sel?.event_id, sel?.pool])

  if (!sel) return null
  const seasons = hist?.seasons || []
  const scoped = seasons.filter((s) => s[scope])
  const maxRank = Math.max(1, ...scoped.map((s) => s[scope].rank))

  return (
    <div>
      <div className="sect-head">
        <h4>Ranking History</h4>
        <select className="select" style={{ width: 'auto', fontSize: 12, height: 30 }}
          value={`${sel.event_id}|${sel.pool}`}
          onChange={(e) => {
            const [eid, pool] = e.target.value.split('|')
            setHistEvent({ event_id: Number(eid), pool })
          }}>
          {options.map((o) => (
            <option key={`${o.event_id}|${o.pool}`} value={`${o.event_id}|${o.pool}`}>
              {eventName(o)} · {o.pool}
            </option>
          ))}
        </select>
      </div>
      <div className="rule-t" style={{ paddingTop: 12 }}>
        {!hist ? <Loading label="Loading history" /> : scoped.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 13 }}>No season history for this event yet.</div>
        ) : (
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* rank-per-season columns: rank 1 = full height */}
            <div style={{ flex: '1 1 300px', display: 'flex', alignItems: 'flex-end', gap: 14, height: 150, borderBottom: '2px solid var(--color-divider)' }}>
              {scoped.map((s) => {
                const rk = s[scope]
                const h = Math.max(14, 140 * (1 - (rk.rank - 1) / Math.max(1, maxRank)))
                return (
                  <div key={s.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14 }}>
                      {rk.rank}<span style={{ fontSize: 10 }}>{ordSuffix(rk.rank)}</span>
                    </span>
                    <div style={{ width: '100%', maxWidth: 46, height: h, background: rk.rank === 1 ? 'var(--asw-gold)' : 'var(--color-accent)' }} />
                    <span className="micro asw-num">{s.year}</span>
                  </div>
                )
              })}
            </div>
            {/* season table */}
            <table className="table" style={{ flex: '1 1 300px', fontSize: 13 }}>
              <thead>
                <tr><th>Season</th><th>Best</th><th className="num">{scopeLabel[scope]} rank</th><th className="num">Field</th></tr>
              </thead>
              <tbody>
                {[...scoped].reverse().map((s) => (
                  <tr key={s.year}>
                    <td className="asw-num" style={{ fontWeight: 700 }}>{s.year}</td>
                    <td className="asw-time">{s.time}</td>
                    <td className="num asw-num" style={{ fontWeight: 800, color: s[scope].rank === 1 ? 'var(--asw-gold)' : 'inherit' }}>
                      {s[scope].rank}{ordSuffix(s[scope].rank)}
                    </td>
                    <td className="num asw-num text-muted">{s[scope].total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

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
              <div style={{ background: '#1c4e86', color: '#fff', padding: '8px 12px', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center' }}>
                {scopeLabel[scope]} · {genderLabel} {eventName(selected)} · {pool}
              </div>

              {/* Hero rank + time */}
              <div className="rule-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '20px 0' }}>
                <div style={{ background: 'var(--color-accent)', color: '#fff', padding: '10px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <span style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 52, lineHeight: 1 }}>{sel.rank}</span>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, marginLeft: 2, marginTop: 4 }}>{ordSuffix(sel.rank)}</span>
                  </span>
                  {sel.total ? (
                    <span className="asw-num" style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                      of {sel.total} {scopeLabel[scope]}
                    </span>
                  ) : null}
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

      {/* Season-by-season ranking history for the chosen event */}
      <div style={{ marginTop: 28 }}>
        <RankingHistory
          swimmerId={swimmerId}
          rankings={rankings}
          eventName={eventName}
          scope={scope === 'gcc' ? 'arab' : scope}
          scopeLabel={scopeLabel}
        />
      </div>
    </div>
  )
}
