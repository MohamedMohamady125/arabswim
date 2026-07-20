import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
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

function formatDateShort(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function formatDateFull(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ── Tooltip ── */
function ChartTooltip({ active, payload, showSwimmer }) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload
  if (!data) return null
  return (
    <div className="bg-white rounded-lg border shadow-lg px-4 py-3 text-sm min-w-[200px]">
      <div className="font-semibold text-gray-800 mb-2">{formatDateFull(data.date)}</div>
      <div className="space-y-1.5">
        {payload.map((entry, i) => {
          const meta = data[`_meta_${entry.dataKey}`]
          return (
            <div key={i}>
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono font-bold text-base" style={{ color: entry.color }}>
                  {formatTime(entry.value)}
                </span>
                {meta?.fina > 0 && <span className="text-xs text-gray-400">{meta.fina} FINA</span>}
              </div>
              {meta?.meet && <div className="text-xs text-gray-500 truncate max-w-[220px]">{meta.meet}</div>}
              {showSwimmer && meta?.swimmer && <div className="text-xs text-gray-400">{meta.swimmer}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Single event chart ── */
function EventChart({ line, color, showSwimmer }) {
  const points = line.points
  if (!points.length) return null

  const best = Math.min(...points.map(p => p.time_cs))
  const worst = Math.max(...points.map(p => p.time_cs))
  const range = worst - best || 100
  const padding = Math.max(Math.round(range * 0.15), 30)
  const bestFina = Math.max(...points.map(p => p.fina || 0))

  const chartData = points.map(pt => ({
    date: pt.date,
    label: formatDateShort(pt.date),
    time: pt.time_cs,
    [`_meta_time`]: { meet: pt.meet, swimmer: pt.swimmer, fina: pt.fina },
  }))

  const latest = points[points.length - 1]
  const first = points[0]
  const diff = first.time_cs - latest.time_cs
  const improved = diff > 0

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b flex items-center gap-3">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <h4 className="font-bold text-sm text-gray-900 flex-1">{line.event_name}</h4>
        {bestFina > 0 && <span className="text-xs text-gray-400">{bestFina} FINA</span>}
        <div className="text-right">
          <span className="font-mono font-bold text-sm text-gray-900">{formatTime(best)}</span>
          {points.length >= 2 && (
            <span className={`ml-2 text-xs font-semibold ${improved ? 'text-emerald-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
              {improved ? '-' : diff < 0 ? '+' : ''}{formatTime(Math.abs(diff))}
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="px-3 py-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 15, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
            />
            <YAxis
              domain={[Math.max(0, best - padding), worst + padding]}
              tickFormatter={formatTime}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              reversed
              width={60}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip showSwimmer={showSwimmer} />} />
            <ReferenceLine
              y={best}
              stroke={color}
              strokeDasharray="4 4"
              strokeOpacity={0.4}
            />
            <Line
              type="monotone"
              dataKey="time"
              stroke={color}
              strokeWidth={2.5}
              dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: color }}
              activeDot={{ r: 6, strokeWidth: 2, fill: color, stroke: '#fff' }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * ProgressionChart
 *
 * @param {Array} lines - Array of { event_name, points: [{ date, time, time_cs, meet, swimmer?, fina }] }
 * @param {string} title - Optional title
 * @param {boolean} showSwimmer - Show swimmer name in tooltip
 */
export default function ProgressionChart({ lines = [], title, showSwimmer = false }) {
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

  return (
    <div className="space-y-4">
      {lines.map((line, i) => (
        <EventChart
          key={line.event_id || line.event_name}
          line={line}
          color={COLORS[i % COLORS.length]}
          showSwimmer={showSwimmer}
        />
      ))}
    </div>
  )
}
