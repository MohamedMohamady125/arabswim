import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getChampionships, deleteChampionship } from '../api/championships'
import { getCountries } from '../api/core'
import CountryFlag from '../components/common/CountryFlag'
import { POOL_TYPES, mediaUrl, formatDate } from '../utils/constants'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

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
    const params = {
      page_size: 500, ordering: '-date', search: search || undefined,
      pool: filterPool || undefined, country: filterCountry || undefined,
    }
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
      <div className="relative rounded-xl overflow-hidden mb-4 sm:mb-8 bg-gradient-to-br from-blue-900 to-cyan-800 text-white">
        <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M20 20c0-5.5-4.5-10-10-10S0 14.5 0 20s4.5 10 10 10 10-4.5 10-10zm20 0c0-5.5-4.5-10-10-10s-10 4.5-10 10 4.5 10 10 10 10-4.5 10-10z\'/%3E%3C/g%3E%3C/svg%3E")'}} />
        <div className="relative px-4 sm:px-8 py-6 sm:py-10">
          <h1 className="text-xl sm:text-3xl font-bold mb-1 sm:mb-2">Championships</h1>
          <p className="text-blue-200 text-sm sm:text-lg">Manage all competitions, results, and meet data.</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-8 sm:h-12 bg-gradient-to-t from-white to-transparent rounded-b-xl" />
      </div>


      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div className="flex flex-wrap gap-2 flex-1">
          <input type="text" placeholder="Search..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-0 sm:min-w-[120px] border-2 border-blue-500 rounded-lg px-3 sm:px-4 py-1.5 sm:py-2 text-sm" />
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
            className="border-2 border-blue-500 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2 text-sm bg-white font-medium">
            <option value="">Year</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filterPool} onChange={(e) => setFilterPool(e.target.value)}
            className="border-2 border-blue-500 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2 text-sm bg-white">
            <option value="">Pool</option>
            {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}
            className="border-2 border-blue-500 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2 text-sm bg-white">
            <option value="">Country</option>
            {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={() => navigate('/championships/new')}
          className="bg-blue-600 text-white px-4 sm:px-5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm hover:bg-blue-700 font-medium shrink-0">
          + Add
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
            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-sm font-semibold sm:bg-transparent sm:text-gray-400 sm:px-0 sm:py-0 sm:font-normal whitespace-nowrap">{group.events.length} meet{group.events.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Meet cards */}
          <div className="space-y-3">
            {group.events.map(c => {
              const isExpanded = expandedId === c.id

              return (
                <div key={c.id}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    className={`bg-white border px-3 py-3 sm:px-6 sm:py-5 flex items-center gap-3 sm:gap-6 cursor-pointer transition-all hover:shadow-md ${
                      isExpanded ? 'border-blue-500 shadow-md rounded-t-xl' : 'border-gray-200 rounded-xl'
                    }`}
                  >
                    {/* Meet photo/logo (never a date — that's for the calendar) */}
                    {c.meet_photo ? (
                      <div className="w-24 h-20 sm:w-44 sm:h-32 rounded-xl overflow-hidden shrink-0 shadow">
                        <img src={mediaUrl(c.meet_photo)} alt={c.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-24 h-20 sm:w-44 sm:h-32 bg-gradient-to-br from-blue-600 to-sky-500 rounded-xl flex items-center justify-center shrink-0 shadow">
                        <svg className="w-10 h-10 sm:w-14 sm:h-14 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="16.5" cy="6.5" r="2.2" />
                          <path d="M3 13l8-4 4 3.2-4.5 2.3L3 13z" />
                          <path d="M2 18c2.2-1.6 4.4-1.6 6.6 0s4.4 1.6 6.6 0 4.4-1.6 6.6 0v2.4c-2.2 1.6-4.4 1.6-6.6 0s-4.4-1.6-6.6 0-4.4 1.6-6.6 0V18z" opacity="0.9" />
                        </svg>
                      </div>
                    )}

                    {/* Meet info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm sm:text-lg text-gray-900 truncate">{c.name}</h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-gray-500 mt-1.5">
                        {c.location && (
                          <span className="flex items-center gap-1">
                            <span className="text-gray-400">&#x1F4CD;</span> {c.location}
                          </span>
                        )}
                        {c.country_detail && (
                          <CountryFlag code={c.country_detail.code} flagUrl={c.country_detail.flag_url} name={c.country_detail.name} />
                        )}
                        <span className="text-xs bg-gray-100 px-2.5 py-1 rounded-lg font-medium">{c.pool === 'LCM' ? '50m' : '25m'}</span>
                      </div>
                      {c.end_date && c.end_date !== c.date && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                          </svg>
                          <span className="text-xs text-gray-400">{formatDate(c.date)} &mdash; {formatDate(c.end_date)}</span>
                        </div>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-2 shrink-0">
                      {c.results_count > 0 && (
                        <span className="bg-green-100 text-green-700 px-2.5 py-1 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm font-semibold sm:font-medium whitespace-nowrap">
                          {c.results_count} results
                        </span>
                      )}
                      {c.swimmers_count > 0 && (
                        <span className="bg-blue-100 text-blue-700 px-2.5 py-1 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm font-semibold sm:font-medium whitespace-nowrap">
                          {c.swimmers_count} swimmers
                        </span>
                      )}
                      {!c.results_count && (
                        <span className="bg-gray-100 text-gray-500 px-2.5 py-1 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm whitespace-nowrap">No results</span>
                      )}
                    </div>

                    <span className={`text-gray-400 text-lg transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#x276F;</span>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="bg-gray-50 border border-blue-500 border-t-0 rounded-b-xl px-6 py-4">
                      <div className="flex flex-wrap gap-3">
                        {c.results_count > 0 && (
                          <button onClick={(e) => { e.stopPropagation(); navigate({ pathname: `/meets/${c.id}`, search: '?tab=results' }) }}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
                            View Results
                          </button>
                        )}
                        {c.results_count > 0 && (
                          <button onClick={(e) => { e.stopPropagation(); navigate({ pathname: `/meets/${c.id}`, search: '?tab=statistics' }) }}
                            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700">
                            Statistics
                          </button>
                        )}
                        {c.results_count > 0 && (
                          <button onClick={(e) => { e.stopPropagation(); navigate({ pathname: `/meets/${c.id}`, search: '?tab=medals' }) }}
                            className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-600">
                            Medals
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); navigate({ pathname: `/meets/${c.id}`, search: '?tab=gallery' }) }}
                          className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700">
                          Galleries
                        </button>
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
