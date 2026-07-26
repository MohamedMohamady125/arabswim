import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getChampionships, createChampionship, updateChampionship, getClassificationCategories, getClassifications, getSubClassifications } from '../api/championships'
import { getCountries } from '../api/core'
import { POOL_TYPES, mediaUrl } from '../utils/constants'
import CountryFlag from '../components/common/CountryFlag'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function Countdown({ targetDate }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const diff = targetDate.getTime() - now
  if (diff <= 0) return null

  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)

  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-2 flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Starts in
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          { val: days, label: 'Days' },
          { val: hours, label: 'Hours' },
          { val: mins, label: 'Min' },
          { val: secs, label: 'Sec' },
        ].map(({ val, label }) => (
          <div key={label} className="bg-white/10 backdrop-blur-sm rounded-lg px-2 py-2 text-center border border-white/20">
            <div className="text-2xl font-black text-white leading-none">{String(val).padStart(2, '0')}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/60 mt-1">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FeaturedMeet({ meet: c, navigate }) {
  const d = dayjs(c.date, 'DD/MM/YYYY')
  const endD = c.end_date ? dayjs(c.end_date, 'DD/MM/YYYY') : null
  const targetDate = d.isValid() ? d.toDate() : null
  const isUpcoming = targetDate && targetDate.getTime() > Date.now()

  const dateStr = d.isValid()
    ? (endD && endD.isValid() && endD.format('DD/MM/YYYY') !== d.format('DD/MM/YYYY')
        ? `${d.date()}-${endD.date()} ${d.format('MMM')}. ${d.year()}`
        : d.format('D MMM YYYY'))
    : ''

  return (
    <div className="relative rounded-2xl overflow-hidden mb-6 cursor-pointer group"
      onClick={() => navigate(`/meets/${c.id}`)}>
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-blue-900 to-cyan-900">
        {c.meet_photo && (
          <img src={mediaUrl(c.meet_photo)} alt="" className="w-full h-full object-cover opacity-40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
      </div>

      <div className="relative px-6 sm:px-8 py-8 sm:py-10">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-3 py-1.5 rounded-full mb-5 border border-white/20">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Featured Competition</span>
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-2 group-hover:text-cyan-200 transition-colors">{c.name}</h2>

        {/* Subtitle */}
        <p className="text-white/70 text-sm sm:text-base mb-5">
          {c.pool === 'LCM' ? 'Long Course 50m' : 'Short Course 25m'}
        </p>

        {/* Location & Date */}
        <div className="space-y-2 mb-6">
          {c.location && (
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              {c.location}{c.country_detail ? `, ${c.country_detail.name}` : ''}
            </div>
          )}
          {dateStr && (
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              {dateStr}
            </div>
          )}
        </div>

        {/* Countdown */}
        {isUpcoming && targetDate && <Countdown targetDate={targetDate} />}
      </div>
    </div>
  )
}

function MeetExpandedPanel({ meet: c, navigate, onUpdate }) {
  const [editingField, setEditingField] = useState(null)
  const [fieldValue, setFieldValue] = useState('')
  const [saving, setSaving] = useState(false)

  const startEdit = (field, currentValue) => {
    setEditingField(field)
    setFieldValue(currentValue || '')
  }

  const saveField = async (field, value) => {
    setSaving(true)
    try {
      const data = new FormData()
      data.append(field, value)
      await updateChampionship(c.id, data)
      onUpdate({ ...c, [field]: value })
      setEditingField(null)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const uploadGuide = async (file) => {
    setSaving(true)
    try {
      const data = new FormData()
      data.append('meet_guide_pdf', file)
      const res = await updateChampionship(c.id, data)
      onUpdate({ ...c, meet_guide_pdf: res.data.meet_guide_pdf })
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-gray-50 border border-cyan-500 border-t-0 rounded-b-xl px-6 py-4">
      {/* Meet Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
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

      {/* Three main sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {/* Live Results */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-red-500 text-lg">&#x1F534;</span>
            <h4 className="font-semibold text-sm">Live Results</h4>
          </div>
          {c.live_results_url && editingField !== 'live_results_url' ? (
            <div>
              <a href={c.live_results_url} target="_blank" rel="noopener noreferrer"
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 inline-flex items-center gap-1.5 w-full justify-center mb-2">
                Open Live Results
              </a>
              <button onClick={(e) => { e.stopPropagation(); startEdit('live_results_url', c.live_results_url) }}
                className="text-xs text-gray-400 hover:text-gray-600 w-full text-center">Edit link</button>
            </div>
          ) : editingField === 'live_results_url' ? (
            <div className="space-y-2" onClick={e => e.stopPropagation()}>
              <input type="url" value={fieldValue} onChange={e => setFieldValue(e.target.value)}
                placeholder="https://..." className="w-full border rounded-lg px-3 py-2 text-sm" autoFocus />
              <div className="flex gap-2">
                <button onClick={() => saveField('live_results_url', fieldValue)} disabled={saving}
                  className="flex-1 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-red-700 disabled:opacity-50">Save</button>
                <button onClick={() => setEditingField(null)}
                  className="flex-1 border px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); startEdit('live_results_url', '') }}
              className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-400 hover:border-red-400 hover:text-red-500">
              + Add Live Results Link
            </button>
          )}
        </div>

        {/* Meet Guide PDF */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-blue-500 text-lg">&#x1F4D6;</span>
            <h4 className="font-semibold text-sm">Entry Pack</h4>
          </div>
          {c.meet_guide_pdf ? (
            <div>
              <a href={c.meet_guide_pdf} target="_blank" rel="noopener noreferrer"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 inline-flex items-center gap-1.5 w-full justify-center mb-2">
                View Entry Pack
              </a>
              <label className="block text-xs text-gray-400 hover:text-gray-600 w-full text-center cursor-pointer" onClick={e => e.stopPropagation()}>
                Replace PDF
                <input type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files[0]) uploadGuide(e.target.files[0]) }} />
              </label>
            </div>
          ) : (
            <label className="block cursor-pointer" onClick={e => e.stopPropagation()}>
              <div className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 text-center">
                + Upload Entry Pack PDF
              </div>
              <input type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files[0]) uploadGuide(e.target.files[0]) }} />
            </label>
          )}
        </div>

        {/* Registration */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-green-500 text-lg">&#x270F;&#xFE0F;</span>
            <h4 className="font-semibold text-sm">Registration</h4>
          </div>
          {c.registration_url && editingField !== 'registration_url' ? (
            <div>
              <a href={c.registration_url} target="_blank" rel="noopener noreferrer"
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 inline-flex items-center gap-1.5 w-full justify-center mb-2">
                Open Registration
              </a>
              <button onClick={(e) => { e.stopPropagation(); startEdit('registration_url', c.registration_url) }}
                className="text-xs text-gray-400 hover:text-gray-600 w-full text-center">Edit link</button>
            </div>
          ) : editingField === 'registration_url' ? (
            <div className="space-y-2" onClick={e => e.stopPropagation()}>
              <input type="url" value={fieldValue} onChange={e => setFieldValue(e.target.value)}
                placeholder="https://..." className="w-full border rounded-lg px-3 py-2 text-sm" autoFocus />
              <div className="flex gap-2">
                <button onClick={() => saveField('registration_url', fieldValue)} disabled={saving}
                  className="flex-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-green-700 disabled:opacity-50">Save</button>
                <button onClick={() => setEditingField(null)}
                  className="flex-1 border px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); startEdit('registration_url', '') }}
              className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-400 hover:border-green-400 hover:text-green-500">
              + Add Registration Link
            </button>
          )}
        </div>
      </div>

      {/* Other buttons */}
      <div className="flex flex-wrap gap-3">
        {c.website && (
          <a href={c.website} target="_blank" rel="noopener noreferrer"
            className="bg-cyan-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-cyan-700 inline-flex items-center gap-1.5">
            <span>&#x1F310;</span> Website
          </a>
        )}
        {c.policy_pdf && (
          <a href={c.policy_pdf} target="_blank" rel="noopener noreferrer"
            className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-100 inline-flex items-center gap-1.5">
            <span>&#x1F4C4;</span> Nashra (Policy)
          </a>
        )}
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const [championships, setChampionships] = useState([])
  const [countries, setCountries] = useState([])
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))
  const [filterCountry, setFilterCountry] = useState('')
  const [selectedMeet, setSelectedMeet] = useState(null)

  // Add event
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [newEvent, setNewEvent] = useState({
    name: '', date: '', end_date: '', pool: 'LCM', country: '',
    location: '', website: '', live_results_url: '', registration_url: '',
    classification_category: '', classification: '', sub_classification: '',
  })
  const [categories, setCategories] = useState([])
  const [classificationsList, setClassificationsList] = useState([])
  const [subClassificationsList, setSubClassificationsList] = useState([])
  const [addLoading, setAddLoading] = useState(false)

  const years = []
  for (let y = new Date().getFullYear() + 2; y >= 2000; y--) years.push(y)

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
    getClassificationCategories().then(res => setCategories(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (newEvent.classification_category) {
      getClassifications(newEvent.classification_category).then(res => setClassificationsList(res.data)).catch(() => {})
    } else {
      setClassificationsList([])
    }
  }, [newEvent.classification_category])

  useEffect(() => {
    if (newEvent.classification) {
      getSubClassifications(newEvent.classification).then(res => setSubClassificationsList(res.data)).catch(() => {})
    } else {
      setSubClassificationsList([])
    }
  }, [newEvent.classification])

  useEffect(() => {
    const params = { page_size: 500, ordering: 'date' }
    if (filterYear) params.year = filterYear
    if (filterCountry) params.country = filterCountry
    getChampionships(params).then(res => {
      setChampionships(res.data.results || res.data)
    }).catch(() => {})
  }, [filterYear, filterCountry])

  // Find the next upcoming meet for the featured card
  const now = new Date()
  const upcomingMeet = championships.find(c => {
    const d = dayjs(c.date, 'DD/MM/YYYY')
    return d.isValid() && d.toDate() >= now
  }) || (championships.length > 0 ? championships[championships.length - 1] : null)

  // Group championships by month
  const grouped = {}
  championships.forEach(c => {
    const d = dayjs(c.date, 'DD/MM/YYYY')
    const key = `${d.year()}-${String(d.month() + 1).padStart(2, '0')}`
    if (!grouped[key]) grouped[key] = { year: d.year(), month: d.month(), events: [] }
    grouped[key].events.push(c)
  })

  const handleAddEvent = async (e) => {
    e.preventDefault()
    setAddLoading(true)
    try {
      const data = new FormData()
      Object.entries(newEvent).forEach(([k, v]) => {
        if (v !== '' && v !== null) data.append(k, v)
      })
      await createChampionship(data)
      setNewEvent({ name: '', date: '', end_date: '', pool: 'LCM', country: '', location: '', website: '', live_results_url: '', registration_url: '', classification_category: '', classification: '', sub_classification: '' })
      setShowAddEvent(false)
      // Refresh championships list
      const params = { page_size: 500, ordering: 'date' }
      if (filterYear) params.year = filterYear
      if (filterCountry) params.country = filterCountry
      getChampionships(params).then(res => setChampionships(res.data.results || res.data)).catch(() => {})
    } catch (err) {
      alert('Error: ' + (err.response?.data ? JSON.stringify(err.response.data) : err.message))
    } finally {
      setAddLoading(false)
    }
  }

  return (
    <div>
      {/* Featured upcoming meet */}
      {upcomingMeet && <FeaturedMeet meet={upcomingMeet} navigate={navigate} />}

      {/* Filters */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-3">
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
            className="border-2 border-cyan-500 rounded-lg px-4 py-2 text-sm bg-white font-medium">
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}
            className="border-2 border-cyan-500 rounded-lg px-4 py-2 text-sm bg-white">
            <option value="">All Countries</option>
            {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={() => setShowAddEvent(true)}
          className="bg-cyan-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-cyan-700 font-medium">
          + Add Event
        </button>
      </div>

      {/* Events grouped by month */}
      {Object.keys(grouped).length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">&#x1F4C5;</div>
          <p>No competitions found for the selected filters</p>
        </div>
      )}

      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => (
        <div key={key} className="mb-8">
          {/* Month header */}
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-wide">
              {MONTHS[group.month]} {group.year}
            </h2>
            <div className="flex-1 h-px bg-cyan-200" />
          </div>

          {/* Meet cards */}
          <div className="space-y-3">
            {group.events.map(c => {
              const d = dayjs(c.date, 'DD/MM/YYYY')
              const isSelected = selectedMeet?.id === c.id

              return (
                <div key={c.id}>
                  <div
                    onClick={() => setSelectedMeet(isSelected ? null : c)}
                    className={`bg-white border px-6 py-5 flex items-center gap-6 cursor-pointer transition-all hover:shadow-md ${
                      isSelected ? 'border-cyan-500 shadow-md rounded-t-xl' : 'border-gray-200 rounded-xl'
                    }`}
                  >
                    {/* Meet photo or date badge */}
                    {c.meet_photo ? (
                      <div className="w-24 h-20 rounded-xl overflow-hidden shrink-0 shadow">
                        <img src={mediaUrl(c.meet_photo)} alt={c.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-20 h-20 bg-cyan-500 rounded-xl flex flex-col items-center justify-center text-white shrink-0 shadow">
                        <span className="text-3xl font-bold leading-none">{d.date()}</span>
                        <span className="text-xs font-semibold uppercase tracking-wider mt-0.5">{MONTH_SHORT[d.month()]}</span>
                      </div>
                    )}

                    {/* Meet info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg text-gray-900 truncate">{c.name}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-1.5">
                        {c.location && (
                          <span className="flex items-center gap-1">
                            <span className="text-gray-400">&#x1F4CD;</span>
                            {c.location}
                            {c.country_detail && <span>, {c.country_detail.name}</span>}
                          </span>
                        )}
                        {!c.location && c.country_detail && (
                          <CountryFlag code={c.country_detail.code} flagUrl={c.country_detail.flag_url} name={c.country_detail.name} />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-400 mt-1.5">
                        <span>{c.pool === 'LCM' ? '50m Pool' : '25m Pool'}</span>
                        {c.end_date && c.end_date !== c.date && (
                          <span>&mdash; {c.date} to {c.end_date}</span>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <span className={`text-gray-400 text-lg transition-transform ${isSelected ? 'rotate-90' : ''}`}>&#x276F;</span>
                  </div>

                  {/* Expanded meet details */}
                  {isSelected && (
                    <MeetExpandedPanel meet={c} navigate={navigate} onUpdate={(updated) => {
                      setChampionships(prev => prev.map(ch => ch.id === updated.id ? { ...ch, ...updated } : ch))
                    }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Add Event Modal */}
      {showAddEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto py-8" onClick={() => setShowAddEvent(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Add Competition</h2>
            <form onSubmit={handleAddEvent} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input type="text" value={newEvent.name} onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Arab Swimming Championship 2026" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Country *</label>
                  <select value={newEvent.country} onChange={(e) => setNewEvent({ ...newEvent, country: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" required>
                    <option value="">Select country</option>
                    {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Pool *</label>
                  <select value={newEvent.pool} onChange={(e) => setNewEvent({ ...newEvent, pool: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Start Date *</label>
                  <input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End Date</label>
                  <input type="date" value={newEvent.end_date} onChange={(e) => setNewEvent({ ...newEvent, end_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <input type="text" value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="City / Venue" />
              </div>

              {/* Classification */}
              <div className="border-t pt-3 mt-3">
                <h3 className="text-sm font-medium text-gray-600 mb-2">Classification</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Category</label>
                    <select value={newEvent.classification_category} onChange={(e) => setNewEvent({ ...newEvent, classification_category: e.target.value, classification: '', sub_classification: '' })}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm">
                      <option value="">--</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Classification</label>
                    <select value={newEvent.classification} onChange={(e) => setNewEvent({ ...newEvent, classification: e.target.value, sub_classification: '' })}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm" disabled={!classificationsList.length}>
                      <option value="">--</option>
                      {classificationsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Sub</label>
                    <select value={newEvent.sub_classification} onChange={(e) => setNewEvent({ ...newEvent, sub_classification: e.target.value })}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm" disabled={!subClassificationsList.length}>
                      <option value="">--</option>
                      {subClassificationsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Links */}
              <div className="border-t pt-3 mt-3">
                <h3 className="text-sm font-medium text-gray-600 mb-2">Links</h3>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Website</label>
                    <input type="url" value={newEvent.website} onChange={(e) => setNewEvent({ ...newEvent, website: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="https://..." />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Live Results URL</label>
                    <input type="url" value={newEvent.live_results_url} onChange={(e) => setNewEvent({ ...newEvent, live_results_url: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="https://..." />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Registration URL</label>
                    <input type="url" value={newEvent.registration_url} onChange={(e) => setNewEvent({ ...newEvent, registration_url: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="https://..." />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => setShowAddEvent(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancel</button>
                <button type="submit" disabled={!newEvent.name || !newEvent.date || !newEvent.country || addLoading}
                  className="flex-1 bg-cyan-600 text-white rounded-lg py-2 text-sm hover:bg-cyan-700 disabled:opacity-50">
                  {addLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
