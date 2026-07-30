import { Link } from 'react-router-dom'
import { Home, ChevronRight } from 'lucide-react'

/**
 * Breadcrumb navigation.
 * `items`: [{ label, to? }] — last item (no `to`) renders as current page.
 */
export default function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-body-sm text-ink-400 py-2 overflow-x-auto scrollbar-hide">
      <Link to="/" className="shrink-0 hover:text-aqua-600 transition-colors p-0.5">
        <Home size={14} />
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5 shrink-0">
          <ChevronRight size={12} className="text-ink-200" />
          {item.to ? (
            <Link to={item.to} className="hover:text-aqua-600 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink-700 font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
