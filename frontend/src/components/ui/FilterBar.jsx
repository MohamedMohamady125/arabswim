import { useState } from 'react'
import clsx from 'clsx'
import { SlidersHorizontal, X } from 'lucide-react'
import Button from './Button'

/**
 * THE consistency fixer for filter rows.
 *
 * Desktop (md+): renders children (Selects/SearchInputs/toggles) in one
 * wrapping row above the content.
 * Mobile: shows active-filter chips + a "Filters" button opening a bottom
 * sheet containing the same children, with Apply/Reset.
 *
 * `chips`: [{ key, label, onRemove }] — the currently-active filters.
 * `onReset`: clears all filters.
 */
export default function FilterBar({ children, chips = [], onReset, className }) {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className={clsx('mb-4 md:mb-5', className)}>
      {/* Desktop row */}
      <div className="hidden md:flex flex-wrap items-center gap-2.5">{children}</div>

      {/* Mobile: chips + Filters button */}
      <div className="flex md:hidden items-center gap-2">
        <div className="flex-1 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {chips.length === 0 && (
            <span className="text-body-sm text-ink-400 py-2">All results</span>
          )}
          {chips.map((chip) => (
            <span key={chip.key}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-aqua-100 text-aqua-600 ps-3 pe-1.5 h-8 text-body-sm font-medium">
              {chip.label}
              {chip.onRemove && (
                <button onClick={chip.onRemove} aria-label={`Remove ${chip.label} filter`}
                  className="p-1 rounded-full hover:bg-aqua-50">
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
        <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => setSheetOpen(true)}>
          Filters
        </Button>
      </div>

      {/* Mobile bottom sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-ink-950/60 backdrop-blur-sm flex items-end"
          onClick={() => setSheetOpen(false)}>
          <div className="bg-white rounded-t-lg shadow-pop w-full max-h-[85vh] overflow-y-auto animate-fade-up"
            onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100 sticky top-0 bg-white rounded-t-lg">
              <h2 className="text-title text-ink-900">Filters</h2>
              <button onClick={() => setSheetOpen(false)} aria-label="Close" className="p-2 -me-2 text-ink-400 hover:text-ink-900">
                <X size={18} />
              </button>
            </header>
            <div className="p-5 flex flex-col gap-3">{children}</div>
            <footer className="px-5 py-4 border-t border-ink-100 flex gap-2 sticky bottom-0 bg-white">
              {onReset && (
                <Button variant="secondary" className="flex-1" onClick={() => { onReset(); setSheetOpen(false) }}>
                  Reset
                </Button>
              )}
              <Button className="flex-1" onClick={() => setSheetOpen(false)}>Apply</Button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
