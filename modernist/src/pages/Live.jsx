import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getLiveMeets, getMeetProgram, getMeetLive, getChampionshipStats, getChampionshipResults } from '../api/championships'
import { getMedalSummary } from '../api/medals'
import { formatDateRange, formatNumber } from '../utils'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, MedalIcon } from '../components/ui'
import AthleteMeetCard from '../components/meets/AthleteMeetCard'

const GOLD = 'var(--asw-gold)'
const SILVER = 'var(--asw-silver)'
const BRONZE = 'var(--asw-bronze)'
const LIVE_RED = 'var(--asw-slow)'
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
    <span style={{
      background: LIVE_RED, color: '#fff', display: 'inline-flex', alignItems: 'center',
      gap: 6, fontSize: small ? 10 : 11, fontWeight: 800, letterSpacing: '0.1em',
      padding: small ? '3px 9px' : '4px 12px', borderRadius: 999,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'pulse 1.4s ease-in-out infinite' }} />
      LIVE
    </span>
  )
}

function MedalDots({ size = 8, gap = 3 }) {
  const dot = (c) => (
    <span style={{ width: size, height: size, borderRadius: '50%', background: c, display: 'inline-block' }} />
  )
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      {dot(GOLD)}{dot(SILVER)}{dot(BRONZE)}
    </span>
  )
}

const SESSION_LABEL = { HEATS: 'Heats', SEMIS: 'Semifinals', FINALS: 'Finals' }
const GENDER_STYLE = {
  M: { label: 'Men', color: 'var(--color-accent)', bg: 'var(--color-accent-100)' },
  F: { label: 'Women', color: 'var(--color-accent-2-700)', bg: 'var(--color-accent-2-100)' },
  X: { label: 'Mixed', color: 'var(--color-neutral-700)', bg: 'var(--color-neutral-200)' },
}

/* Inline result list inside an expanded program row — app style, no navigation */
function InlineResults({ meetId, meet, item }) {
  const [rows, setRows] = useState(null)
  const [athlete, setAthlete] = useState(null)
  const isFinal = item.session === 'FINALS'

  useEffect(() => {
    const params = { event: item.event, gender: item.gender }
    if (item.session === 'HEATS') params.round_type = 'Prelims'
    getChampionshipResults(meetId, params)
      .then((res) => setRows(Array.isArray(res.data) ? res.data : res.data?.results || []))
      .catch(() => setRows([]))
  }, [meetId, item.event, item.gender, item.session])

  if (rows === null) return <div style={{ padding: '6px 0' }}><Loading label="Loading results" /></div>
  if (rows.length === 0) {
    return <div style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--color-neutral-600)' }}>No results uploaded yet.</div>
  }
  return (
    <div className="live-fade-in" style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-neutral-200)' }}>
      {athlete && (
        <AthleteMeetCard swimmer={athlete} meet={{ id: meetId, name: meet?.name }} onClose={() => setAthlete(null)} />
      )}
      <div style={{ maxHeight: 430, overflowY: 'auto' }}>
        {rows.map((r, i) => {
          const clickable = r.swimmer_detail && !r.swimmer_detail.is_relay_team
          return (
            <div
              key={r.id}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => clickable && setAthlete(r.swimmer_detail)}
              onKeyDown={(e) => { if (e.key === 'Enter' && clickable) setAthlete(r.swimmer_detail) }}
              className={clickable ? 'live-result-row' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                borderBottom: '1px solid var(--color-neutral-200)', background: '#fff',
                cursor: clickable ? 'pointer' : 'default',
              }}
            >
              <span style={{ width: 24, flex: 'none', display: 'flex', justifyContent: 'center' }}>
                {r.is_hc ? (
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--color-neutral-500)' }}>{r.hc_type || 'HC'}</span>
                ) : isFinal && i <= 2 ? (
                  <MedalIcon type={['GOLD', 'SILVER', 'BRONZE'][i]} size={18} style={{ display: 'block' }} />
                ) : (
                  <span className="asw-num" style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--color-neutral-500)' }}>
                    {r.original_rank || i + 1}
                  </span>
                )}
              </span>
              <Flag code={r.nationality_detail?.code || r.swimmer_detail?.nationality_detail?.code} />
              <span style={{
                flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {r.swimmer_detail?.name}
              </span>
              {r.reaction_time && (
                <span className="asw-num hide-mobile" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-neutral-500)', flex: 'none' }}>
                  RT {Number(r.reaction_time).toFixed(2)}
                </span>
              )}
              <span className="asw-time" style={{ fontWeight: 800, fontSize: 13.5, flex: 'none' }}>
                {r.formatted_time}
              </span>
              <span className="asw-num hide-mobile" style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-neutral-500)', width: 34, textAlign: 'right', flex: 'none' }}>
                {r.fina_points || '—'}
              </span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px' }}>
        <Link
          to={`/meets/${meetId}?tab=results&event=${item.event}&gender=${item.gender}&day=${item.day}&session=${item.session}`}
          style={{ fontSize: 11.5, fontWeight: 800, textDecoration: 'none', color: 'var(--color-accent)' }}
        >
          Heats, splits & more ›
        </Link>
      </div>
    </div>
  )
}

