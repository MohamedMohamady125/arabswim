import { useState } from 'react'

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

export default function ProgressionChart({ lines = [], title, showSwimmer = false }) {
  const [tooltip, setTooltip] = useState(null)

  if (!lines.length) {
    return (
      <div className="bg-white rounded-2xl border p-12 text-center">
        <svg className="w-14 h-14 mx-auto mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        </svg>
        <p className="text-gray-400 font-medium">No progression data</p>
      </div>
    )
  }

  // Collect all dates and compute global time range
  const allDates = new Set()
  lines.forEach(l => l.points.forEach(p => allDates.add(p.date)))
  const sortedDates = [...allDates].sort()

  let globalMin = Infinity, globalMax = -Infinity
  lines.forEach(l => l.points.forEach(p => {
    if (p.time_cs < globalMin) globalMin = p.time_cs
    if (p.time_cs > globalMax) globalMax = p.time_cs
  }))

  const range = globalMax - globalMin || 1
  const paddedMin = globalMin - range * 0.08
  const paddedMax = globalMax + range * 0.08

  const W = 800, H = 400, PL = 65, PR = 30, PT = 50, PB = 45
  const chartW = W - PL - PR
  const chartH = H - PT - PB

  const dateToX = (date) => {
    if (sortedDates.length === 1) return PL + chartW / 2
    const idx = sortedDates.indexOf(date)
    return PL + (idx / (sortedDates.length - 1)) * chartW
  }

  const timeToY = (cs) => PT + ((cs - paddedMin) / (paddedMax - paddedMin)) * chartH

  const tickCount = 6
  const yTicks = []
  for (let i = 0; i < tickCount; i++) {
    const cs = paddedMin + (i / (tickCount - 1)) * (paddedMax - paddedMin)
    yTicks.push(Math.round(cs))
  }

  const xLabels = sortedDates.length <= 10 ? sortedDates : sortedDates.filter((_, i) =>
    i === 0 || i === sortedDates.length - 1 || i % Math.ceil(sortedDates.length / 8) === 0
  )

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      {/* Title + Legend */}
      <div className="px-5 pt-4 pb-2">
        {title && <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wide mb-3">{title}</h4>}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {lines.map((line, i) => {
            const color = LINE_COLORS[i % LINE_COLORS.length]
            return (
              <div key={line.event_id || line.event_name} className="flex items-center gap-1.5">
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
          <rect x={PL} y={PT} width={chartW} height={chartH} fill="#f8fafc" rx="4" />

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

          <text x={15} y={PT + chartH / 2} textAnchor="middle" transform={`rotate(-90, 15, ${PT + chartH / 2})`}
            style={{ fontSize: '11px', fill: '#94a3b8', fontWeight: 600 }}>
            Time
          </text>

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

          {lines.map((line, li) => {
            const color = LINE_COLORS[li % LINE_COLORS.length]
            const pts = line.points
            if (pts.length === 0) return null
            const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${dateToX(p.date)},${timeToY(p.time_cs)}`).join(' ')
            return (
              <g key={line.event_id || line.event_name}>
                <path d={pathD} fill="none" stroke={color.line} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {pts.map((p, i) => {
                  const x = dateToX(p.date)
                  const y = timeToY(p.time_cs)
                  const isBest = p.time_cs === Math.min(...pts.map(pp => pp.time_cs))
                  return (
                    <g key={i}
                      onMouseEnter={() => setTooltip({ x, y, line: line.event_name, ...p })}
                      onMouseLeave={() => setTooltip(null)}
                      style={{ cursor: 'pointer' }}>
                      <text x={x} y={y - 12} textAnchor="middle"
                        style={{ fontSize: '10px', fontWeight: 700, fill: color.line, fontFamily: 'monospace' }}>
                        {formatTimeShort(p.time_cs)}
                      </text>
                      <circle cx={x} cy={y} r={isBest ? 5.5 : 4} fill="#fff" stroke={color.line} strokeWidth="2.5" />
                      {isBest && <circle cx={x} cy={y} r={2.5} fill={color.line} />}
                    </g>
                  )
                })}
              </g>
            )
          })}

          {tooltip && (
            <g>
              <rect x={tooltip.x - 90} y={tooltip.y + 15} width="180" height={showSwimmer && tooltip.swimmer ? 62 : 48} rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1" />
              <text x={tooltip.x} y={tooltip.y + 32} textAnchor="middle" style={{ fontSize: '11px', fontWeight: 700, fill: '#1e293b' }}>
                {tooltip.line}
              </text>
              <text x={tooltip.x} y={tooltip.y + 48} textAnchor="middle" style={{ fontSize: '10px', fill: '#64748b' }}>
                {formatTimeShort(tooltip.time_cs)} · {(tooltip.meet || '').substring(0, 25)}{tooltip.fina ? ` · ${tooltip.fina} FINA` : ''}
              </text>
              {showSwimmer && tooltip.swimmer && (
                <text x={tooltip.x} y={tooltip.y + 60} textAnchor="middle" style={{ fontSize: '10px', fill: '#94a3b8' }}>
                  {tooltip.swimmer}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>

      {/* Details table */}
      <div className="px-5 pb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-3 text-gray-400 font-semibold">Event</th>
                <th className="text-left py-2 pr-3 text-gray-400 font-semibold">Best</th>
                <th className="text-left py-2 pr-3 text-gray-400 font-semibold">Latest</th>
                <th className="text-left py-2 pr-3 text-gray-400 font-semibold">Change</th>
                <th className="text-left py-2 text-gray-400 font-semibold">{showSwimmer ? 'Best Swimmer' : 'Best Meet'}</th>
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
                  <tr key={line.event_id || line.event_name} className="border-b border-gray-50 hover:bg-gray-50">
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
                    <td className="py-2 text-gray-500 truncate max-w-[200px]">
                      {showSwimmer && bestPoint?.swimmer ? bestPoint.swimmer : bestPoint?.meet}
                    </td>
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
