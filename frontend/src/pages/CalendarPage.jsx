import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCalendarEvents, createCalendarEvent } from '../api/calendar'
import { getChampionships } from '../api/championships'
import { getCountries } from '../api/core'
import { POOL_TYPES } from '../utils/constants'
import CountryFlag from '../components/common/CountryFlag'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

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
    title: '', date: '', end_date: '', event_type: 'CHAMPIONSHIP',
    description: '', location: '', pool: 'LCM',
  })

  const years = []
  for (let y = new Date().getFullYear() + 2; y >= 2000; y--) years.push(y)

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const params = { page_size: 500, ordering: 'date' }
    if (filterYear) params.year = filterYear
    if (filterCountry) params.country = filterCountry
    getChampionships(params).then(res => {
      setChampionships(res.data.results || res.data)
    }).catch(() => {})
  }, [filterYear, filterCountry])

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
    await createCalendarEvent(newEvent)
    setNewEvent({ title: '', date: '', end_date: '', event_type: 'CHAMPIONSHIP', description: '', location: '', pool: 'LCM' })
    setShowAddEvent(false)
  }

  return (
    <div>
      {/* Hero Banner */}
      <div className="relative rounded-xl overflow-hidden mb-8 bg-gradient-to-br from-slate-800 to-cyan-900 text-white">
        <div className="absolute inset-0 opacity-20" style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'}} />
        <div className="relative px-8 py-10">
          <h1 className="text-3xl font-bold mb-2">Competition Calendar</h1>
          <p className="text-slate-300 text-lg">Dates, status, and official results &mdash; the full competition schedule in one place.</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent rounded-b-xl" />
      </div>

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
                    className={`bg-white border rounded-xl px-5 py-4 flex items-center gap-5 cursor-pointer transition-all hover:shadow-md ${
                      isSelected ? 'border-cyan-500 shadow-md' : 'border-gray-200'
                    }`}
                  >
                    {/* Date badge */}
                    <div className="w-16 h-16 bg-cyan-500 rounded-xl flex flex-col items-center justify-center text-white shrink-0 shadow">
                      <span className="text-2xl font-bold leading-none">{d.date()}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider">{MONTH_SHORT[d.month()]}</span>
                    </div>

                    {/* Meet info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 truncate">{c.name}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
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
                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                        <span>{c.pool === 'LCM' ? '50m Pool' : '25m Pool'}</span>
                        {c.end_date && c.end_date !== c.date && (
                          <span>&mdash; {c.date} to {c.end_date}</span>
                        )}
                      </div>
                    </div>

                    {/* Stats badges */}
                    <div className="flex items-center gap-3 shrink-0">
                      {c.results_count > 0 && (
                        <span className="bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full text-xs font-medium">
                          {c.results_count} results
                        </span>
                      )}
                      {c.swimmers_count > 0 && (
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">
                          {c.swimmers_count} swimmers
                        </span>
                      )}
                    </div>

                    {/* Arrow */}
                    <span className={`text-gray-400 transition-transform ${isSelected ? 'rotate-90' : ''}`}>&#x276F;</span>
                  </div>

                  {/* Expanded meet details */}
                  {isSelected && (
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
                          <button onClick={() => navigate(`/meets/${c.id}`)}
                            className="bg-cyan-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-cyan-700">
                            View Results
                          </button>
                        )}
                        <button onClick={() => navigate(`/championships/${c.id}/edit`)}
                          className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
                          Edit Meet
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

      {/* Add Event Modal */}
      {showAddEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowAddEvent(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Add Calendar Event</h2>
            <form onSubmit={handleAddEvent} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Title *</label>
                <input type="text" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select value={newEvent.event_type} onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="CHAMPIONSHIP">Championship</option>
                  <option value="MEET">Meet</option>
                  <option value="CUSTOM">Custom</option>
                </select>
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
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="City / Country" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Pool</label>
                <select value={newEvent.pool} onChange={(e) => setNewEvent({ ...newEvent, pool: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddEvent(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancel</button>
                <button type="submit" disabled={!newEvent.title || !newEvent.date}
                  className="flex-1 bg-cyan-600 text-white rounded-lg py-2 text-sm hover:bg-cyan-700 disabled:opacity-50">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
