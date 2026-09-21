import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCountryProgression } from '../api/core'
import { Loading, Empty, Seg } from './ui'
import { formatCs } from './charts/ProgressionChart'
import { formatDate } from '../utils'

/* ── Federation Progression tab ─────────────────────────────────────────
   Three views over season-best data (one point per season, so tapered
   championship swims never mix with in-season noise):
   · Overview — events × seasons heatmap colored by season-on-season change
   · By Event — yearly national best + top-8 depth average + benchmarks
   · Records  — chronological national-best (record) timeline            */

const INK = '#12253d'
const NAVY = '#1c4e86'
const LIGHT_BLUE = '#4a8fc0'
const GOLD = '#b98a1e'
const GREEN = '#0d7a52'
const RED = '#a8402f'
const GRID = '#dde4ec'
const AXIS = '#78879a'
const FONT = '"Archivo", system-ui, sans-serif'

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

function Triangle({ x, y, color }) {
  const a = 7
  return <polygon points={`${x},${y - a} ${x - a * 0.9},${y + a * 0.65} ${x + a * 0.9},${y + a * 0.65}`} fill={color} stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
}

function SubTabs({ options, value, onChange }) {
  const base = { padding: '8px 22px', border: '2px solid #1a56a0', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' }
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', margin: '18px 0 24px' }}>
      {options.map(([val, label]) => (
        <button key={val} type="button" onClick={() => onChange(val)}
          style={value === val ? { ...base, background: '#1a56a0', color: '#fff' } : { ...base, background: '#fff', color: '#1a56a0' }}>
          {label}
        </button>
      ))}
    </div>
  )
}

/* ── Overview heatmap ─────────────────────────────────────────────────── */

// % change vs the previous season with data; positive = faster (improved)
function pctChange(prevCs, curCs) {
  if (!prevCs || !curCs) return null
  return ((prevCs - curCs) / prevCs) * 100
}

function cellBg(pct) {
  if (pct == null) return '#f6f8fa'
  if (pct === 0) return '#f6f8fa'
  const mag = Math.min(Math.abs(pct), 3) / 3 // saturate at ±3 %
  const alpha = 0.12 + mag * 0.55
  return pct > 0 ? `rgba(13, 122, 82, ${alpha})` : `rgba(168, 64, 47, ${alpha})`
}

