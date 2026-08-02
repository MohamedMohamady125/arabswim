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

  // Keep every swim (no per-day dedupe) so close times at the same meet —
  // e.g. prelims vs finals — are all visible; sort chronologically, slower
  // swims first within a day so the line reads top-to-bottom
  const allDates = new Set()
  const processedLines = lines.map((line) => {
    const pts = [...(line.points || [])]
      .filter((p) => p.time_cs != null)
      .sort((a, b) => a.date.localeCompare(b.date) || b.time_cs - a.time_cs)
    pts.forEach((p) => allDates.add(p.date))
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

  // Label collision detection — multi-pass so clusters of close times all
  // get pushed apart instead of only the first overlapping pair
  const allLabels = []
  processedLines.forEach((line, li) => {
    line.points.forEach((p, pi) => {
      allLabels.push({ x: dateToX(p.date), y: timeToY(p.time_cs) - 16, cs: p.time_cs, li, pi })
    })
  })
  allLabels.sort((a, b) => a.x - b.x || a.y - b.y)
  const LBL_W = mobile ? 52 : 44
  const LBL_H = 17
  // Colliding labels spread SIDEWAYS into a row next to each other —
  // never stacked vertically on top of one another
  for (let pass = 0; pass < 6; pass++) {
    let moved = false
    for (let i = 1; i < allLabels.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = allLabels[j]
        const b = allLabels[i]
        if (Math.abs(b.x - a.x) < LBL_W + 2 && Math.abs(b.y - a.y) < LBL_H) {
          if (a.x + LBL_W + 2 <= plotR - LBL_W / 2) b.x = a.x + LBL_W + 2
          else b.x = Math.min(a.x, b.x) - LBL_W - 2
          moved = true
        }
      }
    }
    if (!moved) break
  }
  allLabels.forEach((l) => {
    l.x = Math.max(plotL + LBL_W / 2, Math.min(plotR - LBL_W / 2, l.x))
  })
  const labelMap = {}
  allLabels.forEach((l) => { labelMap[`${l.li}-${l.pi}`] = { x: l.x, y: l.y } })

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }} fontFamily={FONT_STACK}
        onClick={() => setTooltip(null)}>
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

        {/* Triangle markers — hover on desktop, tap-to-toggle on touch */}
        {processedLines.map((line, li) => {
          const color = line.color || LINE_COLORS[li % LINE_COLORS.length]
          return line.points.map((p, i) => {
            const key = `m${li}-${i}`
            const px = dateToX(p.date)
            const py = timeToY(p.time_cs)
            const tip = { key, x: px, y: py, line: line.event_name, ...p }
            return (
              <g key={key}
                onMouseEnter={() => setTooltip(tip)}
                onMouseLeave={() => setTooltip((t) => (t && t.key === key ? null : t))}
                onClick={(e) => { e.stopPropagation(); setTooltip((t) => (t && t.key === key ? null : tip)) }}
                style={{ cursor: 'pointer' }}>
                {/* generous invisible hit area so fingers can hit the point */}
                <circle cx={px} cy={py} r={mobile ? 18 : 12} fill="transparent" />
                <Triangle x={px} y={py} color={color} />
              </g>
            )
          })
        })}

        {/* Time labels (white halo + ink text) */}
        {processedLines.map((line, li) => line.points.map((p, i) => {
          const key = `${li}-${i}`
          const pos = labelMap[key] || { x: dateToX(p.date), y: timeToY(p.time_cs) - 16 }
          const x = pos.x
          const y = pos.y
          const lbl = formatCs(p.time_cs)
          return (
            <g key={`lbl${li}-${i}`}>
              <text x={x} y={y} textAnchor="middle" fontSize={mobile ? 13 : 11} fontWeight="bold" fill="#ffffff" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="round" opacity="0.85">{lbl}</text>
              <text x={x} y={y} textAnchor="middle" fontSize={mobile ? 13 : 11} fontWeight="bold" fill={INK} style={{ fontVariantNumeric: 'tabular-nums' }}>{lbl}</text>
            </g>
          )
        }))}

        {/* Tooltip — flat white card, square corners; flips above the point
            when there is no room below, and never leaves the canvas */}
        {tooltip && (() => {
          const dt = tooltip.date ? new Date(tooltip.date) : null
          const dateLbl = dt && !Number.isNaN(dt.getTime())
            ? dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
            : ''
          const line1 = tooltip.line || ''
          const line2 = `${formatCs(tooltip.time_cs)}${tooltip.fina ? ` · ${tooltip.fina} FINA` : ''}${dateLbl ? ` · ${dateLbl}` : ''}`
          const line3 = (tooltip.meet || '').substring(0, 34)
          const line4 = showSwimmer && tooltip.swimmer ? tooltip.swimmer : ''
          const rows = [line1, line2, line3, line4].filter(Boolean)
          const f1 = mobile ? 13.5 : 12.5
          const f2 = mobile ? 12 : 11
          const th = 22 + rows.length * (mobile ? 17 : 16)
          const tw = Math.min(W - 12, Math.max(170, ...rows.map((r, i) => r.length * (i === 0 ? f1 : f2) * 0.58)) + 28)
          const tx = Math.max(6, Math.min(tooltip.x - tw / 2, W - tw - 6))
          const below = tooltip.y + 18 + th <= H - 6
          const ty = below ? tooltip.y + 18 : Math.max(6, tooltip.y - 18 - th)
          const tcx = tx + tw / 2
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={tx} y={ty} width={tw} height={th} fill="#ffffff" stroke={INK} strokeWidth="1.5" />
              {rows.map((r, i) => (
                <text key={i} x={tcx} y={ty + 17 + i * (mobile ? 17 : 16)} textAnchor="middle"
                  fill={i === 0 ? INK : i === 1 ? '#12253d' : '#58687c'}
                  fontSize={i === 0 ? f1 : f2} fontWeight={i <= 1 ? 'bold' : 'normal'}
                  style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {r}
                </text>
              ))}
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
