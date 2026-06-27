import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTeams, deleteTeam } from '../api/teams'
import { getCountries } from '../api/core'
import DataTable from '../components/common/DataTable'
import CountryFlag from '../components/common/CountryFlag'

export default function TeamsPage() {
  const navigate = useNavigate()
  const [teams, setTeams] = useState([])
  const [countries, setCountries] = useState([])

  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('')

  useEffect(() => {
    getCountries().then(res => setCountries(res.data))
  }, [])

  useEffect(() => {
    const params = { search: search || undefined, country: countryFilter || undefined }
    getTeams(params).then(res => {
      const data = Array.isArray(res.data) ? res.data : (res.data.results || [])
      setTeams(data)
    })
  }, [search, countryFilter])

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete team "${name}"?`)) return
    await deleteTeam(id)
    setTeams(prev => prev.filter(t => t.id !== id))
  }

  const columns = [
    {
      key: 'logo', label: '',
      render: (_, t) => (
        <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
          {t.logo ? <img src={t.logo} alt="" className="w-full h-full object-cover" /> : <span className="text-gray-400 text-lg">🏊</span>}
        </div>
      )
    },
    { key: 'name', label: 'Team Name' },
    {
      key: 'country', label: 'Country',
      render: (_, t) => t.country_detail ? (
        <CountryFlag code={t.country_detail.code} flagUrl={t.country_detail.flag_url} name={t.country_detail.name} />
      ) : '-'
    },
    { key: 'founded_year', label: 'Founded', render: (v) => v || '-' },
    { key: 'swimmers_count', label: 'Swimmers', render: (v) => v || 0 },
    {
      key: 'is_national_team', label: 'Type',
      render: (v) => v ? (
        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">National</span>
      ) : (
        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">Club</span>
      )
    },
    {
      key: 'actions', label: '',
      render: (_, t) => (
        <div className="flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); navigate(`/teams/${t.id}/edit`) }}
            className="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.name) }}
            className="text-red-600 hover:text-red-800 text-sm">Delete</button>
        </div>
      )
    },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Teams</h1>
        <button onClick={() => navigate('/teams/new')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          + Add Team
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          type="text" placeholder="Search teams..." value={search}
          onChange={(e) => { setSearch(e.target.value) }}
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <select value={countryFilter} onChange={(e) => { setCountryFilter(e.target.value) }}
          className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Countries</option>
          {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={teams}
        onRowClick={(t) => navigate(`/teams/${t.id}`)}
        emptyMessage="No teams found"
      />
    </div>
  )
}
