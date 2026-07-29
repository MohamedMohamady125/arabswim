import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

/**
 * Every page starts with this. `breadcrumb`: [{ label, to? }].
 */
export default function PageHeader({ title, subtitle, breadcrumb, action }) {
  return (
    <div className="mb-3 sm:mb-5 md:mb-6">
      {breadcrumb?.length > 0 && (
        <nav className="flex items-center gap-1 text-body-sm text-ink-400 mb-2" aria-label="Breadcrumb">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={13} />}
              {item.to ? (
                <Link to={item.to} className="hover:text-aqua-600">{item.label}</Link>
              ) : (
                <span className="text-ink-500">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display text-ink-900">{title}</h1>
          {subtitle && <p className="text-body text-ink-500 mt-0.5 sm:mt-1">{subtitle}</p>}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
    </div>
  )
}
