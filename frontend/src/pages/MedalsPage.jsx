import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getMedalSummary, getMedalSwimmerSummary, getMedalClubSummary } from '../api/medals'
import { getChampionships, getClassifications, getSubClassifications } from '../api/championships'
import CountryFlag from '../components/common/CountryFlag'

const MEDAL_COLORS = { GOLD: '#FFD700', SILVER: '#C0C0C0', BRONZE: '#CD7F32' }

export default function MedalsPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialChampionship = searchParams.get('championship') || ''
  const [summary, setSummary] = useState([])
  const [swimmerSummary, setSwimmerSummary] = useState([])
  const [clubSummary, setClubSummary] = useState([])
  const [championships, setChampionships] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])
  const [filterClassification, setFilterClassification] = useState('')
  const [filterSub, setFilterSub] = useState('')
  const [selectedChampionship, setSelectedChampionship] = useState(initialChampionship)
  const [filterGender, setFilterGender] = useState('')
  const [view, setView] = useState('summary')

  useEffect(() => {
    getClassifications().then(res => setClassifications(res.data.results || res.data)).catch(() => {})
  }, [])

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
    if (filterGender) params.gender = filterGender
    getMedalSummary(params).then(res => setSummary(res.data)).catch(() => {})
    // Full swimmer tally within a championship; capped list globally
    getMedalSwimmerSummary({ ...params, limit: selectedChampionship ? 'all' : 100 })
      .then(res => setSwimmerSummary(res.data)).catch(() => {})
    getMedalClubSummary(params).then(res => setClubSummary(res.data)).catch(() => {})
  }, [selectedChampionship, filterClassification, filterSub, filterGender])

  // Country tally is meaningless for National/Other contexts — clubs compete, not countries
  const selectedChampObj = championships.find(c => String(c.id) === String(selectedChampionship))
  const selectedClassObj = classifications.find(c => String(c.id) === String(filterClassification))
  const isNationalContext = selectedChampionship
    ? ['National', 'Other'].includes(selectedChampObj?.classification_name)
    : ['National', 'Other'].includes(selectedClassObj?.name)

  useEffect(() => {
    if (isNationalContext && view === 'summary') setView('clubs')
  }, [isNationalContext])

  const totalGold = summary.reduce((s, r) => s + (r.gold || 0), 0)
  const totalSilver = summary.reduce((s, r) => s + (r.silver || 0), 0)
  const totalBronze = summary.reduce((s, r) => s + (r.bronze || 0), 0)
  const totalAll = totalGold + totalSilver + totalBronze

  const hasFilters = filterClassification || filterSub || selectedChampionship || filterGender
  const clearFilters = () => {
    setFilterClassification(''); setFilterSub(''); setSelectedChampionship(''); setFilterGender('')
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Medal Tally</h1>
        <p className="text-sm text-gray-500 mt-1">Arab countries medal standings</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
        {[
          { label: 'Gold', count: totalGold, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
          { label: 'Silver', count: totalSilver, bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600' },
          { label: 'Bronze', count: totalBronze, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
          { label: 'Total', count: totalAll, bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} ${c.border} border rounded-xl p-3 sm:p-4 text-center`}>
            <div className={`text-2xl sm:text-3xl font-black ${c.text}`}>{c.count}</div>
            <div className="text-[10px] sm:text-xs font-semibold text-gray-500 mt-1">{c.label}</div>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Gender</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[{ v: '', l: 'All' }, { v: 'M', l: 'Male' }, { v: 'F', l: 'Female' }].map(g => (
                <button key={g.v} onClick={() => setFilterGender(g.v)}
                  className={`flex-1 px-2 py-2 text-xs font-bold transition-all ${filterGender === g.v ? 'bg-sky-600 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                  {g.l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {[
          ...(!isNationalContext ? [{ key: 'summary', label: 'Country Tally' }] : []),
          { key: 'clubs', label: 'By Club' },
          { key: 'swimmers', label: 'By Swimmer' },
        ].map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              view === t.key ? 'bg-white text-sky-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Country Tally View */}
      {view === 'summary' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {summary.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-500 w-10">#</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-500">Country</th>
                    <th className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-gray-500 w-16">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black" style={{ backgroundColor: '#FFD70035', color: '#8B6914' }}>G</span>
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-gray-500 w-16">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black" style={{ backgroundColor: '#C0C0C035', color: '#555' }}>S</span>
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-gray-500 w-16">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black" style={{ backgroundColor: '#CD7F3235', color: '#8B4513' }}>B</span>
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-gray-500 w-16">Total</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden md:table-cell" style={{ minWidth: 150 }}>Distribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary.map((row, i) => {
                    const total = (row.gold || 0) + (row.silver || 0) + (row.bronze || 0)
                    const maxTotal = (summary[0]?.gold || 0) + (summary[0]?.silver || 0) + (summary[0]?.bronze || 0)
                    return (
                      <tr key={i} className={`hover:bg-gray-50 ${i < 3 ? 'bg-amber-50/30' : ''}`}>
                        <td className="px-3 sm:px-4 py-3">
                          <span className={`text-sm font-bold ${i === 0 ? 'text-amber-600' : i === 1 ? 'text-gray-500' : i === 2 ? 'text-orange-700' : 'text-gray-400'}`}>{i + 1}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          <CountryFlag code={row.swimmer__nationality__code} flagUrl={row.swimmer__nationality__flag_url} name={row.swimmer__nationality__name} />
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <span className={`font-bold text-sm ${row.gold ? 'text-amber-700' : 'text-gray-300'}`}>{row.gold || 0}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <span className={`font-bold text-sm ${row.silver ? 'text-gray-600' : 'text-gray-300'}`}>{row.silver || 0}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <span className={`font-bold text-sm ${row.bronze ? 'text-orange-700' : 'text-gray-300'}`}>{row.bronze || 0}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <span className="font-black text-sm text-gray-800">{total}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 hidden md:table-cell">
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
            </div>
          ) : (
            <div className="p-12 text-center text-gray-400">No medals found for the selected filters</div>
          )}
        </div>
      )}

      {/* By Club View */}
      {view === 'clubs' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {clubSummary.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-500 w-10">#</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-500">Club</th>
                    <th className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-gray-500 w-16">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black" style={{ backgroundColor: '#FFD70035', color: '#8B6914' }}>G</span>
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-gray-500 w-16">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black" style={{ backgroundColor: '#C0C0C035', color: '#555' }}>S</span>
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-gray-500 w-16">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black" style={{ backgroundColor: '#CD7F3235', color: '#8B4513' }}>B</span>
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-gray-500 w-16">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {clubSummary.map((row, i) => {
                    const total = (row.gold || 0) + (row.silver || 0) + (row.bronze || 0)
                    return (
                      <tr key={i} className={`hover:bg-gray-50 ${i < 3 ? 'bg-amber-50/30' : ''}`}>
                        <td className="px-3 sm:px-4 py-3">
                          <span className={`text-sm font-bold ${i === 0 ? 'text-amber-600' : i === 1 ? 'text-gray-500' : i === 2 ? 'text-orange-700' : 'text-gray-400'}`}>{i + 1}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          <span className="text-sm font-semibold text-gray-800">{row.result__team}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <span className={`font-bold text-sm ${row.gold ? 'text-amber-700' : 'text-gray-300'}`}>{row.gold || 0}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <span className={`font-bold text-sm ${row.silver ? 'text-gray-600' : 'text-gray-300'}`}>{row.silver || 0}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <span className={`font-bold text-sm ${row.bronze ? 'text-orange-700' : 'text-gray-300'}`}>{row.bronze || 0}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <span className="font-black text-sm text-gray-800">{total}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-gray-400">No club medals found for the selected filters</div>
          )}
        </div>
      )}

      {/* By Swimmer View */}
      {view === 'swimmers' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {swimmerSummary.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-500 w-10">#</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-500">Swimmer</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden sm:table-cell">Country</th>
                    <th className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-gray-500 w-16">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black" style={{ backgroundColor: '#FFD70035', color: '#8B6914' }}>G</span>
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-gray-500 w-16">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black" style={{ backgroundColor: '#C0C0C035', color: '#555' }}>S</span>
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-gray-500 w-16">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black" style={{ backgroundColor: '#CD7F3235', color: '#8B4513' }}>B</span>
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-gray-500 w-16">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {swimmerSummary.map((row, i) => {
                    const total = (row.gold || 0) + (row.silver || 0) + (row.bronze || 0)
                    return (
                      <tr key={i} className={`hover:bg-gray-50 cursor-pointer ${i < 3 ? 'bg-amber-50/30' : ''}`}
                        onClick={() => navigate(`/swimmers/${row.swimmer__id}`)}>
                        <td className="px-3 sm:px-4 py-3">
                          <span className={`text-sm font-bold ${i === 0 ? 'text-amber-600' : i === 1 ? 'text-gray-500' : i === 2 ? 'text-orange-700' : 'text-gray-400'}`}>{i + 1}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          <span className="text-sm font-semibold text-gray-800 hover:text-sky-700 transition-colors">{row.swimmer__name}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                          <CountryFlag code={row.swimmer__nationality__code} flagUrl={row.swimmer__nationality__flag_url} name={row.swimmer__nationality__name} />
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <span className={`font-bold text-sm ${row.gold ? 'text-amber-700' : 'text-gray-300'}`}>{row.gold || 0}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <span className={`font-bold text-sm ${row.silver ? 'text-gray-600' : 'text-gray-300'}`}>{row.silver || 0}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <span className={`font-bold text-sm ${row.bronze ? 'text-orange-700' : 'text-gray-300'}`}>{row.bronze || 0}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <span className="font-black text-sm text-gray-800">{total}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-gray-400">No medals found for the selected filters</div>
          )}
        </div>
      )}

    </div>
  )
}
