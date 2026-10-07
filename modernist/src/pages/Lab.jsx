import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchSwimmers } from '../api/swimmers'
import { getEvents } from '../api/core'
import {
  getSwimmerDna, getSwimmerChase, getSwimmerRivals, getSwimmerConsistency,
  getWhatIf, getOnePercentClub, getDepthRanking,
} from '../api/lab'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg, SectHead } from '../components/ui'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])
const STROKE_ORDER = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley']

// "mm:ss.hh" / "ss.hh" -> centiseconds
function parseTime(s) {
  if (!s) return null
  const parts = String(s).trim().split(':')
  let sec
  if (parts.length === 1) sec = parseFloat(parts[0])
  else if (parts.length === 2) sec = parseInt(parts[0], 10) * 60 + parseFloat(parts[1])
  else if (parts.length === 3) sec = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2])
  else return null
  if (isNaN(sec)) return null
  return Math.round(sec * 100)
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
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: '100%' }}>
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
            fontSize="10.5"
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
function SwimmerLab() {
  const [swimmer, setSwimmer] = useState(null)
  const [dna, setDna] = useState(null)
  const [chase, setChase] = useState(null)
  const [rivals, setRivals] = useState(null)
  const [consistency, setConsistency] = useState(null)
  const [eventId, setEventId] = useState('')
  const [loading, setLoading] = useState(false)

  // load DNA (sets the default event from the swimmer's specialty)
  useEffect(() => {
    if (!swimmer) { setDna(null); return }
    setLoading(true)
    getSwimmerDna(swimmer.id)
      .then((r) => {
        setDna(r.data)
        const specialty = r.data.axes.find((a) => a.stroke === r.data.specialty && a.event_id)
        const firstEv = specialty || r.data.axes.find((a) => a.event_id)
        setEventId(firstEv ? String(firstEv.event_id) : '')
      })
      .catch(() => setDna(null))
      .finally(() => setLoading(false))
    getSwimmerRivals(swimmer.id).then((r) => setRivals(r.data)).catch(() => setRivals(null))
  }, [swimmer])

  // load event-scoped panels when the event changes
  useEffect(() => {
    if (!swimmer || !eventId) { setChase(null); setConsistency(null); return }
    const p = { event: eventId }
    getSwimmerChase(swimmer.id, p).then((r) => setChase(r.data)).catch(() => setChase(null))
    getSwimmerConsistency(swimmer.id, p).then((r) => setConsistency(r.data)).catch(() => setConsistency(null))
  }, [swimmer, eventId])

  const eventOptions = (dna?.axes || []).filter((a) => a.event_id)

  return (
    <div>
      <div className="rule-b" style={{ padding: '16px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <SwimmerPicker onPick={setSwimmer} />
        {swimmer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Flag code={swimmer.nationality_detail?.code} name={swimmer.nationality_detail?.name} />
            <span style={{ fontWeight: 700 }}>{swimmer.name}</span>
          </div>
        )}
        {eventOptions.length > 0 && (
          <select className="select" style={{ width: 'auto', marginLeft: 'auto' }} value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {eventOptions.map((a) => <option key={a.event_id} value={a.event_id}>{a.event_name}</option>)}
          </select>
        )}
      </div>

      {!swimmer ? (
        <Empty label="Search a swimmer to open their Lab" />
      ) : loading ? (
        <Loading label="Crunching numbers" />
      ) : (
        <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
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

          {/* Chase */}
          {chase && chase.my_rank && (
            <section>
              <SectHead title="The Chase" />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <Stat label="Current rank" value={`#${chase.my_rank}`} sub={`of ${chase.field_size}`} />
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
  const [club, setClub] = useState(null)
  const [depth, setDepth] = useState(null)

  useEffect(() => {
    if (!eventId && groups.length) setEventId(String(groups[0].events[0].id))
  }, [groups, eventId])

  const params = useMemo(() => ({ event: eventId, scope, gender, pool }), [eventId, scope, gender, pool])

  useEffect(() => {
    if (!eventId) { setClub(null); setDepth(null); return }
    getOnePercentClub(params).then((r) => setClub(r.data)).catch(() => setClub(null))
    getDepthRanking(params).then((r) => setDepth(r.data)).catch(() => setDepth(null))
  }, [params, eventId])

  const runWhatIf = () => {
    const cs = parseTime(timeStr)
    if (!cs || !eventId) { setWhatif(null); return }
    getWhatIf({ ...params, time_centiseconds: cs }).then((r) => setWhatif(r.data)).catch(() => setWhatif(null))
  }

  return (
    <div>
      <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Seg options={[{ value: 'arab', label: 'Arab' }, { value: 'gcc', label: 'GCC' }]} value={scope} onChange={setScope} />
          <Seg options={[{ value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }]} value={gender} onChange={setGender} />
          <Seg options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]} value={pool} onChange={setPool} />
        </div>
        <select className="select" style={{ width: 'auto', maxWidth: 260 }} value={eventId} onChange={(e) => setEventId(e.target.value)}>
          {groups.map((g) => (
            <optgroup key={g.stroke} label={g.stroke}>
              {g.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {!eventId ? <Empty label="Select an event" /> : (
        <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* What-if */}
          <section>
            <SectHead title="What If — project a time" />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ width: 160 }}
                placeholder="e.g. 51.20 or 1:52.30"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runWhatIf() }}
              />
              <button className="btn btn-primary" onClick={runWhatIf}>Project</button>
              {whatif && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Stat label="Projected rank" value={`#${whatif.projected_rank}`} sub={`of ${whatif.field_size}`} />
                  <Stat label="Percentile" value={whatif.percentile == null ? '—' : `${whatif.percentile}%`} />
                </div>
              )}
            </div>
          </section>

          {/* 1% Club */}
          {club && club.members.length > 0 && (
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
          {depth && depth.countries.length > 0 && (
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
  const [mode, setMode] = useState('swimmer')
  return (
    <div>
      <PageHead kicker="Experimental" title="ArabSwim Lab" sub="Dig into the numbers behind every swim." />
      <div style={{ padding: '12px 32px 0' }}>
        <Seg
          options={[{ value: 'swimmer', label: 'Swimmer' }, { value: 'event', label: 'Event' }]}
          value={mode}
          onChange={setMode}
        />
      </div>
      {mode === 'swimmer' ? <SwimmerLab /> : <EventLab />}
    </div>
  )
}
