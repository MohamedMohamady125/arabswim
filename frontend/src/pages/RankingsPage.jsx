import { useState, useEffect } from 'react'
import { ListOrdered } from 'lucide-react'
import { getRankings } from '../api/rankings'
import { getCountries, getEvents } from '../api/core'
import Pagination from '../components/common/Pagination'
import { PageHeader, Tabs, FilterBar, Select, FieldLabel, SegmentedControl, Card, EmptyState, Breadcrumbs } from '../components/ui'
import { RankRow } from '../components/domain'
import { POOL_TYPES, AGE_GROUPS, formatDate } from '../utils/constants'

export default function RankingsPage() {
  const [rankings, setRankings] = useState([])
  const [countries, setCountries] = useState([])
  const [events, setEvents] = useState([])
  const [pagination, setPagination] = useState({})
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    scope: 'national', country: '', gender: 'M', year: '', pool: 'LCM', event: '', age_group: 'OPEN'
  })

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
    getEvents({ has_results: true }).then(res => {
      setEvents(res.data)
      // Auto-select first non-relay event
      if (res.data.length && !filters.event) {
        const first = res.data.find(e => !e.is_relay) || res.data[0]
        setFilters(prev => ({ ...prev, event: first.id.toString() }))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!filters.event) {
      setRankings([])
      setPagination({})
      return
    }
    const params = { page, ...filters }
    Object.keys(params).forEach(k => { if (!params[k]) delete params[k] })
    getRankings(params).then(res => {
      setRankings(res.data.results || res.data)
      if (res.data.count !== undefined) {
        setPagination({ count: res.data.count, next: res.data.next, previous: res.data.previous })
      }
    }).catch(() => {})
  }, [page, filters])

  const updateFilter = (key, value) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value }
      // Clear country if scope changed and the selected country doesn't belong to the new region
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
    setPage(1)
  }

  const years = []
  for (let y = new Date().getFullYear(); y >= 2000; y--) years.push(y)

  const selectedEvent = events.find(e => e.id.toString() === filters.event)
  const isRelay = selectedEvent?.is_relay

  const chips = [
    filters.country && {
      key: 'country',
      label: countries.find(c => c.id.toString() === filters.country.toString())?.name || 'Country',
      onRemove: () => updateFilter('country', ''),
    },
    { key: 'gender', label: filters.gender === 'M' ? 'Male' : 'Female' },
    filters.year && { key: 'year', label: filters.year, onRemove: () => updateFilter('year', '') },
    { key: 'pool', label: filters.pool },
    selectedEvent && { key: 'event', label: selectedEvent.name },
  ].filter(Boolean)

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Rankings' }]} />
      <PageHeader title="Rankings" subtitle="All-time and yearly best performances by event" />

      <Tabs
        tabs={['national', 'arab', 'gcc'].map(s => ({ key: s, label: s === 'national' ? 'National' : s.toUpperCase() }))}
        active={filters.scope}
        onChange={v => updateFilter('scope', v)}
        className="mb-4"
      />

      <FilterBar chips={chips}>
        <div className="w-full md:w-44">
          <FieldLabel>Country</FieldLabel>
          <Select value={filters.country} onChange={(e) => updateFilter('country', e.target.value)}>
            <option value="">All</option>
            {countries
              .filter(c => {
                if (filters.scope === 'gcc') return c.region === 'GCC'
                if (filters.scope === 'arab') return c.region === 'ARAB' || c.region === 'GCC'
                return true
              })
              .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="w-full md:w-32">
          <FieldLabel>Gender</FieldLabel>
          <Select value={filters.gender} onChange={(e) => updateFilter('gender', e.target.value)}>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </Select>
        </div>
        <div className="w-full md:w-36">
          <FieldLabel>Year</FieldLabel>
          <Select value={filters.year} onChange={(e) => updateFilter('year', e.target.value)}>
            <option value="">All-time</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
        <div className="w-full md:w-44">
          <FieldLabel>Pool</FieldLabel>
          <Select value={filters.pool} onChange={(e) => updateFilter('pool', e.target.value)}>
            {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </div>
        <div className="w-full md:w-52">
          <FieldLabel>Event</FieldLabel>
          <Select value={filters.event} onChange={(e) => updateFilter('event', e.target.value)}>
            <option value="">Select event</option>
            {(() => {
              const STROKE_ORDER = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley', 'Freestyle Relay', 'Medley Relay']
              // 100m IM only exists in SCM, not LCM
              const filteredEvents = filters.pool === 'LCM'
                ? events.filter(e => !(e.stroke === 'Individual Medley' && e.distance === 100))
                : events
              const grouped = {}
              for (const e of filteredEvents) {
                const stroke = e.stroke || 'Other'
                if (!grouped[stroke]) grouped[stroke] = []
                grouped[stroke].push(e)
              }
              // Sort each group by distance
              Object.values(grouped).forEach(arr => arr.sort((a, b) => a.distance - b.distance))
              const strokes = Object.keys(grouped).sort((a, b) => {
                const ai = STROKE_ORDER.indexOf(a)
                const bi = STROKE_ORDER.indexOf(b)
                return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
              })
              return strokes.map(stroke => (
                <optgroup key={stroke} label={stroke}>
                  {grouped[stroke].map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </optgroup>
              ))
            })()}
          </Select>
        </div>
      </FilterBar>

      <div className="mb-4 overflow-x-auto scrollbar-hide">
        <SegmentedControl
          options={AGE_GROUPS.map(ag => ({ key: ag, label: ag }))}
          value={filters.age_group}
          onChange={v => updateFilter('age_group', v)}
        />
      </div>

      {rankings.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={ListOrdered}
            title={filters.event ? 'No rankings found' : 'Select an event'}
            hint={filters.event
              ? 'No rankings found for these filters.'
              : 'Select an event above to view rankings.'}
          />
        </Card>
      ) : (
        <Card padding="none" title={selectedEvent ? `${selectedEvent.name} — ${filters.gender === 'M' ? 'Men' : 'Women'}` : undefined}>
          <div className="max-h-[700px] overflow-y-auto divide-y divide-ink-100">
            {rankings.map((r, i) => {
              const prevTime = i > 0 ? rankings[i - 1].time_centiseconds : null
              const isTied = prevTime !== null && r.time_centiseconds === prevTime
              return (
                <RankRow
                  key={i}
                  rank={isTied ? '=' : r.rank}
                  swimmer={{
                    name: r.swimmer_name,
                    countryCode: r.nationality_code,
                    flagUrl: r.nationality_flag,
                  }}
                  time={r.time}
                  points={r.fina_points || undefined}
                  meta={[r.championship_name, r.championship_country, formatDate(r.date)].filter(Boolean).join(' · ')}
                />
              )
            })}
          </div>
        </Card>
      )}

      {pagination.count > 0 && <Pagination {...pagination} currentPage={page} onPageChange={setPage} pageSize={50} />}
    </div>
  )
}
