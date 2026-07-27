import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { getSwimmer, updateSwimmer, getSwimmerEvents, getSwimmerEventHistory, getSwimmerProfileStats, getSwimmerProgression, getSwimmerTransferHistory, getSwimmerRankings, getSwimmerQualifyingGaps } from '../api/swimmers'
import { getHeldRecords } from '../api/records'
import { getMediaItems } from '../api/media'
import CountryFlag from '../components/common/CountryFlag'
import ProgressionChart from '../components/common/ProgressionChart'


/* ───────── Animated number counter ───────── */
function AnimatedNumber({ value, duration = 800 }) {
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
  return <>{display}</>
}

/* ───────── Pool badge ───────── */
function PoolBadge({ pool, className = '' }) {
  if (!pool) return null
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md tracking-wide ${
      pool === 'SCM' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
    } ${className}`}>{pool}</span>
  )
}

/* ───────── Personal Bests ───────── */
function PersonalBestsTable({ events, onEventClick, selectedEvent }) {
  const lcm = events.filter(e => e.pool === 'LCM' && !e.is_relay)
  const scm = events.filter(e => e.pool === 'SCM' && !e.is_relay)
  const relays = events.filter(e => e.is_relay)

  const renderSection = (rows, label, poolTag, delayStart) => {
    if (!rows.length) return null
    return (
      <div className="mb-2 animate-fade-in-up" style={{ animationDelay: `${delayStart * 0.08}s` }}>
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md ${
            poolTag === 'LCM' ? 'bg-sky-100 text-sky-700' : poolTag === 'SCM' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
          }`}>{label}</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>
        <div className="space-y-0.5">
          {rows.map((e, i) => {
            const isSelected = selectedEvent?.event_id === e.event_id && selectedEvent?.pool === e.pool
            return (
              <button key={`${e.event_id}-${e.pool}`} onClick={() => onEventClick(e)}
                className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 group ${
                  isSelected
                    ? 'bg-sky-50 ring-1 ring-sky-200 shadow-sm'
                    : 'hover:bg-gray-50 hover:shadow-sm'
                }`}
                style={{ animationDelay: `${(delayStart + i) * 0.04}s` }}>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-semibold transition-colors ${isSelected ? 'text-sky-700' : 'text-gray-800 group-hover:text-sky-700'}`}>{e.event_name}</span>
                </div>
                <span className="font-mono text-sm font-bold text-sky-600 tabular-nums">{e.best_time}</span>
                <span className="text-[10px] text-gray-400 bg-gray-100 rounded-md px-1.5 py-0.5 font-medium">{e.times_count}x</span>
                <svg className={`w-4 h-4 text-gray-300 transition-transform ${isSelected ? 'translate-x-0.5 text-sky-400' : 'group-hover:translate-x-0.5'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="p-4 pb-3 border-b bg-gradient-to-r from-gray-50 to-white">
        <h3 className="font-bold text-base text-gray-800">Personal Best Times</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">Tap an event to explore race history</p>
      </div>
      <div className="p-2.5 max-h-[600px] overflow-y-auto">
        {renderSection(lcm, 'Long Course', 'LCM', 0)}
        {renderSection(scm, 'Short Course', 'SCM', lcm.length)}
        {renderSection(relays, 'Relay', 'RELAY', lcm.length + scm.length)}
        {events.length === 0 && (
          <div className="py-12 text-center text-gray-300">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-sm">No competition results yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────── Time History ───────── */
function TimeHistoryPanel({ selectedEvent, history, loadingHistory, navigate }) {
  if (!selectedEvent) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm flex items-center justify-center min-h-[400px] animate-fade-in">
        <div className="text-center text-gray-300 px-6">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="text-base font-medium text-gray-400">Select an event</p>
          <p className="text-sm text-gray-300 mt-1">Choose from the list to view full time history</p>
        </div>
      </div>
    )
  }

  const officialHistory = history.filter(x => !x.is_hc)
  const bestCs = officialHistory.length ? Math.min(...officialHistory.map(x => x.time_centiseconds)) : null

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden animate-slide-right">
      <div className="p-4 border-b bg-gradient-to-r from-gray-50 to-white flex items-center gap-3">
        <div className="flex-1">
          <h3 className="font-bold text-base text-gray-800">{selectedEvent.event_name}</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {history.length} race{history.length !== 1 ? 's' : ''} recorded
          </p>
        </div>
        <PoolBadge pool={selectedEvent.pool} />
        {selectedEvent.is_relay && <span className="text-[10px] font-bold uppercase tracking-widest bg-purple-100 text-purple-700 px-2.5 py-1 rounded-md">Relay</span>}
      </div>
      {loadingHistory ? (
        <div className="p-12 text-center">
          <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80">
                <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">#</th>
                <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Time</th>
                <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Age</th>
                <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Round</th>
                <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Team</th>
                <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Meet</th>
                <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Date</th>
                <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">FINA</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => {
                const isBest = h.time_centiseconds === bestCs
                return (
                  <tr key={h.id} className={`border-b border-gray-50 transition-colors hover:bg-sky-50/30 animate-fade-in-up`}
                    style={{ animationDelay: `${i * 0.03}s` }}>
                    <td className="px-2 sm:px-3 py-2 text-gray-300 font-medium">{i + 1}</td>
                    <td className="px-2 sm:px-3 py-2">
                      <div className="flex items-center gap-1">
                        <span className={`font-mono font-bold whitespace-nowrap ${isBest ? 'text-emerald-600' : 'text-gray-800'}`}>{h.time}</span>
                        {!h.is_relay && isBest && (
                          <span className="text-[8px] sm:text-[9px] font-black bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded-md">PB</span>
                        )}
                        {h.is_hc && (
                          <span className="text-[8px] sm:text-[9px] font-black bg-amber-100 text-amber-700 px-1 py-0.5 rounded-md" title="Hors concours – does not count in rankings">HC</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-gray-500 hidden sm:table-cell">{h.age_at_competition || '-'}</td>
                    <td className="px-2 sm:px-3 py-2 hidden md:table-cell">
                      {h.round_type ? (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          h.round_type === 'Finals' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                        }`}>{h.round_type}</span>
                      ) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-gray-500 hidden lg:table-cell">{h.team || <span className="text-gray-300">-</span>}</td>
                    <td className="px-2 sm:px-3 py-2">
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/meets/${h.championship_id}`) }}
                        className="text-sky-600 hover:text-sky-800 font-medium transition-colors truncate max-w-[120px] sm:max-w-none block">
                        {h.championship_name}
                      </button>
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-gray-400 hidden md:table-cell whitespace-nowrap">{h.championship_date}</td>
                    <td className="px-2 sm:px-3 py-2 hidden sm:table-cell">
                      {h.fina_points ? (
                        <span className={`font-mono font-semibold ${h.fina_points >= 1000 ? 'text-amber-600' : h.fina_points >= 900 ? 'text-emerald-600' : h.fina_points >= 800 ? 'text-sky-600' : h.fina_points >= 600 ? 'text-blue-600' : 'text-gray-600'}`}>{h.fina_points}</span>
                      ) : <span className="text-gray-300">-</span>}
                    </td>
                  </tr>
                )
              })}
              {history.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-300 text-sm">No times recorded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ───────── Medals Tab (infographic) ───────── */
const MEDAL_NAVY = '#0b1f5e'
const MEDAL_GOLD = '#f2a71b'
const MEDAL_SILVER = '#b9bdc6'
const MEDAL_BRONZE = '#e2711d'

const MEDAL_COMPS = [
  { label: 'OLYMPIC', match: 'Olympic', color: '#eef1f6', fg: '#1e6ef5',
    icon: <svg viewBox="0 0 48 30" className="w-5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3.4"><circle cx="9" cy="10" r="6.5"/><circle cx="24" cy="10" r="6.5"/><circle cx="39" cy="10" r="6.5"/><circle cx="16.5" cy="19" r="6.5"/><circle cx="31.5" cy="19" r="6.5"/></svg> },
  { label: 'WORLD', match: 'World', color: '#1e6ef5', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="3.5" ry="8"/><path d="M4 12h16M5 8h14M5 16h14" strokeWidth="1.2"/></svg> },
  { label: 'ARAB', match: 'Arab', color: '#1f8f4e', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M12 3l2 4.2 4.6.7-3.3 3.2.8 4.6L12 13.5l-4.1 2.2.8-4.6L5.4 7.9l4.6-.7z"/></svg> },
  { label: 'ASIAN', match: 'Asian', color: '#7a36d9', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M12 3l7 4v2H5V7l7-4zM6 10h2v8H6zM11 10h2v8h-2zM16 10h2v8h-2zM4 19h16v2H4z"/></svg> },
  { label: 'AFRICAN', match: 'African', color: '#2aa63f', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M8 2l8 1 3 5-2 5-2 7-3 3-3-6-2-6-1-5 2-4z"/></svg> },
  { label: 'GCC', match: 'GCC', color: '#0e7f96', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M6 3l7 2 5 4-1 6-4 4-5 2-3-5 1-6-1-4 1-3z"/></svg> },
  { label: 'MEDITERRANEAN', match: 'Mediterranean', color: '#1e6ef5', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 8c2.5-2 5-2 7.5 0s5 2 7.5 0"/><path d="M3 13c2.5-2 5-2 7.5 0s5 2 7.5 0"/><path d="M3 18c2.5-2 5-2 7.5 0s5 2 7.5 0"/></svg> },
  { label: 'ISLAMIC', match: 'Islamic', color: '#1f8f4e', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="7" y="7" width="10" height="10"/><rect x="7" y="7" width="10" height="10" transform="rotate(45 12 12)"/></svg> },
  { label: 'SCHOOL', match: 'School', color: '#ef9410', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M12 4L2 9l10 5 10-5-10-5z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5l-6 3-6-3z"/></svg> },
  { label: 'UNIVERSITY', match: 'University', color: '#7a36d9', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M12 3l8 4v2H4V7l8-4zM5 10h2v8H5zM10 10h2v8h-2zM15 10h2v8h-2zM19 10h1v8h-1zM4 19h16v2H4z"/></svg> },
  { label: 'NATIONAL', match: 'National', color: '#d92b30', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z"/></svg> },
  { label: 'OTHER', match: 'Other', color: '#79838f', fg: 'white',
    icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></svg> },
]

function MedalGraphic({ tone }) {
  // tone: gold | silver | bronze
  const cols = {
    gold: { a: '#fcd34d', b: '#d97706', ring: '#b45309' },
    silver: { a: '#e5e7eb', b: '#9ca3af', ring: '#6b7280' },
    bronze: { a: '#f0a06a', b: '#b45a1b', ring: '#8f4513' },
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
        <linearGradient id="trophy-blue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#1237a8" />
        </linearGradient>
      </defs>
      <path d="M14 8h20v3c0 8-4 13-10 13S14 19 14 11V8z" fill="url(#trophy-blue)" stroke="#0b1f5e" strokeWidth="1.2" />
      <path d="M14 10H8c0 6 2.5 9 6.5 9.5M34 10h6c0 6-2.5 9-6.5 9.5" fill="none" stroke="#1237a8" strokeWidth="2.4" />
      <path d="M21 24h6v5h-6z" fill="url(#trophy-blue)" />
      <path d="M17 31h14v3H17z" fill="url(#trophy-blue)" />
      <path d="M15 36h18v4H15z" fill="#1237a8" />
      <path d="M24 11l1.6 3.2 3.5.5-2.5 2.5.6 3.5-3.2-1.7-3.2 1.7.6-3.5-2.5-2.5 3.5-.5z" fill="white" />
    </svg>
  )
}

function NavyBar({ children }) {
  return (
    <div className="rounded-lg px-4 py-2.5 text-center text-white text-sm sm:text-base font-black tracking-wide"
      style={{ background: 'linear-gradient(180deg, #1b3a8f 0%, #0b1f5e 100%)' }}>
      {children}
    </div>
  )
}

function PercentRing({ pct, tone, title, desc, icon }) {
  const r = 50
  const C = 2 * Math.PI * r
  const grad = tone === 'blue'
    ? { a: '#3b82f6', b: '#1237a8', track: '#dbe6fb' }
    : { a: '#fcd34d', b: '#d97706', track: '#faecd2' }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 flex flex-col items-center">
      <NavyBar>{title}</NavyBar>
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
          <span className="font-black" style={{ color: MEDAL_NAVY }}>
            <span className="text-3xl sm:text-4xl">{pct}</span><span className="text-lg">%</span>
          </span>
        </div>
      </div>
      <p className="text-xs sm:text-sm text-gray-600 text-center leading-snug">{desc}</p>
      <div className="mt-3">{icon}</div>
    </div>
  )
}

function MedalsTab({ stats }) {
  if (!stats) return null
  const { medals, medals_hierarchy, total_races } = stats

  if (medals.total === 0) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-12 text-center animate-fade-in">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
        <p className="text-gray-400 font-bold">No medals yet</p>
        <p className="text-gray-300 text-sm mt-1">Medals will appear here once earned</p>
      </div>
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
    { key: 'gold', n: medals.gold, color: MEDAL_GOLD },
    { key: 'silver', n: medals.silver, color: MEDAL_SILVER },
    { key: 'bronze', n: medals.bronze, color: MEDAL_BRONZE },
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
    { title: 'GOLD', graphic: <MedalGraphic tone="gold" />, n: medals.gold, badge: 'linear-gradient(180deg, #fcd34d 0%, #d97706 100%)' },
    { title: 'SILVER', graphic: <MedalGraphic tone="silver" />, n: medals.silver, badge: 'linear-gradient(180deg, #d7dade 0%, #9fa4ad 100%)' },
    { title: 'BRONZE', graphic: <MedalGraphic tone="bronze" />, n: medals.bronze, badge: 'linear-gradient(180deg, #e88a37 0%, #c05f14 100%)' },
    { title: 'TOTAL', graphic: <TrophyGraphic />, n: medals.total, badge: 'linear-gradient(180deg, #2f66e8 0%, #1237a8 100%)' },
  ]

  const miniMedal = (color) => (
    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0"><circle cx="8" cy="8" r="7" fill={color} /><path d="M8 4l1.1 2.2 2.4.4-1.7 1.7.4 2.4L8 9.6l-2.2 1.1.4-2.4L4.5 6.6l2.4-.4z" fill="white" /></svg>
  )

  return (
    <div className="rounded-2xl p-3 sm:p-5 space-y-4 sm:space-y-5 animate-fade-in" style={{ background: 'linear-gradient(160deg, #f5f7fc 0%, #edf1fa 100%)' }}>
      {/* ── Top: title + medal stat cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-4 items-stretch">
        <div className="flex flex-col items-center justify-center text-center py-4">
          <div className="text-lg sm:text-2xl font-black tracking-wide" style={{ color: '#1e56d6' }}>OUR ACHIEVEMENTS</div>
          <div className="text-5xl sm:text-7xl font-black tracking-tight leading-none" style={{ color: MEDAL_NAVY }}>MEDALS</div>
          <div className="flex gap-1.5 my-2 text-amber-400 text-xl">★ ★ ★</div>
          <p className="text-sm sm:text-base text-gray-600 leading-snug">Celebrating excellence.<br />Honoring every podium finish.</p>
          <svg viewBox="0 0 48 24" className="w-10 h-5 mt-2" fill="#1e6ef5">
            <circle cx="34" cy="6" r="3.2"/>
            <path d="M10 12l14-5 5 4-6 3-13-2z"/>
            <path d="M4 18c3-2.2 6-2.2 9 0s6 2.2 9 0 6-2.2 9 0v2.5c-3 2.2-6 2.2-9 0s-6-2.2-9 0-6-2.2-9 0z" opacity="0.9"/>
          </svg>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statCards.map(c => (
            <div key={c.title} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 flex flex-col items-center justify-between">
              <div className="text-center leading-tight">
                <div className="text-sm sm:text-base font-black" style={{ color: c.title === 'GOLD' ? '#d99a12' : c.title === 'SILVER' ? '#8f959e' : c.title === 'BRONZE' ? '#e2711d' : '#1e56d6' }}>{c.title}</div>
                <div className="text-xs sm:text-sm font-black" style={{ color: MEDAL_NAVY }}>MEDALS</div>
              </div>
              <div className="my-2">{c.graphic}</div>
              <div className="w-full rounded-xl text-center text-white text-2xl sm:text-3xl font-black py-1.5" style={{ background: c.badge }}>
                <AnimatedNumber value={c.n} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Middle: distribution donut + breakdown by competition ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <NavyBar>MEDAL DISTRIBUTION</NavyBar>
          <div className="flex items-center gap-4 sm:gap-6 mt-5">
            <div className="relative shrink-0">
              <svg viewBox="0 0 120 120" className="w-36 h-36 sm:w-44 sm:h-44 -rotate-90">
                {donutSegs.map(s => s.n > 0 && (
                  <circle key={s.key} cx="60" cy="60" r={donutR} fill="none" stroke={s.color} strokeWidth="22"
                    strokeDasharray={`${s.dash} ${donutC}`} strokeDashoffset={s.offset} />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl sm:text-4xl font-black leading-none" style={{ color: MEDAL_NAVY }}><AnimatedNumber value={medals.total} /></span>
                <span className="text-[10px] sm:text-xs font-black tracking-widest" style={{ color: MEDAL_NAVY }}>TOTAL</span>
              </div>
            </div>
            <div className="flex-1 divide-y divide-gray-100">
              {[
                { label: 'GOLD', n: medals.gold, color: MEDAL_GOLD, text: '#d99a12' },
                { label: 'SILVER', n: medals.silver, color: MEDAL_SILVER, text: '#8f959e' },
                { label: 'BRONZE', n: medals.bronze, color: MEDAL_BRONZE, text: '#e2711d' },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3 py-3">
                  <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full shrink-0" style={{ background: row.color }} />
                  <div className="flex-1 leading-tight">
                    <div className="text-sm sm:text-base font-black" style={{ color: row.text }}>{row.label}</div>
                    <div className="text-sm font-black" style={{ color: MEDAL_NAVY }}>{row.n}</div>
                  </div>
                  <div className="text-lg sm:text-2xl font-black" style={{ color: row.text }}>{pctOf(row.n)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <NavyBar>MEDAL BREAKDOWN BY COMPETITION</NavyBar>
          <div className="divide-y divide-gray-100 mt-2">
            {MEDAL_COMPS.map(comp => {
              const cc = compCounts[comp.match] || { gold: 0, silver: 0, bronze: 0 }
              return (
                <div key={comp.label} className="flex items-center gap-3 py-2">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-gray-100" style={{ background: comp.color, color: comp.fg }}>
                    {comp.icon}
                  </span>
                  <div className="flex-1 min-w-0 text-[11px] sm:text-sm font-black truncate" style={{ color: MEDAL_NAVY }}>{comp.label}</div>
                  <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
                    <span className="flex items-center gap-1">{miniMedal(MEDAL_GOLD)}<span className="text-sm font-black w-5 text-right" style={{ color: MEDAL_NAVY }}>{cc.gold}</span></span>
                    <span className="flex items-center gap-1">{miniMedal(MEDAL_SILVER)}<span className="text-sm font-black w-5 text-right" style={{ color: MEDAL_NAVY }}>{cc.silver}</span></span>
                    <span className="flex items-center gap-1">{miniMedal(MEDAL_BRONZE)}<span className="text-sm font-black w-5 text-right" style={{ color: MEDAL_NAVY }}>{cc.bronze}</span></span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Medal Summary bar chart ── */}
      {chartComps.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <NavyBar>MEDAL SUMMARY</NavyBar>
          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[420px]">
              <div className="flex items-end gap-2 sm:gap-4 h-44 border-b-2 border-gray-200 px-2">
                {chartComps.map(comp => {
                  const cc = compCounts[comp.match]
                  const bar = (n, color) => (
                    <div className="flex flex-col items-center justify-end w-4 sm:w-6">
                      {n > 0 && <span className="text-[9px] sm:text-[11px] font-black mb-0.5" style={{ color: MEDAL_NAVY }}>{n}</span>}
                      <div className="w-full rounded-t-sm" style={{ height: `${(n / chartMax) * 130}px`, background: color, minHeight: n > 0 ? '4px' : '0' }} />
                    </div>
                  )
                  return (
                    <div key={comp.label} className="flex-1 flex items-end justify-center gap-0.5 sm:gap-1">
                      {bar(cc.gold, MEDAL_GOLD)}
                      {bar(cc.silver, MEDAL_SILVER)}
                      {bar(cc.bronze, MEDAL_BRONZE)}
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-2 sm:gap-4 px-2 mt-2">
                {chartComps.map(comp => (
                  <div key={comp.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center border border-gray-100" style={{ background: comp.color, color: comp.fg }}>{comp.icon}</span>
                    <span className="text-[8px] sm:text-[10px] font-black text-center leading-tight" style={{ color: MEDAL_NAVY }}>{comp.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-5 sm:gap-8 mt-4">
            {[['GOLD', MEDAL_GOLD], ['SILVER', MEDAL_SILVER], ['BRONZE', MEDAL_BRONZE]].map(([label, color]) => (
              <span key={label} className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-sm" style={{ background: color }} />
                <span className="text-xs sm:text-sm font-black" style={{ color: MEDAL_NAVY }}>{label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Percentage rings ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <PercentRing pct={medalRacePct} tone="blue" title="MEDAL-WINNING RACES"
          desc={<span>Races that earned<br />at least one medal.</span>}
          icon={<span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#1e56d6' }}><svg viewBox="0 0 24 24" className="w-5 h-5" fill="white"><path d="M12 3l2 4.2 4.6.7-3.3 3.2.8 4.6L12 13.5l-4.1 2.2.8-4.6L5.4 7.9l4.6-.7z"/><circle cx="7" cy="17" r="1"/><circle cx="17" cy="17" r="1"/><circle cx="12" cy="20" r="1"/></svg></span>} />
        <PercentRing pct={goldRacePct} tone="gold" title="GOLD-WINNING RACES"
          desc={<span>Races that resulted<br />in a gold medal.</span>}
          icon={<span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(180deg,#fcd34d,#d97706)' }}><svg viewBox="0 0 24 24" className="w-5 h-5" fill="white"><path d="M9 3h6l-1 5h-4L9 3z"/><circle cx="12" cy="14" r="5"/><path d="M12 11l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5L11 13z" fill="#d97706"/></svg></span>} />
        <PercentRing pct={goldSharePct} tone="gold" title="GOLD SHARE"
          desc={<span>Percentage of gold medals<br />out of total medals.</span>}
          icon={<span className="w-9 h-9 rounded-full flex items-center justify-center border-2" style={{ borderColor: '#d97706', background: '#fdf3dd' }}><svg viewBox="0 0 24 24" className="w-5 h-5" fill="#d97706"><path d="M12 4l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z"/></svg></span>} />
      </div>

      {/* ── Footer strip ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-3 sm:px-6 py-3 sm:py-4 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-0">
        {[
          { title: 'CHAMPION MINDSET', sub: 'Focused. Determined. Unstoppable.', bg: '#1e56d6',
            icon: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="white"><path d="M12 4v6M12 4h5l-1.5 2L17 8h-5z"/><path d="M4 20l8-11 8 11H4z"/></svg> },
          { title: 'CONSISTENT PODIUMS', sub: 'Every race. Every time. Raising the standard.', bg: '#2aa63f',
            icon: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="white"><path d="M9 10h6v10H9zM3 14h6v6H3zM15 12h6v8h-6z"/><path d="M12 2l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L8.8 4.3 11 4z"/></svg> },
          { title: 'TEAM EXCELLENCE', sub: 'Stronger together. Achieving more.', bg: '#ef9410',
            icon: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="white"><circle cx="12" cy="7" r="2.5"/><circle cx="6" cy="9" r="2"/><circle cx="18" cy="9" r="2"/><path d="M8 20c0-2.5 1.8-4 4-4s4 1.5 4 4h-8zM2 18c0-2 1.6-3.2 3.8-3.2.5 0 1 .1 1.5.2A6.2 6.2 0 005.8 18H2zM18.2 18a6.2 6.2 0 00-1.5-3c.5-.1 1-.2 1.5-.2 2.2 0 3.8 1.2 3.8 3.2h-3.8z"/></svg> },
          { title: 'RISING LEGACY', sub: 'Building today. Inspiring tomorrow.', bg: '#7a36d9',
            icon: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><path d="M4 18l5-5 3 3 7-8"/><path d="M15 8h4v4"/></svg> },
        ].map((f, i) => (
          <div key={f.title} className={`flex items-center gap-2.5 sm:gap-3 sm:px-4 ${i > 0 ? 'lg:border-l lg:border-gray-200' : ''}`}>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: f.bg }}>
              {f.icon}
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-xs font-black tracking-wide truncate" style={{ color: MEDAL_NAVY }}>{f.title}</div>
              <div className="text-[9px] sm:text-[11px] text-gray-500 leading-tight">{f.sub}</div>
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

  const TIER_COLORS = {
    'World-Class':          { bar: 'from-yellow-400 to-amber-500', text: 'text-amber-600' },
    'International Elite':  { bar: 'from-emerald-400 to-emerald-600', text: 'text-emerald-600' },
    'Elite':                { bar: 'from-sky-400 to-sky-600', text: 'text-sky-600' },
    'High Performance':     { bar: 'from-blue-400 to-blue-600', text: 'text-blue-600' },
    'Advanced':             { bar: 'from-violet-400 to-violet-600', text: 'text-violet-600' },
    'Competitive':          { bar: 'from-indigo-400 to-indigo-600', text: 'text-indigo-600' },
    'Developing':           { bar: 'from-amber-300 to-amber-500', text: 'text-amber-500' },
    'Foundation':           { bar: 'from-orange-300 to-orange-500', text: 'text-orange-600' },
    'Novice':               { bar: 'from-gray-400 to-gray-500', text: 'text-gray-500' },
    'Entry Level':          { bar: 'from-gray-200 to-gray-300', text: 'text-gray-400' },
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-5 animate-fade-in-up stagger-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="font-bold text-base text-gray-800">Performance Index</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">FINA points distribution across all swims</p>
        </div>
        {bestFina && (
          <div className="text-right animate-count-up stagger-6">
            <div className="text-3xl font-black bg-gradient-to-r from-sky-500 to-sky-700 bg-clip-text text-transparent">{bestFina.points}</div>
            <div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Peak FINA</div>
          </div>
        )}
      </div>
      <div className="space-y-3">
        {finaDistribution.map((tier, i) => {
          const colors = TIER_COLORS[tier.label] || TIER_COLORS['Novice']
          const pct = maxCount > 0 ? (tier.count / maxCount) * 100 : 0
          const rangeLabel = `${tier.low}+`
          return (
            <div key={tier.low} className="flex items-center gap-3 animate-fade-in-up" style={{ animationDelay: `${(i + 6) * 0.08}s` }}>
              <div className={`w-14 sm:w-16 text-right text-[10px] sm:text-xs font-black ${colors.text}`}>{rangeLabel}</div>
              <div className="flex-1 bg-gray-100 rounded-full h-5 sm:h-7 overflow-hidden relative">
                <div className={`bg-gradient-to-r ${colors.bar} h-full rounded-full animate-grow-width flex items-center justify-end pr-2`}
                  style={{ width: `${Math.max(pct, tier.count > 0 ? 10 : 0)}%`, animationDelay: `${(i + 6) * 0.1}s` }}>
                  {tier.count > 0 && pct > 18 && (
                    <span className="text-white text-xs font-black drop-shadow-sm">{tier.count}</span>
                  )}
                </div>
                {tier.count > 0 && pct <= 18 && (
                  <span className="absolute left-[calc(10%+6px)] top-1/2 -translate-y-1/2 text-xs font-black text-gray-500">{tier.count}</span>
                )}
              </div>
              <div className={`w-20 text-[10px] font-semibold ${colors.text} hidden md:block`}>{tier.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ───────── Stats Tab ───────── */
function StatsTab({ stats, events, swimmerId }) {
  const [qualifyingGaps, setQualifyingGaps] = useState([])
  const [gapPool, setGapPool] = useState('LCM')
  const [gapCut, setGapCut] = useState('A')
  useEffect(() => {
    if (swimmerId) {
      getSwimmerQualifyingGaps(swimmerId).then(res => setQualifyingGaps(res.data || [])).catch(() => {})
    }
  }, [swimmerId])

  if (!stats) return null
  const { medals, best_fina, season_best_fina, best_event, total_championships, records, total_records, fina_distribution } = stats
  const totalEvents = new Set(events.map(e => e.event_id)).size
  const totalSwims = events.reduce((sum, e) => sum + e.times_count, 0)

  const quickStats = [
    { label: 'Championships', value: total_championships, icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>, color: 'text-sky-500' },
    { label: 'Events', value: totalEvents, icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>, color: 'text-violet-500' },
    { label: 'Total Swims', value: totalSwims, icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, color: 'text-emerald-500' },
    { label: 'Medals', value: medals.total, icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-4.5A3.375 3.375 0 0012.75 10.5h-1.5A3.375 3.375 0 007.5 13.875v4.875m9-4.875a3.375 3.375 0 00-3.375-3.375h-1.5" /></svg>, color: 'text-amber-500' },
  ]

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        {quickStats.map((s, i) => (
          <div key={s.label} className={`bg-white rounded-xl sm:rounded-2xl border shadow-sm p-3 sm:p-5 group hover:shadow-md transition-all duration-300 animate-count-up stagger-${i + 1}`}>
            <div className={`${s.color} mb-1.5 sm:mb-2 transition-transform group-hover:scale-110 duration-300`}>{s.icon}</div>
            <div className="text-2xl sm:text-3xl font-black text-gray-800"><AnimatedNumber value={s.value} /></div>
            <div className="text-[9px] sm:text-[11px] text-gray-400 font-semibold mt-0.5 uppercase tracking-wider">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Performance Index + Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <PerformanceIndex finaDistribution={fina_distribution} bestFina={best_fina} />
        <div className="space-y-4">
          {best_fina && (
            <div className="bg-gradient-to-br from-sky-50 via-white to-sky-50/30 rounded-2xl border border-sky-200 p-5 shadow-sm animate-fade-in-up stagger-5 hover:shadow-md transition-shadow duration-300">
              <div className="text-[10px] font-bold text-sky-500 uppercase tracking-widest mb-2">Best FINA Points</div>
              <div className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-sky-600 to-sky-800 bg-clip-text text-transparent"><AnimatedNumber value={best_fina.points} /></div>
              <div className="text-xs sm:text-sm font-semibold text-gray-600 mt-1.5 sm:mt-2">{best_fina.event_name}</div>
              <div className="text-[10px] sm:text-xs text-gray-400 mt-0.5">{best_fina.championship_name}</div>
            </div>
          )}
          {season_best_fina && (
            <div className="bg-gradient-to-br from-emerald-50 via-white to-emerald-50/30 rounded-2xl border border-emerald-200 p-5 shadow-sm animate-fade-in-up stagger-5 hover:shadow-md transition-shadow duration-300">
              <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2">Season Best FINA Points · {season_best_fina.year}</div>
              <div className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-emerald-600 to-emerald-800 bg-clip-text text-transparent"><AnimatedNumber value={season_best_fina.points} /></div>
              <div className="text-xs sm:text-sm font-semibold text-gray-600 mt-1.5 sm:mt-2">{season_best_fina.event_name}</div>
              <div className="text-[10px] sm:text-xs text-gray-400 mt-0.5">{season_best_fina.championship_name}</div>
            </div>
          )}
          {best_event && (
            <div className="bg-gradient-to-br from-amber-50 via-white to-amber-50/30 rounded-2xl border border-amber-200 p-5 shadow-sm animate-fade-in-up stagger-6 hover:shadow-md transition-shadow duration-300">
              <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2">Signature Event</div>
              <div className="text-2xl font-black text-amber-700">{best_event}</div>
              <div className="text-xs text-gray-400 mt-1">Highest FINA points across all events</div>
            </div>
          )}
        </div>
      </div>

      {/* Qualifying Gaps */}
      {qualifyingGaps && qualifyingGaps.length > 0 && (() => {
        const filteredGaps = qualifyingGaps.filter(g => g.pool === gapPool && g.cut === gapCut)
        return (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden animate-fade-in-up stagger-7">
          <div className="p-4 border-b bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-base text-gray-800">Qualifying Standards Gap</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">{qualifyingGaps[0]?.standard_name} — Based on {new Date().getFullYear()} best times</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg overflow-hidden border">
                  {['LCM', 'SCM'].map(p => (
                    <button key={p} onClick={() => setGapPool(p)}
                      className={`px-3 py-1.5 text-xs font-bold transition-colors ${gapPool === p ? (p === 'LCM' ? 'bg-sky-500 text-white' : 'bg-amber-500 text-white') : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                      {p}
                    </button>
                  ))}
                </div>
                <div className="flex rounded-lg overflow-hidden border">
                  {['A', 'B'].map(c => (
                    <button key={c} onClick={() => setGapCut(c)}
                      className={`px-3 py-1.5 text-xs font-bold transition-colors ${gapCut === c ? (c === 'A' ? 'bg-green-500 text-white' : 'bg-amber-500 text-white') : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                      {c} Cut
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {filteredGaps.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No qualifying gaps for {gapPool} {gapCut} Cut</div>
          ) : (
          <div className="divide-y divide-gray-50">
            {filteredGaps.map((g, i) => {
              const maxGap = Math.max(...filteredGaps.map(x => Math.abs(x.gap_cs)))
              const barPct = maxGap > 0 ? (Math.abs(g.gap_cs) / maxGap) * 100 : 0
              return (
                <div key={g.event_id} className="px-5 py-4 animate-fade-in-up" style={{ animationDelay: `${(i + 8) * 0.06}s` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-gray-800">{g.event_name}</span>
                      {g.pool && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${g.pool === 'SCM' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{g.pool}</span>}
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{g.cut} Cut</span>
                    </div>
                    {g.qualified ? (
                      <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">QUALIFIED</span>
                    ) : (
                      <span className="text-xs font-bold text-gray-500">+{g.gap_pct}%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex justify-between text-[10px] font-semibold mb-1">
                        <span className="text-gray-400">Your Best</span>
                        <span className="text-gray-400">Qualifying</span>
                      </div>
                      <div className="relative h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${g.qualified ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-sky-400 to-sky-500'}`}
                          style={{ width: `${g.qualified ? 100 : Math.max(100 - barPct * 0.6, 15)}%` }}
                        />
                        {!g.qualified && (
                          <div className="absolute right-0 top-0 h-full border-l-2 border-dashed border-amber-400" style={{ width: `${barPct * 0.6}%` }}>
                            <div className="absolute -top-0.5 -left-1 w-2 h-7 bg-amber-400 rounded-full opacity-60" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-sky-600">{g.swimmer_best}</span>
                    <span className={`font-mono text-xs font-bold ${g.qualified ? 'text-emerald-600' : 'text-red-500'}`}>
                      {g.qualified ? '-' : '+'}{g.gap_time}
                    </span>
                    <span className="font-mono text-sm font-bold text-amber-600">{g.qualifying_time}</span>
                  </div>
                </div>
              )
            })}
          </div>
          )}
        </div>
        )
      })()}

      {/* Records Held */}
      {total_records > 0 && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden animate-fade-in-up stagger-7">
          <div className="p-4 border-b bg-gradient-to-r from-gray-50 to-white">
            <h3 className="font-bold text-base text-gray-800">Records Held</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">{total_records} active record{total_records !== 1 ? 's' : ''}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {records.map((r, i) => (
              <div key={r.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-gray-50/80 transition-all duration-200 animate-fade-in-up" style={{ animationDelay: `${(i + 8) * 0.06}s` }}>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                  r.record_type === 'ARAB' ? 'bg-emerald-100 text-emerald-700' : r.record_type === 'GCC' ? 'bg-sky-100 text-sky-700' : 'bg-purple-100 text-purple-700'
                }`}>{r.record_type}</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-800">{r.event_name}</div>
                  <div className="text-[11px] text-gray-400">{r.location}{r.location && r.date ? ' \u00b7 ' : ''}{r.date}</div>
                </div>
                <div className="font-mono text-sm font-black text-sky-600">{r.time}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────── International Participation Infographic ───────── */
const PARTICIPATION_TILES = [
  { label: 'OLYMPIC', match: 'Olympic', grad: 'linear-gradient(135deg, #2f80ff 0%, #1259e0 100%)', badge: '#1e6ef5',
    icon: <svg viewBox="0 0 48 30" className="w-10 h-7" fill="none" stroke="white" strokeWidth="2.6"><circle cx="9" cy="10" r="6.5"/><circle cx="24" cy="10" r="6.5"/><circle cx="39" cy="10" r="6.5"/><circle cx="16.5" cy="19" r="6.5"/><circle cx="31.5" cy="19" r="6.5"/></svg> },
  { label: 'WORLD', match: 'World', grad: 'linear-gradient(135deg, #3b5bdb 0%, #23379f 100%)', badge: '#2c46b8',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="white" strokeWidth="1.7"><circle cx="12" cy="10" r="7"/><ellipse cx="12" cy="10" rx="3.2" ry="7"/><path d="M5 10h14M5.8 6.5h12.4M5.8 13.5h12.4" strokeWidth="1.2"/><path d="M4 20c2-1.6 4-1.6 6 0s4 1.6 6 0 3-1.2 4-.4" strokeLinecap="round"/></svg> },
  { label: 'ARAB', match: 'Arab', grad: 'linear-gradient(135deg, #f6a623 0%, #e08508 100%)', badge: '#ef9410',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="white"><path d="M3 12l3-4 4-1 3-3 4 1 4 3-1 4-3 2-1 4-4-1-3 1-3-3 1-2-4-1z"/></svg> },
  { label: 'ASIAN', match: 'Asian', grad: 'linear-gradient(135deg, #17a2b8 0%, #0e7f96 100%)', badge: '#1197ad',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="white"><path d="M4 8l4-4 6-1 6 3 1 5-3 3-1 5-4 2-2-4-4-1-2-4 1-2-2-2z"/></svg> },
  { label: 'AFRICAN', match: 'African', grad: 'linear-gradient(135deg, #35b54a 0%, #1f8f34 100%)', badge: '#2aa63f',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="white"><path d="M8 2l8 1 3 5-2 5-2 7-3 3-3-6-2-6-1-5 2-4z"/></svg> },
  { label: 'GCC', match: 'GCC', grad: 'linear-gradient(135deg, #9b59f5 0%, #7a36d9 100%)', badge: '#8a48e8',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="white"><path d="M6 3l7 2 5 4-1 6-4 4-5 2-3-5 1-6-1-4 1-3z"/></svg> },
  { label: 'MEDITERRANEAN', match: 'Mediterranean', grad: 'linear-gradient(135deg, #38a4e8 0%, #1b7fc4 100%)', badge: '#2b94d9',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M3 8c2.5-2 5-2 7.5 0s5 2 7.5 0"/><path d="M3 13c2.5-2 5-2 7.5 0s5 2 7.5 0"/><path d="M3 18c2.5-2 5-2 7.5 0s5 2 7.5 0"/></svg> },
  { label: 'ISLAMIC', match: 'Islamic', grad: 'linear-gradient(135deg, #d4a017 0%, #b0820a 100%)', badge: '#c6940f',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="white" strokeWidth="1.6"><rect x="6" y="6" width="12" height="12"/><rect x="6" y="6" width="12" height="12" transform="rotate(45 12 12)"/><circle cx="12" cy="12" r="3"/></svg> },
  { label: 'SCHOOL', match: 'School', grad: 'linear-gradient(135deg, #ef4b50 0%, #cf2b30 100%)', badge: '#e33a40',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="white"><path d="M12 3v3M12 3h4v2h-4z"/><path d="M5 11l7-5 7 5v9H5z"/><rect x="10.5" y="14" width="3" height="6" fill="#ef4b50"/><circle cx="12" cy="11" r="1.5" fill="#ef4b50"/></svg> },
  { label: 'UNIVERSITY', match: 'University', grad: 'linear-gradient(135deg, #f0508a 0%, #d42e6c 100%)', badge: '#e63f7b',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="white"><path d="M12 4L2 9l10 5 10-5-10-5z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5l-6 3-6-3z"/><path d="M21 10v6h-1v-6z"/></svg> },
  { label: 'NATIONAL', match: 'National', grad: 'linear-gradient(135deg, #1e6ef5 0%, #0c47c9 100%)', badge: '#155cdd',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="white"><path d="M11 3v4h4V5l-4-2z"/><rect x="11" y="3" width="1.5" height="6"/><path d="M4 11l8-4 8 4v1H4v-1z"/><rect x="5" y="13" width="2" height="6"/><rect x="9" y="13" width="2" height="6"/><rect x="13" y="13" width="2" height="6"/><rect x="17" y="13" width="2" height="6"/><rect x="4" y="19.5" width="16" height="2"/></svg> },
  { label: 'OTHER', match: 'Other', grad: 'linear-gradient(135deg, #8b95a1 0%, #667180 100%)', badge: '#79838f',
    icon: <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="white" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/><path fill="white" stroke="none" d="M12 6.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z"/></svg> },
]

const PARTICIPATION_FOOTER = [
  { title: 'UNITED SPIRIT', sub: 'Stronger together', bg: '#e3edfd', color: '#1e6ef5',
    icon: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 19c0-3 2.7-5 6-5s6 2 6 5v1H2zM13.5 14.6c.8-.4 1.6-.6 2.5-.6 3.3 0 6 2 6 5v1h-8v-1c0-1.7-.6-3.2-.5-4.4z"/></svg> },
  { title: 'DRIVEN BY EXCELLENCE', sub: 'Committed to success', bg: '#e4f6e8', color: '#2aa63f',
    icon: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor"><path d="M6 3h12v2h3v3c0 2.5-2 4.5-4.5 4.9A6 6 0 0113 16.9V19h3v2H8v-2h3v-2.1a6 6 0 01-3.5-3A5 5 0 013 8V5h3V3zm-1 4v1a3 3 0 002.2 2.9A9 9 0 017 7H5zm14 0h-2a9 9 0 01-.2 3.9A3 3 0 0019 8V7z"/></svg> },
  { title: 'DIVERSE NATIONS', sub: 'One aquatic family', bg: '#fdeedd', color: '#ef9410',
    icon: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor"><circle cx="12" cy="6" r="2.5"/><circle cx="5.5" cy="9" r="2"/><circle cx="18.5" cy="9" r="2"/><path d="M8 20c0-2.5 1.8-4 4-4s4 1.5 4 4h-8zM1.5 17c0-2 1.7-3.3 4-3.3.6 0 1.2.1 1.7.3A6 6 0 005.5 17h-4zM18.5 17a6 6 0 00-1.7-3c.5-.2 1.1-.3 1.7-.3 2.3 0 4 1.3 4 3.3h-4z" transform="translate(0 -1)"/></svg> },
  { title: 'BUILDING LEGACIES', sub: 'For today and tomorrow', bg: '#efe5fd', color: '#8a48e8',
    icon: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor"><path d="M12 21s-7-4.6-9.3-8.6C1 9.5 2.8 6 6.2 6c2 0 3.3 1 4.1 2.2h3.4C14.5 7 15.8 6 17.8 6c3.4 0 5.2 3.5 3.5 6.4C19 16.4 12 21 12 21z"/></svg> },
]

function InternationalParticipation({ championships }) {
  const counts = {}
  championships.forEach(c => {
    const key = c.classification || ''
    counts[key] = (counts[key] || 0) + 1
  })
  return (
    <div className="rounded-2xl overflow-hidden mb-4 sm:mb-6 animate-fade-in relative"
      style={{ background: 'linear-gradient(160deg, #f2f5fc 0%, #e8edf9 50%, #eef1fa 100%)' }}>
      {/* faint dotted world backdrop */}
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(#1e6ef5 1.2px, transparent 1.2px)', backgroundSize: '14px 14px' }} />
      <div className="relative px-4 sm:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-1.5">
            <span className="h-[3px] w-10 sm:w-16 rounded-full" style={{ background: '#1e6ef5' }} />
            <span className="text-[11px] sm:text-sm font-extrabold tracking-[0.25em]" style={{ color: '#1e6ef5' }}>WE ARE GLOBAL</span>
            <span className="h-[3px] w-10 sm:w-16 rounded-full" style={{ background: '#1e6ef5' }} />
          </div>
          <h2 className="text-2xl sm:text-5xl font-black tracking-tight leading-tight" style={{ color: '#0b1f5e' }}>
            INTERNATIONAL PARTICIPATION
          </h2>
          <p className="text-xs sm:text-base text-gray-500 mt-2">Uniting nations. Celebrating excellence. Inspiring generations.</p>
          <svg viewBox="0 0 48 24" className="w-10 h-5 mx-auto mt-2" fill="#1e6ef5">
            <circle cx="34" cy="6" r="3.2"/>
            <path d="M10 12l14-5 5 4-6 3-13-2z"/>
            <path d="M4 18c3-2.2 6-2.2 9 0s6 2.2 9 0 6-2.2 9-0 6 2.2 9 0v2.5c-3 2.2-6 2.2-9 0s-6-2.2-9 0-6 2.2-9 0-6-2.2-9 0z" opacity="0.9"/>
          </svg>
        </div>

        {/* Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {PARTICIPATION_TILES.map((t, i) => {
            const n = counts[t.match] || 0
            return (
              <div key={t.label} className="flex rounded-xl overflow-hidden bg-white shadow-md animate-fade-in-up" style={{ animationDelay: `${i * 0.04}s` }}>
                <div className="w-[42%] shrink-0 flex items-center justify-center py-5 sm:py-6" style={{ background: t.grad }}>
                  {t.icon}
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-1.5 px-1 py-3">
                  <div className="text-[10px] sm:text-sm font-extrabold tracking-wide text-center leading-tight" style={{ color: '#0b1f5e' }}>{t.label}</div>
                  <div className="text-white text-sm sm:text-xl font-black px-2.5 sm:px-3 py-0.5 rounded-lg" style={{ background: t.badge }}>
                    {String(n).padStart(2, '0')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer strip */}
        <div className="mt-5 sm:mt-7 bg-white rounded-2xl shadow-md px-3 sm:px-6 py-3 sm:py-4 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-0">
          {PARTICIPATION_FOOTER.map((f, i) => (
            <div key={f.title} className={`flex items-center gap-2.5 sm:gap-3 sm:px-4 ${i > 0 ? 'lg:border-l lg:border-gray-200' : ''}`}>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: f.bg, color: f.color }}>
                {f.icon}
              </div>
              <div className="min-w-0">
                <div className="text-[9px] sm:text-xs font-extrabold tracking-wide truncate" style={{ color: '#0b1f5e' }}>{f.title}</div>
                <div className="text-[9px] sm:text-xs text-gray-500 truncate">{f.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Carousel dots (decorative) */}
        <div className="flex items-center justify-center gap-2 mt-4">
          <span className="w-5 h-1.5 rounded-full" style={{ background: '#0b1f5e' }} />
          {[...Array(4)].map((_, i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-blue-200" />)}
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

      {/* Overview */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-3 sm:mb-4 animate-fade-in">
        <div className="bg-white rounded-xl sm:rounded-2xl border shadow-sm px-3 sm:px-5 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-sky-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
          <div>
            <div className="text-xl sm:text-2xl font-black text-gray-800"><AnimatedNumber value={championships.length} /></div>
            <div className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-wider">Meets</div>
          </div>
        </div>
        <div className="bg-white rounded-xl sm:rounded-2xl border shadow-sm px-3 sm:px-5 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <div>
            <div className="text-xl sm:text-2xl font-black text-gray-800">{years.length}</div>
            <div className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-wider">Years</div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {years.map((year, yi) => (
        <div key={year} className="animate-fade-in-up" style={{ animationDelay: `${yi * 0.08}s` }}>
          {/* Year Pill */}
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-sky-600 text-white text-sm font-black px-3.5 py-1 rounded-full shadow-sm">{year}</span>
            <span className="text-xs text-gray-400 font-medium">{byYear[year].length} meet{byYear[year].length !== 1 ? 's' : ''}</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          <div className="space-y-2 ml-1 sm:ml-2 pl-3 sm:pl-5 border-l-2 border-gray-100">
            {byYear[year].map((c, ci) => (
              <button key={c.id} onClick={() => navigate(`/meets/${c.id}`)}
                className="w-full text-left bg-white rounded-xl border shadow-sm px-3 sm:px-4 py-2.5 sm:py-3 hover:shadow-md hover:border-sky-200 flex items-center gap-2 sm:gap-3 transition-all duration-300 group animate-fade-in-up"
                style={{ animationDelay: `${(yi * 3 + ci) * 0.05}s` }}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs sm:text-sm font-semibold text-gray-800 group-hover:text-sky-700 transition-colors truncate">{c.name}</div>
                  <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                    <CountryFlag code={c.country_code} flagUrl={c.flag_url} name={c.country} className="text-[10px] sm:text-xs" />
                    <span className="text-[10px] sm:text-[11px] text-gray-400">{new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  <PoolBadge pool={c.pool} />
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-300 group-hover:text-sky-400 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {championships.length === 0 && (
        <div className="bg-white rounded-2xl border shadow-sm p-12 text-center animate-fade-in">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
          <p className="text-gray-400 font-medium">No championship history yet</p>
        </div>
      )}
    </div>
  )
}

/* ───────── TAB CONFIG ───────── */
/* ───────── Records Tab ───────── */
function RecordsTab({ swimmerId, swimmer }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getHeldRecords({ swimmer: swimmerId }).then((res) => {
      const all = (res.data || []).map(r => ({
        ...r,
        record_type: (r.scope || '').toUpperCase(),
        formatted_time: r.time,
        location: r.championship_name,
        result_date: r.date,
        categories: r.categories || [],
      }))
      setRecords(all)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [swimmerId])

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" /></div>

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
      <div className="rounded-2xl bg-white border shadow-sm p-12 text-center animate-fade-in">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
        <p className="text-gray-400 font-bold">No records held</p>
        <p className="text-gray-300 text-sm mt-1">Records will appear here when this swimmer sets Arab, GCC, or National records</p>
      </div>
    )
  }

  // Tile + badge colors per record scope (matches broadcast infographic palette)
  const typeConfig = {
    NATIONAL: { label: 'NATIONAL', tile: 'linear-gradient(135deg, #8b3fd9 0%, #a855f7 100%)', badge: 'border-purple-500 text-purple-600' },
    GCC: { label: 'GCC', tile: 'linear-gradient(135deg, #d99a13 0%, #eab308 100%)', badge: 'border-amber-500 text-amber-600' },
    ARAB: { label: 'ARAB', tile: 'linear-gradient(135deg, #e0641b 0%, #f97316 100%)', badge: 'border-orange-500 text-orange-600' },
    WORLD: { label: 'WORLD', tile: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)', badge: 'border-violet-500 text-violet-600' },
    ASIAN: { label: 'ASIAN', tile: 'linear-gradient(135deg, #e0641b 0%, #f97316 100%)', badge: 'border-orange-500 text-orange-600' },
    ISLAMIC: { label: 'ISLAMIC', tile: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)', badge: 'border-teal-500 text-teal-600' },
  }
  const navy = '#0b2a6b'
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
    <div className="rounded-2xl overflow-hidden shadow-xl bg-[#f6f7fa] p-4 sm:p-8 animate-fade-in">
      {/* Header banner pill */}
      <div className="flex justify-center mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-3 sm:gap-4 px-6 sm:px-10 py-3 rounded-full shadow-lg"
          style={{ background: 'linear-gradient(180deg, #1450b8 0%, #0b2a6b 60%, #071d4d 100%)', border: '2px solid #3b82f6' }}>
          <span className="text-white text-lg sm:text-xl leading-none">&#9733;</span>
          <span className="text-white font-black uppercase tracking-[0.12em] text-sm sm:text-xl whitespace-nowrap">
            {genderLabel} RECORD HOLDER <span className="mx-1">&bull;</span> {totalCount} RECORD{totalCount !== 1 ? 'S' : ''}
          </span>
          <span className="text-white text-lg sm:text-xl leading-none">&#9733;</span>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="flex flex-wrap justify-center gap-2.5 sm:gap-4 mb-8 sm:mb-10">
        <div className="rounded-xl shadow-lg px-3 sm:px-5 pt-3 sm:pt-4 pb-3 text-center min-w-[92px] sm:min-w-[130px]"
          style={{ background: 'linear-gradient(135deg, #1450b8 0%, #0b2a6b 100%)' }}>
          <div className="text-white font-black text-4xl sm:text-6xl leading-none"><AnimatedNumber value={totalCount} /></div>
          <div className="text-white font-bold uppercase tracking-[0.15em] text-[8px] sm:text-[10px] mt-2">Total Records</div>
          <div className="h-0.5 w-8 bg-white/80 mx-auto mt-1.5 rounded-full" />
        </div>
        {sectionOrder.map(t => (
          <div key={t} className="rounded-xl shadow-lg px-3 sm:px-5 pt-3 sm:pt-4 pb-3 text-center min-w-[80px] sm:min-w-[110px]"
            style={{ background: typeConfig[t].tile }}>
            <div className="text-white font-black text-4xl sm:text-6xl leading-none"><AnimatedNumber value={byType[t].length} /></div>
            <div className="text-white font-bold uppercase tracking-[0.15em] text-[8px] sm:text-[10px] mt-2">{typeConfig[t].label}</div>
            <div className="h-0.5 w-8 bg-white/80 mx-auto mt-1.5 rounded-full" />
          </div>
        ))}
      </div>

      {/* Sections per record type */}
      {sectionOrder.map(type => {
        const list = byType[type]
        const cfg = typeConfig[type]
        return (
          <div key={type} className="mb-8 last:mb-0">
            {/* Section header: navy banner + records count with rules */}
            <div className="flex items-center gap-3 mb-3">
              <div className="inline-flex items-center gap-2.5 pl-4 pr-8 py-2.5 shadow-md shrink-0"
                style={{ background: `linear-gradient(180deg, #143c8f 0%, ${navy} 100%)`, clipPath: 'polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)', borderRadius: '8px 4px 4px 8px' }}>
                <span className="text-amber-400 text-base leading-none">&#9733;</span>
                <span className="text-white font-black uppercase tracking-[0.12em] text-xs sm:text-sm whitespace-nowrap">{cfg.label} RECORDS</span>
              </div>
              <div className="h-px flex-1 max-w-[60px]" style={{ background: '#1450b8' }} />
              <span className="font-black uppercase tracking-[0.15em] text-xs sm:text-sm whitespace-nowrap" style={{ color: '#1450b8' }}>
                {list.length} RECORD{list.length !== 1 ? 'S' : ''}
              </span>
              <div className="h-px flex-1" style={{ background: '#1450b8' }} />
            </div>

            {/* Record rows */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
              {list.map((r, i) => (
                <div key={i} className="flex items-center gap-3 sm:gap-5 px-3 sm:px-5 py-3.5 sm:py-4 animate-fade-in-up" style={{ animationDelay: `${i * 0.04}s` }}>
                  {/* Number circle */}
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 shadow"
                    style={{ background: `linear-gradient(180deg, #143c8f 0%, ${navy} 100%)` }}>
                    <span className="text-white font-black text-base sm:text-lg">{i + 1}</span>
                  </div>
                  {/* Event + meet + date */}
                  <div className="flex-1 min-w-0">
                    <div className="font-black uppercase tracking-wide text-sm sm:text-lg leading-tight truncate" style={{ color: navy }}>
                      {r.event_detail?.name || r.event_name}
                    </div>
                    <div className="text-[11px] sm:text-xs font-bold mt-0.5 truncate" style={{ color: '#1450b8' }}>{r.location}</div>
                    <div className="text-[10px] sm:text-[11px] font-bold mt-0.5" style={{ color: navy }}>{fmtDate(r.result_date)}</div>
                  </div>
                  {/* Badges */}
                  <div className="hidden sm:flex items-center gap-2.5 shrink-0">
                    <span className={`border-2 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] bg-white ${cfg.badge}`}>{cfg.label}</span>
                    {compressCategories(r.categories).map(cat => (
                      <span key={cat} className="border-2 border-blue-400 text-blue-500 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] bg-white">{cat}</span>
                    ))}
                    <span className={`border-2 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] bg-white ${r.pool === 'SCM' ? 'border-orange-400 text-orange-500' : 'border-blue-400 text-blue-500'}`}>{r.pool}</span>
                  </div>
                  {/* Divider + time */}
                  <div className="hidden sm:block h-8 w-px bg-gray-300 shrink-0" />
                  <div className="font-black tabular-nums text-base sm:text-2xl shrink-0 min-w-[70px] sm:min-w-[110px] text-right" style={{ color: navy }}>
                    {r.formatted_time}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
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

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" /></div>

  const photos = media.filter(m => m.media_type === 'PHOTO' && m.image)
  const videos = media.filter(m => m.media_type === 'VIDEO' && m.video_url)

  if (!photos.length && !videos.length) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-12 text-center animate-fade-in">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 6v12.75c0 1.243 1.007 2.25 2.25 2.25z" /></svg>
        <p className="text-gray-400 font-medium">No media yet</p>
        <p className="text-gray-300 text-sm mt-1">Photos and videos tagged with this swimmer will appear here</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Photos Grid */}
      {photos.length > 0 && (
        <div className="animate-fade-in-up">
          <h3 className="font-bold text-base text-gray-800 mb-3">Photos <span className="text-gray-400 font-normal text-sm">({photos.length})</span></h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map((p, i) => (
              <button key={p.id} onClick={() => setLightbox(p)}
                className="aspect-square rounded-xl overflow-hidden bg-gray-100 group relative shadow-sm hover:shadow-lg transition-all duration-300 animate-fade-in-up"
                style={{ animationDelay: `${i * 0.05}s` }}>
                <img src={p.image} alt={p.caption || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                {p.caption && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <p className="text-white text-xs truncate">{p.caption}</p>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <div className="animate-fade-in-up stagger-4">
          <h3 className="font-bold text-base text-gray-800 mb-3">Videos <span className="text-gray-400 font-normal text-sm">({videos.length})</span></h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {videos.map((v, i) => (
              <a key={v.id} href={v.video_url} target="_blank" rel="noopener noreferrer"
                className="bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-all duration-300 group animate-fade-in-up"
                style={{ animationDelay: `${(i + photos.length) * 0.05}s` }}>
                {v.embed_thumbnail && (
                  <div className="aspect-video bg-gray-100 relative overflow-hidden">
                    <img src={v.embed_thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <svg className="w-6 h-6 text-gray-800 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </div>
                    </div>
                  </div>
                )}
                {v.caption && <div className="p-3 text-sm text-gray-700">{v.caption}</div>}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl z-10">&times;</button>
          <img src={lightbox.image} alt={lightbox.caption || ''} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl animate-count-up" onClick={e => e.stopPropagation()} />
          {lightbox.caption && <p className="absolute bottom-8 text-white text-center text-sm">{lightbox.caption}</p>}
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

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 animate-fade-in">
        <h3 className="font-bold text-base text-gray-800">Performance Progression</h3>
        <div className="flex gap-1 ml-auto">
          {['LCM', 'SCM'].map(p => (
            <button key={p} onClick={() => setPool(p)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                pool === p ? 'bg-sky-600 text-white shadow-md shadow-sky-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {p === 'LCM' ? 'Long Course' : 'Short Course'}
            </button>
          ))}
        </div>
      </div>
      {lines.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <svg className="w-14 h-14 mx-auto mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
          <p className="text-gray-400 font-medium">No progression data for {pool === 'LCM' ? 'Long Course' : 'Short Course'}</p>
        </div>
      ) : (
        <ProgressionChart lines={lines} />
      )}
    </div>
  )
}

/* ───────── Transfer History Tab ───────── */
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

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" /></div>
  if (!data) return <div className="text-center py-8 text-gray-400">Failed to load transfer history</div>

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Club History */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50">
          <h3 className="font-bold text-base text-gray-800">Club History</h3>
          <p className="text-xs text-gray-500 mt-0.5">Clubs represented based on competition results</p>
        </div>
        {data.clubs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No club history available</div>
        ) : (
          <div className="relative">
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200" />
            <div className="divide-y">
              {data.clubs.map((club, i) => (
                <div key={i} className="flex items-start gap-4 px-5 py-4 relative">
                  <div className="w-7 h-7 rounded-full bg-sky-100 border-2 border-sky-400 flex items-center justify-center z-10 shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-sky-700">{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900">{club.club}</span>
                      {club.is_national && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">National Team</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>{club.first_meet} &rarr; {club.last_meet}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-gray-800">{club.meets}</div>
                    <div className="text-xs text-gray-400">meet{club.meets !== 1 ? 's' : ''}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{club.results} result{club.results !== 1 ? 's' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Nationality */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50">
          <h3 className="font-bold text-base text-gray-800">Nationality</h3>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.nationality_meet_counts.map((n, i) => (
              <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                <CountryFlag code={n.country_code} flagUrl={n.country_flag} name={n.country} />
                <div className="flex-1" />
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-800">{n.meets}</div>
                  <div className="text-xs text-gray-400">meet{n.meets !== 1 ? 's' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {data.nationality_changes.filter(ch => ch.from_country !== ch.to_country).length > 0 && (
          <div className="px-5 pb-4 border-t pt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Nationality Changes</h4>
            <div className="space-y-3">
              {data.nationality_changes.filter(ch => ch.from_country !== ch.to_country).map((ch, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  {ch.from_country && (
                    <>
                      <CountryFlag code={ch.from_country_code} flagUrl={ch.from_country_flag} name={ch.from_country} />
                      <span className="text-gray-400">&rarr;</span>
                    </>
                  )}
                  <CountryFlag code={ch.to_country_code} flagUrl={ch.to_country_flag} name={ch.to_country} />
                  <span className="text-gray-500 text-xs">{ch.effective_date}</span>
                  {ch.notes && <span className="text-gray-400 text-xs">({ch.notes})</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────── Stroke icon for sport-card rows ───────── */
function StrokeIcon({ eventName, className = 'w-9 h-9', dark = false }) {
  const name = (eventName || '').toLowerCase()
  let stroke = 'freestyle'
  if (name.includes('backstroke') || name.includes('back')) stroke = 'backstroke'
  else if (name.includes('breaststroke') || name.includes('breast')) stroke = 'breaststroke'
  else if (name.includes('butterfly') || name.includes('fly')) stroke = 'butterfly'
  else if (name.includes('medley') || name.includes('im')) stroke = 'medley'

  const paths = {
    freestyle: 'M4 16c1.5-2 3-3 5-1s3.5 1 5-1 3-3 5-1M7 10a3 3 0 100-6 3 3 0 000 6zM14 18l3-5',
    backstroke: 'M4 14c1.5 2 3 3 5 1s3.5-1 5 1 3 3 5 1M7 10a3 3 0 100-6 3 3 0 000 6zM16 8l-3 5',
    breaststroke: 'M4 15c2-2 4-2 6 0s4 2 6 0M7 10a3 3 0 100-6 3 3 0 000 6zM13 12l4-2M13 12l4 2',
    butterfly: 'M4 14c1.5-2 3-2.5 5-.5s3 2 5 .5 3-2.5 5-.5M7 10a3 3 0 100-6 3 3 0 000 6zM14 8c1 2 3 4 5 3',
    medley: 'M4 16c1.2-1.5 2.5-2 4-.8s3 1 4.5-.2 2.5-2 4-.8M7 10a3 3 0 100-6 3 3 0 000 6zM15 9l2 4M17 9l-2 4',
  }

  return (
    <div className={`${className} rounded-full border-2 ${dark ? 'border-[#0b1a30]/20 bg-[#0b1a30]/10' : 'border-white/20 bg-white/5'} flex items-center justify-center shrink-0`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${dark ? 'text-[#0b1a30]/60' : 'text-white/70'}`}>
        <path d={paths[stroke]} />
      </svg>
    </div>
  )
}

/* ───────── Rankings Tab ───────── */
function RankingsTab({ swimmerId, swimmer }) {
  const [rankings, setRankings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState([])
  const [activePool, setActivePool] = useState('LCM')
  const [activeScope, setActiveScope] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)

  useEffect(() => {
    Promise.all([
      getSwimmerRankings(swimmerId),
      getSwimmerEvents(swimmerId),
    ]).then(([rankRes, evRes]) => {
      setRankings(rankRes.data)
      setEvents(evRes.data)
      const scopes = new Set()
      for (const r of (rankRes.data || [])) {
        for (const s of Object.keys(r.rankings)) scopes.add(s)
      }
      if (scopes.has('arab')) setActiveScope('arab')
      else if (scopes.has('gcc')) setActiveScope('gcc')
      else if (scopes.has('national')) setActiveScope('national')
    }).finally(() => setLoading(false))
  }, [swimmerId])

  if (loading) return (
    <div className="py-16 text-center"><div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin mx-auto" /></div>
  )
  if (!rankings || rankings.length === 0) return (
    <div className="rounded-2xl overflow-hidden shadow-xl bg-gradient-to-b from-[#0b1a30] to-[#0f2035] p-12 text-center animate-fade-in">
      <svg className="w-16 h-16 mx-auto mb-4 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-7.5L16.5 13.5m0 0L12 9m4.5 4.5V3" /></svg>
      <p className="text-white/30 font-bold">No ranking data available</p>
    </div>
  )

  const eventMap = {}
  for (const e of events) {
    eventMap[`${e.event_id}-${e.pool}`] = e.event_name
    eventMap[`${e.event_id}`] = e.event_name
  }

  const scopeSet = new Set()
  for (const r of rankings) {
    for (const s of Object.keys(r.rankings)) scopeSet.add(s)
  }
  const scopeOrder = ['national', 'gcc', 'arab']
  const scopes = scopeOrder.filter(s => scopeSet.has(s))
  const scopeLabel = { national: 'National', gcc: 'GCC', arab: 'Arab' }
  const scopeLabelUpper = { national: 'NATIONALLY', gcc: 'IN GCC', arab: 'IN ARAB' }
  const currentScope = activeScope || scopes[0]

  const availablePools = [...new Set(rankings.map(r => r.pool))].sort((a, b) => a === 'LCM' ? -1 : 1)
  const effectivePool = availablePools.includes(activePool) ? activePool : availablePools[0]

  const poolRows = rankings
    .filter(r => r.pool === effectivePool)
    .sort((a, b) => {
      const ra = a.rankings[currentScope]?.rank ?? 9999
      const rb = b.rankings[currentScope]?.rank ?? 9999
      return ra - rb
    })

  const selectedRow = poolRows.find(r => `${r.event_id}-${r.pool}` === selectedKey) || poolRows[0]
  const selectedRank = selectedRow?.rankings[currentScope]
  const selectedEventName = selectedRow ? (eventMap[`${selectedRow.event_id}-${selectedRow.pool}`] || eventMap[`${selectedRow.event_id}`] || `Event ${selectedRow.event_id}`) : ''

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
    <div className="rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-b from-[#0b1a30] to-[#0f2035] animate-fade-in">
      {/* Event badge */}
      <div className="px-6 pt-6 pb-2 flex justify-center">
        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-cyan-400/50 bg-cyan-500/10">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-300">{genderLabel} {selectedEventName?.toUpperCase()} · {effectivePool}</span>
        </div>
      </div>

      {/* Pool + Scope toggles */}
      <div className="px-6 pb-3 pt-2 flex flex-wrap items-center gap-2">
        {availablePools.length > 1 && (
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {availablePools.map(p => (
              <button key={p} onClick={() => setActivePool(p)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold tracking-wide transition-all duration-200 ${
                  effectivePool === p ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30' : 'text-white/40 hover:text-white/70'
                }`}>
                {p === 'LCM' ? 'Long Course' : 'Short Course'}
              </button>
            ))}
          </div>
        )}
        <div className={`flex gap-1 bg-white/5 rounded-lg p-0.5 ${availablePools.length > 1 ? 'ml-auto' : ''}`}>
          {scopes.map(s => (
            <button key={s} onClick={() => setActiveScope(s)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-bold tracking-wide transition-all duration-200 ${
                currentScope === s ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30' : 'text-white/40 hover:text-white/70'
              }`}>
              {scopeLabel[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Hero stat — selected event ranking */}
      {selectedRank && (
        <div className="px-6 py-5">
          <div className="flex items-end gap-5">
            <div>
              <div className="flex items-start">
                <span className="text-7xl sm:text-8xl font-black text-white leading-none">{selectedRank.rank}</span>
                <span className="text-2xl sm:text-3xl font-black text-white mt-1 ml-0.5">{ordinalSuffix(selectedRank.rank)}</span>
              </div>
              <div className="text-sm font-black uppercase tracking-widest text-cyan-400 mt-1">{scopeLabelUpper[currentScope]}</div>
            </div>
            <div className="h-16 w-px bg-white/15 mx-2" />
            <div>
              <div className="text-7xl sm:text-8xl font-black text-white font-mono leading-none tracking-tight">{selectedRow.best_time}</div>
              <div className="text-sm font-black uppercase tracking-widest text-cyan-400 mt-1">{selectedEventName?.toUpperCase()} · PERSONAL BEST</div>
            </div>
          </div>
        </div>
      )}

      {/* Event rows */}
      <div className="px-4 pb-5 mt-1 space-y-1">
        {poolRows.map((r, i) => {
          const rank = r.rankings[currentScope]
          const eName = eventMap[`${r.event_id}-${r.pool}`] || eventMap[`${r.event_id}`] || `Event ${r.event_id}`
          const isSelected = selectedRow && `${r.event_id}-${r.pool}` === `${selectedRow.event_id}-${selectedRow.pool}`
          return (
            <div key={`${r.event_id}-${r.pool}`}
              onClick={() => setSelectedKey(`${r.event_id}-${r.pool}`)}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 animate-fade-in-up cursor-pointer ${
                isSelected ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'hover:bg-white/5'
              }`}
              style={{ animationDelay: `${i * 0.05}s` }}>
              <StrokeIcon eventName={eName} className="w-10 h-10" dark={isSelected} />
              <div className="flex-1 min-w-0">
                <div className={`text-[15px] font-black uppercase tracking-wide truncate ${isSelected ? 'text-white' : 'text-white/90'}`}>{eName}</div>
              </div>
              <div className="flex items-center gap-5 shrink-0">
                {rank ? (
                  <>
                    <span className={`font-black text-[15px] tabular-nums ${isSelected ? 'text-white/80' : 'text-white/40'}`}>
                      {rank.rank}<span className={isSelected ? 'text-white/50' : 'text-white/20'}>/{rank.total}</span>
                    </span>
                    <span className={`font-mono font-black text-lg tabular-nums min-w-[75px] text-right text-white`}>{r.best_time}</span>
                  </>
                ) : (
                  <span className="text-white/20 text-sm">-</span>
                )}
              </div>
            </div>
          )
        })}
        {poolRows.length === 0 && (
          <div className="text-center py-8 text-white/20 text-sm">No rankings for this pool</div>
        )}
      </div>
    </div>
  )
}

/* ───────── TAB CONFIG ───────── */
const TABS = [
  { key: 'times', label: 'Times', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
  { key: 'meets', label: 'Meets', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg> },
  { key: 'medals', label: 'Medals', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-4.5A3.375 3.375 0 0012.75 10.5h-1.5A3.375 3.375 0 007.5 13.875v4.875" /></svg> },
  { key: 'rankings', label: 'Rankings', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-7.5L16.5 13.5m0 0L12 9m4.5 4.5V3" /></svg> },
  { key: 'records', label: 'Records', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg> },
  { key: 'progression', label: 'Progression', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg> },
  { key: 'stats', label: 'Stats', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg> },
  { key: 'transfers', label: 'Transfers', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg> },
  { key: 'gallery', label: 'Gallery', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 6v12.75c0 1.243 1.007 2.25 2.25 2.25z" /></svg> },
]

/* ───────── MAIN PAGE ───────── */
export default function SwimmerProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
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

  useEffect(() => {
    Promise.all([
      getSwimmer(id).then(res => setSwimmer(res.data)),
      getSwimmerEvents(id).then(res => setEvents(res.data)),
      getSwimmerProfileStats(id).then(res => setStats(res.data)),
    ]).finally(() => setLoaded(true))
  }, [id])

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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-sky-200 border-t-sky-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-400">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (!swimmer) return <div className="text-center py-12 text-gray-400">Swimmer not found</div>

  return (
    <div className="max-w-6xl mx-auto pb-12">
      {/* Back */}
      <button onClick={() => navigate('/swimmers')}
        className="text-gray-400 hover:text-gray-600 text-sm mb-4 inline-flex items-center gap-1.5 group transition-colors">
        <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Back to Swimmers
      </button>

      {/* Hero Header */}
      <div className="relative rounded-2xl overflow-hidden mb-6 animate-hero">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-sky-900 to-sky-800" />
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 20.5V18H0v-2h20v-2H0v-2h20v-2H0V8h20V6H0V4h20V2H0V0h22v20h2V0h2v20h2V0h2v20h2V0h2v20h2V0h2v20.5z' fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E")` }} />
        {/* Glow effect */}
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-sky-400/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-sky-300/10 rounded-full blur-2xl" />

        <div className="relative p-4 sm:p-6 md:p-8">
          {/* Actions - top right */}
          <div className="absolute top-3 right-3 sm:top-6 sm:right-6 flex gap-1.5 sm:gap-2">
            <button onClick={async () => {
                const next = !swimmer.is_retired
                await updateSwimmer(id, { is_retired: next })
                setSwimmer({ ...swimmer, is_retired: next })
              }}
              className={`backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold transition-all duration-200 ring-1 ${
                swimmer.is_retired
                  ? 'bg-red-500/20 text-red-200 ring-red-400/30 hover:bg-red-500/30'
                  : 'bg-white/10 text-white/70 ring-white/10 hover:bg-white/20 hover:ring-white/20'
              }`}>
              {swimmer.is_retired ? 'Active' : 'Retired'}
            </button>
            <button onClick={() => navigate(`/swimmers/${id}/edit`)}
              className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold transition-all duration-200 ring-1 ring-white/10 hover:ring-white/20">
              Edit
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
            {/* Photo */}
            <div className="w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center overflow-hidden shrink-0 ring-2 ring-white/20 shadow-xl animate-fade-in-up stagger-1">
              {swimmer.photo ? (
                <img src={swimmer.photo} alt="" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-10 h-10 sm:w-14 sm:h-14 text-white/30" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 text-center sm:text-left animate-fade-in-up stagger-2">
              <div className="flex items-center justify-center sm:justify-start gap-2 sm:gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight drop-shadow-sm">{swimmer.name}</h1>
                {swimmer.is_retired && (
                  <span className="bg-red-500/20 backdrop-blur-sm text-red-200 text-[10px] sm:text-[11px] font-black uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg ring-1 ring-red-400/30">Retired</span>
                )}
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-2 mt-1.5 sm:mt-2">
                <CountryFlag code={swimmer.nationality_detail?.code} flagUrl={swimmer.nationality_detail?.flag_url} name={swimmer.nationality_detail?.name} className="text-white/80 text-sm font-medium" />
              </div>
              <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 sm:gap-3 mt-2 sm:mt-3">
                {swimmer.date_of_birth && (
                  <span className="bg-white/10 backdrop-blur-sm text-white/80 text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium">
                    DOB <span className="text-white font-semibold">{swimmer.date_of_birth}</span>
                  </span>
                )}
                {!swimmer.date_of_birth && swimmer.birth_year && (
                  <span className="bg-white/10 backdrop-blur-sm text-white/80 text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium">
                    Born <span className="text-white font-semibold">{swimmer.birth_year}</span>
                  </span>
                )}
                {swimmer.age != null && (
                  <span className="bg-white/10 backdrop-blur-sm text-white/80 text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium">
                    Age <span className="text-white font-semibold">{swimmer.age}</span>
                  </span>
                )}
                {swimmer.sex && (
                  <span className="bg-white/10 backdrop-blur-sm text-white/80 text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium">
                    {swimmer.sex === 'M' ? 'Male' : 'Female'}
                  </span>
                )}
                {swimmer.club && (
                  <span className="bg-white/10 backdrop-blur-sm text-white/80 text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium">
                    Club <span className="text-white font-semibold">{swimmer.club}</span>
                  </span>
                )}
              </div>
              {swimmer.nicknames?.length > 0 && (
                <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-2">
                  {swimmer.nicknames.map((n, i) => (
                    <span key={i} className="bg-sky-500/20 backdrop-blur-sm text-sky-200 text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full font-medium">{n.nickname}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Numbers */}
            {stats && (
              <div className="hidden lg:flex gap-2.5 shrink-0 animate-fade-in-up stagger-3">
                {stats.medals.total > 0 && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 text-center min-w-[72px] ring-1 ring-white/10">
                    <div className="text-2xl font-black text-white"><AnimatedNumber value={stats.medals.total} /></div>
                    <div className="text-[9px] text-white/50 font-bold uppercase tracking-widest mt-0.5">Medals</div>
                    <div className="flex gap-1 mt-1.5 justify-center text-[10px] font-bold">
                      {stats.medals.gold > 0 && <span className="text-amber-300">{stats.medals.gold}G</span>}
                      {stats.medals.silver > 0 && <span className="text-gray-300">{stats.medals.silver}S</span>}
                      {stats.medals.bronze > 0 && <span className="text-orange-300">{stats.medals.bronze}B</span>}
                    </div>
                  </div>
                )}
                {stats.best_fina && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 text-center min-w-[72px] ring-1 ring-white/10">
                    <div className="text-2xl font-black text-white"><AnimatedNumber value={stats.best_fina.points} /></div>
                    <div className="text-[9px] text-white/50 font-bold uppercase tracking-widest mt-0.5">Best FINA</div>
                  </div>
                )}
                {stats.total_records > 0 && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 text-center min-w-[72px] ring-1 ring-white/10">
                    <div className="text-2xl font-black text-white"><AnimatedNumber value={stats.total_records} /></div>
                    <div className="text-[9px] text-white/50 font-bold uppercase tracking-widest mt-0.5">Records</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border shadow-sm p-1 sm:p-1.5 mb-4 sm:mb-6 flex gap-0.5 sm:gap-1 overflow-x-auto animate-fade-in-up stagger-4 scrollbar-hide">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`relative flex items-center gap-1 sm:gap-2 px-2.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-300 ${
              activeTab === tab.key
                ? 'bg-sky-600 text-white shadow-md shadow-sky-200'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}>
            <span className="hidden sm:inline">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div key={activeTab} className="animate-fade-in">
        {activeTab === 'times' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <PersonalBestsTable events={events} onEventClick={handleEventClick} selectedEvent={selectedEvent} />
            <TimeHistoryPanel selectedEvent={selectedEvent} history={history} loadingHistory={loadingHistory} navigate={navigate} />
          </div>
        )}
        {activeTab === 'meets' && <MeetsTab stats={stats} navigate={navigate} />}
        {activeTab === 'medals' && <MedalsTab stats={stats} />}
        {activeTab === 'rankings' && <RankingsTab swimmerId={parseInt(id)} swimmer={swimmer} />}
        {activeTab === 'records' && <RecordsTab swimmerId={parseInt(id)} swimmer={swimmer} />}
        {activeTab === 'progression' && <ProgressionTab swimmerId={parseInt(id)} />}
        {activeTab === 'stats' && <StatsTab stats={stats} events={events} swimmerId={parseInt(id)} />}
        {activeTab === 'transfers' && <TransferHistoryTab swimmerId={parseInt(id)} />}
        {activeTab === 'gallery' && <GalleryTab swimmerId={parseInt(id)} />}
      </div>
    </div>
  )
}
