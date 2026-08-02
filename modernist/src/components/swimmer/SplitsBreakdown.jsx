import { useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

/* ── Split-time helpers ───────────────────────────────────────────────── */
export function splitTimeToCs(t) {
  if (!t) return null
  const m = String(t).trim().match(/^(?:(\d{1,2}):)?(\d{1,2})\.(\d{1,2})$/)
  if (!m) return null
  return (parseInt(m[1] || 0, 10) * 60 + parseInt(m[2], 10)) * 100 + parseInt(m[3].padEnd(2, '0'), 10)
}

export function csToSplitTime(cs) {
  if (cs == null) return '-'
  const neg = cs < 0
  const a = Math.abs(cs)
  const min = Math.floor(a / 6000)
  const sec = Math.floor((a % 6000) / 100)
  const hun = a % 100
  const body = min > 0
    ? `${min}:${String(sec).padStart(2, '0')}.${String(hun).padStart(2, '0')}`
    : `${sec}.${String(hun).padStart(2, '0')}`
  return neg ? `-${body}` : body
}

// Regroup cumulative splits at 50m or 100m granularity → [{distance, cum, cumCs, lapCs}]
export function regroupSplits(splits, by) {
  const parsed = (splits || [])
    .map((s) => ({ distance: s.distance, cum: s.time, cumCs: splitTimeToCs(s.time) }))
    .filter((s) => s.cumCs != null)
  let pts = parsed
  if (by === 100) {
    const hundreds = parsed.filter((s) => s.distance != null && s.distance % 100 === 0)
    if (hundreds.length >= 2) pts = hundreds
  }
  let prev = 0
  return pts.map((p) => { const lapCs = p.cumCs - prev; prev = p.cumCs; return { ...p, lapCs } })
}

// Split label with European comma decimal, e.g. "28,69"
export function fmtSplitComma(cs) {
  return cs == null ? '-' : csToSplitTime(cs).replace('.', ',')
}

// hex → rgba string for subtle column tints
function hexRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// Series colors: Finals = solid navy w/ round markers,
// Prelims = dashed light navy w/ square markers
const FINALS_COLOR = '#1c4e86'
const PRELIMS_COLOR = '#4a8fc0'
const GRID = '#dde4ec'
const AXIS_TEXT = '#78879a'

export default function SplitsBreakdown({ splits, eventName, roundType, compareSplits, compareRoundType }) {
  const stroke = (eventName || '').replace(/^\d+\s*[Mm]?\s*/, '').trim() || ''
  const isPrelims = (rt) => /prelim|heat/i.test(rt || '')

  const [by, setBy] = useState(50)
  const [fs, setFs] = useState(false)

  // Can we offer a 50/100 toggle? Only if raw splits include sub-100 marks.
  const rawDists = (splits || []).map((s) => s.distance).filter((d) => d != null)
  const canToggle = rawDists.some((d) => d % 100 !== 0) && rawDists.some((d) => d % 100 === 0)
  const gran = canToggle ? by : 50

  const laps = regroupSplits(splits, gran)
  const compareLaps = (compareSplits || []).length ? regroupSplits(compareSplits, gran) : []

  // Build series: primary = expanded row, compare = sibling round (if compatible)
  const series = [{ laps, roundType: roundType || 'Finals' }]
  if (compareLaps.length >= 2 && compareLaps.length === laps.length) {
    series.push({ laps: compareLaps, roundType: compareRoundType || (isPrelims(roundType) ? 'Finals' : 'Prelims') })
  }
  const hasBoth = series.length === 2

  // Order columns Prelims → Finals for the comparison table
  const pSeries = series.find((s) => isPrelims(s.roundType))
  const fSeries = series.find((s) => !isPrelims(s.roundType))
  const cols = hasBoth ? [pSeries || series[0], fSeries || series[1]] : [series[0]]
  const colColor = (col, idx) =>
    (hasBoth ? idx === 0 : isPrelims(col.roundType)) ? PRELIMS_COLOR : FINALS_COLOR
  const nRows = Math.max(...cols.map((c) => c.laps.length))

  let chart = null
  if (laps.length >= 2) {
    const W = 480
    const H = hasBoth ? 190 : 160
    const PX = 40
    const PY = 26
    const allLaps = series.flatMap((s) => s.laps.map((r) => r.lapCs))
    const minCs = Math.min(...allLaps)
    const maxCs = Math.max(...allLaps)
    // Round y-domain to whole seconds with breathing room
    const lo = Math.floor((minCs - 40) / 100) * 100
    const hi = Math.ceil((maxCs + 40) / 100) * 100
    const range = Math.max(hi - lo, 100)
    const n = laps.length
    const x = (i) => PX + (i * (W - PX - 16)) / (n - 1)
    // Slower lap sits higher on the chart
    const y = (v) => H - PY - ((v - lo) / range) * (H - 2 * PY)

    // ~4 whole-second gridlines
    const tickStep = Math.max(100, Math.ceil(range / 4 / 100) * 100)
    const ticks = []
    for (let t = lo; t <= hi; t += tickStep) ticks.push(t)

    const styleFor = (rt) => isPrelims(rt)
      ? { color: PRELIMS_COLOR, dash: '6 4', marker: 'square' }
      : { color: FINALS_COLOR, dash: null, marker: 'circle' }

    chart = (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 480, height: 'auto', display: 'block' }}>
        {/* gridlines + y-axis second labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PX} y1={y(t)} x2={W - 16} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={PX - 6} y={y(t) + 3} textAnchor="end" fill={AXIS_TEXT} style={{ fontSize: 9, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(t / 100)}s
            </text>
          </g>
        ))}
        {/* series lines (compare drawn first so primary sits on top) */}
        {[...series].reverse().map((s, si) => {
          const st = styleFor(s.roundType)
          return (
            <polyline key={si} points={s.laps.map((r, i) => `${x(i)},${y(r.lapCs)}`).join(' ')}
              fill="none" stroke={st.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={st.dash || undefined} />
          )
        })}
        {/* markers + point labels */}
        {series.map((s, si) => {
          const st = styleFor(s.roundType)
          const prelims = isPrelims(s.roundType)
          // when both shown: prelims labels above, finals labels below
          const labelAbove = hasBoth ? prelims : true
          return s.laps.map((r, i) => (
            <g key={`${si}-${i}`}>
              {st.marker === 'square' ? (
                <rect x={x(i) - 3.5} y={y(r.lapCs) - 3.5} width="7" height="7" fill={st.color} stroke="#ffffff" strokeWidth="1.5" />
              ) : (
                <circle cx={x(i)} cy={y(r.lapCs)} r="4" fill={st.color} stroke="#ffffff" strokeWidth="1.5" />
              )}
              <text x={x(i)} y={labelAbove ? y(r.lapCs) - 9 : y(r.lapCs) + 16} textAnchor="middle" fill={st.color}
                style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {fmtSplitComma(r.lapCs)}
              </text>
            </g>
          ))
        })}
        {/* x-axis distance labels */}
        {laps.map((r, i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fill={AXIS_TEXT} style={{ fontSize: 9, fontWeight: 600 }}>
            {r.distance ? `${r.distance}` : `#${i + 1}`}
          </text>
        ))}
      </svg>
    )
  }

  const controls = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      {canToggle ? (
        <div className="seg">
          {[50, 100].map((v) => (
            <button key={v} type="button" className={`seg-opt${by === v ? ' on' : ''}`} onClick={() => setBy(v)}>
              Split by {v}
            </button>
          ))}
        </div>
      ) : <span />}
      <button type="button" className="btn btn-secondary btn-icon" onClick={() => setFs((f) => !f)}
        aria-label={fs ? 'Exit fullscreen' : 'Fullscreen'}>
        {fs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
    </div>
  )

  const legend = chart && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 6 }}>
      {(hasBoth ? ['Prelims', 'Finals'] : [roundType || 'Finals']).map((rt) => (
        <span key={rt} className="micro" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true">
            <line x1="1" y1="5" x2="21" y2="5" stroke={isPrelims(rt) ? PRELIMS_COLOR : FINALS_COLOR}
              strokeWidth="2.5" strokeDasharray={isPrelims(rt) ? '5 3' : undefined} strokeLinecap="round" />
            {isPrelims(rt)
              ? <rect x="8" y="2" width="6" height="6" fill={PRELIMS_COLOR} stroke="#fff" strokeWidth="1" />
              : <circle cx="11" cy="5" r="3.5" fill={FINALS_COLOR} stroke="#fff" strokeWidth="1" />}
          </svg>
          {rt}
        </span>
      ))}
    </div>
  )

  const table = (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          <th scope="col" style={{ padding: '6px 8px 6px 0' }}></th>
          {cols.map((c, idx) => (
            <th key={idx} scope="col"
              style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800, color: '#ffffff', backgroundColor: colColor(c, idx) }}>
              {isPrelims(c.roundType) ? 'Prelims' : 'Finals'}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: nRows }).map((_, i) => (
          <tr key={i} style={{ borderTop: '1px solid var(--color-divider)' }}>
            <td style={{ padding: '6px 8px 6px 0', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {cols[0].laps[i]?.distance ? `${cols[0].laps[i].distance} ${stroke}`.trim() : `Split ${i + 1}`}
            </td>
            {cols.map((c, idx) => {
              const r = c.laps[i]
              const prev = c.laps[i - 1]
              const diffCs = r && prev ? r.lapCs - prev.lapCs : null
              return (
                <td key={idx} style={{ padding: '6px 8px', textAlign: 'center', verticalAlign: 'top', backgroundColor: hexRgba(colColor(c, idx), i % 2 === 0 ? 0.09 : 0.03) }}>
                  <div className="asw-time" style={{ fontSize: 14 }}>{r ? fmtSplitComma(r.lapCs) : '-'}</div>
                  <div className="asw-num" style={{
                    fontSize: 11,
                    color: diffCs == null ? 'var(--color-neutral-400)' : diffCs > 0 ? 'var(--asw-slow)' : diffCs < 0 ? 'var(--asw-fast)' : 'var(--color-neutral-600)',
                  }}>
                    {diffCs == null ? '—' : `${diffCs > 0 ? '+' : diffCs < 0 ? '-' : ''}${fmtSplitComma(Math.abs(diffCs))}`}
                  </div>
                </td>
              )
            })}
          </tr>
        ))}
        <tr style={{ borderTop: '2px solid var(--color-divider)' }}>
          <td style={{ padding: '6px 8px 6px 0', fontWeight: 800 }}>Total</td>
          {cols.map((c, idx) => {
            const last = c.laps[c.laps.length - 1]
            return (
              <td key={idx} className="asw-time" style={{ padding: '6px 8px', textAlign: 'center', backgroundColor: hexRgba(colColor(c, idx), 0.13) }}>
                {last ? last.cum : '-'}
              </td>
            )
          })}
        </tr>
      </tbody>
    </table>
  )

  const body = (
    <div style={{ maxWidth: fs ? 720 : 480, margin: fs ? '0 auto' : undefined }}>
      {controls}
      {chart && (
        <div style={{ marginBottom: 12 }}>
          {legend}
          {chart}
        </div>
      )}
      {table}
    </div>
  )

  if (fs) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#ffffff', overflow: 'auto', padding: 24 }}>
        {body}
      </div>
    )
  }
  return body
}
