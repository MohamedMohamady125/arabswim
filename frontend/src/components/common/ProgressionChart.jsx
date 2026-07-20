import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

const COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#f97316']

function formatTime(cs) {
  if (!cs) return ''
  const minutes = Math.floor(cs / 6000)
  const seconds = Math.floor((cs % 6000) / 100)
  const centis = cs % 100
  if (minutes) return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  return `${seconds}.${String(centis).padStart(2, '0')}`
}

function ChartTooltip({ active, payload, label, showSwimmer }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-lg border shadow-lg px-4 py-3 text-sm">
      <div className="font-semibold text-gray-800 mb-2">{label}</div>
      {payload.map((entry, i) => {
        const meta = entry.payload?.[`_meta_${entry.dataKey}`]
        return (
          <div key={i} className="py-1 border-t border-gray-100 first:border-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-600 text-xs">{entry.name}</span>
              <span className="font-mono font-bold ml-auto" style={{ color: entry.color }}>
                {formatTime(entry.value)}
              </span>
            </div>
            {meta?.meet && <div className="text-[11px] text-gray-400 ml-[18px] truncate max-w-[200px]">{meta.meet}</div>}
            {showSwimmer && meta?.swimmer && <div className="text-[11px] text-gray-400 ml-[18px]">{meta.swimmer}{meta.fina ? ` · ${meta.fina} FINA` : ''}</div>}
            {!showSwimmer && meta?.fina > 0 && <div className="text-[11px] text-gray-400 ml-[18px]">{meta.fina} FINA</div>}
          </div>
        )
      })}
    </div>
  )
}

export default function ProgressionChart({ lines = [], title, showSwimmer = false }) {
  const [hiddenLines, setHiddenLines] = useState(new Set())

  if (!lines.length) {
    return (
      <div className="bg-white rounded-xl border p-12 text-center">
        <svg className="w-14 h-14 mx-auto mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        </svg>
        <p className="text-gray-400 font-medium">No progression data</p>
      </div>
    )
  }

  // Build chart data: each row is a point index, each line contributes its column
  const maxPoints = Math.max(...lines.map(l => l.points.length))
  const chartData = []
  for (let i = 0; i < maxPoints; i++) {
    const row = { index: i }
    let dateLabel = ''
    for (const line of lines) {
      const pt = line.points[i]
      if (pt) {
        row[line.event_name] = pt.time_cs
        row[`_meta_${line.event_name}`] = { meet: pt.meet, swimmer: pt.swimmer, fina: pt.fina }
        if (!dateLabel) dateLabel = pt.date
      }
    }
    row.label = dateLabel
      ? new Date(dateLabel).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      : `#${i + 1}`
    chartData.push(row)
  }

  // Y-axis domain from visible lines
  const visibleLines = lines.filter(l => !hiddenLines.has(l.event_name))
  const allCs = visibleLines.flatMap(l => l.points.map(p => p.time_cs)).filter(Boolean)
  const minCs = allCs.length ? Math.min(...allCs) : 0
  const maxCs = allCs.length ? Math.max(...allCs) : 100
  const padding = Math.max(Math.round((maxCs - minCs) * 0.1), 50)

  const toggleLine = (name) => {
    setHiddenLines(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {title && (
        <div className="px-5 py-4 border-b">
          <h3 className="font-bold text-sm text-gray-800">{title}</h3>
        </div>
      )}

      <div className="p-5">
        {/* Legend */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-5">
          {lines.map((line, i) => {
            const color = COLORS[i % COLORS.length]
            const hidden = hiddenLines.has(line.event_name)
            const best = Math.min(...line.points.map(p => p.time_cs))
            return (
              <button key={line.event_name} onClick={() => toggleLine(line.event_name)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  hidden ? 'bg-gray-50 text-gray-400 border-gray-200 opacity-50' : 'bg-white border-gray-200 text-gray-700 shadow-sm'
                }`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: hidden ? '#d1d5db' : color }} />
                <span>{line.event_name}</span>
                <span className="font-mono text-[11px] font-bold" style={{ color: hidden ? '#9ca3af' : color }}>{formatTime(best)}</span>
              </button>
            )
          })}
        </div>

        {/* Chart */}
        <div className="h-[260px] sm:h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={false}
              />
              <YAxis
                domain={[Math.max(0, minCs - padding), maxCs + padding]}
                tickFormatter={formatTime}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                reversed
                width={65}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip showSwimmer={showSwimmer} />} />
              {lines.map((line, i) => (
                <Line
                  key={line.event_name}
                  type="monotone"
                  dataKey={line.event_name}
                  name={line.event_name}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2.5}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                  hide={hiddenLines.has(line.event_name)}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
