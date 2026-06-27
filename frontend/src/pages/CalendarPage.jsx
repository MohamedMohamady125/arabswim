import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCalendarEvents, createCalendarEvent } from '../api/calendar'
import { getChampionships } from '../api/championships'
import { getCountries } from '../api/core'
import { getSwimmerBirthdays } from '../api/swimmers'
import { POOL_TYPES } from '../utils/constants'
import dayjs from 'dayjs'

export default function CalendarPage() {
  // Main view state
  const [scope, setScope] = useState('') // '' = all, national, international
  const [filterCountry, setFilterCountry] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [championships, setChampionships] = useState([])
  const [countries, setCountries] = useState([])

  const navigate = useNavigate()

  // Add event modal
  const [showAddEvent, setShowAddEvent] = useState(false)

  // Calendar state (inside add event)
  const [currentDate, setCurrentDate] = useState(dayjs())
  const [calendarEvents, setCalendarEvents] = useState([])
  const [birthdays, setBirthdays] = useState([])
  const [summary, setSummary] = useState({ total_events: 0, birthdays_count: 0 })

  // New event form
  const [newEvent, setNewEvent] = useState({
    title: '', date: '', end_date: '', event_type: 'CHAMPIONSHIP',
    description: '', location: '', pool: 'LCM',
  })

  const years = []
  for (let y = new Date().getFullYear() + 2; y >= 2000; y--) years.push(y)

  useEffect(() => {
    getCountries().then(res => setCountries(res.data))
  }, [])

  // Fetch championships based on filters
  useEffect(() => {
    const params = { page_size: 200, ordering: '-date' }
    if (filterYear) params.year = filterYear
    if (filterCountry) params.country = filterCountry
    getChampionships(params).then(res => {
      setChampionships(res.data.results || res.data)
    })
  }, [filterYear, filterCountry, scope])

  // Calendar data (when add event is open)
  const month = currentDate.month() + 1
  const calYear = currentDate.year()

  useEffect(() => {
    if (!showAddEvent) return
    getCalendarEvents({ month, year: calYear }).then(res => {
      const data = res.data.results || res.data
      setCalendarEvents(data)
      setSummary(prev => ({ ...prev, total_events: data.length }))
    })
    getSwimmerBirthdays(month).then(res => {
      setBirthdays(res.data)
      setSummary(prev => ({ ...prev, birthdays_count: res.data.length }))
    })
  }, [month, calYear, showAddEvent])

  const daysInMonth = currentDate.daysInMonth()
  const firstDayOfWeek = currentDate.startOf('month').day()
  const days = []
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  const getEventsForDay = (day) => calendarEvents.filter(e => dayjs(e.date).date() === day)
  const getBirthdaysForDay = (day) => birthdays.filter(b => b.day === day)

  const handleAddEvent = async (e) => {
    e.preventDefault()
    await createCalendarEvent(newEvent)
    setNewEvent({ title: '', date: '', end_date: '', event_type: 'CHAMPIONSHIP', description: '', location: '', pool: 'LCM' })
    setShowAddEvent(false)
    // Refresh
    getCalendarEvents({ month, year: calYear }).then(res => setCalendarEvents(res.data.results || res.data))
  }

  // Main view
  if (!showAddEvent) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Championships</h1>
          <button
            onClick={() => setShowAddEvent(true)}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-blue-700"
          >
            + Add Event
          </button>
        </div>

        {/* Scope tabs */}
        <div className="flex gap-2 mb-4">
          {['', 'national', 'international'].map(s => (
            <button
              key={s}
              onClick={() => { setScope(s); if (s !== 'national') setFilterCountry('') }}
              className={`px-5 py-2 rounded-lg text-sm font-medium border-2 ${
                scope === s ? 'bg-sky-500 text-white border-sky-500' : 'border-sky-500 text-sky-500 bg-white'
              }`}
            >
              {s === '' ? 'All' : s === 'national' ? 'National' : 'International'}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          {scope === 'national' && (
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className="border-2 border-sky-500 rounded-lg px-4 py-2 text-sm bg-white"
            >
              <option value="">Country</option>
              {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="border-2 border-sky-500 rounded-lg px-4 py-2 text-sm bg-white"
          >
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Championships list */}
        <div className="space-y-3">
          {championships.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              No championships found for the selected filters
            </div>
          )}
          {championships.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/meets/${c.id}`)}
              className="bg-sky-500 text-white rounded-lg px-6 py-4 text-center text-lg font-semibold cursor-pointer hover:bg-sky-600 transition-colors"
            >
              {c.name}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Add Event view (calendar + form)
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setShowAddEvent(false)} className="text-gray-500 hover:text-gray-700">← Back</button>
        <h1 className="text-2xl font-bold">Add Event</h1>
      </div>

      <div className="flex gap-6">
        {/* Calendar */}
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => setCurrentDate(currentDate.subtract(1, 'month'))} className="px-3 py-1 border rounded">← Prev</button>
            <button onClick={() => setCurrentDate(dayjs())} className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm">Today</button>
            <h2 className="text-lg font-semibold">{currentDate.format('MMMM YYYY')}</h2>
            <button onClick={() => setCurrentDate(currentDate.add(1, 'month'))} className="px-3 py-1 border rounded">Next →</button>
          </div>
          <div className="bg-white rounded-lg border">
            <div className="grid grid-cols-7 border-b">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="px-2 py-2 text-center text-xs font-medium text-gray-500">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, i) => (
                <div
                  key={i}
                  className={`min-h-[80px] border-b border-r p-1 cursor-pointer hover:bg-gray-50 ${
                    day === dayjs().date() && month === dayjs().month() + 1 && calYear === dayjs().year() ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => day && setNewEvent(prev => ({ ...prev, date: `${calYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }))}
                >
                  {day && (
                    <>
                      <div className="text-sm font-medium text-gray-700">{day}</div>
                      {getBirthdaysForDay(day).map(b => (
                        <div key={b.id} className="text-[10px] bg-pink-100 text-pink-700 rounded px-1 mb-0.5 truncate">{b.name} 🎂{b.age}</div>
                      ))}
                      {getEventsForDay(day).map(e => (
                        <div key={e.id} className="text-[10px] bg-blue-100 text-blue-700 rounded px-1 mb-0.5 truncate">{e.title}</div>
                      ))}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Month Summary */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-white rounded-lg border p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{summary.total_events}</div>
              <div className="text-xs text-gray-500">Events This Month</div>
            </div>
            <div className="bg-white rounded-lg border p-4 text-center">
              <div className="text-2xl font-bold text-pink-600">{summary.birthdays_count}</div>
              <div className="text-xs text-gray-500">Birthdays This Month</div>
            </div>
          </div>
        </div>

        {/* Event Form + Birthdays */}
        <div className="w-80">
          <form onSubmit={handleAddEvent} className="bg-white rounded-lg border p-5 mb-4 space-y-4">
            <h3 className="font-semibold text-lg">Event Details</h3>

            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input type="text" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="e.g. 4th Arab Aquatics Championships" className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select value={newEvent.event_type} onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="CHAMPIONSHIP">Championship</option>
                <option value="MEET">Meet</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date *</label>
                <input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <input type="date" value={newEvent.end_date} onChange={(e) => setNewEvent({ ...newEvent, end_date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input type="text" value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })} placeholder="City / Country" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Pool</label>
              <select value={newEvent.pool} onChange={(e) => setNewEvent({ ...newEvent, pool: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} placeholder="Notes about the event..." className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} />
            </div>

            <button type="submit" disabled={!newEvent.title || !newEvent.date} className="w-full bg-green-600 text-white py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
              Save Event
            </button>
          </form>

          {/* Birthdays */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3">Birthdays This Month</h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {birthdays.map(b => (
                <div key={b.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs shrink-0">
                    {b.photo ? <img src={b.photo} alt="" className="w-full h-full rounded-full object-cover" /> : '👤'}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{b.name}</div>
                    <div className="text-xs text-gray-500">{currentDate.format('MMM')} {b.day} - Turns {b.age}</div>
                  </div>
                </div>
              ))}
              {birthdays.length === 0 && <p className="text-sm text-gray-400">No birthdays this month</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
