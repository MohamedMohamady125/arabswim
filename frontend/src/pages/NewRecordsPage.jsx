import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { getRecords } from '../api/records'
import { FilterBar, Select, SearchInput, FieldLabel, PageHeader, EmptyState, CardsSkeleton } from '../components/ui'
import { RecordCard } from '../components/domain'
import { RECORD_TYPES, formatDate } from '../utils/constants'

export default function NewRecordsPage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [searchName, setSearchName] = useState('')

  useEffect(() => {
    const params = { is_new: 'true' }
    if (filterType) params.record_type = filterType
    if (searchName) params.search = searchName
    setLoading(true)
    getRecords(params)
      .then(res => setRecords(res.data.results || res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterType, searchName])

  const chips = [
    filterType && {
      key: 'type',
      label: RECORD_TYPES.find(t => t.value === filterType)?.label || filterType,
      onRemove: () => setFilterType(''),
    },
    searchName && { key: 'search', label: `"${searchName}"`, onRemove: () => setSearchName('') },
  ].filter(Boolean)

  return (
    <div>
      <PageHeader title="New Records" subtitle="Recently broken records across all scopes" />

      <FilterBar chips={chips} onReset={() => { setFilterType(''); setSearchName('') }}>
        <div className="w-full md:w-48">
          <FieldLabel>Record type</FieldLabel>
          <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {RECORD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </div>
        <div className="w-full md:w-64">
          <FieldLabel>Swimmer</FieldLabel>
          <SearchInput placeholder="Search by name..." value={searchName}
            onChange={(e) => setSearchName(e.target.value)} />
        </div>
      </FilterBar>

      {loading ? (
        <CardsSkeleton count={6} />
      ) : records.length === 0 ? (
        <EmptyState icon={Sparkles} title="No new records"
          hint="No recently broken records match these filters." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {records.map(r => (
            <RecordCard
              key={r.id}
              isNew
              scope={r.record_type}
              event={r.event_detail?.name}
              time={r.formatted_time}
              date={formatDate(r.result_date)}
              meet={r.location}
              holder={r.swimmer_detail ? {
                name: r.swimmer_detail.name,
                countryCode: r.swimmer_detail.nationality_detail?.code,
                flagUrl: r.swimmer_detail.nationality_detail?.flag_url,
              } : undefined}
              onClick={r.swimmer_detail ? () => navigate(`/swimmers/${r.swimmer_detail.id}`) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
