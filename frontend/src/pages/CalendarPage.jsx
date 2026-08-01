import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock, MapPin, CalendarDays, Radio, BookOpen, PenLine, Globe, FileText,
  Trash2, ChevronRight, Cake, Gift, Plus,
} from 'lucide-react'
import { createCalendarEvent, getCalendarEvents, updateCalendarEvent, deleteCalendarEvent } from '../api/calendar'
import { getChampionships, getChampionship, createChampionship, updateChampionship, deleteChampionship } from '../api/championships'
import { getCountries } from '../api/core'
import { getSwimmerBirthdays } from '../api/swimmers'
import { POOL_TYPES, mediaUrl, formatDate } from '../utils/constants'
import CountryFlag from '../components/common/CountryFlag'
import {
  Hero, Card, Badge, Button, Select, Input, Textarea, FieldLabel, Modal,
  ConfirmDialog, EmptyState, FilterBar, PageHeader,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
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
      <div className="text-label text-white/70 mb-2 flex items-center gap-1.5">
        <Clock size={14} className="text-aqua-400" />
        Starts in
      </div>
      <div className="grid grid-cols-4 gap-2 max-w-md">
        {[
          { val: days, label: 'Days' },
          { val: hours, label: 'Hours' },
          { val: mins, label: 'Min' },
          { val: secs, label: 'Sec' },
        ].map(({ val, label }) => (
          <div key={label} className="bg-white/10 backdrop-blur-sm rounded-sm px-2 py-2.5 text-center border border-white/15">
            <div className="text-time-lg text-white tnum leading-none">{String(val).padStart(2, '0')}</div>
            <div className="text-label text-white/60 mt-1.5">{label}</div>
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
    <div className={`mb-4 sm:mb-6 ${c.id ? 'cursor-pointer' : ''} group`}
      onClick={() => { if (c.id) navigate(`/meets/${c.id}`) }}>
      <Hero image={c.meet_photo ? mediaUrl(c.meet_photo) : undefined}>
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-full mb-4 sm:mb-5 border border-white/15">
          <span className="w-2 h-2 rounded-full bg-aqua-400 animate-pulse" />
          <span className="text-label text-white">Featured Competition</span>
        </div>

        {/* Title */}
        <h2 className="font-display font-extrabold text-[26px] leading-[31px] sm:text-[36px] sm:leading-[40px] break-words text-white mb-2 group-hover:text-aqua-400 transition-colors">{c.name}</h2>

        {/* Subtitle */}
        <p className="text-body text-white/70 mb-4 sm:mb-5">
          {c.pool ? (c.pool === 'LCM' ? 'Long Course 50m' : 'Short Course 25m') : (c.description || 'Upcoming competition')}
        </p>

        {/* Location & Date */}
        <div className="space-y-2 mb-5 sm:mb-6">
          {c.location && (
            <div className="flex items-center gap-2 text-white/80 text-body-sm">
              <MapPin size={16} className="text-aqua-400 shrink-0" />
              {c.location}{c.country_detail ? `, ${c.country_detail.name}` : ''}
            </div>
          )}
          {dateStr && (
            <div className="flex items-center gap-2 text-white/80 text-body-sm">
              <CalendarDays size={16} className="text-aqua-400 shrink-0" />
              {dateStr}
            </div>
          )}
        </div>

        {/* Countdown */}
        {isUpcoming && targetDate && <Countdown targetDate={targetDate} />}
      </Hero>
    </div>
  )
}

const LINK_BTN = 'inline-flex items-center justify-center gap-1.5 w-full h-10 px-4 rounded-sm text-body-sm font-medium text-white transition-opacity hover:opacity-90'

function MeetExpandedPanel({ meet: c, navigate, onUpdate, onDelete, countries = [], isAdmin = false }) {
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

  const showLive = c.live_results_url || isAdmin
  const showGuide = c.meet_guide_pdf || isAdmin
  const showReg = c.registration_url || isAdmin

  return (
    <div className="bg-ink-50 border border-aqua-500 border-t-0 rounded-b-md px-3 py-3.5 md:px-6 md:py-4">
      {/* Meet Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 md:gap-4 md:mb-5">
        <div>
          <div className="text-label text-ink-400 mb-1">Date</div>
          <div className="text-body-sm font-medium text-ink-900">{formatDate(c.date)}{c.end_date && c.end_date !== c.date ? ` to ${formatDate(c.end_date)}` : ''}</div>
        </div>
        <div>
          <div className="text-label text-ink-400 mb-1">Pool</div>
          <div className="text-body-sm font-medium text-ink-900">{c.pool === 'LCM' ? 'Long Course (50m)' : 'Short Course (25m)'}</div>
        </div>
        <div>
          <div className="text-label text-ink-400 mb-1">Country</div>
          <div className="text-body-sm font-medium text-ink-900">
            {isAdmin && editingField === 'country' ? (
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <Select value={fieldValue} onChange={e => setFieldValue(e.target.value)} autoFocus
                  className="!h-8 max-w-[150px] text-body-sm">
                  <option value="">Select country</option>
                  {countries.map(co => <option key={co.id} value={co.id}>{co.name}</option>)}
                </Select>
                <button disabled={saving || !fieldValue} onClick={async () => {
                  await saveField('country', fieldValue)
                  const co = countries.find(x => String(x.id) === String(fieldValue))
                  if (co) onUpdate({ ...c, country: co.id, country_detail: co })
                }} className="text-body-sm text-aqua-600 font-semibold disabled:opacity-50 min-h-10">Save</button>
                <button onClick={() => setEditingField(null)} className="text-body-sm text-ink-400 min-h-10">Cancel</button>
              </div>
            ) : c.country_detail ? (
              <CountryFlag code={c.country_detail.code} flagUrl={c.country_detail.flag_url} name={c.country_detail.name} />
            ) : isAdmin ? (
              <button onClick={(e) => { e.stopPropagation(); startEdit('country', '') }}
                className="text-body-sm text-ink-400 border border-dashed border-ink-200 rounded-sm px-2 py-1.5 hover:border-aqua-500 hover:text-aqua-600">+ Set country</button>
            ) : (
              <span className="text-ink-400">—</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-label text-ink-400 mb-1">Location</div>
          <div className="text-body-sm font-medium text-ink-900">
            {isAdmin && editingField === 'location' ? (
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <Input value={fieldValue} onChange={e => setFieldValue(e.target.value)} autoFocus
                  placeholder="City / venue" className="!h-8 max-w-[150px] text-body-sm" />
                <button disabled={saving} onClick={() => saveField('location', fieldValue)}
                  className="text-body-sm text-aqua-600 font-semibold disabled:opacity-50 min-h-10">Save</button>
                <button onClick={() => setEditingField(null)} className="text-body-sm text-ink-400 min-h-10">Cancel</button>
              </div>
            ) : c.location ? (
              isAdmin ? (
                <span onClick={(e) => { e.stopPropagation(); startEdit('location', c.location) }}
                  className="cursor-pointer hover:text-aqua-600" title="Edit">{c.location}</span>
              ) : (
                <span>{c.location}</span>
              )
            ) : isAdmin ? (
              <button onClick={(e) => { e.stopPropagation(); startEdit('location', '') }}
                className="text-body-sm text-ink-400 border border-dashed border-ink-200 rounded-sm px-2 py-1.5 hover:border-aqua-500 hover:text-aqua-600">+ Set location</button>
            ) : (
              <span className="text-ink-400">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Three main sections */}
      {(showLive || showGuide || showReg) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 md:gap-4 md:mb-5">
          {/* Live Results */}
          {showLive && (
            <div className="bg-white rounded-md border border-ink-100 shadow-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Radio size={16} className="text-neg" />
                <h4 className="text-body-sm font-semibold text-ink-900">Live Results</h4>
              </div>
              {c.live_results_url && editingField !== 'live_results_url' ? (
                <div>
                  <a href={c.live_results_url} target="_blank" rel="noopener noreferrer"
                    className={`${LINK_BTN} bg-neg mb-2`}>
                    Open Live Results
                  </a>
                  {isAdmin && (
                    <button onClick={(e) => { e.stopPropagation(); startEdit('live_results_url', c.live_results_url) }}
                      className="text-body-sm text-ink-400 hover:text-ink-900 w-full text-center min-h-10">Edit link</button>
                  )}
                </div>
              ) : isAdmin && editingField === 'live_results_url' ? (
                <div className="space-y-2" onClick={e => e.stopPropagation()}>
                  <Input type="url" value={fieldValue} onChange={e => setFieldValue(e.target.value)}
                    placeholder="https://..." autoFocus />
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" loading={saving}
                      onClick={() => saveField('live_results_url', fieldValue)}>Save</Button>
                    <Button size="sm" variant="secondary" className="flex-1"
                      onClick={() => setEditingField(null)}>Cancel</Button>
                  </div>
                </div>
              ) : isAdmin ? (
                <button onClick={(e) => { e.stopPropagation(); startEdit('live_results_url', '') }}
                  className="w-full border-2 border-dashed border-ink-200 rounded-sm py-3 text-body-sm text-ink-400 hover:border-neg hover:text-neg">
                  + Add Live Results Link
                </button>
              ) : null}
            </div>
          )}

          {/* Meet Guide PDF */}
          {showGuide && (
            <div className="bg-white rounded-md border border-ink-100 shadow-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen size={16} className="text-aqua-600" />
                <h4 className="text-body-sm font-semibold text-ink-900">Entry Pack</h4>
              </div>
              {c.meet_guide_pdf ? (
                <div>
                  <a href={c.meet_guide_pdf} target="_blank" rel="noopener noreferrer"
                    className={`${LINK_BTN} bg-aqua-600 mb-2`}>
                    View Entry Pack
                  </a>
                  {isAdmin && (
                    <label className="block text-body-sm text-ink-400 hover:text-ink-900 w-full text-center cursor-pointer min-h-10 leading-10" onClick={e => e.stopPropagation()}>
                      Replace PDF
                      <input type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files[0]) uploadGuide(e.target.files[0]) }} />
                    </label>
                  )}
                </div>
              ) : isAdmin ? (
                <label className="block cursor-pointer" onClick={e => e.stopPropagation()}>
                  <div className="w-full border-2 border-dashed border-ink-200 rounded-sm py-3 text-body-sm text-ink-400 hover:border-aqua-500 hover:text-aqua-600 text-center">
                    + Upload Entry Pack PDF
                  </div>
                  <input type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files[0]) uploadGuide(e.target.files[0]) }} />
                </label>
              ) : null}
            </div>
          )}

          {/* Registration */}
          {showReg && (
            <div className="bg-white rounded-md border border-ink-100 shadow-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <PenLine size={16} className="text-pos" />
                <h4 className="text-body-sm font-semibold text-ink-900">Registration</h4>
              </div>
              {c.registration_url && editingField !== 'registration_url' ? (
                <div>
                  <a href={c.registration_url} target="_blank" rel="noopener noreferrer"
                    className={`${LINK_BTN} bg-pos mb-2`}>
                    Open Registration
                  </a>
                  {isAdmin && (
                    <button onClick={(e) => { e.stopPropagation(); startEdit('registration_url', c.registration_url) }}
                      className="text-body-sm text-ink-400 hover:text-ink-900 w-full text-center min-h-10">Edit link</button>
                  )}
                </div>
              ) : isAdmin && editingField === 'registration_url' ? (
                <div className="space-y-2" onClick={e => e.stopPropagation()}>
                  <Input type="url" value={fieldValue} onChange={e => setFieldValue(e.target.value)}
                    placeholder="https://..." autoFocus />
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" loading={saving}
                      onClick={() => saveField('registration_url', fieldValue)}>Save</Button>
                    <Button size="sm" variant="secondary" className="flex-1"
                      onClick={() => setEditingField(null)}>Cancel</Button>
                  </div>
                </div>
              ) : isAdmin ? (
                <button onClick={(e) => { e.stopPropagation(); startEdit('registration_url', '') }}
                  className="w-full border-2 border-dashed border-ink-200 rounded-sm py-3 text-body-sm text-ink-400 hover:border-pos hover:text-pos">
                  + Add Registration Link
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Other buttons */}
      <div className="flex flex-wrap gap-2 md:gap-3">
        {c.website && (
          <a href={c.website} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-sm text-body-sm font-medium bg-aqua-600 text-white hover:bg-aqua-500 transition-colors">
            <Globe size={16} /> Website
          </a>
        )}
        {c.policy_pdf && (
          <a href={c.policy_pdf} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-sm text-body-sm font-medium bg-white text-ink-900 border border-ink-200 hover:border-aqua-500/40 hover:bg-aqua-50 transition-colors">
            <FileText size={16} /> Nashra (Policy)
          </a>
        )}
        {isAdmin && c.is_calendar_only && onDelete && (
          <Button variant="ghost" size="md" icon={Trash2}
            className="ms-auto !text-neg hover:!bg-neg/10"
            onClick={(e) => { e.stopPropagation(); onDelete(c) }}>
            Delete Meet
          </Button>
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
    <Card className="mb-5">
      {today.length > 0 && (
        <div className={upcoming.length > 0 ? 'mb-4' : ''}>
          <div className="flex items-center gap-2 mb-2.5">
            <Cake size={16} className="text-aqua-600" />
            <h3 className="text-label text-ink-500">Birthdays Today</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {today.map(s => (
              <button key={s.id} onClick={() => navigate(`/swimmers/${s.id}`)}
                className="bg-white border border-ink-200 rounded-full px-3.5 h-10 text-body-sm font-medium text-ink-900 hover:border-aqua-500/40 hover:bg-aqua-50 transition-colors">
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {upcoming.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Gift size={16} className="text-aqua-600" />
            <h3 className="text-label text-ink-500">Upcoming Birthdays</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.map(s => (
              <button key={s.id} onClick={() => navigate(`/swimmers/${s.id}`)}
                className="bg-white border border-ink-200 rounded-full px-3.5 h-10 text-body-sm font-medium text-ink-900 hover:border-aqua-500/40 hover:bg-aqua-50 transition-colors">
                {s.name}
                <span className="text-ink-400 ms-1.5 text-body-sm">{s.when.getDate()} {MONTH_SHORT[s.when.getMonth()]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

const EVENT_TYPE_BADGE = {
  CHAMPIONSHIP: 'aqua',
  MEET: 'aqua',
  CUSTOM: 'record',
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { token } = useAuth()
  const isAdmin = !!token
  const [championships, setChampionships] = useState([])
  const [calendarEvents, setCalendarEvents] = useState([])
  const [countries, setCountries] = useState([])
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))
  const [filterCountry, setFilterCountry] = useState('')
  const [selectedMeet, setSelectedMeet] = useState(null)
  const [featuredMeet, setFeaturedMeet] = useState(null)
  const [featuredEvent, setFeaturedEvent] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null) // { type: 'meet'|'event', item }

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
          className={`bg-white border px-3 md:px-4 py-3 md:py-4 flex items-center gap-3 md:gap-4 cursor-pointer transition-colors ${
            isSelected ? 'border-aqua-500 rounded-t-md shadow-card' : 'border-ink-100 rounded-md shadow-card hover:border-aqua-500/40'
          }`}
        >
          {/* Meet photo or date badge */}
          {c.meet_photo ? (
            <div className="w-16 h-14 md:w-24 md:h-20 rounded-md overflow-hidden shrink-0 shadow-card">
              <img src={mediaUrl(c.meet_photo)} alt={c.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-18 h-18 md:w-24 md:h-24 bg-ink-900 rounded-md flex flex-col items-center justify-center text-white shrink-0">
              <span className="text-[32px] md:text-[44px] font-bold leading-none tnum">{d.date()}</span>
              <span className="text-body-sm md:text-body font-semibold text-aqua-400 mt-0.5 md:mt-1 tracking-wide">{MONTH_SHORT[d.month()]}</span>
            </div>
          )}

          {/* Meet info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-title text-ink-900 leading-snug break-words">{c.name}</h3>
            {(c.location || c.country_detail) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-500 mt-1">
                {c.location ? (
                  <span className="flex items-center gap-1 min-w-0">
                    <MapPin size={14} className="text-ink-400 shrink-0" />
                    <span className="break-words">{c.location}{c.country_detail ? `, ${c.country_detail.name}` : ''}</span>
                  </span>
                ) : (
                  <CountryFlag code={c.country_detail.code} flagUrl={c.country_detail.flag_url} name={c.country_detail.name} />
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-400 mt-1">
              <span className="whitespace-nowrap">{c.pool === 'LCM' ? '50m Pool' : '25m Pool'}</span>
              {c.end_date && c.end_date !== c.date && (
                <span className="whitespace-nowrap">{formatDate(c.date)} &ndash; {formatDate(c.end_date)}</span>
              )}
            </div>
          </div>

          {/* Arrow */}
          <ChevronRight size={18} className={`text-ink-400 shrink-0 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
        </div>

        {/* Expanded meet details */}
        {isSelected && (
          <MeetExpandedPanel meet={c} navigate={navigate} countries={countries} isAdmin={isAdmin} onUpdate={(updated) => {
            setChampionships(prev => prev.map(ch => ch.id === updated.id ? { ...ch, ...updated } : ch))
          }} onDelete={(meet) => setPendingDelete({ type: 'meet', item: meet })} />
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
      toast.error('Error: ' + (err.response?.data ? JSON.stringify(err.response.data) : err.message))
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
      toast.error('Error: ' + (err.response?.data ? JSON.stringify(err.response.data) : err.message))
    } finally {
      setUpgradeLoading(false)
    }
  }

  const doDeleteCalendarMeet = async (c) => {
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

  const doDeleteEvent = async (evId) => {
    try {
      await deleteCalendarEvent(evId)
      setCalendarEvents(prev => prev.filter(e => e.id !== evId))
      loadFeatured()
    } catch { /* ignore */ }
  }

  const filterChips = [
    filterYear && { key: 'year', label: filterYear, onRemove: () => setFilterYear('') },
    filterCountry && {
      key: 'country',
      label: countries.find(c => String(c.id) === String(filterCountry))?.name || 'Country',
      onRemove: () => setFilterCountry(''),
    },
  ].filter(Boolean)

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Calendar"
        subtitle="Upcoming meets and events across the Arab world"
        action={isAdmin && (
          <Button icon={Plus} onClick={() => setShowAddEvent(true)}>Add Event</Button>
        )}
      />

      {/* Featured upcoming meet */}
      {upcomingMeet && <FeaturedMeet meet={upcomingMeet} navigate={navigate} />}

      {/* Today's birthdays */}
      <TodayBirthdays navigate={navigate} />

      {/* Filters */}
      <FilterBar chips={filterChips} onReset={() => { setFilterYear(''); setFilterCountry('') }}>
        <Select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
          className="w-full md:w-36" aria-label="Year">
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}
          className="w-full md:w-52" aria-label="Country">
          <option value="">All Countries</option>
          {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </FilterBar>

      {/* Events grouped by month — latest first */}
      {Object.keys(grouped).length === 0 && (
        <EmptyState icon={CalendarDays} title="No competitions found"
          hint="Try a different year or country filter" />
      )}

      {Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([key, group]) => (
        <div key={key} className="mb-4 sm:mb-5">
          {/* Month header */}
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <h2 className="text-label text-ink-500">
              {MONTHS[group.month]} {group.year}
            </h2>
            <div className="flex-1 h-px bg-ink-200" />
          </div>

          {/* Events + meets for this month — latest first */}
          <div className="space-y-2.5 sm:space-y-3">
              {[...group.events.map(item => ({ kind: 'event', ts: dayjs(item.date).valueOf(), item })),
                ...group.meets.map(item => ({ kind: 'meet', ts: dayjs(item.date, 'DD/MM/YYYY').valueOf(), item }))]
                .sort((a, b) => b.ts - a.ts)
                .map(({ kind, item }) => {
                if (kind === 'meet') return renderMeetCard(item)
                const ev = item
                const d = dayjs(ev.date)
                const isMeetType = ev.event_type !== 'CUSTOM'
                const deleteBtn = isAdmin ? (
                  <button onClick={(e) => { e.stopPropagation(); setPendingDelete({ type: 'event', item: ev }) }}
                    className="p-2.5 text-ink-200 hover:text-neg shrink-0 rounded-sm" aria-label="Delete event" title="Delete">
                    <Trash2 size={16} />
                  </button>
                ) : null
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
                      className="bg-white border border-ink-100 shadow-card rounded-md px-3 py-3 md:px-4 md:py-4 flex items-center gap-3 md:gap-4 transition-colors hover:border-aqua-500/40 cursor-pointer">
                      <div className="w-14 h-14 md:w-20 md:h-20 bg-ink-900 rounded-md flex flex-col items-center justify-center text-white shrink-0">
                        <span className="text-display leading-none tnum">{d.date()}</span>
                        <span className="text-label text-aqua-400 mt-0.5 md:mt-1">{MONTH_SHORT[d.month()]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-title text-ink-900 leading-snug break-words">{ev.title}</h3>
                        {ev.description && (
                          <div className="flex items-center gap-3 text-body-sm text-ink-500 mt-1">
                            <span className="flex items-center gap-1 min-w-0">
                              <MapPin size={14} className="text-ink-400 shrink-0" />
                              <span className="break-words">{ev.description}</span>
                            </span>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-400 mt-1">
                          <span>50m Pool</span>
                          {ev.end_date && ev.end_date !== ev.date && (
                            <span>&mdash; {formatDate(ev.date)} to {formatDate(ev.end_date)}</span>
                          )}
                        </div>
                      </div>
                      {deleteBtn}
                      <ChevronRight size={18} className="text-ink-400 shrink-0" />
                    </div>
                  )
                }
                return (
                  <div key={`ev-${ev.id}`} className="bg-white border border-ink-100 shadow-card rounded-md px-3 py-3 md:px-5 md:py-4 flex items-center gap-3 md:gap-5">
                    <div className="w-14 h-14 bg-record rounded-sm flex flex-col items-center justify-center text-white shrink-0">
                      <span className="text-title leading-none tnum">{d.date()}</span>
                      <span className="text-label mt-0.5">{MONTH_SHORT[d.month()]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-body font-semibold text-ink-900 min-w-0 truncate">{ev.title}</h3>
                        <Badge variant={EVENT_TYPE_BADGE[ev.event_type] || 'record'} className="shrink-0">{ev.event_type}</Badge>
                      </div>
                      {ev.description && <p className="text-body-sm text-ink-500 mt-0.5 truncate">{ev.description}</p>}
                      {ev.end_date && ev.end_date !== ev.date && (
                        <p className="text-body-sm text-ink-400 mt-0.5">{formatDate(ev.date)} to {formatDate(ev.end_date)}</p>
                      )}
                    </div>
                    {deleteBtn}
                  </div>
                )
              })}
          </div>
        </div>
      ))}

      {/* Upgrade old meet-type event Modal (admin) */}
      <Modal open={isAdmin && !!upgradingEvent} onClose={() => setUpgradingEvent(null)}
        title={upgradingEvent?.title} size="md">
        <p className="text-body-sm text-ink-500 mb-4 -mt-1">Complete the meet details to unlock the full meet card (live results, entry pack, registration...)</p>
        <form onSubmit={handleUpgradeEvent} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Country</FieldLabel>
              <Select value={upgradeForm.country} onChange={(e) => setUpgradeForm({ ...upgradeForm, country: e.target.value })} required>
                <option value="">Select country</option>
                {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Pool</FieldLabel>
              <Select value={upgradeForm.pool} onChange={(e) => setUpgradeForm({ ...upgradeForm, pool: e.target.value })}>
                <option value="LCM">Long Course (50m)</option>
                <option value="SCM">Short Course (25m)</option>
              </Select>
            </div>
          </div>
          <div>
            <FieldLabel>Location</FieldLabel>
            <Input type="text" value={upgradeForm.location} onChange={(e) => setUpgradeForm({ ...upgradeForm, location: e.target.value })}
              placeholder="City / venue" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setUpgradingEvent(null)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={!upgradeForm.country} loading={upgradeLoading}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Event Modal (admin) */}
      <Modal open={isAdmin && showAddEvent} onClose={() => setShowAddEvent(false)}
        title="Add Calendar Event" size="md">
        <form onSubmit={handleAddEvent} className="space-y-3">
          <div>
            <FieldLabel required>Title</FieldLabel>
            <Input type="text" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
              placeholder="e.g. Team Meeting, Deadline..." required />
          </div>
          <div>
            <FieldLabel>Type</FieldLabel>
            <Select value={newEvent.event_type} onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })}>
              <option value="CUSTOM">Custom Event</option>
              <option value="MEET">Meet</option>
              <option value="CHAMPIONSHIP">Championship</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Start Date</FieldLabel>
              <Input type="date" value={newEvent.date} onChange={(e) => {
                const d = e.target.value
                const updates = { date: d }
                if (newEvent.end_date && newEvent.end_date < d) updates.end_date = d
                setNewEvent({ ...newEvent, ...updates })
              }} required />
            </div>
            <div>
              <FieldLabel>End Date</FieldLabel>
              <Input type="date" value={newEvent.end_date} onChange={(e) => setNewEvent({ ...newEvent, end_date: e.target.value })}
                min={newEvent.date || undefined} />
            </div>
          </div>
          {newEvent.event_type !== 'CUSTOM' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel required>Country</FieldLabel>
                  <Select value={newEvent.country} onChange={(e) => setNewEvent({ ...newEvent, country: e.target.value })} required>
                    <option value="">Select country</option>
                    {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Pool</FieldLabel>
                  <Select value={newEvent.pool} onChange={(e) => setNewEvent({ ...newEvent, pool: e.target.value })}>
                    <option value="LCM">Long Course (50m)</option>
                    <option value="SCM">Short Course (25m)</option>
                  </Select>
                </div>
              </div>
              <div>
                <FieldLabel>Location</FieldLabel>
                <Input type="text" value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  placeholder="City / venue" />
              </div>
            </>
          )}
          <div>
            <FieldLabel>Description</FieldLabel>
            <Textarea value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
              rows={2} placeholder="Optional details..." />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowAddEvent(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" loading={addLoading}
              disabled={!newEvent.title || !newEvent.date || (newEvent.event_type !== 'CUSTOM' && !newEvent.country)}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmations */}
      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete?.type === 'meet'
          ? `Delete "${pendingDelete?.item?.name}" from the calendar?`
          : 'Delete this event?'}
        message="This cannot be undone."
        destructive
        onConfirm={async () => {
          const pd = pendingDelete
          setPendingDelete(null)
          if (!pd) return
          if (pd.type === 'meet') await doDeleteCalendarMeet(pd.item)
          else await doDeleteEvent(pd.item.id)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
