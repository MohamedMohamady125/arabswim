import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createCalendarEvent, getCalendarEvents, updateCalendarEvent, deleteCalendarEvent } from '../api/calendar'
import { getChampionships, getChampionship, createChampionship, updateChampionship, deleteChampionship } from '../api/championships'
import { getCountries } from '../api/core'
import { getSwimmerBirthdays } from '../api/swimmers'
import { POOL_TYPES, mediaUrl, formatDate } from '../utils/constants'
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
    <div className={`relative rounded-2xl overflow-hidden mb-6 group ${c.id ? 'cursor-pointer' : ''}`}
      onClick={() => { if (c.id) navigate(`/meets/${c.id}`) }}>
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
          {c.pool ? (c.pool === 'LCM' ? 'Long Course 50m' : 'Short Course 25m') : (c.description || 'Upcoming competition')}
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

function MeetExpandedPanel({ meet: c, navigate, onUpdate, onDelete, countries = [] }) {
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
          <div className="text-sm font-medium">{formatDate(c.date)}{c.end_date && c.end_date !== c.date ? ` to ${formatDate(c.end_date)}` : ''}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Pool</div>
          <div className="text-sm font-medium">{c.pool === 'LCM' ? 'Long Course (50m)' : 'Short Course (25m)'}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Country</div>
          <div className="text-sm font-medium">
            {editingField === 'country' ? (
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <select value={fieldValue} onChange={e => setFieldValue(e.target.value)} autoFocus
                  className="border rounded-lg px-2 py-1 text-xs max-w-[140px]">
                  <option value="">Select country</option>
                  {countries.map(co => <option key={co.id} value={co.id}>{co.name}</option>)}
                </select>
                <button disabled={saving || !fieldValue} onClick={async () => {
                  await saveField('country', fieldValue)
                  const co = countries.find(x => String(x.id) === String(fieldValue))
                  if (co) onUpdate({ ...c, country: co.id, country_detail: co })
                }} className="text-xs text-cyan-600 font-semibold disabled:opacity-50">Save</button>
                <button onClick={() => setEditingField(null)} className="text-xs text-gray-400">Cancel</button>
              </div>
            ) : c.country_detail ? (
              <CountryFlag code={c.country_detail.code} flagUrl={c.country_detail.flag_url} name={c.country_detail.name} />
            ) : (
              <button onClick={(e) => { e.stopPropagation(); startEdit('country', '') }}
                className="text-xs text-gray-400 border border-dashed border-gray-300 rounded-lg px-2 py-1 hover:border-cyan-400 hover:text-cyan-600">+ Set country</button>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Location</div>
          <div className="text-sm font-medium">
            {editingField === 'location' ? (
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <input value={fieldValue} onChange={e => setFieldValue(e.target.value)} autoFocus
                  placeholder="City / venue" className="border rounded-lg px-2 py-1 text-xs max-w-[140px]" />
                <button disabled={saving} onClick={() => saveField('location', fieldValue)}
                  className="text-xs text-cyan-600 font-semibold disabled:opacity-50">Save</button>
                <button onClick={() => setEditingField(null)} className="text-xs text-gray-400">Cancel</button>
              </div>
            ) : c.location ? (
              <span onClick={(e) => { e.stopPropagation(); startEdit('location', c.location) }} className="cursor-pointer hover:text-cyan-600" title="Edit">{c.location}</span>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); startEdit('location', '') }}
                className="text-xs text-gray-400 border border-dashed border-gray-300 rounded-lg px-2 py-1 hover:border-cyan-400 hover:text-cyan-600">+ Set location</button>
            )}
          </div>
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
        {c.is_calendar_only && onDelete && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(c) }}
            className="ml-auto border border-red-200 text-red-500 px-4 py-2 rounded-lg text-sm hover:bg-red-50 inline-flex items-center gap-1.5">
            Delete Meet
          </button>
        )}
      </div>
    </div>
  )
}

