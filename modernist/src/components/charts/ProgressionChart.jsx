import { useState, useEffect } from 'react'
import { Empty } from '../ui'

/* ── Modernist chart palette (flat, no gradients) ─────────────────────── */
export const CHART = {
  grid: '#dde4ec',          // neutral-300 gridlines
  axisText: '#78879a',      // neutral-600 tick labels
  primary: '#1c4e86',       // navy accent
  series: ['#1c4e86', '#4a8fc0', '#b98a1e', '#0d7a52', '#a8402f', '#78879a'],
}

const INK = '#12253d'
const FONT_STACK = '"Archivo", system-ui, sans-serif'

/** Format centiseconds → "M:SS.hh" / "SS.hh" for axis/tooltips. */
export function formatCs(cs) {
  if (cs == null || Number.isNaN(cs)) return ''
  const mins = Math.floor(cs / 6000)
  const secs = Math.floor((cs % 6000) / 100)
  const hund = cs % 100
  return mins > 0
    ? `${mins}:${String(secs).padStart(2, '0')}.${String(hund).padStart(2, '0')}`
    : `${secs}.${String(hund).padStart(2, '0')}`
}

/* Tracks whether the viewport is phone-sized so charts can use a
   phone-native canvas (narrower, proportionally bigger text). */
function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const fn = (e) => setMobile(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return mobile
}

const LINE_COLORS = CHART.series

function Triangle({ x, y, color }) {
  const a = 7
  const pts = `${x},${y - a} ${x - a * 0.9},${y + a * 0.65} ${x + a * 0.9},${y + a * 0.65}`
  return <polygon points={pts} fill={color} stroke="#ffffff" strokeWidth={1.5} strokeLinejoin="round" />
}