/* One program entry — order no, event name, gender, chips. Official rows expand in place. */
function ProgramRow({ item, meetId, meet, hasResults, last }) {
  const [open, setOpen] = useState(false)
  const isFinal = item.session === 'FINALS'
  const g = GENDER_STYLE[item.gender] || GENDER_STYLE.X
  const inner = (
    <div className="live-row" style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
      borderBottom: last ? 'none' : '1px solid var(--color-neutral-200)',
      background: '#fff',
    }}>
      <span className="asw-num" style={{
        width: 30, height: 30, borderRadius: '50%', flex: 'none', display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 12.5, fontWeight: 800,
        background: isFinal ? 'var(--color-accent-800)' : '#fff',
        color: isFinal ? '#fff' : 'var(--color-neutral-700)',
        border: isFinal ? 'none' : '1.5px solid var(--color-neutral-300)',
      }}>
        {item.order || '–'}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, lineHeight: 1.3 }}>
            {item.event_name}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
            padding: '2px 8px', borderRadius: 4, background: g.bg, color: g.color, flex: 'none',
          }}>
            {g.label}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-neutral-600)', marginTop: 3, fontWeight: 600 }}>
          {SESSION_LABEL[item.session] || item.session}
          {item.age_category ? ` · ${item.age_category}` : ''}
        </div>
      </div>
      {isFinal && (
        <span className="hide-mobile" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800,
          letterSpacing: '0.04em', padding: '4px 10px', borderRadius: 999,
          border: '1px solid color-mix(in srgb, var(--asw-gold) 40%, #fff)', color: 'var(--asw-gold)',
          background: 'color-mix(in srgb, var(--asw-gold) 8%, #fff)', flex: 'none',
        }}>
          <MedalDots size={7} /> MEDAL
        </span>
      )}
      {hasResults ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none',
          fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', padding: '4px 11px', borderRadius: 999,
          background: 'var(--asw-fast)', color: '#fff',
        }}>
          OFFICIAL
          <span className="live-chevron" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' }}>›</span>
        </span>
      ) : (
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', padding: '4px 11px', borderRadius: 999, flex: 'none',
          border: '1px solid var(--color-neutral-300)', color: 'var(--color-neutral-500)', background: '#fff',
        }}>
          SCHEDULED
        </span>
      )}
    </div>
  )
  if (!hasResults) return inner
  return (
    <div>
      <div
        className="live-row-link"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter') setOpen((v) => !v) }}
        style={{ cursor: 'pointer' }}
      >
        {inner}
      </div>
      {open && <InlineResults meetId={meetId} meet={meet} item={item} />}
    </div>
  )
}

