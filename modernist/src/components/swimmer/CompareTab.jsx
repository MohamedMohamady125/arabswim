import { useEffect, useRef, useState } from 'react'
import { searchSwimmers, compareSwimmers } from '../../api/swimmers'
import Flag from '../Flag'
import { Loading, Empty, Seg } from '../ui'
import { formatTime, mediaUrl } from '../../utils'

const FAST = 'var(--asw-fast)'
const NAVY = 'var(--color-accent)'

const initials = (name) => (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')

function Portrait({ s, size = 72 }) {
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
  const [opponentId, setOpponentId] = useState(null)
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
          setResults(l.filter((s) => String(s.id) !== String(swimmerId)).slice(0, 8))
        })
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(searchTimer.current)
  }, [query, swimmerId])

  useEffect(() => {
    if (!opponentId) { setData(null); return }
    let alive = true
    setLoading(true)
    compareSwimmers([swimmerId, opponentId])
      .then((res) => { if (alive) setData(res.data) })
      .catch(() => { if (alive) setData(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [swimmerId, opponentId])

  const [a, b] = data?.swimmers || []

  // Common events only — both swimmers must have a best in the same event+pool
  let rows = []
  let winsA = 0
  let winsB = 0
  let ties = 0
  if (a && b) {
    const pbA = a.personal_bests || {}
    const pbB = b.personal_bests || {}
    rows = Object.keys(pbA)
      .filter((k) => pbB[k])
      .map((k) => {
        const [eventId, pl] = k.split('_')
        const ra = pbA[k]
        const rb = pbB[k]
        const diff = ra.best_cs - rb.best_cs
        return { key: k, eventId: +eventId, pool: pl, eventName: ra.event_name, a: ra, b: rb, diff }
      })
      .filter((r) => pool === 'ALL' || r.pool === pool)
      .sort((x, y) => (x.pool > y.pool ? 1 : x.pool < y.pool ? -1 : x.eventId - y.eventId))
    rows.forEach((r) => { if (r.diff < 0) winsA++; else if (r.diff > 0) winsB++; else ties++ })
  }
  const leader = winsA > winsB ? a : winsB > winsA ? b : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Opponent picker */}
      <div style={{ position: 'relative', maxWidth: 380 }}>
        <div className="card-kicker" style={{ marginBottom: 6 }}>Compare against</div>
        <input
          className="input"
          style={{ width: '100%' }}
          placeholder="Search a swimmer to compare…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, background: '#fff', border: '2px solid var(--color-divider)', borderTop: 0 }}>
            {results.map((s) => (
              <button key={s.id} type="button"
                onClick={() => { setOpponentId(s.id); setQuery(''); setResults([]) }}
                className="hair-b"
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                <Flag code={s.nationality_detail?.code || s.nationality_code} name={s.nationality_detail?.name || s.nationality} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!opponentId ? (
        <Empty label="Pick a swimmer to see the head-to-head" />
      ) : loading ? (
        <Loading label="Comparing" />
      ) : !a || !b ? (
        <Empty label="Comparison unavailable" />
      ) : (
        <>
          {/* Face-off header */}
          <div className="rule-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, flexWrap: 'wrap', paddingBottom: 20 }}>
            {[a, b].map((s, i) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '1 1 240px', flexDirection: i === 0 ? 'row' : 'row-reverse', justifyContent: 'flex-end', textAlign: i === 0 ? 'right' : 'left', order: i === 0 ? 0 : 2 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, lineHeight: 1.15 }}>{s.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, justifyContent: i === 0 ? 'flex-end' : 'flex-start' }}>
                    <Flag code={s.nationality_code} name={s.nationality} />
                    <span className="micro">{s.club || s.nationality}</span>
                  </div>
                  {leader?.id === s.id && <span className="tag tag-dark" style={{ marginTop: 6, display: 'inline-block' }}>LEADS H2H</span>}
                </div>
                <Portrait s={s} />
              </div>
            ))}
            <div style={{ order: 1, flex: 'none', background: 'var(--color-accent)', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, padding: '10px 12px', letterSpacing: '0.08em' }}>
              VS
            </div>
          </div>

          {/* Head-to-head scoreboard */}
          <div style={{ background: 'var(--color-accent-800)', color: '#fff', display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}>
            {[
              { label: a.name.split(' ')[0], n: winsA, on: winsA >= winsB },
              { label: 'Events', n: rows.length, mid: true },
              { label: b.name.split(' ')[0], n: winsB, on: winsB >= winsA },
            ].map((c, i) => (
              <div key={i} style={{ flex: '1 1 0', textAlign: 'center', padding: '16px 10px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.18)' : 'none' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.6 }}>
                  {c.mid ? 'Common events' : `${c.label} wins`}
                </div>
                <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 40, lineHeight: 1.1, color: c.mid ? '#fff' : c.on ? 'var(--asw-gold)' : 'rgba(255,255,255,0.75)' }}>
                  {c.n}
                </div>
              </div>
            ))}
          </div>
          {ties > 0 && <div className="micro" style={{ textAlign: 'center', marginTop: -12 }}>{ties} event{ties !== 1 ? 's' : ''} dead level</div>}

          <Seg
            options={[{ value: 'ALL', label: 'All pools' }, { value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]}
            value={pool}
            onChange={setPool}
          />

          {/* Event-by-event head to head */}
          {rows.length === 0 ? (
            <Empty label="No events in common" />
          ) : (
            <div className="rule-t">
              {rows.map((r) => {
                const aWins = r.diff < 0
                const bWins = r.diff > 0
                const margin = formatTime(Math.abs(r.diff))
                return (
                  <div key={r.key} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0' }}>
                    {/* A time */}
                    <div style={{ flex: '1 1 0', textAlign: 'right' }}>
                      <span className="asw-time" style={{ fontSize: 17, fontWeight: aWins ? 800 : 400, color: aWins ? FAST : 'var(--color-neutral-700)' }}>
                        {r.a.best_time}
                      </span>
                      {aWins && <span className="asw-num" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: FAST }}>faster by {margin}</span>}
                    </div>
                    {/* Event */}
                    <div style={{ flex: '0 0 190px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, textTransform: 'uppercase' }}>{r.eventName}</div>
                      <span className={`tag ${r.pool === 'SCM' ? 'tag-accent-2' : 'tag-accent'}`} style={{ marginTop: 3 }}>{r.pool}</span>
                    </div>
                    {/* B time */}
                    <div style={{ flex: '1 1 0', textAlign: 'left' }}>
                      <span className="asw-time" style={{ fontSize: 17, fontWeight: bWins ? 800 : 400, color: bWins ? FAST : 'var(--color-neutral-700)' }}>
                        {r.b.best_time}
                      </span>
                      {bWins && <span className="asw-num" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: FAST }}>faster by {margin}</span>}
                      {r.diff === 0 && <span className="micro" style={{ display: 'block', color: NAVY }}>dead heat</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
