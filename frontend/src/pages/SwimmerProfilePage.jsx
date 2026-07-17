import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { getSwimmer, getSwimmerEvents, getSwimmerEventHistory, getSwimmerProfileStats } from '../api/swimmers'
import CountryFlag from '../components/common/CountryFlag'

const MEDAL_COLORS = { GOLD: '#FFD700', SILVER: '#C0C0C0', BRONZE: '#CD7F32' }
const MEDAL_LABELS = { GOLD: 'Gold', SILVER: 'Silver', BRONZE: 'Bronze' }

function PersonalBestsTable({ events, onEventClick, selectedEvent }) {
  const lcm = events.filter(e => e.pool === 'LCM' && !e.is_relay)
  const scm = events.filter(e => e.pool === 'SCM' && !e.is_relay)
  const relays = events.filter(e => e.is_relay)

  const renderTable = (rows, label, poolTag) => {
    if (!rows.length) return null
    return (
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
            poolTag === 'LCM' ? 'bg-sky-100 text-sky-700' : poolTag === 'SCM' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
          }`}>{label}</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Event</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Best Time</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Swims</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(e => {
              const isSelected = selectedEvent?.event_id === e.event_id && selectedEvent?.pool === e.pool
              return (
                <tr key={`${e.event_id}-${e.pool}`}
                  onClick={() => onEventClick(e)}
                  className={`cursor-pointer transition-colors ${isSelected ? 'bg-sky-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-3 py-2.5 text-sm font-medium">{e.event_name}</td>
                  <td className="px-3 py-2.5 text-sm font-mono text-sky-700 font-semibold">{e.best_time}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-500">{e.times_count}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-4 border-b">
        <h3 className="font-bold text-base">Personal Best Times</h3>
        <p className="text-xs text-gray-500 mt-0.5">Click an event to view full history</p>
      </div>
      <div className="p-3">
        {renderTable(lcm, 'Long Course (LCM)', 'LCM')}
        {renderTable(scm, 'Short Course (SCM)', 'SCM')}
        {renderTable(relays, 'Relay Events', 'RELAY')}
        {events.length === 0 && (
          <div className="py-8 text-center text-gray-400 text-sm">No competition results yet</div>
        )}
      </div>
    </div>
  )
}

function TimeHistoryPanel({ selectedEvent, history, loadingHistory, navigate }) {
  if (!selectedEvent) {
    return (
      <div className="bg-white rounded-xl border shadow-sm flex items-center justify-center min-h-[300px]">
        <div className="text-center text-gray-400">
          <div className="text-4xl mb-2">&#x23F1;</div>
          <p className="text-sm">Select an event to view time history</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-4 border-b">
        <h3 className="font-bold text-base">
          {selectedEvent.event_name}
          {selectedEvent.pool && (
            <span className={`ml-2 text-xs px-2 py-0.5 rounded font-semibold ${
              selectedEvent.pool === 'SCM' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
            }`}>{selectedEvent.pool}</span>
          )}
          {selectedEvent.is_relay && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Relay</span>}
        </h3>
      </div>
      {loadingHistory ? (
        <div className="p-8 text-center text-gray-400">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                {['#', 'Age', 'Time', 'Round', 'Team', 'Championship', 'Date', 'FINA'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.map((h, i) => {
                const isBest = h.time_centiseconds === Math.min(...history.map(x => x.time_centiseconds))
                return (
                  <tr key={h.id} className={`hover:bg-gray-50 ${isBest ? 'bg-green-50' : ''}`}>
                    <td className="px-3 py-2 text-sm text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 text-sm text-gray-500">{h.age_at_competition || '-'}</td>
                    <td className="px-3 py-2 text-sm font-mono font-semibold">
                      {h.time}
                      {h.is_relay && h.split_time && <span className="ml-1.5 text-xs text-purple-600 font-normal">({h.split_time})</span>}
                      {!h.is_relay && isBest && <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-normal">PB</span>}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {h.round_type ? (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${h.round_type === 'Finals' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {h.round_type}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">{h.team || '-'}</td>
                    <td className="px-3 py-2 text-sm">
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/meets/${h.championship_id}`) }}
                        className="text-sky-600 hover:text-sky-800 hover:underline text-left">
                        {h.championship_name}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">{h.championship_date}</td>
                    <td className="px-3 py-2 text-sm font-mono">{h.fina_points || '-'}</td>
                  </tr>
                )
              })}
              {history.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No times recorded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MedalBar({ gold, silver, bronze }) {
  const total = gold + silver + bronze
  if (!total) return <div className="h-5 bg-gray-100 rounded-full w-full" />
  return (
    <div className="flex h-5 rounded-full overflow-hidden w-full" style={{ minWidth: 80 }}>
      {gold > 0 && <div style={{ width: `${(gold / total) * 100}%`, backgroundColor: MEDAL_COLORS.GOLD }} />}
      {silver > 0 && <div style={{ width: `${(silver / total) * 100}%`, backgroundColor: MEDAL_COLORS.SILVER }} />}
      {bronze > 0 && <div style={{ width: `${(bronze / total) * 100}%`, backgroundColor: MEDAL_COLORS.BRONZE }} />}
    </div>
  )
}

function MedalBadge({ type }) {
  const style = type === 'GOLD' ? 'bg-amber-100 text-amber-800' : type === 'SILVER' ? 'bg-gray-200 text-gray-700' : 'bg-orange-100 text-orange-800'
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${style}`}>{MEDAL_LABELS[type]}</span>
}

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

function MedalRow({ medal, navigate }) {
  return (
    <div className="flex items-center gap-2.5 py-2 px-3 hover:bg-gray-50 rounded-lg">
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0"
        style={{ backgroundColor: MEDAL_COLORS[medal.medal_type] + '30', color: medal.medal_type === 'GOLD' ? '#B8860B' : medal.medal_type === 'SILVER' ? '#666' : '#CD7F32' }}>
        {medal.medal_type === 'GOLD' ? '1' : medal.medal_type === 'SILVER' ? '2' : '3'}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{medal.event_name}</span>
        <button onClick={() => navigate(`/meets/${medal.championship_id}`)}
          className="text-xs text-sky-600 hover:underline block truncate">
          {medal.championship_name} ({new Date(medal.championship_date).getFullYear()})
        </button>
      </div>
      <MedalBadge type={medal.medal_type} />
    </div>
  )
}

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

  return (
    <div className="space-y-6">
      {/* Medal Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { type: 'GOLD', count: medals.gold, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
          { type: 'SILVER', count: medals.silver, bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600' },
          { type: 'BRONZE', count: medals.bronze, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
          { type: 'TOTAL', count: medals.total, bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700' },
        ].map(m => (
          <div key={m.type} className={`${m.bg} ${m.border} border rounded-xl p-4 text-center`}>
            <div className={`text-3xl font-black ${m.text}`}>{m.count}</div>
            <div className="text-xs font-semibold text-gray-500 mt-1">{m.type === 'TOTAL' ? 'Total' : MEDAL_LABELS[m.type]}</div>
          </div>
        ))}
      </div>

      {/* Medal Analytics Bar Chart */}
      {medals_by_level.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="font-bold text-base mb-4">Medal Analytics by Level</h3>
          <div className="space-y-3">
            {medals_by_level.map((level, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-28 text-sm font-medium text-gray-700 shrink-0">{level.category}</div>
                <div className="flex-1">
                  <MedalBar gold={level.gold} silver={level.silver} bronze={level.bronze} />
                </div>
                <MedalCounts gold={level.gold} silver={level.silver} bronze={level.bronze} size="lg" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Medals by Classification Hierarchy */}
      {(medals_hierarchy || []).length > 0 && (
        <div className="space-y-3">
          {medals_hierarchy.map(cat => (
            <div key={cat.name} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              {/* Category Header */}
              <button onClick={() => toggle(expandedCats, setExpandedCats, cat.name)}
                className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors">
                <span className={`text-xs transition-transform ${expandedCats.has(cat.name) ? 'rotate-90' : ''}`}>&#9654;</span>
                <div className="flex-1 text-left">
                  <h3 className="font-bold text-base">{cat.name}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {cat.gold > 0 && <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: '#FFD70030', color: '#B8860B' }}>{cat.gold}</span>}
                    {cat.silver > 0 && <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: '#C0C0C030', color: '#666' }}>{cat.silver}</span>}
                    {cat.bronze > 0 && <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: '#CD7F3230', color: '#CD7F32' }}>{cat.bronze}</span>}
                  </div>
                </div>
              </button>

              {expandedCats.has(cat.name) && (
                <div className="border-t">
                  {cat.classifications.map(cls => {
                    const clsKey = `${cat.name}/${cls.name}`
                    return (
                      <div key={cls.name}>
                        {/* Classification Header */}
                        <button onClick={() => toggle(expandedCls, setExpandedCls, clsKey)}
                          className="w-full flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100">
                          <span className={`text-[10px] text-gray-400 transition-transform ${expandedCls.has(clsKey) ? 'rotate-90' : ''}`}>&#9654;</span>
                          <div className="flex-1 text-left">
                            <span className="text-sm font-semibold text-gray-700">{cls.name}</span>
                          </div>
                          <MedalCounts gold={cls.gold} silver={cls.silver} bronze={cls.bronze} size="lg" />
                        </button>

                        {expandedCls.has(clsKey) && (
                          <div className="bg-gray-50/50">
                            {/* Sub-classifications */}
                            {cls.sub_classifications.map(sub => {
                              const subKey = `${clsKey}/${sub.name}`
                              return (
                                <div key={sub.name}>
                                  <button onClick={() => toggle(expandedSubs, setExpandedSubs, subKey)}
                                    className="w-full flex items-center gap-3 px-10 py-2.5 hover:bg-gray-100 transition-colors">
                                    <span className={`text-[9px] text-gray-400 transition-transform ${expandedSubs.has(subKey) ? 'rotate-90' : ''}`}>&#9654;</span>
                                    <span className="flex-1 text-left text-sm text-gray-600">{sub.name}</span>
                                    <MedalCounts gold={sub.gold} silver={sub.silver} bronze={sub.bronze} />
                                  </button>
                                  {expandedSubs.has(subKey) && (
                                    <div className="pl-12 pr-4 pb-2">
                                      {sub.medals.map(m => <MedalRow key={m.id} medal={m} navigate={navigate} />)}
                                    </div>
                                  )}
                                </div>
                              )
                            })}

                            {/* Medals directly under classification (no sub-classification) */}
                            {cls.medals.length > 0 && (
                              <div className="pl-8 pr-4 py-2">
                                {cls.medals.map(m => <MedalRow key={m.id} medal={m} navigate={navigate} />)}
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

      {medals.total === 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-gray-400">No medals recorded</div>
      )}
    </div>
  )
}

function PerformanceIndex({ finaDistribution, bestFina }) {
  if (!finaDistribution || finaDistribution.length === 0) return null
  const maxCount = Math.max(...finaDistribution.map(d => d.count))

  const TIER_COLORS = {
    900: { bar: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Elite' },
    800: { bar: 'bg-sky-500', bg: 'bg-sky-50', text: 'text-sky-700', label: 'World Class' },
    700: { bar: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', label: 'Excellent' },
    600: { bar: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700', label: 'Very Good' },
    500: { bar: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', label: 'Good' },
    400: { bar: 'bg-orange-400', bg: 'bg-orange-50', text: 'text-orange-700', label: 'Developing' },
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-base">Performance Index</h3>
          <p className="text-xs text-gray-500 mt-0.5">FINA points distribution across all swims</p>
        </div>
        {bestFina && (
          <div className="text-right">
            <div className="text-3xl font-black text-sky-600">{bestFina.points}</div>
            <div className="text-[10px] text-gray-400 font-medium">PEAK FINA</div>
          </div>
        )}
      </div>
      <div className="space-y-2.5">
        {finaDistribution.map(tier => {
          const colors = TIER_COLORS[tier.threshold] || TIER_COLORS[400]
          const pct = maxCount > 0 ? (tier.count / maxCount) * 100 : 0
          return (
            <div key={tier.threshold} className="flex items-center gap-3">
              <div className={`w-12 text-right text-xs font-bold ${colors.text}`}>{tier.threshold}+</div>
              <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden relative">
                <div className={`${colors.bar} h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                  style={{ width: `${Math.max(pct, tier.count > 0 ? 8 : 0)}%` }}>
                  {tier.count > 0 && pct > 15 && (
                    <span className="text-white text-xs font-bold">{tier.count}</span>
                  )}
                </div>
                {tier.count > 0 && pct <= 15 && (
                  <span className="absolute left-[calc(8%+4px)] top-1/2 -translate-y-1/2 text-xs font-bold text-gray-600">{tier.count}</span>
                )}
              </div>
              <div className={`w-20 text-[10px] font-medium ${colors.text} hidden md:block`}>{colors.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatsTab({ stats, events }) {
  if (!stats) return null
  const { medals, best_fina, best_event, total_championships, records, total_records, fina_distribution } = stats

  const totalEvents = new Set(events.map(e => e.event_id)).size
  const totalSwims = events.reduce((sum, e) => sum + e.times_count, 0)

  return (
    <div className="space-y-6">
      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Championships', value: total_championships, icon: '🏊' },
          { label: 'Total Events', value: totalEvents, icon: '📋' },
          { label: 'Total Swims', value: totalSwims, icon: '⏱' },
          { label: 'Total Medals', value: medals.total, icon: '🏅' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border shadow-sm p-4">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-black text-gray-800">{s.value}</div>
            <div className="text-xs text-gray-500 font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Performance Index + Best FINA / Best Event */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PerformanceIndex finaDistribution={fina_distribution} bestFina={best_fina} />
        <div className="space-y-4">
          {best_fina && (
            <div className="bg-gradient-to-br from-sky-50 to-white rounded-xl border border-sky-200 p-5">
              <div className="text-xs font-semibold text-sky-600 uppercase tracking-wide mb-2">Best FINA Points</div>
              <div className="text-4xl font-black text-sky-700">{best_fina.points}</div>
              <div className="text-sm text-gray-600 mt-1">{best_fina.event_name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{best_fina.championship_name}</div>
            </div>
          )}
          {best_event && (
            <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl border border-amber-200 p-5">
              <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Best Event</div>
              <div className="text-2xl font-black text-amber-700">{best_event}</div>
              <div className="text-sm text-gray-500 mt-1">Highest FINA points across all events</div>
            </div>
          )}
        </div>
      </div>

      {/* Records Held */}
      {total_records > 0 && (
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="p-4 border-b">
            <h3 className="font-bold text-base">Records Held</h3>
          </div>
          <div className="divide-y">
            {records.map(r => (
              <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                  r.record_type === 'ARAB' ? 'bg-emerald-100 text-emerald-800' : r.record_type === 'GCC' ? 'bg-sky-100 text-sky-800' : 'bg-purple-100 text-purple-800'
                }`}>{r.record_type}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{r.event_name}</div>
                  <div className="text-xs text-gray-400">{r.location} &middot; {r.date}</div>
                </div>
                <div className="font-mono text-sm font-semibold text-sky-700">{r.time}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MeetsTab({ stats, navigate }) {
  if (!stats) return null
  const { championships } = stats

  // Group by year
  const byYear = {}
  championships.forEach(c => {
    const year = new Date(c.date).getFullYear()
    if (!byYear[year]) byYear[year] = []
    byYear[year].push(c)
  })
  const years = Object.keys(byYear).sort((a, b) => b - a)

  return (
    <div className="space-y-4">
      {years.map(year => (
        <div key={year} className="bg-white rounded-xl border shadow-sm">
          <div className="p-3 px-4 border-b bg-gray-50 rounded-t-xl">
            <h3 className="font-bold text-sm text-gray-700">{year} <span className="font-normal text-gray-400">({byYear[year].length} {byYear[year].length === 1 ? 'meet' : 'meets'})</span></h3>
          </div>
          <div className="divide-y">
            {byYear[year].map(c => (
              <button key={c.id} onClick={() => navigate(`/meets/${c.id}`)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <CountryFlag code={c.country_code} flagUrl={c.flag_url} name={c.country} />
                    <span className="text-xs text-gray-400">{c.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                    c.pool === 'SCM' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
                  }`}>{c.pool}</span>
                  {c.category && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{c.category}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {championships.length === 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-gray-400">No championship history</div>
      )}
    </div>
  )
}

const TABS = [
  { key: 'times', label: 'Times', icon: '⏱' },
  { key: 'meets', label: 'Meets', icon: '🏊' },
  { key: 'medals', label: 'Medals', icon: '🏅' },
  { key: 'stats', label: 'Stats', icon: '📊' },
]

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

  useEffect(() => {
    getSwimmer(id).then(res => setSwimmer(res.data)).catch(() => {})
    getSwimmerEvents(id).then(res => setEvents(res.data)).catch(() => {})
    getSwimmerProfileStats(id).then(res => setStats(res.data)).catch(() => {})
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

  if (!swimmer) return <div className="text-center py-12 text-gray-400">Loading...</div>

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back Button */}
      <button onClick={() => navigate('/swimmers')}
        className="text-gray-400 hover:text-gray-600 text-sm mb-4 inline-flex items-center gap-1">
        &larr; Back to Swimmers
      </button>

      {/* Hero Header */}
      <div className="bg-gradient-to-r from-sky-600 to-sky-800 rounded-2xl p-6 mb-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        <div className="relative flex items-start gap-6">
          {/* Photo */}
          <div className="w-28 h-28 rounded-2xl bg-white/20 flex items-center justify-center overflow-hidden shrink-0 border-2 border-white/30">
            {swimmer.photo ? (
              <img src={swimmer.photo} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl opacity-60">&#x1F464;</span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">{swimmer.name}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <CountryFlag code={swimmer.nationality_detail?.code} flagUrl={swimmer.nationality_detail?.flag_url} name={swimmer.nationality_detail?.name} />
              <span className="text-white/80 text-sm font-medium">{swimmer.nationality_detail?.name}</span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-white/70">
              {swimmer.date_of_birth ? (
                <span>DOB: <span className="text-white font-medium">{swimmer.date_of_birth}</span></span>
              ) : swimmer.birth_year ? (
                <span>Born: <span className="text-white font-medium">{swimmer.birth_year}</span></span>
              ) : null}
              {swimmer.age != null && <span>Age: <span className="text-white font-medium">{swimmer.age}</span></span>}
              {swimmer.sex && <span><span className="text-white font-medium">{swimmer.sex === 'M' ? 'Male' : 'Female'}</span></span>}
              {swimmer.club && <span>Club: <span className="text-white font-medium">{swimmer.club}</span></span>}
            </div>
            {swimmer.nicknames?.length > 0 && (
              <div className="flex gap-2 mt-2">
                {swimmer.nicknames.map((n, i) => (
                  <span key={i} className="bg-white/15 backdrop-blur px-2.5 py-0.5 rounded-full text-xs text-white/90">{n.nickname}</span>
                ))}
              </div>
            )}
          </div>

          {/* Quick Numbers */}
          {stats && (
            <div className="hidden md:flex gap-3 shrink-0">
              {stats.medals.total > 0 && (
                <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center">
                  <div className="text-2xl font-black">{stats.medals.total}</div>
                  <div className="text-[10px] text-white/70 font-medium">Medals</div>
                  <div className="flex gap-1 mt-1 justify-center text-[10px]">
                    {stats.medals.gold > 0 && <span className="text-amber-300">{stats.medals.gold}G</span>}
                    {stats.medals.silver > 0 && <span className="text-gray-300">{stats.medals.silver}S</span>}
                    {stats.medals.bronze > 0 && <span className="text-orange-300">{stats.medals.bronze}B</span>}
                  </div>
                </div>
              )}
              {stats.best_fina && (
                <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center">
                  <div className="text-2xl font-black">{stats.best_fina.points}</div>
                  <div className="text-[10px] text-white/70 font-medium">Best FINA</div>
                </div>
              )}
              {stats.total_records > 0 && (
                <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center">
                  <div className="text-2xl font-black">{stats.total_records}</div>
                  <div className="text-[10px] text-white/70 font-medium">Records</div>
                </div>
              )}
            </div>
          )}

          {/* Edit Button */}
          <button onClick={() => navigate(`/swimmers/${id}/edit`)}
            className="absolute top-0 right-0 bg-white/15 hover:bg-white/25 backdrop-blur text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
            Edit
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-sky-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'times' && (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          <PersonalBestsTable events={events} onEventClick={handleEventClick} selectedEvent={selectedEvent} />
          <TimeHistoryPanel selectedEvent={selectedEvent} history={history} loadingHistory={loadingHistory} navigate={navigate} />
        </div>
      )}

      {activeTab === 'meets' && <MeetsTab stats={stats} navigate={navigate} />}
      {activeTab === 'medals' && <MedalsTab stats={stats} navigate={navigate} />}
      {activeTab === 'stats' && <StatsTab stats={stats} events={events} />}
    </div>
  )
}
