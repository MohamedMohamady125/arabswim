import clsx from 'clsx'

/**
 * Underline tabs. `tabs`: [{ key, label, icon? }]. Horizontally scrollable on
 * mobile with hidden scrollbar; pass `sticky` to stick under the app header.
 */
export default function Tabs({ tabs, active, onChange, sticky = false, className }) {
  return (
    <div className={clsx(
      'border-b border-ink-100 bg-white',
      sticky && 'sticky top-16 z-30',
      className,
    )}>
      <nav className="flex gap-1 max-w-full overflow-x-auto scrollbar-hide overscroll-x-contain px-1" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = active === tab.key
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              className={clsx(
                'flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-body-sm font-medium border-b-[3px] -mb-px transition-colors min-h-11',
                isActive
                  ? 'text-aqua-600 border-aqua-600 bg-aqua-50/60 rounded-t-sm'
                  : 'text-ink-400 border-transparent hover:text-ink-700 hover:bg-ink-50',
              )}
            >
              {Icon && <Icon size={16} />}
              {tab.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