function OverviewHeatmap({ data, onPickEvent }) {
  if (!data) return <Loading label="Loading progression" />
  const years = data.years || []
  const events = data.events || []
  if (!years.length || !events.length) return <Empty label="No results for this selection" />
  return (
    <div>
      <div style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap', fontSize: 11.5, color: '#58687c', marginBottom: 14 }}>
        {[[cellBg(2), 'Faster than previous season'], [cellBg(-2), 'Slower than previous season'], ['#f6f8fa', 'First season / no change']].map(([bg, label]) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 14, background: bg, border: '1px solid #d7dee7', display: 'inline-block' }} />{label}
          </span>
        ))}
      </div>
      <div className="table-scroll">
        <table className="table" style={{ fontSize: 12.5 }}>
          <thead>
            <tr>
              <th>Event</th>
              {years.map((y) => <th key={y} className="num">{y}</th>)}
              <th className="num">Trend</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => {
              const cells = ev.cells || {}
              const present = years.filter((y) => cells[y])
              const first = present.length ? cells[present[0]] : null
              const last = present.length ? cells[present[present.length - 1]] : null
              const trend = present.length > 1 ? pctChange(first.time_cs, last.time_cs) : null
              let prevCs = null
              return (
                <tr key={ev.event_id} onClick={() => onPickEvent(ev.event_id)} style={{ cursor: 'pointer' }}
                  title={`Open ${ev.name} in the By Event view`}>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{ev.name}</td>
                  {years.map((y) => {
                    const c = cells[y]
                    const pct = c ? pctChange(prevCs, c.time_cs) : null
                    if (c) prevCs = c.time_cs
                    return (
                      <td key={y} className="num asw-num"
                        title={c ? `${c.time} — ${c.swimmer}\n${c.meet}` : 'No swims this season'}
                        style={{ background: c ? cellBg(pct) : 'transparent', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {c ? c.time : <span style={{ color: '#c3ccd6' }}>·</span>}
                      </td>
                    )
                  })}
                  <td className="num asw-num" style={{ fontWeight: 800, whiteSpace: 'nowrap', color: trend == null ? '#8a9bb5' : trend > 0 ? GREEN : trend < 0 ? RED : '#8a9bb5' }}>
                    {trend == null ? '—' : `${trend > 0 ? '\u2193' : trend < 0 ? '\u2191' : ''} ${Math.abs(trend).toFixed(1)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ textAlign: 'center', fontSize: 11.5, color: '#8a9bb5', marginTop: 10 }}>
        Each cell is the federation's fastest swim of that season · hover a cell for the swimmer & meet · click a row for the full chart
      </div>
    </div>
  )
}

/* ── By Event season chart ────────────────────────────────────────────── */

function SeasonChart({ seasons, benchmarks }) {
  const [tooltip, setTooltip] = useState(null)
  const mobile = useIsMobile()
  if (!seasons.length) return <Empty label="No seasons for this event" />

  const years = seasons.map((s) => s.year)
  const benchLines = []
  if (benchmarks?.arab_record) benchLines.push({ cs: benchmarks.arab_record.time_cs, color: GOLD, label: `Arab Record ${benchmarks.arab_record.time}` })
  if (benchmarks?.cut_a) benchLines.push({ cs: benchmarks.cut_a.time_cs, color: GREEN, label: `A Cut ${benchmarks.cut_a.time}` })
  if (benchmarks?.cut_b) benchLines.push({ cs: benchmarks.cut_b.time_cs, color: '#7d8a99', label: `B Cut ${benchmarks.cut_b.time}` })

  const allCs = [
    ...seasons.map((s) => s.best_cs),
    ...seasons.map((s) => s.top8_avg_cs).filter(Boolean),
    ...benchLines.map((b) => b.cs),
  ]
  const minCs = Math.min(...allCs)
  const maxCs = Math.max(...allCs)
  const range = maxCs - minCs || 100
  const padMin = minCs - range * 0.08
  const padMax = maxCs + range * 0.1

  const W = mobile ? 460 : 1280
  const H = mobile ? 480 : 640
  const pL = mobile ? 76 : 110
  const pR = mobile ? 24 : 70
  const pT = mobile ? 64 : 80
  const pB = mobile ? 54 : 60
  const plotL = pL; const plotR = W - pR; const plotT = pT; const plotB = H - pB
  const pW = plotR - plotL; const pH = plotB - plotT

  const xOf = (year) => years.length <= 1 ? plotL + pW / 2 : plotL + ((year - years[0]) / (years[years.length - 1] - years[0])) * pW
  // Slower (higher cs) plots toward the TOP — same as swimmer-profile charts
  const yOf = (cs) => plotB - ((cs - padMin) / (padMax - padMin)) * pH

  const tickCount = mobile ? 6 : 8
  const yTicks = Array.from({ length: tickCount }, (_, i) => Math.round(padMin + (i / (tickCount - 1)) * (padMax - padMin)))

  const bestPath = seasons.length > 1 ? seasons.map((s, i) => `${i ? 'L' : 'M'}${xOf(s.year).toFixed(1)},${yOf(s.best_cs).toFixed(1)}`).join(' ') : null
  const depthPts = seasons.filter((s) => s.top8_avg_cs)
  const depthPath = depthPts.length > 1 ? depthPts.map((s, i) => `${i ? 'L' : 'M'}${xOf(s.year).toFixed(1)},${yOf(s.top8_avg_cs).toFixed(1)}`).join(' ') : null

  const legendY = mobile ? 26 : 36
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }} fontFamily={FONT} onClick={() => setTooltip(null)}>
        <rect width={W} height={H} fill="#ffffff" />

        {/* Legend */}
        {(() => {
          const items = [
            { color: NAVY, label: 'National best', dash: null, marker: 'tri' },
            { color: LIGHT_BLUE, label: 'Top-8 average (depth)', dash: '6 5', marker: 'dot' },
            ...benchLines.map((b) => ({ color: b.color, label: b.label.replace(/ [\d:.]+$/, ''), dash: '3 5', marker: null })),
          ]
          if (mobile) {
            return items.map((it, i) => {
              const col = i % 2; const row = Math.floor(i / 2)
              const x = pL + col * ((W - pL - 20) / 2); const y = 16 + row * 20
              return (
                <g key={it.label}>
                  <line x1={x} y1={y} x2={x + 24} y2={y} stroke={it.color} strokeWidth="2.6" strokeDasharray={it.dash || undefined} />
                  <text x={x + 30} y={y + 4} fill={INK} fontSize="11.5" fontWeight="bold">{it.label}</text>
                </g>
              )
            })
          }
          let lx = plotL
          return items.map((it) => {
            const x = lx
            lx += it.label.length * 7.4 + 66
            return (
              <g key={it.label}>
                <line x1={x} y1={legendY} x2={x + 32} y2={legendY} stroke={it.color} strokeWidth="2.8" strokeDasharray={it.dash || undefined} />
                {it.marker === 'tri' && <Triangle x={x + 16} y={legendY} color={it.color} />}
                {it.marker === 'dot' && <circle cx={x + 16} cy={legendY} r={4.5} fill={it.color} stroke="#fff" strokeWidth="1.4" />}
                <text x={x + 40} y={legendY + 4} fill={INK} fontSize="12.5" fontWeight="bold">{it.label}</text>
              </g>
            )
          })
        })()}

        {/* Grid + axes */}
        {yTicks.map((cs, i) => (
          <g key={i}>
            <line x1={plotL} y1={yOf(cs)} x2={plotR} y2={yOf(cs)} stroke={GRID} strokeWidth="1" />
            <text x={plotL - 10} y={yOf(cs) + 4} textAnchor="end" fill={AXIS} fontSize={mobile ? 13 : 12.5} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCs(cs)}</text>
          </g>
        ))}
        {years.map((y) => (
          <g key={y}>
            <line x1={xOf(y)} y1={plotT} x2={xOf(y)} y2={plotB} stroke={GRID} strokeWidth="1" />
            <text x={xOf(y)} y={plotB + (mobile ? 20 : 24)} textAnchor="middle" fill={AXIS} fontSize={mobile ? 13 : 13} fontWeight="bold">{y}</text>
          </g>
        ))}
        <rect x={plotL} y={plotT} width={pW} height={pH} fill="none" stroke={GRID} strokeWidth="1.4" />

        {/* Benchmark lines (right-anchored labels) */}
        {benchLines.map((b) => (
          <g key={b.label}>
            <line x1={plotL} y1={yOf(b.cs)} x2={plotR} y2={yOf(b.cs)} stroke={b.color} strokeWidth="2" strokeDasharray="3 5" />
            <text x={plotR - 4} y={yOf(b.cs) - 5} textAnchor="end" fontSize={mobile ? 11 : 12} fontWeight="bold" fill="#ffffff" stroke="#ffffff" strokeWidth="3" strokeLinejoin="round">{b.label}</text>
            <text x={plotR - 4} y={yOf(b.cs) - 5} textAnchor="end" fontSize={mobile ? 11 : 12} fontWeight="bold" fill={b.color}>{b.label}</text>
          </g>
        ))}

        {/* Depth line */}
        {depthPath && <path d={depthPath} fill="none" stroke={LIGHT_BLUE} strokeWidth="2.4" strokeDasharray="6 5" strokeLinejoin="round" strokeLinecap="round" />}
        {depthPts.map((s) => (
          <g key={`d${s.year}`}
            onMouseEnter={() => setTooltip({ key: `d${s.year}`, x: xOf(s.year), y: yOf(s.top8_avg_cs), rows: [`Top-8 average · ${s.year}`, `${formatCs(s.top8_avg_cs)} (${s.top8_count} swimmers)`] })}
            onMouseLeave={() => setTooltip((t) => (t && t.key === `d${s.year}` ? null : t))}
            onClick={(e) => { e.stopPropagation(); setTooltip((t) => (t && t.key === `d${s.year}` ? null : { key: `d${s.year}`, x: xOf(s.year), y: yOf(s.top8_avg_cs), rows: [`Top-8 average · ${s.year}`, `${formatCs(s.top8_avg_cs)} (${s.top8_count} swimmers)`] })) }}
            style={{ cursor: 'pointer' }}>
            <circle cx={xOf(s.year)} cy={yOf(s.top8_avg_cs)} r={mobile ? 14 : 10} fill="transparent" />
            <circle cx={xOf(s.year)} cy={yOf(s.top8_avg_cs)} r={4.5} fill={LIGHT_BLUE} stroke="#fff" strokeWidth="1.5" />
          </g>
        ))}

        {/* National best line */}
        {bestPath && <path d={bestPath} fill="none" stroke={NAVY} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />}
        {seasons.map((s) => {
          const tip = { key: `b${s.year}`, x: xOf(s.year), y: yOf(s.best_cs), rows: [`${s.year} national best`, `${s.best}${s.fina ? ` · ${s.fina} FINA` : ''}`, s.swimmer, (s.meet || '').substring(0, 36)] }
          return (
            <g key={`b${s.year}`}
              onMouseEnter={() => setTooltip(tip)}
              onMouseLeave={() => setTooltip((t) => (t && t.key === tip.key ? null : t))}
              onClick={(e) => { e.stopPropagation(); setTooltip((t) => (t && t.key === tip.key ? null : tip)) }}
              style={{ cursor: 'pointer' }}>
              <circle cx={xOf(s.year)} cy={yOf(s.best_cs)} r={mobile ? 16 : 12} fill="transparent" />
              <Triangle x={xOf(s.year)} y={yOf(s.best_cs)} color={NAVY} />
            </g>
          )
        })}

        {/* Time labels on best points (white halo) */}
        {seasons.map((s) => {
          const x = xOf(s.year); const y = yOf(s.best_cs) - 14
          const lbl = s.best
          return (
            <g key={`l${s.year}`}>
              <text x={x} y={y} textAnchor="middle" fontSize={mobile ? 13 : 12} fontWeight="bold" fill="#fff" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" opacity="0.9">{lbl}</text>
              <text x={x} y={y} textAnchor="middle" fontSize={mobile ? 13 : 12} fontWeight="bold" fill={INK} style={{ fontVariantNumeric: 'tabular-nums' }}>{lbl}</text>
            </g>
          )
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const rows = tooltip.rows.filter(Boolean)
          const th = 20 + rows.length * 17
          const tw = Math.min(W - 12, Math.max(160, ...rows.map((r) => r.length * 7.4)) + 26)
          const tx = Math.max(6, Math.min(tooltip.x - tw / 2, W - tw - 6))
          const below = tooltip.y + 16 + th <= H - 6
          const ty = below ? tooltip.y + 16 : Math.max(6, tooltip.y - 16 - th)
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={tx} y={ty} width={tw} height={th} fill="#fff" stroke={INK} strokeWidth="1.5" />
              {rows.map((r, i) => (
                <text key={i} x={tx + tw / 2} y={ty + 16 + i * 17} textAnchor="middle" fill={i <= 1 ? INK : '#58687c'} fontSize={i === 0 ? 12.5 : 11.5} fontWeight={i <= 1 ? 'bold' : 'normal'} style={{ fontVariantNumeric: 'tabular-nums' }}>{r}</text>
              ))}
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

function EventView({ data }) {
  if (!data) return <Loading label="Loading event progression" />
  const seasons = data.seasons || []
  if (!seasons.length) return <Empty label="No results for this event yet" />
  const benchmarks = data.benchmarks || {}
  const latest = seasons[seasons.length - 1]

  // Gap widgets vs each benchmark, from the latest season's best
  const gaps = []
  if (benchmarks.arab_record) gaps.push(['Arab Record', benchmarks.arab_record, GOLD])
  if (benchmarks.cut_a) gaps.push([`A Cut · ${benchmarks.cut_a.standard}`, benchmarks.cut_a, GREEN])
  if (benchmarks.cut_b) gaps.push([`B Cut · ${benchmarks.cut_b.standard}`, benchmarks.cut_b, '#7d8a99'])

  return (
    <div>
      {gaps.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
          {gaps.map(([label, b, color]) => {
            const diff = latest.best_cs - b.time_cs
            const ahead = diff <= 0
            return (
              <div key={label} style={{ border: `2px solid ${color}`, borderRadius: 8, padding: '10px 18px', minWidth: 170, textAlign: 'center' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color }}>{label}</div>
                <div className="asw-num" style={{ fontWeight: 800, fontSize: 20, color: INK, marginTop: 2 }}>{b.time}</div>
                <div className="asw-num" style={{ fontSize: 12.5, fontWeight: 700, marginTop: 2, color: ahead ? GREEN : RED }}>
                  {ahead ? `\u2713 ${formatCs(Math.abs(diff))} under` : `${formatCs(diff)} to go`}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <SeasonChart seasons={seasons} benchmarks={benchmarks} />

      <div className="table-scroll" style={{ marginTop: 18 }}>
        <table className="table" style={{ fontSize: 13 }}>
          <thead>
            <tr><th className="num">Season</th><th className="time">Best</th><th>Swimmer</th><th className="hide-mobile">Meet</th><th className="time">Top-8 Avg</th><th className="num">Depth</th><th className="num">Δ Best</th></tr>
          </thead>
          <tbody>
            {seasons.map((s, i) => {
              const prev = i > 0 ? seasons[i - 1] : null
              const diff = prev ? prev.best_cs - s.best_cs : null
              return (
                <tr key={s.year}>
                  <td className="num asw-num" style={{ fontWeight: 800 }}>{s.year}</td>
                  <td className="time asw-time" style={{ fontWeight: 800, color: NAVY }}>{s.best}</td>
                  <td><Link to={`/swimmers/${s.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>{s.swimmer}</Link></td>
                  <td className="text-muted hide-mobile" style={{ maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.meet}</td>
                  <td className="time asw-num">{s.top8_avg || '—'}</td>
                  <td className="num asw-num" title="Swimmers who raced this event this season">{s.swimmers_count}</td>
                  <td className="num asw-num" style={{ fontWeight: 700, color: diff == null ? '#8a9bb5' : diff > 0 ? GREEN : diff < 0 ? RED : '#8a9bb5' }}>
                    {diff == null ? '—' : diff === 0 ? '=' : `${diff > 0 ? '\u2193' : '\u2191'} ${formatCs(Math.abs(diff))}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ textAlign: 'center', fontSize: 11.5, color: '#8a9bb5', marginTop: 10 }}>
        Top-8 Avg = average of the federation's 8 fastest swimmers that season (depth of the system, not just the star) · Depth = swimmers who raced the event
      </div>
    </div>
  )
}

/* ── Records timeline ─────────────────────────────────────────────────── */

function RecordsView({ data }) {
  if (!data) return <Loading label="Loading record history" />
  const timeline = data.timeline || []
  if (!timeline.length) return <Empty label="No record history for this event" />

  const mobileStep = timeline.length > 1
  return (
    <div>
      {mobileStep && <StepChart timeline={timeline} />}
      <div className="table-scroll" style={{ marginTop: mobileStep ? 18 : 0 }}>
        <table className="table" style={{ fontSize: 13 }}>
          <thead>
            <tr><th style={{ width: 30 }}>#</th><th>Date</th><th className="time">Time</th><th>Swimmer</th><th className="hide-mobile">Meet</th><th className="num">Improved By</th><th>Stood For</th></tr>
          </thead>
          <tbody>
            {timeline.map((t, i) => {
              const next = timeline[i + 1]
              const isCurrent = !next
              let stood = '—'
              const from = t.date ? new Date(t.date) : null
              const to = next?.date ? new Date(next.date) : (isCurrent ? new Date() : null)
              if (from && to) {
                const days = Math.round((to - from) / 86400000)
                stood = days >= 365 ? `${(days / 365).toFixed(1)} yrs` : `${days} days`
                if (isCurrent) stood = `current · ${stood}`
              }
              return (
                <tr key={i} style={isCurrent ? { background: '#f4f8fc' } : undefined}>
                  <td className="asw-num">{i + 1}</td>
                  <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(t.date)}</td>
                  <td className="time asw-time" style={{ fontWeight: 800, color: isCurrent ? GOLD : NAVY }}>{t.time}</td>
                  <td><Link to={`/swimmers/${t.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>{t.swimmer}</Link>{isCurrent && <span className="tag tag-accent" style={{ marginLeft: 8 }}>Current</span>}</td>
                  <td className="text-muted hide-mobile" style={{ maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.meet}</td>
                  <td className="num asw-num" style={{ fontWeight: 700, color: GREEN }}>{t.improved_cs != null ? `\u2212${formatCs(t.improved_cs)}` : '—'}</td>
                  <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{stood}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ textAlign: 'center', fontSize: 11.5, color: '#8a9bb5', marginTop: 10 }}>
        Every swim that improved the federation's all-time best in this event, in chronological order
      </div>
    </div>
  )
}

function StepChart({ timeline }) {
  const mobile = useIsMobile()
  const W = mobile ? 460 : 1280
  const H = mobile ? 380 : 480
  const pL = mobile ? 76 : 110; const pR = mobile ? 24 : 60; const pT = 40; const pB = mobile ? 52 : 56
  const plotL = pL; const plotR = W - pR; const plotT = pT; const plotB = H - pB
  const pW = plotR - plotL; const pH = plotB - plotT

  const dates = timeline.map((t) => new Date(t.date).getTime())
  const now = Date.now()
  const t0 = Math.min(...dates); const t1 = Math.max(now, Math.max(...dates))
  const css = timeline.map((t) => t.time_cs)
  const minCs = Math.min(...css); const maxCs = Math.max(...css)
  const range = maxCs - minCs || 100
  const padMin = minCs - range * 0.15; const padMax = maxCs + range * 0.15

  const xOf = (ms) => t1 === t0 ? plotL + pW / 2 : plotL + ((ms - t0) / (t1 - t0)) * pW
  const yOf = (cs) => plotB - ((cs - padMin) / (padMax - padMin)) * pH

  // Step path: hold each record flat until the next one falls
  let d = ''
  timeline.forEach((t, i) => {
    const x = xOf(new Date(t.date).getTime()); const y = yOf(t.time_cs)
    if (i === 0) d += `M${x.toFixed(1)},${y.toFixed(1)}`
    else d += ` L${x.toFixed(1)},${yOf(timeline[i - 1].time_cs).toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)}`
  })
  d += ` L${xOf(now).toFixed(1)},${yOf(timeline[timeline.length - 1].time_cs).toFixed(1)}`

  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round(padMin + (i / 4) * (padMax - padMin)))
  const yearLabels = (() => {
    const startY = new Date(t0).getFullYear(); const endY = new Date(t1).getFullYear()
    const span = Math.max(1, endY - startY)
    const step = Math.ceil(span / (mobile ? 4 : 9))
    const out = []
    for (let y = startY; y <= endY; y += step) out.push(y)
    return out
  })()

  return (
    <div className="table-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }} fontFamily={FONT}>
        <rect width={W} height={H} fill="#fff" />
        {yTicks.map((cs, i) => (
          <g key={i}>
            <line x1={plotL} y1={yOf(cs)} x2={plotR} y2={yOf(cs)} stroke={GRID} strokeWidth="1" />
            <text x={plotL - 10} y={yOf(cs) + 4} textAnchor="end" fill={AXIS} fontSize={mobile ? 13 : 12.5} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCs(cs)}</text>
          </g>
        ))}
        {yearLabels.map((y) => {
          const x = xOf(new Date(`${y}-01-01`).getTime())
          if (x < plotL || x > plotR) return null
          return (
            <g key={y}>
              <line x1={x} y1={plotT} x2={x} y2={plotB} stroke={GRID} strokeWidth="1" />
              <text x={x} y={plotB + (mobile ? 20 : 24)} textAnchor="middle" fill={AXIS} fontSize={mobile ? 12.5 : 12.5} fontWeight="bold">{y}</text>
            </g>
          )
        })}
        <rect x={plotL} y={plotT} width={pW} height={pH} fill="none" stroke={GRID} strokeWidth="1.4" />
        <path d={d} fill="none" stroke={NAVY} strokeWidth="2.8" strokeLinejoin="round" />
        {timeline.map((t, i) => {
          const x = xOf(new Date(t.date).getTime()); const y = yOf(t.time_cs)
          const surname = (t.swimmer || '').split(' ').filter((w) => w === w.toUpperCase() && w.length > 1)[0] || (t.swimmer || '').split(' ').pop()
          return (
            <g key={i}>
              <Triangle x={x} y={y} color={i === timeline.length - 1 ? GOLD : NAVY} />
              <text x={x} y={y - 24} textAnchor="middle" fontSize={mobile ? 12.5 : 12} fontWeight="bold" fill="#fff" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" opacity="0.9">{t.time}</text>
              <text x={x} y={y - 24} textAnchor="middle" fontSize={mobile ? 12.5 : 12} fontWeight="bold" fill={INK} style={{ fontVariantNumeric: 'tabular-nums' }}>{t.time}</text>
              <text x={x} y={y - 11} textAnchor="middle" fontSize={mobile ? 10.5 : 10.5} fontWeight="bold" fill="#fff" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" opacity="0.9">{surname}</text>
              <text x={x} y={y - 11} textAnchor="middle" fontSize={mobile ? 10.5 : 10.5} fontWeight="bold" fill={AXIS}>{surname}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ── Main tab ─────────────────────────────────────────────────────────── */

export default function FederationProgressionTab({ countryId }) {
  const [sub, setSub] = useState('overview')
  const [sex, setSex] = useState('M')
  const [pool, setPool] = useState('LCM')
  const [eventId, setEventId] = useState(null)
  const cache = useRef({})
  const [overview, setOverview] = useState(null)
  const [eventData, setEventData] = useState(null)
  const [recordsData, setRecordsData] = useState(null)

  // Overview data doubles as the event-picker source (only events with data)
  useEffect(() => {
    const key = `ov|${sex}|${pool}`
    setOverview(null)
    if (cache.current[key]) { setOverview(cache.current[key]); return }
    let alive = true
    getCountryProgression(countryId, { view: 'overview', sex, pool })
      .then((r) => { if (alive) { cache.current[key] = r.data; setOverview(r.data) } })
      .catch(() => alive && setOverview({ years: [], events: [] }))
    return () => { alive = false }
  }, [countryId, sex, pool])

  const events = overview?.events || []
  // Keep a valid event selected whenever the list changes
  useEffect(() => {
    if (!events.length) return
    if (eventId && events.some((e) => e.event_id === Number(eventId))) return
    const preferred = events.find((e) => /100 ?m free/i.test(e.name)) || events[0]
    setEventId(String(preferred.event_id))
  }, [events]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sub !== 'event' || !eventId) return
    const key = `ev|${eventId}|${sex}|${pool}`
    setEventData(null)
    if (cache.current[key]) { setEventData(cache.current[key]); return }
    let alive = true
    getCountryProgression(countryId, { view: 'event', event: eventId, sex, pool })
      .then((r) => { if (alive) { cache.current[key] = r.data; setEventData(r.data) } })
      .catch(() => alive && setEventData({ seasons: [], benchmarks: {} }))
    return () => { alive = false }
  }, [countryId, sub, eventId, sex, pool])

  useEffect(() => {
    if (sub !== 'records' || !eventId) return
    const key = `rec|${eventId}|${sex}|${pool}`
    setRecordsData(null)
    if (cache.current[key]) { setRecordsData(cache.current[key]); return }
    let alive = true
    getCountryProgression(countryId, { view: 'records', event: eventId, sex, pool })
      .then((r) => { if (alive) { cache.current[key] = r.data; setRecordsData(r.data) } })
      .catch(() => alive && setRecordsData({ timeline: [] }))
    return () => { alive = false }
  }, [countryId, sub, eventId, sex, pool])

  const grouped = useMemo(() => {
    const g = {}
    events.forEach((e) => { (g[e.stroke || 'Other'] = g[e.stroke || 'Other'] || []).push(e) })
    return Object.entries(g)
  }, [events])

  return (
    <div className="pad-lg">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '4px 0 8px' }}>
        <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0b2948', margin: 0, textAlign: 'center' }}>Progression</h2>
        <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
      </div>
      <div style={{ textAlign: 'center', fontSize: 12.5, color: '#6b7d94', marginBottom: 4 }}>
        Season-best analysis — how the federation moves year over year
      </div>
      <SubTabs value={sub} onChange={setSub}
        options={[['overview', 'Overview'], ['event', 'By Event'], ['records', 'Record History']]} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
        {sub !== 'overview' && (
          <select className="select" style={{ width: 'auto', minWidth: 190 }} value={eventId || ''} onChange={(e) => setEventId(e.target.value)}>
            {grouped.map(([stroke, evs]) => (
              <optgroup key={stroke} label={stroke}>
                {evs.map((ev) => <option key={ev.event_id} value={ev.event_id}>{ev.name}</option>)}
              </optgroup>
            ))}
          </select>
        )}
        <Seg options={[{ value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }]} value={sex} onChange={setSex} />
        <Seg options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]} value={pool} onChange={setPool} />
      </div>

      {sub === 'overview' && (
        <OverviewHeatmap data={overview} onPickEvent={(id) => { setEventId(String(id)); setSub('event') }} />
      )}
      {sub === 'event' && (overview && !events.length ? <Empty label="No results for this selection" /> : <EventView data={eventData} />)}
      {sub === 'records' && (overview && !events.length ? <Empty label="No results for this selection" /> : <RecordsView data={recordsData} />)}
    </div>
  )
}
