import { useState, useEffect } from 'react'
import { getComputedRecords, getClassifications, getSubClassifications } from '../api/records'
import CountryFlag from '../components/common/CountryFlag'
import { POOL_TYPES, formatTime } from '../utils/constants'

export default function RecordsPage() {
  const [records, setRecords] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    classification: '',
    sub_classification: '',
    pool: 'LCM',
  })

  useEffect(() => {
    getClassifications().then(res => {
      setClassifications(res.data)
      if (res.data.length && !filters.classification) {
        setFilters(prev => ({ ...prev, classification: res.data[0].id.toString() }))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (filters.classification) {
      getSubClassifications({ classification: filters.classification }).then(res => {
        setSubClassifications(res.data)
      }).catch(() => {})
    } else {
      setSubClassifications([])
    }
    setFilters(prev => ({ ...prev, sub_classification: '' }))
  }, [filters.classification])

  useEffect(() => {
    if (!filters.classification) {
      setRecords([])
      return
    }
    setLoading(true)
    const params = {}
    if (filters.classification) params.classification = filters.classification
    if (filters.sub_classification) params.sub_classification = filters.sub_classification
    params.pool = filters.pool
    getComputedRecords(params).then(res => {
      setRecords(res.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [filters.classification, filters.sub_classification, filters.pool])

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const menRecords = records.filter(r => r.gender === 'M')
  const womenRecords = records.filter(r => r.gender === 'F')

  const RecordTable = ({ title, data }) => (
    <div className="mb-8">
      <h2 className="text-lg font-bold mb-3">{title}</h2>
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Swimmer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nationality</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">FINA</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Championship</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium">{r.event_name}</td>
                <td className="px-4 py-3 text-sm">{r.swimmer_name}</td>
                <td className="px-4 py-3 text-sm"><CountryFlag code={r.nationality_code} flagUrl={r.nationality_flag} name={r.nationality} /></td>
                <td className="px-4 py-3 text-sm font-mono font-medium">{r.time}</td>
                <td className="px-4 py-3 text-sm">{r.fina_points || '-'}</td>
                <td className="px-4 py-3 text-sm">{r.championship_name}</td>
                <td className="px-4 py-3 text-sm"><CountryFlag code={r.championship_country_code} flagUrl={r.championship_country_flag} name={r.championship_country} /></td>
                <td className="px-4 py-3 text-sm">{r.date}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No records found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Records</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1">Classification</label>
          <select value={filters.classification} onChange={(e) => updateFilter('classification', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Select...</option>
            {classifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Sub-Classification</label>
          <select value={filters.sub_classification} onChange={(e) => updateFilter('sub_classification', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">All</option>
            {subClassifications.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Pool</label>
          <select value={filters.pool} onChange={(e) => updateFilter('pool', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading records...</div>
      ) : (
        <>
          <RecordTable title="Men" data={menRecords} />
          <RecordTable title="Women" data={womenRecords} />
        </>
      )}
    </div>
  )
}
