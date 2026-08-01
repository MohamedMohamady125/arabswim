import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, User, Trophy } from 'lucide-react'
import { getRecords } from '../api/records'
import { Tabs, EmptyState, Badge, PoolBadge, Breadcrumbs, Skeleton } from '../components/ui'
import CountryFlag from '../components/common/CountryFlag'
import { TimeDisplay, EventLabel } from '../components/domain'
import { formatDate } from '../utils/constants'

const SCOPES = [
  { key: '', label: 'All' },
  { key: 'NATIONAL', label: 'National' },
  { key: 'ARAB', label: 'Arab' },
  { key: 'GCC', label: 'GCC' },
]

const SCOPE_COLORS = {
  NATIONAL: 'bg-lcm',
  ARAB: 'bg-pos',
  GCC: 'bg-record',
  AFRICAN: 'bg-pos',
  ASIAN: 'bg-aqua-600',
  MEDITERRANEAN: 'bg-lcm',
  ISLAMIC: 'bg-scm',
}

export default function NewRecordsPage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState('')

  useEffect(() => {
    const params = { is_new: 'true' }
    if (scope) params.record_type = scope
    setLoading(true)
    getRecords(params)
      .then(res => setRecords(res.data.results || res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [scope])

  // Group records by scope
  const grouped = {}
  for (const r of records) {
    const key = r.record_type
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(r)
  }
  const scopeOrder = ['NATIONAL', 'ARAB', 'GCC', 'AFRICAN', 'ASIAN', 'MEDITERRANEAN', 'ISLAMIC']
  const orderedScopes = scopeOrder.filter(s => grouped[s]?.length > 0)

  return (
    <div>
      <Breadcrumbs items={[{ label: 'New Records' }]} />
      <h1 className="text-display text-ink-900 mb-1">New Records</h1>
      <p className="text-body text-ink-500 mb-4">Recently broken records across Arab swimming</p>

      {/* Scope tabs */}
      <Tabs
        tabs={SCOPES.map(s => ({ key: s.key, label: s.label }))}
        active={scope}
        onChange={setScope}
        className="mb-5 rounded-t-md"
      />

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-md" />)}
        </div>
      ) : records.length === 0 ? (
        <EmptyState icon={Sparkles} title="No new records" hint="No recently broken records match this scope." />
      ) : scope ? (
        /* Single scope — flat list */
        <div className="space-y-3">
          {records.map(r => <RecordRow key={r.id} record={r} navigate={navigate} />)}
        </div>
      ) : (
        /* All scopes — grouped with headers */
        <div className="space-y-6">
          {orderedScopes.map(s => (
            <div key={s}>
              <div className="flex items-center gap-3 mb-3">
                <Badge variant={s === 'ARAB' ? 'pos' : s === 'GCC' ? 'aqua' : s === 'NATIONAL' ? 'pool-lcm' : 'record'} className="text-body-sm px-3 py-1">
                  {s} RECORDS
                </Badge>
                <span className="text-body-sm text-ink-400 tnum">{grouped[s].length} record{grouped[s].length !== 1 ? 's' : ''}</span>
                <div className="flex-1 h-px bg-ink-100" />
              </div>
              <div className="space-y-3">
                {grouped[s].map(r => <RecordRow key={r.id} record={r} navigate={navigate} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RecordRow({ record: r, navigate }) {
  const swimmer = r.swimmer_detail
  const nat = swimmer?.nationality_detail

  return (
    <div
      onClick={() => swimmer && navigate(`/swimmers/${swimmer.id}`)}
      className="bg-white rounded-md shadow-card border border-ink-100 hover:shadow-hover hover:border-aqua-500/25 transition-all duration-200 cursor-pointer flex items-stretch overflow-hidden"
    >
      {/* Left — record info */}
      <div className="flex-1 p-4 sm:p-5 min-w-0">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge variant={r.record_type === 'ARAB' ? 'pos' : r.record_type === 'GCC' ? 'aqua' : r.record_type === 'NATIONAL' ? 'pool-lcm' : 'record'}>
            {r.record_type}
          </Badge>
          <PoolBadge pool={r.pool} />
          <Badge variant="status"><Sparkles size={10} className="me-1" />NEW</Badge>
        </div>
        <EventLabel name={r.event_detail?.name} className="font-bold text-ink-900 text-body sm:text-title mb-2" />
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-time-lg text-aqua-600">{r.formatted_time}</span>
        </div>
        <div className="flex items-center gap-1.5 text-body-sm text-ink-700 font-medium">
          {nat && <CountryFlag code={nat.code} flagUrl={nat.flag_url} className="[&>img]:w-5 [&>img]:h-[15px]" />}
          <span>{swimmer?.name || '—'}</span>
        </div>
        <div className="text-body-sm text-ink-400 mt-1">
          {[r.meet_name || r.location, formatDate(r.result_date)].filter(Boolean).join(' · ')}
        </div>
      </div>

      {/* Right — swimmer photo */}
      <div className="w-24 sm:w-32 shrink-0 bg-ink-50 flex items-center justify-center">
        {swimmer?.photo ? (
          <img src={swimmer.photo} alt={swimmer.name} className="w-full h-full object-cover" />
        ) : (
          <User size={36} className="text-ink-200" />
        )}
      </div>
    </div>
  )
}
