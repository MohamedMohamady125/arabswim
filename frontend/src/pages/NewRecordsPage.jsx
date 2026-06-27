import { useState, useEffect } from 'react'
import { getRecords } from '../api/records'
import DataTable from '../components/common/DataTable'
import CountryFlag from '../components/common/CountryFlag'
import { RECORD_TYPES, formatTime } from '../utils/constants'

export default function NewRecordsPage() {
  const [records, setRecords] = useState([])
  const [filterType, setFilterType] = useState('')
  const [searchName, setSearchName] = useState('')

  useEffect(() => {
    const params = { is_new: 'true' }
    if (filterType) params.record_type = filterType
    if (searchName) params.search = searchName
    getRecords(params).then(res => setRecords(res.data.results || res.data))
  }, [filterType, searchName])

  const columns = [
    { key: 'photo', label: 'Photo', render: (row) => (
      <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
        {row.swimmer_detail?.photo ? <img src={row.swimmer_detail.photo} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs">👤</div>}
      </div>
    )},
    { key: 'swimmer_name', label: 'Swimmer Name', render: (row) => row.swimmer_detail?.name },
    { key: 'nationality', label: 'Nationality', render: (row) => <CountryFlag code={row.swimmer_detail?.nationality_detail?.code} flagUrl={row.swimmer_detail?.nationality_detail?.flag_url} name={row.swimmer_detail?.nationality_detail?.name} /> },
    { key: 'race', label: 'Race', render: (row) => row.event_detail?.name },
    { key: 'record', label: 'Record', render: (row) => row.formatted_time },
    { key: 'location', label: 'Location' },
    { key: 'record_type', label: 'Type' },
    { key: 'result_date', label: 'Result Date' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">New Records</h1>
      <div className="flex gap-4 mb-4">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Types</option>
          {RECORD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input type="text" placeholder="Search by name..." value={searchName} onChange={(e) => setSearchName(e.target.value)} className="flex-1 border rounded-lg px-3 py-2 text-sm" />
      </div>
      <DataTable columns={columns} data={records} emptyMessage="No new records found" />
    </div>
  )
}
