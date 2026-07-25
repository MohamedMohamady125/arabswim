import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { getSwimmer, updateSwimmer, getSwimmerEvents, getSwimmerEventHistory, getSwimmerProfileStats, getSwimmerProgression, getSwimmerTransferHistory, getSwimmerRankings } from '../api/swimmers'
import { getRecords, getComputedRecords } from '../api/records'
import { getMediaItems } from '../api/media'
import CountryFlag from '../components/common/CountryFlag'

const MEDAL_COLORS = { GOLD: '#FFD700', SILVER: '#C0C0C0', BRONZE: '#CD7F32' }
const MEDAL_LABELS = { GOLD: 'Gold', SILVER: 'Silver', BRONZE: 'Bronze' }

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
                        <span className={`font-mono font-semibold ${h.fina_points >= 800 ? 'text-emerald-600' : h.fina_points >= 600 ? 'text-sky-600' : 'text-gray-600'}`}>{h.fina_points}</span>
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

/* ───────── Medal Bar ───────── */
function MedalBar({ gold, silver, bronze, animate = false }) {
  const total = gold + silver + bronze
  if (!total) return <div className="h-5 bg-gray-100 rounded-full w-full" />
  return (
    <div className={`flex h-5 rounded-full overflow-hidden w-full ${animate ? 'animate-grow-width' : ''}`}>
      {gold > 0 && <div className="transition-all duration-700" style={{ width: `${(gold / total) * 100}%`, backgroundColor: MEDAL_COLORS.GOLD }} />}
      {silver > 0 && <div className="transition-all duration-700" style={{ width: `${(silver / total) * 100}%`, backgroundColor: MEDAL_COLORS.SILVER }} />}
      {bronze > 0 && <div className="transition-all duration-700" style={{ width: `${(bronze / total) * 100}%`, backgroundColor: MEDAL_COLORS.BRONZE }} />}
    </div>
  )
}

/* ───────── Medal Counts Inline ───────── */
function MedalCounts({ gold, silver, bronze, size = 'sm' }) {
  const text = size === 'lg' ? 'text-sm' : 'text-[10px]'
  return (
    <div className={`flex gap-1.5 ${text} font-bold`}>
      {gold > 0 && <span style={{ color: '#B8860B' }}>{gold}G</span>}
      {silver > 0 && <span className="text-gray-500">{silver}S</span>}
      {bronze > 0 && <span style={{ color: '#CD7F32' }}>{bronze}B</span>}
    </div>
  )
}

/* ───────── Medal Row ───────── */
function MedalRow({ medal, navigate, delay = 0 }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 hover:bg-gray-50 rounded-xl transition-all duration-200 animate-fade-in-up"
      style={{ animationDelay: `${delay}s` }}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 shadow-sm"
        style={{ backgroundColor: MEDAL_COLORS[medal.medal_type] + '40', color: medal.medal_type === 'GOLD' ? '#8B6914' : medal.medal_type === 'SILVER' ? '#555' : '#8B4513' }}>
        {medal.medal_type === 'GOLD' ? '1' : medal.medal_type === 'SILVER' ? '2' : '3'}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-gray-800">{medal.event_name}</span>
        <button onClick={() => navigate(`/meets/${medal.championship_id}`)}
          className="text-xs text-sky-600 hover:text-sky-800 block truncate transition-colors">
          {medal.championship_name} ({new Date(medal.championship_date).getFullYear()})
        </button>
      </div>
      <span className={`text-[10px] font-black px-2 py-1 rounded-full tracking-wide ${
        medal.medal_type === 'GOLD' ? 'bg-amber-100 text-amber-800' : medal.medal_type === 'SILVER' ? 'bg-gray-200 text-gray-700' : 'bg-orange-100 text-orange-800'
      }`}>{MEDAL_LABELS[medal.medal_type]}</span>
    </div>
  )
}

