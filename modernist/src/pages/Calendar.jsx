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
import { PageHead, Loading, Empty, Seg, SectHead, FilterBar, ShowMore } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { CropUpload } from '../components/ImageCropper'
import { formatDate, formatDateRange, mediaUrl, MONTHS_FULL } from '../utils'
import Pic from '../components/Pic'

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function parseMeetDate(d) {
  if (!d) return null
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1])
  // A bare 'YYYY-MM-DD' handed to new Date() is read as UTC midnight, which is
  // the previous evening west of Greenwich: the tile said DEC 19 for a 20 Dec
  // meet. Build it as a local calendar day, the same day formatDate prints.
  const iso = String(d).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3])
  const dt = new Date(String(d))
  return Number.isNaN(dt.getTime()) ? null : dt
}

const poolShort = (p) => (p === 'LCM' ? '50m' : p === 'SCM' ? '25m' : p)
const poolTitle = (p) => (p === 'LCM' ? 'Long course (50m pool)' : p === 'SCM' ? 'Short course (25m pool)' : undefined)
const placeOf = (c) => [c.location, c.country_detail?.name].filter(Boolean).join(', ')

// Status from the dates the row already has: live colour while it is on,
// "Upcoming" before it starts, nothing once it is over.
function statusOf(d, endDate) {
  if (!d) return null
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  const end = parseMeetDate(endDate) || d
  // a row under the "Upcoming" heading does not repeat the word
  if (d > t) return null
  if (end < t) return null
  return { label: end > d ? 'In progress' : 'Today', cls: 'tag cal-live' }
}

/* mini calendar tile: navy month strip over the day (Similarity: one tile on every list) */
function DateTile({ d }) {
  return (
    <div className="cal-tile">
      <div className="cal-tile-m">{MONTH_SHORT[d.getMonth()]}</div>
      <div className="cal-tile-d">{d.getDate()}</div>
    </div>
  )
}

function Chevron() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 4.5 6 8.5l4-4" /></svg>
  )
}

function CalGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3.5 5.5h17v15h-17zM3.5 10h17M8 3v5M16 3v5" /></svg>
  )
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
    <div className="cal-count" role="timer" aria-label="Time until the start">
      {cells.map(([v, l]) => (
        <div key={l}>
          <div className="cal-count-n">{v}</div>
          <div className="cal-count-l">{l}</div>
        </div>
      ))}
    </div>
  )
}

/* Plain modal — zero radius, navy rule, per the modernist idiom */
function Modal({ open, title, onClose, children }) {
  // Jakob's Law: Escape closes a dialog
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(8, 24, 44, 0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={title}
        style={{ background: 'var(--color-bg)', width: 520, maxWidth: '100%', borderTop: '4px solid var(--color-box-top)' }}
      >
        <div className="rule-b" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h4 style={{ margin: 0 }}>{title}</h4>
          <button type="button" className="btn btn-ghost" style={{ minWidth: 36, minHeight: 36 }} onClick={onClose} aria-label="Close" title="Close">×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  )
}

