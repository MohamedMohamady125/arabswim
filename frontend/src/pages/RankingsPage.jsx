import { useState, useEffect } from 'react'
import { getRankings } from '../api/rankings'
import { getCountries, getEvents } from '../api/core'
import Pagination from '../components/common/Pagination'
import CountryFlag from '../components/common/CountryFlag'
import { POOL_TYPES, AGE_GROUPS } from '../utils/constants'

export default function RankingsPage() {
  const [rankings, setRankings] = useState([])
  const [countries, setCountries] = useState([])
  const [events, setEvents] = useState([])
  const [pagination, setPagination] = useState({})
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    scope: 'national', country: '', gender: 'M', year: '', pool: 'LCM', event: '', age_group: 'OPEN'
  })

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
    getEvents().then(res => {
      setEvents(res.data)
      // Auto-select first non-relay event
      if (res.data.length && !filters.event) {
        const first = res.data.find(e => !e.is_relay) || res.data[0]
        setFilters(prev => ({ ...prev, event: first.id.toString() }))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!filters.event) {
      setRankings([])
      setPagination({})
      return
    }
    const params = { page, ...filters }
    Object.keys(params).forEach(k => { if (!params[k]) delete params[k] })
    getRankings(params).then(res => {
      setRankings(res.data.results || res.data)
      if (res.data.count !== undefined) {
        setPagination({ count: res.data.count, next: res.data.next, previous: res.data.previous })
      }
    }).catch(() => {})
  }, [page, filters])

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const years = []
  for (let y = new Date().getFullYear(); y >= 2000; y--) years.push(y)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Ranking</h1>

      <div className="flex gap-2 mb-4">
        {['national', 'arab', 'gcc'].map(scope => (
          <button key={scope} onClick={() => updateFilter('scope', scope)} className={`px-4 py-2 rounded-full text-sm font-medium capitalize ${filters.scope === scope ? 'bg-red-500 text-white' : 'border border-gray-300'}`}>
            {scope === 'national' ? 'National' : scope.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        {filters.scope === 'national' && (
          <div>
            <label className="block text-sm font-medium mb-1">Country</label>
            <select value={filters.country} onChange={(e) => updateFilter('country', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select...</option>
              {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Gender</label>
          <select value={filters.gender} onChange={(e) => updateFilter('gender', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Year</label>
          <select value={filters.year} onChange={(e) => updateFilter('year', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">-- Select a year --</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Pool</label>
          <select value={filters.pool} onChange={(e) => updateFilter('pool', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Event</label>
          <select value={filters.event} onChange={(e) => updateFilter('event', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Select event</option>
            {events.filter(e => !e.is_relay).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-1 mb-4 overflow-x-auto">
        {AGE_GROUPS.map(ag => (
          <button key={ag} onClick={() => updateFilter('age_group', ag)} className={`px-4 py-2 text-sm font-medium whitespace-nowrap border ${filters.age_group === ag ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300'}`}>
            {ag}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border overflow-hidden max-h-[700px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Swimmer Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nationality</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Championship Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">FINA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rankings.map((r, i) => {
              const prevTime = i > 0 ? rankings[i - 1].time_centiseconds : null
              const isTied = prevTime !== null && r.time_centiseconds === prevTime
              return (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{isTied ? '--' : r.rank}</td>
                <td className="px-4 py-3 text-sm font-medium">{r.swimmer_name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{r.age_at_competition || '-'}</td>
                <td className="px-4 py-3 text-sm"><CountryFlag code={r.nationality_code} flagUrl={r.nationality_flag} name={r.nationality} /></td>
                <td className="px-4 py-3 text-sm font-mono">{r.time}</td>
                <td className="px-4 py-3 text-sm">{r.championship_name}</td>
                <td className="px-4 py-3 text-sm"><CountryFlag code={r.championship_country_code} flagUrl={r.championship_country_flag} name={r.championship_country} /></td>
                <td className="px-4 py-3 text-sm">{r.date}</td>
                <td className="px-4 py-3 text-sm">{r.fina_points || '-'}</td>
              </tr>
              )
            })}
            {rankings.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                {filters.event ? 'No rankings found for these filters.' : 'Select an event above to view rankings.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pagination.count > 0 && <Pagination {...pagination} currentPage={page} onPageChange={setPage} pageSize={50} />}
    </div>
  )
}
