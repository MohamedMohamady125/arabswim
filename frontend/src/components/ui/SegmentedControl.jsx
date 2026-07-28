import clsx from 'clsx'

/** Small view switch (e.g. Country/Club/Swimmer tally, LCM/SCM). */
export default function SegmentedControl({ options, value, onChange, className }) {
  return (
    <div className={clsx('inline-flex rounded-sm bg-ink-50 border border-ink-100 p-0.5 gap-0.5', className)} role="tablist">
      {options.map((opt) => {
        const isActive = value === opt.key
        return (
          <button
            key={opt.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.key)}
            className={clsx(
              'px-3 h-9 rounded-sm text-body-sm font-medium transition-colors whitespace-nowrap',
              isActive
                ? 'bg-white text-ink-900 shadow-card'
                : 'text-ink-400 hover:text-ink-700',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
