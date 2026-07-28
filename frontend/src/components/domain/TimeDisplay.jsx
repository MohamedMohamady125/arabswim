import clsx from 'clsx'
import { Star } from 'lucide-react'

/**
 * Renders a swim time ("1:02.34" / "58.31") with tabular figures.
 * `delta` (string like "-0.42" / "+0.18") colors green when faster (negative)
 * and red when slower. `record`/`pb` add a star marker.
 */
export default function TimeDisplay({ time, delta, record = false, pb = false, size = 'md', className }) {
  const deltaNegative = typeof delta === 'string' && delta.trim().startsWith('-')
  return (
    <span className={clsx('inline-flex items-center gap-1.5', className)}>
      <span className={clsx(
        'text-ink-900',
        size === 'lg' ? 'text-time-lg' : 'text-time',
        record && 'text-record',
      )}>
        {time}
      </span>
      {delta && (
        <span className={clsx('text-body-sm font-medium tnum', deltaNegative ? 'text-pos' : 'text-neg')}>
          {delta}
        </span>
      )}
      {(record || pb) && (
        <Star size={12} className={record ? 'text-record fill-record' : 'text-gold fill-gold'} aria-label={record ? 'Record' : 'Personal best'} />
      )}
    </span>
  )
}
