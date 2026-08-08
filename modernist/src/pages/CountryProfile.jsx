import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCountryProfile, getCountryProgression } from '../api/core'
import { getClassifications } from '../api/championships'
import { getMedalSummary } from '../api/medals'
import Flag from '../components/Flag'
import { Loading, Empty, SectHead, Seg } from '../components/ui'
import { formatDate, formatNumber, formatTime } from '../utils'

// Competition categories shown as medal boxes, in display order.
// Arab is always shown for Arab/GCC countries; the rest only when the
// country has medals in that competition.
const CLASS_ORDER = ['Arab', 'GCC', 'African', 'Asian', 'Mediterranean', 'Islamic', 'World', 'Olympic']
const CLASS_COLORS = {
  Arab: '#1c4e86', GCC: '#7d8a99', African: '#a8402f', Asian: '#a05f2c',
  Mediterranean: '#4a8fc0', Islamic: '#0d7a52', World: '#b98a1e', Olympic: '#0c2340',
}

const STROKES = [
  { value: 'Freestyle', label: 'Free' },
  { value: 'Backstroke', label: 'Back' },
  { value: 'Breaststroke', label: 'Breast' },
  { value: 'Butterfly', label: 'Fly' },
  { value: 'Individual Medley', label: 'IM' },
]

// Flat navy line palette (Modernist — no gradients)
const LINE_HEX = ['#1c4e86', '#4a8fc0', '#0c2340', '#72a4cf', '#2f6cae', '#12253d', '#aecae4', '#17416f']

