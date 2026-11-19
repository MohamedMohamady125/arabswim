import { useEffect, useMemo, useRef, useState } from 'react'
import { getMeetProgram, setMeetProgram, uploadBulletin } from '../api/championships'
import { getEvents } from '../api/core'
import { formatDate } from '../utils'

const GENDER_LABEL = { M: 'Men', F: 'Women', X: 'Mixed' }
const SESSION_LABEL = { HEATS: 'Heats', SEMIS: 'Semifinals', FINALS: 'Finals' }
const TIME_OF_DAY_LABEL = { MORNING: 'Morning', EVENING: 'Evening' }
const ROUNDS = ['HEATS', 'SEMIS', 'FINALS']
const TIMES = ['MORNING', 'EVENING']
// When a meet runs both sessions, this is where each round normally sits
const USUAL_TIME = { HEATS: 'MORNING', SEMIS: 'EVENING', FINALS: 'EVENING' }
const TIME_RANK = { MORNING: 0, EVENING: 1, '': 2 }
const lineKey = (i) => `${i.event}-${i.gender}-${i.session || ''}-${i.time_of_day || ''}-${i.age_category || ''}`

/**
 * One event usually means several program lines: heats in the morning and the
 * final in the evening, for men and women, in more than one age category.
 * Returns every (round, time) pair the choices stand for:
 *   both times + rounds → each round at its usual time (heats morning, finals evening)
 *   one time            → every chosen round at that time
 *   no round            → one line per chosen time
 */
export function roundTimePairs(rounds, times) {
  const rs = rounds.length ? rounds : ['']
  if (times.length === 0) return rs.map((r) => [r, ''])
  if (times.length === 1) return rs.map((r) => [r, times[0]])
  return rs.flatMap((r) => (r ? [[r, USUAL_TIME[r]]] : TIMES.map((t) => ['', t])))
}

// Multi-choice chips (Heats + Finals, Morning + Evening)
function Chips({ label, options, labels, value, onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="progadd-group" role="group" aria-label={label}>
      <span className="progadd-label">{label}</span>
      <div className="progadd-chips">
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={value.includes(o)}
            className={`progadd-chip${value.includes(o) ? ' on' : ''}`} onClick={() => toggle(o)}>
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  )
}

