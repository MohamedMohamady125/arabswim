export default function Pagination({ count, next, previous, onPageChange, currentPage = 1, pageSize = 25 }) {
  const totalPages = Math.ceil(count / pageSize)

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 mt-4 sm:mt-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!previous}
        className="px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        ← Prev
      </button>
      <span className="text-xs sm:text-sm text-gray-600">
        {currentPage}/{totalPages || 1}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!next}
        className="px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        Next →
      </button>
    </div>
  )
}
