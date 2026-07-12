import { useState, useEffect } from 'react'
import { getMedals, getMedalSummary } from '../api/medals'
import { getChampionships, getClassifications, getSubClassifications } from '../api/championships'
import DataTable from '../components/common/DataTable'
import CountryFlag from '../components/common/CountryFlag'
import MedalIcon from '../components/common/MedalIcon'

export default function MedalsPage() {
  const [summary, setSummary] = useState([])
  const [medals, setMedals] = useState([])
  const [championships, setChampionships] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])
  const [filterClassification, setFilterClassification] = useState('')
  const [filterSub, setFilterSub] = useState('')
  const [selectedChampionship, setSelectedChampionship] = useState('')
  const [view, setView] = useState('summary')

  // Load classifications on mount
  useEffect(() => {
    getClassifications().then(res => setClassifications(res.data.results || res.data)).catch(() => {})
  }, [])

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
    getMedalSummary(params).then(res => setSummary(res.data)).catch(() => {})
    getMedals(params).then(res => setMedals(res.data.results || res.data)).catch(() => {})
  }, [selectedChampionship, filterClassification, filterSub])

  const summaryColumns = [
    { key: 'country', label: 'Country', render: (row) => <CountryFlag code={row.swimmer__nationality__code} name={row.swimmer__nationality__name} /> },
    { key: 'gold', label: <span className="flex items-center gap-1"><MedalIcon type="gold" size={18} /> Gold</span> },
    { key: 'silver', label: <span className="flex items-center gap-1"><MedalIcon type="silver" size={18} /> Silver</span> },
    { key: 'bronze', label: <span className="flex items-center gap-1"><MedalIcon type="bronze" size={18} /> Bronze</span> },
    { key: 'total', label: 'Total' },
  ]

  const medalColumns = [
    { key: 'swimmer', label: 'Swimmer', render: (row) => row.swimmer_detail?.name },
    { key: 'nationality', label: 'Nationality', render: (row) => <CountryFlag code={row.swimmer_detail?.nationality_detail?.code} flagUrl={row.swimmer_detail?.nationality_detail?.flag_url} name={row.swimmer_detail?.nationality_detail?.name} /> },
    { key: 'event', label: 'Event', render: (row) => row.event_detail?.name },
    { key: 'medal_type', label: 'Medal', render: (row) => {
      const type = row.medal_type?.toLowerCase()
      return <span className="flex items-center gap-1"><MedalIcon type={type} size={20} /> {row.medal_type}</span>
    }},
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
