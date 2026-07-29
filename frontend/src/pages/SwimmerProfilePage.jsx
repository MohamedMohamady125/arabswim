import { useState, useEffect, useRef, Fragment } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { getSwimmer, updateSwimmer, getSwimmerEvents, getSwimmerEventHistory, getSwimmerProfileStats, getSwimmerProgression, getSwimmerTransferHistory, getSwimmerRankings, getSwimmerQualifyingGaps } from '../api/swimmers'
import { getHeldRecords, getRecordGaps } from '../api/records'
import { getQualifyingStandards } from '../api/qualifyingTimes'
import { getMediaItems } from '../api/media'
import CountryFlag from '../components/common/CountryFlag'
import ProgressionChart from '../components/common/ProgressionChart'
import { AFRICA_PATH, ASIA_PATH, ARAB_PATH, GCC_PATH } from '../assets/mapPaths'
import { FaSchoolFlag, FaGraduationCap, FaLandmarkFlag } from 'react-icons/fa6'
import { formatDate } from '../utils/constants'
import { useAuth } from '../context/AuthContext'
import { Button, Card, Badge, PoolBadge, Tabs, SegmentedControl, EmptyState, Skeleton, TableSkeleton, Hero } from '../components/ui'
import { TimeDisplay, EventLabel } from '../components/domain'
import { CHART, formatCs } from '../components/charts/theme'
import {
  Clock, CalendarDays, Medal, Trophy, Star, TrendingUp, BarChart3, ChartLine,
  GitCompare, ArrowLeftRight, Images, ChevronRight, ChevronUp, ChevronDown,
  ArrowLeft, Pencil, User, Play, X, Award, Target, Image as ImageIcon,
} from 'lucide-react'

/* Token hexes for hand-drawn SVG infographics (mirror @theme values) */
const INK = '#0A1220'
const AQUA = '#0891B2'
const GOLD = '#D4A017'
const SILVER = '#8C9AA8'
const BRONZE = '#B0713A'

/* ───────── Animated number counter ───────── */
function AnimatedNumber({ value, duration = 800, pad = 0 }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef()
  useEffect(() => {
    if (value == null) return
    let start = 0
    const step = (ts) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      setDisplay(Math.round(progress * value))
      if (progress < 1) ref.current = requestAnimationFrame(step)
    }
    ref.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(ref.current)
  }, [value, duration])
  return <>{pad ? String(display).padStart(pad, '0') : display}</>
}

