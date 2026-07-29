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
    <div className={clsx('mb-3 md:mb-5', className)}>
      {/* Desktop row */}
      <div className="hidden md:flex flex-wrap items-center gap-2.5 [&>*]:min-w-0 [&>*]:max-w-full">{children}</div>

      {/* Mobile: chips + Filters button */}
      <div className="flex md:hidden items-center gap-2 min-w-0 max-w-full">
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-hide overscroll-x-contain">
          {chips.length === 0 && (
            <span className="text-body-sm text-ink-400 py-2 whitespace-nowrap">All results</span>
          )}
          {chips.map((chip) => (
            <span key={chip.key}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-aqua-100 text-aqua-600 ps-3 pe-1.5 h-8 text-body-sm font-medium">
              {chip.label}
              {chip.onRemove && (
                <button onClick={chip.onRemove} aria-label={`Remove ${chip.label} filter`}
                  className="p-2 -my-2 -me-0.5 rounded-full hover:bg-aqua-50 flex items-center justify-center">
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
        <Button variant="secondary" icon={SlidersHorizontal} className="shrink-0" onClick={() => setSheetOpen(true)}>
          Filters
        </Button>
      </div>

      {/* Mobile bottom sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-ink-950/60 backdrop-blur-sm flex items-end"
          onClick={() => setSheetOpen(false)}>
          <div className="bg-white rounded-t-lg shadow-pop w-full max-w-[100vw] max-h-[85vh] overflow-y-auto overscroll-contain animate-fade-up"
            onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between px-4 py-3.5 border-b border-ink-100 sticky top-0 bg-white rounded-t-lg">
              <h2 className="text-title text-ink-900">Filters</h2>
              <button onClick={() => setSheetOpen(false)} aria-label="Close" className="p-2 -me-2 text-ink-400 hover:text-ink-900">
                <X size={18} />
              </button>
            </header>
            <div className="p-4 flex flex-col gap-3 [&>*]:min-w-0 [&>*]:max-w-full [&_select]:w-full [&_input]:w-full">{children}</div>
            <footer className="px-4 py-3 border-t border-ink-100 flex gap-2 sticky bottom-0 bg-white">
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
