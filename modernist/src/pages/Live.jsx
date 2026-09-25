import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getLiveMeets, getMeetProgram, getMeetLive, getChampionshipStats } from '../api/championships'
import { getMedalSummary } from '../api/medals'
import { formatDateRange, formatNumber } from '../utils'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty } from '../components/ui'

const GOLD = '#c9a227'
const SILVER = '#9aa3ab'
const BRONZE = '#b0713a'
const LIVE_RED = '#c0392b'
const POLL_MS = 60000

// Days elapsed within the meet window (1-based), clamped to [1, total]
function dayProgress(meet) {
  const start = new Date(meet.date?.split('/').reverse().join('-') || meet.date)
  const end = new Date(meet.end_date ? meet.end_date.split('/').reverse().join('-') : start)
  if (Number.isNaN(start.getTime())) return null
  const total = Math.max(1, Math.round((end - start) / 86400000) + 1)
  const current = Math.min(total, Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000) + 1))
  return { current, total }
}

function LivePill({ small = false }) {
  return (
    <span className="tag" style={{
      background: LIVE_RED, color: '#fff', display: 'inline-flex', alignItems: 'center',
      gap: 5, fontSize: small ? 10 : 11,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'pulse 1.4s ease-in-out infinite' }} />
      LIVE
    </span>
  )
}

function MedalDots({ size = 8 }) {
  const dot = (c) => (
    <span style={{ width: size, height: size, borderRadius: '50%', background: c, display: 'inline-block' }} />
  )
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {dot(GOLD)}{dot(SILVER)}{dot(BRONZE)}
    </span>
  )
}

const SESSION_LABEL = { HEATS: 'Heats', SEMIS: 'Semifinals', FINALS: 'Finals' }
const GENDER_LABEL = { M: 'Men', F: 'Women', X: 'Mixed' }