/* Counts a swim time up from 0 to its final value (e.g. 2:07.35) */
function AnimatedTime({ time, duration = 1000 }) {
  const [display, setDisplay] = useState('')
  const ref = useRef()
  useEffect(() => {
    const m = String(time || '').match(/^(?:(\d+):)?(\d+)\.(\d+)$/)
    if (!m) { setDisplay(time); return }
    const hasMinutes = m[1] != null
    const target = (parseInt(m[1] || 0) * 60 + parseInt(m[2])) * 100 + parseInt(m[3])
    const fmt = (cs) => {
      const minutes = Math.floor(cs / 6000)
      const seconds = Math.floor((cs % 6000) / 100)
      const centis = cs % 100
      return hasMinutes
        ? `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
        : `${seconds}.${String(centis).padStart(2, '0')}`
    }
    let start = 0
    const step = (ts) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      setDisplay(fmt(Math.round(progress * target)))
      if (progress < 1) ref.current = requestAnimationFrame(step)
    }
    ref.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(ref.current)
  }, [time, duration])
  return <>{display}</>
}

/* ───────── Personal Bests ───────── */
function PersonalBestsTable({ events, onEventClick, selectedEvent }) {
  const lcm = events.filter(e => e.pool === 'LCM' && !e.is_relay)
  const scm = events.filter(e => e.pool === 'SCM' && !e.is_relay)
  const relays = events.filter(e => e.is_relay)

  const renderSection = (rows, poolTag) => {
    if (!rows.length) return null
    return (
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-1.5 px-1">
          {poolTag === 'RELAY'
            ? <Badge variant="record">Relay</Badge>
            : <PoolBadge pool={poolTag} />}
          <div className="flex-1 h-px bg-ink-100" />
        </div>
        <div className="space-y-0.5">
          {rows.map((e) => {
            const isSelected = selectedEvent?.event_id === e.event_id && selectedEvent?.pool === e.pool
            return (
              <button key={`${e.event_id}-${e.pool}`} onClick={() => onEventClick(e)}
                className={`w-full text-start px-2.5 sm:px-3 py-2.5 min-h-11 rounded-sm flex items-center gap-2 sm:gap-3 transition-colors group ${
                  isSelected ? 'bg-aqua-50 ring-1 ring-aqua-600/30' : 'hover:bg-ink-50'
                }`}>
                <div className="flex-1 min-w-0">
                  <EventLabel name={e.event_name} className={isSelected ? 'text-aqua-600' : ''} />
                </div>
                <TimeDisplay time={e.best_time} />
                <span className="text-label normal-case tracking-normal text-ink-400 bg-ink-50 rounded-sm px-1.5 py-0.5">{e.times_count}x</span>
                <ChevronRight size={16} className={`shrink-0 transition-colors ${isSelected ? 'text-aqua-500' : 'text-ink-200 group-hover:text-ink-400'}`} />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="p-4 pb-3 border-b border-ink-100">
        <h3 className="text-title text-ink-900">Personal Best Times</h3>
        <p className="text-body-sm text-ink-400 mt-0.5">Tap an event to explore race history</p>
      </div>
      <div className="p-2.5 max-h-[600px] overflow-y-auto">
        {renderSection(lcm, 'LCM')}
        {renderSection(scm, 'SCM')}
        {renderSection(relays, 'RELAY')}
        {events.length === 0 && (
          <EmptyState icon={Clock} title="No competition results yet" />
        )}
      </div>
    </Card>
  )
}

/* ───────── Splits breakdown (chart + table with lap diffs) ───────── */
function splitTimeToCs(t) {
  if (!t) return null
  const m = String(t).trim().match(/^(?:(\d{1,2}):)?(\d{1,2})\.(\d{1,2})$/)
  if (!m) return null
  return (parseInt(m[1] || 0, 10) * 60 + parseInt(m[2], 10)) * 100 + parseInt(m[3].padEnd(2, '0'), 10)
}

function csToSplitTime(cs) {
  if (cs == null) return '-'
  const neg = cs < 0
  const a = Math.abs(cs)
  const min = Math.floor(a / 6000)
  const sec = Math.floor((a % 6000) / 100)
  const hun = a % 100
  const body = min > 0
    ? `${min}:${String(sec).padStart(2, '0')}.${String(hun).padStart(2, '0')}`
    : `${sec}.${String(hun).padStart(2, '0')}`
  return neg ? `-${body}` : body
}

function SplitsBreakdown({ splits, eventName }) {
  // splits are cumulative {distance, time}; derive lap times + diffs
  const stroke = (eventName || '').replace(/^\d+\s*[Mm]?\s*/, '').trim() || ''
  const rows = []
  let prevCum = 0
  let prevLap = null
  for (let i = 0; i < splits.length; i++) {
    const cumCs = splitTimeToCs(splits[i].time)
    const lapCs = cumCs != null ? cumCs - prevCum : null
    const diffCs = lapCs != null && prevLap != null ? lapCs - prevLap : null
    rows.push({ distance: splits[i].distance, cum: splits[i].time, cumCs, lapCs, diffCs })
    if (cumCs != null) prevCum = cumCs
    if (lapCs != null) prevLap = lapCs
  }
  const laps = rows.filter(r => r.lapCs != null)
  const totalCum = rows.length ? rows[rows.length - 1].cum : null

  // Mini line chart of lap times (chart-system tokens)
  let chart = null
  if (laps.length >= 2) {
    const W = 460, H = 130, PX = 34, PY = 22
    const min = Math.min(...laps.map(r => r.lapCs))
    const max = Math.max(...laps.map(r => r.lapCs))
    const range = Math.max(max - min, 50)
    const x = (i) => PX + (i * (W - 2 * PX)) / (laps.length - 1)
    // Higher (slower) lap time sits higher on the chart
    const y = (v) => H - PY - ((v - min) / range) * (H - 2 * PY)
    const pts = laps.map((r, i) => `${x(i)},${y(r.lapCs)}`).join(' ')
    chart = (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[460px] h-auto">
        <polyline points={pts} fill="none" stroke={CHART.primary} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {laps.map((r, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(r.lapCs)} r={CHART.point.r + 0.5} fill={CHART.primary} stroke={CHART.point.stroke} strokeWidth={CHART.point.strokeWidth} />
            <text x={x(i)} y={y(r.lapCs) - 8} textAnchor="middle" fill={CHART.primary} style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{csToSplitTime(r.lapCs)}</text>
            <text x={x(i)} y={H - 4} textAnchor="middle" fill={CHART.axisText} style={{ fontSize: 9, fontWeight: 600 }}>{r.distance ? `${r.distance}m` : `#${i + 1}`}</text>
          </g>
        ))}
      </svg>
    )
  }

  return (
    <div className="max-w-md">
      {chart && <div className="mb-2">{chart}</div>}
      <table className="w-full text-body-sm">
        <thead>
          <tr>
            <th scope="col" className="py-1 pe-2 text-start text-label text-ink-400"></th>
            <th scope="col" className="py-1 px-2 text-end text-label text-ink-400">Split</th>
            <th scope="col" className="py-1 px-2 text-end text-label text-ink-400">Diff</th>
            <th scope="col" className="py-1 ps-2 text-end text-label text-ink-400">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-ink-100">
              <td className="py-1.5 pe-2 font-medium text-ink-700 whitespace-nowrap">{r.distance ? `${r.distance} ${stroke}`.trim() : `Split ${i + 1}`}</td>
              <td className="py-1.5 px-2 text-end tnum font-semibold text-ink-900">{r.lapCs != null ? csToSplitTime(r.lapCs) : '-'}</td>
              <td className={`py-1.5 px-2 text-end tnum font-medium ${r.diffCs == null ? 'text-ink-200' : r.diffCs > 0 ? 'text-neg' : r.diffCs < 0 ? 'text-pos' : 'text-ink-400'}`}>
                {r.diffCs == null ? '—' : `${r.diffCs > 0 ? '+' : r.diffCs < 0 ? '-' : ''}${csToSplitTime(Math.abs(r.diffCs))}`}
              </td>
              <td className="py-1.5 ps-2 text-end tnum text-ink-500">{r.cum}</td>
            </tr>
          ))}
          {totalCum && (
            <tr className="border-t-2 border-ink-200">
              <td className="py-1.5 pe-2 font-bold text-ink-900">Total</td>
              <td></td><td></td>
              <td className="py-1.5 ps-2 text-end tnum font-bold text-ink-900">{totalCum}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ───────── Time History ───────── */
function TimeHistoryPanel({ selectedEvent, history, loadingHistory, navigate }) {
  const [expandedSplits, setExpandedSplits] = useState(null)
  if (!selectedEvent) {
    return (
      <Card className="flex items-center justify-center min-h-[400px]">
        <EmptyState icon={Clock} title="Select an event" hint="Choose from the list to view full time history" />
      </Card>
    )
  }

  const officialHistory = history.filter(x => !x.is_hc)
  const bestCs = officialHistory.length ? Math.min(...officialHistory.map(x => x.time_centiseconds)) : null

  const finaColor = (points) =>
    points >= 1000 ? 'text-gold' : points >= 900 ? 'text-pos' : points >= 800 ? 'text-aqua-600' : points >= 600 ? 'text-lcm' : 'text-ink-500'

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="p-4 border-b border-ink-100 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-title text-ink-900">{selectedEvent.event_name}</h3>
          <p className="text-body-sm text-ink-400 mt-0.5">
            {history.length} race{history.length !== 1 ? 's' : ''} recorded
          </p>
        </div>
        <PoolBadge pool={selectedEvent.pool} />
        {selectedEvent.is_relay && <Badge variant="record">Relay</Badge>}
      </div>
      {loadingHistory ? (
        <div className="p-4"><TableSkeleton rows={6} /></div>
      ) : (
        <div className="overflow-x-auto max-w-full min-w-0">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="bg-ink-900">
                <th scope="col" className="px-2 sm:px-3 py-2.5 text-start text-label text-white/70">#</th>
                <th scope="col" className="px-2 sm:px-3 py-2.5 text-start text-label text-white/70">Time</th>
                <th scope="col" className="px-2 sm:px-3 py-2.5 text-start text-label text-white/70 hidden sm:table-cell">Age</th>
                <th scope="col" className="px-2 sm:px-3 py-2.5 text-start text-label text-white/70 hidden md:table-cell">Round</th>
                <th scope="col" className="px-2 sm:px-3 py-2.5 text-start text-label text-white/70 hidden lg:table-cell">Team</th>
                <th scope="col" className="px-2 sm:px-3 py-2.5 text-start text-label text-white/70">Meet</th>
                <th scope="col" className="px-2 sm:px-3 py-2.5 text-start text-label text-white/70 hidden md:table-cell">Date</th>
                <th scope="col" className="px-2 sm:px-3 py-2.5 text-start text-label text-white/70 hidden sm:table-cell">FINA</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => {
                const isBest = h.time_centiseconds === bestCs
                const splits = h.splits || []
                const showSplits = expandedSplits === h.id
                return (
                  <Fragment key={h.id}>
                  <tr className="border-b border-ink-100 transition-colors hover:bg-ink-50">
                    <td className="px-2 sm:px-3 py-2.5 text-ink-400 tnum">{i + 1}</td>
                    <td className="px-2 sm:px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-time whitespace-nowrap ${isBest ? 'text-pos' : 'text-ink-900'}`}>{h.time}</span>
                        {!h.is_relay && isBest && <Badge variant="pos">PB</Badge>}
                        {h.is_hc && (
                          <Badge variant="pool-scm" className="cursor-help"
                            title={h.hc_type === 'TLD' ? 'Time limit exceeded – does not count in rankings' : 'Hors concours – does not count in rankings'}>
                            {h.hc_type || 'HC'}
                          </Badge>
                        )}
                        {splits.length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedSplits(showSplits ? null : h.id) }}
                            className={`inline-flex items-center gap-0.5 text-label px-1.5 py-1 rounded-sm transition-colors ${showSplits ? 'bg-aqua-600 text-white' : 'bg-aqua-50 text-aqua-600 hover:bg-aqua-100'}`}
                            title="Show split times" aria-label="Show split times">
                            Splits {showSplits ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 py-2.5 text-ink-500 tnum hidden sm:table-cell">{h.age_at_competition || '-'}</td>
                    <td className="px-2 sm:px-3 py-2.5 hidden md:table-cell">
                      {h.round_type ? (
                        <Badge variant={h.round_type === 'Finals' ? 'aqua' : 'status'}>{h.round_type}</Badge>
                      ) : <span className="text-ink-200">-</span>}
                    </td>
                    <td className="px-2 sm:px-3 py-2.5 text-ink-500 hidden lg:table-cell">
                      {(h.team || '').toUpperCase() === 'LP' ? (
                        <Badge variant="record" className="cursor-help" title="No club — transferring (libre passage)">LP</Badge>
                      ) : (h.team || <span className="text-ink-200">-</span>)}
                    </td>
                    <td className="px-2 sm:px-3 py-2.5">
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/meets/${h.championship_id}`) }}
                        className="text-aqua-600 hover:text-ink-900 font-medium transition-colors break-words line-clamp-2 max-w-44 sm:max-w-none block text-start">
                        {h.championship_name}
                      </button>
                    </td>
                    <td className="px-2 sm:px-3 py-2.5 text-ink-400 hidden md:table-cell whitespace-nowrap">{formatDate(h.championship_date)}</td>
                    <td className="px-2 sm:px-3 py-2.5 hidden sm:table-cell">
                      {h.fina_points ? (
                        <span className={`tnum font-semibold ${finaColor(h.fina_points)}`}>{h.fina_points}</span>
                      ) : <span className="text-ink-200">-</span>}
                    </td>
                  </tr>
                  {showSplits && (
                    <tr className="bg-aqua-50/60 border-b border-ink-100">
                      <td colSpan={8} className="px-3 py-3">
                        <SplitsBreakdown splits={splits} eventName={selectedEvent.event_name} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
              {history.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-400 text-body-sm">No times recorded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/* ───────── Medals Tab (infographic) ───────── */
const MEDAL_COMPS = [
  // Olympic: white interlaced rings
  { label: 'OLYMPIC', match: 'Olympic', color: '#0369A1', fg: 'white',
    icon: <svg viewBox="0 0 48 30" className="w-5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3.2"><circle cx="9" cy="10" r="6.5"/><circle cx="24" cy="10" r="6.5"/><circle cx="39" cy="10" r="6.5"/><circle cx="16.5" cy="19" r="6.5"/><circle cx="31.5" cy="19" r="6.5"/></svg> },
  // World: wireframe globe over waves
  { label: 'WORLD', match: 'World', color: '#1E2A3A', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="9" r="6.3"/><ellipse cx="12" cy="9" rx="2.8" ry="6.3"/><path d="M5.9 9h12.2M6.6 5.7h10.8M6.6 12.3h10.8" strokeWidth="1.1"/><path d="M3.5 18.4c2.2-1.7 4.3-1.7 6.5 0s4.3 1.7 6.5 0" strokeWidth="1.8" strokeLinecap="round"/><path d="M5.5 21.4c1.8-1.4 3.6-1.4 5.4 0s3.6 1.4 5.4 0" strokeWidth="1.8" strokeLinecap="round"/></svg> },
  // Arab: geographically accurate Arab world map (Natural Earth data)
  { label: 'ARAB', match: 'Arab', color: '#D4A017', fg: 'white',
    icon: <svg viewBox="0 0 64 64" className="w-5 h-5"><path d={ARAB_PATH} fill="currentColor"/></svg> },
  // Asian: geographically accurate Asia map (Natural Earth data)
  { label: 'ASIAN', match: 'Asian', color: '#0891B2', fg: 'white',
    icon: <svg viewBox="0 0 64 64" className="w-5 h-5"><path d={ASIA_PATH} fill="currentColor"/></svg> },
  // African: geographically accurate Africa map (Natural Earth data)
  { label: 'AFRICAN', match: 'African', color: '#059669', fg: 'white',
    icon: <svg viewBox="0 0 64 64" className="w-5 h-5"><path d={AFRICA_PATH} fill="currentColor"/></svg> },
  // GCC: geographically accurate Gulf states map (Natural Earth data)
  { label: 'GCC', match: 'GCC', color: '#7C3AED', fg: 'white',
    icon: <svg viewBox="0 0 64 64" className="w-5 h-5"><path d={GCC_PATH} fill="currentColor"/></svg> },
  // Mediterranean: sea waves
  { label: 'MEDITERRANEAN', match: 'Mediterranean', color: '#06B6D4', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 8c2.5-2 5-2 7.5 0s5 2 7.5 0"/><path d="M3 13c2.5-2 5-2 7.5 0s5 2 7.5 0"/><path d="M3 18c2.5-2 5-2 7.5 0s5 2 7.5 0"/></svg> },
  // Islamic: interlaced eight-pointed star pattern
  { label: 'ISLAMIC', match: 'Islamic', color: '#B45309', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="6.3" y="6.3" width="11.4" height="11.4"/><rect x="6.3" y="6.3" width="11.4" height="11.4" transform="rotate(45 12 12)"/><circle cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg> },
  // School: schoolhouse with flag (FontAwesome)
  { label: 'SCHOOL', match: 'School', color: '#DC2626', fg: 'white',
    icon: <FaSchoolFlag className="w-4 h-4" /> },
  // University: graduation cap (FontAwesome)
  { label: 'UNIVERSITY', match: 'University', color: '#B0713A', fg: 'white',
    icon: <FaGraduationCap className="w-4 h-4" /> },
  // National: government landmark with flag (FontAwesome)
  { label: 'NATIONAL', match: 'National', color: '#0369A1', fg: 'white',
    icon: <FaLandmarkFlag className="w-4 h-4" /> },
  // Other: star in a circle
  { label: 'OTHER', match: 'Other', color: '#6B7A8E', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M12 6.8l1.5 3.1 3.4.5-2.5 2.4.6 3.4-3-1.6-3 1.6.6-3.4-2.5-2.4 3.4-.5z" fill="currentColor"/></svg> },
]

function MedalGraphic({ tone }) {
  // tone: gold | silver | bronze — token palette
  const cols = {
    gold: { a: '#E9C65B', b: GOLD, ring: '#A87F12' },
    silver: { a: '#DDE3EA', b: SILVER, ring: '#6E7B89' },
    bronze: { a: '#D19468', b: BRONZE, ring: '#8A5527' },
  }[tone]
  return (
    <svg viewBox="0 0 48 48" className="w-16 h-16 sm:w-20 sm:h-20">
      <defs>
        <linearGradient id={`medal-${tone}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={cols.a} /><stop offset="100%" stopColor={cols.b} />
        </linearGradient>
      </defs>
      {/* laurel */}
      <g stroke={cols.b} strokeWidth="1.6" fill="none">
        <path d="M10 34c-4-5-5-12-2-18" /><path d="M38 34c4-5 5-12 2-18" />
        {[0, 1, 2, 3].map(i => (
          <g key={i}>
            <path d={`M${9 - i * 0.6} ${30 - i * 4.5}q-4 -1 -5.5 -4.5q4 0 5.5 4.5`} fill={cols.b} strokeWidth="0.5" />
            <path d={`M${39 + i * 0.6} ${30 - i * 4.5}q4 -1 5.5 -4.5q-4 0 -5.5 4.5`} fill={cols.b} strokeWidth="0.5" />
          </g>
        ))}
      </g>
      <circle cx="24" cy="24" r="14" fill={`url(#medal-${tone})`} stroke={cols.ring} strokeWidth="1.5" />
      <circle cx="24" cy="24" r="10.5" fill="none" stroke="white" strokeWidth="1" strokeDasharray="2 2" opacity="0.7" />
      <path d="M24 17l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z" fill="white" opacity="0.95" />
    </svg>
  )
}

function TrophyGraphic() {
  return (
    <svg viewBox="0 0 48 48" className="w-16 h-16 sm:w-20 sm:h-20">
      <defs>
        <linearGradient id="trophy-aqua" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22D3EE" /><stop offset="100%" stopColor={AQUA} />
        </linearGradient>
      </defs>
      <path d="M14 8h20v3c0 8-4 13-10 13S14 19 14 11V8z" fill="url(#trophy-aqua)" stroke={INK} strokeWidth="1.2" />
      <path d="M14 10H8c0 6 2.5 9 6.5 9.5M34 10h6c0 6-2.5 9-6.5 9.5" fill="none" stroke={AQUA} strokeWidth="2.4" />
      <path d="M21 24h6v5h-6z" fill="url(#trophy-aqua)" />
      <path d="M17 31h14v3H17z" fill="url(#trophy-aqua)" />
      <path d="M15 36h18v4H15z" fill={AQUA} />
      <path d="M24 11l1.6 3.2 3.5.5-2.5 2.5.6 3.5-3.2-1.7-3.2 1.7.6-3.5-2.5-2.5 3.5-.5z" fill="white" />
    </svg>
  )
}

function InkBar({ children }) {
  return (
    <div className="rounded-sm px-4 py-2.5 text-center text-white text-body-sm sm:text-body font-bold tracking-wide bg-gradient-to-b from-ink-700 to-ink-900">
      {children}
    </div>
  )
}

function PercentRing({ pct, tone, title, desc, icon }) {
  const r = 50
  const C = 2 * Math.PI * r
  const grad = tone === 'blue'
    ? { a: '#22D3EE', b: AQUA, track: '#CFFAFE' }
    : { a: '#E9C65B', b: GOLD, track: '#F4E8C8' }
  return (
    <Card>
      <InkBar>{title}</InkBar>
      <div className="flex flex-col items-center">
      <div className="relative my-4">
        <svg viewBox="0 0 120 120" className="w-32 h-32 sm:w-36 sm:h-36 -rotate-90">
          <defs>
            <linearGradient id={`ring-${title.replace(/\s/g, '')}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={grad.a} /><stop offset="100%" stopColor={grad.b} />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r={r} fill="none" stroke={grad.track} strokeWidth="12" />
          <circle cx="60" cy="60" r={r} fill="none" stroke={`url(#ring-${title.replace(/\s/g, '')})`} strokeWidth="12"
            strokeLinecap="round" strokeDasharray={`${(pct / 100) * C} ${C}`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-bold tnum text-ink-900">
            <span className="text-4xl sm:text-5xl">{pct}</span><span className="text-xl">%</span>
          </span>
        </div>
      </div>
      <p className="text-body-sm text-ink-500 text-center leading-snug">{desc}</p>
      <div className="mt-3">{icon}</div>
      </div>
    </Card>
  )
}

function MedalsTab({ stats }) {
  if (!stats) return null
  const { medals, medals_hierarchy, total_races } = stats

  if (medals.total === 0) {
    return (
      <Card>
        <EmptyState icon={Medal} title="No medals yet" hint="Medals will appear here once earned" />
      </Card>
    )
  }

  // Per-competition breakdown from the classification hierarchy
  const compCounts = {}
  ;(medals_hierarchy || []).forEach(cat => {
    cat.classifications.forEach(cls => {
      if (!compCounts[cls.name]) compCounts[cls.name] = { gold: 0, silver: 0, bronze: 0 }
      compCounts[cls.name].gold += cls.gold
      compCounts[cls.name].silver += cls.silver
      compCounts[cls.name].bronze += cls.bronze
    })
  })

  const pctOf = (n) => medals.total > 0 ? ((n / medals.total) * 100).toFixed(1) : '0.0'
  const races = total_races || 0
  const medalRacePct = races > 0 ? Math.min(100, Math.round((medals.total / races) * 100)) : 0
  const goldRacePct = races > 0 ? Math.min(100, Math.round((medals.gold / races) * 100)) : 0
  const goldSharePct = medals.total > 0 ? Math.round((medals.gold / medals.total) * 1000) / 10 : 0

  // Donut geometry
  const donutR = 44
  const donutC = 2 * Math.PI * donutR
  let acc = 0
  const donutSegs = [
    { key: 'gold', n: medals.gold, color: GOLD },
    { key: 'silver', n: medals.silver, color: SILVER },
    { key: 'bronze', n: medals.bronze, color: BRONZE },
  ].map(s => {
    const frac = medals.total > 0 ? s.n / medals.total : 0
    const seg = { ...s, dash: frac * donutC, offset: -acc * donutC }
    acc += frac
    return seg
  })

  // Bar chart — competitions that have at least one medal
  const chartComps = MEDAL_COMPS.filter(c => {
    const cc = compCounts[c.match]
    return cc && (cc.gold + cc.silver + cc.bronze) > 0
  })
  const chartMax = Math.max(1, ...chartComps.flatMap(c => {
    const cc = compCounts[c.match]
    return [cc.gold, cc.silver, cc.bronze]
  }))

  const statCards = [
    { title: 'GOLD', graphic: <MedalGraphic tone="gold" />, n: medals.gold, badge: `linear-gradient(180deg, #E9C65B 0%, ${GOLD} 100%)`, color: GOLD },
    { title: 'SILVER', graphic: <MedalGraphic tone="silver" />, n: medals.silver, badge: `linear-gradient(180deg, #DDE3EA 0%, ${SILVER} 100%)`, color: SILVER },
    { title: 'BRONZE', graphic: <MedalGraphic tone="bronze" />, n: medals.bronze, badge: `linear-gradient(180deg, #D19468 0%, ${BRONZE} 100%)`, color: BRONZE },
    { title: 'TOTAL', graphic: <TrophyGraphic />, n: medals.total, badge: `linear-gradient(180deg, #22D3EE 0%, ${AQUA} 100%)`, color: AQUA },
  ]

  const miniMedal = (color) => (
    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" aria-hidden="true"><circle cx="8" cy="8" r="7" fill={color} /><path d="M8 4l1.1 2.2 2.4.4-1.7 1.7.4 2.4L8 9.6l-2.2 1.1.4-2.4L4.5 6.6l2.4-.4z" fill="white" /></svg>
  )

  return (
    <div className="rounded-md bg-ink-50 border border-ink-100 p-3 sm:p-5 space-y-4 sm:space-y-5">
      {/* ── Top: title + medal stat cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-4 items-stretch">
        <div className="flex flex-col items-center justify-center text-center py-4">
          <div className="text-label text-aqua-600 tracking-[0.25em]">OUR ACHIEVEMENTS</div>
          <div className="text-display-xl sm:text-[64px] sm:leading-none text-ink-900">MEDALS</div>
          <div className="flex gap-1.5 my-2 text-gold">
            <Star size={18} className="fill-gold" /><Star size={18} className="fill-gold" /><Star size={18} className="fill-gold" />
          </div>
          <p className="text-body-sm sm:text-body text-ink-500 leading-snug">Celebrating excellence.<br />Honoring every podium finish.</p>
          <svg viewBox="0 0 48 24" className="w-10 h-5 mt-2" fill={AQUA} aria-hidden="true">
            <circle cx="34" cy="6" r="3.2"/>
            <path d="M10 12l14-5 5 4-6 3-13-2z"/>
            <path d="M4 18c3-2.2 6-2.2 9 0s6 2.2 9 0 6-2.2 9 0v2.5c-3 2.2-6 2.2-9 0s-6-2.2-9 0-6-2.2-9 0z" opacity="0.9"/>
          </svg>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statCards.map(c => (
            <div key={c.title} className="bg-white rounded-md border border-ink-100 shadow-card p-3 flex flex-col items-center justify-between">
              <div className="text-center leading-tight">
                <div className="text-body-sm sm:text-body font-bold" style={{ color: c.color }}>{c.title}</div>
                <div className="text-label text-ink-900">MEDALS</div>
              </div>
              <div className="my-2">{c.graphic}</div>
              <div className="w-full rounded-sm text-center text-white text-3xl sm:text-4xl font-bold tnum py-1.5" style={{ background: c.badge }}>
                <AnimatedNumber value={c.n} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Middle: distribution donut + breakdown by competition ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card>
          <InkBar>MEDAL DISTRIBUTION</InkBar>
          <div className="flex items-center gap-4 sm:gap-6 mt-5">
            <div className="relative shrink-0">
              <svg viewBox="0 0 120 120" className="w-28 h-28 sm:w-44 sm:h-44 -rotate-90">
                {donutSegs.map(s => s.n > 0 && (
                  <circle key={s.key} cx="60" cy="60" r={donutR} fill="none" stroke={s.color} strokeWidth="22"
                    strokeDasharray={`${s.dash} ${donutC}`} strokeDashoffset={s.offset} />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl sm:text-5xl font-bold tnum leading-none text-ink-900"><AnimatedNumber value={medals.total} /></span>
                <span className="text-label text-ink-900">TOTAL</span>
              </div>
            </div>
            <div className="flex-1 min-w-0 divide-y divide-ink-100">
              {[
                { label: 'GOLD', n: medals.gold, color: GOLD },
                { label: 'SILVER', n: medals.silver, color: SILVER },
                { label: 'BRONZE', n: medals.bronze, color: BRONZE },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3 py-3">
                  <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full shrink-0" style={{ background: row.color }} />
                  <div className="flex-1 leading-tight">
                    <div className="text-body-sm sm:text-body font-bold" style={{ color: row.color }}>{row.label}</div>
                    <div className="text-lg sm:text-xl font-bold tnum text-ink-900">{row.n}</div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold tnum" style={{ color: row.color }}>{pctOf(row.n)}%</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <InkBar>MEDAL BREAKDOWN BY COMPETITION</InkBar>
          <div className="divide-y divide-ink-100 mt-2">
            {MEDAL_COMPS.map(comp => {
              const cc = compCounts[comp.match] || { gold: 0, silver: 0, bronze: 0 }
              return (
                <div key={comp.label} className="flex items-center gap-3 py-2">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-ink-100" style={{ background: comp.color, color: comp.fg }}>
                    {comp.icon}
                  </span>
                  <div className="flex-1 min-w-0 text-body-sm font-bold text-ink-900 truncate">{comp.label}</div>
                  <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
                    <span className="flex items-center gap-1">{miniMedal(GOLD)}<span className="text-body sm:text-lg font-bold tnum w-6 text-end text-ink-900">{cc.gold}</span></span>
                    <span className="flex items-center gap-1">{miniMedal(SILVER)}<span className="text-body sm:text-lg font-bold tnum w-6 text-end text-ink-900">{cc.silver}</span></span>
                    <span className="flex items-center gap-1">{miniMedal(BRONZE)}<span className="text-body sm:text-lg font-bold tnum w-6 text-end text-ink-900">{cc.bronze}</span></span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* ── Medal Summary bar chart ── */}
      {chartComps.length > 0 && (
        <Card>
          <InkBar>MEDAL SUMMARY</InkBar>
          <div className="mt-5 overflow-x-auto max-w-full min-w-0">
            <div className="min-w-[420px]">
              <div className="flex items-end gap-2 sm:gap-4 h-44 border-b-2 border-ink-100 px-2">
                {chartComps.map(comp => {
                  const cc = compCounts[comp.match]
                  const bar = (n, color) => (
                    <div className="flex flex-col items-center justify-end w-4 sm:w-6">
                      {n > 0 && <span className="text-body-sm font-bold tnum mb-0.5 text-ink-900">{n}</span>}
                      <div className="w-full rounded-t-[2px]" style={{ height: `${(n / chartMax) * 130}px`, background: color, minHeight: n > 0 ? '4px' : '0' }} />
                    </div>
                  )
                  return (
                    <div key={comp.label} className="flex-1 flex items-end justify-center gap-0.5 sm:gap-1">
                      {bar(cc.gold, GOLD)}
                      {bar(cc.silver, SILVER)}
                      {bar(cc.bronze, BRONZE)}
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-2 sm:gap-4 px-2 mt-2">
                {chartComps.map(comp => (
                  <div key={comp.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center border border-ink-100" style={{ background: comp.color, color: comp.fg }}>{comp.icon}</span>
                    <span className="text-label text-center leading-tight text-ink-900">{comp.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 sm:gap-6 mt-4">
            {[['GOLD', GOLD], ['SILVER', SILVER], ['BRONZE', BRONZE]].map(([label, color]) => (
              <span key={label} className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-[2px]" style={{ background: color }} />
                <span className="text-body-sm font-bold text-ink-900">{label}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* ── Percentage rings ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <PercentRing pct={medalRacePct} tone="blue" title="MEDAL-WINNING RACES"
          desc={<span>Races that earned<br />at least one medal.</span>}
          icon={<span className="w-9 h-9 rounded-full flex items-center justify-center bg-aqua-600 text-white"><Medal size={18} /></span>} />
        <PercentRing pct={goldRacePct} tone="gold" title="GOLD-WINNING RACES"
          desc={<span>Races that resulted<br />in a gold medal.</span>}
          icon={<span className="w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: `linear-gradient(180deg,#E9C65B,${GOLD})` }}><Trophy size={18} /></span>} />
        <PercentRing pct={goldSharePct} tone="gold" title="GOLD SHARE"
          desc={<span>Percentage of gold medals<br />out of total medals.</span>}
          icon={<span className="w-9 h-9 rounded-full flex items-center justify-center border-2 border-gold bg-gold/10 text-gold"><Star size={18} className="fill-gold" /></span>} />
      </div>

      {/* ── Footer strip ── */}
      <div className="bg-white rounded-md border border-ink-100 shadow-card px-3 sm:px-6 py-3 sm:py-4 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-0">
        {[
          { title: 'CHAMPION MINDSET', sub: 'Focused. Determined. Unstoppable.', bg: AQUA, icon: <Target size={22} /> },
          { title: 'CONSISTENT PODIUMS', sub: 'Every race. Every time. Raising the standard.', bg: '#059669', icon: <BarChart3 size={22} /> },
          { title: 'TEAM EXCELLENCE', sub: 'Stronger together. Achieving more.', bg: GOLD, icon: <Award size={22} /> },
          { title: 'RISING LEGACY', sub: 'Building today. Inspiring tomorrow.', bg: '#7C3AED', icon: <TrendingUp size={22} /> },
        ].map((f, i) => (
          <div key={f.title} className={`flex items-center gap-2.5 sm:gap-3 sm:px-4 ${i > 0 ? 'lg:border-s lg:border-ink-100' : ''}`}>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: f.bg }}>
              {f.icon}
            </div>
            <div className="min-w-0">
              <div className="text-label truncate text-ink-900">{f.title}</div>
              <div className="text-label normal-case tracking-normal font-normal text-ink-400 leading-tight">{f.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ───────── Performance Index ───────── */
function PerformanceIndex({ finaDistribution, bestFina }) {
  if (!finaDistribution || finaDistribution.length === 0) return null
  const maxCount = Math.max(...finaDistribution.map(d => d.count))

  // Categorical tier colors from the token palette
  const TIER_COLORS = {
    'World-Class':          GOLD,
    'International Elite':  '#059669',
    'Elite':                AQUA,
    'High Performance':     '#0369A1',
    'Advanced':             '#7C3AED',
    'Competitive':          '#1E2A3A',
    'Developing':           '#B45309',
    'Foundation':           BRONZE,
    'Novice':               '#6B7A8E',
    'Entry Level':          '#D7DEE7',
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-title text-ink-900">Performance Index</h3>
          <p className="text-body-sm text-ink-400 mt-0.5">FINA points distribution across all swims</p>
        </div>
        {bestFina && (
          <div className="text-end">
            <div className="text-4xl font-bold tnum text-aqua-600">{bestFina.points}</div>
            <div className="text-label text-ink-400">Peak FINA</div>
          </div>
        )}
      </div>
      <div className="space-y-3">
        {finaDistribution.map((tier) => {
          const color = TIER_COLORS[tier.label] || TIER_COLORS['Novice']
          const pct = maxCount > 0 ? (tier.count / maxCount) * 100 : 0
          const rangeLabel = `${tier.low}+`
          return (
            <div key={tier.low} className="flex items-center gap-3">
              <div className="w-14 sm:w-16 text-end text-body-sm font-bold tnum" style={{ color }}>{rangeLabel}</div>
              <div className="flex-1 bg-ink-50 rounded-full h-5 sm:h-7 overflow-hidden relative">
                <div className="h-full rounded-full flex items-center justify-end pe-2"
                  style={{ background: color, width: `${Math.max(pct, tier.count > 0 ? 10 : 0)}%` }}>
                  {tier.count > 0 && pct > 18 && (
                    <span className="text-white text-body-sm font-bold tnum">{tier.count}</span>
                  )}
                </div>
                {tier.count > 0 && pct <= 18 && (
                  <span className="absolute start-[calc(10%+6px)] top-1/2 -translate-y-1/2 text-body-sm font-bold tnum text-ink-500">{tier.count}</span>
                )}
              </div>
              <div className="w-20 text-label normal-case tracking-normal hidden md:block" style={{ color }}>{tier.label}</div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* ───────── Stats Tab ───────── */
function StatsTab({ stats, events, swimmerId }) {
  const [qualifyingGaps, setQualifyingGaps] = useState([])
  const [gapPool, setGapPool] = useState('LCM')
  const [gapCut, setGapCut] = useState('A')
  const [standards, setStandards] = useState([])
  const [gapStandard, setGapStandard] = useState(null)
  useEffect(() => {
    getQualifyingStandards().then(res => {
      const list = res.data.results || res.data || []
      setStandards(list)
      if (list.length > 0) setGapStandard(prev => prev ?? list[0].id)
    }).catch(() => {})
  }, [])
  useEffect(() => {
    if (swimmerId && gapStandard) {
      getSwimmerQualifyingGaps(swimmerId, { standard: gapStandard })
        .then(res => setQualifyingGaps(res.data || [])).catch(() => {})
    }
  }, [swimmerId, gapStandard])

  if (!stats) return null
  const { best_fina, season_best_fina, best_event, records, total_records, fina_distribution } = stats
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Performance Index + Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <PerformanceIndex finaDistribution={fina_distribution} bestFina={best_fina} />
        <div className="space-y-3 sm:space-y-4">
          {best_fina && (
            <Card className="border-aqua-600/30">
              <div className="text-label text-aqua-600 mb-2">Best FINA Points</div>
              <div className="text-4xl sm:text-5xl font-bold tnum text-aqua-600"><AnimatedNumber value={best_fina.points} /></div>
              <div className="text-body-sm font-semibold text-ink-700 mt-2">{best_fina.event_name}</div>
              <div className="text-body-sm text-ink-400 mt-0.5">{best_fina.championship_name}</div>
            </Card>
          )}
          {season_best_fina && (
            <Card className="border-pos/30">
              <div className="text-label text-pos mb-2">Season Best FINA Points · {season_best_fina.year}</div>
              <div className="text-4xl sm:text-5xl font-bold tnum text-pos"><AnimatedNumber value={season_best_fina.points} /></div>
              <div className="text-body-sm font-semibold text-ink-700 mt-2">{season_best_fina.event_name}</div>
              <div className="text-body-sm text-ink-400 mt-0.5">{season_best_fina.championship_name}</div>
            </Card>
          )}
          {best_event && (
            <Card className="border-gold/40">
              <div className="text-label text-gold mb-2">Signature Event</div>
              <div className="text-display text-ink-900">{best_event}</div>
              <div className="text-body-sm text-ink-400 mt-1">Highest FINA points across all events</div>
            </Card>
          )}
        </div>
      </div>

      {/* Qualifying Gaps */}
      {standards.length > 0 && (() => {
        const filteredGaps = (qualifyingGaps || []).filter(g => g.pool === gapPool && g.cut === gapCut)
        const activeStandard = standards.find(s => s.id === gapStandard)
        return (
        <Card padding="none" className="overflow-hidden">
          <div className="p-4 border-b border-ink-100">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-title text-ink-900">Qualifying Standards Gap</h3>
                <p className="text-body-sm text-ink-400 mt-0.5">{activeStandard?.name || qualifyingGaps[0]?.standard_name} — Based on {new Date().getFullYear()} best times</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <SegmentedControl
                  options={[{ key: 'LCM', label: 'LCM' }, { key: 'SCM', label: 'SCM' }]}
                  value={gapPool} onChange={setGapPool} />
                <SegmentedControl
                  options={[{ key: 'A', label: 'A Cut' }, { key: 'B', label: 'B Cut' }]}
                  value={gapCut} onChange={setGapCut} />
              </div>
            </div>
            {/* Standard selector */}
            <div className="mt-3 rounded-sm border border-ink-100 bg-white p-2 flex flex-wrap gap-1.5">
              {standards.map(s => (
                <button key={s.id} onClick={() => setGapStandard(s.id)}
                  className={`px-3 py-2 min-h-10 rounded-sm text-body-sm font-medium transition-colors ${
                    gapStandard === s.id
                      ? 'bg-aqua-600 text-white'
                      : 'bg-ink-50 text-ink-500 hover:bg-ink-100 border border-ink-100'
                  }`}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          {filteredGaps.length === 0 ? (
            <div className="p-8 text-center text-ink-400 text-body-sm">No qualifying gaps for {gapPool} {gapCut} Cut</div>
          ) : (
          <div className="divide-y divide-ink-100">
            {filteredGaps.map((g) => {
              const maxGap = Math.max(...filteredGaps.map(x => Math.abs(x.gap_cs)))
              const barPct = maxGap > 0 ? (Math.abs(g.gap_cs) / maxGap) * 100 : 0
              return (
                <div key={g.event_id} className="px-3 sm:px-5 py-3.5 sm:py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <EventLabel name={g.event_name} className="font-semibold" />
                      {g.pool && <PoolBadge pool={g.pool} />}
                      <Badge variant="status">{g.cut} Cut</Badge>
                    </div>
                    {g.qualified ? (
                      <Badge variant="pos">QUALIFIED</Badge>
                    ) : (
                      <span className="text-body-sm font-semibold tnum text-ink-500">+{g.gap_pct}%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex justify-between text-label normal-case tracking-normal mb-1">
                        <span className="text-ink-400">Your Best</span>
                        <span className="text-ink-400">Qualifying</span>
                      </div>
                      <div className="relative h-6 bg-ink-50 rounded-full overflow-hidden">
                        <div
                          className={`absolute start-0 top-0 h-full rounded-full transition-all duration-700 ${g.qualified ? 'bg-pos' : 'bg-aqua-600'}`}
                          style={{ width: `${g.qualified ? 100 : Math.max(100 - barPct * 0.6, 15)}%` }}
                        />
                        {!g.qualified && (
                          <div className="absolute end-0 top-0 h-full border-s-2 border-dashed border-scm" style={{ width: `${barPct * 0.6}%` }}>
                            <div className="absolute -top-0.5 -start-1 w-2 h-7 bg-scm rounded-full opacity-50" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-time text-aqua-600">{g.swimmer_best}</span>
                    <span className={`text-body-sm tnum font-semibold ${g.qualified ? 'text-pos' : 'text-neg'}`}>
                      {g.qualified ? '-' : '+'}{g.gap_time}
                    </span>
                    <span className="text-time text-scm">{g.qualifying_time}</span>
                  </div>
                </div>
              )
            })}
          </div>
          )}
        </Card>
        )
      })()}

      {/* Records Held */}
      {total_records > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="p-4 border-b border-ink-100">
            <h3 className="text-title text-ink-900">Records Held</h3>
            <p className="text-body-sm text-ink-400 mt-0.5">{total_records} active record{total_records !== 1 ? 's' : ''}</p>
          </div>
          <div className="divide-y divide-ink-100">
            {records.map((r) => (
              <div key={r.id} className="px-3 sm:px-5 py-3 sm:py-3.5 flex items-center gap-3 sm:gap-4 hover:bg-ink-50 transition-colors">
                <Badge variant={r.record_type === 'ARAB' ? 'pos' : r.record_type === 'GCC' ? 'aqua' : 'record'}>{r.record_type}</Badge>
                <div className="flex-1 min-w-0">
                  <EventLabel name={r.event_name} className="font-semibold" />
                  <div className="text-body-sm text-ink-400">{r.location}{r.location && r.date ? ' \u00b7 ' : ''}{formatDate(r.date)}</div>
                </div>
                <TimeDisplay time={r.time} record />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

/* ───────── International Participation Infographic ───────── */
const PARTICIPATION_TILES = [
  { label: 'OLYMPIC', match: 'Olympic', grad: 'linear-gradient(135deg, #0369A1 0%, #0A1220 100%)', badge: '#0369A1',
    icon: <svg viewBox="0 0 48 30" className="w-10 h-7" fill="none" stroke="white" strokeWidth="2.6"><circle cx="9" cy="10" r="6.5"/><circle cx="24" cy="10" r="6.5"/><circle cx="39" cy="10" r="6.5"/><circle cx="16.5" cy="19" r="6.5"/><circle cx="31.5" cy="19" r="6.5"/></svg> },
  { label: 'WORLD', match: 'World', grad: 'linear-gradient(135deg, #1E2A3A 0%, #0A1220 100%)', badge: '#1E2A3A',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="white" strokeWidth="1.7"><circle cx="12" cy="10" r="7"/><ellipse cx="12" cy="10" rx="3.2" ry="7"/><path d="M5 10h14M5.8 6.5h12.4M5.8 13.5h12.4" strokeWidth="1.2"/><path d="M4 20c2-1.6 4-1.6 6 0s4 1.6 6 0 3-1.2 4-.4" strokeLinecap="round"/></svg> },
  { label: 'ARAB', match: 'Arab', grad: 'linear-gradient(135deg, #E9C65B 0%, #D4A017 100%)', badge: '#D4A017',
    icon: <svg viewBox="0 0 64 64" className="w-9 h-9"><path d={ARAB_PATH} fill="white"/></svg> },
  { label: 'ASIAN', match: 'Asian', grad: 'linear-gradient(135deg, #22D3EE 0%, #0891B2 100%)', badge: '#0891B2',
    icon: <svg viewBox="0 0 64 64" className="w-9 h-9"><path d={ASIA_PATH} fill="white"/></svg> },
  { label: 'AFRICAN', match: 'African', grad: 'linear-gradient(135deg, #34C08B 0%, #059669 100%)', badge: '#059669',
    icon: <svg viewBox="0 0 64 64" className="w-9 h-9"><path d={AFRICA_PATH} fill="white"/></svg> },
  { label: 'GCC', match: 'GCC', grad: 'linear-gradient(135deg, #9B6DF2 0%, #7C3AED 100%)', badge: '#7C3AED',
    icon: <svg viewBox="0 0 64 64" className="w-9 h-9"><path d={GCC_PATH} fill="white"/></svg> },
  { label: 'MEDITERRANEAN', match: 'Mediterranean', grad: 'linear-gradient(135deg, #06B6D4 0%, #0369A1 100%)', badge: '#06B6D4',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M3 8c2.5-2 5-2 7.5 0s5 2 7.5 0"/><path d="M3 13c2.5-2 5-2 7.5 0s5 2 7.5 0"/><path d="M3 18c2.5-2 5-2 7.5 0s5 2 7.5 0"/></svg> },
  { label: 'ISLAMIC', match: 'Islamic', grad: 'linear-gradient(135deg, #D08A2B 0%, #B45309 100%)', badge: '#B45309',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="white" strokeWidth="1.6"><rect x="6" y="6" width="12" height="12"/><rect x="6" y="6" width="12" height="12" transform="rotate(45 12 12)"/><circle cx="12" cy="12" r="3"/></svg> },
  { label: 'SCHOOL', match: 'School', grad: 'linear-gradient(135deg, #E85D5D 0%, #DC2626 100%)', badge: '#DC2626',
    icon: <FaSchoolFlag className="w-9 h-9 text-white" /> },
  { label: 'UNIVERSITY', match: 'University', grad: 'linear-gradient(135deg, #C98B57 0%, #B0713A 100%)', badge: '#B0713A',
    icon: <FaGraduationCap className="w-9 h-9 text-white" /> },
  { label: 'NATIONAL', match: 'National', grad: 'linear-gradient(135deg, #0891B2 0%, #0369A1 100%)', badge: '#0369A1',
    icon: <FaLandmarkFlag className="w-9 h-9 text-white" /> },
  { label: 'OTHER', match: 'Other', grad: 'linear-gradient(135deg, #8C9AA8 0%, #48586C 100%)', badge: '#6B7A8E',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="white" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/><path fill="white" stroke="none" d="M12 6.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z"/></svg> },
]

const PARTICIPATION_FOOTER = [
  { title: 'UNITED SPIRIT', sub: 'Stronger together', bg: '#ECFEFF', color: '#0891B2', icon: <User size={22} /> },
  { title: 'DRIVEN BY EXCELLENCE', sub: 'Committed to success', bg: '#D9F2E8', color: '#059669', icon: <Trophy size={22} /> },
  { title: 'DIVERSE NATIONS', sub: 'One aquatic family', bg: '#F4E8C8', color: '#D4A017', icon: <Award size={22} /> },
  { title: 'BUILDING LEGACIES', sub: 'For today and tomorrow', bg: '#EDE4FB', color: '#7C3AED', icon: <TrendingUp size={22} /> },
]

function InternationalParticipation({ championships }) {
  const counts = {}
  championships.forEach(c => {
    const key = c.classification || ''
    counts[key] = (counts[key] || 0) + 1
  })
  return (
    <div className="rounded-md overflow-hidden mb-4 sm:mb-6 relative bg-ink-50 border border-ink-100">
      {/* faint dotted backdrop */}
      <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: `radial-gradient(${AQUA} 1.2px, transparent 1.2px)`, backgroundSize: '14px 14px' }} />
      <div className="relative px-4 sm:px-6 py-5 sm:py-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-1.5">
            <span className="h-[3px] w-10 sm:w-16 rounded-full bg-aqua-600" />
            <span className="text-label text-aqua-600 tracking-[0.25em]">WE ARE GLOBAL</span>
            <span className="h-[3px] w-10 sm:w-16 rounded-full bg-aqua-600" />
          </div>
          <h2 className="text-display sm:text-display-xl text-ink-900">
            INTERNATIONAL PARTICIPATION
          </h2>
          <p className="text-body-sm sm:text-body text-ink-500 mt-2">Uniting nations. Celebrating excellence. Inspiring generations.</p>
          <svg viewBox="0 0 48 24" className="w-10 h-5 mx-auto mt-2" fill={AQUA} aria-hidden="true">
            <circle cx="34" cy="6" r="3.2"/>
            <path d="M10 12l14-5 5 4-6 3-13-2z"/>
            <path d="M4 18c3-2.2 6-2.2 9 0s6 2.2 9 0 6-2.2 9-0 6 2.2 9 0v2.5c-3 2.2-6 2.2-9 0s-6-2.2-9 0-6 2.2-9 0-6-2.2-9 0z" opacity="0.9"/>
          </svg>
        </div>

        {/* Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {PARTICIPATION_TILES.map((t) => {
            const n = counts[t.match] || 0
            return (
              <div key={t.label} className="flex rounded-md overflow-hidden bg-white shadow-card border border-ink-100">
                <div className="w-[42%] shrink-0 flex items-center justify-center py-6 sm:py-7 [&_svg]:scale-[1.35] sm:[&_svg]:scale-150" style={{ background: t.grad }}>
                  {t.icon}
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-1.5 px-1 py-3">
                  <div className="text-label text-center leading-tight text-ink-900">{t.label}</div>
                  <div className="text-white text-2xl sm:text-4xl font-bold px-3 sm:px-4 py-1 rounded-sm tnum" style={{ background: t.badge }}>
                    <AnimatedNumber value={n} pad={2} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer strip */}
        <div className="mt-5 sm:mt-7 bg-white rounded-md shadow-card border border-ink-100 px-3 sm:px-6 py-3 sm:py-4 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-0">
          {PARTICIPATION_FOOTER.map((f, i) => (
            <div key={f.title} className={`flex items-center gap-2.5 sm:gap-3 sm:px-4 ${i > 0 ? 'lg:border-s lg:border-ink-100' : ''}`}>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: f.bg, color: f.color }}>
                {f.icon}
              </div>
              <div className="min-w-0">
                <div className="text-label truncate text-ink-900">{f.title}</div>
                <div className="text-label normal-case tracking-normal font-normal text-ink-400 truncate">{f.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ───────── Meets Tab ───────── */
function MeetsTab({ stats, navigate }) {
  if (!stats) return null
  const { championships } = stats

  const byYear = {}
  championships.forEach(c => {
    const year = new Date(c.date).getFullYear()
    if (!byYear[year]) byYear[year] = []
    byYear[year].push(c)
  })
  const years = Object.keys(byYear).sort((a, b) => b - a)

  return (
    <div className="space-y-4">
      {/* International Participation infographic */}
      <InternationalParticipation championships={championships} />

      {/* Timeline */}
      {years.map((year) => (
        <div key={year}>
          {/* Year Pill */}
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-ink-900 text-white text-body-sm font-bold tnum px-3.5 py-1 rounded-full">{year}</span>
            <span className="text-body-sm text-ink-400">{byYear[year].length} meet{byYear[year].length !== 1 ? 's' : ''}</span>
            <div className="flex-1 h-px bg-ink-100" />
          </div>
          <div className="space-y-2 ms-1 sm:ms-2 ps-3 sm:ps-5 border-s-2 border-ink-100">
            {byYear[year].map((c) => (
              <button key={c.id} onClick={() => navigate(`/meets/${c.id}`)}
                className="w-full text-start bg-white rounded-md border border-ink-100 shadow-card px-3 sm:px-4 py-2.5 sm:py-3 min-h-11 hover:border-aqua-500/40 hover:bg-aqua-50/40 flex items-center gap-2 sm:gap-3 transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="text-body-sm font-semibold text-ink-900 group-hover:text-aqua-600 transition-colors truncate">{c.name}</div>
                  <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1 min-w-0">
                    <CountryFlag code={c.country_code} flagUrl={c.flag_url} name={c.country} className="text-body-sm min-w-0 [&>span:last-child]:truncate [&>span:last-child]:min-w-0" />
                    <span className="text-body-sm text-ink-400 whitespace-nowrap shrink-0">{formatDate(c.date)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  <PoolBadge pool={c.pool} />
                  <ChevronRight size={16} className="text-ink-200 group-hover:text-aqua-500 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {championships.length === 0 && (
        <Card>
          <EmptyState icon={CalendarDays} title="No championship history yet" />
        </Card>
      )}
    </div>
  )
}

/* ───────── Records Tab ───────── */
// Standard motivation tiers based on % away from the record
function gapMotivation(pct) {
  const p = parseFloat(pct)
  if (isNaN(p) || p < 0) return null
  if (p <= 1) return { badge: 'RECORD IN SIGHT', msg: 'Less than 1% away — one great swim and it\u2019s yours!', cls: 'bg-neg/10 text-neg ring-1 ring-neg/30' }
  if (p <= 2) return { badge: 'SO CLOSE', msg: 'Under 2% off the record — keep attacking!', cls: 'bg-scm/10 text-scm ring-1 ring-scm/30' }
  if (p <= 5) return { badge: 'CLOSING IN', msg: 'Within 5% of the record — it\u2019s getting nervous.', cls: 'bg-gold/10 text-gold ring-1 ring-gold/40' }
  if (p <= 10) return { badge: 'ON THE HUNT', msg: 'Within 10% — stay on this trajectory and it will fall.', cls: 'bg-aqua-50 text-aqua-600 ring-1 ring-aqua-600/30' }
  return { badge: 'BUILDING', msg: 'Every swim closes the gap — keep pushing.', cls: 'bg-ink-50 text-ink-500 ring-1 ring-ink-200' }
}

function RecordsTab({ swimmerId, swimmer }) {
  const [records, setRecords] = useState([])
  const [gaps, setGaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('records')
  const [gapScope, setGapScope] = useState(null)
  const [gapPool, setGapPool] = useState('LCM')
  useEffect(() => {
    Promise.all([
      getHeldRecords({ swimmer: swimmerId }),
      getRecordGaps({ swimmer: swimmerId }),
    ]).then(([res, gapsRes]) => {
      // One entry per age category (U16, U17, OPEN...) — even when the same
      // swim holds the record in several categories, list each separately.
      const all = (res.data || []).flatMap(r =>
        ((r.categories && r.categories.length > 0) ? r.categories : ['OPEN']).map(cat => ({
          ...r,
          record_type: (r.scope || '').toUpperCase(),
          formatted_time: r.time,
          location: r.championship_name,
          result_date: r.date,
          categories: [cat],
        }))
      )
      setRecords(all)
      setGaps(gapsRes.data || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [swimmerId])

  if (loading) return <TableSkeleton rows={6} />

  const scopeLabels = { national: 'NATIONAL', gcc: 'GCC', arab: 'ARAB' }
  const availableScopes = ['national', 'gcc', 'arab'].filter(s => gaps.some(g => g.scope === s))
  const activeScope = gapScope && availableScopes.includes(gapScope) ? gapScope : availableScopes[0]

  const subTabs = (
    <div className="flex justify-center mb-4">
      <SegmentedControl
        options={[{ key: 'records', label: 'Records' }, { key: 'gaps', label: 'Record Gaps' }]}
        value={view} onChange={setView} />
    </div>
  )

  if (view === 'gaps') {
    const filteredGaps = gaps.filter(g => g.scope === activeScope && g.pool === gapPool)
    return (
      <div>
        {subTabs}
        <Card padding="none" className="overflow-hidden">
          <div className="p-4 border-b border-ink-100">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-title text-ink-900">Record Gaps</h3>
                <p className="text-body-sm text-ink-400 mt-0.5">Distance between all-time bests and current {scopeLabels[activeScope] || ''} records</p>
              </div>
              <SegmentedControl
                options={[{ key: 'LCM', label: 'LCM' }, { key: 'SCM', label: 'SCM' }]}
                value={gapPool} onChange={setGapPool} />
            </div>
            {/* Scope selector */}
            {availableScopes.length > 0 && (
              <div className="mt-3 rounded-sm border border-ink-100 bg-white p-2 flex flex-wrap gap-1.5">
                {availableScopes.map(s => (
                  <button key={s} onClick={() => setGapScope(s)}
                    className={`px-3 py-2 min-h-10 rounded-sm text-body-sm font-medium transition-colors ${
                      activeScope === s
                        ? 'bg-aqua-600 text-white'
                        : 'bg-ink-50 text-ink-500 hover:bg-ink-100 border border-ink-100'
                    }`}>
                    {scopeLabels[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
          {filteredGaps.length === 0 ? (
            <div className="p-8 text-center text-ink-400 text-body-sm">No record gaps for {scopeLabels[activeScope] || ''} {gapPool}</div>
          ) : (
            <div className="divide-y divide-ink-100">
              {filteredGaps.map((g) => {
                const maxGap = Math.max(...filteredGaps.map(x => Math.abs(x.gap_cs)))
                const barPct = maxGap > 0 ? (Math.abs(g.gap_cs) / maxGap) * 100 : 0
                return (
                  <div key={`${g.event_id}-${g.pool}`} className="px-3 sm:px-5 py-3.5 sm:py-4">
                    <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <EventLabel name={g.event_name} className="font-semibold" />
                        {g.pool && <PoolBadge pool={g.pool} />}
                        <Badge variant="status">{scopeLabels[g.scope]}</Badge>
                      </div>
                      {g.holds ? (
                        <Badge variant="pos">RECORD HOLDER</Badge>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          {gapMotivation(g.gap_pct) && (
                            <span className={`text-label px-2 py-0.5 rounded-sm ${gapMotivation(g.gap_pct).cls}`}>{gapMotivation(g.gap_pct).badge}</span>
                          )}
                          <span className="text-body-sm font-semibold tnum text-ink-500">+{g.gap_pct}%</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1">
                        <div className="flex justify-between text-label normal-case tracking-normal mb-1">
                          <span className="text-ink-400">Your Best</span>
                          <span className="text-ink-400">Record</span>
                        </div>
                        <div className="relative h-6 bg-ink-50 rounded-full overflow-hidden">
                          <div
                            className={`absolute start-0 top-0 h-full rounded-full transition-all duration-700 ${g.holds ? 'bg-pos' : 'bg-aqua-600'}`}
                            style={{ width: `${g.holds ? 100 : Math.max(100 - barPct * 0.6, 15)}%` }}
                          />
                          {!g.holds && (
                            <div className="absolute end-0 top-0 h-full border-s-2 border-dashed border-scm" style={{ width: `${barPct * 0.6}%` }}>
                              <div className="absolute -top-0.5 -start-1 w-2 h-7 bg-scm rounded-full opacity-50" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-time text-aqua-600">{g.swimmer_best}</span>
                      <span className={`text-body-sm tnum font-semibold ${g.holds ? 'text-pos' : 'text-neg'}`}>
                        {g.holds ? 'RECORD' : `+${g.gap_time}`}
                      </span>
                      <span className="text-time text-scm">{g.record_time}</span>
                    </div>
                    {!g.holds && gapMotivation(g.gap_pct) && (
                      <div className={`mt-2 text-body-sm font-medium px-3 py-1.5 rounded-sm ${gapMotivation(g.gap_pct).cls}`}>
                        {gapMotivation(g.gap_pct).msg}
                      </div>
                    )}
                    {!g.holds && g.record_holder && (
                      <div className="text-body-sm text-ink-400 mt-1 text-end">Record: {g.record_holder}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    )
  }

  const byType = {}
  records.forEach(r => {
    const type = r.record_type || 'OTHER'
    if (!byType[type]) byType[type] = []
    byType[type].push(r)
  })

  const totalCount = records.length
  const genderLabel = swimmer?.sex === 'M' ? "MEN'S" : "WOMEN'S"

  if (totalCount === 0) {
    return (
      <div>
      {subTabs}
      <Card>
        <EmptyState icon={Star} title="No records held"
          hint="Records will appear here when this swimmer sets Arab, GCC, or National records" />
      </Card>
      </div>
    )
  }

  // Tile + badge colors per record scope (token-palette broadcast look)
  const typeConfig = {
    NATIONAL: { label: 'NATIONAL', tile: 'linear-gradient(135deg, #7C3AED 0%, #9B6DF2 100%)', accent: '#7C3AED' },
    GCC: { label: 'GCC', tile: 'linear-gradient(135deg, #D4A017 0%, #E9C65B 100%)', accent: '#D4A017' },
    ARAB: { label: 'ARAB', tile: 'linear-gradient(135deg, #B45309 0%, #D08A2B 100%)', accent: '#B45309' },
    WORLD: { label: 'WORLD', tile: 'linear-gradient(135deg, #0A1220 0%, #1E2A3A 100%)', accent: '#0A1220' },
    ASIAN: { label: 'ASIAN', tile: 'linear-gradient(135deg, #0891B2 0%, #22D3EE 100%)', accent: '#0891B2' },
    ISLAMIC: { label: 'ISLAMIC', tile: 'linear-gradient(135deg, #059669 0%, #34C08B 100%)', accent: '#059669' },
  }
  const sectionOrder = ['WORLD', 'ASIAN', 'ISLAMIC', 'ARAB', 'GCC', 'NATIONAL'].filter(t => (byType[t] || []).length > 0)

  const fmtDate = (d) => {
    if (!d) return ''
    const parts = String(d).split('-')
    if (parts.length === 3 && parts[0].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`
    return d
  }

  // Compress age categories: ['U14','U15','U16','OPEN'] -> ['U14–U16', 'OPEN']
  const compressCategories = (cats) => {
    if (!cats || cats.length === 0) return ['OPEN']
    const hasOpen = cats.includes('OPEN')
    const ages = cats.filter(c => c !== 'OPEN').map(c => parseInt(c.slice(1))).sort((a, b) => a - b)
    const out = []
    let start = null, prev = null
    ages.forEach(n => {
      if (start === null) { start = prev = n; return }
      if (n === prev + 1) { prev = n; return }
      out.push(start === prev ? `U${start}` : `U${start}\u2013U${prev}`)
      start = prev = n
    })
    if (start !== null) out.push(start === prev ? `U${start}` : `U${start}\u2013U${prev}`)
    if (hasOpen) out.push('OPEN')
    return out
  }

  return (
    <div>
    {subTabs}
    <div className="rounded-md overflow-hidden bg-ink-50 border border-ink-100 p-4 sm:p-8">
      {/* Header banner pill */}
      <div className="flex justify-center mb-4">
        <div className="inline-flex items-center gap-2 sm:gap-4 px-4 sm:px-10 py-3 max-w-full rounded-full shadow-pop bg-gradient-to-b from-ink-700 to-ink-950 border-2 border-aqua-500">
          <Star size={18} className="text-gold fill-gold shrink-0" />
          <span className="text-white font-bold uppercase tracking-[0.06em] sm:tracking-[0.12em] text-body-sm sm:text-xl text-center">
            {genderLabel} RECORD HOLDER <span className="mx-1">&bull;</span> {totalCount} RECORD{totalCount !== 1 ? 'S' : ''}
          </span>
          <Star size={18} className="text-gold fill-gold shrink-0" />
        </div>
      </div>

      {/* Stat tiles */}
      <div className="flex flex-wrap justify-center gap-2.5 sm:gap-4 mb-5 sm:mb-6">
        <div className="rounded-md shadow-card px-3 sm:px-5 pt-3 sm:pt-4 pb-3 text-center min-w-[92px] sm:min-w-[130px] bg-gradient-to-br from-ink-700 to-ink-950">
          <div className="text-white font-bold tnum text-4xl sm:text-6xl leading-none"><AnimatedNumber value={totalCount} /></div>
          <div className="text-white text-label mt-2">Total Records</div>
          <div className="h-0.5 w-8 bg-aqua-400 mx-auto mt-1.5 rounded-full" />
        </div>
        {sectionOrder.map(t => (
          <div key={t} className="rounded-md shadow-card px-3 sm:px-5 pt-3 sm:pt-4 pb-3 text-center min-w-[80px] sm:min-w-[110px]"
            style={{ background: typeConfig[t].tile }}>
            <div className="text-white font-bold tnum text-4xl sm:text-6xl leading-none"><AnimatedNumber value={byType[t].length} /></div>
            <div className="text-white text-label mt-2">{typeConfig[t].label}</div>
            <div className="h-0.5 w-8 bg-white/80 mx-auto mt-1.5 rounded-full" />
          </div>
        ))}
      </div>

      {/* Sections per record type */}
      {sectionOrder.map(type => {
        const list = byType[type]
        const cfg = typeConfig[type]
        return (
          <div key={type} className="mb-5 sm:mb-6 last:mb-0">
            {/* Section header: ink banner + records count with rules */}
            <div className="flex items-center gap-3 mb-3">
              <div className="inline-flex items-center gap-2.5 ps-4 pe-8 py-2.5 shadow-card shrink-0 bg-gradient-to-b from-ink-700 to-ink-900 rounded-sm"
                style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)' }}>
                <Star size={14} className="text-gold fill-gold" />
                <span className="text-white text-label whitespace-nowrap">{cfg.label} RECORDS</span>
              </div>
              <div className="h-px flex-1 max-w-[60px] bg-aqua-600" />
              <span className="text-label whitespace-nowrap text-aqua-600">
                {list.length} RECORD{list.length !== 1 ? 'S' : ''}
              </span>
              <div className="h-px flex-1 bg-aqua-600" />
            </div>

            {/* Record rows */}
            <div className="bg-white rounded-md border border-ink-100 shadow-card overflow-hidden divide-y divide-ink-100">
              {list.map((r, i) => (
                <div key={i} className="flex items-center gap-3 sm:gap-5 px-3 sm:px-5 py-3.5 sm:py-4">
                  {/* Number circle */}
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 shadow-card bg-gradient-to-b from-ink-700 to-ink-900">
                    <span className="text-white font-bold tnum text-body sm:text-lg">{i + 1}</span>
                  </div>
                  {/* Event + meet + date */}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold uppercase tracking-wide text-body-sm sm:text-lg leading-tight truncate text-ink-900">
                      {r.event_detail?.name || r.event_name}
                    </div>
                    <div className="text-body-sm font-medium mt-0.5 truncate text-aqua-600">{r.location}</div>
                    <div className="text-body-sm mt-0.5 flex items-center gap-1.5 text-ink-500 tnum">
                      {fmtDate(r.result_date)}
                      <span className="sm:hidden border border-aqua-600 text-aqua-600 rounded-sm px-1 py-px text-label">{compressCategories(r.categories)[0]}</span>
                    </div>
                  </div>
                  {/* Badges */}
                  <div className="hidden sm:flex items-center gap-2.5 shrink-0">
                    <span className="border-2 rounded-sm px-2.5 py-1 text-label bg-white" style={{ borderColor: cfg.accent, color: cfg.accent }}>{cfg.label}</span>
                    {compressCategories(r.categories).map(cat => (
                      <span key={cat} className="border-2 border-aqua-600 text-aqua-600 rounded-sm px-2.5 py-1 text-label bg-white">{cat}</span>
                    ))}
                    <span className={`border-2 rounded-sm px-2.5 py-1 text-label bg-white ${r.pool === 'SCM' ? 'border-scm text-scm' : 'border-lcm text-lcm'}`}>{r.pool}</span>
                  </div>
                  {/* Divider + time */}
                  <div className="hidden sm:block h-8 w-px bg-ink-200 shrink-0" />
                  <div className="font-bold tnum text-body sm:text-2xl shrink-0 min-w-[70px] sm:min-w-[110px] text-end text-ink-900">
                    {r.formatted_time}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
    </div>
  )
}

/* ───────── Gallery Tab ───────── */
function GalleryTab({ swimmerId }) {
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    getMediaItems({ swimmer: swimmerId }).then(res => {
      setMedia(res.data.results || res.data || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [swimmerId])

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
      </div>
    )
  }

  const photos = media.filter(m => m.media_type === 'PHOTO' && m.image)
  const videos = media.filter(m => m.media_type === 'VIDEO' && m.video_url)

  if (!photos.length && !videos.length) {
    return (
      <Card>
        <EmptyState icon={ImageIcon} title="No media yet" hint="Photos and videos tagged with this swimmer will appear here" />
      </Card>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Photos Grid */}
      {photos.length > 0 && (
        <div>
          <h3 className="text-title text-ink-900 mb-3">Photos <span className="text-ink-400 font-normal text-body-sm">({photos.length})</span></h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map((p) => (
              <button key={p.id} onClick={() => setLightbox(p)}
                className="aspect-square rounded-md overflow-hidden bg-ink-50 group relative shadow-card border border-ink-100 hover:border-aqua-500/40 transition-colors">
                <img src={p.image} alt={p.caption || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                {p.caption && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/70 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <p className="text-white text-body-sm truncate">{p.caption}</p>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <div>
          <h3 className="text-title text-ink-900 mb-3">Videos <span className="text-ink-400 font-normal text-body-sm">({videos.length})</span></h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {videos.map((v) => (
              <a key={v.id} href={v.video_url} target="_blank" rel="noopener noreferrer"
                className="bg-white rounded-md border border-ink-100 shadow-card overflow-hidden hover:border-aqua-500/40 transition-colors group">
                {v.embed_thumbnail && (
                  <div className="aspect-video bg-ink-50 relative overflow-hidden">
                    <img src={v.embed_thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-pop group-hover:scale-110 transition-transform">
                        <Play size={24} className="text-ink-900 ms-1 fill-ink-900" />
                      </div>
                    </div>
                  </div>
                )}
                {v.caption && <div className="p-3 text-body-sm text-ink-700">{v.caption}</div>}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-ink-950/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 end-4 text-white/70 hover:text-white z-10 p-2 min-h-10 min-w-10" aria-label="Close">
            <X size={28} />
          </button>
          <img src={lightbox.image} alt={lightbox.caption || ''} className="max-w-full max-h-[90vh] rounded-lg shadow-pop" onClick={e => e.stopPropagation()} />
          {lightbox.caption && <p className="absolute bottom-8 text-white text-center text-body-sm">{lightbox.caption}</p>}
        </div>
      )}
    </div>
  )
}

/* ───────── Progression Tab ───────── */
function ProgressionTab({ swimmerId }) {
  const [pool, setPool] = useState('LCM')
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getSwimmerProgression(swimmerId, pool)
      .then(res => setLines(res.data))
      .catch(() => setLines([]))
      .finally(() => setLoading(false))
  }, [swimmerId, pool])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-title text-ink-900">Performance Progression</h3>
        <SegmentedControl className="ms-auto whitespace-nowrap"
          options={[{ key: 'LCM', label: 'Long Course' }, { key: 'SCM', label: 'Short Course' }]}
          value={pool} onChange={setPool} />
      </div>
      {lines.length === 0 ? (
        <Card>
          <EmptyState icon={TrendingUp} title={`No progression data for ${pool === 'LCM' ? 'Long Course' : 'Short Course'}`} />
        </Card>
      ) : (
        <ProgressionChart lines={lines} />
      )}
    </div>
  )
}

/* ───────── Transfer History Tab ───────── */
const TH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtMonthYear(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return `${TH_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function TransferHistoryTab({ swimmerId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getSwimmerTransferHistory(swimmerId)
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [swimmerId])

  if (loading) return <TableSkeleton rows={5} />
  if (!data) return <div className="text-center py-8 text-ink-400 text-body-sm">Failed to load transfer history</div>

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Club History */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-ink-100 bg-ink-50">
          <h3 className="text-title text-ink-900">Club History</h3>
          <p className="text-body-sm text-ink-400 mt-0.5">Clubs represented based on competition results</p>
        </div>
        {data.clubs.length === 0 ? (
          <div className="p-8 text-center text-ink-400 text-body-sm">No club history available</div>
        ) : (
          <div className="relative">
            <div className="absolute start-7 sm:start-8 top-0 bottom-0 w-0.5 bg-ink-100" />
            <div className="divide-y divide-ink-100">
              {data.clubs.map((club, i) => (
                <div key={i} className="flex items-start gap-3 sm:gap-4 px-3.5 sm:px-5 py-3.5 sm:py-4 relative">
                  <div className="w-7 h-7 rounded-full bg-aqua-100 border-2 border-aqua-500 flex items-center justify-center z-10 shrink-0 mt-0.5">
                    <span className="text-body-sm font-bold tnum text-aqua-600">{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-body-sm text-ink-900">{club.club}</span>
                      {club.country && (
                        <CountryFlag code={club.country_code} flagUrl={club.country_flag} name={club.country} className="text-body-sm text-ink-500" />
                      )}
                      {club.is_national && <Badge variant="scope">National Team</Badge>}
                      {club.is_current && <Badge variant="pos">Current</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-body-sm text-ink-500">
                      <span>
                        {club.is_current
                          ? <>From <span className="font-semibold text-ink-700">{fmtMonthYear(club.first_meet)}</span> to <span className="font-semibold text-pos">now</span></>
                          : <>From <span className="font-semibold text-ink-700">{fmtMonthYear(club.first_meet)}</span> to <span className="font-semibold text-ink-700">{fmtMonthYear(club.last_meet)}</span></>}
                      </span>
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <div className="text-body-sm font-bold tnum text-ink-900">{club.meets}</div>
                    <div className="text-body-sm text-ink-400">meet{club.meets !== 1 ? 's' : ''}</div>
                    <div className="text-body-sm text-ink-400 mt-0.5">{club.results} result{club.results !== 1 ? 's' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Nationality */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-ink-100 bg-ink-50">
          <h3 className="text-title text-ink-900">Nationality</h3>
        </div>
        <div className="px-4 sm:px-5 py-3.5 sm:py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.nationality_meet_counts.map((n, i) => (
              <div key={i} className="flex items-center gap-3 bg-ink-50 rounded-sm p-3">
                <CountryFlag code={n.country_code} flagUrl={n.country_flag} name={n.country} />
                <div className="flex-1" />
                <div className="text-end">
                  <div className="text-lg font-bold tnum text-ink-900">{n.meets}</div>
                  <div className="text-body-sm text-ink-400">meet{n.meets !== 1 ? 's' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {data.nationality_changes.filter(ch => ch.from_country !== ch.to_country).length > 0 && (
          <div className="px-4 sm:px-5 pb-4 border-t border-ink-100 pt-4">
            <h4 className="text-body-sm font-semibold text-ink-700 mb-3">Nationality Changes</h4>
            <div className="space-y-3">
              {data.nationality_changes.filter(ch => ch.from_country !== ch.to_country).map((ch, i) => (
                <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-body-sm">
                  {ch.from_country && (
                    <>
                      <CountryFlag code={ch.from_country_code} flagUrl={ch.from_country_flag} name={ch.from_country} />
                      <span className="text-ink-400">&rarr;</span>
                    </>
                  )}
                  <CountryFlag code={ch.to_country_code} flagUrl={ch.to_country_flag} name={ch.to_country} />
                  <span className="text-ink-500">{formatDate(ch.effective_date)}</span>
                  {ch.notes && <span className="text-ink-400">({ch.notes})</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ───────── Rankings Tab — scope pills + per-pool cards ───────── */
function RankingsTab({ swimmerId, swimmer }) {
  const [rankings, setRankings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState([])
  const [activeScope, setActiveScope] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState(null)

  useEffect(() => {
    Promise.all([
      getSwimmerRankings(swimmerId),
      getSwimmerEvents(swimmerId),
    ]).then(([rankRes, evRes]) => {
      setRankings(rankRes.data)
      setEvents(evRes.data)
    }).finally(() => setLoading(false))
  }, [swimmerId])

  if (loading) return <TableSkeleton rows={6} />
  if (!rankings || rankings.length === 0) return (
    <Card>
      <EmptyState icon={BarChart3} title="No ranking data available" />
    </Card>
  )

  const eventMap = {}
  for (const e of events) {
    eventMap[`${e.event_id}-${e.pool}`] = e.event_name
    eventMap[`${e.event_id}`] = e.event_name
  }
  const eventName = (r) =>
    (eventMap[`${r.event_id}-${r.pool}`] || eventMap[`${r.event_id}`] || `Event ${r.event_id}`).toUpperCase()

  const scopeSet = new Set()
  for (const r of rankings) {
    for (const s of Object.keys(r.rankings)) scopeSet.add(s)
  }
  const scopeOrder = ['national', 'arab', 'gcc']
  const scopes = scopeOrder.filter(s => scopeSet.has(s))
  const scopeLabel = { arab: 'ARAB', gcc: 'GCC', national: 'NATIONAL' }
  const scope = scopes.includes(activeScope) ? activeScope : scopes[0]

  const pools = [...new Set(rankings.map(r => r.pool))].sort((a, b) => (a === 'LCM' ? -1 : 1))

  const ordinalSuffix = (n) => {
    if (n % 100 >= 11 && n % 100 <= 13) return 'TH'
    const last = n % 10
    if (last === 1) return 'ST'
    if (last === 2) return 'ND'
    if (last === 3) return 'RD'
    return 'TH'
  }

  const genderLabel = swimmer?.sex === 'M' ? "MEN'S" : "WOMEN'S"

  return (
    <div>
      {/* Scope pills */}
      <div className="flex justify-center gap-2 sm:gap-3 mb-4">
        {scopes.map(s => (
          <button key={s} onClick={() => setActiveScope(s)}
            className={`px-5 sm:px-8 py-2 min-h-10 rounded-md font-bold text-body-sm sm:text-body tracking-wide transition-colors shadow-card ${
              scope === s ? 'bg-aqua-600 text-white' : 'bg-white text-ink-900 hover:bg-aqua-50'
            }`}>
            {scopeLabel[s]}
          </button>
        ))}
      </div>

      {/* One card per pool, side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-start">
        {pools.map(pool => {
          const rows = rankings
            .filter(r => r.pool === pool && r.rankings[scope])
            .sort((a, b) => a.rankings[scope].rank - b.rankings[scope].rank)
          if (rows.length === 0) return (
            <div key={pool} className="bg-white rounded-lg shadow-card p-6 text-center text-body-sm text-ink-400">
              No {scopeLabel[scope]} rankings ({pool})
            </div>
          )
          const selected = rows.find(r => r.event_id === selectedEventId) || rows[0]
          const sel = selected.rankings[scope]
          return (
            <div key={pool} className="bg-white rounded-lg shadow-card p-3 sm:p-4">
              {/* Header pill — selected event */}
              <div className="bg-aqua-600 text-white font-bold uppercase text-center rounded-md py-2 px-3 text-body-sm sm:text-body tracking-wide leading-tight">
                {genderLabel} {eventName(selected)} <span className="mx-1 opacity-60">|</span> {pool}
              </div>

              {/* Hero: rank square + time */}
              <div className="flex items-center justify-center gap-3 sm:gap-4 py-4 sm:py-5">
                <div className="flex items-start justify-center bg-aqua-600 text-white rounded-md px-3 py-2 sm:px-4 sm:py-3 shrink-0">
                  <span className="text-5xl sm:text-6xl font-extrabold leading-none tnum"><AnimatedNumber value={sel.rank} /></span>
                  <span className="text-body-sm sm:text-body font-bold ms-0.5 mt-1">{ordinalSuffix(sel.rank)}</span>
                </div>
                <div className="w-px self-stretch bg-ink-100" />
                <span className="text-4xl sm:text-5xl font-extrabold tnum tracking-tight text-aqua-600">
                  <AnimatedTime time={selected.best_time} />
                </span>
              </div>

              {/* Event rows */}
              <div className="divide-y divide-ink-100 border-t border-ink-100">
                {rows.map(r => {
                  const rk = r.rankings[scope]
                  const isSel = r.event_id === selected.event_id
                  return (
                    <button key={`${r.event_id}-${r.pool}`}
                      onClick={() => setSelectedEventId(r.event_id)}
                      className={`w-full flex items-center gap-2 px-2 sm:px-3 py-2.5 min-h-11 text-start transition-colors ${
                        isSel ? 'bg-aqua-50 text-aqua-600' : 'hover:bg-ink-50 text-ink-900'
                      }`}>
                      <span className={`flex-1 min-w-0 truncate font-bold uppercase text-[13px] sm:text-body-sm ${isSel ? 'text-aqua-600' : 'text-ink-900'}`}>
                        {eventName(r)}
                      </span>
                      <span className={`shrink-0 tnum text-[13px] sm:text-body-sm font-semibold ${isSel ? 'text-aqua-600' : 'text-ink-400'}`}>
                        {rk.rank}{rk.total ? `/${rk.total}` : ''}
                      </span>
                      <span className={`shrink-0 w-[64px] sm:w-[76px] text-end tnum font-bold text-[13px] sm:text-body-sm ${isSel ? 'text-aqua-600' : 'text-ink-900'}`}>
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

/* ───────── TAB CONFIG ───────── */
const TABS = [
  { key: 'times', label: 'Times', icon: Clock },
  { key: 'meets', label: 'Meets', icon: CalendarDays },
  { key: 'medals', label: 'Medals', icon: Medal },
  { key: 'rankings', label: 'Rankings', icon: BarChart3 },
  { key: 'records', label: 'Records', icon: Star },
  { key: 'progression', label: 'Progression', icon: TrendingUp },
  { key: 'stats', label: 'Stats', icon: ChartLine },
  { key: 'compare', label: 'Compare', icon: GitCompare },
  { key: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
  { key: 'gallery', label: 'Gallery', icon: Images },
]

/* ───────── MAIN PAGE ───────── */
export default function SwimmerProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()
  const isAdmin = !!token
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'times'
  const setActiveTab = (tab) => setSearchParams({ tab })
  const [swimmer, setSwimmer] = useState(null)
  const [events, setEvents] = useState([])
  const [stats, setStats] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [clubHistory, setClubHistory] = useState([])

  useEffect(() => {
    Promise.all([
      getSwimmer(id).then(res => setSwimmer(res.data)),
      getSwimmerEvents(id).then(res => setEvents(res.data)),
      getSwimmerProfileStats(id).then(res => setStats(res.data)),
    ]).finally(() => setLoaded(true))
    getSwimmerTransferHistory(id).then(res => setClubHistory(res.data.clubs || [])).catch(() => setClubHistory([]))
  }, [id])

  // Clubs the swimmer currently represents (excluding national teams)
  const currentClubs = clubHistory.filter(c => c.is_current && !c.is_national)

  // Non-Arab swimmers keep a normal profile but Records and Rankings are
  // Arab-only features (their scopes are national/Arab/GCC)
  const isNonArab = swimmer?.nationality_detail?.region === 'OTHER'
  const visibleTabs = isNonArab
    ? TABS.filter(t => !['records', 'rankings'].includes(t.key))
    : TABS
  const effectiveTab = isNonArab && ['records', 'rankings'].includes(activeTab)
    ? 'times' : activeTab

  const handleEventClick = async (event) => {
    setSelectedEvent(event)
    setLoadingHistory(true)
    try {
      const res = await getSwimmerEventHistory(id, event.event_id, event.pool)
      setHistory(res.data)
    } catch {
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  if (!loaded) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pb-8 space-y-4 sm:space-y-5">
        <Skeleton className="h-8 w-40 mt-4" />
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-10 w-full" />
        <TableSkeleton rows={8} />
      </div>
    )
  }

  if (!swimmer) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-12">
        <EmptyState icon={User} title="Swimmer not found" />
      </div>
    )
  }

  const metaChip = 'bg-white/10 text-white/80 text-body-sm px-2.5 sm:px-3 py-1.5 rounded-sm'

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pb-12">
      {/* Back */}
      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate('/swimmers')} className="my-3">
        Back to Swimmers
      </Button>

      {/* Hero Header */}
      <Hero className="mb-4">
        {/* Admin actions — top end, quiet ghost buttons, visitors see nothing */}
        {isAdmin && (
          <div className="absolute top-3 end-3 sm:top-5 sm:end-5 flex gap-1.5 sm:gap-2">
            <button onClick={async () => {
                const next = !swimmer.is_retired
                await updateSwimmer(id, { is_retired: next })
                setSwimmer({ ...swimmer, is_retired: next })
              }}
              className={`px-3 py-2 min-h-10 rounded-sm text-body-sm font-medium transition-colors ring-1 ${
                swimmer.is_retired
                  ? 'bg-neg/20 text-white ring-neg/40 hover:bg-neg/30'
                  : 'bg-white/10 text-white/70 ring-white/10 hover:bg-white/20'
              }`}>
              {swimmer.is_retired ? 'Active' : 'Retired'}
            </button>
            <button onClick={() => navigate(`/swimmers/${id}/edit`)}
              className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-2 min-h-10 rounded-sm text-body-sm font-medium transition-colors ring-1 ring-white/10"
              aria-label="Edit swimmer">
              <Pencil size={14} /> Edit
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-5">
          {/* Photo */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden shrink-0 ring-2 ring-aqua-400/50">
            {swimmer.photo ? (
              <img src={swimmer.photo} alt={swimmer.name} className="w-full h-full object-cover" />
            ) : (
              <User size={48} className="text-white/30" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 text-center sm:text-start">
            <div className="flex items-center justify-center sm:justify-start gap-2 sm:gap-3 flex-wrap">
              <h1 className="text-display sm:text-display-xl text-white">{swimmer.name}</h1>
              {swimmer.is_retired && <Badge variant="neg">Retired</Badge>}
            </div>
            <div className="flex items-center justify-center sm:justify-start gap-2 mt-2">
              <CountryFlag code={swimmer.nationality_detail?.code} flagUrl={swimmer.nationality_detail?.flag_url} name={swimmer.nationality_detail?.name} className="text-white/80 text-body-sm font-medium" />
            </div>
            <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 sm:gap-2 mt-3">
              {swimmer.date_of_birth && (
                <span className={metaChip}>
                  DOB <span className="text-white font-semibold tnum">{formatDate(swimmer.date_of_birth)}</span>
                </span>
              )}
              {!swimmer.date_of_birth && swimmer.birth_year && (
                <span className={metaChip}>
                  Born <span className="text-white font-semibold tnum">{swimmer.birth_year}</span>
                </span>
              )}
              {swimmer.age != null && (
                <span className={metaChip}>
                  Age <span className="text-white font-semibold tnum">{swimmer.age}</span>
                </span>
              )}
              {swimmer.sex && (
                <span className={metaChip}>
                  {swimmer.sex === 'M' ? 'Male' : 'Female'}
                </span>
              )}
              {currentClubs.length > 1 ? (
                currentClubs.map((c, i) => (
                  <span key={i} className={metaChip}>
                    Club <span className="text-white font-semibold">{c.club}</span>
                    {c.country && <span className="text-aqua-400 font-semibold"> &middot; {c.country}</span>}
                  </span>
                ))
              ) : swimmer.club ? (
                <span className={metaChip}>
                  Club <span className="text-white font-semibold">{swimmer.club}</span>
                  {currentClubs.length === 1 && currentClubs[0].country && (
                    <span className="text-aqua-400 font-semibold"> &middot; {currentClubs[0].country}</span>
                  )}
                </span>
              ) : null}
              {(swimmer.instagram_url || swimmer.facebook_url) && (
                <span className="flex items-center gap-1.5">
                  {swimmer.instagram_url && (
                    <a href={swimmer.instagram_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                      className="bg-white/10 hover:bg-white/25 text-white p-2.5 min-h-10 min-w-10 rounded-sm transition-colors inline-flex items-center justify-center" title="Instagram" aria-label="Instagram">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zm0 10.162a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    </a>
                  )}
                  {swimmer.facebook_url && (
                    <a href={swimmer.facebook_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                      className="bg-white/10 hover:bg-white/25 text-white p-2.5 min-h-10 min-w-10 rounded-sm transition-colors inline-flex items-center justify-center" title="Facebook" aria-label="Facebook">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    </a>
                  )}
                </span>
              )}
            </div>
            {swimmer.nicknames?.length > 0 && (
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-2">
                {swimmer.nicknames.map((n, i) => (
                  <span key={i} className="bg-aqua-400/20 text-aqua-100 text-body-sm px-2.5 py-1 rounded-full font-medium">{n.nickname}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Hero>

      {/* Tabs — Compare stays a public navigation action */}
      <Tabs
        tabs={visibleTabs}
        active={effectiveTab}
        onChange={(key) => key === 'compare' ? navigate(`/swimmers/compare?ids=${id}`) : setActiveTab(key)}
        sticky
        className="mb-4 sm:mb-6 rounded-md"
      />

      {/* Tab Content */}
      <div key={effectiveTab} className="animate-fade-up">
        {effectiveTab === 'times' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-3 sm:gap-4">
            <PersonalBestsTable events={events} onEventClick={handleEventClick} selectedEvent={selectedEvent} />
            <TimeHistoryPanel selectedEvent={selectedEvent} history={history} loadingHistory={loadingHistory} navigate={navigate} />
          </div>
        )}
        {effectiveTab === 'meets' && <MeetsTab stats={stats} navigate={navigate} />}
        {effectiveTab === 'medals' && <MedalsTab stats={stats} />}
        {effectiveTab === 'rankings' && <RankingsTab swimmerId={parseInt(id)} swimmer={swimmer} />}
        {effectiveTab === 'records' && <RecordsTab swimmerId={parseInt(id)} swimmer={swimmer} />}
        {effectiveTab === 'progression' && <ProgressionTab swimmerId={parseInt(id)} />}
        {effectiveTab === 'stats' && <StatsTab stats={stats} events={events} swimmerId={parseInt(id)} />}
        {effectiveTab === 'transfers' && <TransferHistoryTab swimmerId={parseInt(id)} />}
        {effectiveTab === 'gallery' && <GalleryTab swimmerId={parseInt(id)} />}
      </div>
    </div>
  )
}
