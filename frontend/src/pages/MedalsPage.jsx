import { useState, useEffect } from 'react'
import { getMedals, getMedalSummary } from '../api/medals'
import { getChampionships } from '../api/championships'
import DataTable from '../components/common/DataTable'
import CountryFlag from '../components/common/CountryFlag'

export default function MedalsPage() {
  const [summary, setSummary] = useState([])
  const [medals, setMedals] = useState([])
  const [championships, setChampionships] = useState([])
  const [selectedChampionship, setSelectedChampionship] = useState('')
  const [view, setView] = useState('summary')

  useEffect(() => {
    getChampionships({ page_size: 100 }).then(res => setChampionships(res.data.results || res.data))
  }, [])

  useEffect(() => {
    const params = selectedChampionship ? { championship: selectedChampionship } : {}
    getMedalSummary(params).then(res => setSummary(res.data))
    getMedals(params).then(res => setMedals(res.data.results || res.data))
  }, [selectedChampionship])

  const summaryColumns = [
    { key: 'country', label: 'Country', render: (row) => <CountryFlag code={row.swimmer__nationality__code} name={row.swimmer__nationality__name} /> },
    { key: 'gold', label: '🥇 Gold' },
    { key: 'silver', label: '🥈 Silver' },
    { key: 'bronze', label: '🥉 Bronze' },
    { key: 'total', label: 'Total' },
  ]

  const medalColumns = [
    { key: 'swimmer', label: 'Swimmer', render: (row) => row.swimmer_detail?.name },
    { key: 'nationality', label: 'Nationality', render: (row) => <CountryFlag code={row.swimmer_detail?.nationality_detail?.code} flagUrl={row.swimmer_detail?.nationality_detail?.flag_url} name={row.swimmer_detail?.nationality_detail?.name} /> },
    { key: 'event', label: 'Event', render: (row) => row.event_detail?.name },
    { key: 'medal_type', label: 'Medal', render: (row) => ({ GOLD: '🥇 Gold', SILVER: '🥈 Silver', BRONZE: '🥉 Bronze' }[row.medal_type]) },
    { key: 'championship', label: 'Championship', render: (row) => row.championship_detail?.name },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Medals</h1>
      <div className="flex gap-4 mb-4">
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
