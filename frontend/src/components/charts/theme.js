/**
 * One chart system for the whole site. All hand-rolled SVG charts consume
 * these constants so every chart looks like a sibling of the others.
 */
export const CHART = {
  grid: '#E8EDF2',        // ink-100 gridlines
  axisText: '#6B7A8E',    // ink-400 tick labels
  primary: '#0891B2',     // aqua-600 primary series
  primaryFill: 'rgba(207, 250, 254, 0.55)', // aqua-100 area fill
  compare: '#6B7A8E',     // ink-400 comparison series
  positive: '#059669',
  negative: '#DC2626',
  record: '#7C3AED',
  point: { r: 3, stroke: '#FFFFFF', strokeWidth: 1.5 },
  tickFont: 'font-size:10px;font-weight:600;letter-spacing:0.08em',
  series: ['#0891B2', '#7C3AED', '#B45309', '#059669', '#DC2626', '#6B7A8E'],
}

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

/**
 * Build an inverted-Y scale for swim times: lower time = higher on chart.
 * Returns y(value) mapping [min,max] → [padTop, height-padBottom] inverted.
 */
export function timeScale(values, height, padTop = 12, padBottom = 24) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return (v) => padTop + ((v - min) / span) * (height - padTop - padBottom)
}
