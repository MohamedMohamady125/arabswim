import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getChampionships, deleteChampionship } from '../api/championships'
import { getCountries } from '../api/core'
import DataTable from '../components/common/DataTable'
import Pagination from '../components/common/Pagination'
import CountryFlag from '../components/common/CountryFlag'
import { POOL_TYPES } from '../utils/constants'

export default function ChampionshipsPage() {
  const [championships, setChampionships] = useState([])
  const [countries, setCountries] = useState([])
  const [pagination, setPagination] = useState({})
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ search: '', pool: '', country: '' })
  const navigate = useNavigate()

  useEffect(() => { getCountries().then(res => setCountries(res.data)) }, []).catch(() => {})

  useEffect(() => {
    const params = { page, search: filters.search || undefined, pool: filters.pool || undefined, country: filters.country || undefined }
    getChampionships(params).then(res => {
      setChampionships(res.data.results)
      setPagination({ count: res.data.count, next: res.data.next, previous: res.data.previous })
    }).catch(() => {})
  }, [page, filters])

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this championship?')) return
    await deleteChampionship(id)
    setChampionships(championships.filter(c => c.id !== id))
  }

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'date', label: 'Date' },
    { key: 'pool', label: 'Pool' },
    { key: 'country', label: 'Country', render: (row) => <CountryFlag code={row.country_detail?.code} flagUrl={row.country_detail?.flag_url} name={row.country_detail?.name} /> },
    { key: 'location', label: 'Location' },
    { key: 'swimmers_count', label: 'Swimmers' },
    { key: 'results_count', label: 'Results' },
    { key: 'actions', label: '', render: (row) => (
      <div className="flex gap-2">
        <button onClick={(e) => { e.stopPropagation(); navigate(`/championships/${row.id}/edit`) }} className="text-blue-600 text-sm hover:underline">Edit</button>
        <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }} className="text-red-600 text-sm hover:underline">Delete</button>
      </div>
    )},
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Championship Management</h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/championships/new')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">+ Add Championship</button>
        </div>
      </div>
      <div className="flex gap-4 mb-4">
        <input type="text" placeholder="Search..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className="flex-1 border rounded-lg px-3 py-2 text-sm" />
        <select value={filters.pool} onChange={(e) => setFilters({ ...filters, pool: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Pools</option>
          {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Countries</option>
          {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <DataTable columns={columns} data={championships} onRowClick={(row) => navigate(`/championships/${row.id}/edit`)} />
      <Pagination {...pagination} currentPage={page} onPageChange={setPage} />
    </div>
  )
}