/* Admin: edit everything on a meet — same fields as creation, plus links/files */
function MeetEditModal({ meet, countries, onClose, onSaved }) {
  const toISO = (d) => {
    // API dates come as dd/mm/yyyy; date inputs need yyyy-mm-dd
    if (!d) return ''
    const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : String(d)
  }
  const [form, setForm] = useState({
    name: meet.name || '',
    date: toISO(meet.date),
    end_date: toISO(meet.end_date),
    pool: meet.pool || 'LCM',
    meet_category: meet.meet_category || '',
    country: meet.country != null ? String(meet.country) : '',
    location: meet.location || '',
    classification_category: meet.classification_category != null ? String(meet.classification_category) : '',
    classification: meet.classification != null ? String(meet.classification) : '',
    sub_classification: meet.sub_classification != null ? String(meet.sub_classification) : '',
    website: meet.website || '',
    live_results_url: meet.live_results_url || '',
    registration_url: meet.registration_url || '',
  })
  const [packFile, setPackFile] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [classCategories, setClassCategories] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getClassificationCategories().then((r) => setClassCategories(Array.isArray(r.data) ? r.data : r.data?.results || [])).catch(() => {})
    getClassifications().then((r) => setClassifications(Array.isArray(r.data) ? r.data : r.data?.results || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!form.classification) { setSubClassifications([]); return }
    getSubClassifications(form.classification)
      .then((r) => setSubClassifications(Array.isArray(r.data) ? r.data : r.data?.results || []))
      .catch(() => setSubClassifications([]))
  }, [form.classification])

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        date: form.date,
        end_date: form.end_date || null,
        pool: form.pool,
        meet_category: form.meet_category,
        country: form.country ? Number(form.country) : null,
        location: form.location.trim(),
        classification_category: form.classification_category ? Number(form.classification_category) : null,
        classification: form.classification ? Number(form.classification) : null,
        sub_classification: form.sub_classification ? Number(form.sub_classification) : null,
        website: form.website.trim(),
        live_results_url: form.live_results_url.trim(),
        registration_url: form.registration_url.trim(),
      }
      let res = await updateChampionship(meet.id, payload)
      if (packFile || photoFile) {
        const fd = new FormData()
        if (packFile) fd.append('meet_guide_pdf', packFile)
        if (photoFile) fd.append('meet_photo', photoFile)
        res = await updateChampionship(meet.id, fd)
      }
      onSaved(res.data)
    } catch (err) {
      const d = err.response?.data
      setError(d ? (typeof d === 'string' ? d : Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join(' · ')) : 'Could not save the meet')
      setSaving(false)
    }
  }

  return (
    <Modal open title="Edit Meet" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field">
          <label htmlFor="cal-f1">Meet name *</label>
          <input id="cal-f1" className="input" aria-label="Meet name" type="text" required value={form.name} onChange={set('name')} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="cal-f2">Start date *</label>
            <input id="cal-f2" className="input" aria-label="Start date" type="date" required value={form.date} onChange={set('date')} />
          </div>
          <div className="field">
            <label htmlFor="cal-f3">End date</label>
            <input id="cal-f3" className="input" aria-label="End date" type="date" value={form.end_date} min={form.date || undefined} onChange={set('end_date')} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="cal-f4">Country</label>
            <select id="cal-f4" className="select" aria-label="Country" value={form.country} onChange={set('country')}>
              <option value="">Select country</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cal-f5">Pool</label>
            <select id="cal-f5" className="select" aria-label="Pool" value={form.pool} onChange={set('pool')}>
              <option value="LCM">Long Course (50m)</option>
              <option value="SCM">Short Course (25m)</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="cal-f6">Open / Age Group</label>
            <select id="cal-f6" className="select" aria-label="Open / Age Group" value={form.meet_category} onChange={set('meet_category')}>
              <option value="">Not set</option>
              <option value="OPEN">Open</option>
              <option value="AGE_GROUP">Age Group</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="cal-f7">Location</label>
            <input id="cal-f7" className="input" aria-label="Location" type="text" value={form.location} onChange={set('location')} placeholder="City / venue" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="cal-f9">Classification</label>
            <select id="cal-f9" className="select" aria-label="Classification" value={form.classification}
              onChange={(e) => setForm({ ...form, classification: e.target.value, sub_classification: '' })}>
              <option value="">Select classification</option>
              {classifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cal-f10">Sub-classification</label>
            <select id="cal-f10" className="select" aria-label="Sub-classification" value={form.sub_classification}
              disabled={!subClassifications.length}
              onChange={(e) => setForm({ ...form, sub_classification: e.target.value })}>
              <option value="">{!form.classification ? 'Choose a classification first' : subClassifications.length ? 'Select sub-classification' : 'None for this classification'}</option>
              {subClassifications.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="cal-f11">Website</label>
          <input id="cal-f11" className="input" aria-label="Website" type="url" value={form.website} onChange={set('website')} placeholder="https://…" />
        </div>
        <div className="field">
          <label htmlFor="cal-f12">Live results URL</label>
          <input id="cal-f12" className="input" aria-label="Live results URL" type="url" value={form.live_results_url} onChange={set('live_results_url')} placeholder="https://…" />
        </div>
        <div className="field">
          <label htmlFor="cal-f13">Registration link</label>
          <input id="cal-f13" className="input" aria-label="Registration link" type="url" value={form.registration_url} onChange={set('registration_url')} placeholder="https://…" />
        </div>
        <div className="field">
          <label htmlFor="cal-f14">Entry pack (PDF{meet.meet_guide_pdf ? ' — uploaded, choose a file to replace' : ''})</label>
          <input id="cal-f14" className="input" type="file" aria-label="Entry pack PDF" accept=".pdf,application/pdf" onChange={(e) => setPackFile(e.target.files?.[0] || null)} />
        </div>
        <div className="field">
          <label>Meet photo</label>
          <CropUpload kind="meet" current={meet.meet_photo} onChange={setPhotoFile} />
        </div>
        {error && <div role="alert" style={{ color: 'var(--asw-slow)', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save meet'}</button>
        </div>
      </form>
    </Modal>
  )
}

/* Expanded panel under a meet row: info grid + public links; admin can delete calendar-only meets */
function MeetExpandedPanel({ meet: c, isAdmin, onDelete, onEditLinks }) {
  const showAny = c.live_results_url || c.meet_guide_pdf || c.registration_url || c.website || c.policy_pdf
  return (
    // Common Region + Proximity: the open row and its panel share one tint,
    // and the facts start under the name column they belong to
    <div className="cal-panel">
      <dl className="cal-facts">
        <div>
          <dt>Country</dt>
          <dd>{c.country_detail ? (<><Flag code={c.country_detail.code} name={c.country_detail.name} />{c.country_detail.name}</>) : '—'}</dd>
        </div>
        <div>
          <dt>Pool</dt>
          <dd>{c.pool === 'SCM' ? 'Short Course (25m)' : 'Long Course (50m)'}</dd>
        </div>
      </dl>
      {(showAny || isAdmin || (c.results_count ?? 0) > 0) && (
        <div className="cal-links">
          {c.live_results_url && (
            <a className="btn btn-primary" href={c.live_results_url} target="_blank" rel="noopener noreferrer">Live results</a>
          )}
          {c.meet_guide_pdf && (
            <a className="btn btn-secondary" href={c.meet_guide_pdf} target="_blank" rel="noopener noreferrer">Entry pack</a>
          )}
          {c.registration_url && (
            <a className="btn btn-secondary" href={c.registration_url} target="_blank" rel="noopener noreferrer">Registration</a>
          )}
          {c.website && (
            <a className="btn btn-secondary" href={c.website} target="_blank" rel="noopener noreferrer">Website</a>
          )}
          {c.policy_pdf && (
            <a className="btn btn-secondary" href={c.policy_pdf} target="_blank" rel="noopener noreferrer">Nashra (policy)</a>
          )}
          {(c.results_count ?? 0) > 0 && (
            <Link className="btn btn-secondary" to={`/meets/${c.id}`}>Meet page</Link>
          )}
          {isAdmin && (
            <div className="cal-links-admin">
              <button className="btn btn-ghost" onClick={() => onEditLinks(c)}>Edit meet</button>
              {c.is_calendar_only && (
                <button className="btn btn-ghost cal-danger" onClick={() => onDelete(c)}>Delete meet</button>
              )}
            </div>
          )}
        </div>
      )}
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

  const todayChip = (s) => (
    <Link key={s.id} to={`/swimmers/${s.id}`} className="btn btn-secondary">
      {s.name}{s.age > 0 ? ` · turns ${s.age}` : ''}
    </Link>
  )
  const weekChip = (s, i) => (
    <Link key={`${s.id}-${i}`} to={`/swimmers/${s.id}`} className="btn btn-secondary">
      {s.name}
      <span className="micro" style={{ marginLeft: 6 }}>{s.when.getDate()} {MONTH_SHORT[s.when.getMonth()]}</span>
    </Link>
  )
  // month list: grouped by day, names A–Z inside a day
  const byDay = new Map()
  thisMonth.forEach((b) => { if (!byDay.has(b.day)) byDay.set(b.day, []); byDay.get(b.day).push(b) })
  byDay.forEach((arr) => arr.sort((x, y) => String(x.name).localeCompare(String(y.name))))
  const allDays = [...byDay.keys()].sort((x, y) => x - y)
  const daysAhead = allDays.filter((d) => d >= now.getDate())
  const daysEarlier = allDays.filter((d) => d < now.getDate())
  const birthdayRow = (b) => (
    // Fitts's Law: the name is a 40px-tall target; nationality and age sit beside it
    <div key={b.id} className="cal-bd-row">
      <Link to={`/swimmers/${b.id}`}>{b.name}</Link>
      <span>
        {b.nationality}{b.age > 0 ? ` · ${b.age}` : ''}
      </span>
    </div>
  )
  const dayBlock = (day) => {
    const arr = byDay.get(day)
    return (
      <div key={day} className="cal-bd-day">
        <div className="cal-bd-date">
          <div className="cal-tile-d">{day}</div>
          <span>{day === now.getDate() ? 'Today' : MONTH_SHORT[now.getMonth()]}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          {arr.slice(0, 6).map(birthdayRow)}
          {arr.length > 6 && (
            <ShowMore label={`${arr.length - 6} more`}>
              {arr.slice(6).map(birthdayRow)}
            </ShowMore>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="cal-bd">
      <div className="rule-r">
        <div className="rule-b pad">
          <SectHead title="Birthdays Today" />
          {today.length === 0 ? (
            <div className="cal-empty-inline"><Empty label="No birthdays today" hint="The coming week is listed below." /></div>
          ) : (
            <div className="cal-bd-chips">
              {/* Miller's Law: a dozen names up front, the rest on request */}
              {today.slice(0, 12).map(todayChip)}
              {today.length > 12 && <ShowMore label={`${today.length - 12} more today`}>{today.slice(12).map(todayChip)}</ShowMore>}
            </div>
          )}
        </div>
        <div className="pad">
          <SectHead title="Next 7 Days" />
          {upcoming.length === 0 ? (
            <div className="cal-empty-inline"><Empty label="No birthdays in the coming week" hint="Later dates are in the month list." /></div>
          ) : (
            <div className="cal-bd-chips">
              {upcoming.slice(0, 12).map(weekChip)}
              {upcoming.length > 12 && <ShowMore label={`${upcoming.length - 12} more this week`}>{upcoming.slice(12).map(weekChip)}</ShowMore>}
            </div>
          )}
        </div>
      </div>
      <div className="pad">
        <SectHead title={`All Birthdays · ${MONTHS_FULL[now.getMonth()]}`} />
        {thisMonth.length === 0 ? (
          <div className="cal-empty-inline"><Empty label="No birthdays this month" hint="Next month's birthdays appear here when the month begins." /></div>
        ) : (
          <>
            {/* Chunking: one block per day, in date order, starting today;
                days already gone wait behind "Earlier this month" */}
            <div className="cal-bd-note">
              <span className="asw-num">{thisMonth.length}</span> swimmers · from today to the end of the month
            </div>
            {daysAhead.length === 0 && <div className="cal-empty-inline"><Empty label="No more birthdays this month" hint="Days already gone are under Earlier this month." /></div>}
            {daysAhead.map(dayBlock)}
            {daysEarlier.length > 0 && (
              <ShowMore label={`Earlier this month (${daysEarlier.reduce((n, d) => n + byDay.get(d).length, 0)})`} lessLabel="Hide earlier days">
                {daysEarlier.map(dayBlock)}
              </ShowMore>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────── Page ─────────────────────────────── */

const EMPTY_EVENT = {
  title: '', date: '', end_date: '', event_type: 'MEET', description: '',
  country: '', location: '', pool: 'LCM', meet_category: '',
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
  const thisYear = String(new Date().getFullYear())
  const [filterYear, setFilterYear] = useState(thisYear)
  const [meetsFailed, setMeetsFailed] = useState(false)
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
  const [addError, setAddError] = useState('')
  const [notice, setNotice] = useState(null) // { text, bad } — Peak-End Rule: confirm saves, explain failures

  useEffect(() => {
    if (!notice) return undefined
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])
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
    // calendar_linked: the calendar is independent — it only ever shows meets
    // manually added here, never the imported-meets pool.
    const params = { page_size: 500, ordering: 'date', include_calendar_only: 1, calendar_linked: 1 }
    if (filterYear) params.year = filterYear
    if (filterCountry) params.country = filterCountry
    setMeetsFailed(false)
    getChampionships(params).then((res) => setMeets(list(res.data))).catch(() => setMeetsFailed(true))
  }
  // "Clear" goes back to the default view (this year, every country)
  const filtersActive = filterYear !== thisYear || !!filterCountry
  const clearFilters = () => { setFilterYear(thisYear); setFilterCountry('') }

  const loadFeatured = () => {
    getChampionships({ upcoming: 1, ordering: 'date', page_size: 1, include_calendar_only: 1, calendar_linked: 1 })
      .then((res) => setFeaturedMeet(list(res.data)[0] || null))
      .catch(() => {})
  }

  useEffect(() => {
    let alive = true
    Promise.allSettled([getCountries(), getCalendarEvents()]).then(([cRes, eRes]) => {
      if (!alive) return
      if (cRes.status === 'fulfilled') {
        // Arab/GCC federations first, rest after (matches Swimmers/Clubs filters)
        const all = list(cRes.value.data)
        const arab = all.filter((c) => c.region === 'ARAB' || c.region === 'GCC')
        const rest = all.filter((c) => c.region !== 'ARAB' && c.region !== 'GCC')
        setCountries([...arab, ...rest])
      }
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
    // Mental Model + Serial Position: a calendar leads with what is coming,
    // soonest first; what already happened follows, latest first.
    const grouped = {}
    const day0 = new Date()
    day0.setHours(0, 0, 0, 0)
    const push = (key, y, mo, entry) => {
      const end = parseMeetDate(entry.item.end_date) || entry.d
      const part = end >= day0 ? 'u' : 'p'
      const k = `${part}-${key}`
      if (!grouped[k]) grouped[k] = { year: y, month: mo, part, items: [] }
      grouped[k].items.push(entry)
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
    const all = Object.entries(grouped).map(([key, g]) => ({ key, ...g }))
    const upcoming = all.filter((g) => g.part === 'u')
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((g) => ({ ...g, items: g.items.sort((a, b) => a.d - b.d) }))
    const past = all.filter((g) => g.part === 'p')
      .sort((a, b) => b.key.localeCompare(a.key))
      .map((g) => ({ ...g, items: g.items.sort((a, b) => b.d - a.d) }))
    const count = (gs) => gs.reduce((n, g) => n + g.items.length, 0)
    if (upcoming[0]) upcoming[0] = { ...upcoming[0], section: 'Upcoming', sectionCount: count(upcoming) }
    // the "Past" heading is only needed to separate it from an Upcoming block
    if (past[0] && upcoming.length) past[0] = { ...past[0], section: 'Past', sectionCount: count(past) }
    return [...upcoming, ...past]
  }, [meets, calEvents, filterYear])
  const meetCount = meetGroups.reduce((n, g) => n + g.items.length, 0)

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
    setAddError('')
    try {
      const isMeetType = newEvent.event_type === 'MEET'
      const title = newEvent.title.trim() // Postel's Law: stray spaces are dropped
      let championshipId = null
      if (isMeetType) {
        // Calendar-only championship: full meet card, hidden from the meets
        // list until real results exist. Classification makes upcoming
        // Arab/GCC/National meets appear on the Predictions page.
        const fd = new FormData()
        fd.append('name', title)
        fd.append('date', newEvent.date)
        if (newEvent.end_date) fd.append('end_date', newEvent.end_date)
        fd.append('pool', newEvent.pool || 'LCM')
        if (newEvent.meet_category) fd.append('meet_category', newEvent.meet_category)
        fd.append('country', newEvent.country)
        if (newEvent.location.trim()) fd.append('location', newEvent.location.trim())
        if (newEvent.classification_category) fd.append('classification_category', newEvent.classification_category)
        if (newEvent.classification) fd.append('classification', newEvent.classification)
        if (newEvent.sub_classification) fd.append('sub_classification', newEvent.sub_classification)
        fd.append('is_calendar_only', 'true')
        const champRes = await createChampionship(fd)
        championshipId = champRes.data.id
      }
      const isBirthday = newEvent.event_type === 'BIRTHDAY'
      const payload = {
        title: isBirthday ? `Birthday — ${title}` : title,
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
        setNotice({ text: 'Event added to the calendar.' })
      }
    } catch (err) {
      const d = err.response?.data
      setAddError(d ? (typeof d === 'string' ? d : Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join(' · ')) : 'Could not save the event. Check your connection and try again.')
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
      setNotice({ text: 'Event deleted.' })
    } catch { setNotice({ text: 'Could not delete the event. Try again.', bad: true }) }
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
      setNotice({ text: 'Meet deleted from the calendar.' })
    } catch { setNotice({ text: 'Could not delete the meet. Try again.', bad: true }) }
  }

  if (loading) return <Loading label="Loading calendar" />

  const isUpcomingFeatured = featured && featured.d && featured.d.getTime() > Date.now()
  // Feature band: its action goes where the page already sends that item
  const featuredMeetId = featured ? (featured.kind === 'meet' ? featured.item.id : featured.item.championship) : null
  const featuredTo = featuredMeetId ? `/meets/${featuredMeetId}` : null
  const featuredPlace = featured && featured.kind === 'meet' ? placeOf(featured.item) : ''
  // Miller's Law: the next three after the featured one, not the whole list again
  const alsoComing = featured
    ? meetGroups.filter((g) => g.part === 'u').flatMap((g) => g.items)
      .filter((x) => !(x.kind === featured.kind && x.item.id === featured.item.id)
        && !(featuredMeetId && (x.kind === 'meet' ? x.item.id : x.item.championship) === featuredMeetId))
      .slice(0, 3)
    : []

  return (
    <div>
      <PageHead title="Calendar" sub="Meets, birthdays and other dates across Arab swimming">
        {isAdmin && (
          <div className="cal-head-actions">
            <button className="btn btn-primary" onClick={() => setShowAddEvent(true)}>Add event</button>
          </div>
        )}
      </PageHead>

      {notice && (
        <div role={notice.bad ? 'alert' : 'status'} className="rule-b cal-notice" style={{ color: notice.bad ? 'var(--asw-slow)' : 'var(--asw-fast)' }}>
          {notice.text}
        </div>
      )}

      {/* featured next meet + countdown.
          Von Restorff: the one standout block of the page. Proximity: photo,
          facts, countdown and action sit together; the rest of the width
          carries what comes after it instead of standing empty. */}
      {featured && (
        <section className={`cal-next${alsoComing.length ? '' : ' cal-next--solo'}`} aria-label={isUpcomingFeatured ? 'Next up' : 'Featured competition'}>
          <div className="cal-next-media">
            {/* the photo covers its frame edge to edge; no photo (or a broken
                file) leaves the navy panel with the host flag or a calendar glyph */}
            <Pic kind="meet" w={480} eager
              src={featured.item.meet_photo}
              alt={featured.item.name || featured.item.title}
              className="grayscale"
              fallback={featured.kind === 'meet' && featured.item.country_detail?.code
                ? <Flag code={featured.item.country_detail.code} name={featured.item.country_detail.name} large />
                : <CalGlyph />}
              style={{ position: 'absolute', inset: 0, objectFit: 'cover', objectPosition: '50% 35%' }}
            />
          </div>
          <div className="cal-next-body">
            <div className="kicker">{isUpcomingFeatured ? 'Next up' : 'Featured competition'}</div>
            <h2 className="cal-next-title">
              {featured.kind === 'meet' && featured.item.meet_photo && (
                <Flag code={featured.item.country_detail?.code} name={featured.item.country_detail?.name} large />
              )}
              {featuredTo ? (
                <Link to={featuredTo}>{featured.item.name || featured.item.title}</Link>
              ) : (
                <span>{featured.item.title}</span>
              )}
            </h2>
            {featured.kind === 'event' && featured.item.description && (
              <p className="cal-next-note">{featured.item.description}</p>
            )}
            {/* Chunking: each fact under its own label instead of one dotted line */}
            <dl className="cal-facts">
              <div>
                <dt>Dates</dt>
                <dd>{formatDateRange(featured.item.date, featured.item.end_date)}</dd>
              </div>
              {featuredPlace && (
                <div>
                  <dt>Place</dt>
                  <dd>{featuredPlace}</dd>
                </div>
              )}
              {featured.kind === 'meet' && featured.item.pool && (
                <div>
                  <dt>Pool</dt>
                  <dd title={poolTitle(featured.item.pool)}>{featured.item.pool === 'LCM' ? '50m pool' : featured.item.pool === 'SCM' ? '25m pool' : featured.item.pool}</dd>
                </div>
              )}
            </dl>
            {isUpcomingFeatured && <Countdown target={featured.d.getTime()} />}
            {/* Fitts's Law: one large primary action, full width on phone */}
            {featuredTo && <Link className="btn btn-primary cal-next-cta" to={featuredTo}>Open meet</Link>}
          </div>
          {alsoComing.length > 0 && (
            <aside className="cal-next-aside">
              <div className="kicker">Also coming up</div>
              <ul className="cal-also">
                {alsoComing.map(({ kind, item, d }) => {
                  const to = kind === 'meet' ? `/meets/${item.id}` : item.championship ? `/meets/${item.championship}` : null
                  const place = kind === 'meet' ? placeOf(item) : item.description
                  const inner = (
                    <>
                      <span className="cal-also-date">{d.getDate()} {MONTH_SHORT[d.getMonth()]}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="cal-also-name">{kind === 'meet' ? item.name : item.title}</span>
                        {place && <span className="cal-also-place">{place}</span>}
                      </span>
                    </>
                  )
                  return (
                    <li key={`${kind}-${item.id}`}>
                      {to ? <Link className="cal-also-row" to={to}>{inner}</Link> : <div className="cal-also-row">{inner}</div>}
                    </li>
                  )
                })}
              </ul>
            </aside>
          )}
        </section>
      )}

      {/* Similarity: section tabs look like tabs; the filters get a bar of
          their own (Common Region) with the count and a way back to the default */}
      <div className="rule-b tabbar" style={{ padding: '16px 32px', overflowX: 'auto' }}>
        <Seg
          tabs
          options={[
            { value: 'meets', label: 'Meets' },
            { value: 'birthdays', label: 'Birthdays' },
            { value: 'events', label: 'Other events' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab !== 'birthdays' && (
        // Common Region: one bar; every control carries its label and the same
        // 40px height, and the count sits on the controls' own line
        <div className="cal-fb">
          <FilterBar
            count={tab === 'meets' ? (meetsFailed ? null : meetCount) : otherEvents.length}
            noun={tab === 'meets' ? (meetCount === 1 ? 'meet' : 'meets') : (otherEvents.length === 1 ? 'event' : 'events')}
            active={filtersActive}
            onClear={clearFilters}
          >
            <label className="cal-field">
              <span>Year</span>
              <select className="select" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
                <option value="">All years</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            {tab === 'meets' && (
              <label className="cal-field cal-field--wide">
                <span>Country</span>
                <select className="select" value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}>
                  <option value="">All countries</option>
                  {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
          </FilterBar>
        </div>
      )}

      {/* ── Meets tab ── */}
      {tab === 'meets' && (
        <div>
          {/* Paradox of the Active User: every empty state names the next step */}
          {meetGroups.length === 0 && (meetsFailed ? (
            <Empty label="The calendar could not be loaded" hint="Check your connection and try again.">
              <button type="button" className="btn btn-secondary" onClick={loadMeets}>Try again</button>
            </Empty>
          ) : (
            <Empty
              label={filterCountry ? 'No meets on the calendar for this country' : filterYear ? `No meets on the calendar for ${filterYear}` : 'No meets on the calendar yet'}
              hint={isAdmin ? 'Add the next meet so swimmers can see what is coming.' : 'Upcoming meets appear here as soon as they are announced. Finished meets and their results are under Championships.'}
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {isAdmin && <button type="button" className="btn btn-secondary" onClick={() => setShowAddEvent(true)}>Add event</button>}
                {(filterYear || filterCountry) && (
                  <button type="button" className="btn btn-secondary" onClick={() => { setFilterYear(''); setFilterCountry('') }}>Show all years and countries</button>
                )}
                <Link className="btn btn-secondary" to="/championships">See meets and results</Link>
              </div>
            </Empty>
          ))}
          {/* One hierarchy (Similarity): section heading, then month band, then
              rows. Every row sits on the same column grid as the header above
              it (Proximity: a meet's facts stay beside its name). */}
          <div className="cal-list">
            {meetGroups.map((g, gi) => (
              <div key={g.key} className="cal-group">
                {g.section && (
                  <div className="cal-sect-head">
                    <h2>{g.section}</h2>
                  </div>
                )}
                {(g.section || gi === 0) && (
                  <div className="cal-grid cal-cols" aria-hidden="true">
                    <span>Date</span><span>Meet</span><span>Place</span><span>Dates</span><span>Pool and status</span><span />
                  </div>
                )}
                <h3 className="cal-month">{MONTHS_FULL[g.month]} {g.year}</h3>
                {g.items.map(({ kind, item, d }) => {
                  const status = statusOf(d, item.end_date)
                  if (kind === 'meet') {
                    const c = item
                    const isExpanded = expandedMeetId === c.id
                    const place = placeOf(c)
                    return (
                      <div key={`m-${c.id}`} className="cal-entry">
                        <div
                          className={`cal-grid cal-item row-link${isExpanded ? ' is-open' : ''}`}
                          onClick={() => setExpandedMeetId(isExpanded ? null : c.id)}
                          role="button" tabIndex={0} aria-expanded={isExpanded}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedMeetId(isExpanded ? null : c.id) } }}
                        >
                          <DateTile d={d} />
                          <div className="cal-name">{c.name}</div>
                          <div className="cal-meta">
                            <div className={`cal-cell${place ? '' : ' is-empty'}`}>{place || '—'}</div>
                            <div className="cal-cell asw-num">{formatDateRange(c.date, c.end_date)}</div>
                          </div>
                          <div className="cal-tags">
                            {c.pool && <span className="tag tag-neutral" title={poolTitle(c.pool)}>{poolShort(c.pool)}</span>}
                            {status && <span className={status.cls}>{status.label}</span>}
                          </div>
                          <span className="cal-chev"><Chevron /></span>
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
                    <div key={`ev-${ev.id}`} className="cal-entry">
                      <div
                        className={`cal-grid cal-item${ev.championship ? ' row-link' : ''}`}
                        onClick={() => { if (ev.championship) navigate(`/meets/${ev.championship}`) }}
                        role={ev.championship ? 'link' : undefined}
                        tabIndex={ev.championship ? 0 : undefined}
                        onKeyDown={ev.championship ? (e) => {
                          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); navigate(`/meets/${ev.championship}`) }
                        } : undefined}
                      >
                        <DateTile d={d} />
                        <div className="cal-name">{ev.title}</div>
                        <div className="cal-meta">
                          <div className={`cal-cell${ev.description ? '' : ' is-empty'}`}>{ev.description || '—'}</div>
                          <div className="cal-cell asw-num">{formatDateRange(ev.date, ev.end_date)}</div>
                        </div>
                        <div className="cal-tags">
                          <span className="tag tag-neutral">{ev.event_type}</span>
                          {status && <span className={status.cls}>{status.label}</span>}
                          {isAdmin && (
                            <button
                              className="btn btn-ghost"
                              onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev) }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                        <span className="cal-chev" aria-hidden="true">{ev.championship ? '→' : ''}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Birthdays tab ── */}
      {tab === 'birthdays' && <BirthdaysTab />}

      {/* ── Other events tab ── */}
      {tab === 'events' && (
        <div>
          {otherEvents.length === 0 && (
            <Empty label={filterYear ? `No other events for ${filterYear}` : 'No other events yet'} hint="Camps, clinics, deadlines and other dates that are not meets appear here.">
              {filterYear && <button type="button" className="btn btn-secondary" onClick={() => setFilterYear('')}>Show all years</button>}
            </Empty>
          )}
          {otherEvents.length > 0 && (
            <div className="cal-list">
              <div className="cal-grid cal-cols" aria-hidden="true">
                <span>Date</span><span>Event</span><span>Details</span><span>Dates</span><span>Status</span><span />
              </div>
              {/* same row grid as the Meets tab (Jakob's Law inside the page) */}
              {otherEvents.map(({ ev, d }) => {
                const status = statusOf(d, ev.end_date)
                return (
                  <div key={ev.id} className="cal-entry">
                    <div className="cal-grid cal-item">
                      <DateTile d={d} />
                      <div className="cal-name">{ev.title}</div>
                      <div className="cal-meta">
                        <div className={`cal-cell${ev.description ? '' : ' is-empty'}`}>{ev.description || '—'}</div>
                        <div className="cal-cell asw-num">
                          {ev.end_date && ev.end_date !== ev.date ? `${formatDate(ev.date)} to ${formatDate(ev.end_date)}` : formatDate(ev.date)}
                        </div>
                      </div>
                      <div className="cal-tags">
                        {ev.event_type && ev.event_type !== 'CUSTOM' && <span className="tag tag-outline">{ev.event_type}</span>}
                        {status && <span className={status.cls}>{status.label}</span>}
                        {isAdmin && (
                          <button className="btn btn-ghost" onClick={() => handleDeleteEvent(ev)}>Delete</button>
                        )}
                      </div>
                      <span className="cal-chev" aria-hidden="true" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Edit meet modal (admin) ── */}
      {isAdmin && editLinksMeet && (
        <MeetEditModal
          meet={editLinksMeet}
          countries={countries}
          onClose={() => setEditLinksMeet(null)}
          onSaved={() => {
            setEditLinksMeet(null)
            setNotice({ text: 'Meet saved.' })
            setExpandedMeetId(null)
            loadMeets()
            loadFeatured()
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
            <label htmlFor="cal-f15">Type</label>
            <select id="cal-f15" className="select" aria-label="Type" value={newEvent.event_type}
              onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })}>
              <option value="MEET">Meet / Championship</option>
              <option value="BIRTHDAY">Birthday</option>
              <option value="CUSTOM">Other event</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="cal-f16">{newEvent.event_type === 'MEET' ? 'Meet name *' : newEvent.event_type === 'BIRTHDAY' ? 'Name *' : 'Title *'}</label>
            <input id="cal-f16" className="input" type="text" required value={newEvent.title}
              aria-label={newEvent.event_type === 'MEET' ? 'Meet name' : newEvent.event_type === 'BIRTHDAY' ? 'Name' : 'Title'}
              onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
              placeholder={newEvent.event_type === 'MEET' ? 'e.g. Arab Swimming Championships 2026'
                : newEvent.event_type === 'BIRTHDAY' ? 'Who is celebrating?'
                : 'e.g. Team meeting, federation congress…'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label htmlFor="cal-f17">Start date *</label>
              <input id="cal-f17" className="input" aria-label="Start date" type="date" required value={newEvent.date}
                onChange={(e) => {
                  const d = e.target.value
                  const updates = { date: d }
                  if (newEvent.end_date && newEvent.end_date < d) updates.end_date = d
                  setNewEvent({ ...newEvent, ...updates })
                }} />
            </div>
            <div className="field">
              <label htmlFor="cal-f18">End date</label>
              <input id="cal-f18" className="input" aria-label="End date" type="date" value={newEvent.end_date} min={newEvent.date || undefined}
                onChange={(e) => setNewEvent({ ...newEvent, end_date: e.target.value })} />
            </div>
          </div>
          {newEvent.event_type === 'MEET' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label htmlFor="cal-f19">Country *</label>
                  <select id="cal-f19" className="select" aria-label="Country" required value={newEvent.country}
                    onChange={(e) => setNewEvent({ ...newEvent, country: e.target.value })}>
                    <option value="">Select country</option>
                    {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cal-f20">Pool</label>
                  <select id="cal-f20" className="select" aria-label="Pool" value={newEvent.pool}
                    onChange={(e) => setNewEvent({ ...newEvent, pool: e.target.value })}>
                    <option value="LCM">Long Course (50m)</option>
                    <option value="SCM">Short Course (25m)</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="cal-f21">Open / Age Group</label>
                <select id="cal-f21" className="select" aria-label="Open / Age Group" value={newEvent.meet_category}
                  onChange={(e) => setNewEvent({ ...newEvent, meet_category: e.target.value })}>
                  <option value="">Not set</option>
                  <option value="OPEN">Open</option>
                  <option value="AGE_GROUP">Age Group</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="cal-f22">Location</label>
                <input id="cal-f22" className="input" aria-label="Location" type="text" value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  placeholder="City / venue" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label htmlFor="cal-f24">Classification</label>
                  <select id="cal-f24" className="select" aria-label="Classification" value={newEvent.classification}
                    onChange={(e) => setNewEvent({ ...newEvent, classification: e.target.value, sub_classification: '' })}>
                    <option value="">Select classification</option>
                    {classifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cal-f25">Sub-classification</label>
                  <select id="cal-f25" className="select" aria-label="Sub-classification" value={newEvent.sub_classification}
                    disabled={!subClassifications.length}
                    onChange={(e) => setNewEvent({ ...newEvent, sub_classification: e.target.value })}>
                    <option value="">{!newEvent.classification ? 'Choose a classification first' : subClassifications.length ? 'Select sub-classification' : 'None for this classification'}</option>
                    {subClassifications.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
              </div>
              {PREDICTABLE.has(classifications.find((c) => String(c.id) === String(newEvent.classification))?.name) && (
                <div className="micro" style={{ color: 'var(--color-accent-800)' }}>
                  This meet will get automatic medal predictions on the Predictions page.
                </div>
              )}
            </>
          )}
          <div className="field">
            <label htmlFor="cal-f26">Description</label>
            <textarea id="cal-f26" className="input" aria-label="Description" rows={2} value={newEvent.description}
              onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
              placeholder="Optional details…" style={{ resize: 'vertical' }} />
          </div>
          {addError && <div role="alert" style={{ color: 'var(--asw-slow)', fontSize: 13 }}>{addError}</div>}
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddEvent(false)}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={addLoading || !newEvent.title.trim() || !newEvent.date || (newEvent.event_type === 'MEET' && !newEvent.country)}
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
