import { RankNumber } from './MedalDots'
import SwimmerCell from './SwimmerCell'
import TimeDisplay from './TimeDisplay'

/**
 * One ranking row: rank (top-3 in medal colors), swimmer identity, time,
 * optional FINA points and meet/date meta. Works inside a divide-y list.
 */
export default function RankRow({ rank, swimmer, time, points, meta, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2.5 min-h-11 ${onClick ? 'hover:bg-ink-50 cursor-pointer transition-colors' : ''}`}
    >
      <span className="w-7 text-center shrink-0"><RankNumber rank={rank} /></span>
      <div className="flex-1 min-w-0">
        <SwimmerCell {...swimmer} />
        {meta && <div className="text-body-sm text-ink-400 truncate mt-0.5">{meta}</div>}
      </div>
      <div className="text-end shrink-0">
        <TimeDisplay time={time} />
        {points != null && (
          <div className="text-label normal-case tracking-normal font-normal text-ink-400 tnum">{points} pts</div>
        )}
      </div>
    </div>
  )
}