// Shared editor UI: day tabs + add row + item list. Controlled via
// `days` ([{ day, date, items }]) and `patchDay(dayNo, items)`.
// `action` renders on the right of the add row (Save button in API
// mode, nothing in local mode).
function ProgramEditorCore({ days, patchDay, action, msg, setMsg, hint, top }) {
  const [events, setEvents] = useState([])
  const [activeDay, setActiveDay] = useState(1)
  const [eventId, setEventId] = useState('')
  const [gender, setGender] = useState('M')
  // Each of these takes SEVERAL values: one Add makes a line for every combination
  const [rounds, setRounds] = useState([])
  const [times, setTimes] = useState([])
  const [cats, setCats] = useState([])
  const [catDraft, setCatDraft] = useState('')

  useEffect(() => {
    getEvents().then((res) => setEvents(res.data || [])).catch(() => {})
  }, [])

  const day = days.find((d) => d.day === activeDay) || days[0]

  // Postel's Law: categories typed with commas, or still sitting in the box
  // when Add is pressed, all count
  const splitCats = (text) => text.split(/[,،;]+/).map((c) => c.trim()).filter(Boolean)
  const commitCats = (text = catDraft) => {
    const next = [...cats]
    splitCats(text).forEach((c) => { if (!next.some((x) => x.toLowerCase() === c.toLowerCase())) next.push(c.slice(0, 40)) })
    setCats(next); setCatDraft('')
    return next
  }

  // What one press of Add will create (also shown to the admin before pressing)
  const genders = gender === 'BOTH' ? ['M', 'F'] : [gender]
  const pairs = roundTimePairs(rounds, times)
  const pendingCats = [...cats, ...splitCats(catDraft).filter((c) => !cats.some((x) => x.toLowerCase() === c.toLowerCase()))]
  const lineCount = genders.length * pairs.length * Math.max(1, pendingCats.length)

  // lines stay grouped by session: morning first, then evening, then unset
  const sorted = (items) => items
    .map((it, i) => [it, i])
    .sort((a, b) => (TIME_RANK[a[0].time_of_day || ''] - TIME_RANK[b[0].time_of_day || '']) || (a[1] - b[1]))
    .map(([it]) => it)

  const addItem = () => {
    if (!eventId || !day) return
    const ev = events.find((e) => String(e.id) === String(eventId))
    if (!ev) return
    const catList = commitCats()
    const have = new Set(day.items.map(lineKey))
    const added = []
    for (const [session, timeOfDay] of pairs) {
      for (const cat of (catList.length ? catList : [''])) {
        for (const g of genders) {
          const line = {
            day: day.day, event: ev.id, event_name: ev.name, is_relay: ev.is_relay, gender: g,
            session, time_of_day: timeOfDay, age_category: cat,
          }
          if (have.has(lineKey(line))) continue
          have.add(lineKey(line))
          added.push(line)
        }
      }
    }
    if (added.length === 0) {
      setMsg('Already on this day')
      return
    }
    patchDay(day.day, sorted([...day.items, ...added]))
    setMsg(`Added ${added.length} line${added.length === 1 ? '' : 's'} to day ${day.day}. Press Save program when you are done.`)
  }

  const removeItem = (idx) => patchDay(day.day, day.items.filter((_, i) => i !== idx))

  // moving stays inside the line's own session (morning / evening)
  const moveItem = (idx, delta) => {
    const items = [...day.items]
    const j = idx + delta
    if (j < 0 || j >= items.length) return
    if ((items[idx].time_of_day || '') !== (items[j].time_of_day || '')) return
    ;[items[idx], items[j]] = [items[j], items[idx]]
    patchDay(day.day, items)
  }

  // categories already used in this meet, offered as one-tap suggestions
  const knownCats = useMemo(() => {
    const seen = new Map()
    days.forEach((d) => d.items.forEach((i) => { if (i.age_category) seen.set(i.age_category.toLowerCase(), i.age_category) }))
    return [...seen.values()].filter((c) => !cats.some((x) => x.toLowerCase() === c.toLowerCase()))
  }, [days, cats])

  // Events stay in the picker even when scheduled elsewhere (heats one
  // day, finals another; men one day, women another). Already-scheduled
  // combos for the CURRENT gender pick just get a marker so double-adds
  // are visible, and exact duplicates are still blocked in addItem.
  const usedByGender = useMemo(() => {
    const used = new Set()
    days.forEach((d) => d.items.forEach((i) => used.add(`${i.event}-${i.gender}`)))
    return used
  }, [days])

  const eventOptions = useMemo(() => {
    const wanted = gender === 'BOTH' ? ['M', 'F'] : [gender]
    return [...events]
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((e) => ({
        ...e,
        scheduled: wanted.every((g) => usedByGender.has(`${e.id}-${g}`)),
      }))
  }, [events, usedByGender, gender])

  const inputStyle = { padding: '8px 10px', border: '1px solid var(--color-neutral-300)', fontSize: 13, background: '#fff' }

  return (
    <div style={{ border: '1px solid var(--color-divider)', background: 'var(--color-surface)', padding: '16px 16px' }}>
      <div className="kicker" style={{ marginBottom: 4 }}>Day-by-day program</div>
      <div className="micro" style={{ marginBottom: 12, textTransform: 'none', letterSpacing: 0 }}>
        {hint || 'Days follow the meet dates — pick which events were swum on each day.'}
      </div>

      {/* day tabs come first: an uploaded file goes onto the day that is open */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {days.map((d) => {
          const active = day && d.day === day.day
          return (
            <button
              key={d.day}
              type="button"
              aria-pressed={!!active}
              onClick={() => { setActiveDay(d.day); setMsg('') }}
              style={{
                cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700,
                fontSize: 12, padding: '6px 12px', lineHeight: 1.2, textAlign: 'left',
                background: active ? 'var(--color-accent)' : '#fff',
                color: active ? '#fff' : 'var(--color-accent-800)',
                border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-neutral-300)'}`,
              }}
            >
              Day {d.day}
              <span style={{ display: 'block', fontWeight: 400, fontSize: 11, opacity: 0.8 }}>
                {formatDate(d.date)}
              </span>
              {d.items.length > 0 && (
                <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.8 }}> · {d.items.length} events</span>
              )}
            </button>
          )
        })}
      </div>

      {typeof top === 'function' ? top(day?.day || 1) : top}

      {/* add form — Chunking: what (event, gender), when (rounds, time of day), who (categories) */}
      <div className="progadd">
        <div className="progadd-row">
          <div className="progadd-group progadd-event">
            <label className="progadd-label" htmlFor="progadd-event">Event</label>
            <select id="progadd-event" style={inputStyle} value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">Choose event…</option>
              {eventOptions.map((e) => (
                <option key={e.id} value={e.id}>{e.name}{e.scheduled ? ' ✓ scheduled' : ''}</option>
              ))}
            </select>
          </div>
          <div className="progadd-group">
            <label className="progadd-label" htmlFor="progadd-gender">Gender</label>
            <select id="progadd-gender" style={inputStyle} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="M">Men</option>
              <option value="F">Women</option>
              <option value="BOTH">Men and Women</option>
              <option value="X">Mixed</option>
            </select>
          </div>
        </div>
        <div className="progadd-row">
          <Chips label="Rounds (choose one or more)" options={ROUNDS} labels={SESSION_LABEL} value={rounds} onChange={setRounds} />
          <Chips label="Time of day (choose one or both)" options={TIMES} labels={TIME_OF_DAY_LABEL} value={times} onChange={setTimes} />
        </div>
        <div className="progadd-group">
          <label className="progadd-label" htmlFor="progadd-cat">Age categories (optional — add as many as the event has)</label>
          <div className="progadd-cats">
            {cats.map((c) => (
              <span key={c} className="progadd-cat">
                {c}
                <button type="button" aria-label={`Remove ${c}`} onClick={() => setCats(cats.filter((x) => x !== c))}>×</button>
              </span>
            ))}
            <input id="progadd-cat" type="text" autoComplete="off" maxLength={80}
              value={catDraft}
              placeholder={cats.length ? 'Add another…' : 'e.g. Open, U14, 15-16 — press Enter after each'}
              onChange={(e) => (/[,،;]$/.test(e.target.value) ? commitCats(e.target.value) : setCatDraft(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitCats() }
                if (e.key === 'Backspace' && !catDraft && cats.length) setCats(cats.slice(0, -1))
              }}
              onBlur={() => commitCats()} />
          </div>
          {knownCats.length > 0 && (
            <div className="progadd-suggest">
              <span>Used in this meet:</span>
              {knownCats.map((c) => (
                <button key={c} type="button" className="progadd-chip" onClick={() => setCats([...cats, c])}>+ {c}</button>
              ))}
            </div>
          )}
        </div>
        <div className="progadd-foot">
          <button type="button" className="btn btn-secondary" onClick={addItem} disabled={!eventId} style={{ minHeight: 40 }}>
            Add to day {day?.day}
          </button>
          {/* Working Memory: say what the press will create before it is pressed */}
          {eventId && (
            <span className="progadd-preview" aria-live="polite">
              Adds {lineCount} line{lineCount === 1 ? '' : 's'}:{' '}
              {pairs.map(([r, t]) => [r && SESSION_LABEL[r], t && TIME_OF_DAY_LABEL[t].toLowerCase()].filter(Boolean).join(' in the ') || 'no round').join(', ')}
              {' · '}{genders.map((g) => GENDER_LABEL[g]).join(' and ')}
              {pendingCats.length ? ` · ${pendingCats.join(', ')}` : ''}
            </span>
          )}
          {action}
        </div>
      </div>
      {msg && <div className="micro" role="status" style={{ marginBottom: 8, textTransform: 'none', letterSpacing: 0 }}>{msg}</div>}

      {/* lines for the active day, as a table grouped by session */}
      {day && day.items.length > 0 ? (
        <div className="table-scroll">
          <table className="table progtable">
            <thead>
              <tr><th style={{ width: 28 }}>#</th><th>Event</th><th>Gender</th><th>Round</th><th>Category</th><th aria-label="Order and remove" /></tr>
            </thead>
            <tbody>
              {day.items.map((it, i) => {
                const t = it.time_of_day || ''
                const first = i === 0 || (day.items[i - 1].time_of_day || '') !== t
                const anyTime = day.items.some((x) => x.time_of_day)
                const up = i > 0 && (day.items[i - 1].time_of_day || '') === t
                const down = i < day.items.length - 1 && (day.items[i + 1].time_of_day || '') === t
                const btn = { border: 'none', background: 'none', cursor: 'pointer', padding: '0 4px', minWidth: 32, minHeight: 32 }
                return [
                  first && anyTime && (
                    <tr key={`h-${t}`} className="progtable-head">
                      <td colSpan={6}>{t ? `${TIME_OF_DAY_LABEL[t]} session` : 'No time of day set'}</td>
                    </tr>
                  ),
                  <tr key={lineKey(it)}>
                    <td className="asw-num" style={{ color: 'var(--color-neutral-700)' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{it.event_name}</td>
                    <td>{GENDER_LABEL[it.gender]}</td>
                    <td>{it.session ? SESSION_LABEL[it.session] : '—'}</td>
                    <td>{it.age_category || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => moveItem(i, -1)} disabled={!up} style={btn} aria-label="Move up" title="Move up">↑</button>
                      <button type="button" onClick={() => moveItem(i, 1)} disabled={!down} style={btn} aria-label="Move down" title="Move down">↓</button>
                      <button type="button" onClick={() => removeItem(i)} style={{ ...btn, color: 'var(--asw-slow)' }} aria-label={`Remove ${it.event_name}`} title="Remove">×</button>
                    </td>
                  </tr>,
                ]
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="micro" style={{ padding: '8px 0', textTransform: 'none', letterSpacing: 0 }}>
          No events on this day yet.
        </div>
      )}
    </div>
  )
}

// Flatten [{ day, items }] into the API payload shape (order = index in day)
export const flattenProgramDays = (days) => days.flatMap((d) => d.items.map((it, i) => ({
  day: d.day, event: it.event, gender: it.gender, order: i,
  session: it.session || '', time_of_day: it.time_of_day || '', age_category: it.age_category || '',
})))

// API-backed editor for an existing meet. Used in manual meet creation,
// the calendar add-meet modal, the import wizard's Done step and the
// meet page's Program tab.
export default function MeetProgramEditor({ champId, onSaved }) {
  const [days, setDays] = useState([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    if (!champId) return
    setDirty(false)
    setMsg('')
    setLoadFailed(false)
    getMeetProgram(champId)
      .then((res) => setDays(res.data?.days || []))
      .catch(() => { setDays([]); setLoadFailed(true) })
  }, [champId])

  const patchDay = (dayNo, items) => {
    setDays((prev) => prev.map((d) => (d.day === dayNo ? { ...d, items } : d)))
    setDirty(true)
    setMsg('')
  }

  const save = async () => {
    setBusy(true)
    setMsg('')
    try {
      const res = await setMeetProgram(champId, flattenProgramDays(days))
      setDays(res.data?.days || days)
      setDirty(false)
      setMsg('Program saved')
      onSaved?.()
    } catch {
      setMsg('Failed to save program')
    } finally {
      setBusy(false)
    }
  }

  // Tesler's Law: a meet program PDF already lists every event with its
  // category, round and time — read it instead of making the admin retype it.
  const fileRef = useRef(null)
  const [reading, setReading] = useState(false)
  const uploadDay = useRef(1)
  const readFile = async (file) => {
    if (!file) return
    setReading(true)
    setMsg('')
    try {
      // lines typed but not saved yet are kept: save them first
      if (dirty) await setMeetProgram(champId, flattenProgramDays(days))
      const fd = new FormData()
      fd.append('file', file)
      fd.append('day', uploadDay.current)
      const up = (await uploadBulletin(champId, fd)).data
      const res = await getMeetProgram(champId)
      setDays(res.data?.days || [])
      setDirty(false)
      onSaved?.()
      if (!up.items_detected) {
        setMsg('No events could be read from this file. Add the events below instead.')
      } else {
        const skipped = up.items_detected - (up.items_matched ?? up.items_detected)
        setMsg(`Read ${up.items_detected} events from the file: ${up.program_items_created} added`
          + `${skipped > 0 ? `, ${skipped} skipped (event not known to the site)` : ''}. `
          + `They are on day ${(up.days || []).join(', ') || uploadDay.current}. Upload each day's file with that day open.`)
      }
    } catch (err) {
      setMsg(err?.response?.data?.error || 'The file could not be read. Check it is the program PDF and try again.')
    } finally {
      setReading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // a failed load says so instead of leaving a blank space
  if (champId && loadFailed) {
    return <div className="micro" role="status" style={{ textTransform: 'none', letterSpacing: 0 }}>The program could not be loaded. Reload the page to try again.</div>
  }
  if (!champId || days.length === 0) return null

  return (
    <ProgramEditorCore
      days={days}
      patchDay={patchDay}
      msg={msg}
      setMsg={setMsg}
      top={(activeDay) => (
        <div className="progupload">
          <div>
            <strong>Have day {activeDay}'s program as a PDF?</strong>
            <span> Upload the HY-TEK meet program or start list and every event in it is added to day {activeDay} with its category, round and session.</span>
          </div>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => readFile(e.target.files?.[0])} />
          <button type="button" className="btn btn-primary" disabled={reading}
            onClick={() => { uploadDay.current = activeDay; fileRef.current?.click() }} style={{ minHeight: 40, flex: 'none' }}>
            {reading ? 'Reading the file…' : `Upload PDF for day ${activeDay}`}
          </button>
        </div>
      )}
      action={(
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty} style={{ marginLeft: 'auto' }}>
          {busy ? 'Saving…' : 'Save program'}
        </button>
      )}
    />
  )
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Local (pre-import) editor: the meet doesn't exist yet, so days come
// from the given start/end dates and the picked items live in parent
// state (`items` + `onChange`). The wizard saves them to the API right
// after the meet is created on confirm.
export function LocalProgramEditor({ startDate, endDate, items, onChange, hint }) {
  const days = useMemo(() => {
    if (!startDate) return []
    let n = 1
    if (endDate && endDate >= startDate) {
      n = Math.min(Math.floor((new Date(endDate) - new Date(startDate)) / 86400000) + 1, 30)
    }
    n = Math.max(n, ...items.map((it) => it.day), 1)
    return Array.from({ length: n }, (_, i) => ({
      day: i + 1,
      date: addDays(startDate, i),
      items: items.filter((it) => it.day === i + 1),
    }))
  }, [startDate, endDate, items])

  const [msg, setMsg] = useState('')

  const patchDay = (dayNo, dayItems) => {
    setMsg('')
    onChange([
      ...items.filter((it) => it.day !== dayNo),
      ...dayItems.map((it) => ({ ...it, day: dayNo })),
    ])
  }

  if (!startDate) return null

  return (
    <ProgramEditorCore
      days={days}
      patchDay={patchDay}
      msg={msg}
      setMsg={setMsg}
      hint={hint || 'Days follow the meet dates above — pick which events run on each day. The program is saved automatically when you confirm the import.'}
    />
  )
}
