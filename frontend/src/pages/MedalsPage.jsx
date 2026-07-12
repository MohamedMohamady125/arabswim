import { useState, useEffect } from 'react'
import { getMedals, getMedalSummary } from '../api/medals'
import { getChampionships, getClassifications, getSubClassifications } from '../api/championships'
import { getCountries } from '../api/core'
import { getSwimmers } from '../api/swimmers'
import DataTable from '../components/common/DataTable'
import CountryFlag from '../components/common/CountryFlag'
import MedalIcon from '../components/common/MedalIcon'

export default function MedalsPage() {
  const [summary, setSummary] = useState([])
  const [medals, setMedals] = useState([])
  const [championships, setChampionships] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])
  const [countries, setCountries] = useState([])
  const [swimmers, setSwimmers] = useState([])
  const [swimmerSearch, setSwimmerSearch] = useState('')
  const [filterClassification, setFilterClassification] = useState('')
  const [filterSub, setFilterSub] = useState('')
  const [selectedChampionship, setSelectedChampionship] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterSwimmer, setFilterSwimmer] = useState('')
  const [view, setView] = useState('summary')

  // Load classifications and countries on mount
  useEffect(() => {
    getClassifications().then(res => setClassifications(res.data.results || res.data)).catch(() => {})
    getCountries().then(res => setCountries(res.data.results || res.data)).catch(() => {})
  }, [])

  // Search swimmers with debounce
  useEffect(() => {
    if (swimmerSearch.length < 2) { setSwimmers([]); return }
    const t = setTimeout(() => {
      getSwimmers({ search: swimmerSearch, page_size: 20 })
        .then(res => setSwimmers(res.data.results || res.data)).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [swimmerSearch])

  // Load subclassifications when classification changes
  useEffect(() => {
    setFilterSub('')
    if (filterClassification) {
      getSubClassifications(filterClassification).then(res => setSubClassifications(res.data.results || res.data)).catch(() => {})
    } else {
      setSubClassifications([])
    }
  }, [filterClassification])

  // Load championships filtered by classification/subclassification
  useEffect(() => {
    setSelectedChampionship('')
    const params = { page_size: 200 }
    if (filterClassification) params.classification = filterClassification
    if (filterSub) params.sub_classification = filterSub
    getChampionships(params).then(res => setChampionships(res.data.results || res.data)).catch(() => {})
  }, [filterClassification, filterSub])

  // Fetch medals data
  useEffect(() => {
    const params = {}
    if (selectedChampionship) params.championship = selectedChampionship
    if (!selectedChampionship && filterClassification) params.classification = filterClassification
    if (!selectedChampionship && filterSub) params.sub_classification = filterSub
    if (filterCountry) params.country = filterCountry
    if (filterSwimmer) params.swimmer = filterSwimmer
    getMedalSummary(params).then(res => setSummary(res.data)).catch(() => {})
    getMedals(params).then(res => setMedals(res.data.results || res.data)).catch(() => {})
  }, [selectedChampionship, filterClassification, filterSub, filterCountry, filterSwimmer])

  const summaryColumns = [
    { key: 'country', label: 'Country', render: (row) => <CountryFlag code={row.swimmer__nationality__code} flagUrl={row.swimmer__nationality__flag_url} name={row.swimmer__nationality__name} /> },
    { key: 'gold', label: <MedalIcon type="gold" size={32} /> },
    { key: 'silver', label: <MedalIcon type="silver" size={32} /> },
    { key: 'bronze', label: <MedalIcon type="bronze" size={32} /> },
    { key: 'total', label: 'Total' },
  ]

  const medalColumns = [
    { key: 'swimmer', label: 'Swimmer', render: (row) => row.swimmer_detail?.name },
    { key: 'nationality', label: 'Nationality', render: (row) => <CountryFlag code={row.swimmer_detail?.nationality_detail?.code} flagUrl={row.swimmer_detail?.nationality_detail?.flag_url} name={row.swimmer_detail?.nationality_detail?.name} /> },
    { key: 'event', label: 'Event', render: (row) => row.event_detail?.name },
    { key: 'medal_type', label: 'Medal', render: (row) => <MedalIcon type={row.medal_type?.toLowerCase()} size={32} /> },
    { key: 'championship', label: 'Championship', render: (row) => row.championship_detail?.name },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Medals</h1>
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filterClassification} onChange={(e) => setFilterClassification(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Classifications</option>
          {classifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterSub} onChange={(e) => setFilterSub(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" disabled={!filterClassification}>
          <option value="">All Sub-classifications</option>
          {subClassifications.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={selectedChampionship} onChange={(e) => setSelectedChampionship(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Championships</option>
          {championships.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Countries</option>
          {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="relative">
          <input
            type="text"
            placeholder="Search swimmer..."
            value={filterSwimmer ? swimmers.find(s => String(s.id) === filterSwimmer)?.name || swimmerSearch : swimmerSearch}
            onChange={(e) => { setSwimmerSearch(e.target.value); setFilterSwimmer('') }}
            className="border rounded-lg px-3 py-2 text-sm w-48"
          />
          {swimmerSearch.length >= 2 && !filterSwimmer && swimmers.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {swimmers.map(s => (
                <button key={s.id} onClick={() => { setFilterSwimmer(String(s.id)); setSwimmerSearch(s.name); setSwimmers([]) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0">
                  {s.name}
                </button>
              ))}
            </div>
          )}
          {filterSwimmer && (
            <button onClick={() => { setFilterSwimmer(''); setSwimmerSearch('') }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
              ✕
            </button>
          )}
        </div>
        <div className="flex gap-1">
          <button onClick={() => setView('summary')} className={`px-4 py-2 rounded-lg text-sm ${view === 'summary' ? 'bg-blue-600 text-white' : 'border'}`}>Medal Tally</button>
          <button onClick={() => setView('list')} className={`px-4 py-2 rounded-lg text-sm ${view === 'list' ? 'bg-blue-600 text-white' : 'border'}`}>All Medals</button>
        </div>
      </div>
      {view === 'summary' ? (
        <DataTable columns={summaryColumns} data={summary} emptyMessage="No medals found" />
      ) : (
        <DataTable columns={medalColumns} data={medals} emptyMessage="No medals found" />
      )}
    </div>
  )
}