/* ───────── Medals Tab ───────── */
function MedalsTab({ stats, navigate }) {
  if (!stats) return null
  const { medals, medals_by_level, medals_hierarchy } = stats
  const [expandedCats, setExpandedCats] = useState(() => new Set((medals_hierarchy || []).map(c => c.name)))
  const [expandedCls, setExpandedCls] = useState(() => {
    const set = new Set()
    ;(medals_hierarchy || []).forEach(cat => cat.classifications.forEach(cls => set.add(`${cat.name}/${cls.name}`)))
    return set
  })
  const [expandedSubs, setExpandedSubs] = useState(new Set())

  const toggle = (set, setter, key) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    setter(next)
  }

  if (medals.total === 0) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-12 text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gray-50 flex items-center justify-center">
          <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
        </div>
        <p className="text-gray-500 font-semibold text-lg">No medals yet</p>
        <p className="text-gray-300 text-sm mt-1">Medals will appear here once earned</p>
      </div>
    )
  }

  // Collect all medals flat for the timeline
  const allMedals = []
  ;(medals_hierarchy || []).forEach(cat => {
    cat.classifications.forEach(cls => {
      cls.medals.forEach(m => allMedals.push({ ...m, category: cat.name, classification: cls.name }))
      cls.sub_classifications.forEach(sub => {
        sub.medals.forEach(m => allMedals.push({ ...m, category: cat.name, classification: cls.name, sub_classification: sub.name }))
      })
    })
  })

  // Medal podium SVG
  const Podium = () => {
    const items = [
      { type: 'SILVER', count: medals.silver, x: 20, barH: 70, color: '#C0C0C0', dark: '#8a8a8a' },
      { type: 'GOLD', count: medals.gold, x: 95, barH: 95, color: '#FFD700', dark: '#b8860b' },
      { type: 'BRONZE', count: medals.bronze, x: 170, barH: 55, color: '#CD7F32', dark: '#8b4513' },
    ]
    return (
      <svg viewBox="0 0 260 140" className="w-full max-w-[280px] mx-auto">
        {items.map((item, i) => {
          const y = 130 - item.barH
          return (
            <g key={item.type}>
              <rect x={item.x} y={y} width={70} height={item.barH} rx={8} fill={item.color + '30'} stroke={item.color} strokeWidth={1.5} className="animate-grow-width" style={{ animationDelay: `${i * 0.15}s` }} />
              <text x={item.x + 35} y={y + item.barH / 2 - 6} textAnchor="middle" className="font-black" style={{ fontSize: '28px', fill: item.dark }}>{item.count}</text>
              <text x={item.x + 35} y={y + item.barH / 2 + 14} textAnchor="middle" className="font-bold uppercase" style={{ fontSize: '9px', fill: item.dark, letterSpacing: '0.05em' }}>{MEDAL_LABELS[item.type]}</text>
            </g>
          )
        })}
      </svg>
    )
  }

  return (
    <div className="space-y-5">
      {/* Podium + Total */}
      <div className="bg-gradient-to-br from-gray-50 via-white to-amber-50/30 rounded-2xl border shadow-sm p-5 sm:p-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1">
            <Podium />
          </div>
          <div className="text-center sm:text-right">
            <div className="text-5xl sm:text-6xl font-black bg-gradient-to-r from-amber-500 via-gray-400 to-amber-700 bg-clip-text text-transparent">
              <AnimatedNumber value={medals.total} />
            </div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Total Medals</div>
          </div>
        </div>
      </div>

      {/* Medal Analytics */}
      {medals_by_level.length > 0 && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden animate-fade-in-up stagger-3">
          <div className="p-4 sm:p-5 border-b bg-gradient-to-r from-gray-50 to-white">
            <h3 className="font-bold text-base text-gray-800">By Competition Level</h3>
          </div>
          <div className="p-4 sm:p-5 space-y-3">
            {medals_by_level.map((level, i) => {
              const total = level.gold + level.silver + level.bronze
              return (
                <div key={i} className="animate-fade-in-up" style={{ animationDelay: `${(i + 4) * 0.06}s` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-gray-700">{level.category}</span>
                    <span className="text-xs font-bold text-gray-400">{total}</span>
                  </div>
                  <div className="flex h-7 rounded-lg overflow-hidden bg-gray-100">
                    {level.gold > 0 && (
                      <div className="flex items-center justify-center text-[10px] font-black text-amber-900 animate-grow-width"
                        style={{ width: `${(level.gold / total) * 100}%`, backgroundColor: '#FFD70060', animationDelay: `${(i + 4) * 0.08}s` }}>
                        {level.gold > 0 && level.gold}
                      </div>
                    )}
                    {level.silver > 0 && (
                      <div className="flex items-center justify-center text-[10px] font-black text-gray-600 animate-grow-width"
                        style={{ width: `${(level.silver / total) * 100}%`, backgroundColor: '#C0C0C050', animationDelay: `${(i + 4) * 0.08 + 0.1}s` }}>
                        {level.silver > 0 && level.silver}
                      </div>
                    )}
                    {level.bronze > 0 && (
                      <div className="flex items-center justify-center text-[10px] font-black text-orange-900 animate-grow-width"
                        style={{ width: `${(level.bronze / total) * 100}%`, backgroundColor: '#CD7F3240', animationDelay: `${(i + 4) * 0.08 + 0.2}s` }}>
                        {level.bronze > 0 && level.bronze}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Medals by Championship — collapsible hierarchy */}
      {(medals_hierarchy || []).length > 0 && (
        <div className="space-y-3">
          {medals_hierarchy.map((cat, ci) => (
            <div key={cat.name} className="bg-white rounded-2xl border shadow-sm overflow-hidden animate-fade-in-up" style={{ animationDelay: `${(ci + 5) * 0.06}s` }}>
              <button onClick={() => toggle(expandedCats, setExpandedCats, cat.name)}
                className="w-full flex items-center gap-3 p-4 hover:bg-gray-50/80 transition-all duration-200">
                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-300 ${expandedCats.has(cat.name) ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" /></svg>
                <h3 className="flex-1 text-left font-bold text-base text-gray-800">{cat.name}</h3>
                <div className="flex gap-1.5">
                  {cat.gold > 0 && <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black" style={{ backgroundColor: '#FFD70030', color: '#8B6914' }}>{cat.gold}</span>}
                  {cat.silver > 0 && <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black" style={{ backgroundColor: '#C0C0C040', color: '#555' }}>{cat.silver}</span>}
                  {cat.bronze > 0 && <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black" style={{ backgroundColor: '#CD7F3230', color: '#8B4513' }}>{cat.bronze}</span>}
                </div>
              </button>
              {expandedCats.has(cat.name) && (
                <div className="border-t animate-expand">
                  {cat.classifications.map(cls => {
                    const clsKey = `${cat.name}/${cls.name}`
                    return (
                      <div key={cls.name}>
                        <button onClick={() => toggle(expandedCls, setExpandedCls, clsKey)}
                          className="w-full flex items-center gap-3 px-7 py-3 hover:bg-gray-50/80 transition-all duration-200 border-b border-gray-50">
                          <svg className={`w-3 h-3 text-gray-300 transition-transform duration-300 ${expandedCls.has(clsKey) ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" /></svg>
                          <span className="flex-1 text-left text-sm font-semibold text-gray-600">{cls.name}</span>
                          <MedalCounts gold={cls.gold} silver={cls.silver} bronze={cls.bronze} size="lg" />
                        </button>
                        {expandedCls.has(clsKey) && (
                          <div className="bg-gray-50/30 animate-expand">
                            {cls.sub_classifications.map(sub => {
                              const subKey = `${clsKey}/${sub.name}`
                              return (
                                <div key={sub.name}>
                                  <button onClick={() => toggle(expandedSubs, setExpandedSubs, subKey)}
                                    className="w-full flex items-center gap-3 px-11 py-2.5 hover:bg-gray-100/50 transition-all duration-200">
                                    <svg className={`w-2.5 h-2.5 text-gray-300 transition-transform duration-300 ${expandedSubs.has(subKey) ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" /></svg>
                                    <span className="flex-1 text-left text-sm text-gray-500">{sub.name}</span>
                                    <MedalCounts gold={sub.gold} silver={sub.silver} bronze={sub.bronze} />
                                  </button>
                                  {expandedSubs.has(subKey) && (
                                    <div className="pl-12 pr-4 pb-2 animate-expand">
                                      {sub.medals.map((m, mi) => <MedalRow key={m.id} medal={m} navigate={navigate} delay={mi * 0.04} />)}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            {cls.medals.length > 0 && (
                              <div className="pl-9 pr-4 py-2 animate-expand">
                                {cls.medals.map((m, mi) => <MedalRow key={m.id} medal={m} navigate={navigate} delay={mi * 0.04} />)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recent Medals Timeline */}
      {allMedals.length > 0 && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <div className="p-4 sm:p-5 border-b bg-gradient-to-r from-gray-50 to-white">
            <h3 className="font-bold text-base text-gray-800">Medal Collection</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">{allMedals.length} medal{allMedals.length !== 1 ? 's' : ''} earned</p>
          </div>
          <div className="p-3 sm:p-4 grid gap-2 sm:grid-cols-2">
            {allMedals.map((m, i) => {
              const medalColor = m.medal_type === 'GOLD' ? { bg: 'bg-amber-50', border: 'border-amber-200', ring: 'ring-amber-300', text: 'text-amber-800', icon: '\u{1F947}' }
                : m.medal_type === 'SILVER' ? { bg: 'bg-gray-50', border: 'border-gray-200', ring: 'ring-gray-300', text: 'text-gray-700', icon: '\u{1F948}' }
                : { bg: 'bg-orange-50', border: 'border-orange-200', ring: 'ring-orange-300', text: 'text-orange-800', icon: '\u{1F949}' }
              return (
                <div key={m.id}
                  className={`${medalColor.bg} ${medalColor.border} border rounded-xl p-3 flex items-center gap-3 hover:ring-1 ${medalColor.ring} transition-all cursor-pointer animate-fade-in-up`}
                  style={{ animationDelay: `${i * 0.04}s` }}
                  onClick={() => navigate(`/meets/${m.championship_id}`)}>
                  <span className="text-xl">{medalColor.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-800 truncate">{m.event_name}</div>
                    <div className="text-[11px] text-gray-500 truncate">{m.championship_name}</div>
                    {m.championship_date && <div className="text-[10px] text-gray-400">{new Date(m.championship_date).getFullYear()}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────── Performance Index ───────── */
function PerformanceIndex({ finaDistribution, bestFina }) {
  if (!finaDistribution || finaDistribution.length === 0) return null
  const maxCount = Math.max(...finaDistribution.map(d => d.count))

  const TIER_COLORS = {
    'Elite':         { bar: 'from-emerald-400 to-emerald-600', text: 'text-emerald-600' },
    'World Class':   { bar: 'from-sky-400 to-sky-600', text: 'text-sky-600' },
    'International': { bar: 'from-blue-400 to-blue-600', text: 'text-blue-600' },
    'National':      { bar: 'from-violet-400 to-violet-600', text: 'text-violet-600' },
    'Advanced':      { bar: 'from-indigo-400 to-indigo-600', text: 'text-indigo-600' },
    'Competitive':   { bar: 'from-amber-400 to-amber-600', text: 'text-amber-600' },
    'Developing':    { bar: 'from-orange-300 to-orange-500', text: 'text-orange-600' },
    'Novice':        { bar: 'from-gray-300 to-gray-400', text: 'text-gray-500' },
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
          const rangeLabel = tier.high >= 1000 ? `${tier.low}+` : `${tier.low}-${tier.high}`
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
function StatsTab({ stats, events }) {
  if (!stats) return null
  const { medals, best_fina, best_event, total_championships, records, total_records, fina_distribution } = stats
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
          {best_event && (
            <div className="bg-gradient-to-br from-amber-50 via-white to-amber-50/30 rounded-2xl border border-amber-200 p-5 shadow-sm animate-fade-in-up stagger-6 hover:shadow-md transition-shadow duration-300">
              <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2">Signature Event</div>
              <div className="text-2xl font-black text-amber-700">{best_event}</div>
              <div className="text-xs text-gray-400 mt-1">Highest FINA points across all events</div>
            </div>
          )}
        </div>
      </div>

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
function RecordsTab({ swimmerId }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    // Fetch computed records for arab and gcc scopes, filter for this swimmer
    Promise.all([
      getComputedRecords({ scope: 'arab', pool: 'LCM' }),
      getComputedRecords({ scope: 'arab', pool: 'SCM' }),
      getComputedRecords({ scope: 'gcc', pool: 'LCM' }),
      getComputedRecords({ scope: 'gcc', pool: 'SCM' }),
    ]).then(([arabLCM, arabSCM, gccLCM, gccSCM]) => {
      const all = []
      const addRecords = (data, type, pool) => {
        data.filter(r => r.swimmer_id === swimmerId).forEach(r => {
          all.push({ ...r, record_type: type, pool, event_name: r.event_name, formatted_time: r.time, location: r.championship_name, result_date: r.date })
        })
      }
      addRecords(arabLCM.data, 'ARAB', 'LCM')
      addRecords(arabSCM.data, 'ARAB', 'SCM')
      addRecords(gccLCM.data, 'GCC', 'LCM')
      addRecords(gccSCM.data, 'GCC', 'SCM')
      setRecords(all)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [swimmerId])

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" /></div>

  // Group by record type
  const byType = {}
  records.forEach(r => {
    const type = r.record_type || 'OTHER'
    if (!byType[type]) byType[type] = []
    byType[type].push(r)
  })

  const TYPE_STYLES = {
    ARAB: { bg: 'from-emerald-50 to-emerald-100/30', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', header: 'text-emerald-800', label: 'Arab Records' },
    GCC: { bg: 'from-sky-50 to-sky-100/30', border: 'border-sky-200', badge: 'bg-sky-100 text-sky-700', header: 'text-sky-800', label: 'GCC Records' },
    NATIONAL: { bg: 'from-purple-50 to-purple-100/30', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', header: 'text-purple-800', label: 'National Records' },
    OTHER: { bg: 'from-gray-50 to-gray-100/30', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-700', header: 'text-gray-800', label: 'Other Records' },
  }

  const types = Object.keys(byType).sort((a, b) => {
    const order = { ARAB: 0, GCC: 1, NATIONAL: 2 }
    return (order[a] ?? 3) - (order[b] ?? 3)
  })

  if (types.length === 0) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-12 text-center animate-fade-in">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
        <p className="text-gray-400 font-medium">No records held</p>
        <p className="text-gray-300 text-sm mt-1">Records will appear here when this swimmer sets Arab, GCC, or National records</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 animate-fade-in-up">
        {['ARAB', 'GCC', 'NATIONAL'].map((type, i) => {
          const count = (byType[type] || []).length
          const style = TYPE_STYLES[type]
          return (
            <div key={type} className={`bg-gradient-to-br ${style.bg} ${style.border} border rounded-2xl p-5 text-center shadow-sm animate-count-up stagger-${i + 1}`}>
              <div className={`text-4xl font-black ${style.header}`}><AnimatedNumber value={count} /></div>
              <div className="text-[11px] font-bold text-gray-400 mt-1.5 uppercase tracking-wider">{style.label}</div>
            </div>
          )
        })}
      </div>

      {/* Records by category */}
      {types.map((type, ti) => {
        const style = TYPE_STYLES[type] || TYPE_STYLES.OTHER
        const recs = byType[type]
        return (
          <div key={type} className="bg-white rounded-2xl border shadow-sm overflow-hidden animate-fade-in-up" style={{ animationDelay: `${(ti + 3) * 0.08}s` }}>
            <div className={`p-4 border-b bg-gradient-to-r ${style.bg}`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg ${style.badge}`}>{type}</span>
                <h3 className={`font-bold text-base ${style.header}`}>{style.label}</h3>
                <span className="ml-auto text-sm font-bold text-gray-400">{recs.length}</span>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {recs.map((r, ri) => (
                <div key={ri} className="px-5 py-3.5 flex items-center gap-4 hover:bg-gray-50/80 transition-all duration-200 animate-fade-in-up" style={{ animationDelay: `${(ti * 3 + ri + 4) * 0.05}s` }}>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-800">{r.event_detail?.name || r.event_name}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{r.location}{r.location && r.result_date ? ' \u00b7 ' : ''}{r.result_date}</div>
                  </div>
                  {r.pool && <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${r.pool === 'LCM' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{r.pool}</span>}
                  <div className="font-mono text-base font-black text-sky-600">{r.formatted_time}</div>
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
const LINE_COLORS = [
  { line: '#2563eb', label: 'text-blue-700', bg: 'bg-blue-500' },
  { line: '#dc2626', label: 'text-red-700', bg: 'bg-red-500' },
  { line: '#16a34a', label: 'text-green-700', bg: 'bg-green-500' },
  { line: '#eab308', label: 'text-yellow-600', bg: 'bg-yellow-500' },
  { line: '#ec4899', label: 'text-pink-700', bg: 'bg-pink-500' },
  { line: '#8b5cf6', label: 'text-violet-700', bg: 'bg-violet-500' },
  { line: '#f97316', label: 'text-orange-700', bg: 'bg-orange-500' },
  { line: '#06b6d4', label: 'text-cyan-700', bg: 'bg-cyan-500' },
]

function formatTimeShort(cs) {
  if (!cs) return ''
  const minutes = Math.floor(cs / 6000)
  const seconds = Math.floor((cs % 6000) / 100)
  const centis = cs % 100
  if (minutes) return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  return `${seconds}.${String(centis).padStart(2, '0')}`
}

function formatTimeSeconds(cs) {
  const minutes = Math.floor(cs / 6000)
  const seconds = Math.floor((cs % 6000) / 100)
  const centis = cs % 100
  if (minutes) return `${minutes}:${String(seconds).padStart(2, '0')}`
  return `${seconds}.${String(centis).padStart(2, '0')}`
}

function CombinedProgressionChart({ lines }) {
  if (!lines.length) return null

  // Collect all dates and compute global time range
  const allDates = new Set()
  lines.forEach(l => l.points.forEach(p => allDates.add(p.date)))
  const sortedDates = [...allDates].sort()

  let globalMin = Infinity, globalMax = -Infinity
  lines.forEach(l => l.points.forEach(p => {
    if (p.time_cs < globalMin) globalMin = p.time_cs
    if (p.time_cs > globalMax) globalMax = p.time_cs
  }))

  // Add 5% padding to range
  const range = globalMax - globalMin || 1
  const paddedMin = globalMin - range * 0.08
  const paddedMax = globalMax + range * 0.08

  // SVG dimensions
  const W = 800, H = 400, PL = 65, PR = 30, PT = 50, PB = 45
  const chartW = W - PL - PR
  const chartH = H - PT - PB

  const dateToX = (date) => {
    if (sortedDates.length === 1) return PL + chartW / 2
    const idx = sortedDates.indexOf(date)
    return PL + (idx / (sortedDates.length - 1)) * chartW
  }

  const timeToY = (cs) => {
    // Lower time = higher on chart (better)
    return PT + ((cs - paddedMin) / (paddedMax - paddedMin)) * chartH
  }

  // Y-axis grid: 5-6 evenly spaced ticks
  const tickCount = 6
  const yTicks = []
  for (let i = 0; i < tickCount; i++) {
    const cs = paddedMin + (i / (tickCount - 1)) * (paddedMax - paddedMin)
    yTicks.push(Math.round(cs))
  }

  // X-axis labels: show all dates if ≤ 8, else pick evenly spaced
  const xLabels = sortedDates.length <= 10 ? sortedDates : sortedDates.filter((_, i) =>
    i === 0 || i === sortedDates.length - 1 || i % Math.ceil(sortedDates.length / 8) === 0
  )

  // Tooltip state managed via hover
  const [tooltip, setTooltip] = useState(null)

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      {/* Title + Legend */}
      <div className="px-5 pt-4 pb-2">
        <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wide mb-3">
          Swimming Progression by Event
        </h4>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {lines.map((line, i) => {
            const color = LINE_COLORS[i % LINE_COLORS.length]
            return (
              <div key={line.event_id} className="flex items-center gap-1.5">
                <span className={`w-3 h-0.5 rounded ${color.bg}`} style={{ display: 'inline-block' }} />
                <span className={`w-2 h-2 rounded-full ${color.bg}`} style={{ display: 'inline-block' }} />
                <span className={`w-3 h-0.5 rounded ${color.bg}`} style={{ display: 'inline-block' }} />
                <span className={`text-xs font-semibold ${color.label}`}>{line.event_name}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="px-3 pb-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto', minHeight: '300px', maxHeight: '450px' }}>
          {/* Background */}
          <rect x={PL} y={PT} width={chartW} height={chartH} fill="#f8fafc" rx="4" />

          {/* Y-axis grid lines + labels */}
          {yTicks.map((cs, i) => {
            const y = timeToY(cs)
            return (
              <g key={i}>
                <line x1={PL} x2={PL + chartW} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 3" />
                <text x={PL - 8} y={y + 4} textAnchor="end" style={{ fontSize: '11px', fill: '#64748b', fontFamily: 'monospace' }}>
                  {formatTimeSeconds(cs)}
                </text>
              </g>
            )
          })}

          {/* Y-axis title */}
          <text x={15} y={PT + chartH / 2} textAnchor="middle" transform={`rotate(-90, 15, ${PT + chartH / 2})`}
            style={{ fontSize: '11px', fill: '#94a3b8', fontWeight: 600 }}>
            Time (Seconds)
          </text>

          {/* X-axis labels */}
          {xLabels.map(date => {
            const x = dateToX(date)
            const d = new Date(date)
            return (
              <g key={date}>
                <line x1={x} x2={x} y1={PT} y2={PT + chartH} stroke="#e2e8f0" strokeDasharray="2 4" opacity="0.5" />
                <text x={x} y={H - 8} textAnchor="middle" style={{ fontSize: '10px', fill: '#94a3b8' }}>
                  {d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                </text>
              </g>
            )
          })}

          {/* Event lines */}
          {lines.map((line, li) => {
            const color = LINE_COLORS[li % LINE_COLORS.length]
            const pts = line.points
            if (pts.length === 0) return null

            const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${dateToX(p.date)},${timeToY(p.time_cs)}`).join(' ')

            return (
              <g key={line.event_id}>
                {/* Line */}
                <path d={pathD} fill="none" stroke={color.line} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                {/* Points + time labels */}
                {pts.map((p, i) => {
                  const x = dateToX(p.date)
                  const y = timeToY(p.time_cs)
                  const isBest = p.time_cs === Math.min(...pts.map(pp => pp.time_cs))
                  return (
                    <g key={i}
                      onMouseEnter={() => setTooltip({ x, y, line: line.event_name, ...p })}
                      onMouseLeave={() => setTooltip(null)}
                      style={{ cursor: 'pointer' }}>
                      {/* Time label */}
                      <text x={x} y={y - 12} textAnchor="middle"
                        style={{ fontSize: '10px', fontWeight: 700, fill: color.line, fontFamily: 'monospace' }}>
                        {formatTimeShort(p.time_cs)}
                      </text>
                      {/* Dot */}
                      <circle cx={x} cy={y} r={isBest ? 5.5 : 4} fill="#fff" stroke={color.line} strokeWidth="2.5" />
                      {isBest && <circle cx={x} cy={y} r={2.5} fill={color.line} />}
                    </g>
                  )
                })}
              </g>
            )
          })}

          {/* Tooltip */}
          {tooltip && (
            <g>
              <rect x={tooltip.x - 80} y={tooltip.y + 15} width="160" height="48" rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1" />
              <text x={tooltip.x} y={tooltip.y + 32} textAnchor="middle" style={{ fontSize: '11px', fontWeight: 700, fill: '#1e293b' }}>
                {tooltip.line}
              </text>
              <text x={tooltip.x} y={tooltip.y + 48} textAnchor="middle" style={{ fontSize: '10px', fill: '#64748b' }}>
                {formatTimeShort(tooltip.time_cs)} · {tooltip.meet?.substring(0, 25)}{tooltip.fina ? ` · ${tooltip.fina} FINA` : ''}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Details table below chart */}
      <div className="px-5 pb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-3 text-gray-400 font-semibold">Event</th>
                <th className="text-left py-2 pr-3 text-gray-400 font-semibold">Best</th>
                <th className="text-left py-2 pr-3 text-gray-400 font-semibold">Latest</th>
                <th className="text-left py-2 pr-3 text-gray-400 font-semibold">Change</th>
                <th className="text-left py-2 text-gray-400 font-semibold">Best Meet</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, li) => {
                const color = LINE_COLORS[li % LINE_COLORS.length]
                const pts = line.points
                if (!pts.length) return null
                const best = Math.min(...pts.map(p => p.time_cs))
                const bestPoint = pts.find(p => p.time_cs === best)
                const latest = pts[pts.length - 1]
                const first = pts[0]
                const diff = first.time_cs - latest.time_cs
                const improved = diff > 0
                return (
                  <tr key={line.event_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${color.bg}`} />
                        <span className="font-semibold text-gray-800">{line.event_name}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-mono font-bold" style={{ color: color.line }}>{formatTimeShort(best)}</td>
                    <td className="py-2 pr-3 font-mono text-gray-600">{formatTimeShort(latest.time_cs)}</td>
                    <td className="py-2 pr-3">
                      {pts.length > 1 && (
                        <span className={`font-mono font-bold ${improved ? 'text-emerald-600' : 'text-red-500'}`}>
                          {improved ? '\u2193' : '\u2191'} {formatTimeShort(Math.abs(diff))}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-gray-500 truncate max-w-[200px]">{bestPoint?.meet}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

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
        <CombinedProgressionChart lines={lines} />
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

/* ───────── Rankings Tab ───────── */
function RankingsTab({ swimmerId }) {
  const [rankings, setRankings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState([])

  useEffect(() => {
    Promise.all([
      getSwimmerRankings(swimmerId),
      getSwimmerEvents(swimmerId),
    ]).then(([rankRes, evRes]) => {
      setRankings(rankRes.data)
      setEvents(evRes.data)
    }).finally(() => setLoading(false))
  }, [swimmerId])

  if (loading) return (
    <div className="py-16 text-center"><div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin mx-auto" /></div>
  )
  if (!rankings || rankings.length === 0) return (
    <div className="py-16 text-center text-gray-400 text-sm">No ranking data available</div>
  )

  // Build event name lookup from events list
  const eventMap = {}
  for (const e of events) {
    eventMap[`${e.event_id}-${e.pool}`] = e.event_name
  }

  // Determine which scopes are present
  const scopes = []
  for (const r of rankings) {
    for (const s of Object.keys(r.rankings)) {
      if (!scopes.includes(s)) scopes.push(s)
    }
  }
  const scopeOrder = ['national', 'gcc', 'arab']
  scopes.sort((a, b) => scopeOrder.indexOf(a) - scopeOrder.indexOf(b))

  const scopeLabel = { national: 'National', gcc: 'GCC', arab: 'Arab' }
  const scopeColor = { national: 'text-purple-700 bg-purple-50', gcc: 'text-sky-700 bg-sky-50', arab: 'text-emerald-700 bg-emerald-50' }

  // Sort: by pool (LCM first), then by event name
  const sorted = [...rankings].sort((a, b) => {
    if (a.pool !== b.pool) return a.pool === 'LCM' ? -1 : 1
    const nameA = eventMap[`${a.event_id}-${a.pool}`] || ''
    const nameB = eventMap[`${b.event_id}-${b.pool}`] || ''
    return nameA.localeCompare(nameB)
  })

  // Group by pool
  const lcm = sorted.filter(r => r.pool === 'LCM')
  const scm = sorted.filter(r => r.pool !== 'LCM')

  const renderTable = (rows, poolLabel) => {
    if (rows.length === 0) return null
    return (
      <div className="mb-6">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-4 py-2">{poolLabel}</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80">
                <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Event</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Best Time</th>
                {scopes.map(s => (
                  <th key={s} className="px-3 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">{scopeLabel[s]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.event_id}-${r.pool}`} className="border-b border-gray-50 hover:bg-sky-50/30 animate-fade-in-up" style={{ animationDelay: `${i * 0.03}s` }}>
                  <td className="px-3 py-2.5 font-medium text-gray-800">{eventMap[`${r.event_id}-${r.pool}`] || `Event ${r.event_id}`}</td>
                  <td className="px-3 py-2.5 font-mono font-bold text-sky-600">{r.best_time}</td>
                  {scopes.map(s => {
                    const rank = r.rankings[s]
                    if (!rank) return <td key={s} className="px-3 py-2.5 text-center text-gray-300">-</td>
                    const isTop3 = rank.rank <= 3
                    return (
                      <td key={s} className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-0.5 font-bold ${isTop3 ? 'text-amber-600' : 'text-gray-700'}`}>
                          {isTop3 && <span className="text-amber-500">{rank.rank === 1 ? '\u{1F947}' : rank.rank === 2 ? '\u{1F948}' : '\u{1F949}'}</span>}
                          <span className="tabular-nums">{rank.rank}</span>
                          <span className="text-gray-400 font-normal">/{rank.total}</span>
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="p-4 border-b bg-gradient-to-r from-gray-50 to-white">
        <h3 className="font-bold text-base text-gray-800">Rankings</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">Based on personal best times across all competitions</p>
      </div>
      {renderTable(lcm, 'Long Course (LCM)')}
      {renderTable(scm, 'Short Course (SCM)')}
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
        {activeTab === 'medals' && <MedalsTab stats={stats} navigate={navigate} />}
        {activeTab === 'rankings' && <RankingsTab swimmerId={parseInt(id)} />}
        {activeTab === 'records' && <RecordsTab swimmerId={parseInt(id)} />}
        {activeTab === 'progression' && <ProgressionTab swimmerId={parseInt(id)} />}
        {activeTab === 'stats' && <StatsTab stats={stats} events={events} />}
        {activeTab === 'transfers' && <TransferHistoryTab swimmerId={parseInt(id)} />}
        {activeTab === 'gallery' && <GalleryTab swimmerId={parseInt(id)} />}
      </div>
    </div>
  )
}