function TodayBirthdays({ navigate }) {
  const [today, setToday] = useState([])
  const [upcoming, setUpcoming] = useState([])

  useEffect(() => {
    const now = new Date()
    const thisMonth = now.getMonth() + 1
    const nextMonth = (thisMonth % 12) + 1
    Promise.all([
      getSwimmerBirthdays(thisMonth).then(r => r.data || []).catch(() => []),
      getSwimmerBirthdays(nextMonth).then(r => r.data || []).catch(() => []),
    ]).then(([cur, next]) => {
      setToday(cur.filter(s => s.day === now.getDate()))
      // Next 7 days (may span into next month)
      const up = []
      for (let i = 1; i <= 7; i++) {
        const d = new Date(now)
        d.setDate(now.getDate() + i)
        const pool = d.getMonth() + 1 === thisMonth ? cur : next
        pool.filter(s => s.day === d.getDate())
          .forEach(s => up.push({ ...s, when: d }))
      }
      setUpcoming(up)
    })
  }, [])

  if (today.length === 0 && upcoming.length === 0) return null

  return (
    <div className="bg-gradient-to-r from-pink-50 to-amber-50 border border-pink-200 rounded-xl p-4 mb-5">
      {today.length > 0 && (
        <div className={upcoming.length > 0 ? 'mb-3' : ''}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🎂</span>
            <h3 className="font-bold text-sm text-gray-800">Birthdays Today</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {today.map(s => (
              <button key={s.id} onClick={() => navigate(`/swimmers/${s.id}`)}
                className="bg-white border border-pink-200 rounded-full px-3 py-1 text-sm font-medium text-gray-700 hover:border-pink-400 hover:text-pink-700 transition-colors">
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {upcoming.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🎈</span>
            <h3 className="font-bold text-sm text-gray-800">Upcoming Birthdays</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.map(s => (
              <button key={s.id} onClick={() => navigate(`/swimmers/${s.id}`)}
                className="bg-white border border-pink-200 rounded-full px-3 py-1 text-sm font-medium text-gray-700 hover:border-pink-400 hover:text-pink-700 transition-colors">
                {s.name}
                <span className="text-gray-400 ml-1.5 text-xs">{s.when.getDate()} {MONTH_SHORT[s.when.getMonth()]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const [championships, setChampionships] = useState([])
  const [calendarEvents, setCalendarEvents] = useState([])
  const [countries, setCountries] = useState([])
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))
  const [filterCountry, setFilterCountry] = useState('')
  const [selectedMeet, setSelectedMeet] = useState(null)
  const [featuredMeet, setFeaturedMeet] = useState(null)
  const [featuredEvent, setFeaturedEvent] = useState(null)

  // Upgrade an old meet-type event (no championship behind it) to a full meet
  const [upgradingEvent, setUpgradingEvent] = useState(null)
  const [upgradeForm, setUpgradeForm] = useState({ country: '', pool: 'LCM', location: '' })
  const [upgradeLoading, setUpgradeLoading] = useState(false)

  // Add event
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', date: '', end_date: '', event_type: 'CUSTOM', description: '', country: '', location: '', pool: 'LCM' })
  const [addLoading, setAddLoading] = useState(false)

  const years = []
  for (let y = new Date().getFullYear() + 2; y >= 2000; y--) years.push(y)

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
  }, [])

  const loadChampionships = () => {
    const params = { page_size: 500, ordering: 'date', include_calendar_only: 1 }
    if (filterYear) params.year = filterYear
    if (filterCountry) params.country = filterCountry
    getChampionships(params).then(res => setChampionships(res.data.results || res.data)).catch(() => {})
  }

  // Nearest upcoming meet/event, independent of year/country filters
  const loadFeatured = () => {
    getChampionships({ upcoming: 1, ordering: 'date', page_size: 1, include_calendar_only: 1 })
      .then(res => setFeaturedMeet((res.data.results || res.data)[0] || null))
      .catch(() => {})
    getCalendarEvents({})
      .then(res => {
        const today = dayjs().startOf('day')
        const future = (res.data || [])
          .filter(ev => ev.event_type !== 'CUSTOM' && dayjs(ev.date).isValid() && !dayjs(ev.date).isBefore(today))
          .sort((a, b) => a.date.localeCompare(b.date))
        setFeaturedEvent(future[0] || null)
      })
      .catch(() => {})
  }

  useEffect(() => { loadFeatured() }, [])

  useEffect(() => {
    loadChampionships()
    // Load all calendar events (year filtering happens client-side so
    // future events always stay visible)
    getCalendarEvents({}).then(res => setCalendarEvents(res.data || [])).catch(() => {})
  }, [filterYear, filterCountry])

  // Featured card: nearest upcoming meet or calendar event (whichever is sooner);
  // fall back to most recent meet in view
  const eventAsMeet = featuredEvent ? {
    id: featuredEvent.championship || null,
    name: featuredEvent.title,
    date: dayjs(featuredEvent.date).format('DD/MM/YYYY'),
    end_date: featuredEvent.end_date ? dayjs(featuredEvent.end_date).format('DD/MM/YYYY') : null,
    pool: '', location: '', country_detail: null, meet_photo: null,
    description: featuredEvent.description,
  } : null
  let upcomingMeet = null
  if (featuredMeet && eventAsMeet) {
    const meetD = dayjs(featuredMeet.date, 'DD/MM/YYYY')
    const evD = dayjs(featuredEvent.date)
    upcomingMeet = evD.isBefore(meetD) ? eventAsMeet : featuredMeet
  } else {
    upcomingMeet = featuredMeet || eventAsMeet || (championships.length > 0 ? championships[championships.length - 1] : null)
  }

  // Group all items (championships + calendar events) by month
  const grouped = {}
  championships.forEach(c => {
    const d = dayjs(c.date, 'DD/MM/YYYY')
    if (!d.isValid()) return
    const key = `${d.year()}-${String(d.month() + 1).padStart(2, '0')}`
    if (!grouped[key]) grouped[key] = { year: d.year(), month: d.month(), meets: [], events: [] }
    grouped[key].meets.push(c)
  })
  const todayStart = dayjs().startOf('day')
  const loadedChampIds = new Set(championships.map(c => c.id))
  calendarEvents.forEach(ev => {
    // Meet-type events backed by a championship render as full meet
    // cards (from the championships list) — skip the duplicate.
    if (ev.event_type !== 'CUSTOM' && ev.championship && loadedChampIds.has(ev.championship)) return
    const d = dayjs(ev.date)
    if (!d.isValid()) return
    // Future events always stay visible regardless of the year filter
    if (filterYear && String(d.year()) !== filterYear && d.isBefore(todayStart)) return
    const key = `${d.year()}-${String(d.month() + 1).padStart(2, '0')}`
    if (!grouped[key]) grouped[key] = { year: d.year(), month: d.month(), meets: [], events: [] }
    grouped[key].events.push(ev)
  })

  const renderMeetCard = (c) => {
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
                <span>&mdash; {formatDate(c.date)} to {formatDate(c.end_date)}</span>
              )}
            </div>
          </div>

          {/* Arrow */}
          <span className={`text-gray-400 text-lg transition-transform ${isSelected ? 'rotate-90' : ''}`}>&#x276F;</span>
        </div>

        {/* Expanded meet details */}
        {isSelected && (
          <MeetExpandedPanel meet={c} navigate={navigate} countries={countries} onUpdate={(updated) => {
            setChampionships(prev => prev.map(ch => ch.id === updated.id ? { ...ch, ...updated } : ch))
          }} onDelete={handleDeleteCalendarMeet} />
        )}
      </div>
    )
  }

  const handleAddEvent = async (e) => {
    e.preventDefault()
    setAddLoading(true)
    try {
      const isMeetType = newEvent.event_type !== 'CUSTOM'
      let championshipId = null
      if (isMeetType) {
        // Create a calendar-only championship so the meet gets the full
        // expandable card (live results, entry pack, registration...).
        // It stays hidden from the meets list until real results exist.
        const fd = new FormData()
        fd.append('name', newEvent.title)
        fd.append('date', newEvent.date)
        if (newEvent.end_date) fd.append('end_date', newEvent.end_date)
        fd.append('pool', newEvent.pool || 'LCM')
        fd.append('country', newEvent.country)
        if (newEvent.location) fd.append('location', newEvent.location)
        fd.append('is_calendar_only', 'true')
        const champRes = await createChampionship(fd)
        championshipId = champRes.data.id
      }
      const payload = {
        title: newEvent.title,
        date: newEvent.date,
        event_type: newEvent.event_type,
        description: newEvent.description,
      }
      if (newEvent.end_date) payload.end_date = newEvent.end_date
      if (championshipId) payload.championship = championshipId
      const res = await createCalendarEvent(payload)
      setCalendarEvents(prev => [...prev, res.data])
      loadChampionships()
      loadFeatured()
      setNewEvent({ title: '', date: '', end_date: '', event_type: 'CUSTOM', description: '', country: '', location: '', pool: 'LCM' })
      setShowAddEvent(false)
    } catch (err) {
      alert('Error: ' + (err.response?.data ? JSON.stringify(err.response.data) : err.message))
    } finally {
      setAddLoading(false)
    }
  }

  const handleUpgradeEvent = async (e) => {
    e.preventDefault()
    if (!upgradingEvent || !upgradeForm.country) return
    setUpgradeLoading(true)
    try {
      const fd = new FormData()
      fd.append('name', upgradingEvent.title)
      fd.append('date', upgradingEvent.date)
      if (upgradingEvent.end_date) fd.append('end_date', upgradingEvent.end_date)
      fd.append('pool', upgradeForm.pool || 'LCM')
      fd.append('country', upgradeForm.country)
      if (upgradeForm.location) fd.append('location', upgradeForm.location)
      fd.append('is_calendar_only', 'true')
      const champRes = await createChampionship(fd)
      await updateCalendarEvent(upgradingEvent.id, { championship: champRes.data.id })
      setCalendarEvents(prev => prev.map(ev => ev.id === upgradingEvent.id ? { ...ev, championship: champRes.data.id } : ev))
      // Show the new meet card immediately (even if the year filter would hide it)
      const champ = { ...champRes.data }
      if (/^\d{4}-/.test(champ.date || '')) champ.date = dayjs(champ.date).format('DD/MM/YYYY')
      if (/^\d{4}-/.test(champ.end_date || '')) champ.end_date = dayjs(champ.end_date).format('DD/MM/YYYY')
      setChampionships(prev => prev.some(c => c.id === champ.id) ? prev : [...prev, champ])
      loadChampionships()
      loadFeatured()
      setSelectedMeet({ id: champRes.data.id })
      setUpgradingEvent(null)
      setUpgradeForm({ country: '', pool: 'LCM', location: '' })
    } catch (err) {
      alert('Error: ' + (err.response?.data ? JSON.stringify(err.response.data) : err.message))
    } finally {
      setUpgradeLoading(false)
    }
  }

  const handleDeleteCalendarMeet = async (c) => {
    if (!confirm(`Delete "${c.name}" from the calendar?`)) return
    try {
      await deleteChampionship(c.id)
      // Remove the linked calendar event(s) too
      const linked = calendarEvents.filter(ev => ev.championship === c.id)
      for (const ev of linked) {
        try { await deleteCalendarEvent(ev.id) } catch { /* ignore */ }
      }
      setChampionships(prev => prev.filter(ch => ch.id !== c.id))
      setCalendarEvents(prev => prev.filter(ev => ev.championship !== c.id))
      setSelectedMeet(null)
      loadFeatured()
    } catch { /* ignore */ }
  }

  const handleDeleteEvent = async (evId) => {
    if (!confirm('Delete this event?')) return
    try {
      await deleteCalendarEvent(evId)
      setCalendarEvents(prev => prev.filter(e => e.id !== evId))
      loadFeatured()
    } catch { /* ignore */ }
  }

  const EVENT_TYPE_COLORS = {
    CHAMPIONSHIP: 'bg-cyan-100 text-cyan-700',
    MEET: 'bg-blue-100 text-blue-700',
    CUSTOM: 'bg-purple-100 text-purple-700',
  }

  return (
    <div>
      {/* Featured upcoming meet */}
      {upcomingMeet && <FeaturedMeet meet={upcomingMeet} navigate={navigate} />}

      {/* Today's birthdays */}
      <TodayBirthdays navigate={navigate} />

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

      {/* Events grouped by month — latest first */}
      {Object.keys(grouped).length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">&#x1F4C5;</div>
          <p>No competitions found for the selected filters</p>
        </div>
      )}

      {Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([key, group]) => (
        <div key={key} className="mb-8">
          {/* Month header */}
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-wide">
              {MONTHS[group.month]} {group.year}
            </h2>
            <div className="flex-1 h-px bg-cyan-200" />
          </div>

          {/* Events + meets for this month — latest first */}
          <div className="space-y-3">
              {[...group.events.map(item => ({ kind: 'event', ts: dayjs(item.date).valueOf(), item })),
                ...group.meets.map(item => ({ kind: 'meet', ts: dayjs(item.date, 'DD/MM/YYYY').valueOf(), item }))]
                .sort((a, b) => b.ts - a.ts)
                .map(({ kind, item }) => {
                if (kind === 'meet') return renderMeetCard(item)
                const ev = item
                const d = dayjs(ev.date)
                const isMeetType = ev.event_type !== 'CUSTOM'
                const deleteBtn = (
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev.id) }} className="text-gray-300 hover:text-red-500 shrink-0" title="Delete">
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )
                if (isMeetType) {
                  // Meet/championship calendar event — rendered exactly like a
                  // meet card. Clicking loads the linked championship (or asks
                  // for the missing details) then expands the full meet panel.
                  return (
                    <div key={`ev-${ev.id}`}
                      onClick={async () => {
                        if (ev.championship) {
                          try {
                            const res = await getChampionship(ev.championship)
                            const champ = { ...res.data }
                            // Detail endpoint returns ISO dates; meet cards expect DD/MM/YYYY
                            if (/^\d{4}-/.test(champ.date || '')) champ.date = dayjs(champ.date).format('DD/MM/YYYY')
                            if (/^\d{4}-/.test(champ.end_date || '')) champ.end_date = dayjs(champ.end_date).format('DD/MM/YYYY')
                            setChampionships(prev => prev.some(c => c.id === champ.id) ? prev : [...prev, champ])
                            setSelectedMeet({ id: champ.id })
                          } catch {
                            navigate(`/meets/${ev.championship}`)
                          }
                        } else {
                          // Old event without a meet behind it — silently create a
                          // calendar-only meet so the full panel opens right away.
                          try {
                            const fd = new FormData()
                            fd.append('name', ev.title)
                            fd.append('date', ev.date)
                            if (ev.end_date) fd.append('end_date', ev.end_date)
                            fd.append('pool', 'LCM')
                            fd.append('is_calendar_only', 'true')
                            const champRes = await createChampionship(fd)
                            await updateCalendarEvent(ev.id, { championship: champRes.data.id })
                            setCalendarEvents(prev => prev.map(e2 => e2.id === ev.id ? { ...e2, championship: champRes.data.id } : e2))
                            const champ = { ...champRes.data }
                            if (/^\d{4}-/.test(champ.date || '')) champ.date = dayjs(champ.date).format('DD/MM/YYYY')
                            if (/^\d{4}-/.test(champ.end_date || '')) champ.end_date = dayjs(champ.end_date).format('DD/MM/YYYY')
                            setChampionships(prev => prev.some(c => c.id === champ.id) ? prev : [...prev, champ])
                            setSelectedMeet({ id: champ.id })
                          } catch { /* not admin — card stays as-is */ }
                        }
                      }}
                      className="bg-white border border-gray-200 rounded-xl px-6 py-5 flex items-center gap-6 transition-all hover:shadow-md cursor-pointer">
                      <div className="w-20 h-20 bg-cyan-500 rounded-xl flex flex-col items-center justify-center text-white shrink-0 shadow">
                        <span className="text-3xl font-bold leading-none">{d.date()}</span>
                        <span className="text-xs font-semibold uppercase tracking-wider mt-0.5">{MONTH_SHORT[d.month()]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg text-gray-900 truncate">{ev.title}</h3>
                        {ev.description && (
                          <div className="flex items-center gap-3 text-sm text-gray-500 mt-1.5">
                            <span className="flex items-center gap-1">
                              <span className="text-gray-400">&#x1F4CD;</span>
                              {ev.description}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-sm text-gray-400 mt-1.5">
                          <span>50m Pool</span>
                          {ev.end_date && ev.end_date !== ev.date && (
                            <span>&mdash; {formatDate(ev.date)} to {formatDate(ev.end_date)}</span>
                          )}
                        </div>
                      </div>
                      {deleteBtn}
                      <span className="text-gray-400 text-lg">&#x276F;</span>
                    </div>
                  )
                }
                return (
                  <div key={`ev-${ev.id}`} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-5">
                    <div className="w-14 h-14 bg-purple-500 rounded-lg flex flex-col items-center justify-center text-white shrink-0">
                      <span className="text-xl font-bold leading-none">{d.date()}</span>
                      <span className="text-[9px] font-semibold uppercase">{MONTH_SHORT[d.month()]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 truncate">{ev.title}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${EVENT_TYPE_COLORS[ev.event_type] || EVENT_TYPE_COLORS.CUSTOM}`}>
                          {ev.event_type}
                        </span>
                      </div>
                      {ev.description && <p className="text-sm text-gray-500 mt-0.5 truncate">{ev.description}</p>}
                      {ev.end_date && ev.end_date !== ev.date && (
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(ev.date)} to {formatDate(ev.end_date)}</p>
                      )}
                    </div>
                    {deleteBtn}
                  </div>
                )
              })}
          </div>
        </div>
      ))}

      {/* Upgrade old meet-type event Modal */}
      {upgradingEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setUpgradingEvent(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">{upgradingEvent.title}</h2>
            <p className="text-sm text-gray-500 mb-4">Complete the meet details to unlock the full meet card (live results, entry pack, registration...)</p>
            <form onSubmit={handleUpgradeEvent} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Country *</label>
                  <select value={upgradeForm.country} onChange={(e) => setUpgradeForm({ ...upgradeForm, country: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" required>
                    <option value="">Select country</option>
                    {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Pool</label>
                  <select value={upgradeForm.pool} onChange={(e) => setUpgradeForm({ ...upgradeForm, pool: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="LCM">Long Course (50m)</option>
                    <option value="SCM">Short Course (25m)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <input type="text" value={upgradeForm.location} onChange={(e) => setUpgradeForm({ ...upgradeForm, location: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="City / venue" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setUpgradingEvent(null)} className="flex-1 border rounded-lg py-2 text-sm">Cancel</button>
                <button type="submit" disabled={!upgradeForm.country || upgradeLoading}
                  className="flex-1 bg-cyan-600 text-white rounded-lg py-2 text-sm hover:bg-cyan-700 disabled:opacity-50">
                  {upgradeLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Event Modal */}
      {showAddEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowAddEvent(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Add Calendar Event</h2>
            <form onSubmit={handleAddEvent} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Title *</label>
                <input type="text" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Team Meeting, Deadline..." required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select value={newEvent.event_type} onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="CUSTOM">Custom Event</option>
                  <option value="MEET">Meet</option>
                  <option value="CHAMPIONSHIP">Championship</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Start Date *</label>
                  <input type="date" value={newEvent.date} onChange={(e) => {
                    const d = e.target.value
                    const updates = { date: d }
                    if (newEvent.end_date && newEvent.end_date < d) updates.end_date = d
                    setNewEvent({ ...newEvent, ...updates })
                  }}
                    className="w-full border rounded-lg px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End Date</label>
                  <input type="date" value={newEvent.end_date} onChange={(e) => setNewEvent({ ...newEvent, end_date: e.target.value })}
                    min={newEvent.date || undefined}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              {newEvent.event_type !== 'CUSTOM' && (
                <>
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
                      <label className="block text-sm font-medium mb-1">Pool</label>
                      <select value={newEvent.pool} onChange={(e) => setNewEvent({ ...newEvent, pool: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm">
                        <option value="LCM">Long Course (50m)</option>
                        <option value="SCM">Short Course (25m)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Location</label>
                    <input type="text" value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="City / venue" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Optional details..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddEvent(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancel</button>
                <button type="submit" disabled={!newEvent.title || !newEvent.date || (newEvent.event_type !== 'CUSTOM' && !newEvent.country) || addLoading}
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
