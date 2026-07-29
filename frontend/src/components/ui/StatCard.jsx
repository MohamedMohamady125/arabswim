import clsx from 'clsx'
import { TrendingUp, TrendingDown } from 'lucide-react'

/**
 * Label + big number/time + optional delta arrow + icon.
 * `value` renders in time-lg with tabular figures; pass `animate` for countUp.
 */
export default function StatCard({ label, value, delta, deltaGood, icon: Icon, animate = false, className }) {
  return (
    <div className={clsx('bg-white rounded-md shadow-card border border-ink-100 p-3 sm:p-4 flex items-start justify-between gap-2 sm:gap-3', className)}>
      <div className="min-w-0">
        <div className="text-label text-ink-400 mb-1">{label}</div>
        <div className={clsx('text-time-lg text-ink-900 truncate', animate && 'animate-count-up')}>{value}</div>
        {delta != null && (
          <div className={clsx('flex items-center gap-1 mt-1 text-body-sm font-medium', deltaGood ? 'text-pos' : 'text-neg')}>
            {deltaGood ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {delta}
          </div>
        )}
      </div>
      {Icon && (
        <span className="shrink-0 w-9 h-9 rounded-sm bg-aqua-50 text-aqua-600 flex items-center justify-center">
          <Icon size={18} />
        </span>
      )}
    </div>
  )
}
