import { useState } from 'react'
import { CHART, formatCs, timeScale } from './theme'
import TimeDisplay from '../domain/TimeDisplay'

/**
 * Generic inverted-Y swim-time line chart (lower time renders higher).
 *
 * `series`: [{ name, color?, points: [{ x (0..n label index), label, cs }] }]
 * `labels`: x-axis tick labels (dates/seasons).
 * Responsive via viewBox; tooltip = white card with TimeDisplay.
 */
export default function TimeLineChart({ series, labels = [], height = 180, className }) {
  const [hover, setHover] = useState(null)
  const W = 640
  const H = height
  const PAD_X = 8
  const allCs = series.flatMap((s) => s.points.map((p) => p.cs))
  if (allCs.length === 0) return null
  const y = timeScale(allCs, H)
  const maxX = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.x)))
  const x = (i) => PAD_X + (i / maxX) * (W - PAD_X * 2)

  // 4 horizontal gridlines across the cs range
  const minCs = Math.min(...allCs)
  const maxCs = Math.max(...allCs)
  const gridVals = [0, 1, 2, 3].map((i) => minCs + ((maxCs - minCs) * i) / 3)

  return (
    <div className={className}>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Time progression chart">
          {gridVals.map((v, i) => (
            <g key={i}>
              <line x1={PAD_X} x2={W - PAD_X} y1={y(v)} y2={y(v)} stroke={CHART.grid} strokeWidth="1" />
              <text x={PAD_X} y={y(v) - 4} fill={CHART.axisText} fontSize="10" fontWeight="600">
                {formatCs(Math.round(v))}
              </text>
            </g>
          ))}
          {series.map((s, si) => {
            const color = s.color || CHART.series[si % CHART.series.length]
            const path = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.x)},${y(p.cs)}`).join(' ')
            return (
              <g key={s.name || si}>
                {si === 0 && s.points.length > 1 && (
                  <path
                    d={`${path} L${x(s.points[s.points.length - 1].x)},${H - 24} L${x(s.points[0].x)},${H - 24} Z`}
                    fill={CHART.primaryFill}
                  />
                )}
                <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {s.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={x(p.x)} cy={y(p.cs)} r={hover?.si === si && hover?.i === i ? 5 : CHART.point.r}
                    fill={color} stroke={CHART.point.stroke} strokeWidth={CHART.point.strokeWidth}
                    className="cursor-pointer"
                    onMouseEnter={() => setHover({ si, i, p, color, name: s.name, px: (x(p.x) / W) * 100, py: (y(p.cs) / H) * 100 })}
                    onMouseLeave={() => setHover(null)}
                  />
                ))}
              </g>
            )
          })}
        </svg>
        {hover && (
          <div
            className="absolute z-10 bg-white rounded-sm shadow-pop border border-ink-100 px-3 py-2 pointer-events-none -translate-x-1/2 -translate-y-full"
            style={{ left: `${hover.px}%`, top: `${hover.py}%`, marginTop: -8 }}
          >
            <div className="text-label text-ink-400">{hover.p.label || hover.name}</div>
            <TimeDisplay time={formatCs(hover.p.cs)} />
          </div>
        )}
      </div>
      {labels.length > 0 && (
        <div className="flex justify-between px-1 mt-1">
          {labels.map((l, i) => (
            <span key={i} className="text-label normal-case tracking-normal font-normal text-ink-400">{l}</span>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-2">
          {series.map((s, si) => (
            <span key={s.name || si} className="inline-flex items-center gap-1.5 text-body-sm text-ink-500">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color || CHART.series[si % CHART.series.length] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
