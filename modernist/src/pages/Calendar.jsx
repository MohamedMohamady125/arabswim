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
    <div style={{ display: 'flex', gap: 2, background: 'var(--color-divider)', border: '1px solid var(--color-divider)', marginTop: 14, maxWidth: 420 }}>
      {cells.map(([v, l]) => (
        <div key={l} style={{ flex: 1, background: 'var(--color-bg)', padding: '8px 10px' }}>
          <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>{v}</div>
          <div className="micro" style={{ fontSize: 11 }}>{l}</div>
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

const LINK_STYLE = { flex: '1 1 140px', textAlign: 'center' }

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
            <label htmlFor="cal-f8">Category</label>
            <select id="cal-f8" className="select" aria-label="Category" value={form.classification_category}
              onChange={(e) => setForm({ ...form, classification_category: e.target.value, classification: '', sub_classification: '' })}>
              <option value="">Select category</option>
              {classCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cal-f9">Classification</label>
            <select id="cal-f9" className="select" aria-label="Classification" value={form.classification}
              onChange={(e) => setForm({ ...form, classification: e.target.value, sub_classification: '' })}>
              <option value="">Select classification</option>
              {classifications
                .filter((c) => !form.classification_category || String(c.category) === String(form.classification_category))
                .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        {subClassifications.length > 0 && (
          <div className="field">
            <label htmlFor="cal-f10">Sub-classification</label>
            <select id="cal-f10" className="select" aria-label="Sub-classification" value={form.sub_classification} onChange={set('sub_classification')}>
              <option value="">None</option>
              {subClassifications.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
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
          <label>Meet photo{meet.meet_photo ? ' (uploaded, choose a file to replace)' : ''}</label>
          <CropUpload kind="meet" onChange={setPhotoFile} />
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
    <div className="cal-row" style={{ padding: '16px 32px 20px', background: 'var(--color-surface)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: showAny || isAdmin ? 16 : 0 }}>
        <div>
          <div className="micro" style={{ marginBottom: 3 }}>Country</div>
          <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            {c.country_detail ? (<><Flag code={c.country_detail.code} name={c.country_detail.name} />{c.country_detail.name}</>) : '—'}
          </div>
        </div>
        <div>
          <div className="micro" style={{ marginBottom: 3 }}>Pool</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{c.pool === 'SCM' ? 'Short Course (25m)' : 'Long Course (50m)'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
          <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => onEditLinks(c)}>Edit meet</button>
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
    <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 32 }}>
      <Link to={`/swimmers/${b.id}`} style={{ padding: '8px 0', color: 'inherit', textDecoration: 'none', fontSize: 13, flex: 1, minWidth: 0 }}>{b.name}</Link>
      <span style={{ fontSize: 12, color: 'var(--color-neutral-700)', flex: 'none' }}>
        {b.nationality}{b.age > 0 ? ` · ${b.age}` : ''}
      </span>
    </div>
  )
  const dayBlock = (day) => {
    const arr = byDay.get(day)
    return (
      <div key={day} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
        <div style={{ width: 40, flex: 'none', textAlign: 'center' }}>
          <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, lineHeight: 1.1, color: 'var(--color-accent)' }}>{day}</div>
          <div className="micro" style={{ fontSize: 11 }}>{day === now.getDate() ? 'Today' : MONTH_SHORT[now.getMonth()]}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
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
    <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 380px' }}>
      <div className="rule-r">
        <div className="rule-b pad">
          <SectHead title="Birthdays Today" />
          {today.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 13 }}>No birthdays today.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {/* Miller's Law: a dozen names up front, the rest on request */}
              {today.slice(0, 12).map(todayChip)}
              {today.length > 12 && <ShowMore label={`${today.length - 12} more today`}>{today.slice(12).map(todayChip)}</ShowMore>}
            </div>
          )}
        </div>
        <div className="pad">
          <SectHead title="Next 7 Days" />
          {upcoming.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 13 }}>No birthdays in the coming week.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {upcoming.slice(0, 12).map(weekChip)}
              {upcoming.length > 12 && <ShowMore label={`${upcoming.length - 12} more this week`}>{upcoming.slice(12).map(weekChip)}</ShowMore>}
            </div>
          )}
        </div>
      </div>
      <div className="pad">
        <SectHead title={`All Birthdays · ${MONTHS_FULL[now.getMonth()]}`} />
        {thisMonth.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 13 }}>No birthdays this month.</div>
        ) : (
          <>
            {/* Chunking: one block per day, in date order, starting today;
                days already gone wait behind "Earlier this month" */}
            <div className="micro" style={{ marginBottom: 12, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
              <span className="asw-num">{thisMonth.length}</span> swimmers · from today to the end of the month
            </div>
            {daysAhead.length === 0 && <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>No more birthdays this month.</div>}
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

  return (
    <div>
      {/* phone: let the filter row wrap instead of clipping, and match the 16px page gutter on list rows */}
      <style>{`
        @media (max-width: 900px) {
          .records-filters.cal-filters { flex-wrap: wrap !important; overflow-x: visible; }
          .cal-row { padding-left: 16px !important; padding-right: 16px !important; }
        }
      `}</style>
      <PageHead title="Calendar">
        {isAdmin && (
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => setShowAddEvent(true)}>Add event</button>
          </div>
        )}
      </PageHead>

      {notice && (
        <div role={notice.bad ? 'alert' : 'status'} className="rule-b cal-row" style={{ padding: '10px 32px', fontSize: 13, fontWeight: 700, color: notice.bad ? 'var(--asw-slow)' : 'var(--asw-fast)' }}>
          {notice.text}
        </div>
      )}

      {/* featured next meet + countdown */}
      {featured && (
        <div className="rule-b" style={{ display: 'flex', flexWrap: 'wrap' }}>
          {featured.item.meet_photo && (
            <div className="hide-mobile" style={{ width: 300, flex: 'none', borderRight: '2px solid var(--color-divider)', background: 'var(--color-accent-800)' }}>
              <Pic kind="meet" w={320}
                src={featured.item.meet_photo}
                alt={featured.item.name || featured.item.title}
                className="grayscale"
                style={{ width: '100%', height: '100%', minHeight: 160 }}
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
              {featured.kind === 'meet' && featured.item.pool ? ` · ${featured.item.pool === 'LCM' ? '50m pool' : featured.item.pool === 'SCM' ? '25m pool' : featured.item.pool}` : ''}
              {featured.kind === 'event' && featured.item.description ? ` · ${featured.item.description}` : ''}
            </div>
            {isUpcomingFeatured && <Countdown target={featured.d.getTime()} />}
          </div>
        </div>
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
        <div className="meets-fb">
          <FilterBar
            count={tab === 'meets' ? (meetsFailed ? null : meetCount) : otherEvents.length}
            noun={tab === 'meets' ? (meetCount === 1 ? 'meet' : 'meets') : (otherEvents.length === 1 ? 'event' : 'events')}
            active={filtersActive}
            onClear={clearFilters}
          >
            <select className="select" aria-label="Year" style={{ width: 130 }} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
              <option value="">All years</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {tab === 'meets' && (
              <select className="select" aria-label="Country" style={{ width: 190 }} value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}>
                <option value="">All countries</option>
                {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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
          {meetGroups.map((g) => (
            <div key={g.key} className="rule-b">
              {g.section && (
                <div className="pad" style={{ paddingBottom: 0 }}>
                  <h2 className="kicker" style={{ margin: 0 }}>{g.section} <span className="asw-num" style={{ marginLeft: 6 }}>{g.sectionCount}</span></h2>
                </div>
              )}
              <div className="pad" style={{ paddingBottom: 10, display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <div style={{ background: 'var(--color-accent)', color: '#ffffff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 16px', display: 'inline-block' }}>
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
                        className="cal-row row-link"
                        onClick={() => setExpandedMeetId(isExpanded ? null : c.id)}
                        role="button" tabIndex={0} aria-expanded={isExpanded}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedMeetId(isExpanded ? null : c.id) } }}
                        style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 32px', background: isExpanded ? 'var(--color-surface)' : undefined }}
                      >
                        {/* mini calendar tile: navy month strip over the day */}
                        <div style={{ width: 46, flex: 'none', textAlign: 'center', border: '1px solid var(--color-divider)', background: 'var(--color-bg)', overflow: 'hidden' }}>
                          <div style={{ background: 'var(--color-accent)', color: '#ffffff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 11, letterSpacing: '0.08em', padding: '4px 0 2px' }}>{MONTH_SHORT[d.getMonth()]}</div>
                          <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, lineHeight: 1, color: 'var(--color-accent)', padding: '4px 0 6px' }}>{d.getDate()}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{c.name}</span>
                          <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
                            {c.location}
                            {c.country_detail ? `${c.location ? ', ' : ''}${c.country_detail.name}` : ''}
                            {' · '}{formatDateRange(c.date, c.end_date)}
                          </div>
                        </div>
                        {c.pool && <span className="tag tag-neutral hide-mobile" title={c.pool === 'LCM' ? 'Long course (50m pool)' : c.pool === 'SCM' ? 'Short course (25m pool)' : undefined}>{c.pool === 'LCM' ? '50m' : c.pool === 'SCM' ? '25m' : c.pool}</span>}
                        <span className="micro" aria-hidden="true" style={{ fontSize: 11, width: 12, textAlign: 'center' }}>{isExpanded ? '▴' : '▾'}</span>
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
                    className={`cal-row ${ev.championship ? 'row-link ' : ''}${i < g.items.length - 1 ? 'hair-b' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 32px' }}
                    onClick={() => { if (ev.championship) navigate(`/meets/${ev.championship}`) }}
                    role={ev.championship ? 'link' : undefined}
                    tabIndex={ev.championship ? 0 : undefined}
                    onKeyDown={ev.championship ? (e) => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); navigate(`/meets/${ev.championship}`) }
                    } : undefined}
                  >
                    <div style={{ width: 46, flex: 'none', textAlign: 'center', border: '1px solid var(--color-divider)', background: 'var(--color-bg)', overflow: 'hidden' }}>
                      <div style={{ background: 'var(--color-accent)', color: '#ffffff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 11, letterSpacing: '0.08em', padding: '4px 0 2px' }}>{MONTH_SHORT[d.getMonth()]}</div>
                      <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, lineHeight: 1, color: 'var(--color-accent)', padding: '4px 0 6px' }}>{d.getDate()}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{ev.title}</span>
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
          {otherEvents.length === 0 && (
            <Empty label={filterYear ? `No other events for ${filterYear}` : 'No other events yet'} hint="Camps, clinics, deadlines and other dates that are not meets appear here.">
              {filterYear && <button type="button" className="btn btn-secondary" onClick={() => setFilterYear('')}>Show all years</button>}
            </Empty>
          )}
          {otherEvents.map(({ ev, d }, i) => (
            <div
              key={ev.id}
              className={`cal-row ${i < otherEvents.length - 1 ? 'hair-b' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 32px' }}
            >
              <div style={{ width: 46, flex: 'none', textAlign: 'center', border: '1px solid var(--color-divider)', background: 'var(--color-bg)', overflow: 'hidden' }}>
                <div style={{ background: 'var(--color-accent)', color: '#ffffff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 8.5, letterSpacing: '0.08em', padding: '4px 0 2px' }}>{MONTH_SHORT[d.getMonth()]} {String(d.getFullYear()).slice(2)}</div>
                <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, lineHeight: 1, color: 'var(--color-accent)', padding: '4px 0 6px' }}>{d.getDate()}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{ev.title}</span>
                  {ev.event_type && ev.event_type !== 'CUSTOM' && <span className="tag tag-outline">{ev.event_type}</span>}
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
                  <label htmlFor="cal-f23">Category</label>
                  <select id="cal-f23" className="select" aria-label="Category" value={newEvent.classification_category}
                    onChange={(e) => setNewEvent({ ...newEvent, classification_category: e.target.value, classification: '', sub_classification: '' })}>
                    <option value="">Select category</option>
                    {classCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cal-f24">Classification</label>
                  <select id="cal-f24" className="select" aria-label="Classification" value={newEvent.classification}
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
                  <label htmlFor="cal-f25">Sub-classification</label>
                  <select id="cal-f25" className="select" aria-label="Sub-classification" value={newEvent.sub_classification}
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
