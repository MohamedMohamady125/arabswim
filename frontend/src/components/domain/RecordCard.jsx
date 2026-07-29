import Badge, { PoolBadge } from '../ui/Badge'
import TimeDisplay from './TimeDisplay'
import SwimmerCell from './SwimmerCell'
import EventLabel from './EventLabel'

/**
 * A record entry: scope badge, event, big time, holder, meet + date.
 * `isNew` gives the NEW flash treatment for NewRecordsPage.
 */
export default function RecordCard({ scope, event, pool, time, holder, meet, date, isNew = false, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-md border shadow-card p-4 transition-colors ${
        isNew ? 'border-record/40 bg-record/[0.03]' : 'border-ink-100'
      } ${onClick ? 'cursor-pointer hover:border-aqua-500/40' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {scope && <Badge variant="scope">{scope}</Badge>}
          {pool && <PoolBadge pool={pool} />}
          {isNew && <Badge variant="record">NEW</Badge>}
        </div>
        {date && <span className="text-label normal-case tracking-normal font-normal text-ink-400">{date}</span>}
      </div>
      <div className="flex items-end justify-between gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
          <EventLabel name={event} className="mb-1" />
          {holder && <SwimmerCell {...holder} />}
          {meet && <div className="text-body-sm text-ink-400 truncate mt-1">{meet}</div>}
        </div>
        <TimeDisplay time={time} size="lg" record={isNew} className="shrink-0" />
      </div>
    </div>
  )
}
