import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getQualifyingStandards, getQualifyingStandard,
  createQualifyingStandard, updateQualifyingStandard, deleteQualifyingStandard,
  uploadQualifyingPdf, addQualifyingTime, deleteQualifyingTime,
  saveQualifyingTimesBulk,
} from '../api/qualifyingTimes'
import { getEvents } from '../api/core'
import { PageHead, Loading, Empty, Seg, Modal } from '../components/ui'
import { formatDate, parseTime, poolLabel } from '../utils'
import { useAuth } from '../context/AuthContext'

const COMP_LABEL = {
  olympics: 'Olympic Games',
  world_championships: 'World Championships',
}

// Resolve any competition_type — including custom ones — to a display label
function compLabel(value) {
  if (!value) return 'Standard'
  return COMP_LABEL[value] || String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const STROKE_ORDER = { Freestyle: 0, Backstroke: 1, Breaststroke: 2, Butterfly: 3, 'Individual Medley': 4 }

const list = (d) => (Array.isArray(d) ? d : d?.results || [])
const POOLS = [{ value: 'LCM', label: poolLabel('LCM') }, { value: 'SCM', label: poolLabel('SCM') }]
const todayIso = () => new Date().toISOString().slice(0, 10)

// Goal-Gradient: where the qualifying window stands today, in plain words
function periodStatus(start, end) {
  if (!start || !end) return null
  const today = todayIso()
  const days = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)
  const n = (d) => `${d} day${d === 1 ? '' : 's'}`
  if (today < start) return { open: false, text: `Qualifying opens in ${n(days(today, start))}` }
  if (today > end) return { open: false, text: 'Qualifying period closed' }
  const left = days(today, end)
  return { open: true, text: left === 0 ? 'Qualifying closes today' : `Qualifying open · ${n(left)} left` }
}

// One row per event for a gender + pool, cut categories (A/B/C…) as columns
function buildRows(times, gender, pool) {
  const map = new Map()
  const cuts = new Set()
  ;(times || [])
    .filter((t) => t.gender === gender && t.pool === pool)
    .forEach((t) => {
      if (!map.has(t.event)) {
        map.set(t.event, {
          event: t.event,
          name: t.event_name,
          stroke: t.event_stroke,
          distance: t.event_distance,
          cuts: {},
        })
      }
      map.get(t.event).cuts[t.cut || 'A'] = t.formatted_time
      cuts.add(t.cut || 'A')
    })
  const rows = [...map.values()].sort((a, b) => {
    const sa = STROKE_ORDER[a.stroke] ?? 99
    const sb = STROKE_ORDER[b.stroke] ?? 99
    if (sa !== sb) return sa - sb
    return (a.distance || 0) - (b.distance || 0)
  })
  const byStroke = {}
  rows.forEach((r) => {
    const key = r.stroke || 'Events'
    if (!byStroke[key]) byStroke[key] = []
    byStroke[key].push(r)
  })
  return { byStroke, cutKeys: [...cuts].sort() }
}

