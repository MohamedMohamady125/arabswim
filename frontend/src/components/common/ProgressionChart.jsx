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
    <div className="rounded-2xl shadow-sm overflow-hidden" style={{ background: 'linear-gradient(180deg, #e0f4fe 0%, #bae6fd 30%, #7dd3fc 70%, #38bdf8 100%)' }}>
      {/* Title + Legend */}
      <div className="px-5 pt-4 pb-2">
        {title && <h4 className="font-bold text-white text-sm uppercase tracking-wide mb-3" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>{title}</h4>}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {lines.map((line, i) => {
            const color = LINE_COLORS[i % LINE_COLORS.length]
            return (
              <div key={line.event_id || line.event_name} className="flex items-center gap-1.5">
                <span className={`w-3 h-0.5 rounded ${color.bg}`} style={{ display: 'inline-block' }} />
                <span className={`w-2 h-2 rounded-full ${color.bg}`} style={{ display: 'inline-block' }} />
                <span className={`w-3 h-0.5 rounded ${color.bg}`} style={{ display: 'inline-block' }} />
                <span className="text-xs font-semibold text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>{line.event_name}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="px-3 pb-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto', minHeight: '300px', maxHeight: '450px' }}>
          <defs>
            <linearGradient id="poolBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e0f7fa" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#b2ebf2" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#80deea" stopOpacity="0.8" />
            </linearGradient>
            {/* Pool lane lines */}
            <pattern id="laneLines" x="0" y="0" width={chartW} height="40" patternUnits="userSpaceOnUse">
              <line x1="0" y1="20" x2={chartW} y2="20" stroke="#00bcd4" strokeWidth="0.5" strokeOpacity="0.2" />
            </pattern>
            {/* Water ripple pattern */}
            <pattern id="waterRipple" x="0" y="0" width="120" height="20" patternUnits="userSpaceOnUse">
              <path d="M0 10 Q15 5 30 10 Q45 15 60 10 Q75 5 90 10 Q105 15 120 10" fill="none" stroke="#00acc1" strokeWidth="0.6" strokeOpacity="0.12" />
            </pattern>
          </defs>
          <rect x={PL} y={PT} width={chartW} height={chartH} fill="url(#poolBg)" rx="4" />
          <rect x={PL} y={PT} width={chartW} height={chartH} fill="url(#laneLines)" rx="4" />
          <rect x={PL} y={PT} width={chartW} height={chartH} fill="url(#waterRipple)" rx="4" />

          {yTicks.map((cs, i) => {
            const y = timeToY(cs)
            return (
              <g key={i}>
                <line x1={PL} x2={PL + chartW} y1={y} y2={y} stroke="#0097a7" strokeDasharray="4 3" strokeOpacity="0.25" />
                <text x={PL - 8} y={y + 4} textAnchor="end" style={{ fontSize: '11px', fill: '#0277bd', fontFamily: 'monospace', fontWeight: 600 }}>
                  {formatTimeSeconds(cs)}
                </text>
              </g>
            )
          })}

          <text x={15} y={PT + chartH / 2} textAnchor="middle" transform={`rotate(-90, 15, ${PT + chartH / 2})`}
            style={{ fontSize: '11px', fill: '#0277bd', fontWeight: 700 }}>
            Time
          </text>

          {xLabels.map(date => {
            const x = dateToX(date)
            const d = new Date(date)
            return (
              <g key={date}>
                <line x1={x} x2={x} y1={PT} y2={PT + chartH} stroke="#0097a7" strokeDasharray="2 4" opacity="0.2" />
                <text x={x} y={H - 8} textAnchor="middle" style={{ fontSize: '10px', fill: '#0277bd', fontWeight: 600 }}>
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
                {/* Line shadow/glow for contrast */}
                <path d={pathD} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.4" />
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
                        style={{ fontSize: '10px', fontWeight: 700, fill: '#fff', fontFamily: 'monospace', textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                        {formatTimeShort(p.time_cs)}
                      </text>
                      {/* Glow behind point */}
                      <circle cx={x} cy={y} r={isBest ? 10 : 7} fill={color.line} fillOpacity="0.15" />
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
              <rect x={tooltip.x - 90} y={tooltip.y + 15} width="180" height={showSwimmer && tooltip.swimmer ? 62 : 48} rx="8" fill="white" fillOpacity="0.92" stroke="#b2ebf2" strokeWidth="1" />
              <text x={tooltip.x} y={tooltip.y + 32} textAnchor="middle" style={{ fontSize: '11px', fontWeight: 700, fill: '#0277bd' }}>
                {tooltip.line}
              </text>
              <text x={tooltip.x} y={tooltip.y + 48} textAnchor="middle" style={{ fontSize: '10px', fill: '#37474f' }}>
                {formatTimeShort(tooltip.time_cs)} · {(tooltip.meet || '').substring(0, 25)}{tooltip.fina ? ` · ${tooltip.fina} FINA` : ''}
              </text>
              {showSwimmer && tooltip.swimmer && (
                <text x={tooltip.x} y={tooltip.y + 60} textAnchor="middle" style={{ fontSize: '10px', fill: '#546e7a' }}>
                  {tooltip.swimmer}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>

      {/* Details table */}
      <div className="px-5 pb-5">
        <div className="overflow-x-auto rounded-xl" style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '2px solid #b2ebf2' }}>
                <th className="text-left py-2.5 px-3 text-cyan-800 font-bold">Event</th>
                <th className="text-left py-2.5 px-3 text-cyan-800 font-bold">Best</th>
                <th className="text-left py-2.5 px-3 text-cyan-800 font-bold">Latest</th>
                <th className="text-left py-2.5 px-3 text-cyan-800 font-bold">Change</th>
                <th className="text-left py-2.5 px-3 text-cyan-800 font-bold">{showSwimmer ? 'Best Swimmer' : 'Best Meet'}</th>
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
                  <tr key={line.event_id || line.event_name} style={{ borderBottom: '1px solid #e0f7fa' }} className="hover:bg-cyan-50/50">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${color.bg}`} />
                        <span className="font-semibold text-gray-800">{line.event_name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold" style={{ color: color.line }}>{formatTimeShort(best)}</td>
                    <td className="py-2.5 px-3 font-mono text-gray-600">{formatTimeShort(latest.time_cs)}</td>
                    <td className="py-2.5 px-3">
                      {pts.length > 1 && (
                        <span className={`font-mono font-bold ${improved ? 'text-emerald-600' : 'text-red-500'}`}>
                          {improved ? '\u2193' : '\u2191'} {formatTimeShort(Math.abs(diff))}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500 truncate max-w-[200px]">
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
