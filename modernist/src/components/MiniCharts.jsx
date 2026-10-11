/* Shared mini-chart primitives for entity analytics widgets.
   Flat SVG / CSS bars, brand tokens only (see theme.css) — no invented colors.
   Mirrors the style of QuickStatsView's internal charts so widgets look
   consistent across swimmer / club / federation / meet / home pages. */

const NAVY = 'var(--color-accent)'
const NAVY_DARK = 'var(--color-accent-800)'
const BLUE = 'var(--color-accent-2)'
const GOLD = 'var(--asw-gold)'
const MUTED = 'var(--color-neutral-600)'
const TRACK = 'var(--color-neutral-100)'

export const CHART_COLORS = { NAVY, NAVY_DARK, BLUE, GOLD }

/* Card wrapper with a kicker title + optional sub-caption. */
export function MiniPanel({ title, subtitle, children, style }) {
  return (
    <div style={{ border: '1px solid var(--color-divider)', borderRadius: 10, padding: '14px 16px', background: '#fff', ...style }}>
      {title && (
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: NAVY_DARK }}>{title}</div>
      )}
      {subtitle && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{subtitle}</div>}
      <div style={{ marginTop: title ? 12 : 0 }}>{children}</div>
    </div>
  )
}

/* Vertical bars. data: [{ label, value, color? }] */
export function MiniBars({ data, color = NAVY, height = 130 }) {
  if (!data || !data.length) return null
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span className="asw-num" style={{ fontSize: 11, fontWeight: 800, color: NAVY_DARK }}>{d.value}</span>
          <div style={{ width: '100%', maxWidth: 30, height: Math.max(3, Math.round((d.value / max) * height)), background: d.color || color, borderRadius: '3px 3px 0 0' }} />
          <span style={{ fontSize: 9.5, fontWeight: 600, color: MUTED, textAlign: 'center', lineHeight: 1.25, overflowWrap: 'anywhere' }}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/* Horizontal bars. rows: [{ label, value, color?, sub? }] */
export function MiniHBars({ rows, color = NAVY, labelWidth = 140 }) {
  if (!rows || !rows.length) return null
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: labelWidth, flex: 'none', fontSize: 11, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>
          <div style={{ flex: 1, background: TRACK, borderRadius: 3 }}>
            <div style={{ width: `${Math.max((r.value / max) * 100, 2)}%`, height: 14, background: r.color || color, borderRadius: 3 }} />
          </div>
          <span className="asw-num" style={{ width: 40, flex: 'none', textAlign: 'right', fontSize: 11.5, fontWeight: 800, color: NAVY_DARK }}>{r.sub || r.value}</span>
        </div>
      ))}
    </div>
  )
}

/* Donut. segments: [{ label, value, color }] */
export function MiniDonut({ segments, size = 150, thickness = 26, centerTop, centerBot }) {
  const total = (segments || []).reduce((s, x) => s + x.value, 0) || 1
  const r = (size - thickness) / 2
  const C = 2 * Math.PI * r
  let acc = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={thickness} />
      {(segments || []).map((s, i) => {
        const frac = s.value / total
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color}
            strokeWidth={thickness} strokeDasharray={`${frac * C} ${C}`}
            strokeDashoffset={-acc * C} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <title>{`${s.label}: ${s.value}`}</title>
          </circle>
        )
        acc += frac
        return el
      })}
      {centerTop != null && (
        <text x="50%" y={centerBot ? '48%' : '54%'} textAnchor="middle"
          style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, fill: NAVY_DARK }}>{centerTop}</text>
      )}
      {centerBot && (
        <text x="50%" y="61%" textAnchor="middle"
          style={{ fontWeight: 700, fontSize: 8.5, letterSpacing: '0.09em', fill: MUTED }}>{centerBot}</text>
      )}
    </svg>
  )
}

/* Single-line trend chart. points: [{ label, value }] */
export function MiniLine({ points, color = NAVY, fmt }) {
  if (!points || points.length < 2) return null
  const W = 340; const H = 150; const padX = 30; const padT = 24; const padB = 26
  const vals = points.map((p) => p.value)
  const min = Math.min(...vals); const max = Math.max(...vals)
  const span = (max - min) || 1
  const x = (i) => padX + (i * (W - 2 * padX)) / Math.max(points.length - 1, 1)
  const y = (v) => padT + (1 - (v - min) / span) * (H - padT - padB)
  const path = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')
  const label = (v) => (fmt ? fmt(v) : v)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
      <polyline points={`${x(0)},${H - padB + 4} ${path} ${x(points.length - 1)},${H - padB + 4}`}
        fill="color-mix(in srgb, var(--color-accent) 8%, transparent)" stroke="none" />
      <polyline points={path} fill="none" stroke={color} strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="3.5" fill={color} />
          <text x={x(i)} y={y(p.value) - 8} textAnchor="middle"
            style={{ fontWeight: 800, fontSize: 10.5, fill: NAVY_DARK }}>{label(p.value)}</text>
          <text x={x(i)} y={H - 8} textAnchor="middle"
            style={{ fontWeight: 600, fontSize: 9.5, fill: MUTED }}>{p.label}</text>
        </g>
      ))}
    </svg>
  )
}

/* Diverging male/female age pyramid. rows: [{ label, male, female }] */
export function AgePyramid({ rows }) {
  if (!rows || !rows.length) return null
  const max = Math.max(...rows.map((r) => Math.max(r.male, r.female)), 1)
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span style={{ flex: 1, textAlign: 'right', color: NAVY_DARK }}>Men</span>
        <span style={{ width: 54, flex: 'none' }} />
        <span style={{ flex: 1, color: BLUE }}>Women</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: `${(r.male / max) * 100}%`, minWidth: r.male ? 3 : 0, height: 14, background: NAVY, borderRadius: '3px 0 0 3px' }} title={`Men ${r.label}: ${r.male}`} />
          </div>
          <span style={{ width: 54, flex: 'none', textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: 'var(--color-text)' }}>{r.label}</span>
          <div style={{ flex: 1 }}>
            <div style={{ width: `${(r.female / max) * 100}%`, minWidth: r.female ? 3 : 0, height: 14, background: BLUE, borderRadius: '0 3px 3px 0' }} title={`Women ${r.label}: ${r.female}`} />
          </div>
        </div>
      ))}
    </div>
  )
}
