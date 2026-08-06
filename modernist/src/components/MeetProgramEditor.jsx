import { useEffect, useMemo, useState } from 'react'
import { getMeetProgram, setMeetProgram } from '../api/championships'
import { getEvents } from '../api/core'
import { formatDate } from '../utils'

const GENDER_LABEL = { M: 'Men', F: 'Women', X: 'Mixed' }
const SESSION_LABEL = { HEATS: 'Heats', SEMIS: 'Semifinals', FINALS: 'Finals' }

// Shared editor UI: day tabs + add row + item list. Controlled via
// `days` ([{ day, date, items }]) and `patchDay(dayNo, items)`.
// `action` renders on the right of the add row (Save button in API
// mode, nothing in local mode).
function ProgramEditorCore({ days, patchDay, action, msg, setMsg, hint }) {
  const [events, setEvents] = useState([])
  const [activeDay, setActiveDay] = useState(1)
  const [eventId, setEventId] = useState('')
  const [gender, setGender] = useState('M')
  const [session, setSession] = useState('')
  const [ageCat, setAgeCat] = useState('')

  useEffect(() => {
    getEvents().then((res) => setEvents(res.data || [])).catch(() => {})
  }, [])

  const day = days.find((d) => d.day === activeDay) || days[0]

  const addItem = () => {
    if (!eventId || !day) return
    const ev = events.find((e) => String(e.id) === String(eventId))
    if (!ev) return
    const cat = ageCat.trim()
    // "Both" schedules the event for men and women in one click
    const genders = gender === 'BOTH' ? ['M', 'F'] : [gender]
    const added = []
    for (const g of genders) {
      if (day.items.some((i) => String(i.event) === String(eventId) && i.gender === g
        && (i.session || '') === session && (i.age_category || '') === cat)) continue
      added.push({
        day: day.day, event: ev.id, event_name: ev.name, is_relay: ev.is_relay, gender: g,
        session, age_category: cat,
      })
    }
    if (added.length === 0) {
      setMsg('Already on this day')
      return
    }
    patchDay(day.day, [...day.items, ...added])
  }

  const removeItem = (idx) => patchDay(day.day, day.items.filter((_, i) => i !== idx))

  const moveItem = (idx, delta) => {
    const items = [...day.items]
    const j = idx + delta
    if (j < 0 || j >= items.length) return
    ;[items[idx], items[j]] = [items[j], items[idx]]
    patchDay(day.day, items)
  }

  // Events already scheduled on ANY day (per gender) drop out of the picker,
  // so the same event can't be added twice across days by mistake.
  const usedByGender = useMemo(() => {
    const used = new Set()
    days.forEach((d) => d.items.forEach((i) => used.add(`${i.event}-${i.gender}`)))
    return used
  }, [days])

  const eventOptions = useMemo(() => {
    const wanted = gender === 'BOTH' ? ['M', 'F'] : [gender]
    return [...events]
      .filter((e) => wanted.some((g) => !usedByGender.has(`${e.id}-${g}`)))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  }, [events, usedByGender, gender])

  // Keep the selection valid when the picked event drops out of the list
  useEffect(() => {
    if (eventId && !eventOptions.some((e) => String(e.id) === String(eventId))) setEventId('')
  }, [eventOptions, eventId])

  const inputStyle = { padding: '7px 10px', border: '1px solid var(--color-neutral-300)', fontSize: 13, background: '#fff' }

  return (
    <div style={{ border: '1px solid var(--color-divider)', background: 'var(--color-surface)', padding: '14px 16px' }}>
      <div className="kicker" style={{ marginBottom: 4 }}>Day-by-day program</div>
      <div className="micro" style={{ marginBottom: 12, textTransform: 'none', letterSpacing: 0 }}>
        {hint || 'Days follow the meet dates — pick which events were swum on each day.'}
      </div>

      {/* day tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {days.map((d) => {
          const active = day && d.day === day.day
          return (
            <button
              key={d.day}
              type="button"
              onClick={() => { setActiveDay(d.day); setMsg('') }}
              style={{
                cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700,
                fontSize: 12, padding: '6px 11px', lineHeight: 1.2, textAlign: 'left',
                background: active ? 'var(--color-accent)' : '#fff',
                color: active ? '#fff' : 'var(--color-accent-800)',
                border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-neutral-300)'}`,
              }}
            >
              Day {d.day}
              <span style={{ display: 'block', fontWeight: 400, fontSize: 10, opacity: 0.8 }}>
                {formatDate(d.date)}
              </span>
              {d.items.length > 0 && (
                <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.8 }}> · {d.items.length} events</span>
              )}
            </button>
          )
        })}
      </div>

      {/* add row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select style={inputStyle} value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">Event…</option>
          {eventOptions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select style={inputStyle} value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="M">Men</option>
          <option value="F">Women</option>
          <option value="BOTH">Both (Men & Women)</option>
          <option value="X">Mixed</option>
        </select>
        <select style={inputStyle} value={session} onChange={(e) => setSession(e.target.value)}>
          <option value="">Session…</option>
          <option value="HEATS">Heats</option>
          <option value="SEMIS">Semifinals</option>
          <option value="FINALS">Finals</option>
        </select>
        <input
          style={{ ...inputStyle, width: 110 }}
          value={ageCat}
          onChange={(e) => setAgeCat(e.target.value)}
          placeholder="Age cat. (opt.)"
          maxLength={40}
        />
        <button type="button" className="btn btn-secondary" onClick={addItem} disabled={!eventId}>
          Add to day {day?.day}
        </button>
        {action}
      </div>
      {msg && <div className="micro" style={{ marginBottom: 8, textTransform: 'none', letterSpacing: 0 }}>{msg}</div>}

      {/* items for the active day */}
      {day && day.items.length > 0 ? (
        <div>
          {day.items.map((it, i) => (
            <div
              key={`${it.event}-${it.gender}-${it.session || ''}-${it.age_category || ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderBottom: '1px solid var(--color-divider)', fontSize: 13, background: '#fff' }}
            >
              <span className="asw-num" style={{ width: 22, color: 'var(--color-neutral-400)', flex: 'none' }}>{i + 1}</span>
              <span style={{ fontWeight: 600 }}>{it.event_name}</span>
              <span className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{GENDER_LABEL[it.gender]}</span>
              {it.session && <span className="tag tag-neutral" style={{ flex: 'none' }}>{SESSION_LABEL[it.session]}</span>}
              {it.age_category && <span className="tag tag-neutral" style={{ flex: 'none' }}>{it.age_category}</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 4px' }} aria-label="Move up">↑</button>
                <button type="button" onClick={() => moveItem(i, 1)} disabled={i === day.items.length - 1} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 4px' }} aria-label="Move down">↓</button>
                <button type="button" onClick={() => removeItem(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 4px', color: 'var(--asw-slow)' }} aria-label="Remove">×</button>
              </span>
            </div>
          ))}
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
  session: it.session || '', age_category: it.age_category || '',
})))

// API-backed editor for an existing meet. Used in manual meet creation,
// the calendar add-meet modal, the import wizard's Done step and the
// meet page's Program tab.
export default function MeetProgramEditor({ champId, onSaved }) {
  const [days, setDays] = useState([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!champId) return
    setDirty(false)
    setMsg('')
    getMeetProgram(champId)
      .then((res) => setDays(res.data?.days || []))
      .catch(() => setDays([]))
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

  if (!champId || days.length === 0) return null

  return (
    <ProgramEditorCore
      days={days}
      patchDay={patchDay}
      msg={msg}
      setMsg={setMsg}
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
