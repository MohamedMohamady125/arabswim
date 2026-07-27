import { useState, useEffect } from 'react'

/* Tracks whether the viewport is phone-sized so charts can use a
   phone-native canvas (narrower, proportionally bigger text). */
function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const fn = e => setMobile(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return mobile
}

const LINE_COLORS = [
  '#2f90ff', '#ff4d4d', '#37c86a', '#ffd21f',
  '#ec4899', '#8b5cf6', '#f97316', '#06b6d4',
]

function formatTimeShort(cs) {
  if (!cs) return ''
  const minutes = Math.floor(cs / 6000)
  const seconds = Math.floor((cs % 6000) / 100)
  const centis = cs % 100
  if (minutes) return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  return `${seconds}.${String(centis).padStart(2, '0')}`
}

function wavePath(W, baseY, amp, wl) {
  let d = `M0 ${baseY}`
  for (let x = 0; x <= W; x += wl / 2) {
    const dir = Math.round(x / (wl / 2)) % 2 === 0 ? 1 : -1
    d += ` Q ${x + wl / 4} ${baseY - dir * amp} ${x + wl / 2} ${baseY}`
  }
  return d
}

function Triangle({ x, y, color }) {
  const a = 7
  const pts = `${x},${y - a} ${x - a * 0.9},${y + a * 0.65} ${x + a * 0.9},${y + a * 0.65}`
  return <polygon points={pts} fill={color} stroke="#0b1f38" strokeWidth={1.2} strokeLinejoin="round" />
}

