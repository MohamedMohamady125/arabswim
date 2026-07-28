import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ count, next, previous, onPageChange, currentPage = 1, pageSize = 25 }) {
  const totalPages = Math.ceil(count / pageSize)

  return (
    <div className="flex items-center justify-center gap-3 mt-5">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!previous}
        aria-label="Previous page"
        className="inline-flex items-center gap-1 h-10 px-4 text-body-sm font-medium bg-white border border-ink-200 rounded-sm hover:border-aqua-500/40 hover:bg-aqua-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={16} /> Prev
      </button>
      <span className="text-body-sm text-ink-500 tnum">
        {currentPage}/{totalPages || 1}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!next}
        aria-label="Next page"
        className="inline-flex items-center gap-1 h-10 px-4 text-body-sm font-medium bg-white border border-ink-200 rounded-sm hover:border-aqua-500/40 hover:bg-aqua-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Next <ChevronRight size={16} />
      </button>
    </div>
  )
}
