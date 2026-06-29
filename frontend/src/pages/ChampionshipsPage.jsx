import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getChampionships, deleteChampionship } from '../api/championships'
import { getCountries } from '../api/core'
import CountryFlag from '../components/common/CountryFlag'
import { POOL_TYPES } from '../utils/constants'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export default function ChampionshipsPage() {
  const navigate = useNavigate()
  const [championships, setChampionships] = useState([])
  const [countries, setCountries] = useState([])
  const [search, setSearch] = useState('')
  const [filterPool, setFilterPool] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const years = []
  for (let y = new Date().getFullYear() + 2; y >= 2000; y--) years.push(y)

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const params = { page_size: 500, ordering: '-date', search: search || undefined, pool: filterPool || undefined, country: filterCountry || undefined }
    if (filterYear) params.year = filterYear
    getChampionships(params).then(res => {
      setChampionships(res.data.results || res.data)
    }).catch(() => {})
  }, [search, filterPool, filterCountry, filterYear])

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete championship "${name}"?`)) return
    await deleteChampionship(id)
    setChampionships(prev => prev.filter(c => c.id !== id))
  }

  // Group by month
  const grouped = {}
  championships.forEach(c => {
    const d = dayjs(c.date, 'DD/MM/YYYY')
    const key = d.isValid() ? `${d.year()}-${String(d.month() + 1).padStart(2, '0')}` : 'unknown'
    if (!grouped[key]) grouped[key] = { year: d.year(), month: d.month(), events: [] }
    grouped[key].events.push(c)
  })

  return (
    <div>
      {/* Hero Banner */}
      <div className="relative rounded-xl overflow-hidden mb-8 bg-gradient-to-br from-blue-900 to-cyan-800 text-white">
        <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M20 20c0-5.5-4.5-10-10-10S0 14.5 0 20s4.5 10 10 10 10-4.5 10-10zm20 0c0-5.5-4.5-10-10-10s-10 4.5-10 10 4.5 10 10 10 10-4.5 10-10z\'/%3E%3C/g%3E%3C/svg%3E")'}} />
        <div className="relative px-8 py-10">
          <h1 className="text-3xl font-bold mb-2">Championship Management</h1>
          <p className="text-blue-200 text-lg">Manage all competitions, results, and meet data.</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent rounded-b-xl" />
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-3 flex-1">
          <input type="text" placeholder="Search championships..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-xs border-2 border-blue-500 rounded-lg px-4 py-2 text-sm" />
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
            className="border-2 border-blue-500 rounded-lg px-4 py-2 text-sm bg-white font-medium">
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filterPool} onChange={(e) => setFilterPool(e.target.value)}
            className="border-2 border-blue-500 rounded-lg px-4 py-2 text-sm bg-white">
            <option value="">All Pools</option>
            {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}
            className="border-2 border-blue-500 rounded-lg px-4 py-2 text-sm bg-white">
            <option value="">All Countries</option>
            {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={() => navigate('/championships/new')}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-blue-700 font-medium ml-3">
          + Add Championship
        </button>
      </div>

      {/* Empty state */}
      {Object.keys(grouped).length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">&#x1F3CA;</div>
          <p>No championships found</p>
        </div>
      )}

      {/* Championships grouped by month */}
      {Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([key, group]) => (
        <div key={key} className="mb-8">
          {/* Month header */}
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-wide">
              {MONTHS[group.month]} {group.year}
            </h2>
            <div className="flex-1 h-px bg-blue-200" />
            <span className="text-sm text-gray-400">{group.events.length} meet{group.events.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Meet cards */}
          <div className="space-y-3">
            {group.events.map(c => {
              const d = dayjs(c.date, 'DD/MM/YYYY')
              const isExpanded = expandedId === c.id

              return (
                <div key={c.id}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    className={`bg-white border rounded-xl px-5 py-4 flex items-center gap-5 cursor-pointer transition-all hover:shadow-md ${
                      isExpanded ? 'border-blue-500 shadow-md' : 'border-gray-200'
                    }`}
                  >
                    {/* Date badge */}
                    <div className="w-16 h-16 bg-blue-600 rounded-xl flex flex-col items-center justify-center text-white shrink-0 shadow">
                      <span className="text-2xl font-bold leading-none">{d.isValid() ? d.date() : '?'}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider">{d.isValid() ? MONTH_SHORT[d.month()] : ''}</span>
                    </div>

                    {/* Meet info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 truncate">{c.name}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                        {c.location && (
                          <span className="flex items-center gap-1">
                            <span className="text-gray-400">&#x1F4CD;</span> {c.location}
                          </span>
                        )}
                        {c.country_detail && (
                          <CountryFlag code={c.country_detail.code} flagUrl={c.country_detail.flag_url} name={c.country_detail.name} />
                        )}
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{c.pool === 'LCM' ? '50m' : '25m'}</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-2 shrink-0">
                      {c.results_count > 0 && (
                        <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                          {c.results_count} results
                        </span>
                      )}
                      {c.swimmers_count > 0 && (
                        <span className="bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                          {c.swimmers_count} swimmers
                        </span>
                      )}
                      {!c.results_count && (
                        <span className="bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full text-xs">No results</span>
                      )}
                    </div>

                    <span className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#x276F;</span>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="bg-gray-50 border border-t-0 border-gray-200 rounded-b-xl px-6 py-4 -mt-1">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Date</div>
                          <div className="text-sm font-medium">{c.date}{c.end_date && c.end_date !== c.date ? ` to ${c.end_date}` : ''}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Pool</div>
                          <div className="text-sm font-medium">{c.pool === 'LCM' ? 'Long Course (50m)' : 'Short Course (25m)'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Country</div>
                          <div className="text-sm font-medium">
                            {c.country_detail && <CountryFlag code={c.country_detail.code} flagUrl={c.country_detail.flag_url} name={c.country_detail.name} />}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Location</div>
                          <div className="text-sm font-medium">{c.location || '-'}</div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        {c.results_count > 0 && (
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/meets/${c.id}`) }}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
                            View Results
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/championships/${c.id}/edit`) }}
                          className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
                          Edit
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name) }}
                          className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm hover:bg-red-50">
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
