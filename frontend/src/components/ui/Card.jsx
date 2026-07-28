import clsx from 'clsx'

export default function Card({ title, action, footer, padding = 'md', className, children }) {
  return (
    <section className={clsx('bg-white rounded-md shadow-card border border-ink-100', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-ink-100">
          {title && <h3 className="text-title text-ink-900">{title}</h3>}
          {action}
        </header>
      )}
      <div className={clsx(padding === 'none' ? '' : 'p-4 md:p-5')}>{children}</div>
      {footer && (
        <footer className="px-4 md:px-5 py-3 border-t border-ink-100">{footer}</footer>
      )}
    </section>
  )
}
