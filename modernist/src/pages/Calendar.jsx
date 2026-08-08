import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
} from '../api/calendar'
import {
  getChampionships, createChampionship, updateChampionship, deleteChampionship,
  getClassificationCategories, getClassifications, getSubClassifications,
} from '../api/championships'
import { getCountries } from '../api/core'
import { getSwimmerBirthdays } from '../api/swimmers'
import Flag from '../components/Flag'
import MeetProgramEditor from '../components/MeetProgramEditor'
import { PageHead, Loading, Empty, Seg, SectHead } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { formatDate, formatDateRange, mediaUrl, MONTHS_FULL } from '../utils'

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function parseMeetDate(d) {
  if (!d) return null
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1])
  const dt = new Date(String(d))
  return Number.isNaN(dt.getTime()) ? null : dt
}

/* Live countdown to a target date (1-second tick) */
function Countdown({ target }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const diff = target - now
  if (diff <= 0) return null
  const days = Math.floor(diff / 86400000)
  const hrs = Math.floor((diff % 86400000) / 3600000)
  const min = Math.floor((diff % 3600000) / 60000)
  const sec = Math.floor((diff % 60000) / 1000)
  const cells = [[days, 'Days'], [String(hrs).padStart(2, '0'), 'Hrs'], [String(min).padStart(2, '0'), 'Min'], [String(sec).padStart(2, '0'), 'Sec']]
  return (
    <div style={{ display: 'flex', gap: 1, background: 'var(--color-divider)', border: '1px solid var(--color-divider)', marginTop: 14, maxWidth: 420 }}>
      {cells.map(([v, l]) => (
        <div key={l} style={{ flex: 1, background: 'var(--color-bg)', padding: '8px 10px' }}>
          <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>{v}</div>
          <div className="micro" style={{ fontSize: 10 }}>{l}</div>
        </div>
      ))}
    </div>
  )
}

/* Plain modal — zero radius, navy rule, per the modernist idiom */
function Modal({ open, title, onClose, children }) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(8, 24, 44, 0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--color-bg)', width: 520, maxWidth: '100%', borderTop: '4px solid var(--color-accent)' }}
      >
        <div className="rule-b" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h4 style={{ margin: 0 }}>{title}</h4>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  )
}

const LINK_STYLE = { flex: '1 1 140px', textAlign: 'center' }

