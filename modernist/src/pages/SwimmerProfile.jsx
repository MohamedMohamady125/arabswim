import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getSwimmer,
  getSwimmerEvents,
  getSwimmerEventHistory,
  getSwimmerProfileStats,
  getSwimmerProgression,
  getSwimmerRankings,
  getSwimmerTransferHistory,
} from '../api/swimmers'
import { getHeldRecords } from '../api/records'
import { getMedals } from '../api/medals'
import Flag from '../components/Flag'
import { Loading, Empty, Seg, MedalIcon } from '../components/ui'
import { formatDate, formatNumber, mediaUrl } from '../utils'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

/* ── Times tab ─────────────────────────────────────────────────────────── */

function EventHistory({ swimmerId, eventId, pool }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    getSwimmerEventHistory(swimmerId, eventId, pool)
      .then((res) => { if (alive) setRows(list(res.data)) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [swimmerId, eventId, pool])

  if (rows === null) return <div className="micro" style={{ padding: '10px 8px' }}>Loading…</div>
  if (rows.length === 0) return <div className="micro" style={{ padding: '10px 8px' }}>No swims</div>

  // chronological order for delta computation (oldest → newest), display newest first
  const chron = [...rows].sort((a, b) => String(a.championship_date || '').localeCompare(String(b.championship_date || '')) || a.id - b.id)
  const deltas = new Map()
  chron.forEach((r, i) => {
    if (i > 0 && r.time_centiseconds != null && chron[i - 1].time_centiseconds != null) {
      deltas.set(r.id, r.time_centiseconds - chron[i - 1].time_centiseconds)
    }
  })
  const display = [...chron].reverse()

  return (
    <table className="table" style={{ fontSize: 13 }}>
      <thead>
        <tr>
          <th>Date</th>
          <th>Meet</th>
          <th>Round</th>
          <th className="time">Time</th>
          <th className="num">Δ</th>
          <th className="num">FINA</th>
          <th className="num">Age</th>
        </tr>
      </thead>
      <tbody>
        {display.map((r) => {
          const d = deltas.get(r.id)
          return (
            <tr key={r.id}>
              <td className="asw-num" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.championship_date)}</td>
              <td>
                <Link to={`/meets/${r.championship_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {r.championship_name}
                </Link>
              </td>
              <td className="text-muted">{r.round_type || '—'}</td>
              <td className="time asw-time">{r.time}</td>
              <td className="num asw-num" style={{ color: d == null ? 'var(--color-neutral-500)' : d < 0 ? 'var(--asw-fast)' : d > 0 ? 'var(--asw-slow)' : 'var(--color-neutral-500)', fontWeight: d != null && d < 0 ? 600 : 400 }}>
                {d == null ? '—' : `${d > 0 ? '+' : d < 0 ? '−' : ''}${(Math.abs(d) / 100).toFixed(2)}`}
              </td>
              <td className="num asw-num">{r.fina_points ?? '—'}</td>
              <td className="num asw-num">{r.age_at_competition ?? '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function TimesTab({ swimmerId, events }) {
  const [pool, setPool] = useState('LCM')
  const [open, setOpen] = useState(null)
  const rows = useMemo(
    () => events.filter((e) => e.pool === pool && (e.times_count || 0) > 0),
    [events, pool]
  )
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Seg
          options={[{ value: 'LCM', label: 'Long course' }, { value: 'SCM', label: 'Short course' }]}
          value={pool}
          onChange={(v) => { setPool(v); setOpen(null) }}
        />
      </div>
      {rows.length === 0 ? (
        <Empty label={`No ${pool} times`} />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Event</th>
              <th className="time">Best time</th>
              <th className="num">Swims</th>
              <th style={{ width: 30 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              [
                <tr key={e.event_id} onClick={() => setOpen(open === e.event_id ? null : e.event_id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>
                    {e.event_name}
                    {e.is_relay && <span className="tag tag-neutral" style={{ marginLeft: 8 }}>Relay</span>}
                  </td>
                  <td className="time asw-time">{e.best_time}</td>
                  <td className="num asw-num">{e.times_count}</td>
                  <td className="num text-muted">{open === e.event_id ? '−' : '+'}</td>
                </tr>,
                open === e.event_id && (
                  <tr key={`${e.event_id}-x`}>
                    <td colSpan={4} style={{ background: 'var(--color-neutral-100)', padding: '8px 16px 16px' }}>
                      <EventHistory swimmerId={swimmerId} eventId={e.event_id} pool={pool} />
                    </td>
                  </tr>
                ),
              ]
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ── Progression tab ───────────────────────────────────────────────────── */

function ProgressionChart({ series }) {
  // best time per year for the selected event
  const byYear = new Map()
  for (const p of series?.points || []) {
    const y = parseInt(String(p.date || '').slice(0, 4))
    if (!y || p.time_cs == null) continue
    if (!byYear.has(y) || p.time_cs < byYear.get(y)) byYear.set(y, p.time_cs)
  }
  const data = [...byYear.entries()].sort((a, b) => a[0] - b[0])
  if (data.length === 0) return <Empty label="No progression data" />

  const W = 640, H = 280, PL = 64, PR = 20, PT = 16, PB = 36
  const years = data.map(([y]) => y)
  const times = data.map(([, t]) => t)
  let minT = Math.min(...times), maxT = Math.max(...times)
  if (minT === maxT) { minT -= 100; maxT += 100 }
  const span = maxT - minT
  minT -= span * 0.1; maxT += span * 0.1
  const minY = years[0], maxY = years[years.length - 1]
  const x = (yr) => (maxY === minY ? PL + (W - PL - PR) / 2 : PL + ((yr - minY) / (maxY - minY)) * (W - PL - PR))
  const y = (t) => PT + ((t - minT) / (maxT - minT)) * (H - PT - PB) // faster (lower cs) at top
  const fmt = (cs) => {
    const m = Math.floor(cs / 6000), s = ((cs % 6000) / 100)
    return m ? `${m}:${s.toFixed(1).padStart(4, '0')}` : s.toFixed(1)
  }
  const gridT = [0, 0.25, 0.5, 0.75, 1].map((f) => minT + f * (maxT - minT))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 720, display: 'block' }}>
      {gridT.map((t, i) => (
        <g key={i}>
          <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--color-neutral-300)" strokeWidth="1" />
          <text x={PL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-neutral-700)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(t)}
          </text>
        </g>
      ))}
      {years.map((yr) => (
        <text key={yr} x={x(yr)} y={H - PB + 20} textAnchor="middle" fontSize="11" fill="var(--color-neutral-700)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {yr}
        </text>
      ))}
      <polyline
        points={data.map(([yr, t]) => `${x(yr)},${y(t)}`).join(' ')}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
      />
      {data.map(([yr, t]) => (
        <g key={yr}>
          <circle cx={x(yr)} cy={y(t)} r="4" fill="var(--color-accent)" />
          <text x={x(yr)} y={y(t) - 10} textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--color-text)" style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-heading)' }}>
            {fmt(t)}
          </text>
        </g>
      ))}
    </svg>
  )
}

function ProgressionTab({ swimmerId }) {
  const [pool, setPool] = useState('LCM')
  const [seriesList, setSeriesList] = useState(null)
  const [eventId, setEventId] = useState(null)

  useEffect(() => {
    let alive = true
    setSeriesList(null)
    getSwimmerProgression(swimmerId, pool)
      .then((res) => {
        if (!alive) return
        const l = list(res.data)
        setSeriesList(l)
        setEventId((prev) => (l.some((s) => s.event_id === prev) ? prev : l[0]?.event_id ?? null))
      })
      .catch(() => { if (alive) setSeriesList([]) })
    return () => { alive = false }
  }, [swimmerId, pool])

  if (seriesList === null) return <Loading label="Loading progression" />
  const selected = seriesList.find((s) => s.event_id === eventId)

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        <Seg
          options={[{ value: 'LCM', label: 'Long course' }, { value: 'SCM', label: 'Short course' }]}
          value={pool}
          onChange={setPool}
        />
        {seriesList.length > 0 && (
          <select className="select" style={{ maxWidth: 240 }} value={eventId ?? ''} onChange={(e) => setEventId(Number(e.target.value))}>
            {seriesList.map((s) => (
              <option key={s.event_id} value={s.event_id}>{s.event_name}</option>
            ))}
          </select>
        )}
      </div>
      {seriesList.length === 0 ? (
        <Empty label={`No ${pool} progression data`} />
      ) : (
        <>
          <div className="micro" style={{ marginBottom: 10 }}>Best time per year · {selected?.event_name} · {pool}</div>
          <ProgressionChart series={selected} />
        </>
      )}
    </div>
  )
}

/* ── main page ─────────────────────────────────────────────────────────── */

export default function SwimmerProfile() {
  const { id } = useParams()
  const [swimmer, setSwimmer] = useState(null)
  const [events, setEvents] = useState([])
  const [stats, setStats] = useState(null)
  const [medals, setMedals] = useState([])
  const [records, setRecords] = useState([])
  const [rankings, setRankings] = useState([])
  const [transfers, setTransfers] = useState(null)
  const [tab, setTab] = useState('times')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setNotFound(false)
    setTab('times')
    async function load() {
      try {
        const [swimRes, eventsRes, statsRes, medalsRes, recordsRes, rankRes, transRes] = await Promise.allSettled([
          getSwimmer(id),
          getSwimmerEvents(id),
          getSwimmerProfileStats(id),
          getMedals({ swimmer: id, page_size: 100 }),
          getHeldRecords({ swimmer: id }),
          getSwimmerRankings(id),
          getSwimmerTransferHistory(id),
        ])
        if (!alive) return
        const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
        const s = val(swimRes)
        if (!s) { setNotFound(true); return }
        setSwimmer(s)
        setEvents(list(val(eventsRes)))
        setStats(val(statsRes))
        setMedals(list(val(medalsRes)))
        setRecords(list(val(recordsRes)))
        setRankings(list(val(rankRes)))
        setTransfers(val(transRes))
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [id])

  const eventNames = useMemo(() => {
    const m = new Map()
    events.forEach((e) => m.set(e.event_id, e.event_name))
    return m
  }, [events])

  if (loading) return <Loading label="Loading swimmer" />
  if (notFound || !swimmer) return <Empty label="Swimmer not found" />

  const isArab = swimmer.nationality_detail?.region === 'ARAB' || swimmer.nationality_detail?.region === 'GCC'
  const tabs = [
    { value: 'times', label: 'Times' },
    { value: 'progression', label: 'Progression' },
    { value: 'medals', label: 'Medals' },
    ...(isArab ? [{ value: 'records', label: 'Records' }, { value: 'rankings', label: 'Rankings' }] : []),
    { value: 'transfers', label: 'Transfers' },
  ]

  return (
    <div>
      {/* header */}
      <div className="pad-lg rule-b" style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {swimmer.photo ? (
          <div className="grayscale" style={{ width: 120, height: 120, flex: 'none', overflow: 'hidden' }}>
            <img src={mediaUrl(swimmer.photo)} alt={swimmer.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <div style={{ width: 120, height: 120, flex: 'none', background: 'var(--color-accent-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 40 }}>
            {initials(swimmer.name)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="kicker" style={{ marginBottom: 6 }}>Swimmer profile</div>
          <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>{swimmer.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 13, color: 'var(--color-neutral-700)', flexWrap: 'wrap' }}>
            <Flag code={swimmer.nationality_detail?.code} name={swimmer.nationality_detail?.name} />
            <span>{swimmer.nationality_detail?.name}</span>
            <span>·</span>
            <span className="asw-num">
              {swimmer.birth_year ? `b. ${swimmer.birth_year}` : ''}
              {swimmer.age != null ? ` · age ${swimmer.age}` : ''}
            </span>
            {swimmer.club && <><span>·</span><span>{swimmer.club}</span></>}
            <span>·</span>
            <span>{swimmer.sex === 'F' ? 'Women' : 'Men'}</span>
            {swimmer.is_retired && <span className="tag tag-neutral">Retired</span>}
          </div>
        </div>
      </div>

      {/* career counts strip */}
      <div className="counts">
        <div><div className="n">{formatNumber(stats?.total_races)}</div><div className="l">Career swims</div></div>
        <div><div className="n">{formatNumber(stats?.total_championships)}</div><div className="l">Meets</div></div>
        <div><div className="n">{formatNumber(stats?.medals?.total)}</div><div className="l">Medals</div></div>
        <div><div className="n">{formatNumber(stats?.total_records ?? records.length)}</div><div className="l">Records held</div></div>
        <div><div className="n">{formatNumber(stats?.best_fina?.points)}</div><div className="l">Best FINA</div></div>
      </div>

      {/* tabs */}
      <div style={{ padding: '20px 32px 0' }}>
        <Seg options={tabs} value={tab} onChange={setTab} />
      </div>

      <div className="pad" style={{ paddingTop: 20 }}>
        {tab === 'times' && <TimesTab swimmerId={id} events={events} />}

        {tab === 'progression' && <ProgressionTab swimmerId={id} />}

        {tab === 'medals' && (
          medals.length === 0 ? (
            <Empty label="No medals" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }} />
                  <th>Event</th>
                  <th>Championship</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {medals.map((m) => (
                  <tr key={m.id}>
                    <td><MedalIcon type={m.medal_type} /></td>
                    <td style={{ fontWeight: 600 }}>{m.event_detail?.name}</td>
                    <td>
                      <Link to={`/meets/${m.championship}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {m.championship_detail?.name}
                      </Link>
                    </td>
                    <td className="asw-num" style={{ whiteSpace: 'nowrap' }}>{formatDate(m.championship_detail?.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === 'records' && (
          records.length === 0 ? (
            <Empty label="No records held" />
          ) : (
            <div className="cellgrid grid-3" style={{ gridTemplateColumns: `repeat(${Math.min(3, records.length)}, 1fr)` }}>
              {records.map((r, i) => (
                <div key={`${r.scope}-${r.event_id}-${r.pool}-${i}`}>
                  <div className="card-kicker">{r.scope} record · {r.pool}</div>
                  <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, margin: '4px 0 2px' }}>{r.time}</div>
                  <div style={{ fontSize: 12 }}>{r.event_name}{r.categories?.length ? ` · ${r.categories.join(', ')}` : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 4 }}>
                    {r.championship_name} · {formatDate(r.date)}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'rankings' && (
          rankings.length === 0 ? (
            <Empty label="No rankings" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Pool</th>
                  <th className="time">Best time</th>
                  <th className="num">National</th>
                  <th className="num">Arab</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r, i) => (
                  <tr key={`${r.event_id}-${r.pool}-${i}`}>
                    <td style={{ fontWeight: 600 }}>{eventNames.get(r.event_id) || `Event ${r.event_id}`}</td>
                    <td className="text-muted">{r.pool}</td>
                    <td className="time asw-time">{r.best_time}</td>
                    <td className="num asw-num">
                      {r.rankings?.national ? <><strong>#{r.rankings.national.rank}</strong><span className="text-muted"> / {r.rankings.national.total}</span></> : '—'}
                    </td>
                    <td className="num asw-num">
                      {r.rankings?.arab ? <><strong>#{r.rankings.arab.rank}</strong><span className="text-muted"> / {r.rankings.arab.total}</span></> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === 'transfers' && (
          !transfers || (transfers.clubs || []).length === 0 ? (
            <Empty label="No club history" />
          ) : (
            <div style={{ maxWidth: 640 }}>
              {(transfers.clubs || []).map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--color-divider)' }}>
                  <div style={{ width: 10, flex: 'none', paddingTop: 5 }}>
                    <div style={{ width: 10, height: 10, background: c.is_current ? 'var(--color-accent)' : 'var(--color-neutral-400)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16 }}>{c.club}</span>
                      {c.country_code && <Flag code={c.country_code} name={c.country} />}
                      {c.is_current && <span className="tag tag-dark">Current</span>}
                      {c.is_national && <span className="tag tag-accent">National team</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 4 }} className="asw-num">
                      {formatDate(c.first_meet)}{c.last_meet && c.last_meet !== c.first_meet ? ` — ${formatDate(c.last_meet)}` : ''}
                      {' · '}{c.meets} meet{c.meets === 1 ? '' : 's'} · {c.results} swim{c.results === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
              ))}
              {(transfers.nationality_changes || []).length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div className="micro" style={{ marginBottom: 8 }}>Nationality changes</div>
                  {transfers.nationality_changes.map((n, i) => (
                    <div key={i} style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--color-divider)' }}>
                      {n.from_country || n.from} → {n.to_country || n.to}{n.date ? ` · ${formatDate(n.date)}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}
