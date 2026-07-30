import clsx from 'clsx'

/**
 * Token-styled data table.
 *
 * Column options (all optional, existing call sites keep working):
 *  - `align: 'end'`   → right-aligned (use for times/ranks/points)
 *  - `numeric: true`  → right-aligned + tabular figures
 *  - `sticky: true`   → sticky first column on horizontal scroll
 *
 * `mobileRender(row)` — when provided, <md screens render a tappable card
 * list instead of a squeezed table (no horizontal scrolling).
 */
export default function DataTable({ columns, data, onRowClick, emptyMessage = 'No data found', mobileRender }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-md border border-ink-100 shadow-card p-8 text-center text-body-sm text-ink-400">
        {emptyMessage}
      </div>
    )
  }

  const table = (
    <div className="bg-white rounded-md border border-ink-100 shadow-card overflow-hidden">
      <div className="overflow-x-auto overscroll-x-contain max-w-full">
        <table className="w-full">
          <thead>
            <tr className="bg-ink-900">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={clsx(
                    'px-2.5 md:px-4 py-2.5 text-label text-white/70 whitespace-nowrap',
                    col.align === 'end' || col.numeric ? 'text-end' : 'text-start',
                    col.sticky && 'sticky start-0 bg-ink-900 z-10',
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {data.map((row, i) => (
              <tr
                key={row.id || i}
                onClick={() => onRowClick?.(row)}
                className={clsx('h-11', onRowClick && 'hover:bg-ink-50 cursor-pointer transition-colors')}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      'px-2.5 md:px-4 py-2.5 text-body-sm text-ink-900 whitespace-nowrap',
                      (col.align === 'end' || col.numeric) && 'text-end',
                      col.numeric && 'tnum font-medium',
                      col.sticky && 'sticky start-0 bg-white z-10',
                    )}
                  >
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  if (!mobileRender) return table

  return (
    <>
      <div className="hidden md:block">{table}</div>
      <div className="md:hidden bg-white rounded-md border border-ink-100 shadow-card divide-y divide-ink-100 overflow-hidden">
        {data.map((row, i) => (
          <div
            key={row.id || i}
            onClick={() => onRowClick?.(row)}
            className={clsx('px-3 py-2.5 min-h-11', onRowClick && 'active:bg-ink-50 cursor-pointer')}
          >
            {mobileRender(row)}
          </div>
        ))}
      </div>
    </>
  )
}