/* One program entry — order no, event name, gender, chips */
function ProgramRow({ item, meetId, hasResults }) {
  const isFinal = item.session === 'FINALS'
  const inner = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
      borderBottom: '1px solid var(--color-divider)', background: hasResults ? '#fff' : 'var(--color-surface)',
    }}>
      <span className="asw-num" style={{
        width: 28, height: 28, borderRadius: 8, flex: 'none', display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 12, fontWeight: 700,
        background: isFinal ? 'var(--color-accent-800)' : 'var(--color-neutral-200)',
        color: isFinal ? '#fff' : 'var(--color-neutral-700)',
      }}>
        {item.order || '·'}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.3 }}>
          {item.event_name}
          <span style={{ fontWeight: 600, color: 'var(--color-neutral-700)' }}> — {GENDER_LABEL[item.gender] || item.gender}</span>
        </div>
        <div className="micro" style={{ marginTop: 2 }}>
          {SESSION_LABEL[item.session] || item.session}
          {item.age_category ? ` · ${item.age_category}` : ''}
        </div>
      </div>
      {isFinal && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700,
          padding: '3px 9px', borderRadius: 999, border: `1px solid ${GOLD}`, color: '#8a6d1a', background: '#fdf8ec',
        }}>
          <MedalDots /> Medal
        </span>
      )}
      {hasResults ? (
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
          background: '#1e7d43', color: '#fff',
        }}>
          Official ›
        </span>
      ) : (
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
          border: '1px solid var(--color-neutral-300)', color: 'var(--color-neutral-600)', background: '#fff',
        }}>
          Scheduled
        </span>
      )}
    </div>
  )
  if (!hasResults) return inner
  return (
    <Link
      to={`/meets/${meetId}?tab=results&event=${item.event}&gender=${item.gender}&day=${item.day}&session=${item.session}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      {inner}
    </Link>
  )
}

/* Program for one day, grouped Morning / Evening */
function DayProgram({ day, meetId, resultKeys }) {
  if (!day || (day.items || []).length === 0) {
    return <Empty label="No program published for this day yet." />
  }
  const groups = [
    ['MORNING', 'Morning session'],
    ['EVENING', 'Evening session'],
  ].map(([key, label]) => [label, day.items.filter((i) => i.time_of_day === key)])
    .filter(([, items]) => items.length > 0)
  // items without a recognized time_of_day
  const rest = day.items.filter((i) => i.time_of_day !== 'MORNING' && i.time_of_day !== 'EVENING')
  if (rest.length > 0) groups.push(['Program', rest])
  return (
    <div>
      {groups.map(([label, items]) => (
        <div key={label} style={{ marginBottom: 18 }}>
          <div className="kicker" style={{ padding: '0 2px', marginBottom: 8 }}>{label}</div>
          <div style={{ border: '1px solid var(--color-neutral-200)', borderRadius: 10, overflow: 'hidden' }}>
            {items.map((item) => (
              <ProgramRow
                key={item.id}
                item={item}
                meetId={meetId}
                hasResults={resultKeys.has(`${item.event}|${item.gender}`)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* Medal standings table */
function MedalsTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <Empty label="Medals will appear here once finals are official." />
  }
  const th = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 10px', color: 'var(--color-neutral-600)' }
  const td = { padding: '9px 10px', fontSize: 13.5, borderTop: '1px solid var(--color-divider)' }
  const medalTh = (c, label) => (
    <th style={{ ...th, textAlign: 'center' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: c, display: 'inline-block' }} />
        <span className="hide-mobile">{label}</span>
      </span>
    </th>
  )
  return (
    <div style={{ border: '1px solid var(--color-neutral-200)', borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: 'var(--color-surface)' }}>
          <tr>
            <th style={{ ...th, textAlign: 'left', width: 40 }}>Rk</th>
            <th style={{ ...th, textAlign: 'left' }}>Country</th>
            {medalTh(GOLD, 'Gold')}
            {medalTh(SILVER, 'Silver')}
            {medalTh(BRONZE, 'Bronze')}
            <th style={{ ...th, textAlign: 'center' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.swimmer__nationality__code || i} style={{ background: i < 3 ? '#fdfaf1' : '#fff' }}>
              <td className="asw-num" style={{ ...td, fontWeight: 700 }}>{i + 1}</td>
              <td style={td}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Flag code={r.swimmer__nationality__code} />
                  <span style={{ fontWeight: 700 }}>{r.swimmer__nationality__code}</span>
                  <span className="hide-mobile" style={{ color: 'var(--color-neutral-700)', fontSize: 12.5 }}>{r.swimmer__nationality__name}</span>
                </span>
              </td>
              <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{r.gold}</td>
              <td className="asw-num" style={{ ...td, textAlign: 'center' }}>{r.silver}</td>
              <td className="asw-num" style={{ ...td, textAlign: 'center' }}>{r.bronze}</td>
              <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 800 }}>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* Live hub for one selected meet: TODAY / SCHEDULE / MEDALS */
function LiveHub({ meet }) {
  const [tab, setTab] = useState('today') // 'today' | 'schedule' | 'medals'
  const [program, setProgram] = useState(null)
  const [live, setLive] = useState(null)
  const [stats, setStats] = useState(null)
  const [medals, setMedals] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const pollRef = useRef(null)

  const refresh = () => {
    getMeetLive(meet.id).then((r) => setLive(r.data)).catch(() => {})
    getChampionshipStats(meet.id).then((r) => setStats(r.data)).catch(() => {})
    getMedalSummary({ championship: meet.id }).then((r) => setMedals(r.data)).catch(() => setMedals([]))
  }

  useEffect(() => {
    setProgram(null); setLive(null); setStats(null); setMedals(null); setSelectedDay(null); setTab('today')
    getMeetProgram(meet.id).then((r) => setProgram(r.data)).catch(() => setProgram({ days: [] }))
    refresh()
    pollRef.current = setInterval(refresh, POLL_MS)
    return () => clearInterval(pollRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meet.id])

  // events with results uploaded → "Official"
  const resultKeys = useMemo(() => {
    const s = new Set()
    for (const e of stats?.events || []) s.add(`${e.event_id}|${e.gender}`)
    return s
  }, [stats])

  const days = program?.days || []
  const todayNum = useMemo(() => {
    const t = (live?.days || []).find((d) => d.is_today)
    if (t) return t.day
    const prog = dayProgress(meet)
    return prog ? prog.current : 1
  }, [live, meet])
  const todayDay = days.find((d) => d.day === todayNum) || days[0]
  const scheduleDay = days.find((d) => d.day === (selectedDay ?? todayNum)) || days[0]

  const finalsDays = useMemo(
    () => new Set(days.filter((d) => (d.items || []).some((i) => i.session === 'FINALS')).map((d) => d.day)),
    [days],
  )

  const loading = !program || !live

  const pill = (key, label) => {
    const active = tab === key
    return (
      <button
        key={key}
        onClick={() => setTab(key)}
        style={{
          padding: '8px 18px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
          background: active ? 'var(--color-accent-800)' : '#fff',
          color: active ? '#fff' : 'var(--color-neutral-700)',
          border: `1px solid ${active ? 'var(--color-accent-800)' : 'var(--color-neutral-300)'}`,
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ marginTop: 20 }}>
      {/* header card */}
      <div style={{
        border: '1px solid var(--color-neutral-200)', borderRadius: 12, overflow: 'hidden', marginBottom: 16,
      }}>
        <div style={{ background: 'var(--color-accent-800)', color: '#fff', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <LivePill />
            {(() => { const p = dayProgress(meet); return p ? <span className="micro" style={{ color: 'rgba(255,255,255,.75)' }}>Day {p.current} of {p.total}</span> : null })()}
            <span className="micro" style={{ color: 'rgba(255,255,255,.75)', marginLeft: 'auto' }}>
              <span className="asw-num" style={{ fontWeight: 700, color: '#fff' }}>{formatNumber(live?.total_results ?? meet.results_count ?? 0)}</span> results in
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, marginTop: 8, lineHeight: 1.25 }}>
            {meet.name}
          </div>
          <div className="micro" style={{ color: 'rgba(255,255,255,.75)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {meet.country_detail && <Flag code={meet.country_detail.code} />}
            {meet.location || meet.country_detail?.name}
            {' · '}{formatDateRange(meet.date, meet.end_date)}
          </div>
        </div>
        {/* pill tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto', background: 'var(--color-surface)' }}>
          {pill('today', 'Today')}
          {pill('schedule', 'Schedule')}
          {pill('medals', 'Medals')}
          <Link
            to={`/meets/${meet.id}`}
            style={{
              marginLeft: 'auto', alignSelf: 'center', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 700,
              textDecoration: 'none', color: 'var(--color-accent-800)',
            }}
          >
            Full meet page ›
          </Link>
        </div>
      </div>

      {loading ? <Loading label="Loading live data" /> : (
        <>
          {tab === 'today' && (
            <DayProgram day={todayDay} meetId={meet.id} resultKeys={resultKeys} />
          )}

          {tab === 'schedule' && (
            <div>
              {/* day chips */}
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, marginBottom: 12 }}>
                {days.map((d) => {
                  const active = d.day === (selectedDay ?? todayNum)
                  const isToday = d.day === todayNum
                  const hasFinals = finalsDays.has(d.day)
                  return (
                    <button
                      key={d.day}
                      onClick={() => setSelectedDay(d.day)}
                      style={{
                        flex: 'none', minWidth: 72, padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                        textAlign: 'center',
                        background: active ? 'var(--color-accent-800)' : '#fff',
                        color: active ? '#fff' : 'inherit',
                        border: `2px solid ${active ? 'var(--color-accent-800)' : hasFinals ? GOLD : 'var(--color-neutral-300)'}`,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: active ? 0.85 : 0.6 }}>
                        {isToday ? 'Today' : `Day ${d.day}`}
                      </div>
                      <div className="asw-num" style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>
                        {d.date ? d.date.slice(8, 10) + '/' + d.date.slice(5, 7) : d.day}
                      </div>
                      {hasFinals && !active && (
                        <div style={{ marginTop: 3 }}><MedalDots size={6} /></div>
                      )}
                    </button>
                  )
                })}
              </div>
              <DayProgram day={scheduleDay} meetId={meet.id} resultKeys={resultKeys} />
            </div>
          )}

          {tab === 'medals' && <MedalsTable rows={medals} />}
        </>
      )}
    </div>
  )
}

/* Selectable meet card (when several meets are live at once) */
function MeetCard({ meet, active, onSelect }) {
  const prog = dayProgress(meet)
  return (
    <button
      onClick={onSelect}
      style={{
        textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%',
        border: `2px solid ${active ? 'var(--color-accent-800)' : 'var(--color-neutral-200)'}`,
        borderRadius: 12, padding: '14px 16px', background: active ? 'var(--color-surface)' : '#fff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <LivePill small />
        {prog && <span className="micro">Day {prog.current} of {prog.total}</span>}
      </div>
      <div style={{ fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 15, lineHeight: 1.25, marginBottom: 6 }}>
        {meet.name}
      </div>
      <div className="micro" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {meet.country_detail && <Flag code={meet.country_detail.code} />}
        {meet.location || meet.country_detail?.name}
      </div>
    </button>
  )
}

export default function Live() {
  const [meets, setMeets] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    getLiveMeets().then((res) => {
      setMeets(res.data)
      if (res.data.length > 0) setSelectedId(res.data[0].id)
    }).catch(() => setMeets([]))
  }, [])

  if (!meets) return <Loading label="Loading live meets" />

  const selected = meets.find((m) => m.id === selectedId) || meets[0]

  return (
    <div>
      <PageHead
        kicker="Live"
        title="Live results"
        sub="Meets happening right now — program, results and medal standings, session by session."
      />
      {meets.length === 0 ? (
        <div className="pad-lg">
          <Empty label="No meets are live right now." />
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <Link to="/calendar" className="btn btn-secondary">See upcoming meets in the calendar</Link>
          </div>
        </div>
      ) : (
        <div className="pad-lg">
          {meets.length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {meets.map((m) => (
                <MeetCard key={m.id} meet={m} active={m.id === selected?.id} onSelect={() => setSelectedId(m.id)} />
              ))}
            </div>
          )}
          {selected && <LiveHub meet={selected} />}
        </div>
      )}
    </div>
  )
}
