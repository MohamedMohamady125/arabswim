import clsx from 'clsx'

const STROKE_COLORS = {
  freestyle: '#0891B2',
  backstroke: '#7C3AED',
  breaststroke: '#059669',
  butterfly: '#B45309',
  medley: '#DC2626',
  im: '#DC2626',
}

function strokeColor(name = '') {
  const n = name.toLowerCase()
  for (const [key, color] of Object.entries(STROKE_COLORS)) {
    if (n.includes(key)) return color
  }
  return '#6B7A8E'
}

/** "100m Freestyle" with a stroke color dot. */
export default function EventLabel({ name, dot = true, className }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 max-w-full min-w-0 text-body-sm text-ink-900 whitespace-nowrap', className)}>
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: strokeColor(name) }} />
      )}
      <span className="min-w-0 truncate">{name}</span>
    </span>
  )
}