/* Admin: add/edit live results, entry pack and registration links on a meet */
function MeetLinksModal({ meet, onClose, onSaved }) {
  const [liveUrl, setLiveUrl] = useState(meet.live_results_url || '')
  const [regUrl, setRegUrl] = useState(meet.registration_url || '')
  const [packFile, setPackFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('live_results_url', liveUrl.trim())
      fd.append('registration_url', regUrl.trim())
      if (packFile) fd.append('meet_guide_pdf', packFile)
      const res = await updateChampionship(meet.id, fd)
      onSaved(res.data)
    } catch (err) {
      const d = err.response?.data
      setError(d ? (typeof d === 'string' ? d : Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join(' · ')) : 'Could not save links')
      setSaving(false)
    }
  }

  return (
    <Modal open title="Meet Links" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label>Live results URL</label>
          <input className="input" type="url" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field">
          <label>Registration link</label>
          <input className="input" type="url" value={regUrl} onChange={(e) => setRegUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field">
          <label>Entry pack (PDF{meet.meet_guide_pdf ? ' — already uploaded, choose a file to replace' : ''})</label>
          <input className="input" type="file" accept=".pdf,application/pdf" onChange={(e) => setPackFile(e.target.files?.[0] || null)} />
        </div>
        {error && <div style={{ color: 'var(--asw-slow)', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save links'}</button>
        </div>
      </form>
    </Modal>
  )
}

/* Expanded panel under a meet row: info grid + public links; admin can delete calendar-only meets */
function MeetExpandedPanel({ meet: c, isAdmin, onDelete, onEditLinks }) {
  const showAny = c.live_results_url || c.meet_guide_pdf || c.registration_url || c.website || c.policy_pdf
  return (
    <div style={{ padding: '14px 32px 20px', background: 'var(--color-surface)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: showAny || isAdmin ? 16 : 0 }}>
        <div>
          <div className="micro" style={{ marginBottom: 3 }}>Pool</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{c.pool === 'SCM' ? 'Short Course (25m)' : 'Long Course (50m)'}</div>
        </div>
        <div>
          <div className="micro" style={{ marginBottom: 3 }}>Country</div>
          <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            {c.country_detail ? (<><Flag code={c.country_detail.code} name={c.country_detail.name} />{c.country_detail.name}</>) : '—'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {c.live_results_url && (
          <a className="btn btn-primary" style={LINK_STYLE} href={c.live_results_url} target="_blank" rel="noopener noreferrer">Live results</a>
        )}
        {c.meet_guide_pdf && (
          <a className="btn btn-secondary" style={LINK_STYLE} href={c.meet_guide_pdf} target="_blank" rel="noopener noreferrer">Entry pack</a>
        )}
        {c.registration_url && (
          <a className="btn btn-secondary" style={LINK_STYLE} href={c.registration_url} target="_blank" rel="noopener noreferrer">Registration</a>
        )}
        {c.website && (
          <a className="btn btn-secondary" style={LINK_STYLE} href={c.website} target="_blank" rel="noopener noreferrer">Website</a>
        )}
        {c.policy_pdf && (
          <a className="btn btn-secondary" style={LINK_STYLE} href={c.policy_pdf} target="_blank" rel="noopener noreferrer">Nashra (policy)</a>
        )}
        {(c.results_count ?? 0) > 0 && (
          <Link className="btn btn-secondary" style={LINK_STYLE} to={`/meets/${c.id}`}>Meet page</Link>
        )}
        {isAdmin && (
          <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => onEditLinks(c)}>Edit links</button>
        )}
        {isAdmin && c.is_calendar_only && (
          <button className="btn btn-ghost" style={{ color: 'var(--asw-slow)' }} onClick={() => onDelete(c)}>Delete meet</button>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────── Birthdays tab ─────────────────────────── */

function BirthdaysTab() {
  const [thisMonth, setThisMonth] = useState([])
  const [nextMonth, setNextMonth] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const now = new Date()
    const cur = now.getMonth() + 1
    const nxt = (cur % 12) + 1
    Promise.all([
      getSwimmerBirthdays(cur).then((r) => r.data || []).catch(() => []),
      getSwimmerBirthdays(nxt).then((r) => r.data || []).catch(() => []),
    ]).then(([a, b]) => {
      if (!alive) return
      setThisMonth(Array.isArray(a) ? a : a?.results || [])
      setNextMonth(Array.isArray(b) ? b : b?.results || [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  if (loading) return <Loading label="Loading birthdays" />

  const now = new Date()
  const curMonth = now.getMonth() + 1
  const today = thisMonth.filter((s) => s.day === now.getDate())
  // next 7 days, possibly spanning into next month
  const upcoming = []
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    const pool = d.getMonth() + 1 === curMonth ? thisMonth : nextMonth
    pool.filter((s) => s.day === d.getDate()).forEach((s) => upcoming.push({ ...s, when: d }))
  }

  return (
    <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 380px' }}>
      <div className="rule-r">
        <div className="rule-b" style={{ padding: '24px 32px' }}>
          <SectHead title="Birthdays Today" />
          {today.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 13 }}>No birthdays today.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {today.map((s) => (
                <Link key={s.id} to={`/swimmers/${s.id}`} className="btn btn-secondary">
                  {s.name}{s.age > 0 ? ` · turns ${s.age}` : ''}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: '24px 32px' }}>
          <SectHead title="Next 7 Days" />
          {upcoming.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 13 }}>No birthdays in the coming week.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {upcoming.map((s, i) => (
                <Link key={`${s.id}-${i}`} to={`/swimmers/${s.id}`} className="btn btn-secondary">
                  {s.name}
                  <span className="micro" style={{ marginLeft: 6 }}>{s.when.getDate()} {MONTH_SHORT[s.when.getMonth()]}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: '24px 28px' }}>
        <SectHead title={`All Birthdays · ${MONTHS_FULL[now.getMonth()]}`} />
        {thisMonth.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 13 }}>No birthdays this month.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {thisMonth.map((b, i) => (
              <div
                key={b.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: i < thisMonth.length - 1 ? '1px solid var(--color-divider)' : 'none' }}
              >
                <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, width: 24, textAlign: 'center', flex: 'none' }}>{b.day}</span>
                <Link to={`/swimmers/${b.id}`} style={{ color: 'inherit', textDecoration: 'none', fontSize: 13, flex: 1 }}>{b.name}</Link>
                <span style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
                  {b.nationality}{b.age > 0 ? ` · ${b.age}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────── Page ─────────────────────────────── */

const EMPTY_EVENT = {
  title: '', date: '', end_date: '', event_type: 'MEET', description: '',
  country: '', location: '', pool: 'LCM',
  classification_category: '', classification: '', sub_classification: '',
}

// Classifications whose upcoming meets get automatic medal predictions
const PREDICTABLE = new Set(['Arab', 'GCC', 'National'])

export default function Calendar() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('meets')
  const [meets, setMeets] = useState([])
  const [calEvents, setCalEvents] = useState([])
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))
  const [filterCountry, setFilterCountry] = useState('')
  const [expandedMeetId, setExpandedMeetId] = useState(null)
  const [editLinksMeet, setEditLinksMeet] = useState(null)
  const [featuredMeet, setFeaturedMeet] = useState(null)

  // admin: add event modal
  const [showAddEvent, setShowAddEvent] = useState(false)
  // after creating a meet, the modal switches to the day-by-day program editor
  const [programChampId, setProgramChampId] = useState(null)
  const [newEvent, setNewEvent] = useState(EMPTY_EVENT)
  const [addLoading, setAddLoading] = useState(false)
  const [classCategories, setClassCategories] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])

  // classification pickers load once, when the admin first opens the modal
  useEffect(() => {
    if (!showAddEvent || classifications.length > 0) return
    getClassificationCategories().then((r) => setClassCategories(Array.isArray(r.data) ? r.data : r.data?.results || [])).catch(() => {})
    getClassifications().then((r) => setClassifications(Array.isArray(r.data) ? r.data : r.data?.results || [])).catch(() => {})
  }, [showAddEvent]) // eslint-disable-line react-hooks/exhaustive-deps

  // sub-classifications follow the chosen classification
  useEffect(() => {
    if (!newEvent.classification) { setSubClassifications([]); return }
    getSubClassifications(newEvent.classification)
      .then((r) => setSubClassifications(Array.isArray(r.data) ? r.data : r.data?.results || []))
      .catch(() => setSubClassifications([]))
  }, [newEvent.classification])

  const years = []
  for (let y = new Date().getFullYear() + 2; y >= 2000; y--) years.push(y)

  const list = (d) => (Array.isArray(d) ? d : d?.results || [])

  const loadMeets = () => {
    const params = { page_size: 500, ordering: 'date', include_calendar_only: 1 }
    if (filterYear) params.year = filterYear
    if (filterCountry) params.country = filterCountry
    getChampionships(params).then((res) => setMeets(list(res.data))).catch(() => {})
  }

  const loadFeatured = () => {
    getChampionships({ upcoming: 1, ordering: 'date', page_size: 1, include_calendar_only: 1 })
      .then((res) => setFeaturedMeet(list(res.data)[0] || null))
      .catch(() => {})
  }

  useEffect(() => {
    let alive = true
    Promise.allSettled([getCountries(), getCalendarEvents()]).then(([cRes, eRes]) => {
      if (!alive) return
      if (cRes.status === 'fulfilled') setCountries(list(cRes.value.data))
      if (eRes.status === 'fulfilled') setCalEvents(list(eRes.value.data))
      setLoading(false)
    })
    loadFeatured()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { loadMeets() }, [filterYear, filterCountry]) // eslint-disable-line react-hooks/exhaustive-deps

  // Featured: nearest upcoming meet or meet-type calendar event (whichever is sooner)
  const featured = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const futureEvents = calEvents
      .map((ev) => ({ ev, d: parseMeetDate(ev.date) }))
      .filter((x) => x.ev.event_type !== 'CUSTOM' && x.d && x.d >= today)
      .sort((a, b) => a.d - b.d)
    const fe = futureEvents[0]
    const fmD = featuredMeet ? parseMeetDate(featuredMeet.date) : null
    if (featuredMeet && fe) {
      return fe.d < fmD
        ? { kind: 'event', item: fe.ev, d: fe.d }
        : { kind: 'meet', item: featuredMeet, d: fmD }
    }
    if (featuredMeet) return { kind: 'meet', item: featuredMeet, d: fmD }
    if (fe) return { kind: 'event', item: fe.ev, d: fe.d }
    return null
  }, [featuredMeet, calEvents])

  // Meets tab: championships + non-duplicate meet-type calendar events, grouped by month (latest first)
  const meetGroups = useMemo(() => {
    const grouped = {}
    const push = (key, y, mo, entry) => {
      if (!grouped[key]) grouped[key] = { year: y, month: mo, items: [] }
      grouped[key].items.push(entry)
    }
    meets.forEach((c) => {
      const d = parseMeetDate(c.date)
      if (!d) return
      push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, d.getFullYear(), d.getMonth(), { kind: 'meet', item: c, d })
    })
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const loadedIds = new Set(meets.map((c) => c.id))
    calEvents.forEach((ev) => {
      if (ev.event_type === 'CUSTOM') return
      if (ev.championship && loadedIds.has(ev.championship)) return
      const d = parseMeetDate(ev.date)
      if (!d) return
      // future events always stay visible regardless of the year filter
      if (filterYear && String(d.getFullYear()) !== filterYear && d < todayStart) return
      push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, d.getFullYear(), d.getMonth(), { kind: 'event', item: ev, d })
    })
    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, g]) => ({ key, ...g, items: g.items.sort((a, b) => b.d - a.d) }))
  }, [meets, calEvents, filterYear])

  // Other events tab: CUSTOM calendar events (future always visible, past filtered by year)
  const otherEvents = useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return calEvents
      .map((ev) => ({ ev, d: parseMeetDate(ev.date) }))
      .filter((x) => x.ev.event_type === 'CUSTOM' && x.d)
      .filter((x) => !filterYear || String(x.d.getFullYear()) === filterYear || x.d >= todayStart)
      .sort((a, b) => b.d - a.d)
  }, [calEvents, filterYear])

  const handleAddEvent = async (e) => {
    e.preventDefault()
    setAddLoading(true)
    try {
      const isMeetType = newEvent.event_type === 'MEET'
      let championshipId = null
      if (isMeetType) {
        // Calendar-only championship: full meet card, hidden from the meets
        // list until real results exist. Classification makes upcoming
        // Arab/GCC/National meets appear on the Predictions page.
        const fd = new FormData()
        fd.append('name', newEvent.title)
        fd.append('date', newEvent.date)
        if (newEvent.end_date) fd.append('end_date', newEvent.end_date)
        fd.append('pool', newEvent.pool || 'LCM')
        fd.append('country', newEvent.country)
        if (newEvent.location) fd.append('location', newEvent.location)
        if (newEvent.classification_category) fd.append('classification_category', newEvent.classification_category)
        if (newEvent.classification) fd.append('classification', newEvent.classification)
        if (newEvent.sub_classification) fd.append('sub_classification', newEvent.sub_classification)
        fd.append('is_calendar_only', 'true')
        const champRes = await createChampionship(fd)
        championshipId = champRes.data.id
      }
      const isBirthday = newEvent.event_type === 'BIRTHDAY'
      const payload = {
        title: isBirthday ? `Birthday — ${newEvent.title}` : newEvent.title,
        date: newEvent.date,
        // the calendar model knows MEET and CUSTOM; birthdays are custom events
        event_type: isMeetType ? 'MEET' : 'CUSTOM',
        description: newEvent.description,
      }
      if (newEvent.end_date) payload.end_date = newEvent.end_date
      if (championshipId) payload.championship = championshipId
      const res = await createCalendarEvent(payload)
      setCalEvents((prev) => [...prev, res.data])
      loadMeets()
      loadFeatured()
      setNewEvent(EMPTY_EVENT)
      if (championshipId) {
        // meet created — offer the day-by-day program editor right away
        setProgramChampId(championshipId)
      } else {
        setShowAddEvent(false)
      }
    } catch (err) {
      window.alert('Error: ' + (err.response?.data ? JSON.stringify(err.response.data) : err.message))
    } finally {
      setAddLoading(false)
    }
  }

  const handleDeleteEvent = async (ev) => {
    if (!window.confirm('Delete this event? This cannot be undone.')) return
    try {
      await deleteCalendarEvent(ev.id)
      setCalEvents((prev) => prev.filter((e) => e.id !== ev.id))
      loadFeatured()
    } catch { /* ignore */ }
  }

  const handleDeleteCalendarMeet = async (c) => {
    if (!window.confirm(`Delete "${c.name}" from the calendar? This cannot be undone.`)) return
    try {
      await deleteChampionship(c.id)
      const linked = calEvents.filter((ev) => ev.championship === c.id)
      for (const ev of linked) {
        try { await deleteCalendarEvent(ev.id) } catch { /* ignore */ }
      }
      setMeets((prev) => prev.filter((m) => m.id !== c.id))
      setCalEvents((prev) => prev.filter((ev) => ev.championship !== c.id))
      setExpandedMeetId(null)
      loadFeatured()
    } catch { /* ignore */ }
  }

  if (loading) return <Loading label="Loading calendar" />

  const isUpcomingFeatured = featured && featured.d && featured.d.getTime() > Date.now()

  return (
    <div>
      <PageHead title="Calendar">
        {isAdmin && (
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => setShowAddEvent(true)}>Add event</button>
          </div>
        )}
      </PageHead>

      {/* featured next meet + countdown */}
      {featured && (
        <div className="rule-b" style={{ display: 'flex', flexWrap: 'wrap' }}>
          {featured.kind === 'meet' && featured.item.meet_photo && (
            <div className="hide-mobile" style={{ width: 300, flex: 'none', borderRight: '2px solid var(--color-divider)' }}>
              <img
                src={mediaUrl(featured.item.meet_photo)}
                alt={featured.item.name}
                className="grayscale"
                style={{ width: '100%', height: '100%', minHeight: 160, objectFit: 'cover' }}
              />
            </div>
          )}
          <div className="pad-lg" style={{ flex: 1, minWidth: 260 }}>
            <div className="kicker" style={{ marginBottom: 8 }}>{isUpcomingFeatured ? 'Next up' : 'Featured competition'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {featured.kind === 'meet' && (
                <Flag code={featured.item.country_detail?.code} name={featured.item.country_detail?.name} large />
              )}
              {featured.kind === 'meet' ? (
                <Link to={`/meets/${featured.item.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <h2 style={{ margin: 0, letterSpacing: '-0.02em' }}>{featured.item.name}</h2>
                </Link>
              ) : (
                <h2 style={{ margin: 0, letterSpacing: '-0.02em' }}>{featured.item.title}</h2>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 6 }}>
              {featured.kind === 'meet' && featured.item.location ? `${featured.item.location}` : ''}
              {featured.kind === 'meet' && featured.item.country_detail ? `${featured.item.location ? ', ' : ''}${featured.item.country_detail.name}` : ''}
              {featured.kind === 'meet' && (featured.item.location || featured.item.country_detail) ? ' · ' : ''}
              {formatDateRange(featured.item.date, featured.item.end_date)}
              {featured.kind === 'meet' && featured.item.pool ? ` · ${featured.item.pool}` : ''}
              {featured.kind === 'event' && featured.item.description ? ` · ${featured.item.description}` : ''}
            </div>
            {isUpcomingFeatured && <Countdown target={featured.d.getTime()} />}
          </div>
        </div>
      )}

      {/* tabs + filters */}
      <div className="rule-b records-filters" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Seg
          options={[
            { value: 'meets', label: 'Meets' },
            { value: 'birthdays', label: 'Birthdays' },
            { value: 'events', label: 'Other Events' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab !== 'birthdays' && (
          <>
            <select className="select" style={{ width: 120 }} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
              <option value="">All years</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {tab === 'meets' && (
              <select className="select" style={{ width: 190 }} value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}>
                <option value="">All countries</option>
                {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {(filterYear || filterCountry) && (
              <button className="btn btn-ghost" onClick={() => { setFilterYear(''); setFilterCountry('') }}>Clear</button>
            )}
          </>
        )}
      </div>

      {/* ── Meets tab ── */}
      {tab === 'meets' && (
        <div>
          {meetGroups.length === 0 && <Empty label="No competitions found — try a different year or country" />}
          {meetGroups.map((g) => (
            <div key={g.key} className="rule-b">
              <div className="pad" style={{ paddingBottom: 10, display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <div style={{ background: 'var(--color-accent)', color: '#ffffff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 12, letterSpacing: '0.09em', textTransform: 'uppercase', padding: '6px 14px', display: 'inline-block' }}>
                  {MONTHS_FULL[g.month]} {g.year}
                </div>
              </div>
              {g.items.map(({ kind, item, d }, i) => {
                if (kind === 'meet') {
                  const c = item
                  const isExpanded = expandedMeetId === c.id
                  return (
                    <div key={`m-${c.id}`} className={i < g.items.length - 1 || isExpanded ? 'hair-b' : ''}>
                      <div
                        onClick={() => setExpandedMeetId(isExpanded ? null : c.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 32px', cursor: 'pointer', background: isExpanded ? 'var(--color-surface)' : undefined }}
                      >
                        {/* mini calendar tile: navy month strip over the day */}
                        <div style={{ width: 46, flex: 'none', textAlign: 'center', border: '1px solid var(--color-divider)', background: 'var(--color-bg)', overflow: 'hidden' }}>
                          <div style={{ background: 'var(--color-accent)', color: '#ffffff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 8.5, letterSpacing: '0.12em', padding: '3px 0 2px' }}>{MONTH_SHORT[d.getMonth()]}</div>
                          <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 19, lineHeight: 1, color: 'var(--color-accent)', padding: '5px 0 6px' }}>{d.getDate()}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, lineHeight: 1.2 }}>{c.name}</span>
                          <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
                            {c.location}
                            {c.country_detail ? `${c.location ? ', ' : ''}${c.country_detail.name}` : ''}
                            {' · '}{formatDateRange(c.date, c.end_date)}
                          </div>
                        </div>
                        {c.pool && <span className="tag tag-neutral hide-mobile">{c.pool}</span>}
                        <span className="micro" style={{ fontSize: 10, width: 12, textAlign: 'center' }}>{isExpanded ? '▴' : '▾'}</span>
                      </div>
                      {isExpanded && (
                        <MeetExpandedPanel meet={c} isAdmin={isAdmin} onDelete={handleDeleteCalendarMeet} onEditLinks={setEditLinksMeet} />
                      )}
                    </div>
                  )
                }
                // meet-type calendar event with no loaded championship behind it
                const ev = item
                return (
                  <div
                    key={`ev-${ev.id}`}
                    className={i < g.items.length - 1 ? 'hair-b' : ''}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 32px', cursor: ev.championship ? 'pointer' : 'default' }}
                    onClick={() => { if (ev.championship) navigate(`/meets/${ev.championship}`) }}
                  >
                    <div style={{ width: 46, flex: 'none', textAlign: 'center', border: '1px solid var(--color-divider)', background: 'var(--color-bg)', overflow: 'hidden' }}>
                      <div style={{ background: 'var(--color-accent)', color: '#ffffff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 8.5, letterSpacing: '0.12em', padding: '3px 0 2px' }}>{MONTH_SHORT[d.getMonth()]}</div>
                      <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 19, lineHeight: 1, color: 'var(--color-accent)', padding: '5px 0 6px' }}>{d.getDate()}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, lineHeight: 1.2 }}>{ev.title}</span>
                      <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
                        {ev.description ? `${ev.description} · ` : ''}
                        {formatDateRange(ev.date, ev.end_date)}
                      </div>
                    </div>
                    <span className="tag tag-accent hide-mobile">{ev.event_type}</span>
                    {isAdmin && (
                      <button
                        className="btn btn-ghost"
                        style={{ color: 'var(--asw-slow)' }}
                        onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev) }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Birthdays tab ── */}
      {tab === 'birthdays' && <BirthdaysTab />}

      {/* ── Other events tab ── */}
      {tab === 'events' && (
        <div>
          {otherEvents.length === 0 && <Empty label="No custom events" />}
          {otherEvents.map(({ ev, d }, i) => (
            <div
              key={ev.id}
              className={i < otherEvents.length - 1 ? 'hair-b' : ''}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 32px' }}
            >
              <div style={{ width: 46, flex: 'none', textAlign: 'center', border: '1px solid var(--color-divider)', background: 'var(--color-bg)', overflow: 'hidden' }}>
                <div style={{ background: 'var(--color-accent)', color: '#ffffff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 8.5, letterSpacing: '0.12em', padding: '3px 0 2px' }}>{MONTH_SHORT[d.getMonth()]} {String(d.getFullYear()).slice(2)}</div>
                <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 19, lineHeight: 1, color: 'var(--color-accent)', padding: '5px 0 6px' }}>{d.getDate()}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, lineHeight: 1.2 }}>{ev.title}</span>
                  <span className="tag tag-outline">{ev.event_type}</span>
                </div>
                {ev.description && <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 2 }}>{ev.description}</div>}
                {ev.end_date && ev.end_date !== ev.date && (
                  <div className="micro" style={{ fontSize: 11, marginTop: 2, textTransform: 'none', letterSpacing: 0 }}>
                    {formatDate(ev.date)} to {formatDate(ev.end_date)}
                  </div>
                )}
              </div>
              {isAdmin && (
                <button className="btn btn-ghost" style={{ color: 'var(--asw-slow)' }} onClick={() => handleDeleteEvent(ev)}>Delete</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Edit meet links modal (admin) ── */}
      {isAdmin && editLinksMeet && (
        <MeetLinksModal
          meet={editLinksMeet}
          onClose={() => setEditLinksMeet(null)}
          onSaved={(d) => {
            setMeets((prev) => prev.map((m) => m.id === d.id
              ? { ...m, live_results_url: d.live_results_url, registration_url: d.registration_url, meet_guide_pdf: d.meet_guide_pdf }
              : m))
            setEditLinksMeet(null)
          }}
        />
      )}

      {/* ── Add event modal (admin) ── */}
      <Modal
        open={isAdmin && showAddEvent}
        title={programChampId ? 'Day-by-day program' : 'Add calendar event'}
        onClose={() => { setShowAddEvent(false); setProgramChampId(null) }}
      >
        {programChampId ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>
              Meet created. Optionally set which events run on each day — you can also do this later from the meet page&apos;s Program tab.
            </div>
            <MeetProgramEditor champId={programChampId} />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { setShowAddEvent(false); setProgramChampId(null) }}
            >
              Done
            </button>
          </div>
        ) : (
        <form onSubmit={handleAddEvent} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label>Type</label>
            <select className="select" value={newEvent.event_type}
              onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })}>
              <option value="MEET">Meet / Championship</option>
              <option value="BIRTHDAY">Birthday</option>
              <option value="CUSTOM">Other event</option>
            </select>
          </div>
          <div className="field">
            <label>{newEvent.event_type === 'MEET' ? 'Meet name *' : newEvent.event_type === 'BIRTHDAY' ? 'Name *' : 'Title *'}</label>
            <input className="input" type="text" required value={newEvent.title}
              onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
              placeholder={newEvent.event_type === 'MEET' ? 'e.g. Arab Swimming Championships 2026'
                : newEvent.event_type === 'BIRTHDAY' ? 'Who is celebrating?'
                : 'e.g. Team meeting, federation congress…'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>Start date *</label>
              <input className="input" type="date" required value={newEvent.date}
                onChange={(e) => {
                  const d = e.target.value
                  const updates = { date: d }
                  if (newEvent.end_date && newEvent.end_date < d) updates.end_date = d
                  setNewEvent({ ...newEvent, ...updates })
                }} />
            </div>
            <div className="field">
              <label>End date</label>
              <input className="input" type="date" value={newEvent.end_date} min={newEvent.date || undefined}
                onChange={(e) => setNewEvent({ ...newEvent, end_date: e.target.value })} />
            </div>
          </div>
          {newEvent.event_type === 'MEET' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label>Country *</label>
                  <select className="select" required value={newEvent.country}
                    onChange={(e) => setNewEvent({ ...newEvent, country: e.target.value })}>
                    <option value="">Select country</option>
                    {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Pool</label>
                  <select className="select" value={newEvent.pool}
                    onChange={(e) => setNewEvent({ ...newEvent, pool: e.target.value })}>
                    <option value="LCM">Long Course (50m)</option>
                    <option value="SCM">Short Course (25m)</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Location</label>
                <input className="input" type="text" value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  placeholder="City / venue" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label>Category</label>
                  <select className="select" value={newEvent.classification_category}
                    onChange={(e) => setNewEvent({ ...newEvent, classification_category: e.target.value, classification: '', sub_classification: '' })}>
                    <option value="">Select category</option>
                    {classCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Classification</label>
                  <select className="select" value={newEvent.classification}
                    onChange={(e) => setNewEvent({ ...newEvent, classification: e.target.value, sub_classification: '' })}>
                    <option value="">Select classification</option>
                    {classifications
                      .filter((c) => !newEvent.classification_category || String(c.category) === String(newEvent.classification_category))
                      .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              {subClassifications.length > 0 && (
                <div className="field">
                  <label>Sub-classification</label>
                  <select className="select" value={newEvent.sub_classification}
                    onChange={(e) => setNewEvent({ ...newEvent, sub_classification: e.target.value })}>
                    <option value="">None</option>
                    {subClassifications.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {PREDICTABLE.has(classifications.find((c) => String(c.id) === String(newEvent.classification))?.name) && (
                <div className="micro" style={{ color: 'var(--color-accent-800)' }}>
                  This meet will get automatic medal predictions on the Predictions page.
                </div>
              )}
            </>
          )}
          <div className="field">
            <label>Description</label>
            <textarea className="input" rows={2} value={newEvent.description}
              onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
              placeholder="Optional details…" style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddEvent(false)}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={addLoading || !newEvent.title || !newEvent.date || (newEvent.event_type === 'MEET' && !newEvent.country)}
            >
              {addLoading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
        )}
      </Modal>
    </div>
  )
}
