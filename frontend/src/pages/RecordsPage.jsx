import { useState, useEffect } from 'react'
import { getRecords } from '../api/records'
import DataTable from '../components/common/DataTable'
import Pagination from '../components/common/Pagination'
import CountryFlag from '../components/common/CountryFlag'
import { RECORD_TYPES } from '../utils/constants'

export default function RecordsPage() {
  const [records, setRecords] = useState([])
  const [pagination, setPagination] = useState({})
  const [page, setPage] = useState(1)
  const [filterType, setFilterType] = useState('')

  useEffect(() => {
    const params = { page }
    if (filterType) params.record_type = filterType
    getRecords(params).then(res => {
      setRecords(res.data.results)
      setPagination({ count: res.data.count, next: res.data.next, previous: res.data.previous }).catch(() => {})
    })
  }, [page, filterType])

  const columns = [
    { key: 'swimmer', label: 'Swimmer', render: (row) => row.swimmer_detail?.name },
    { key: 'nationality', label: 'Nationality', render: (row) => <CountryFlag code={row.swimmer_detail?.nationality_detail?.code} flagUrl={row.swimmer_detail?.nationality_detail?.flag_url} name={row.swimmer_detail?.nationality_detail?.name} /> },
    { key: 'event', label: 'Event', render: (row) => row.event_detail?.name },
    { key: 'time', label: 'Time', render: (row) => row.formatted_time },
    { key: 'record_type', label: 'Type' },
    { key: 'location', label: 'Location' },
    { key: 'result_date', label: 'Date' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Records</h1>
      <div className="mb-4">
        <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1) }} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Types</option>
          {RECORD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <DataTable columns={columns} data={records} />
      <Pagination {...pagination} currentPage={page} onPageChange={setPage} />
    </div>
  )
}
