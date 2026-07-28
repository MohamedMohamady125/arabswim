import clsx from 'clsx'

export default function Skeleton({ className }) {
  return <div className={clsx('skeleton rounded-sm', className)} aria-hidden="true" />
}

/** Ready-made skeleton for table-shaped content. */
export function TableSkeleton({ rows = 8 }) {
  return (
    <div className="bg-white rounded-md shadow-card border border-ink-100 overflow-hidden">
      <div className="bg-ink-50 h-10" />
      <div className="divide-y divide-ink-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 h-11">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 flex-1 max-w-48" />
            <Skeleton className="h-4 w-16 ms-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Ready-made skeleton for card grids. */
export function CardsSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-md shadow-card border border-ink-100 p-4">
          <Skeleton className="h-32 w-full mb-3" />
          <Skeleton className="h-5 w-2/3 mb-2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  )
}
