import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Medal } from 'lucide-react'
import { getMedalSummary, getMedalSwimmerSummary, getMedalClubSummary } from '../api/medals'
import { getChampionships, getClassifications, getSubClassifications } from '../api/championships'
import CountryFlag from '../components/common/CountryFlag'
import { PageHeader, FilterBar, Select, FieldLabel, SegmentedControl, StatCard, Card, EmptyState } from '../components/ui'
import { MedalTally, MedalDot } from '../components/domain'

const GoldDot = (props) => <MedalDot type="gold" {...props} />
const SilverDot = (props) => <MedalDot type="silver" {...props} />
const BronzeDot = (props) => <MedalDot type="bronze" {...props} />

export default function MedalsPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialChampionship = searchParams.get('championship') || ''
  const [summary, setSummary] = useState([])
  const [swimmerSummary, setSwimmerSummary] = useState([])
  const [clubSummary, setClubSummary] = useState([])
  const [championships, setChampionships] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])
  const [filterClassification, setFilterClassification] = useState('')
  const [filterSub, setFilterSub] = useState('')
  const [selectedChampionship, setSelectedChampionship] = useState(initialChampionship)
  const [filterGender, setFilterGender] = useState('')
  const [view, setView] = useState('summary')

  useEffect(() => {
    getClassifications().then(res => setClassifications(res.data.results || res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    setFilterSub('')
    if (filterClassification) {
      getSubClassifications(filterClassification).then(res => setSubClassifications(res.data.results || res.data)).catch(() => {})
    } else {
      setSubClassifications([])
    }
  }, [filterClassification])

  useEffect(() => {
    if (!initialChampionship) setSelectedChampionship('')
    const params = { page_size: 200 }
    if (filterClassification) params.classification = filterClassification
    if (filterSub) params.sub_classification = filterSub
    getChampionships(params).then(res => setChampionships(res.data.results || res.data)).catch(() => {})
  }, [filterClassification, filterSub])

  useEffect(() => {
    const params = {}
    if (selectedChampionship) params.championship = selectedChampionship
    if (!selectedChampionship && filterClassification) params.classification = filterClassification
    if (!selectedChampionship && filterSub) params.sub_classification = filterSub
    if (filterGender) params.gender = filterGender
    getMedalSummary(params).then(res => setSummary(res.data)).catch(() => {})
    // Full swimmer tally within a championship; capped list globally
    getMedalSwimmerSummary({ ...params, limit: selectedChampionship ? 'all' : 100 })
      .then(res => setSwimmerSummary(res.data)).catch(() => {})
    getMedalClubSummary(params).then(res => setClubSummary(res.data)).catch(() => {})
  }, [selectedChampionship, filterClassification, filterSub, filterGender])

  // Country tally is meaningless for National/Other contexts — clubs compete, not countries
  const selectedChampObj = championships.find(c => String(c.id) === String(selectedChampionship))
  const selectedClassObj = classifications.find(c => String(c.id) === String(filterClassification))
  const isNationalContext = selectedChampionship
    ? ['National', 'Other'].includes(selectedChampObj?.classification_name)
    : ['National', 'Other'].includes(selectedClassObj?.name)

  useEffect(() => {
    if (isNationalContext && view === 'summary') setView('clubs')
    if (!isNationalContext && view === 'clubs') setView('summary')
  }, [isNationalContext])

  const totalGold = summary.reduce((s, r) => s + (r.gold || 0), 0)
  const totalSilver = summary.reduce((s, r) => s + (r.silver || 0), 0)
  const totalBronze = summary.reduce((s, r) => s + (r.bronze || 0), 0)
  const totalAll = totalGold + totalSilver + totalBronze

  const hasFilters = filterClassification || filterSub || selectedChampionship || filterGender
  const clearFilters = () => {
    setFilterClassification(''); setFilterSub(''); setSelectedChampionship(''); setFilterGender('')
  }

  const chips = [
    filterClassification && {
      key: 'classification',
      label: classifications.find(c => String(c.id) === String(filterClassification))?.name || 'Classification',
      onRemove: () => setFilterClassification(''),
    },
    filterSub && {
      key: 'sub',
      label: subClassifications.find(s => String(s.id) === String(filterSub))?.name || 'Sub-classification',
      onRemove: () => setFilterSub(''),
    },
    selectedChampionship && {
      key: 'championship',
      label: selectedChampObj?.name || 'Championship',
      onRemove: () => setSelectedChampionship(''),
    },
    filterGender && {
      key: 'gender',
      label: filterGender === 'M' ? 'Male' : 'Female',
      onRemove: () => setFilterGender(''),
    },
  ].filter(Boolean)

  const countryRows = summary.map(row => ({
    entity: (
      <span className="flex flex-1 items-center min-w-0">
        <CountryFlag code={row.swimmer__nationality__code} flagUrl={row.swimmer__nationality__flag_url} name={row.swimmer__nationality__name}
          className="min-w-0 max-w-full [&>span:last-child]:truncate [&>span:last-child]:min-w-0" />
      </span>
    ),
    gold: row.gold, silver: row.silver, bronze: row.bronze,
  }))

  const clubRows = clubSummary.map(row => ({
    entity: <span className="block flex-1 min-w-0 truncate text-body-sm font-semibold text-ink-900">{row.result__team}</span>,
    gold: row.gold, silver: row.silver, bronze: row.bronze,
  }))

  const swimmerRows = swimmerSummary.map(row => ({
    swimmerId: row.swimmer__id,
    entity: (
      <span className="flex flex-1 items-center gap-2 min-w-0">
        <CountryFlag code={row.swimmer__nationality__code} flagUrl={row.swimmer__nationality__flag_url} className="shrink-0" />
        <span className="text-body-sm font-semibold text-ink-900 truncate min-w-0">{row.swimmer__name}</span>
      </span>
    ),
    gold: row.gold, silver: row.silver, bronze: row.bronze,
  }))

  const emptyTally = (message) => (
    <Card padding="none">
      <EmptyState icon={Medal} title="No medals found" hint={message} />
    </Card>
  )

  return (
    <div>
      <PageHeader title="Medal Tally" subtitle="Arab countries medal standings" />

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
        <StatCard label="Gold" value={totalGold} icon={GoldDot} />
        <StatCard label="Silver" value={totalSilver} icon={SilverDot} />
        <StatCard label="Bronze" value={totalBronze} icon={BronzeDot} />
        <StatCard label="Total" value={totalAll} icon={Medal} />
      </div>

      <FilterBar chips={chips} onReset={hasFilters ? clearFilters : undefined}>
        <div className="w-full md:w-44">
          <FieldLabel>Classification</FieldLabel>
          <Select value={filterClassification} onChange={(e) => setFilterClassification(e.target.value)}>
            <option value="">All</option>
            {classifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="w-full md:w-44">
          <FieldLabel>Sub-classification</FieldLabel>
          <Select value={filterSub} onChange={(e) => setFilterSub(e.target.value)} disabled={!filterClassification}>
            <option value="">All</option>
            {subClassifications.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div className="w-full md:w-56">
          <FieldLabel>Championship</FieldLabel>
          <Select value={selectedChampionship} onChange={(e) => setSelectedChampionship(e.target.value)}>
            <option value="">All</option>
            {championships.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="w-full md:w-auto">
          <FieldLabel>Gender</FieldLabel>
          <SegmentedControl
            options={[{ key: '', label: 'All' }, { key: 'M', label: 'Male' }, { key: 'F', label: 'Female' }]}
            value={filterGender}
            onChange={setFilterGender}
          />
        </div>
      </FilterBar>

      {/* View switcher */}
      <div className="mb-4 sm:mb-5 overflow-x-auto scrollbar-hide">
        <SegmentedControl
          options={[
            ...(!isNationalContext ? [{ key: 'summary', label: 'Country Tally' }] : []),
            ...(isNationalContext ? [{ key: 'clubs', label: 'By Club' }] : []),
            { key: 'swimmers', label: 'By Swimmer' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {view === 'summary' && (
        countryRows.length > 0
          ? <MedalTally rows={countryRows} entityLabel="Country" />
          : emptyTally('No medals found for the selected filters.')
      )}

      {view === 'clubs' && (
        clubRows.length > 0
          ? <MedalTally rows={clubRows} entityLabel="Club" />
          : emptyTally('No club medals found for the selected filters.')
      )}

      {view === 'swimmers' && (
        swimmerRows.length > 0
          ? <MedalTally rows={swimmerRows} entityLabel="Swimmer"
              onRowClick={(row) => navigate(`/swimmers/${row.swimmerId}`)} />
          : emptyTally('No medals found for the selected filters.')
      )}
    </div>
  )
}
