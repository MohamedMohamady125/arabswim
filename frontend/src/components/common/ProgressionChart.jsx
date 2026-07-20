import { useState } from 'react'

const EVENT_COLORS = [
  { line: '#0ea5e9', bg: 'bg-sky-50', border: 'border-sky-200', badge: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
  { line: '#8b5cf6', bg: 'bg-violet-50', border: 'border-violet-200', badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  { line: '#10b981', bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  { line: '#f59e0b', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  { line: '#ef4444', bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  { line: '#ec4899', bg: 'bg-pink-50', border: 'border-pink-200', badge: 'bg-pink-100 text-pink-700', dot: 'bg-pink-500' },
  { line: '#06b6d4', bg: 'bg-cyan-50', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-700', dot: 'bg-cyan-500' },
  { line: '#f97316', bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
]

function formatTime(cs) {
  if (!cs) return ''
  const minutes = Math.floor(cs / 6000)
  const seconds = Math.floor((cs % 6000) / 100)
  const centis = cs % 100
  if (minutes) return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  return `${seconds}.${String(centis).padStart(2, '0')}`
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

/* ── Mini SVG line chart for a single event ── */
function MiniChart({ points, color }) {
  if (points.length < 2) return null

  const times = points.map(p => p.time_cs)
  const minT = Math.min(...times)
  const maxT = Math.max(...times)
  const range = maxT - minT || 1

  const W = 100
  const H = 40
  const padX = 4
  const padY = 4
  const usableW = W - padX * 2
  const usableH = H - padY * 2

  const pts = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * usableW
    // Inverted: lower time = higher on chart (better)
    const y = padY + ((p.time_cs - minT) / range) * usableH
    return { x, y }
  })

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  // Area fill
  const areaD = pathD + ` L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color.replace('#', '')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#fff" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

/* ── Single event progression card ── */
function EventCard({ line, colorSet, showSwimmer, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const points = line.points
  if (!points.length) return null

  const best = Math.min(...points.map(p => p.time_cs))
  const latest = points[points.length - 1]
  const first = points[0]

  // Improvement: negative means got faster (better)
  const improvement = first.time_cs - latest.time_cs
  const improved = improvement > 0
  const bestFina = Math.max(...points.map(p => p.fina || 0))

  return (
    <div className={`rounded-2xl border ${colorSet.border} overflow-hidden transition-all duration-300`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full px-5 py-4 flex items-center gap-4 ${colorSet.bg} hover:brightness-95 transition-all`}
      >
        {/* Event name + badge */}
        <div className="flex-1 text-left">
          <div className="font-bold text-gray-900 text-base">{line.event_name}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">{points.length} result{points.length !== 1 ? 's' : ''}</span>
            {bestFina > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colorSet.badge}`}>{bestFina} FINA</span>
            )}
          </div>
        </div>

        {/* Mini chart */}
        {points.length >= 2 && (
          <div className="w-28 h-10 shrink-0">
            <MiniChart points={points} color={colorSet.line} />
          </div>
        )}

        {/* Best time */}
        <div className="text-right shrink-0">
          <div className="font-mono text-lg font-black text-gray-900">{formatTime(best)}</div>
          {points.length >= 2 && (
            <div className={`text-xs font-semibold ${improved ? 'text-emerald-600' : improvement < 0 ? 'text-red-500' : 'text-gray-400'}`}>
              {improved ? '↓ ' : improvement < 0 ? '↑ ' : ''}{formatTime(Math.abs(improvement))}
            </div>
          )}
        </div>

        {/* Expand icon */}
        <svg className={`w-5 h-5 text-gray-400 shrink-0 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Expanded: detailed results table */}
      {expanded && (
        <div className="border-t">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-2.5 text-left">#</th>
                <th className="px-5 py-2.5 text-left">Date</th>
                {showSwimmer && <th className="px-5 py-2.5 text-left">Swimmer</th>}
                <th className="px-5 py-2.5 text-left">Competition</th>
                <th className="px-5 py-2.5 text-right">Time</th>
                <th className="px-5 py-2.5 text-right">FINA</th>
                <th className="px-5 py-2.5 text-right">Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {points.map((pt, i) => {
                const isBest = pt.time_cs === best
                const prevTime = i > 0 ? points[i - 1].time_cs : null
                const diff = prevTime ? pt.time_cs - prevTime : null
                return (
                  <tr key={i} className={`text-sm transition-colors ${isBest ? 'bg-amber-50/50' : 'hover:bg-gray-50'}`}>
                    <td className="px-5 py-3 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{formatDate(pt.date)}</td>
                    {showSwimmer && <td className="px-5 py-3 text-gray-800 font-medium">{pt.swimmer}</td>}
                    <td className="px-5 py-3 text-gray-600 truncate max-w-[200px]" title={pt.meet}>{pt.meet}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-mono font-bold ${isBest ? 'text-amber-600' : 'text-gray-900'}`}>
                        {pt.time}
                      </span>
                      {isBest && <span className="ml-1.5 text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">PB</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500">{pt.fina || '-'}</td>
                    <td className="px-5 py-3 text-right">
                      {diff !== null ? (
                        <span className={`text-xs font-semibold ${diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {diff < 0 ? '↓' : diff > 0 ? '↑' : '='} {formatTime(Math.abs(diff))}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * ProgressionChart - Shows time progression per event
 *
 * @param {Array} lines - Array of { event_name, points: [{ date, time, time_cs, meet, swimmer?, fina }] }
 * @param {string} title - Optional title
 * @param {boolean} showSwimmer - Whether to show swimmer name column
 */
export default function ProgressionChart({ lines = [], title, showSwimmer = false }) {
  if (!lines.length) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-12 text-center">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        </svg>
        <p className="text-gray-400 font-medium">No progression data available</p>
        <p className="text-gray-300 text-sm mt-1">Times will appear here as results are recorded</p>
      </div>
    )
  }

  // Summary stats
  const totalResults = lines.reduce((sum, l) => sum + l.points.length, 0)
  const allFina = lines.flatMap(l => l.points.map(p => p.fina)).filter(Boolean)
  const peakFina = allFina.length ? Math.max(...allFina) : 0

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border px-4 py-3 text-center">
          <div className="text-2xl font-black text-gray-900">{lines.length}</div>
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Events</div>
        </div>
        <div className="bg-white rounded-xl border px-4 py-3 text-center">
          <div className="text-2xl font-black text-gray-900">{totalResults}</div>
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Results</div>
        </div>
        <div className="bg-white rounded-xl border px-4 py-3 text-center">
          <div className="text-2xl font-black text-gray-900">{peakFina || '-'}</div>
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Peak FINA</div>
        </div>
      </div>

      {/* Event cards */}
      {lines.map((line, i) => (
        <EventCard
          key={line.event_id || line.event_name}
          line={line}
          colorSet={EVENT_COLORS[i % EVENT_COLORS.length]}
          showSwimmer={showSwimmer}
          defaultExpanded={i === 0}
        />
      ))}
    </div>
  )
}
