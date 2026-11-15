import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { searchSwimmers, getSwimmer, getSwimmerEvents } from '../api/swimmers'
import { getEvents } from '../api/core'
import {
  getSwimmerDna, getSwimmerChase, getSwimmerRivals, getSwimmerConsistency,
  getWhatIf, getOnePercentClub, getDepthRanking,
} from '../api/lab'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg, SectHead } from '../components/ui'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])
const STROKE_ORDER = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley']

// Postel's Law: accept a time however people type it — "51.20", "51,20",
// "1:52.30", "1.52.30", "1 52 30", "1'52\"30" — and return centiseconds.
function parseTime(s) {
  if (!s) return null
  const nums = String(s).trim().split(/[^0-9]+/).filter(Boolean)
  if (nums.length === 0 || nums.length > 4) return null
  let hundredths = 0
  // the last group is hundredths whenever there is more than one group,
  // unless it follows a colon ("2:05" is two minutes five)
  const lastSep = (String(s).trim().match(/[^0-9]+(?=[0-9]+[^0-9]*$)/) || [''])[0]
  if (nums.length > 1 && !lastSep.includes(':')) {
    const frac = nums.pop()
    hundredths = Math.round(parseFloat(`0.${frac}`) * 100)
  }
  const [sec = 0, min = 0, hr = 0] = nums.map((n) => parseInt(n, 10)).reverse()
  const total = (hr * 3600 + min * 60 + sec) * 100 + hundredths
  return total > 0 ? total : null
}
const fmtCs = (cs) => {
  const m = Math.floor(cs / 6000)
  const rest = (cs - m * 6000) / 100
  return m ? `${m}:${rest.toFixed(2).padStart(5, '0')}` : rest.toFixed(2)
}

/* ---- DNA radar (custom SVG, brand tokens only) ---- */
function Radar({ axes, size = 280 }) {
  const R = size / 2 - 52
  const cx = size / 2
  const cy = size / 2
  const n = axes.length
  const pt = (i, r) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]
  }
  const poly = axes.map((a, i) => pt(i, R * (Math.max(0, a.percentile) / 100)).join(',')).join(' ')
  const rings = [0.25, 0.5, 0.75, 1]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: '100%' }} role="img"
      aria-label={`Stroke percentiles: ${axes.map((a) => `${a.stroke} ${Math.max(0, a.percentile)}%`).join(', ')}`}>
      {rings.map((f) => (
        <polygon
          key={f}
          points={axes.map((_, i) => pt(i, R * f).join(',')).join(' ')}
          fill="none"
          stroke="var(--color-neutral-200)"
          strokeWidth="1"
        />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, R)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-neutral-200)" strokeWidth="1" />
      })}
      <polygon points={poly} fill="var(--color-accent)" fillOpacity="0.2" stroke="var(--color-accent)" strokeWidth="2" />
      {axes.map((a, i) => {
        const [x, y] = pt(i, R * (Math.max(0, a.percentile) / 100))
        return <circle key={i} cx={x} cy={y} r="3.5" fill="var(--color-accent)" />
      })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, R + 20)
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="11"
            fontWeight="700"
            fill="var(--color-text)"
          >
            {a.stroke.replace('Individual Medley', 'IM')}
          </text>
        )
      })}
    </svg>
  )
}

/* ---- swimmer search box ---- */
function SwimmerPicker({ onPick }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const debounce = useRef(null)

  useEffect(() => {
    clearTimeout(debounce.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    debounce.current = setTimeout(() => {
      searchSwimmers(q.trim())
        .then((res) => {
          setResults(list(res.data).filter((s) => !s.is_relay_team).slice(0, 8))
          setOpen(true)
        })
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(debounce.current)
  }, [q])

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div ref={box} style={{ position: 'relative', flex: '1 1 300px', maxWidth: 420 }}>
      <input
        className="input"
        placeholder="Search a swimmer…"
        aria-label="Search a swimmer to open their Lab"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true) }}
      />
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderTop: 0, boxShadow: 'var(--shadow-md)' }}>
          {results.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onPick(s); setQ(''); setResults([]); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--color-neutral-200)', cursor: 'pointer', font: 'inherit', fontSize: 13, textAlign: 'left' }}
            >
              <Flag code={s.nationality_detail?.code} name={s.nationality_detail?.name} />
              <span style={{ flex: 1 }}>{s.name}</span>
              <span className="text-muted asw-num" style={{ fontSize: 12 }}>{s.birth_year || ''}</span>
            </button>
          ))}
        </div>
      )}
      {/* Paradox of the Active User: a search with no matches says so */}
      {open && results.length === 0 && q.trim() && (
        <div role="status" className="text-muted" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderTop: 0, boxShadow: 'var(--shadow-md)', padding: '10px 12px', fontSize: 13 }}>
          No swimmers match “{q.trim()}”. Check the spelling.
        </div>
      )}
    </div>
  )
}

