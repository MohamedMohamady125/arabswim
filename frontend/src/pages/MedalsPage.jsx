import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getMedals, getMedalSummary } from '../api/medals'
import { getChampionships, getClassifications, getSubClassifications } from '../api/championships'
import { getCountries } from '../api/core'
import { getSwimmers } from '../api/swimmers'
import CountryFlag from '../components/common/CountryFlag'

const MEDAL_COLORS = { GOLD: '#FFD700', SILVER: '#C0C0C0', BRONZE: '#CD7F32' }

function MedalDot({ type, size = 28 }) {
  const color = MEDAL_COLORS[type?.toUpperCase()] || '#ccc'
  const label = type?.toUpperCase() === 'GOLD' ? '1st' : type?.toUpperCase() === 'SILVER' ? '2nd' : '3rd'
  const textColor = type?.toUpperCase() === 'SILVER' ? '#555' : type?.toUpperCase() === 'GOLD' ? '#8B6914' : '#8B4513'
  return (
    <span className="inline-flex items-center justify-center rounded-full font-black"
      style={{ width: size, height: size, backgroundColor: color + '35', color: textColor, fontSize: size * 0.36 }}>
      {label}
    </span>
  )
}

export default function MedalsPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialChampionship = searchParams.get('championship') || ''
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
  const [selectedChampionship, setSelectedChampionship] = useState(initialChampionship)
  const [filterCountry, setFilterCountry] = useState('')
  const [filterSwimmer, setFilterSwimmer] = useState('')
  const [view, setView] = useState('summary')

  useEffect(() => {
    getClassifications().then(res => setClassifications(res.data.results || res.data)).catch(() => {})
    getCountries().then(res => setCountries(res.data.results || res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (swimmerSearch.length < 2) { setSwimmers([]); return }
    const t = setTimeout(() => {
      getSwimmers({ search: swimmerSearch, page_size: 20 })
        .then(res => setSwimmers(res.data.results || res.data)).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [swimmerSearch])

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
    if (filterCountry) params.country = filterCountry
    if (filterSwimmer) params.swimmer = filterSwimmer
    getMedalSummary(params).then(res => setSummary(res.data)).catch(() => {})
    getMedals(params).then(res => setMedals(res.data.results || res.data)).catch(() => {})
  }, [selectedChampionship, filterClassification, filterSub, filterCountry, filterSwimmer])

  const totalGold = summary.reduce((s, r) => s + (r.gold || 0), 0)
  const totalSilver = summary.reduce((s, r) => s + (r.silver || 0), 0)
  const totalBronze = summary.reduce((s, r) => s + (r.bronze || 0), 0)
  const totalAll = totalGold + totalSilver + totalBronze

  const hasFilters = filterClassification || filterSub || selectedChampionship || filterCountry || filterSwimmer
  const clearFilters = () => {
    setFilterClassification(''); setFilterSub(''); setSelectedChampionship('')
    setFilterCountry(''); setFilterSwimmer(''); setSwimmerSearch('')
  }

  // Group medals by event for the list view
  const medalsByEvent = {}
  medals.forEach(m => {
    const eventName = m.event_detail?.name || 'Unknown'
    if (!medalsByEvent[eventName]) medalsByEvent[eventName] = []
    medalsByEvent[eventName].push(m)
  })

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Medal Tally</h1>
        <p className="text-sm text-gray-500 mt-1">Browse medals across all championships</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Gold', count: totalGold, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
          { label: 'Silver', count: totalSilver, bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600' },
          { label: 'Bronze', count: totalBronze, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
          { label: 'Total', count: totalAll, bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} ${c.border} border rounded-xl p-4 text-center`}>
            <div className={`text-3xl font-black ${c.text}`}>{c.count}</div>
            <div className="text-xs font-semibold text-gray-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border shadow-sm p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-700">Filters</span>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-sky-600 hover:text-sky-800 font-medium">Clear all</button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Classification</label>
            <select value={filterClassification} onChange={(e) => setFilterClassification(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-sky-300 focus:ring-1 focus:ring-sky-300 outline-none transition-colors">
              <option value="">All</option>
              {classifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Sub-classification</label>
            <select value={filterSub} onChange={(e) => setFilterSub(e.target.value)}
              disabled={!filterClassification}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-sky-300 focus:ring-1 focus:ring-sky-300 outline-none transition-colors disabled:opacity-40">
              <option value="">All</option>
              {subClassifications.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Championship</label>
            <select value={selectedChampionship} onChange={(e) => setSelectedChampionship(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-sky-300 focus:ring-1 focus:ring-sky-300 outline-none transition-colors">
              <option value="">All</option>
              {championships.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Country</label>
            <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-sky-300 focus:ring-1 focus:ring-sky-300 outline-none transition-colors">
              <option value="">All</option>
              {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Swimmer</label>
            <div className="relative">
              <input type="text" placeholder="Search..."
                value={filterSwimmer ? swimmers.find(s => String(s.id) === filterSwimmer)?.name || swimmerSearch : swimmerSearch}
                onChange={(e) => { setSwimmerSearch(e.target.value); setFilterSwimmer('') }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-sky-300 focus:ring-1 focus:ring-sky-300 outline-none transition-colors" />
              {swimmerSearch.length >= 2 && !filterSwimmer && swimmers.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {swimmers.map(s => (
                    <button key={s.id} onClick={() => { setFilterSwimmer(String(s.id)); setSwimmerSearch(s.name); setSwimmers([]) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-sky-50 transition-colors">
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              {filterSwimmer && (
                <button onClick={() => { setFilterSwimmer(''); setSwimmerSearch('') }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">&times;</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {[
          { key: 'summary', label: 'Country Tally' },
          { key: 'list', label: 'All Medals' },
        ].map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === t.key ? 'bg-white text-sky-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Country Tally View */}
      {view === 'summary' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {summary.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-12">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Country</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 w-20">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black" style={{ backgroundColor: '#FFD70035', color: '#8B6914' }}>G</span>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 w-20">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black" style={{ backgroundColor: '#C0C0C035', color: '#555' }}>S</span>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 w-20">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black" style={{ backgroundColor: '#CD7F3235', color: '#8B4513' }}>B</span>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 w-20">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500" style={{ minWidth: 200 }}>Distribution</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summary.map((row, i) => {
                  const total = (row.gold || 0) + (row.silver || 0) + (row.bronze || 0)
                  const maxTotal = (summary[0]?.gold || 0) + (summary[0]?.silver || 0) + (summary[0]?.bronze || 0)
                  return (
                    <tr key={i} className={`hover:bg-gray-50 ${i < 3 ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-bold ${i === 0 ? 'text-amber-600' : i === 1 ? 'text-gray-500' : i === 2 ? 'text-orange-700' : 'text-gray-400'}`}>{i + 1}</span>
                      </td>
                      <td className="px-4 py-3">
                        <CountryFlag code={row.swimmer__nationality__code} flagUrl={row.swimmer__nationality__flag_url} name={row.swimmer__nationality__name} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold text-sm ${row.gold ? 'text-amber-700' : 'text-gray-300'}`}>{row.gold || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold text-sm ${row.silver ? 'text-gray-600' : 'text-gray-300'}`}>{row.silver || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold text-sm ${row.bronze ? 'text-orange-700' : 'text-gray-300'}`}>{row.bronze || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-black text-sm text-gray-800">{total}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex h-4 rounded-full overflow-hidden" style={{ width: `${Math.max((total / maxTotal) * 100, 4)}%` }}>
                          {row.gold > 0 && <div style={{ width: `${(row.gold / total) * 100}%`, backgroundColor: MEDAL_COLORS.GOLD }} />}
                          {row.silver > 0 && <div style={{ width: `${(row.silver / total) * 100}%`, backgroundColor: MEDAL_COLORS.SILVER }} />}
                          {row.bronze > 0 && <div style={{ width: `${(row.bronze / total) * 100}%`, backgroundColor: MEDAL_COLORS.BRONZE }} />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-gray-400">No medals found for the selected filters</div>
          )}
        </div>
      )}

      {/* All Medals View */}
      {view === 'list' && (
        <div className="space-y-4">
          {Object.keys(medalsByEvent).length > 0 ? (
            Object.entries(medalsByEvent).map(([eventName, eventMedals]) => (
              <div key={eventName} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-700">{eventName}</h3>
                  <span className="text-xs text-gray-400">{eventMedals.length} medal{eventMedals.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y">
                  {eventMedals.sort((a, b) => {
                    const order = { GOLD: 0, SILVER: 1, BRONZE: 2 }
                    return (order[a.medal_type] ?? 3) - (order[b.medal_type] ?? 3)
                  }).map(m => (
                    <div key={m.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                      <MedalDot type={m.medal_type} />
                      <div className="flex-1 min-w-0">
                        <button onClick={() => navigate(`/swimmers/${m.swimmer_detail?.id}`)}
                          className="text-sm font-semibold text-gray-800 hover:text-sky-700 transition-colors">
                          {m.swimmer_detail?.name}
                        </button>
                        <div className="flex items-center gap-2 mt-0.5">
                          <CountryFlag code={m.swimmer_detail?.nationality_detail?.code} flagUrl={m.swimmer_detail?.nationality_detail?.flag_url} name={m.swimmer_detail?.nationality_detail?.name} />
                        </div>
                      </div>
                      <button onClick={() => navigate(`/meets/${m.championship_detail?.id}`)}
                        className="text-xs text-sky-600 hover:underline text-right shrink-0 max-w-[200px] truncate">
                        {m.championship_detail?.name}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-xl border shadow-sm p-12 text-center text-gray-400">No medals found for the selected filters</div>
          )}
        </div>
      )}
    </div>
  )
}