function Chart({ lines, title, showSwimmer = false }) {
  const [tooltip, setTooltip] = useState(null)
  const mobile = useIsMobile()

  // Collect all dates, dedup to best time per date per line
  const allDates = new Set()
  const processedLines = lines.map((line) => {
    const bestByDate = {}
    line.points.forEach((p) => {
      allDates.add(p.date)
      if (!bestByDate[p.date] || p.time_cs < bestByDate[p.date].time_cs) {
        bestByDate[p.date] = p
      }
    })
    const pts = Object.values(bestByDate).sort((a, b) => a.date.localeCompare(b.date))
    return { ...line, points: pts }
  })
  const sortedDates = [...allDates].sort()

  let globalMin = Infinity
  let globalMax = -Infinity
  processedLines.forEach((l) => l.points.forEach((p) => {
    if (p.time_cs < globalMin) globalMin = p.time_cs
    if (p.time_cs > globalMax) globalMax = p.time_cs
  }))

  const range = globalMax - globalMin || 100
  const paddedMin = globalMin - range * 0.08
  const paddedMax = globalMax + range * 0.08

  // Phone-native canvas: narrower viewBox so text renders proportionally larger.
  const legendRows = mobile && processedLines.length > 1 ? Math.ceil(processedLines.length / 2) : 0
  const W = mobile ? 460 : 1280
  const H = mobile ? 560 + legendRows * 24 : 700
  const pL = mobile ? 76 : 110
  const pR = mobile ? 20 : 60
  const pT = mobile ? (title ? 74 : 30) + legendRows * 24 : (title ? 104 : 50)
  const pB = mobile ? 58 : 60
  const plotL = pL
  const plotR = W - pR
  const plotT = pT
  const plotB = H - pB
  const pW = plotR - plotL
  const pH = plotB - plotT

  const dateToX = (date) => {
    if (sortedDates.length === 1) return plotL + pW / 2
    const idx = sortedDates.indexOf(date)
    return plotL + (idx / (sortedDates.length - 1)) * pW
  }

  // Y inverted: faster (lower cs) at bottom
  const timeToY = (cs) => plotB - ((cs - paddedMin) / (paddedMax - paddedMin)) * pH

  // Y-axis ticks
  const tickCount = Math.min(mobile ? 6 : 8, Math.max(4, Math.ceil((paddedMax - paddedMin) / 100)))
  const yTicks = []
  for (let i = 0; i < tickCount; i++) {
    const cs = paddedMin + (i / (tickCount - 1)) * (paddedMax - paddedMin)
    yTicks.push(Math.round(cs))
  }

  // X labels (phones show at most ~5 so they never overlap)
  const maxXLabels = mobile ? 5 : 12
  const xLabels = sortedDates.length <= maxXLabels ? sortedDates : sortedDates.filter((_, i) =>
    i === 0 || i === sortedDates.length - 1 || i % Math.ceil(sortedDates.length / (mobile ? 4 : 10)) === 0
  )

  // Label collision detection
  const allLabels = []
  processedLines.forEach((line, li) => {
    line.points.forEach((p) => {
      allLabels.push({ x: dateToX(p.date), y: timeToY(p.time_cs) - 16, cs: p.time_cs, li })
    })
  })
  allLabels.sort((a, b) => a.x - b.x || a.y - b.y)
  for (let i = 1; i < allLabels.length; i++) {
    const prev = allLabels[i - 1]
    const curr = allLabels[i]
    if (Math.abs(curr.x - prev.x) < 40 && Math.abs(curr.y - prev.y) < 18) {
      curr.y = prev.y + (curr.y > prev.y ? 18 : -18)
    }
  }
  const labelMap = {}
  allLabels.forEach((l) => { labelMap[`${l.li}-${l.cs}-${Math.round(l.x)}`] = l.y })

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }} fontFamily={FONT_STACK}>
        {/* Flat white canvas */}
        <rect width={W} height={H} fill="#ffffff" />

        {/* Title */}
        {title && (
          <text x={W / 2} y={mobile ? 40 : 48} textAnchor="middle" fill={INK} fontSize={mobile ? 27 : 32} fontWeight="800" letterSpacing="1">
            {title.toUpperCase()}
          </text>
        )}

        {/* Legend — single centered row on desktop, 2-col rows on phones */}
        {processedLines.length > 1 && (mobile ? (
          processedLines.map((line, li) => {
            const color = line.color || LINE_COLORS[li % LINE_COLORS.length]
            const col = li % 2
            const row = Math.floor(li / 2)
            const x = pL + col * ((W - pL - pR) / 2)
            const y = (title ? 62 : 20) + row * 24
            return (
              <g key={li}>
                <line x1={x} y1={y} x2={x + 26} y2={y} stroke={color} strokeWidth="2.6" />
                <Triangle x={x + 13} y={y} color={color} />
                <text x={x + 34} y={y + 4.5} fill={INK} fontSize="13" fontWeight="bold">{line.event_name}</text>
              </g>
            )
          })
        ) : (() => {
          const legendW = processedLines.reduce((s, l) => s + l.event_name.length * 8 + 70, 0)
          let lx = W / 2 - legendW / 2
          return processedLines.map((line, li) => {
            const color = line.color || LINE_COLORS[li % LINE_COLORS.length]
            const x = lx
            lx += line.event_name.length * 8 + 70
            return (
              <g key={li}>
                <line x1={x} y1={title ? 76 : 24} x2={x + 36} y2={title ? 76 : 24} stroke={color} strokeWidth="2.6" />
                <Triangle x={x + 18} y={title ? 76 : 24} color={color} />
                <text x={x + 44} y={(title ? 76 : 24) + 4} fill={INK} fontSize="12" fontWeight="bold">{line.event_name}</text>
              </g>
            )
          })
        })())}

        {/* Horizontal grid + Y labels */}
        {yTicks.map((cs, i) => {
          const y = timeToY(cs)
          return (
            <g key={i}>
              <line x1={plotL} y1={y} x2={plotR} y2={y} stroke={CHART.grid} strokeWidth="1" />
              <text x={plotL - (mobile ? 8 : 12)} y={y + 4} textAnchor="end" fill={CHART.axisText} fontSize={mobile ? 13.5 : 12.5} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCs(cs)}</text>
            </g>
          )
        })}

        {/* Vertical grid + X labels */}
        {xLabels.map((date) => {
          const x = dateToX(date)
          const d = new Date(date)
          return (
            <g key={date}>
              <line x1={x} y1={plotT} x2={x} y2={plotB} stroke={CHART.grid} strokeWidth="1" />
              <text x={x} y={plotB + (mobile ? 20 : 22)} textAnchor="middle" fill={CHART.axisText} fontSize={mobile ? 12.5 : 12} fontWeight="bold">
                {d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
              </text>
            </g>
          )
        })}

        {/* Plot border */}
        <rect x={plotL} y={plotT} width={pW} height={pH} fill="none" stroke={CHART.grid} strokeWidth="1.4" />

        {/* Axis titles */}
        <text x={mobile ? 18 : 30} y={plotT + pH / 2} transform={`rotate(-90 ${mobile ? 18 : 30} ${plotT + pH / 2})`}
          textAnchor="middle" fill={CHART.axisText} fontSize={mobile ? 13.5 : 14} fontWeight="bold" letterSpacing="1">
          TIME
        </text>
        <text x={plotL + pW / 2} y={plotB + (mobile ? 44 : 48)} textAnchor="middle" fill={CHART.axisText} fontSize={mobile ? 13.5 : 14} fontWeight="bold" letterSpacing="1">
          DATE
        </text>

        {/* Series lines */}
        {processedLines.map((line, li) => {
          const color = line.color || LINE_COLORS[li % LINE_COLORS.length]
          const pts = line.points
          if (pts.length === 0) return null
          const uniqueDates = new Set(pts.map((p) => p.date))
          const pathD = uniqueDates.size > 1
            ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${dateToX(p.date).toFixed(1)},${timeToY(p.time_cs).toFixed(1)}`).join(' ')
            : null
          return (
            <g key={line.event_id || line.event_name}>
              {pathD && <path d={pathD} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />}
            </g>
          )
        })}

        {/* Triangle markers */}
        {processedLines.map((line, li) => {
          const color = line.color || LINE_COLORS[li % LINE_COLORS.length]
          return line.points.map((p, i) => (
            <g key={`m${li}-${i}`}
              onMouseEnter={() => setTooltip({ x: dateToX(p.date), y: timeToY(p.time_cs), line: line.event_name, ...p })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'pointer' }}>
              <Triangle x={dateToX(p.date)} y={timeToY(p.time_cs)} color={color} />
            </g>
          ))
        })}

        {/* Time labels (white halo + ink text) */}
        {processedLines.map((line, li) => line.points.map((p, i) => {
          const x = dateToX(p.date)
          const key = `${li}-${p.time_cs}-${Math.round(x)}`
          const y = labelMap[key] !== undefined ? labelMap[key] : timeToY(p.time_cs) - 16
          const lbl = formatCs(p.time_cs)
          return (
            <g key={`lbl${li}-${i}`}>
              <text x={x} y={y} textAnchor="middle" fontSize={mobile ? 13 : 11} fontWeight="bold" fill="#ffffff" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="round" opacity="0.85">{lbl}</text>
              <text x={x} y={y} textAnchor="middle" fontSize={mobile ? 13 : 11} fontWeight="bold" fill={INK} style={{ fontVariantNumeric: 'tabular-nums' }}>{lbl}</text>
            </g>
          )
        }))}

        {/* Tooltip — flat white card, square corners */}
        {tooltip && (() => {
          const line1 = tooltip.line || ''
          const line2 = `${formatCs(tooltip.time_cs)} · ${(tooltip.meet || '').substring(0, 22)}${tooltip.fina ? ` · ${tooltip.fina}pts` : ''}`
          const line3 = showSwimmer && tooltip.swimmer ? tooltip.swimmer : ''
          const f1 = mobile ? 13 : 12
          const f2 = mobile ? 11.5 : 10.5
          const f3 = mobile ? 11 : 10
          const tw = Math.min(W - 12, Math.max(160, line1.length * f1 * 0.62, line2.length * f2 * 0.56, line3.length * f3 * 0.56) + 28)
          const tx = Math.max(6, Math.min(tooltip.x - tw / 2, W - tw - 6))
          const tcx = tx + tw / 2
          return (
            <g>
              <rect x={tx} y={tooltip.y + 18} width={tw} height={line3 ? 66 : 50}
                fill="#ffffff" stroke={INK} strokeWidth="1.5" />
              <text x={tcx} y={tooltip.y + 35} textAnchor="middle" fill={INK} fontSize={f1} fontWeight="bold">
                {line1}
              </text>
              <text x={tcx} y={tooltip.y + 52} textAnchor="middle" fill="#58687c" fontSize={f2}>
                {line2}
              </text>
              {line3 && (
                <text x={tcx} y={tooltip.y + 66} textAnchor="middle" fill={CHART.axisText} fontSize={f3}>
                  {line3}
                </text>
              )}
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

function SummaryTable({ lines, showSwimmer }) {
  return (
    <div className="table-scroll" style={{ marginTop: 12 }}>
      <table className="table" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th>Event</th>
            <th className="time">Best</th>
            <th className="time">Latest</th>
            <th className="num">Change</th>
            <th>{showSwimmer ? 'Best swimmer' : 'Best meet'}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, li) => {
            const color = line.color || LINE_COLORS[li % LINE_COLORS.length]
            const pts = line.points
            if (!pts.length) return null
            const best = Math.min(...pts.map((p) => p.time_cs))
            const bestPoint = pts.find((p) => p.time_cs === best)
            const latest = pts[pts.length - 1]
            const first = pts[0]
            const diff = first.time_cs - latest.time_cs
            const improved = diff > 0
            return (
              <tr key={line.event_id || line.event_name}>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <svg width="10" height="10"><polygon points="5,0 0,8.5 10,8.5" fill={color} /></svg>
                    <span style={{ fontWeight: 600 }}>{line.event_name}</span>
                  </span>
                </td>
                <td className="time asw-time" style={{ color }}>{formatCs(best)}</td>
                <td className="time asw-num">{formatCs(latest.time_cs)}</td>
                <td className="num asw-num" style={{ fontWeight: 700, color: pts.length > 1 ? (improved ? 'var(--asw-fast)' : 'var(--asw-slow)') : 'var(--color-neutral-500)' }}>
                  {pts.length > 1 ? `${improved ? '\u2193' : '\u2191'} ${formatCs(Math.abs(diff))}` : '—'}
                </td>
                <td className="text-muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {showSwimmer && bestPoint?.swimmer ? bestPoint.swimmer : bestPoint?.meet}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function ProgressionChart({ lines = [], title, showSwimmer = false }) {
  if (!lines.length) return <Empty label="No progression data" />

  // Assign each event a fixed color so single charts match the collective chart
  const coloredLines = lines.map((l, i) => ({ ...l, color: LINE_COLORS[i % LINE_COLORS.length] }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Collective chart — all events together */}
      {coloredLines.length > 1 && (
        <div className="rule-b" style={{ paddingBottom: 20 }}>
          <Chart lines={coloredLines} title={title || 'All Events Progression'} showSwimmer={showSwimmer} />
          <SummaryTable lines={coloredLines} showSwimmer={showSwimmer} />
        </div>
      )}

      {/* Individual event charts */}
      {coloredLines.map((line) => {
        if (!line.points || line.points.length === 0) return null
        return (
          <div key={line.event_id || line.event_name} className="hair-b" style={{ paddingBottom: 20 }}>
            <Chart lines={[line]} title={line.event_name} showSwimmer={showSwimmer} />
            <SummaryTable lines={[line]} showSwimmer={showSwimmer} />
          </div>
        )
      })}
    </div>
  )
}
