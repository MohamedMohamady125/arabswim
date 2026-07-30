import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Trophy } from 'lucide-react'
import { getComputedRecords, getRecords, deleteRecord } from '../api/records'
import { getCountries } from '../api/core'
import DataTable from '../components/common/DataTable'
import CountryFlag from '../components/common/CountryFlag'
import { PageHeader, Tabs, FilterBar, Select, FieldLabel, Button, ConfirmDialog, EmptyState, TableSkeleton, SegmentedControl } from '../components/ui'
import { TimeDisplay, EventLabel, SwimmerCell } from '../components/domain'
import { POOL_TYPES, AGE_GROUPS, MANUAL_RECORD_SCOPES, formatDate } from '../utils/constants'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const COMPUTED_SCOPES = ['national', 'arab', 'gcc']

export default function RecordsPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const isAdmin = !!token
  const toast = useToast()
  const [records, setRecords] = useState([])
  const [manualRecords, setManualRecords] = useState([])
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [filters, setFilters] = useState({
    scope: 'arab', country: '', gender: '', pool: 'LCM', age_group: 'OPEN',
  })

  const isManualScope = !COMPUTED_SCOPES.includes(filters.scope)

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
  }, [])

  const loadRecords = () => {
    setLoading(true)
    if (isManualScope) {
      const params = { record_type: filters.scope, pool: filters.pool, page_size: 500 }
      if (filters.gender) params.gender = filters.gender
      getRecords(params).then(res => {
        setManualRecords(Array.isArray(res.data) ? res.data : res.data.results || [])
      }).catch(() => {}).finally(() => setLoading(false))
    } else {
      const params = { ...filters }
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k] })
      getComputedRecords(params).then(res => {
        setRecords(res.data)
      }).catch(() => {}).finally(() => setLoading(false))
    }
  }

  useEffect(() => { loadRecords() }, [filters])

  const updateFilter = (key, value) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'scope' && prev.country) {
        const selectedCountry = countries.find(c => c.id.toString() === prev.country.toString())
        if (selectedCountry) {
          const region = selectedCountry.region
          if (value === 'gcc' && region !== 'GCC') next.country = ''
          else if (value === 'arab' && region !== 'ARAB' && region !== 'GCC') next.country = ''
        }
      }
      return next
    })
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await deleteRecord(pendingDelete)
      toast.success('Record deleted')
      loadRecords()
    } catch {
      toast.error('Failed to delete record')
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  const individualRecords = records.filter(r => !r.is_relay)
  const relayRecords = records.filter(r => r.is_relay)
  const menRecords = individualRecords.filter(r => r.gender === 'M')
  const womenRecords = individualRecords.filter(r => r.gender === 'F')
  const menRelayRecords = relayRecords.filter(r => r.gender === 'M')
  const womenRelayRecords = relayRecords.filter(r => r.gender === 'F')

  const sortManual = list => [...list].sort((a, b) =>
    ((a.event_detail?.sort_order ?? 99) - (b.event_detail?.sort_order ?? 99)) ||
    ((a.event_detail?.distance ?? 0) - (b.event_detail?.distance ?? 0)))
  const menManual = sortManual(manualRecords.filter(r => r.swimmer_detail?.sex === 'M'))
  const womenManual = sortManual(manualRecords.filter(r => r.swimmer_detail?.sex === 'F'))

  const scopeTabs = [
    ...COMPUTED_SCOPES.map(s => ({ key: s, label: s === 'national' ? 'National' : s.toUpperCase() })),
    ...MANUAL_RECORD_SCOPES.map(s => ({ key: s.value, label: s.label })),
  ]

  const computedColumns = (isRelay) => [
    { key: 'event_name', label: 'Event', render: r => <EventLabel name={r.event_name} /> },
    { key: 'swimmer_name', label: isRelay ? 'Team' : 'Swimmer',
      render: r => <span className="font-medium">{r.swimmer_name}</span> },
    { key: 'nationality', label: isRelay ? 'Country' : 'Nat.',
      render: r => (
        <span title={r.nationality}>
          <CountryFlag code={r.nationality_code} flagUrl={r.nationality_flag} />
        </span>
      ) },
    { key: 'time', label: 'Time', align: 'end', render: r => <TimeDisplay time={r.time} /> },
    { key: 'fina_points', label: 'FINA', numeric: true, render: r => r.fina_points || '-' },
    { key: 'championship_name', label: 'Championship' },
    { key: 'championship_country', label: 'Location',
      render: r => <CountryFlag code={r.championship_country_code} flagUrl={r.championship_country_flag} name={r.championship_country} /> },
    { key: 'date', label: 'Date', render: r => formatDate(r.date) },
  ]

  const computedMobileRender = (r) => (
    <div className="flex items-center gap-2.5 sm:gap-3">
      <div className="flex-1 min-w-0">
        <EventLabel name={r.event_name} className="mb-0.5" />
        <div className="flex items-center gap-1.5 min-w-0">
          <CountryFlag code={r.nationality_code} flagUrl={r.nationality_flag} className="shrink-0 [&>img]:w-5 [&>img]:h-[15px]" />
          <span className="text-body-sm font-medium text-ink-900 truncate">{r.swimmer_name}</span>
        </div>
        <div className="text-body-sm text-ink-400 truncate">
          {[r.championship_name, formatDate(r.date)].filter(Boolean).join(' · ')}
        </div>
      </div>
      <TimeDisplay time={r.time} className="shrink-0" />
    </div>
  )

  const manualColumns = [
    { key: 'event', label: 'Event', render: r => <EventLabel name={r.event_detail?.name} /> },
    { key: 'swimmer', label: 'Swimmer', render: r => r.swimmer_detail ? (
      <SwimmerCell
        name={r.swimmer_detail.name}
        countryCode={r.swimmer_detail.nationality_detail?.code}
        flagUrl={r.swimmer_detail.nationality_detail?.flag_url}
        onClick={() => navigate(`/swimmers/${r.swimmer_detail.id}`)}
      />
    ) : '-' },
    { key: 'time', label: 'Time', align: 'end', render: r => <TimeDisplay time={r.formatted_time} /> },
    { key: 'location', label: 'Meet / Location', render: r => (
      <span className="flex items-center gap-1.5 min-w-0">
        {r.country_detail && <CountryFlag code={r.country_detail.code} flagUrl={r.country_detail.flag_url} className="shrink-0" />}
        <span className="truncate">{[r.meet_name, r.location].filter(Boolean).join(' · ') || '-'}</span>
      </span>
    ) },
    { key: 'result_date', label: 'Date', render: r => formatDate(r.result_date) },
    ...(isAdmin ? [{ key: 'actions', label: '', align: 'end', render: r => (
      <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <Button variant="ghost" size="sm" icon={Pencil} aria-label="Edit record"
          onClick={() => navigate(`/records/${r.id}/edit`)} />
        <Button variant="ghost" size="sm" icon={Trash2} aria-label="Delete record"
          className="hover:text-neg" onClick={() => setPendingDelete(r.id)} />
      </span>
    ) }] : []),
  ]

  const manualMobileRender = (r) => (
    <div className="flex items-center gap-2.5 sm:gap-3">
      <div className="flex-1 min-w-0">
        <EventLabel name={r.event_detail?.name} className="mb-0.5" />
        <div className="text-body-sm font-medium text-ink-900 truncate">{r.swimmer_detail?.name || '-'}</div>
        <div className="text-body-sm text-ink-400 truncate">
          {[r.meet_name, r.location, formatDate(r.result_date)].filter(Boolean).join(' · ')}
        </div>
      </div>
      <TimeDisplay time={r.formatted_time} className="shrink-0" />
      {isAdmin && (
        <span className="inline-flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="sm" icon={Pencil} aria-label="Edit record"
            onClick={() => navigate(`/records/${r.id}/edit`)} />
          <Button variant="ghost" size="sm" icon={Trash2} aria-label="Delete record"
            className="hover:text-neg" onClick={() => setPendingDelete(r.id)} />
        </span>
      )}
    </div>
  )

  const RecordSection = ({ title, columns, data, mobileRender, emptyMessage }) => (
    <section className="mb-4 sm:mb-5">
      <h2 className="text-title text-ink-900 mb-3">{title}</h2>
      <DataTable columns={columns} data={data} mobileRender={mobileRender} emptyMessage={emptyMessage} />
    </section>
  )

  const activeChips = [
    filters.country && {
      key: 'country',
      label: countries.find(c => c.id.toString() === filters.country.toString())?.name || 'Country',
      onRemove: () => updateFilter('country', ''),
    },
    filters.gender && {
      key: 'gender',
      label: filters.gender === 'M' ? 'Male' : 'Female',
      onRemove: () => updateFilter('gender', ''),
    },
    { key: 'pool', label: filters.pool },
  ].filter(Boolean)

  return (
    <div>
      <PageHeader
        title="Records"
        subtitle="National, Arab and continental swimming records"
        action={isAdmin && (
          <Link to={`/records/new${isManualScope ? `?type=${filters.scope}` : ''}`}>
            <Button variant="secondary" size="sm" icon={Plus}>Add Record</Button>
          </Link>
        )}
      />

      <Tabs tabs={scopeTabs} active={filters.scope} onChange={v => updateFilter('scope', v)} className="mb-4" />

      <FilterBar chips={activeChips} onReset={() => setFilters(prev => ({ ...prev, country: '', gender: '', pool: 'LCM', age_group: 'OPEN' }))}>
        {!isManualScope && (
          <div className="w-full md:w-48">
            <FieldLabel>Country</FieldLabel>
            <Select value={filters.country} onChange={(e) => updateFilter('country', e.target.value)}>
              <option value="">All</option>
              {countries
                .filter(c => {
                  if (filters.scope === 'gcc') return c.region === 'GCC'
                  return c.region === 'ARAB' || c.region === 'GCC'
                })
                .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        )}
        <div className="w-full md:w-36">
          <FieldLabel>Gender</FieldLabel>
          <Select value={filters.gender} onChange={(e) => updateFilter('gender', e.target.value)}>
            <option value="">Both</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </Select>
        </div>
        <div className="w-full md:w-48">
          <FieldLabel>Pool</FieldLabel>
          <Select value={filters.pool} onChange={(e) => updateFilter('pool', e.target.value)}>
            {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </div>
      </FilterBar>

      {!isManualScope && (
        <div className="mb-4 overflow-x-auto scrollbar-hide">
          <SegmentedControl
            options={AGE_GROUPS.map(ag => ({ key: ag, label: ag }))}
            value={filters.age_group}
            onChange={v => updateFilter('age_group', v)}
          />
        </div>
      )}

      {isManualScope ? (
        loading ? (
          <TableSkeleton rows={8} />
        ) : (
          <>
            {(!filters.gender || filters.gender === 'M') &&
              <RecordSection title="Men" columns={manualColumns} data={menManual} mobileRender={manualMobileRender} emptyMessage="No records added yet." />}
            {(!filters.gender || filters.gender === 'F') &&
              <RecordSection title="Women" columns={manualColumns} data={womenManual} mobileRender={manualMobileRender} emptyMessage="No records added yet." />}
          </>
        )
      ) : filters.scope === 'national' && !filters.country ? (
        <EmptyState icon={Trophy} title="Select a country" hint="Choose a country above to view its national records." />
      ) : loading ? (
        <TableSkeleton rows={8} />
      ) : records.length === 0 ? (
        <EmptyState icon={Trophy} title={`No ${filters.pool === 'LCM' ? '50m (LCM)' : '25m (SCM)'} records found`}
          hint={`Try switching the pool to ${filters.pool === 'LCM' ? '25m (SCM)' : '50m (LCM)'} or changing the age group.`} />
      ) : (
        <>
          {(!filters.gender || filters.gender === 'M') &&
            <RecordSection title="Men" columns={computedColumns(false)} data={menRecords} mobileRender={computedMobileRender} emptyMessage="No records found." />}
          {(!filters.gender || filters.gender === 'F') &&
            <RecordSection title="Women" columns={computedColumns(false)} data={womenRecords} mobileRender={computedMobileRender} emptyMessage="No records found." />}
          {(!filters.gender || filters.gender === 'M') && menRelayRecords.length > 0 &&
            <RecordSection title="Men Relay" columns={computedColumns(true)} data={menRelayRecords} mobileRender={computedMobileRender} emptyMessage="No records found." />}
          {(!filters.gender || filters.gender === 'F') && womenRelayRecords.length > 0 &&
            <RecordSection title="Women Relay" columns={computedColumns(true)} data={womenRelayRecords} mobileRender={computedMobileRender} emptyMessage="No records found." />}
        </>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete record"
        message="This record will be permanently deleted. This cannot be undone."
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