function StandardTables({ times, gender, pool, stroke, isAdmin, onAddTimes, onDeleteTime }) {
  const { byStroke, cutKeys } = useMemo(() => buildRows(times, gender, pool), [times, gender, pool])

  if ((times || []).length === 0) {
    return (
      <Empty label="No times in this standard yet" hint={isAdmin ? 'Type the cut times for every event in one grid, or upload the federation PDF.' : 'The cut times appear here as soon as they are published.'}>
        {isAdmin && <button type="button" className="btn btn-primary" onClick={onAddTimes}>Add times</button>}
      </Empty>
    )
  }
  const allStrokes = Object.keys(byStroke)
  if (allStrokes.length === 0) {
    return <Empty label={`No times for ${gender === 'M' ? 'men' : 'women'} (${poolLabel(pool)}) yet`} hint="This standard has no cut for that group. Try the other pool or gender above." />
  }
  const strokes = stroke && byStroke[stroke] ? [stroke] : allStrokes

  // Proportional columns: the event takes about a third, the cuts share the
  // rest evenly, so every column is a short even step from the last.
  const eventShare = cutKeys.length <= 2 ? 34 : cutKeys.length === 3 ? 31 : 28
  const cutShare = (100 - eventShare) / cutKeys.length

  return (
    <div className="table-scroll qt-tablewrap">
      {/* Prägnanz: one table, fixed columns — the A and B times line up from one stroke to the next */}
      <table className="qt-table" style={cutKeys.length > 3 ? { minWidth: 150 + cutKeys.length * 88 } : undefined}>
        <colgroup>
          <col style={{ width: `${eventShare}%` }} />
          {cutKeys.map((c) => <col key={c} style={{ width: `${cutShare}%` }} />)}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Event</th>
            {cutKeys.map((c) => <th key={c} scope="col">{c}<span className="qt-th-long"> standard</span></th>)}
          </tr>
        </thead>
        {/* Common Region: each stroke is its own block under a tinted band */}
        {strokes.map((s) => (
          <tbody key={s}>
            <tr className="qt-group"><th colSpan={cutKeys.length + 1} scope="colgroup">{s}</th></tr>
            {byStroke[s].map((r) => (
              <tr key={r.event} className="qt-row">
                <th scope="row" className="qt-event">{r.name}</th>
                {cutKeys.map((c) => (
                  <td key={c}>
                    {r.cuts[c]
                      ? <span className="qt-time asw-time">{r.cuts[c]}</span>
                      : <span className="qt-time qt-time-none" aria-label="No time">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

function StandardModal({ standard, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: standard?.name || '',
    competition_type: standard?.competition_type || '',
    year: standard?.year || new Date().getFullYear(),
    qualifying_period_start: standard?.qualifying_period_start || '',
    qualifying_period_end: standard?.qualifying_period_end || '',
  })
  const [compDate, setCompDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // World Aquatics rule of thumb: the qualification window is ~16 months,
  // closing on the competition date. Entering just the competition date
  // fills both period fields (still editable afterwards).
  const applyCompDate = (v) => {
    setCompDate(v)
    if (!v) return
    const d = new Date(v + 'T00:00:00')
    const start = new Date(d)
    start.setMonth(start.getMonth() - 16)
    const iso = (x) => x.toISOString().slice(0, 10)
    setForm((f) => ({ ...f, qualifying_period_start: iso(start), qualifying_period_end: iso(d), year: f.year || d.getFullYear() }))
  }
  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name required'); return }
    if (!form.qualifying_period_start || !form.qualifying_period_end) {
      setError('Qualifying period required — enter the competition date or the period dates'); return
    }
    setSaving(true)
    setError('')
    try {
      // Postel's Law: stray spaces around the name are dropped
      const payload = { ...form, name: form.name.trim() }
      const res = standard?.id
        ? await updateQualifyingStandard(standard.id, payload)
        : await createQualifyingStandard(payload)
      onSaved(res?.data, !standard?.id)
    } catch (err) { setError(err.response?.data?.detail || 'Could not save the standard. Check the fields and try again.'); setSaving(false) }
  }
  return (
    <Modal title={standard?.id ? 'Edit Standard' : 'Create Standard'} onClose={onClose}>
      <form onSubmit={submit} className="qt-form">
        {error && <div className="error-box" role="alert">{error}</div>}
        <div className="field"><label>Name *</label><input className="input" aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
        <div className="qt-form-row">
          <div className="field"><label>Competition type</label><input className="input" aria-label="Competition type" value={form.competition_type} onChange={(e) => setForm({ ...form, competition_type: e.target.value })} placeholder="e.g. world_championships" list="qt-comp-types" />
            {/* Hick's Law: the two usual types are offered, anything else can still be typed */}
            <datalist id="qt-comp-types">{Object.entries(COMP_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</datalist>
          </div>
          <div className="field"><label>Year</label><input className="input" aria-label="Year" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
        </div>
        <div className="field">
          <label>Competition date</label>
          <input className="input" aria-label="Competition date" type="date" value={compDate} onChange={(e) => applyCompDate(e.target.value)} />
          <div className="qt-form-hint">
            Enter the meet date and the qualifying period is calculated automatically (16-month window ending on this date) — or set the period yourself below.
          </div>
        </div>
        <div className="qt-form-row">
          <div className="field"><label>Qualifying start *</label><input className="input" aria-label="Qualifying start" type="date" value={form.qualifying_period_start} onChange={(e) => setForm({ ...form, qualifying_period_start: e.target.value })} /></div>
          <div className="field"><label>Qualifying end *</label><input className="input" aria-label="Qualifying end" type="date" value={form.qualifying_period_end} onChange={(e) => setForm({ ...form, qualifying_period_end: e.target.value })} /></div>
        </div>
        <div className="qt-form-hint">
          Only swims inside this window count toward qualification in the federation Qualifying tab.
        </div>
        <div className="qt-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

function AddTimeModal({ standardId, onClose, onSaved }) {
  const [events, setEvents] = useState([])
  const [form, setForm] = useState({ event: '', gender: 'M', pool: 'LCM', cut: 'A', time: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { getEvents().then((r) => setEvents(Array.isArray(r.data) ? r.data : r.data?.results || [])).catch(() => {}) }, [])
  const submit = async (e) => {
    e.preventDefault()
    if (!form.event || !form.time.trim()) { setError('Event and time required'); return }
    const cs = parseTime(form.time.trim())
    if (!cs) { setError('Time must look like 27.45 or 1:02.34'); return }
    setSaving(true)
    setError('')
    try {
      await addQualifyingTime(standardId, { event: form.event, gender: form.gender, pool: form.pool, cut: form.cut.trim(), time_centiseconds: cs })
      onSaved()
    } catch (err) { setError(err.response?.data?.detail || err.response?.data?.error || 'Could not add the time. Try again.'); setSaving(false) }
  }
  return (
    <Modal title="Add Qualifying Time" onClose={onClose}>
      <form onSubmit={submit} className="qt-form">
        {error && <div className="error-box" role="alert">{error}</div>}
        <div className="field"><label>Event *</label>
          <select className="select" aria-label="Event" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })}>
            <option value="">Select event…</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </div>
        <div className="qt-form-row qt-form-row-4">
          <div className="field"><label>Gender</label>
            <select className="select" aria-label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="M">Men</option><option value="F">Women</option>
            </select>
          </div>
          <div className="field"><label>Pool</label>
            <select className="select" aria-label="Pool" value={form.pool} onChange={(e) => setForm({ ...form, pool: e.target.value })}>
              {POOLS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="field"><label>Cut</label><input className="input" aria-label="Cut" value={form.cut} onChange={(e) => setForm({ ...form, cut: e.target.value })} placeholder="A" /></div>
          <div className="field"><label>Time *</label><input className="input asw-num" aria-label="Time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="27.45" /></div>
        </div>
        <div className="qt-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add time'}</button>
        </div>
      </form>
    </Modal>
  )
}

/* Bulk builder: type times for every event, men + women, in one grid. */
function BulkTimesModal({ standard, onClose, onSaved }) {
  const [events, setEvents] = useState([])
  const [pool, setPool] = useState('LCM')
  const [cut, setCut] = useState('A')
  const [values, setValues] = useState({}) // `${eventId}-${gender}` -> time text
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getEvents().then((r) => {
      const evs = (Array.isArray(r.data) ? r.data : r.data?.results || [])
        .filter((e) => !e.is_relay)
        .sort((a, b) => {
          const sa = STROKE_ORDER[a.stroke] ?? 99
          const sb = STROKE_ORDER[b.stroke] ?? 99
          if (sa !== sb) return sa - sb
          return (a.distance || 0) - (b.distance || 0)
        })
      setEvents(evs)
    }).catch(() => {})
  }, [])

  // Prefill from existing times whenever pool/cut changes
  useEffect(() => {
    const next = {}
    ;(standard.times || []).forEach((t) => {
      if (t.pool === pool && (t.cut || 'A') === cut) {
        next[`${t.event}-${t.gender}`] = t.formatted_time
      }
    })
    setValues(next)
  }, [standard, pool, cut])

  const existing = useMemo(() => {
    const set = new Set()
    ;(standard.times || []).forEach((t) => {
      if (t.pool === pool && (t.cut || 'A') === cut) set.add(`${t.event}-${t.gender}`)
    })
    return set
  }, [standard, pool, cut])

  const submit = async () => {
    const rows = []
    for (const ev of events) {
      for (const g of ['M', 'F']) {
        const key = `${ev.id}-${g}`
        const text = (values[key] || '').trim()
        if (text) {
          const cs = parseTime(text)
          if (!cs) { setError(`Invalid time "${text}" for ${ev.name} (${g === 'M' ? 'Men' : 'Women'})`); return }
          rows.push({ event: ev.id, gender: g, cut, pool, time_centiseconds: cs })
        } else if (existing.has(key)) {
          rows.push({ event: ev.id, gender: g, cut, pool, time_centiseconds: null })
        }
      }
    }
    if (rows.length === 0) { setError('Nothing to save'); return }
    setSaving(true)
    setError('')
    try {
      const res = await saveQualifyingTimesBulk(standard.id, rows)
      if (res.data?.errors?.length) { setError(res.data.errors.join('; ')); setSaving(false); return }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <Modal title={`Times — ${standard.name}`} onClose={onClose} width={720}>
      <div className="qt-form">
        {error && <div className="error-box" role="alert">{error}</div>}
        {/* Proximity: what the grid is for (pool, cut) sits on one baseline above it */}
        <div className="qt-bulkbar">
          <div className="field">
            <label>Pool</label>
            <Seg options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]} value={pool} onChange={setPool} />
          </div>
          <div className="field qt-bulkbar-cut">
            <label htmlFor="qt-bulk-cut">Cut</label>
            <input id="qt-bulk-cut" className="input" value={cut} onChange={(e) => setCut(e.target.value.toUpperCase())} maxLength={2} />
          </div>
          <div className="qt-form-hint qt-bulkbar-hint">
            Type times like 27.45 or 1:02.34. Clear a cell to remove that time.
          </div>
        </div>
        <div className="table-scroll qt-bulkwrap">
          <table className="qt-table qt-bulktable">
            <colgroup><col style={{ width: '40%' }} /><col style={{ width: '30%' }} /><col style={{ width: '30%' }} /></colgroup>
            <thead>
              <tr><th scope="col">Event</th><th scope="col">Men</th><th scope="col">Women</th></tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="qt-row">
                  <th scope="row" className="qt-event">{ev.name}</th>
                  {['M', 'F'].map((g) => (
                    <td key={g}>
                      <input className="input asw-num" placeholder="—"
                        aria-label={`${ev.name} ${g === 'M' ? 'Men' : 'Women'}`}
                        value={values[`${ev.id}-${g}`] || ''}
                        onChange={(e) => setValues((v) => ({ ...v, [`${ev.id}-${g}`]: e.target.value }))} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="qt-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
            {saving ? 'Saving…' : 'Save all times'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function QualifyingTimes() {
  const [standards, setStandards] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [gender, setGender] = useState('M')
  const [pool, setPool] = useState('LCM')
  const [stroke, setStroke] = useState('') // '' = all strokes
  const { isAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [editModal, setEditModal] = useState(null) // null=closed, {}=create, standard=edit
  const [addTimeModal, setAddTimeModal] = useState(false)
  const [bulkModal, setBulkModal] = useState(null) // standard object or null
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [notice, setNotice] = useState(null) // { text, bad } — Peak-End Rule: confirm saves, explain failures

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])

  // Load the complete standards list (follow pagination if present)
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const all = []
        let page = 1
        // guard against runaway loops
        for (let i = 0; i < 20; i++) {
          const res = await getQualifyingStandards(page > 1 ? { page } : undefined)
          const d = res.data
          all.push(...list(d))
          if (d?.next) page += 1
          else break
        }
        if (!alive) return
        // Competitions read chronologically (Beijing 2026 → Budapest 2027 → LA 2028)
        all.sort((a, b) => (a.year || 0) - (b.year || 0) || String(a.name).localeCompare(String(b.name)))
        setStandards(all)
        // Keep the current selection across reloads (admin edits); only
        // fall back to the first standard when none is selected or it's gone.
        // Tesler's Law: with nothing chosen, open the competition people are
        // qualifying for now — the first whose window has not closed — instead
        // of the oldest one.
        const today = todayIso()
        const current = all.find((s) => !s.qualifying_period_end || s.qualifying_period_end >= today) || all[all.length - 1]
        if (all.length > 0) setSelectedId((cur) => (cur && all.some((s) => s.id === cur) ? cur : current.id))
      } catch {
        if (alive) setStandards([])
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [reloadKey])

  // Fetch the selected standard's times
  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let alive = true
    setDetailLoading(true)
    getQualifyingStandard(selectedId)
      .then((res) => alive && setDetail(res.data))
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setDetailLoading(false))
    return () => { alive = false }
  }, [selectedId, reloadKey])

  // Tesler's Law: only offer the pools / genders this standard actually has
  // times for, and never land on an empty combination when another has data.
  const pools = useMemo(() => POOLS.filter((p) => (detail?.times || []).some((t) => t.pool === p.value)), [detail])
  const genders = useMemo(() => ['M', 'F'].filter((g) => (detail?.times || []).some((t) => t.gender === g)), [detail])
  useEffect(() => {
    if (pools.length > 0 && !pools.some((p) => p.value === pool)) setPool(pools[0].value)
    if (genders.length > 0 && !genders.includes(gender)) setGender(genders[0])
  }, [pools, genders, pool, gender])
  const status = periodStatus(detail?.qualifying_period_start, detail?.qualifying_period_end)

  // Stroke filter options follow the gender + pool on screen
  const strokeOptions = useMemo(() => Object.keys(buildRows(detail?.times, gender, pool).byStroke), [detail, gender, pool])
  useEffect(() => {
    if (stroke && !strokeOptions.includes(stroke)) setStroke('')
  }, [strokeOptions, stroke])
  const cutNames = useMemo(() => [...new Set((detail?.times || []).map((t) => t.cut || 'A'))].sort(), [detail])

  if (loading) return <Loading label="Loading qualifying standards" />

  const hasTimes = (detail?.times || []).length > 0

  return (
    <div className="at-empty qt-page">
      <div className="qt-head">
        <PageHead title="Qualifying Times" sub="The time a swimmer must swim, inside the qualifying window, to earn a place at a championship.">
          {isAdmin && (
            <div className="qt-head-actions">
              <button className="btn btn-primary" onClick={() => setEditModal({})}>Create standard</button>
            </div>
          )}
        </PageHead>
      </div>

      {notice && (
        <div role={notice.bad ? 'alert' : 'status'} className={`rule-b qt-notice${notice.bad ? ' is-bad' : ''}`}>
          {notice.text}
        </div>
      )}

      {standards.length === 0 ? (
        <Empty
          label="No qualifying standards published yet"
          hint={isAdmin ? 'Create the first standard to publish its cut times here.' : 'Cut times appear here as soon as a federation publishes them for a championship.'}
        >
          {isAdmin
            ? <button type="button" className="btn btn-primary" onClick={() => setEditModal({})}>Create standard</button>
            : <Link to="/championships" className="btn btn-secondary">Browse championships</Link>}
        </Empty>
      ) : (
        <div className="qt-body">
          {/* Hick's Law: a few competitions are one tap each; a long list folds into one menu */}
          {standards.length > 1 && (
            <div className="field qt-picker">
              <label htmlFor={standards.length > 3 ? 'qt-standard' : undefined}>Competition</label>
              {standards.length <= 3 ? (
                <div className="qt-pick" role="group" aria-label="Competition">
                  {standards.map((s) => (
                    <button key={s.id} type="button" className={`qt-pick-opt${s.id === selectedId ? ' on' : ''}`}
                      aria-pressed={s.id === selectedId} onClick={() => setSelectedId(s.id)}>
                      {s.name}
                    </button>
                  ))}
                </div>
              ) : (
                <select id="qt-standard" className="select" value={selectedId || ''} onChange={(e) => setSelectedId(Number(e.target.value))}>
                  {standards.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
          )}

          {detailLoading ? (
            <Loading label="Loading standard" />
          ) : !detail ? (
            <Empty label="This standard could not be loaded" hint={standards.length > 1 ? 'Pick another competition above, or try again in a moment.' : 'Check your connection and try again in a moment.'}>
              <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
            </Empty>
          ) : (
            <>
              {/* Chunking: what the standard is, as labelled facts on one row */}
              <section className="qt-band" aria-label="Selected standard">
                <h2 className="qt-band-name">{detail.name}</h2>
                <dl className="qt-facts">
                  <div className="qt-fact"><dt>Competition</dt><dd>{compLabel(detail.competition_type)}</dd></div>
                  {detail.year ? <div className="qt-fact"><dt>Year</dt><dd className="asw-num">{detail.year}</dd></div> : null}
                  {pools.length > 0 && <div className="qt-fact"><dt>Pool</dt><dd>{pools.map((p) => p.label).join(' · ')}</dd></div>}
                  {cutNames.length > 0 && <div className="qt-fact"><dt>Standards</dt><dd>{cutNames.join(' · ')}</dd></div>}
                  {detail.qualifying_period_start && detail.qualifying_period_end && (
                    <div className="qt-fact qt-fact-wide">
                      <dt>Qualifying window</dt>
                      <dd className="asw-num">{formatDate(detail.qualifying_period_start)} – {formatDate(detail.qualifying_period_end)}</dd>
                    </div>
                  )}
                  {status && (
                    <div className="qt-fact qt-fact-wide">
                      <dt>Status</dt>
                      <dd><span className={`results-qt-status${status.open ? ' is-open' : ''}`}>{status.text}</span></dd>
                    </div>
                  )}
                </dl>
              </section>

              {isAdmin && (
                // Common Region: the admin tools are one ruled strip; the destructive one stands apart on the right
                <div className="qt-admin" role="group" aria-label="Manage standard">
                  <span className="qt-admin-label">Manage</span>
                  <button className="btn btn-secondary" onClick={() => setEditModal(detail)}>Edit standard</button>
                  <button className="btn btn-secondary" onClick={() => setBulkModal(detail)}>Edit all times</button>
                  <button className="btn btn-secondary" onClick={() => setAddTimeModal(true)}>Add time</button>
                  <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                    Upload PDF
                    <input type="file" accept=".pdf" className="sr-only" onChange={async (e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      setUploading(true)
                      try {
                        const fd = new FormData(); fd.append('file', f)
                        await uploadQualifyingPdf(selectedId, fd)
                        setReloadKey((k) => k + 1)
                        setNotice({ text: 'PDF uploaded.' })
                      } catch { setNotice({ text: 'Upload failed. Check the file is a PDF and try again.', bad: true }) }
                      setUploading(false)
                      e.target.value = ''
                    }} />
                  </label>
                  {uploading && <span className="micro" style={{ alignSelf: 'center' }}>Uploading…</span>}
                  <button className="btn qt-btn-danger"
                    onClick={async () => {
                      if (!window.confirm(`Delete "${detail.name}"? All qualifying times in it will be removed.`)) return
                      try {
                        await deleteQualifyingStandard(selectedId)
                      } catch { setNotice({ text: 'Could not delete the standard. Try again.', bad: true }); return }
                      setSelectedId(null)
                      setReloadKey((k) => k + 1)
                      setNotice({ text: 'Standard deleted.' })
                    }}>Delete standard</button>
                </div>
              )}

              {hasTimes && (
                <div className="qt-filters">
                  <div className="field">
                    <label>Gender</label>
                    <Seg
                      options={[{ value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
                      value={gender}
                      onChange={setGender}
                    />
                  </div>
                  {/* a standard published for one pool only needs no pool switch — the band names it */}
                  {pools.length > 1 && (
                    <div className="field">
                      <label>Pool</label>
                      <Seg options={pools} value={pool} onChange={setPool} />
                    </div>
                  )}
                  {/* Hick's Law: the stroke menu only appears when there are enough strokes to scan */}
                  {strokeOptions.length > 2 && (
                    <div className="field qt-filters-stroke">
                      <label htmlFor="qt-stroke">Stroke</label>
                      <select id="qt-stroke" className="select" value={stroke} onChange={(e) => setStroke(e.target.value)}>
                        <option value="">All strokes</option>
                        {strokeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <StandardTables times={detail.times || []} gender={gender} pool={pool} stroke={stroke} isAdmin={isAdmin}
                onAddTimes={() => setBulkModal(detail)}
                onDeleteTime={async (timeId) => {
                  await deleteQualifyingTime(selectedId, timeId)
                  setReloadKey((k) => k + 1)
                }} />
            </>
          )}
        </div>
      )}

      {editModal !== null && (
        <StandardModal standard={editModal.id ? editModal : null} onClose={() => setEditModal(null)}
          onSaved={(saved, isNew) => {
            setEditModal(null)
            setNotice({ text: 'Standard saved.' })
            setReloadKey((k) => k + 1)
            if (saved?.id) setSelectedId(saved.id)
            // fresh standard: jump straight into the times grid
            if (isNew && saved?.id) setBulkModal({ ...saved, times: [] })
          }} />
      )}
      {bulkModal && (
        <BulkTimesModal standard={bulkModal} onClose={() => setBulkModal(null)}
          onSaved={() => { setBulkModal(null); setNotice({ text: 'Times saved.' }); setReloadKey((k) => k + 1) }} />
      )}
      {addTimeModal && selectedId && (
        <AddTimeModal standardId={selectedId} onClose={() => setAddTimeModal(false)}
          onSaved={() => { setAddTimeModal(false); setNotice({ text: 'Time added.' }); setReloadKey((k) => k + 1) }} />
      )}
    </div>
  )
}
