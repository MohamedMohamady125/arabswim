import { useEffect, useMemo, useState } from 'react'
import { getMeetProgram, setMeetProgram } from '../api/championships'
import { getEvents } from '../api/core'
import { formatDate } from '../utils'

const GENDER_LABEL = { M: 'Men', F: 'Women', X: 'Mixed' }

// Admin editor for a meet's day-by-day program. Days come from the meet's
// start/end dates (Day 1 = start date); per day the admin picks which
// events were swum. Used in manual meet creation, the import wizard and
// the meet page's Program tab.
export default function MeetProgramEditor({ champId, onSaved }) {
  const [days, setDays] = useState([])
  const [events, setEvents] = useState([])
  const [activeDay, setActiveDay] = useState(1)
  const [eventId, setEventId] = useState('')
  const [gender, setGender] = useState('M')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    getEvents().then((res) => setEvents(res.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!champId) return
    setDirty(false)
    setMsg('')
    setActiveDay(1)
    getMeetProgram(champId)
      .then((res) => setDays(res.data?.days || []))
      .catch(() => setDays([]))
  }, [champId])

  const day = days.find((d) => d.day === activeDay) || days[0]

  const patchDay = (dayNo, items) => {
    setDays((prev) => prev.map((d) => (d.day === dayNo ? { ...d, items } : d)))
    setDirty(true)
    setMsg('')
  }

  const addItem = () => {
    if (!eventId || !day) return
    const ev = events.find((e) => String(e.id) === String(eventId))
    if (!ev) return
    if (day.items.some((i) => String(i.event) === String(eventId) && i.gender === gender)) {
      setMsg('Already on this day')
      return
    }
    patchDay(day.day, [...day.items, {
      day: day.day, event: ev.id, event_name: ev.name, is_relay: ev.is_relay, gender,
    }])
  }

  const removeItem = (idx) => patchDay(day.day, day.items.filter((_, i) => i !== idx))

  const moveItem = (idx, delta) => {
    const items = [...day.items]
    const j = idx + delta
    if (j < 0 || j >= items.length) return
    ;[items[idx], items[j]] = [items[j], items[idx]]
    patchDay(day.day, items)
  }

  const save = async () => {
    setBusy(true)
    setMsg('')
    try {
      const items = days.flatMap((d) => d.items.map((it, i) => ({
        day: d.day, event: it.event, gender: it.gender, order: i,
      })))
      const res = await setMeetProgram(champId, items)
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

  const eventOptions = useMemo(
    () => [...events].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [events],
  )

  const inputStyle = { padding: '7px 10px', border: '1px solid var(--color-neutral-300)', fontSize: 13, background: '#fff' }

  if (!champId || days.length === 0) return null

  return (
    <div style={{ border: '1px solid var(--color-divider)', background: 'var(--color-surface)', padding: '14px 16px' }}>
      <div className="kicker" style={{ marginBottom: 4 }}>Day-by-day program</div>
      <div className="micro" style={{ marginBottom: 12, textTransform: 'none', letterSpacing: 0 }}>
        Days follow the meet dates — pick which events were swum on each day.
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
          <option value="X">Mixed</option>
        </select>
        <button type="button" className="btn btn-secondary" onClick={addItem} disabled={!eventId}>
          Add to day {day?.day}
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty} style={{ marginLeft: 'auto' }}>
          {busy ? 'Saving…' : 'Save program'}
        </button>
      </div>
      {msg && <div className="micro" style={{ marginBottom: 8, textTransform: 'none', letterSpacing: 0 }}>{msg}</div>}

      {/* items for the active day */}
      {day && day.items.length > 0 ? (
        <div>
          {day.items.map((it, i) => (
            <div
              key={`${it.event}-${it.gender}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderBottom: '1px solid var(--color-divider)', fontSize: 13, background: '#fff' }}
            >
              <span className="asw-num" style={{ width: 22, color: 'var(--color-neutral-400)', flex: 'none' }}>{i + 1}</span>
              <span style={{ fontWeight: 600 }}>{it.event_name}</span>
              <span className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{GENDER_LABEL[it.gender]}</span>
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
