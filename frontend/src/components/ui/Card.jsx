import clsx from 'clsx'

export default function Card({ title, action, footer, padding = 'md', className, children }) {
  return (
    <section className={clsx('bg-white rounded-md shadow-card border border-ink-100', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between px-3 sm:px-4 md:px-5 py-2.5 sm:py-3 border-b border-ink-100 bg-ink-50/50">
          {title && (
            <h3 className="text-title text-ink-900 flex items-center gap-2">
              <span className="w-1 self-stretch my-1 rounded-full bg-gradient-to-b from-aqua-400 to-aqua-600 shrink-0" aria-hidden="true" />
              {title}
            </h3>
          )}
          {action}
        </header>
      )}
      <div className={clsx(padding === 'none' ? '' : 'p-3 sm:p-4 md:p-5')}>{children}</div>
      {footer && (
        <footer className="px-3 sm:px-4 md:px-5 py-2.5 sm:py-3 border-t border-ink-100">{footer}</footer>
      )}
    </section>
  )
}
