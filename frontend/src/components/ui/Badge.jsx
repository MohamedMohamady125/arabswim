import clsx from 'clsx'

const VARIANTS = {
  'pool-lcm': 'bg-lcm/10 text-lcm',
  'pool-scm': 'bg-scm/10 text-scm',
  scope: 'bg-ink-900 text-white',
  status: 'bg-ink-100 text-ink-500',
  record: 'bg-record/10 text-record',
  medal: 'bg-gold/15 text-gold',
  aqua: 'bg-aqua-100 text-aqua-600',
  pos: 'bg-pos/10 text-pos',
  neg: 'bg-neg/10 text-neg',
}

export default function Badge({ variant = 'status', className, children }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label whitespace-nowrap',
      VARIANTS[variant] || VARIANTS.status, className,
    )}>
      {children}
    </span>
  )
}

/** Convenience: LCM / SCM pool badge with the site-wide color convention. */
export function PoolBadge({ pool, className }) {
  const isLcm = pool === 'LCM'
  return (
    <Badge variant={isLcm ? 'pool-lcm' : 'pool-scm'} className={className}>
      {isLcm ? 'LCM 50m' : 'SCM 25m'}
    </Badge>
  )
}
