import MedalDot, { RankNumber } from './MedalDots'

/**
 * Standard G/S/B tally table. `rows`: [{ id, entity (node), gold, silver,
 * bronze }] pre-sorted gold-first. `onRowClick(row)` optional.
 */
export default function MedalTally({ rows, entityLabel = 'Country', onRowClick }) {
  return (
    <div className="bg-white rounded-md border border-ink-100 shadow-card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-ink-50 border-b border-ink-100">
            <th scope="col" className="px-3 md:px-4 py-2.5 text-label text-ink-400 text-start w-10">#</th>
            <th scope="col" className="px-3 md:px-4 py-2.5 text-label text-ink-400 text-start">{entityLabel}</th>
            <th scope="col" className="px-2 md:px-3 py-2.5 text-center w-12"><MedalDot type="gold" /></th>
            <th scope="col" className="px-2 md:px-3 py-2.5 text-center w-12"><MedalDot type="silver" /></th>
            <th scope="col" className="px-2 md:px-3 py-2.5 text-center w-12"><MedalDot type="bronze" /></th>
            <th scope="col" className="px-3 md:px-4 py-2.5 text-label text-ink-400 text-end w-16">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row, i) => (
            <tr
              key={row.id || i}
              onClick={() => onRowClick?.(row)}
              className={`h-11 ${onRowClick ? 'hover:bg-ink-50 cursor-pointer transition-colors' : ''}`}
            >
              <td className="px-3 md:px-4"><RankNumber rank={i + 1} /></td>
              <td className="px-3 md:px-4 py-2">{row.entity}</td>
              <td className="px-2 md:px-3 text-center text-body-sm tnum font-semibold text-ink-900">{row.gold || 0}</td>
              <td className="px-2 md:px-3 text-center text-body-sm tnum font-medium text-ink-500">{row.silver || 0}</td>
              <td className="px-2 md:px-3 text-center text-body-sm tnum font-medium text-ink-500">{row.bronze || 0}</td>
              <td className="px-3 md:px-4 text-end text-body-sm tnum font-bold text-ink-900">
                {(row.gold || 0) + (row.silver || 0) + (row.bronze || 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
