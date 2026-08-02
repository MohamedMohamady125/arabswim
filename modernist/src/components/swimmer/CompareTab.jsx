import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { searchSwimmers, compareSwimmers } from '../../api/swimmers'
import Flag from '../Flag'
import { Loading, Empty, Seg } from '../ui'
import { formatTime, mediaUrl } from '../../utils'

const FAST = 'var(--asw-fast)'
const MAX_TOTAL = 5 // this swimmer + up to 4 opponents

const initials = (name) => (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')

function Portrait({ s, size = 56 }) {
  return s?.photo ? (
    <img src={mediaUrl(s.photo)} alt={s.name} className="grayscale"
      style={{ width: size, height: size, objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
  ) : (
    <div style={{
      width: size, height: size, background: 'var(--color-accent-800)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: size / 2.6,
    }}>
      {initials(s?.name)}
    </div>
  )
}

export default function CompareTab({ swimmerId }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [opponents, setOpponents] = useState([]) // [{id, name}]
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [pool, setPool] = useState('ALL')
  const searchTimer = useRef(null)

  // Debounced opponent search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setResults([]); return }
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      searchSwimmers(query.trim())
        .then((res) => {
          const l = Array.isArray(res.data) ? res.data : res.data?.results || []
          const taken = new Set([String(swimmerId), ...opponents.map((o) => String(o.id))])
          setResults(l.filter((s) => !taken.has(String(s.id))).slice(0, 8))
        })
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(searchTimer.current)
  }, [query, swimmerId, opponents])

  useEffect(() => {
    if (opponents.length === 0) { setData(null); return }
    let alive = true
    setLoading(true)
    compareSwimmers([swimmerId, ...opponents.map((o) => o.id)])
      .then((res) => { if (alive) setData(res.data) })
      .catch(() => { if (alive) setData(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [swimmerId, opponents])

  const swimmers = data?.swimmers || []

  // Head-to-head rows: every event+pool at least 2 of the group have swum
  let rows = []
  const wins = {}
  const pools = new Set()
  if (swimmers.length >= 2) {
    swimmers.forEach((s) => { wins[s.id] = 0 })
    const keys = new Set()
    swimmers.forEach((s) => Object.keys(s.personal_bests || {}).forEach((k) => keys.add(k)))
    rows = [...keys]
      .map((k) => {
        const entries = swimmers.map((s) => s.personal_bests?.[k] || null)
        const present = entries.filter(Boolean)
        if (present.length < 2) return null
        const sep = k.lastIndexOf('_')
        const eventId = +k.slice(0, sep)
        const pl = k.slice(sep + 1)
        const bestCs = Math.min(...present.map((e) => e.best_cs))
        const winners = entries.map((e) => !!e && e.best_cs === bestCs)
        return { key: k, eventId, pool: pl, eventName: present[0].event_name, entries, bestCs, winners }
      })
      .filter(Boolean)
    rows.forEach((r) => { if (r.pool) pools.add(r.pool) })
    rows = rows
      .filter((r) => pool === 'ALL' || r.pool === pool)
      .sort((x, y) => (x.pool > y.pool ? 1 : x.pool < y.pool ? -1 : x.eventId - y.eventId))
    rows.forEach((r) => {
      const winnerCount = r.winners.filter(Boolean).length
      if (winnerCount === 1) {
        const wi = r.winners.indexOf(true)
        wins[swimmers[wi].id]++
      }
    })
  }
  const maxWins = Math.max(0, ...Object.values(wins))
  const leaders = swimmers.filter((s) => wins[s.id] === maxWins && maxWins > 0)
  const leaderId = leaders.length === 1 ? leaders[0].id : null

  const poolOptions = [{ value: 'ALL', label: 'All pools' },
    ...['LCM', 'SCM'].filter((p) => pools.has(p)).map((p) => ({ value: p, label: p }))]

  const canAdd = opponents.length < MAX_TOTAL - 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Opponent picker + chips */}
      <div>
        <div className="card-kicker" style={{ marginBottom: 6 }}>
          Compare against · up to {MAX_TOTAL - 1} swimmers
        </div>
        {opponents.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {opponents.map((o) => (
              <span key={o.id} className="tag tag-dark" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                {o.name}
                <button type="button" onClick={() => setOpponents((l) => l.filter((x) => x.id !== o.id))}
                  style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {canAdd && (
          <div style={{ position: 'relative', maxWidth: 380 }}>
            <input
              className="input"
              style={{ width: '100%' }}
              placeholder="Search a swimmer to add…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {results.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, background: '#fff', border: '2px solid var(--color-divider)', borderTop: 0 }}>
                {results.map((s) => (
                  <button key={s.id} type="button"
                    onClick={() => { setOpponents((l) => [...l, { id: s.id, name: s.name }]); setQuery(''); setResults([]) }}
                    className="hair-b"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                    <Flag code={s.nationality_detail?.code || s.nationality_code} name={s.nationality_detail?.name || s.nationality} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {opponents.length === 0 ? (
        <Empty label="Add swimmers to see the head-to-head" />
      ) : loading ? (
        <Loading label="Comparing" />
      ) : swimmers.length < 2 ? (
        <Empty label="Comparison unavailable" />
      ) : (
        <>
          {/* Scoreboard strip — one cell per swimmer */}
          <div style={{ background: 'var(--color-accent-800)', color: '#fff', display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
            {swimmers.map((s, i) => {
              const leads = leaderId === s.id
              return (
                <div key={s.id} style={{ flex: '1 1 150px', textAlign: 'center', padding: '16px 10px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.18)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><Portrait s={s} size={48} /></div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, lineHeight: 1.2 }}>{s.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}>
                    <Flag code={s.nationality_code} name={s.nationality} />
                    <span style={{ fontSize: 11, opacity: 0.75 }}>{s.age != null ? `Age ${s.age}` : ''}</span>
                  </div>
                  <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 36, lineHeight: 1.15, marginTop: 6, color: wins[s.id] >= maxWins && maxWins > 0 ? 'var(--asw-gold)' : 'rgba(255,255,255,0.8)' }}>
                    {wins[s.id]}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.6 }}>Event wins</div>
                  {leads && <span className="tag" style={{ background: 'var(--asw-gold)', color: '#fff', border: 0, marginTop: 6, display: 'inline-block' }}>LEADS H2H</span>}
                </div>
              )
            })}
          </div>
          <div className="micro" style={{ textAlign: 'center', marginTop: -12 }}>
            {rows.length} common event{rows.length !== 1 ? 's' : ''}{pool !== 'ALL' ? ` · ${pool}` : ''}
          </div>

          {poolOptions.length > 1 && <Seg options={poolOptions} value={pool} onChange={setPool} />}

          {/* Event-by-event table */}
          {rows.length === 0 ? (
            <Empty label="No events in common" />
          ) : (
            <div className="table-scroll">
              <table className="table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Event</th>
                    {swimmers.map((s) => (
                      <th key={s.id} className="time">{s.name.split(' ')[0]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 12 }}>{r.eventName}</span>
                        {r.pool && <span className={`tag ${r.pool === 'SCM' ? 'tag-accent-2' : 'tag-accent'}`} style={{ marginLeft: 8 }}>{r.pool}</span>}
                      </td>
                      {r.entries.map((e, i) => {
                        const isWin = e && r.winners[i]
                        const soleWin = isWin && r.winners.filter(Boolean).length === 1
                        return (
                          <td key={swimmers[i].id} className="time">
                            {!e ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <>
                                <span className="asw-time" style={{ fontSize: 15, fontWeight: isWin ? 800 : 400, color: isWin ? FAST : 'var(--color-neutral-700)' }}>
                                  {e.best_time}
                                </span>
                                {soleWin ? (
                                  <span className="asw-num" style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: FAST }}>fastest</span>
                                ) : isWin ? (
                                  <span className="micro" style={{ display: 'block', color: 'var(--color-accent)' }}>dead heat</span>
                                ) : (
                                  <span className="asw-num" style={{ display: 'block', fontSize: 10.5, color: 'var(--asw-slow)' }}>+{formatTime(e.best_cs - r.bestCs)}</span>
                                )}
                              </>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
