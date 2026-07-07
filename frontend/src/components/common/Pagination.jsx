export default function Pagination({ count, next, previous, onPageChange, currentPage = 1, pageSize = 25 }) {
  const totalPages = Math.ceil(count / pageSize)

  return (
    <div className="flex items-center justify-center gap-4 mt-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!previous}
        className="px-4 py-2 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        ← Previous
      </button>
      <span className="text-sm text-gray-600">
        Page {currentPage} of {totalPages || 1} ({count} results)
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!next}
        className="px-4 py-2 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        Next →
      </button>
    </div>
  )
}