function SwimmerLink({ id, name }) {
  if (!id) return <span>{name || '—'}</span>
  return (
    <Link to={`/swimmers/${id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
      {name}
    </Link>
  )
}

/* ── Inline flat SVG multi-line progression chart ──
   Time axis inverted: faster (lower cs) is higher.
   Whole-second horizontal gridlines. */
function ProgressionChart({ lines }) {
  const processed = useMemo(() => {
    // best time per date per line, sorted chronologically
    return (lines || []).map((line) => {
      const bestByDate = {}
      ;(line.points || []).forEach((p) => {
        if (!bestByDate[p.date] || p.time_cs < bestByDate[p.date].time_cs) bestByDate[p.date] = p
      })
      return { ...line, points: Object.values(bestByDate).sort((a, b) => String(a.date).localeCompare(String(b.date))) }
    }).filter((l) => l.points.length > 0)
  }, [lines])

  if (processed.length === 0) return <Empty label="No progression data for this selection" />

  const allDates = [...new Set(processed.flatMap((l) => l.points.map((p) => p.date)))].sort()
  let min = Infinity
  let max = -Infinity
  processed.forEach((l) => l.points.forEach((p) => {
    if (p.time_cs < min) min = p.time_cs
    if (p.time_cs > max) max = p.time_cs
  }))
  if (min === Infinity) return <Empty label="No progression data for this selection" />

  const range = Math.max(max - min, 100)
  // whole-second gridlines: step is a whole number of seconds
  const step = Math.max(100, Math.ceil(range / 6 / 100) * 100)
  const loTick = Math.floor((min - range * 0.06) / step) * step
  const hiTick = Math.ceil((max + range * 0.06) / step) * step
  const ticks = []
  for (let cs = loTick; cs <= hiTick; cs += step) ticks.push(cs)

  const W = 960
  const H = 400
  const pL = 74
  const pR = 18
  const pT = 14
  const pB = 42
  const pW = W - pL - pR
  const pH = H - pT - pB

  // faster is higher → smaller cs maps to smaller y
  const y = (cs) => pT + ((cs - loTick) / (hiTick - loTick)) * pH
  const x = (date) => {
    if (allDates.length === 1) return pL + pW / 2
    return pL + (allDates.indexOf(date) / (allDates.length - 1)) * pW
  }

  const maxXLabels = 8
  const xLabels = allDates.length <= maxXLabels
    ? allDates
    : allDates.filter((_, i) => i === 0 || i === allDates.length - 1 || i % Math.ceil(allDates.length / (maxXLabels - 1)) === 0)

  return (
    <div>
      {/* legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginBottom: 10 }}>
        {processed.map((l, i) => (
          <span key={l.event_id ?? l.event_name} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
            <span style={{ width: 12, height: 12, background: LINE_HEX[i % LINE_HEX.length], display: 'inline-block' }} />
            {l.event_name}
          </span>
        ))}
      </div>
      <div className="table-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', minWidth: 560, height: 'auto' }} role="img" aria-label="National best time progression">
          {/* plot frame */}
          <rect x={pL} y={pT} width={pW} height={pH} fill="none" stroke="#12253d" strokeOpacity="0.28" strokeWidth="2" />
          {/* whole-second gridlines + time labels */}
          {ticks.map((cs) => (
            <g key={cs}>
              <line x1={pL} y1={y(cs)} x2={pL + pW} y2={y(cs)} stroke="#12253d" strokeOpacity="0.1" strokeWidth="1" />
              <text x={pL - 8} y={y(cs) + 4} textAnchor="end" fill="#58687c" fontSize="11" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatTime(cs)}
              </text>
            </g>
          ))}
          {/* x labels */}
          {xLabels.map((d) => (
            <g key={d}>
              <line x1={x(d)} y1={pT} x2={x(d)} y2={pT + pH} stroke="#12253d" strokeOpacity="0.06" strokeWidth="1" />
              <text x={x(d)} y={pT + pH + 18} textAnchor="middle" fill="#58687c" fontSize="10.5" letterSpacing="0.05em">
                {formatDate(d)}
              </text>
            </g>
          ))}
          {/* series */}
          {processed.map((l, li) => {
            const color = LINE_HEX[li % LINE_HEX.length]
            const uniq = new Set(l.points.map((p) => p.date))
            const d = uniq.size > 1
              ? l.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.time_cs).toFixed(1)}`).join(' ')
              : null
            return (
              <g key={l.event_id ?? l.event_name}>
                {d && <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />}
                {l.points.map((p, i) => (
                  <rect key={i} x={x(p.date) - 3.5} y={y(p.time_cs) - 3.5} width="7" height="7" fill={color} stroke="#ffffff" strokeWidth="1">
                    <title>
                      {`${l.event_name} — ${formatTime(p.time_cs)}\n${formatDate(p.date)}${p.swimmer ? ` · ${p.swimmer}` : ''}${p.meet ? `\n${p.meet}` : ''}${p.fina ? ` · ${p.fina} pts` : ''}`}
                    </title>
                  </rect>
                ))}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function RecordsTable({ records }) {
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Event</th>
            <th>Sex</th>
            <th className="time">Time</th>
            <th>Swimmer</th>
            <th>Location</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={r.id ?? i}>
              <td><span className="tag tag-outline">{r.record_type || '—'}</span></td>
              <td style={{ fontWeight: 600 }}>{r.event || '—'}</td>
              <td className="text-muted">{r.sex === 'F' ? 'Women' : r.sex === 'M' ? 'Men' : '—'}</td>
              <td className="time asw-time">{r.time || '—'}</td>
              <td><SwimmerLink id={r.swimmer_id} name={r.swimmer} /></td>
              <td className="text-muted">{r.location || '—'}</td>
              <td className="text-muted">{formatDate(r.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CountryProfile() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [btSex, setBtSex] = useState('')
  const [btPool, setBtPool] = useState('')
  const [progStroke, setProgStroke] = useState('Freestyle')
  const [progPool, setProgPool] = useState('LCM')
  const [progLines, setProgLines] = useState([])
  const [progLoading, setProgLoading] = useState(false)
  const [openChamp, setOpenChamp] = useState(null)
  const [classMedals, setClassMedals] = useState(null)

  // Medal tally per competition category (Arab / GCC / African / …)
  useEffect(() => {
    let alive = true
    getClassifications()
      .then(async (res) => {
        const all = Array.isArray(res.data) ? res.data : res.data?.results || []
        const wanted = CLASS_ORDER
          .map((name) => all.find((c) => c.name === name))
          .filter(Boolean)
        const sums = await Promise.all(wanted.map((c) =>
          getMedalSummary({ classification: c.id, country: id })
            .then((r) => {
              const rows = Array.isArray(r.data) ? r.data : r.data?.results || []
              const row = rows[0] || {}
              return { name: c.name, gold: row.gold || 0, silver: row.silver || 0, bronze: row.bronze || 0, total: row.total || 0 }
            })
            .catch(() => ({ name: c.name, gold: 0, silver: 0, bronze: 0, total: 0 }))))
        if (alive) setClassMedals(sums)
      })
      .catch(() => { if (alive) setClassMedals([]) })
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    let alive = true
    setLoading(true)
    getCountryProfile(id)
      .then((res) => alive && setProfile(res.data))
      .catch(() => alive && setProfile(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    if (!profile) return
    let alive = true
    setProgLoading(true)
    getCountryProgression(id, { stroke: progStroke, pool: progPool })
      .then((res) => alive && setProgLines(Array.isArray(res.data) ? res.data : []))
      .catch(() => alive && setProgLines([]))
      .finally(() => alive && setProgLoading(false))
    return () => { alive = false }
  }, [id, profile, progStroke, progPool])

  if (loading) return <Loading label="Loading country profile" />
  if (!profile?.country) return <Empty label="Country not found" />

  const { country, medals } = profile
  const topSwimmers = profile.top_swimmers || []
  const topMedalists = profile.top_medalists || []
  const bestTimes = profile.best_times || []
  const records = profile.records || []
  const hosted = profile.championships_hosted || []
  const participated = profile.championships_participated || []
  const teams = profile.teams || []

  const filteredBest = bestTimes.filter((b) => (!btSex || b.sex === btSex) && (!btPool || b.pool === btPool))
  const newRecords = records.filter((r) => r.is_new)
  const currentRecords = records.filter((r) => !r.is_new)

  // Arab always shown; GCC shown for GCC countries; the rest only when the
  // country actually has medals in that competition.
  const medalBoxes = (classMedals || []).filter((m) =>
    m.name === 'Arab'
    || (m.name === 'GCC' && country.region === 'GCC')
    || m.total > 0)

  return (
    <div>
      {/* header */}
      <div className="pad-lg rule-b">
        <Link to="/countries" style={{ fontSize: 12, textDecoration: 'none' }}>← All countries</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
          <Flag code={country.code} name={country.name} large />
          <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>{country.name}</h1>
          {country.region === 'GCC' ? (
            <span className="tag tag-dark">GCC</span>
          ) : country.region === 'ARAB' ? (
            <span className="tag tag-accent">Arab</span>
          ) : (
            <span className="tag tag-neutral">Other</span>
          )}
          <span className="micro">{country.code}</span>
          {/* medal summary */}
          {medals && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 18, alignItems: 'baseline' }}>
              {[
                ['G', medals.gold, 'var(--asw-gold)'],
                ['S', medals.silver, 'var(--asw-silver)'],
                ['B', medals.bronze, 'var(--asw-bronze)'],
                ['Σ', medals.total, 'var(--color-text)'],
              ].map(([l, n, color]) => (
                <span key={l} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
                  <span className="micro">{l}</span>
                  <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color }}>
                    {formatNumber(n)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* medals by competition */}
      {medalBoxes.length > 0 && (
        <div className="pad-lg rule-b">
          <SectHead title="Medals by Competition" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {medalBoxes.map((m) => (
              <div key={m.name} className="asw-fade-up" style={{ background: CLASS_COLORS[m.name] || 'var(--color-accent)', color: '#fff', padding: '12px 18px', minWidth: 150, flex: '1 1 150px', maxWidth: 240 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.75 }}>{m.name}</div>
                <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, lineHeight: 1.1, marginTop: 2 }}>{formatNumber(m.total)}</div>
                <div className="asw-num" style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12, fontWeight: 700 }}>
                  <span style={{ color: 'var(--asw-gold)' }}>{m.gold}G</span>
                  <span style={{ color: 'var(--asw-silver)' }}>{m.silver}S</span>
                  <span style={{ color: '#e3a869' }}>{m.bronze}B</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* performance progression */}
      <div className="pad-lg rule-b">
        <SectHead title="Performance Progression">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Seg options={STROKES} value={progStroke} onChange={setProgStroke} />
            <Seg
              options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]}
              value={progPool}
              onChange={setProgPool}
            />
          </div>
        </SectHead>
        <div className="micro" style={{ marginBottom: 14 }}>National best per event over time — higher is faster</div>
        {progLoading ? <Loading label="Loading progression" /> : <ProgressionChart lines={progLines} />}
      </div>

      {/* top swimmers + top medalists */}
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        <div className="pad-lg rule-r">
          <SectHead title={`Top Swimmers by FINA · ${topSwimmers.length}`} />
          {topSwimmers.length === 0 ? (
            <Empty label="No swimmers on record" />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <th>Swimmer</th>
                    <th>Best event</th>
                    <th className="time">Time</th>
                    <th className="num">FINA</th>
                  </tr>
                </thead>
                <tbody>
                  {topSwimmers.map((s, i) => (
                    <tr key={s.id}>
                      <td className="asw-num">{i + 1}</td>
                      <td>
                        <SwimmerLink id={s.id} name={s.name} />
                        <span className="text-muted" style={{ fontSize: 12 }}> · {s.sex === 'F' ? 'W' : 'M'}</span>
                      </td>
                      <td>{s.best_event || '—'}</td>
                      <td className="time asw-time">{s.best_time || '—'}</td>
                      <td className="num asw-num">{s.best_fina ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="pad-lg">
          <SectHead title={`Top Medalists · ${topMedalists.length}`} />
          {topMedalists.length === 0 ? (
            <Empty label="No medals yet" />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <th>Swimmer</th>
                    <th className="num">G</th>
                    <th className="num">S</th>
                    <th className="num">B</th>
                    <th className="num">Σ</th>
                  </tr>
                </thead>
                <tbody>
                  {topMedalists.map((m, i) => (
                    <tr key={m.id ?? i}>
                      <td className="asw-num">{i + 1}</td>
                      <td><SwimmerLink id={m.id} name={m.name} /></td>
                      <td className="num asw-num" style={{ fontWeight: 800, color: 'var(--asw-gold)' }}>{m.gold}</td>
                      <td className="num asw-num">{m.silver}</td>
                      <td className="num asw-num">{m.bronze}</td>
                      <td className="num asw-num" style={{ fontWeight: 800 }}>{m.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* national best times */}
      <div className="rule-t pad-lg">
        <SectHead title={`National Best Times · ${filteredBest.length}`}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Seg
              options={[{ value: '', label: 'All' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
              value={btSex}
              onChange={setBtSex}
            />
            <Seg
              options={[{ value: '', label: 'All Pools' }, { value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]}
              value={btPool}
              onChange={setBtPool}
            />
          </div>
        </SectHead>
        {filteredBest.length === 0 ? (
          <Empty label="No times on record" />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Sex</th>
                  <th>Pool</th>
                  <th className="time">Time</th>
                  <th className="num">FINA</th>
                  <th>Swimmer</th>
                  <th className="num">Age</th>
                  <th>Championship</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredBest.map((t, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{t.event}</td>
                    <td className="text-muted">{t.sex === 'F' ? 'Women' : 'Men'}</td>
                    <td className="text-muted">{t.pool}</td>
                    <td className="time asw-time">{t.time}</td>
                    <td className="num asw-num">{t.fina ?? '—'}</td>
                    <td><SwimmerLink id={t.swimmer_id} name={t.swimmer} /></td>
                    <td className="num asw-num">{t.age_at_competition || '—'}</td>
                    <td className="text-muted">{t.championship || '—'}</td>
                    <td className="text-muted">{formatDate(t.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* records */}
      {newRecords.length > 0 && (
        <div className="rule-t pad-lg">
          <SectHead title={`New Records · ${newRecords.length}`} to="/new-records" linkLabel="All new records" />
          <RecordsTable records={newRecords} />
        </div>
      )}
      <div className="rule-t pad-lg">
        <SectHead title={`Records Held · ${currentRecords.length}`} />
        {currentRecords.length === 0 ? <Empty label="No records held" /> : <RecordsTable records={currentRecords} />}
      </div>

      {/* championships participated */}
      {participated.length > 0 && (
        <div className="rule-t pad-lg">
          <SectHead title={`Championships Participated · ${participated.length}`} />
          <div>
            {participated.map((c) => {
              const isOpen = openChamp === c.id
              return (
                <div key={c.id} className="hair-b">
                  <button
                    type="button"
                    onClick={() => setOpenChamp(isOpen ? null : c.id)}
                    style={{
                      display: 'flex', width: '100%', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                      padding: '12px 0', background: 'none', border: 0, cursor: 'pointer',
                      font: 'inherit', textAlign: 'left', color: 'inherit',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 220 }}>
                      <span style={{ fontWeight: 600, display: 'block' }}>{c.name}</span>
                      <span className="text-muted" style={{ fontSize: 12 }}>
                        {formatDate(c.date)} · {c.pool}{c.location ? ` · ${c.location}` : ''}
                      </span>
                    </span>
                    <span className="asw-num text-muted" style={{ fontSize: 12 }}>
                      {c.swimmers_count} swimmers · {c.results_count} results
                    </span>
                    {c.medals?.total > 0 && (
                      <span className="asw-num" style={{ fontSize: 12, display: 'inline-flex', gap: 8 }}>
                        {c.medals.gold > 0 && <span style={{ color: 'var(--asw-gold)', fontWeight: 800 }}>{c.medals.gold}G</span>}
                        {c.medals.silver > 0 && <span style={{ color: 'var(--asw-silver)', fontWeight: 800 }}>{c.medals.silver}S</span>}
                        {c.medals.bronze > 0 && <span style={{ color: 'var(--asw-bronze)', fontWeight: 800 }}>{c.medals.bronze}B</span>}
                      </span>
                    )}
                    <span className="micro">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 0 16px' }}>
                      <Link to={`/meets/${c.id}`} style={{ fontSize: 12 }}>View full meet details →</Link>
                      {Array.isArray(c.swimmers) && c.swimmers.length > 0 && (
                        <>
                          <div className="micro" style={{ margin: '12px 0 6px' }}>Athletes · {c.swimmers.length}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '2px 16px' }}>
                            {c.swimmers.map((s) => (
                              <Link key={s.id} to={`/swimmers/${s.id}`}
                                style={{ color: 'inherit', textDecoration: 'none', fontSize: 13, padding: '2px 0' }}>
                                {s.name} <span className="text-muted" style={{ fontSize: 11 }}>{s.sex === 'F' ? 'W' : 'M'}</span>
                              </Link>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* hosted + teams */}
      <div className="rule-t grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        <div className="pad-lg rule-r">
          <SectHead title={`Championships Hosted · ${hosted.length}`} />
          {hosted.length === 0 ? (
            <Empty label="No championships hosted" />
          ) : (
            <div>
              {hosted.map((c) => (
                <Link key={c.id} to={`/meets/${c.id}`} className="hair-b"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', color: 'inherit', textDecoration: 'none' }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600, display: 'block' }}>{c.name}</span>
                    <span className="text-muted" style={{ fontSize: 12 }}>{c.location}</span>
                  </span>
                  <span className="text-muted asw-num" style={{ fontSize: 12, textAlign: 'right', flex: 'none' }}>
                    {formatDate(c.date)}<br />{c.pool}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="pad-lg">
          <SectHead title={`Teams · ${teams.length}`} />
          {teams.length === 0 ? (
            <Empty label="No teams" />
          ) : (
            <div>
              {teams.map((t) => (
                <Link key={t.id} to={`/teams/${t.id}`} className="hair-b"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', color: 'inherit', textDecoration: 'none' }}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  {t.is_national_team && <span className="tag tag-dark">National team</span>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