function BroadcastChart({ lines, title, showSwimmer = false, chartId = 'main', tint = '#2f90ff' }) {
  const [tooltip, setTooltip] = useState(null)
  const mobile = useIsMobile()

  // Collect all dates, dedup to best time per date per line
  const allDates = new Set()
  const processedLines = lines.map(line => {
    const bestByDate = {}
    line.points.forEach(p => {
      allDates.add(p.date)
      if (!bestByDate[p.date] || p.time_cs < bestByDate[p.date].time_cs) {
        bestByDate[p.date] = p
      }
    })
    const pts = Object.values(bestByDate).sort((a, b) => a.date.localeCompare(b.date))
    return { ...line, points: pts }
  })
  const sortedDates = [...allDates].sort()

  let globalMin = Infinity, globalMax = -Infinity
  processedLines.forEach(l => l.points.forEach(p => {
    if (p.time_cs < globalMin) globalMin = p.time_cs
    if (p.time_cs > globalMax) globalMax = p.time_cs
  }))

  const range = globalMax - globalMin || 100
  const paddedMin = globalMin - range * 0.08
  const paddedMax = globalMax + range * 0.08

  // Phone-native canvas: narrower viewBox so text renders proportionally
  // larger on small screens; desktop keeps the original broadcast geometry.
  const legendRows = mobile && processedLines.length > 1 ? Math.ceil(processedLines.length / 2) : 0
  const W = mobile ? 460 : 1280
  const H = mobile ? 560 + legendRows * 24 : 700
  const pL = mobile ? 76 : 110
  const pR = mobile ? 20 : 60
  const pT = mobile ? (title ? 74 : 30) + legendRows * 24 : (title ? 104 : 50)
  const pB = mobile ? 58 : 60
  const plotL = pL, plotR = W - pR, plotT = pT, plotB = H - pB
  const pW = plotR - plotL, pH = plotB - plotT

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
    line.points.forEach(p => {
      allLabels.push({ x: dateToX(p.date), y: timeToY(p.time_cs) - 16, cs: p.time_cs, li })
    })
  })
  allLabels.sort((a, b) => a.x - b.x || a.y - b.y)
  for (let i = 1; i < allLabels.length; i++) {
    const prev = allLabels[i - 1], curr = allLabels[i]
    if (Math.abs(curr.x - prev.x) < 40 && Math.abs(curr.y - prev.y) < 18) {
      curr.y = prev.y + (curr.y > prev.y ? 18 : -18)
    }
  }
  const labelMap = {}
  allLabels.forEach(l => { labelMap[`${l.li}-${l.cs}-${Math.round(l.x)}`] = l.y })

  const bgId = `bg-${chartId}`
  const stripesId = `stripes-${chartId}`

  // Wave Y positions spread across plot area
  const waveYs = [plotT + pH * 0.15, plotT + pH * 0.35, plotT + pH * 0.55, plotT + pH * 0.75, plotT + pH * 0.9]

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block', height: 'auto' }}
        fontFamily="Arial, Helvetica, sans-serif">
        <defs>
          <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={tint} stopOpacity="0.07" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="1" stopColor={tint} stopOpacity="0.04" />
          </linearGradient>
          <pattern id={stripesId} width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
            <line x1="0" y1="0" x2="0" y2="26" stroke="#123a66" strokeOpacity="0.03" strokeWidth="2.4" />
          </pattern>
        </defs>

        {/* Background + texture */}
        <rect width={W} height={H} rx="12" fill={`url(#${bgId})`} />
        <rect width={W} height={H} rx="12" fill={`url(#${stripesId})`} />

        {/* Faint waves */}
        {waveYs.map((y, k) => (
          <path key={k} d={wavePath(W, y, 13, 300)} fill="none" stroke="#123a66" strokeOpacity="0.05" strokeWidth="1.4" />
        ))}

        {/* Title */}
        {title && (
          <text x={W / 2} y={mobile ? 40 : 48} textAnchor="middle" fill="#0b1f38" fontSize={mobile ? 27 : 32} fontWeight="bold" letterSpacing="1">
            {title.toUpperCase()}
          </text>
        )}

        {/* Legend (top area) — single centered row on desktop, 2-col rows on phones */}
        {processedLines.length > 1 && (mobile ? (
          processedLines.map((line, li) => {
            const color = line.color || LINE_COLORS[li % LINE_COLORS.length]
            const col = li % 2, row = Math.floor(li / 2)
            const x = pL + col * ((W - pL - pR) / 2)
            const y = (title ? 62 : 20) + row * 24
            return (
              <g key={li}>
                <line x1={x} y1={y} x2={x + 26} y2={y} stroke={color} strokeWidth="2.6" />
                <Triangle x={x + 13} y={y} color={color} />
                <text x={x + 34} y={y + 4.5} fill="#0b1f38" fontSize="13" fontWeight="bold">{line.event_name}</text>
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
                <text x={x + 44} y={(title ? 76 : 24) + 4} fill="#0b1f38" fontSize="12" fontWeight="bold">{line.event_name}</text>
              </g>
            )
          })
        })())}

        {/* Horizontal grid + Y labels */}
        {yTicks.map((cs, i) => {
          const y = timeToY(cs)
          return (
            <g key={i}>
              <line x1={plotL} y1={y} x2={plotR} y2={y} stroke="#123a66" strokeOpacity="0.14" strokeWidth="1" />
              <text x={plotL - (mobile ? 8 : 12)} y={y + 4} textAnchor="end" fill="#33475e" fontSize={mobile ? 13.5 : 12.5}>{formatTimeShort(cs)}</text>
            </g>
          )
        })}

        {/* Vertical grid + X labels */}
        {xLabels.map(date => {
          const x = dateToX(date)
          const d = new Date(date)
          return (
            <g key={date}>
              <line x1={x} y1={plotT} x2={x} y2={plotB} stroke="#123a66" strokeOpacity="0.14" strokeWidth="1" />
              <text x={x} y={plotB + (mobile ? 20 : 22)} textAnchor="middle" fill="#33475e" fontSize={mobile ? 12.5 : 12} fontWeight="bold">
                {d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
              </text>
            </g>
          )
        })}

        {/* Plot border */}
        <rect x={plotL} y={plotT} width={pW} height={pH} fill="none" stroke="#123a66" strokeOpacity="0.4" strokeWidth="1.4" />

        {/* Axis titles */}
        <text x={mobile ? 18 : 30} y={plotT + pH / 2} transform={`rotate(-90 ${mobile ? 18 : 30} ${plotT + pH / 2})`}
          textAnchor="middle" fill="#0b1f38" fontSize={mobile ? 13.5 : 14} fontWeight="bold" letterSpacing="1">
          TIME
        </text>
        <text x={plotL + pW / 2} y={plotB + (mobile ? 44 : 48)} textAnchor="middle" fill="#0b1f38" fontSize={mobile ? 13.5 : 14} fontWeight="bold" letterSpacing="1">
          DATE
        </text>

        {/* Series lines */}
        {processedLines.map((line, li) => {
          const color = line.color || LINE_COLORS[li % LINE_COLORS.length]
          const pts = line.points
          if (pts.length === 0) return null
          // Only draw lines if we have more than one unique date
          const uniqueDates = new Set(pts.map(p => p.date))
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

        {/* Time labels (dark halo + white text) */}
        {processedLines.map((line, li) => {
          const color = line.color || LINE_COLORS[li % LINE_COLORS.length]
          return line.points.map((p, i) => {
            const x = dateToX(p.date)
            const key = `${li}-${p.time_cs}-${Math.round(x)}`
            const y = labelMap[key] !== undefined ? labelMap[key] : timeToY(p.time_cs) - 16
            const lbl = formatTimeShort(p.time_cs)
            return (
              <g key={`lbl${li}-${i}`}>
                <text x={x} y={y} textAnchor="middle" fontSize={mobile ? 13 : 11} fontWeight="bold" fill="#ffffff" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="round" opacity="0.85">{lbl}</text>
                <text x={x} y={y} textAnchor="middle" fontSize={mobile ? 13 : 11} fontWeight="bold" fill="#0b1f38">{lbl}</text>
              </g>
            )
          })
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const line1 = tooltip.line || ''
          const line2 = `${formatTimeShort(tooltip.time_cs)} · ${(tooltip.meet || '').substring(0, 22)}${tooltip.fina ? ` · ${tooltip.fina}pts` : ''}`
          const line3 = showSwimmer && tooltip.swimmer ? tooltip.swimmer : ''
          const f1 = mobile ? 13 : 12, f2 = mobile ? 11.5 : 10.5, f3 = mobile ? 11 : 10
          // Size the box to the longest line (~0.62em avg char width for bold, 0.56 regular)
          const tw = Math.min(W - 12, Math.max(160, line1.length * f1 * 0.62, line2.length * f2 * 0.56, line3.length * f3 * 0.56) + 28)
          const tx = Math.max(6, Math.min(tooltip.x - tw / 2, W - tw - 6))
          const tcx = tx + tw / 2
          return (
            <g>
              <rect x={tx} y={tooltip.y + 18} width={tw}
                height={line3 ? 66 : 50} rx="8"
                fill="#0b1f38" fillOpacity="0.9" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1" />
              <text x={tcx} y={tooltip.y + 35} textAnchor="middle" fill="#ffffff" fontSize={f1} fontWeight="bold">
                {line1}
              </text>
              <text x={tcx} y={tooltip.y + 52} textAnchor="middle" fill="#eaf2ff" fontSize={f2}>
                {line2}
              </text>
              {line3 && (
                <text x={tcx} y={tooltip.y + 66} textAnchor="middle" fill="#94b8db" fontSize={f3}>
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
    <div className="overflow-x-auto rounded-xl mt-3 bg-white border border-gray-200">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: '2px solid rgba(18,58,102,0.15)' }}>
            <th className="text-left py-2.5 px-3 text-blue-900 font-bold">Event</th>
            <th className="text-left py-2.5 px-3 text-blue-900 font-bold">Best</th>
            <th className="text-left py-2.5 px-3 text-blue-900 font-bold">Latest</th>
            <th className="text-left py-2.5 px-3 text-blue-900 font-bold">Change</th>
            <th className="text-left py-2.5 px-3 text-blue-900 font-bold">{showSwimmer ? 'Best Swimmer' : 'Best Meet'}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, li) => {
            const color = line.color || LINE_COLORS[li % LINE_COLORS.length]
            const pts = line.points
            if (!pts.length) return null
            const best = Math.min(...pts.map(p => p.time_cs))
            const bestPoint = pts.find(p => p.time_cs === best)
            const latest = pts[pts.length - 1]
            const first = pts[0]
            const diff = first.time_cs - latest.time_cs
            const improved = diff > 0
            return (
              <tr key={line.event_id || line.event_name} style={{ borderBottom: '1px solid rgba(18,58,102,0.08)' }} className="hover:bg-gray-50">
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <svg width="10" height="10"><polygon points="5,0 0,8.5 10,8.5" fill={color} /></svg>
                    <span className="font-semibold text-gray-900">{line.event_name}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 font-mono font-bold" style={{ color }}>{formatTimeShort(best)}</td>
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
  )
}

export default function ProgressionChart({ lines = [], title, showSwimmer = false }) {
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

  // Assign each event a fixed color so single charts match the collective chart
  const coloredLines = lines.map((l, i) => ({ ...l, color: LINE_COLORS[i % LINE_COLORS.length] }))

  return (
    <div className="space-y-6">
      {/* Collective chart — all events together */}
      {coloredLines.length > 1 && (
        <div className="rounded-2xl overflow-hidden shadow-lg border"
          style={{ background: 'linear-gradient(135deg, #2f90ff12 0%, #ffffff 45%, #2f90ff08 100%)', borderColor: '#2f90ff33' }}>
          <div className="px-5 pt-4 pb-2">
            <BroadcastChart lines={coloredLines} title={title || 'All Events Progression'} showSwimmer={showSwimmer} chartId="collective" />
          </div>
          <div className="px-5 pb-5">
            <SummaryTable lines={coloredLines} showSwimmer={showSwimmer} />
          </div>
        </div>
      )}

      {/* Individual event charts */}
      {coloredLines.map((line, i) => {
        if (!line.points || line.points.length === 0) return null
        return (
          <div key={line.event_id || line.event_name} className="rounded-2xl overflow-hidden shadow-lg border"
            style={{ background: `linear-gradient(135deg, ${line.color}12 0%, #ffffff 45%, ${line.color}08 100%)`, borderColor: `${line.color}33` }}>
            <div className="px-5 pt-4 pb-2">
              <BroadcastChart
                lines={[line]}
                title={line.event_name}
                showSwimmer={showSwimmer}
                chartId={`single-${i}`}
                tint={line.color}
              />
            </div>
            <div className="px-5 pb-5">
              <SummaryTable lines={[line]} showSwimmer={showSwimmer} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
