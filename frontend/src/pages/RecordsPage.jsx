import { useState, useEffect } from 'react'
import { getComputedRecords } from '../api/records'
import { getCountries } from '../api/core'
import CountryFlag from '../components/common/CountryFlag'
import { POOL_TYPES, AGE_GROUPS } from '../utils/constants'

export default function RecordsPage() {
  const [records, setRecords] = useState([])
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    scope: 'arab', country: '', gender: '', pool: 'LCM', age_group: 'OPEN',
  })

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = { ...filters }
    Object.keys(params).forEach(k => { if (!params[k]) delete params[k] })
    getComputedRecords(params).then(res => {
      setRecords(res.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [filters])

  const updateFilter = (key, value) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'scope' && prev.country) {
        const selectedCountry = countries.find(c => c.id.toString() === prev.country.toString())
        if (selectedCountry) {
          const region = selectedCountry.region
          if (value === 'gcc' && region !== 'GCC') next.country = ''
          else if (value === 'arab' && region !== 'ARAB' && region !== 'GCC') next.country = ''
        }
      }
      return next
    })
  }

  const menRecords = records.filter(r => r.gender === 'M')
  const womenRecords = records.filter(r => r.gender === 'F')

  const RecordTable = ({ title, data }) => (
    <div className="mb-6 sm:mb-8">
      <h2 className="text-base sm:text-lg font-bold mb-2 sm:mb-3">{title}</h2>
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-2.5 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Event</th>
              <th className="px-2.5 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Swimmer</th>
              <th className="px-2.5 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase whitespace-nowrap hidden sm:table-cell">Nationality</th>
              <th className="px-2.5 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Time</th>
              <th className="px-2.5 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase whitespace-nowrap hidden md:table-cell">FINA</th>
              <th className="px-2.5 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase whitespace-nowrap hidden lg:table-cell">Championship</th>
              <th className="px-2.5 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase whitespace-nowrap hidden lg:table-cell">Location</th>
              <th className="px-2.5 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase whitespace-nowrap hidden md:table-cell">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-2.5 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium whitespace-nowrap">{r.event_name}</td>
                <td className="px-2.5 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm whitespace-nowrap">{r.swimmer_name}</td>
                <td className="px-2.5 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm hidden sm:table-cell"><CountryFlag code={r.nationality_code} flagUrl={r.nationality_flag} name={r.nationality} /></td>
                <td className="px-2.5 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-mono font-medium whitespace-nowrap">{r.time}</td>
                <td className="px-2.5 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm hidden md:table-cell">{r.fina_points || '-'}</td>
                <td className="px-2.5 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm hidden lg:table-cell">{r.championship_name}</td>
                <td className="px-2.5 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm hidden lg:table-cell"><CountryFlag code={r.championship_country_code} flagUrl={r.championship_country_flag} name={r.championship_country} /></td>
                <td className="px-2.5 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm hidden md:table-cell">{r.date}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No records found.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Records</h1>

      <div className="flex gap-1.5 sm:gap-2 mb-3 sm:mb-4">
        {['national', 'arab', 'gcc'].map(scope => (
          <button key={scope} onClick={() => updateFilter('scope', scope)} className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium capitalize ${filters.scope === scope ? 'bg-red-500 text-white' : 'border border-gray-300'}`}>
            {scope === 'national' ? 'National' : scope.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-3 sm:mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Country</label>
          <select value={filters.country} onChange={(e) => updateFilter('country', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">All</option>
            {countries
              .filter(c => {
                if (filters.scope === 'gcc') return c.region === 'GCC'
                return c.region === 'ARAB' || c.region === 'GCC'
              })
              .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Gender</label>
          <select value={filters.gender} onChange={(e) => updateFilter('gender', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Both</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Pool</label>
          <select value={filters.pool} onChange={(e) => updateFilter('pool', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-1 mb-3 sm:mb-4 overflow-x-auto scrollbar-hide">
        {AGE_GROUPS.map(ag => (
          <button key={ag} onClick={() => updateFilter('age_group', ag)} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium whitespace-nowrap border rounded-md ${filters.age_group === ag ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300'}`}>
            {ag}
          </button>
        ))}
      </div>

      {filters.scope === 'national' && !filters.country ? (
        <div className="text-center py-8 text-gray-500">Select a country to view national records</div>
      ) : loading ? (
        <div className="text-center py-8 text-gray-500">Loading records...</div>
      ) : (
        <>
          {(!filters.gender || filters.gender === 'M') && <RecordTable title="Men" data={menRecords} />}
          {(!filters.gender || filters.gender === 'F') && <RecordTable title="Women" data={womenRecords} />}
        </>
      )}
    </div>
  )
}
