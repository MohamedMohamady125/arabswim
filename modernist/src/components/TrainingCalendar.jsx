import { useEffect, useState } from 'react'
import { Modal, Empty, Loading } from './ui'
import {
  getTrainingSessions, createTrainingSession,
  updateTrainingSession, deleteTrainingSession,
} from '../api/teams'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])
const pad = (n) => String(n).padStart(2, '0')
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const NAVY = '#0b2948'
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const am = h < 12
  const hh = h % 12 || 12
  return `${hh}:${pad(m)} ${am ? 'AM' : 'PM'}`
}

function SessionModal({ session, teamId, academyId, onClose, onSaved }) {
  const isNew = !session?.id
  const [form, setForm] = useState({
    date: session?.date || new Date().toISOString().slice(0, 10),
    start_time: (session?.start_time || '17:00').slice(0, 5),
    end_time: (session?.end_time || '').slice(0, 5),
    location: session?.location || '',
    coach_name: session?.coach_name || '',
    group_name: session?.group_name || '',
    age_group: session?.age_group || '',
    notes: session?.notes || '',
  })
  const [repeatWeekly, setRepeatWeekly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.date || !form.start_time) { setErr('Date and start time are required'); return }
    setBusy(true); setErr('')
    const payload = { ...form, end_time: form.end_time || null }
    if (teamId) payload.team = teamId
    if (academyId) payload.academy = academyId
    try {
      if (isNew) {
        // Optionally repeat the slot on the same weekday for the rest of the month
        const dates = [form.date]
        if (repeatWeekly) {
          const d = new Date(form.date + 'T00:00:00')
          const month = d.getMonth()
          for (;;) {
            d.setDate(d.getDate() + 7)
            if (d.getMonth() !== month) break
            dates.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
          }
        }
        for (const date of dates) await createTrainingSession({ ...payload, date })
      } else {
        await updateTrainingSession(session.id, payload)
      }
      onSaved(); onClose()
    } catch (e2) {
      setErr(e2?.response?.data ? JSON.stringify(e2.response.data) : 'Save failed')
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!window.confirm('Delete this training session?')) return
    setBusy(true)
    try { await deleteTrainingSession(session.id); onSaved(); onClose() }
    catch { setErr('Delete failed'); setBusy(false) }
  }

  const field = (label, node) => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div className="card-kicker" style={{ marginBottom: 4 }}>{label}</div>
      {node}
    </label>
  )

  return (
    <Modal title={isNew ? 'Add training session' : 'Edit training session'} onClose={onClose} width={520}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
        {field('Date', <input className="input" type="date" value={form.date} onChange={set('date')} style={{ width: '100%' }} />)}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 8px' }}>
          {field('Start', <input className="input" type="time" value={form.start_time} onChange={set('start_time')} style={{ width: '100%' }} />)}
          {field('End', <input className="input" type="time" value={form.end_time} onChange={set('end_time')} style={{ width: '100%' }} />)}
        </div>
        {field('Team / group name', <input className="input" value={form.group_name} onChange={set('group_name')} placeholder="e.g. First Team" style={{ width: '100%' }} />)}
        {field('Team age', <input className="input" value={form.age_group} onChange={set('age_group')} placeholder="e.g. U12, 13-14, Seniors" style={{ width: '100%' }} />)}
        {field('Coach name', <input className="input" value={form.coach_name} onChange={set('coach_name')} style={{ width: '100%' }} />)}
        {field('Location', <input className="input" value={form.location} onChange={set('location')} placeholder="Pool / venue" style={{ width: '100%' }} />)}
      </div>
      {field('Notes', <textarea className="input" rows={2} value={form.notes} onChange={set('notes')} style={{ width: '100%', resize: 'vertical' }} />)}
      {isNew && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={repeatWeekly} onChange={(e) => setRepeatWeekly(e.target.checked)} />
          Repeat weekly on this weekday for the rest of the month
        </label>
      )}
      {err && <div style={{ color: '#a8402f', fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        {!isNew && <button type="button" className="btn" onClick={remove} disabled={busy} style={{ marginRight: 'auto', color: '#a8402f' }}>Delete</button>}
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  )
}

function DayWidget({ dateISO, sessions, canEdit, onClose, onEdit, onAdd }) {
  const dayLabel = new Date(dateISO + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  return (
    <Modal title={dayLabel} onClose={onClose} width={440}>
      <div style={{ display: 'grid', gap: 10 }}>
        {sessions.map((s) => (
          <div key={s.id} style={{
            background: '#f2f7fc', border: '1px solid #dbe6f2', borderLeft: '4px solid var(--color-accent-800)',
            borderRadius: 10, padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="asw-num" style={{ fontWeight: 900, fontSize: 17, color: NAVY }}>
                {fmtTime(s.start_time)}{s.end_time ? ` – ${fmtTime(s.end_time)}` : ''}
              </span>
              {canEdit && (
                <button type="button" className="btn" style={{ marginLeft: 'auto', padding: '2px 12px', fontSize: 11.5 }}
                  onClick={() => onEdit(s)}>Edit</button>
              )}
            </div>
            {(s.group_name || s.age_group) && (
              <div style={{ fontWeight: 800, fontSize: 14, color: NAVY, marginTop: 6 }}>
                {s.group_name}{s.age_group ? ` (${s.age_group})` : ''}
              </div>
            )}
            <div style={{ fontSize: 12.5, color: '#4a5b70', marginTop: 4, display: 'grid', gap: 2 }}>
              {s.coach_name && <div>Coach: <span style={{ fontWeight: 700, color: NAVY }}>{s.coach_name}</span></div>}
              {s.location && <div>Location: <span style={{ fontWeight: 700, color: NAVY }}>{s.location}</span></div>}
              {s.notes && <div style={{ marginTop: 2 }}>{s.notes}</div>}
            </div>
          </div>
        ))}
      </div>
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn btn-primary" onClick={onAdd}>+ Add session</button>
        </div>
      )}
    </Modal>
  )
}

export default function TrainingCalendar({ teamId, academyId, canEdit }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { session } | { session: null, date }
  const [dayView, setDayView] = useState(null) // ISO date whose sessions are shown in the widget
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = { month: monthKey(month) }
    if (teamId) params.team = teamId
    if (academyId) params.academy = academyId
    getTrainingSessions(params)
      .then((res) => alive && setSessions(list(res.data)))
      .catch(() => alive && setSessions([]))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [teamId, academyId, month, refresh])

  const byDate = {}
  for (const s of sessions) (byDate[s.date] = byDate[s.date] || []).push(s)

  // Monday-first calendar grid
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7) cells.push(null)
  const todayISO = new Date().toISOString().slice(0, 10)
  const iso = (d) => `${month.getFullYear()}-${pad(month.getMonth() + 1)}-${pad(d)}`

  const monthLabel = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const shift = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))

  const navBtn = { border: '1px solid #cdd9e6', background: '#fff', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontWeight: 800, color: NAVY, fontSize: 15 }

  return (
    <div style={{ background: '#fff', border: '1px solid #dde3ea', borderTop: '3px solid var(--color-box-top)', borderRadius: 12, padding: '18px 18px 20px', boxShadow: '0 1px 6px rgba(11,41,72,.06)' }}>
      {/* Header: month nav + add */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button type="button" style={navBtn} onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 19, color: NAVY, minWidth: 170, textAlign: 'center' }}>{monthLabel}</div>
        <button type="button" style={navBtn} onClick={() => shift(1)} aria-label="Next month">›</button>
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => setModal({ session: null })}>+ Add session</button>
        )}
      </div>

      {loading ? <Loading label="Loading training calendar" /> : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(96px, 1fr))', gap: 6, minWidth: 720 }}>
              {WEEKDAYS.map((w) => (
                <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7a8aa0', padding: '2px 0 6px' }}>{w}</div>
              ))}
              {cells.map((d, i) => {
                if (d === null) return <div key={`e${i}`} style={{ background: '#f4f7fb', borderRadius: 8, minHeight: 84 }} />
                const dISO = iso(d)
                const dSessions = byDate[dISO] || []
                const isToday = dISO === todayISO
                const hasPractice = dSessions.length > 0
                return (
                  <div key={dISO}
                    onClick={hasPractice
                      ? () => setDayView(dISO)
                      : (canEdit ? () => setModal({ session: null, date: dISO }) : undefined)}
                    style={{
                      background: hasPractice ? '#eaf3fb' : '#fff',
                      border: isToday ? '2px solid var(--color-accent)' : (hasPractice ? '1px solid #c9ddf0' : '1px solid #e2e9f2'),
                      borderRadius: 8, minHeight: 84, padding: '5px 6px',
                      cursor: (hasPractice || canEdit) ? 'pointer' : 'default',
                    }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: isToday ? 'var(--color-accent)' : NAVY, marginBottom: 4 }}>{d}</div>
                    {hasPractice && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-accent-800)', flexShrink: 0 }} />
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: NAVY }}>
                          {dSessions.length === 1 ? 'Practice' : `${dSessions.length} sessions`}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Session list under the grid — full details */}
          {sessions.length === 0 ? (
            <div style={{ marginTop: 14 }}><Empty label="No training sessions scheduled this month" /></div>
          ) : (
            <div style={{ marginTop: 16, overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Date</th>
                    <th style={{ textAlign: 'left' }}>Time</th>
                    <th style={{ textAlign: 'left' }}>Team</th>
                    <th style={{ textAlign: 'left' }}>Age</th>
                    <th style={{ textAlign: 'left' }}>Coach</th>
                    <th style={{ textAlign: 'left' }}>Location</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="asw-num">{new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      <td className="asw-num">{fmtTime(s.start_time)}{s.end_time ? ` – ${fmtTime(s.end_time)}` : ''}</td>
                      <td style={{ fontWeight: 700 }}>{s.group_name || '—'}</td>
                      <td>{s.age_group || '—'}</td>
                      <td>{s.coach_name || '—'}</td>
                      <td>{s.location || '—'}</td>
                      {canEdit && (
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="btn" style={{ padding: '2px 10px', fontSize: 11.5 }} onClick={() => setModal({ session: s })}>Edit</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {dayView && !modal && (
        <DayWidget
          dateISO={dayView}
          sessions={byDate[dayView] || []}
          canEdit={canEdit}
          onClose={() => setDayView(null)}
          onEdit={(s) => { setDayView(null); setModal({ session: s }) }}
          onAdd={() => { const d = dayView; setDayView(null); setModal({ session: null, date: d }) }}
        />
      )}
      {modal && (
        <SessionModal
          session={modal.session || (modal.date ? { date: modal.date } : null)}
          teamId={teamId} academyId={academyId}
          onClose={() => setModal(null)}
          onSaved={() => setRefresh((r) => r + 1)}
        />
      )}
    </div>
  )
}