/* Program for one day, grouped Morning / Evening as session cards */
function DayProgram({ day, meetId, meet, resultKeys }) {
  if (!day || (day.items || []).length === 0) {
    return <Empty label="No program published for this day yet." />
  }
  const groups = []
  const morning = day.items.filter((i) => i.time_of_day === 'MORNING')
  const evening = day.items.filter((i) => i.time_of_day === 'EVENING')
  const rest = day.items.filter((i) => i.time_of_day !== 'MORNING' && i.time_of_day !== 'EVENING')
  if (morning.length) groups.push(['Morning', 'Heats & semifinals', morning, false])
  if (evening.length) groups.push(['Evening', 'Finals session', evening, true])
  if (rest.length) {
    const allFinals = rest.every((i) => i.session === 'FINALS')
    groups.push([allFinals ? 'Finals' : 'Program', allFinals ? 'Medal events' : 'All events', rest, allFinals])
  }
  return (
    <div className="live-fade-in" style={{ display: 'grid', gap: 18 }}>
      {groups.map(([label, sub, items, isFinals]) => (
        <div key={label} style={{
          border: '1px solid var(--color-neutral-200)', borderRadius: 14, overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(12,35,64,.05)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
            background: isFinals ? 'var(--color-accent-800)' : 'var(--color-surface)',
            borderBottom: '1px solid var(--color-neutral-200)',
          }}>
            <span style={{
              fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: isFinals ? '#fff' : 'var(--color-accent-800)',
            }}>
              {label}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: isFinals ? 'rgba(255,255,255,.65)' : 'var(--color-neutral-600)' }}>
              {sub}
            </span>
            {isFinals && <span style={{ marginLeft: 'auto' }}><MedalDots size={7} /></span>}
            <span style={{
              marginLeft: isFinals ? 10 : 'auto', fontSize: 11, fontWeight: 700,
              color: isFinals ? 'rgba(255,255,255,.65)' : 'var(--color-neutral-500)',
            }}>
              {items.length} {items.length === 1 ? 'event' : 'events'}
            </span>
          </div>
          {items.map((item, i) => (
            <ProgramRow
              key={item.id}
              item={item}
              meetId={meetId}
              meet={meet}
              hasResults={resultKeys.has(`${item.event}|${item.gender}`)}
              last={i === items.length - 1}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/* Medal standings: top-3 podium cards + full table */
function MedalsPanel({ rows }) {
  if (!rows || rows.length === 0) {
    return <Empty label="Medals will appear here once finals are official." />
  }
  const top3 = rows.slice(0, 3)
  const podiumMeta = [
    { ring: GOLD, label: '1st' },
    { ring: SILVER, label: '2nd' },
    { ring: BRONZE, label: '3rd' },
  ]
  const th = { fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 12px', color: 'var(--color-neutral-600)' }
  const td = { padding: '10px 12px', fontSize: 13.5, borderTop: '1px solid var(--color-neutral-200)' }
  // Olympics-style vertical medal bands: saturated header cell, pale column body
  const medalTh = (c, label, short) => (
    <th style={{ ...th, textAlign: 'center', background: c, color: '#fff', width: 54 }}>
      <span className="hide-mobile">{label}</span>
      <span className="show-mobile-inline">{short}</span>
    </th>
  )
  const band = (c) => `color-mix(in srgb, ${c} 14%, #fff)`
  return (
    <div className="live-fade-in">
      {/* podium cards */}
      <div className="live-podium" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
        {top3.map((r, i) => (
          <div key={r.swimmer__nationality__code || i} style={{
            border: '1px solid var(--color-neutral-200)', borderTop: `3px solid ${podiumMeta[i].ring}`,
            borderRadius: 12, padding: '12px 14px', background: '#fff', minWidth: 0,
            boxShadow: '0 1px 4px rgba(12,35,64,.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-neutral-500)' }}>
                {podiumMeta[i].label}
              </span>
              <Flag code={r.swimmer__nationality__code} />
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14 }}>{r.swimmer__nationality__code}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, lineHeight: 1 }}>
                {r.total}
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-neutral-600)', fontWeight: 700, display: 'inline-flex', gap: 8 }}>
                <span style={{ color: GOLD }}>{r.gold}G</span>
                <span style={{ color: SILVER }}>{r.silver}S</span>
                <span style={{ color: BRONZE }}>{r.bronze}B</span>
              </span>
            </div>
          </div>
        ))}
      </div>
      {/* full table */}
      <div style={{ border: '1px solid var(--color-neutral-200)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(12,35,64,.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead style={{ background: 'var(--color-surface)' }}>
            <tr>
              <th style={{ ...th, textAlign: 'left', width: 40 }}>Rk</th>
              <th style={{ ...th, textAlign: 'left' }}>Country</th>
              {medalTh(GOLD, 'Gold', 'G')}
              {medalTh(SILVER, 'Silver', 'S')}
              {medalTh(BRONZE, 'Bronze', 'B')}
              <th style={{ ...th, textAlign: 'center' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.swimmer__nationality__code || i} style={{ background: i < 3 ? 'color-mix(in srgb, var(--asw-gold) 6%, #fff)' : '#fff' }}>
                <td className="asw-num" style={{ ...td, fontWeight: 800, color: i < 3 ? 'var(--color-accent-800)' : 'inherit' }}>{i + 1}</td>
                <td style={td}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Flag code={r.swimmer__nationality__code} />
                    <span style={{ fontWeight: 800 }}>{r.swimmer__nationality__code}</span>
                    <span className="hide-mobile" style={{ color: 'var(--color-neutral-600)', fontSize: 12.5 }}>{r.swimmer__nationality__name}</span>
                  </span>
                </td>
                <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 800, background: band(GOLD) }}>{r.gold}</td>
                <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 700, background: band(SILVER) }}>{r.silver}</td>
                <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 700, background: band(BRONZE) }}>{r.bronze}</td>
                <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 800 }}>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const [updatedAt, setUpdatedAt] = useState(null)
  const pollRef = useRef(null)
  const chipsRef = useRef(null)

  // keep the selected day chip in view (phones: today can be off-screen)
  useEffect(() => {
    if (tab !== 'schedule') return
    const t = setTimeout(() => {
      chipsRef.current?.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(t)
  }, [tab, selectedDay, program])

  const refresh = () => {
    getMeetLive(meet.id).then((r) => { setLive(r.data); setUpdatedAt(new Date()) }).catch(() => {})
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
  const prog = dayProgress(meet)
  const todayNum = useMemo(() => {
    const t = (live?.days || []).find((d) => d.is_today)
    if (t) return t.day
    return prog ? prog.current : 1
  }, [live, prog])
  const todayDay = days.find((d) => d.day === todayNum) || days[0]
  const scheduleDay = days.find((d) => d.day === (selectedDay ?? todayNum)) || days[0]

  const finalsDays = useMemo(
    () => new Set(days.filter((d) => (d.items || []).some((i) => i.session === 'FINALS')).map((d) => d.day)),
    [days],
  )

  const loading = !program || !live

  const TABS = [
    ['today', 'Today'],
    ['schedule', 'Schedule'],
    ['medals', 'Medals'],
  ]

  const weekday = (iso) => {
    const d = new Date(iso + 'T00:00:00')
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { weekday: 'short' })
  }

  return (
    <div style={{ marginTop: 20 }}>
      {/* ── hero card ── */}
      <div style={{
        borderRadius: 16, overflow: 'hidden', marginBottom: 18,
        boxShadow: '0 4px 18px rgba(12,35,64,.14)',
      }}>
        <div style={{
          background: 'linear-gradient(140deg, var(--color-accent-700), var(--color-accent-900))',
          color: '#fff', padding: '20px 22px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <LivePill />
            {prog && (
              <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,.7)', textTransform: 'uppercase' }}>
                Day {prog.current} of {prog.total}
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>
              <span className="asw-num" style={{ fontWeight: 800, color: '#fff', fontSize: 14 }}>{formatNumber(live?.total_results ?? meet.results_count ?? 0)}</span>
              {' '}results in
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(19px, 3.4vw, 26px)', marginTop: 10, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
            {meet.name}
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.75)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', fontWeight: 600 }}>
            {meet.country_detail && <Flag code={meet.country_detail.code} />}
            {meet.location || meet.country_detail?.name}
            <span style={{ opacity: 0.5 }}>·</span>
            {formatDateRange(meet.date, meet.end_date)}
          </div>
          {/* day progress bar */}
          {prog && prog.total > 1 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
              {Array.from({ length: prog.total }, (_, i) => (
                <span key={i} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: i + 1 < prog.current ? 'rgba(255,255,255,.85)'
                    : i + 1 === prog.current ? LIVE_RED
                    : 'rgba(255,255,255,.22)',
                }} />
              ))}
            </div>
          )}
        </div>
        {/* pill tabs */}
        <div className="live-tabrow" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#fff', borderTop: '1px solid rgba(255,255,255,.1)' }}>
          {TABS.map(([key, label]) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`live-tabpill${active ? ' active' : ''}`}
                style={{
                  padding: '9px 22px', borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  background: active ? 'var(--color-accent-800)' : '#fff',
                  color: active ? '#fff' : 'var(--color-neutral-600)',
                  border: `1.5px solid ${active ? 'var(--color-accent-800)' : 'var(--color-neutral-300)'}`,
                }}
              >
                {label}
              </button>
            )
          })}
          <div className="live-tabmeta" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, flex: 'none' }}>
            {updatedAt && (
              <span className="hide-mobile" style={{ fontSize: 11, color: 'var(--color-neutral-500)', fontWeight: 600 }}>
                Updated {updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · auto-refreshes
              </span>
            )}
            <Link
              to={`/meets/${meet.id}`}
              style={{ whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 800, textDecoration: 'none', color: 'var(--color-accent)' }}
            >
              Full meet page ›
            </Link>
          </div>
        </div>
      </div>

      {loading ? <Loading label="Loading live data" /> : (
        <>
          {tab === 'today' && (
            <DayProgram day={todayDay} meetId={meet.id} meet={meet} resultKeys={resultKeys} />
          )}

          {tab === 'schedule' && (
            <div className="live-fade-in">
              {/* day chips */}
              <div ref={chipsRef} style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '10px 2px 12px', marginBottom: 14 }}>
                {days.map((d) => {
                  const active = d.day === (selectedDay ?? todayNum)
                  const isToday = d.day === todayNum
                  const hasFinals = finalsDays.has(d.day)
                  return (
                    <button
                      key={d.day}
                      onClick={() => setSelectedDay(d.day)}
                      className={`live-daychip${active ? ' active' : ''}`}
                      style={{
                        flex: 'none', minWidth: 84, padding: '10px 12px 9px', borderRadius: 12, cursor: 'pointer',
                        textAlign: 'center', position: 'relative',
                        background: active ? 'var(--color-accent-800)' : '#fff',
                        color: active ? '#fff' : 'inherit',
                        border: `1.5px solid ${active ? 'var(--color-accent-800)' : 'var(--color-neutral-300)'}`,
                        boxShadow: active ? '0 4px 14px rgba(12,35,64,.22)' : 'none',
                      }}
                    >
                      {isToday && (
                        <span style={{
                          position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)',
                          fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', padding: '2px 8px',
                          borderRadius: 999, background: LIVE_RED, color: '#fff',
                        }}>
                          TODAY
                        </span>
                      )}
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: active ? 0.75 : 0.55 }}>
                        {weekday(d.date) || `Day ${d.day}`}
                      </div>
                      <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontSize: 19, fontWeight: 800, marginTop: 2, lineHeight: 1 }}>
                        {d.date ? Number(d.date.slice(8, 10)) : d.day}
                      </div>
                      <div style={{ fontSize: 9.5, fontWeight: 700, marginTop: 3, opacity: active ? 0.75 : 0.55, letterSpacing: '0.06em' }}>
                        DAY {d.day}
                      </div>
                      <div style={{ marginTop: 5, height: 7 }}>
                        {hasFinals && <MedalDots size={6} gap={2} />}
                      </div>
                    </button>
                  )
                })}
              </div>
              <DayProgram day={scheduleDay} meetId={meet.id} meet={meet} resultKeys={resultKeys} />
            </div>
          )}

          {tab === 'medals' && <MedalsPanel rows={medals} />}
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
      className="live-daychip"
      style={{
        textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%',
        border: `2px solid ${active ? 'var(--color-accent-800)' : 'var(--color-neutral-200)'}`,
        borderRadius: 14, padding: '14px 16px', background: '#fff',
        boxShadow: active ? '0 4px 14px rgba(12,35,64,.16)' : '0 1px 4px rgba(12,35,64,.05)',
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
