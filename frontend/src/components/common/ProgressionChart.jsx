import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'

const LINE_COLORS = [
  '#0ea5e9', // sky-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
]

function formatTime(cs) {
  if (!cs) return ''
  const minutes = Math.floor(cs / 6000)
  const seconds = Math.floor((cs % 6000) / 100)
  const centis = cs % 100
  if (minutes) return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  return `${seconds}.${String(centis).padStart(2, '0')}`
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl border shadow-lg px-4 py-3 text-sm max-w-xs">
      <div className="font-bold text-gray-800 mb-1.5">{label}</div>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600 truncate">{entry.name}</span>
          <span className="font-mono font-bold ml-auto" style={{ color: entry.color }}>
            {formatTime(entry.value)}
          </span>
        </div>
      ))}
      {payload[0]?.payload?.meta && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100 text-[11px] text-gray-400">
          {payload[0].payload.meta}
        </div>
      )}
    </div>
  )
}

/**
 * ProgressionChart - Reusable time progression chart
 *
 * @param {Array} lines - Array of { event_name, points: [{ date, time, time_cs, meet, swimmer?, fina }] }
 * @param {string} title - Chart title
 * @param {boolean} showSwimmer - Whether to show swimmer name in tooltip
 */
export default function ProgressionChart({ lines = [], title, showSwimmer = false }) {
  const [hiddenLines, setHiddenLines] = useState(new Set())

  if (!lines.length) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-12 text-center animate-fade-in">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <p className="text-gray-400 font-medium">No progression data available</p>
        <p className="text-gray-300 text-sm mt-1">Times will appear here as results are recorded</p>
      </div>
    )
  }

  // Build unified data: each row is a "point index" (0..4 for last 5 times)
  // Each line contributes its own column keyed by event_name
  const maxPoints = Math.max(...lines.map(l => l.points.length))
  const chartData = []

  for (let i = 0; i < maxPoints; i++) {
    const row = { index: i }
    // Use date label from the first line that has this point
    let dateLabel = ''
    let meta = []

    for (const line of lines) {
      const pt = line.points[i]
      if (pt) {
        row[line.event_name] = pt.time_cs
        if (!dateLabel) dateLabel = pt.date
        meta.push(`${line.event_name}: ${pt.meet}${showSwimmer && pt.swimmer ? ` (${pt.swimmer})` : ''}`)
      }
    }

    row.label = dateLabel ? new Date(dateLabel).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : `#${i + 1}`
    row.meta = meta.join(' | ')
    chartData.push(row)
  }

  // Compute Y-axis domain: find min/max across all visible lines
  const visibleLines = lines.filter(l => !hiddenLines.has(l.event_name))
  const allCs = visibleLines.flatMap(l => l.points.map(p => p.time_cs)).filter(Boolean)
  const minCs = allCs.length ? Math.min(...allCs) : 0
  const maxCs = allCs.length ? Math.max(...allCs) : 100
  const padding = Math.max(Math.round((maxCs - minCs) * 0.1), 50)

  const toggleLine = (eventName) => {
    setHiddenLines(prev => {
      const next = new Set(prev)
      next.has(eventName) ? next.delete(eventName) : next.add(eventName)
      return next
    })
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden animate-fade-in-up">
      {title && (
        <div className="p-5 pb-3 border-b bg-gradient-to-r from-gray-50 to-white">
          <h3 className="font-bold text-base text-gray-800">{title}</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Time progression across competitions</p>
        </div>
      )}

      <div className="p-5">
        {/* Legend / toggles */}
        <div className="flex flex-wrap gap-2 mb-4">
          {lines.map((line, i) => {
            const color = LINE_COLORS[i % LINE_COLORS.length]
            const hidden = hiddenLines.has(line.event_name)
            return (
              <button key={line.event_name}
                onClick={() => toggleLine(line.event_name)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border ${
                  hidden ? 'bg-gray-50 text-gray-400 border-gray-200' : 'shadow-sm border-transparent'
                }`}
                style={hidden ? {} : { backgroundColor: color + '15', color, borderColor: color + '40' }}>
                <span className={`w-2.5 h-2.5 rounded-full transition-opacity ${hidden ? 'opacity-30' : ''}`}
                  style={{ backgroundColor: color }} />
                {line.event_name}
              </button>
            )
          })}
        </div>

        {/* Chart */}
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis
                domain={[Math.max(0, minCs - padding), maxCs + padding]}
                tickFormatter={formatTime}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                reversed
                width={65}
              />
              <Tooltip content={<CustomTooltip />} />
              {lines.map((line, i) => (
                <Line
                  key={line.event_name}
                  type="monotone"
                  dataKey={line.event_name}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2.5}
                  dot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 7, strokeWidth: 2 }}
                  hide={hiddenLines.has(line.event_name)}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Summary cards beneath chart */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
          {visibleLines.map((line, i) => {
            const best = Math.min(...line.points.map(p => p.time_cs))
            const latest = line.points[line.points.length - 1]
            const color = LINE_COLORS[i % LINE_COLORS.length]
            return (
              <div key={line.event_name} className="rounded-xl border p-3 text-center"
                style={{ borderColor: color + '30', backgroundColor: color + '08' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color }}>{line.event_name}</div>
                <div className="font-mono text-sm font-black mt-1 text-gray-800">{formatTime(best)}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">Best</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