/* ---- event picker (grouped by stroke) ---- */
function useEventGroups(pool) {
  const [events, setEvents] = useState([])
  useEffect(() => {
    getEvents({ has_results: true }).then((r) => setEvents(list(r.data))).catch(() => setEvents([]))
  }, [])
  const groups = useMemo(() => {
    const filtered = events.filter((e) => !e.is_relay && e.stroke !== 'Open Water' &&
      !(pool === 'LCM' && e.stroke === 'Individual Medley' && e.distance === 100))
    const g = {}
    for (const e of filtered) { (g[e.stroke] = g[e.stroke] || []).push(e) }
    Object.values(g).forEach((a) => a.sort((x, y) => x.distance - y.distance))
    return Object.keys(g)
      .sort((a, b) => STROKE_ORDER.indexOf(a) - STROKE_ORDER.indexOf(b))
      .map((stroke) => ({ stroke, events: g[stroke] }))
  }, [events, pool])
  return { events, groups }
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ border: '1px solid var(--color-divider)', padding: '14px 16px', flex: '1 1 130px' }}>
      <div className="kicker">{label}</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, lineHeight: 1.1 }}>{value}</div>
      {sub && <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

/* =================== Swimmer Lab =================== */
function SwimmerLab({ swimmerId, onPickSwimmer, onOpenEvents }) {
  const [swimmer, setSwimmer] = useState(null)
  const [dna, setDna] = useState(null)
  const [chase, setChase] = useState(null)
  const [rivals, setRivals] = useState(null)
  const [consistency, setConsistency] = useState(null)
  const [allEvents, setAllEvents] = useState([])
  const [eventId, setEventId] = useState('')
  const [loading, setLoading] = useState(false)
  const [eventLoading, setEventLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // the picked swimmer lives in the URL (?swimmer=), so the Lab can be shared and survives Back
  useEffect(() => {
    if (!swimmerId) { setSwimmer(null); return }
    if (swimmer && String(swimmer.id) === String(swimmerId)) return
    let alive = true
    setLoading(true)
    getSwimmer(swimmerId)
      .then((r) => { if (alive) setSwimmer(r.data) })
      .catch(() => { if (alive) { setSwimmer(null); setLoading(false); onPickSwimmer(null) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swimmerId])

  // load DNA (sets the default event from the swimmer's specialty)
  useEffect(() => {
    if (!swimmer) { setDna(null); setRivals(null); setAllEvents([]); return }
    let alive = true
    setLoading(true)
    setFailed(false)
    getSwimmerDna(swimmer.id)
      .then((r) => {
        if (!alive) return
        setDna(r.data)
        const specialty = r.data.axes.find((a) => a.stroke === r.data.specialty && a.event_id)
        const firstEv = specialty || r.data.axes.find((a) => a.event_id)
        setEventId(firstEv ? String(firstEv.event_id) : '')
      })
      .catch(() => { if (alive) { setDna(null); setFailed(true) } })
      .finally(() => { if (alive) setLoading(false) })
    getSwimmerRivals(swimmer.id).then((r) => { if (alive) setRivals(r.data) }).catch(() => { if (alive) setRivals(null) })
    // every individual event this swimmer has raced, not only the best one per stroke
    getSwimmerEvents(swimmer.id)
      .then((r) => {
        if (!alive) return
        const seen = new Map()
        list(r.data).filter((e) => !e.is_relay && e.pool !== 'OW').forEach((e) => { if (!seen.has(e.event_id)) seen.set(e.event_id, e) })
        setAllEvents([...seen.values()].sort((a, b) => STROKE_ORDER.indexOf(a.stroke) - STROKE_ORDER.indexOf(b.stroke) || a.distance - b.distance))
      })
      .catch(() => { if (alive) setAllEvents([]) })
    return () => { alive = false }
  }, [swimmer, reloadKey])

  // load event-scoped panels when the event changes
  useEffect(() => {
    if (!swimmer || !eventId) { setChase(null); setConsistency(null); return }
    let alive = true
    const p = { event: eventId }
    setEventLoading(true)
    Promise.allSettled([getSwimmerChase(swimmer.id, p), getSwimmerConsistency(swimmer.id, p)]).then(([c, k]) => {
      if (!alive) return
      setChase(c.status === 'fulfilled' ? c.value.data : null)
      setConsistency(k.status === 'fulfilled' ? k.value.data : null)
      setEventLoading(false)
    })
    return () => { alive = false }
  }, [swimmer, eventId])

  const eventOptions = allEvents.length > 0
    ? allEvents
    : (dna?.axes || []).filter((a) => a.event_id)

  return (
    <div>
      <div className="rule-b lab-bar" style={{ padding: '16px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <SwimmerPicker onPick={(sw) => { setSwimmer(sw); onPickSwimmer(sw.id) }} />
        {swimmer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Flag code={swimmer.nationality_detail?.code} name={swimmer.nationality_detail?.name} />
            <Link to={`/swimmers/${swimmer.id}`} style={{ fontWeight: 700, color: 'inherit' }}>{swimmer.name}</Link>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, minHeight: 32 }} onClick={() => { setSwimmer(null); onPickSwimmer(null) }}>Clear</button>
          </div>
        )}
      </div>

      {!swimmer && !loading ? (
        // Paradox of the Active User: say what the Lab gives before asking for a name
        <div className="pad">
          <div className="lab-intro">
            {[
              ['Swimmer DNA', 'Strength in each stroke against the Arab field.'],
              ['The Chase', 'Current rank, who is next ahead and who is closing in.'],
              ['Consistency', 'How steady the times are, and what happens in finals.'],
              ['Rivals', 'Win and loss record against the swimmers raced most.'],
            ].map(([t, d]) => (
              <div key={t}>
                <div className="kicker">{t}</div>
                <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 4 }}>{d}</div>
              </div>
            ))}
          </div>
          <Empty label="Search a swimmer to open their Lab" hint="Type a name in the search box above and pick a swimmer from the list.">
            <button type="button" className="btn btn-secondary" onClick={onOpenEvents}>Or explore an event</button>
          </Empty>
        </div>
      ) : loading || !swimmer ? (
        <Loading label="Crunching numbers" />
      ) : failed ? (
        <Empty label="The Lab could not be loaded" hint="Check your connection and try again.">
          <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </Empty>
      ) : (
        <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {!dna && !(chase && chase.my_rank) && !consistency && !(rivals && rivals.rivals.length > 0) && (
            <Empty label="No Lab numbers for this swimmer yet" hint="There is not enough race data. Try another swimmer." />
          )}
          {/* DNA */}
          {dna && (
            <section>
              <SectHead title="Swimmer DNA" />
              <div className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>
                Best percentile in each stroke across the Arab field. Specialty: <b>{dna.specialty || '—'}</b> · Versatility {dna.versatility}
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <Radar axes={dna.axes} />
                <div style={{ flex: '1 1 240px' }}>
                  {dna.axes.map((a) => (
                    <div key={a.stroke} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--color-neutral-200)' }}>
                      <span style={{ flex: '0 0 130px', fontWeight: 600, fontSize: 13 }}>{a.stroke}</span>
                      <div style={{ flex: 1, height: 8, background: 'var(--color-neutral-200)' }}>
                        <div style={{ width: `${Math.max(0, a.percentile)}%`, height: '100%', background: 'var(--color-accent)' }} />
                      </div>
                      <span className="asw-num" style={{ flex: '0 0 46px', textAlign: 'right', fontSize: 12 }}>
                        {a.event_id ? `${a.percentile}%` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Proximity: the event picker sits right above the two sections it changes */}
          {eventOptions.length > 0 && (
            <div className="lab-eventbar">
              <label htmlFor="lab-swimmer-event" className="kicker">The Chase and Consistency for</label>
              <select id="lab-swimmer-event" className="select" style={{ width: 'auto', maxWidth: '100%' }} value={eventId} onChange={(e) => setEventId(e.target.value)}>
                {eventOptions.map((a) => <option key={a.event_id} value={a.event_id}>{a.event_name}</option>)}
              </select>
              {eventLoading && <span className="text-muted" role="status" style={{ fontSize: 12 }}>Updating…</span>}
            </div>
          )}

          {/* Chase */}
          {chase && chase.my_rank && (
            <section>
              <SectHead title="The Chase" />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <Stat label="Current rank" value={`#${chase.my_rank}`} sub={`of ${Number(chase.field_size).toLocaleString('en-US')} swimmers`} />
                <Stat label="Best time" value={chase.my_time} />
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 280px' }}>
                  <div className="kicker" style={{ marginBottom: 6 }}>Next targets ahead</div>
                  {chase.next_targets.length === 0 ? <div className="text-muted" style={{ fontSize: 13 }}>Top of the field.</div> : (
                    <table className="table"><tbody>
                      {chase.next_targets.map((t) => (
                        <tr key={t.swimmer_id}>
                          <td className="asw-num" style={{ width: 34, fontWeight: 800 }}>#{t.rank}</td>
                          <td><Link to={`/swimmers/${t.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{t.swimmer_name}</Link></td>
                          <td className="time asw-time">{t.time}</td>
                          <td className="asw-num" style={{ color: 'var(--asw-slow)', textAlign: 'right' }}>-{t.gap}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  )}
                </div>
                <div style={{ flex: '1 1 280px' }}>
                  <div className="kicker" style={{ marginBottom: 6 }}>Who's chasing you</div>
                  {chase.chasing_you.length === 0 ? <div className="text-muted" style={{ fontSize: 13 }}>Nobody right behind.</div> : (
                    <table className="table"><tbody>
                      {chase.chasing_you.map((t) => (
                        <tr key={t.swimmer_id}>
                          <td className="asw-num" style={{ width: 34, fontWeight: 800 }}>#{t.rank}</td>
                          <td><Link to={`/swimmers/${t.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{t.swimmer_name}</Link></td>
                          <td className="time asw-time">{t.time}</td>
                          <td className="asw-num" style={{ color: 'var(--asw-fast)', textAlign: 'right' }}>+{t.gap}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  )}
                </div>
              </div>
              {chase.unlock_history.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="kicker" style={{ marginBottom: 6 }}>Unlock history — time to reach each rank</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {chase.unlock_history.map((u) => (
                      <div key={u.rank} style={{ border: '1px solid var(--color-divider)', padding: '8px 12px', minWidth: 96 }}>
                        <div style={{ fontWeight: 800, fontFamily: 'var(--font-heading)' }}>Top {u.rank}</div>
                        <div className="asw-time" style={{ fontSize: 13 }}>{u.time}</div>
                        <div className="text-muted asw-num" style={{ fontSize: 11 }}>drop {u.drop}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Consistency */}
          {consistency && (
            <section>
              <SectHead title="Consistency & Pressure" />
              <div className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>
                Consistency index: 100 means the same time every race, 0 means very uneven. Finals effect: how much faster (+) or slower (−) the final is than the heat.
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Stat label="Consistency index" value={consistency.consistency_index ?? '—'} sub={`${consistency.swim_count} swims`} />
                <Stat
                  label="Finals effect"
                  value={consistency.finals_effect_pct == null ? '—' : `${consistency.finals_effect_pct > 0 ? '+' : ''}${consistency.finals_effect_pct}%`}
                  sub={consistency.finals_sample ? `${consistency.finals_sample} heat→final pairs` : 'no pairs'}
                />
                <Stat label="Best" value={consistency.best_time || '—'} />
                <Stat label="Average" value={consistency.average_time || '—'} />
              </div>
            </section>
          )}

          {/* Rivals */}
          {rivals && rivals.rivals.length > 0 && (
            <section>
              <SectHead title="Rivals — head to head" />
              <div className="table-scroll">
                <table className="table"><thead><tr>
                  <th>Rival</th><th className="num">Races</th><th className="num">W</th><th className="num">L</th><th className="num">Win %</th>
                </tr></thead><tbody>
                  {rivals.rivals.map((r) => {
                    const decided = r.wins + r.losses
                    const pct = decided ? Math.round((100 * r.wins) / decided) : 0
                    return (
                      <tr key={r.swimmer_id}>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Flag code={r.nationality_code} name="" />
                          <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmer_name}</Link>
                        </div></td>
                        <td className="num asw-num">{r.meetings}</td>
                        <td className="num asw-num" style={{ color: 'var(--asw-fast)' }}>{r.wins}</td>
                        <td className="num asw-num" style={{ color: 'var(--asw-slow)' }}>{r.losses}</td>
                        <td className="num asw-num" style={{ fontWeight: 700 }}>{pct}%</td>
                      </tr>
                    )
                  })}
                </tbody></table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

/* =================== Event Lab =================== */
function EventLab() {
  const [scope, setScope] = useState('arab')
  const [gender, setGender] = useState('M')
  const [pool, setPool] = useState('LCM')
  const [eventId, setEventId] = useState('')
  const { groups } = useEventGroups(pool)
  const [timeStr, setTimeStr] = useState('')
  const [whatif, setWhatif] = useState(null)
  const [whatifState, setWhatifState] = useState('') // '' | 'loading' | 'bad' | 'failed'
  const [club, setClub] = useState(null)
  const [depth, setDepth] = useState(null)
  const [fieldState, setFieldState] = useState('loading') // 'loading' | '' | 'failed'
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!eventId && groups.length) setEventId(String(groups[0].events[0].id))
  }, [groups, eventId])

  const params = useMemo(() => ({ event: eventId, scope, gender, pool }), [eventId, scope, gender, pool])

  useEffect(() => {
    // a projection belongs to the field it was made in: clear it when the field changes
    setWhatif(null)
    setWhatifState('')
    if (!eventId) { setClub(null); setDepth(null); return }
    let alive = true
    setFieldState('loading')
    Promise.allSettled([getOnePercentClub(params), getDepthRanking(params)]).then(([c, d]) => {
      if (!alive) return
      setClub(c.status === 'fulfilled' ? c.value.data : null)
      setDepth(d.status === 'fulfilled' ? d.value.data : null)
      setFieldState(c.status === 'fulfilled' || d.status === 'fulfilled' ? '' : 'failed')
    })
    return () => { alive = false }
  }, [params, eventId, reloadKey])

  const runWhatIf = () => {
    const cs = parseTime(timeStr)
    if (!cs || !eventId) { setWhatif(null); setWhatifState('bad'); return }
    setWhatifState('loading')
    getWhatIf({ ...params, time_centiseconds: cs })
      .then((r) => { setWhatif({ ...r.data, typed_cs: cs }); setWhatifState('') })
      .catch(() => { setWhatif(null); setWhatifState('failed') })
  }

  return (
    <div>
      {/* Common Region: the event and the field it is measured in share one bar; the event leads */}
      <div className="rule-b lab-bar" style={{ padding: '14px 32px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="select" aria-label="Event" style={{ width: 'auto', maxWidth: 260 }} value={eventId} onChange={(e) => setEventId(e.target.value)}>
          {groups.map((g) => (
            <optgroup key={g.stroke} label={g.stroke}>
              {g.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </optgroup>
          ))}
        </select>
        <Seg options={[{ value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]} value={gender} onChange={setGender} />
        <Seg options={[{ value: 'LCM', label: '50m pool' }, { value: 'SCM', label: '25m pool' }]} value={pool} onChange={setPool} />
        <Seg options={[{ value: 'arab', label: 'All Arab' }, { value: 'gcc', label: 'GCC only' }]} value={scope} onChange={setScope} />
      </div>

      {!eventId ? <Empty label="Select an event" hint="Choose an event from the list above to see its numbers." /> : (
        <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* What-if */}
          <section>
            <SectHead title="What If — project a time" />
            <div className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>
              Type any time to see where it would rank in this event today.
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ width: 160 }}
                placeholder="e.g. 51.20 or 1:52.30"
                aria-label="Time to project, for example 51.20 or 1:52.30"
                autoComplete="off"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runWhatIf() }}
              />
              <button type="button" className="btn btn-primary" onClick={runWhatIf} disabled={whatifState === 'loading'}>
                {whatifState === 'loading' ? 'Projecting…' : 'Project'}
              </button>
              {(whatifState === 'bad' || whatifState === 'failed') && (
                <span role="alert" style={{ fontSize: 13, color: 'var(--asw-slow)' }}>
                  {whatifState === 'bad' ? 'That does not look like a time. Try 51.20 or 1:52.30.' : 'The projection could not be loaded. Try again.'}
                </span>
              )}
              {whatif && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexBasis: '100%' }} role="status">
                  <Stat label={`${fmtCs(whatif.typed_cs)} would rank`} value={`#${whatif.projected_rank}`} sub={`of ${Number(whatif.field_size).toLocaleString('en-US')} swimmers`} />
                  <Stat label="Faster than" value={whatif.percentile == null ? '—' : `${whatif.percentile}%`} sub="of the field" />
                </div>
              )}
            </div>
          </section>

          {fieldState === 'loading' && <Loading label="Loading the field" />}
          {fieldState === 'failed' && (
            <Empty label="This event's numbers could not be loaded" hint="Check your connection and try again.">
              <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
            </Empty>
          )}
          {fieldState === '' && !(club && club.members.length > 0) && !(depth && depth.countries.length > 0) && (
            <Empty label="No times in this field yet" hint="Try the other pool, the other gender, or All Arab." />
          )}

          {/* 1% Club */}
          {fieldState === '' && club && club.members.length > 0 && (
            <section>
              <SectHead title="The 1% Club" />
              <div className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>
                Within 1% of the leader ({club.leader_time}).
              </div>
              <div className="table-scroll">
                <table className="table"><thead><tr>
                  <th style={{ width: 34 }}>#</th><th>Swimmer</th><th className="time">Time</th><th className="num">Off leader</th>
                </tr></thead><tbody>
                  {club.members.map((m) => (
                    <tr key={m.swimmer_id}>
                      <td className="asw-num" style={{ fontWeight: 800 }}>{m.rank}</td>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Flag code={m.nationality_code} name={m.nationality} />
                        <Link to={`/swimmers/${m.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{m.swimmer_name}</Link>
                      </div></td>
                      <td className="time asw-time">{m.time}</td>
                      <td className="num asw-num">{m.pct_off_leader === 0 ? '—' : `+${m.pct_off_leader}%`}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </section>
          )}

          {/* Depth ranking */}
          {fieldState === '' && depth && depth.countries.length > 0 && (
            <section>
              <SectHead title="Depth Ranking — strongest nations" />
              <div className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>
                Ranked on top-3 average time in this event.
              </div>
              <div className="table-scroll">
                <table className="table"><thead><tr>
                  <th style={{ width: 34 }}>#</th><th>Country</th><th className="num">Swimmers</th><th className="time">Best</th><th className="time">Top-3 avg</th>
                </tr></thead><tbody>
                  {depth.countries.map((c) => (
                    <tr key={c.country_code}>
                      <td className="asw-num" style={{ fontWeight: 800 }}>{c.rank}</td>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Flag code={c.country_code} name={c.country} />{c.country}
                      </div></td>
                      <td className="num asw-num">{c.swimmers}</td>
                      <td className="time asw-time">{c.best_time}</td>
                      <td className="time asw-time">{c.has_top3 ? c.top3_average : '—'}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

export default function Lab() {
  // Working Memory: view and swimmer live in the URL (shareable, survive Back)
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = searchParams.get('view') === 'event' ? 'event' : 'swimmer'
  const swimmerId = searchParams.get('swimmer') || ''
  const setParam = (changes) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    Object.entries(changes).forEach(([k, v]) => { if (v) next.set(k, String(v)); else next.delete(k) })
    return next
  }, { replace: true })
  return (
    <div>
      <PageHead kicker="Experimental" title="ArabSwim Lab" sub="Dig into the numbers behind every swim." />
      <div className="lab-modes" style={{ padding: '12px 32px 0' }}>
        <Seg
          options={[{ value: 'swimmer', label: 'By swimmer' }, { value: 'event', label: 'By event' }]}
          value={mode}
          onChange={(v) => setParam({ view: v === 'event' ? 'event' : '' })}
        />
      </div>
      {mode === 'swimmer'
        ? <SwimmerLab swimmerId={swimmerId} onPickSwimmer={(id) => setParam({ swimmer: id || '' })} onOpenEvents={() => setParam({ view: 'event' })} />
        : <EventLab />}
    </div>
  )
}
