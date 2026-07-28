import React, { useState, useEffect, useRef } from 'react'
import { Plus, X, ListChecks, TrendingUp, Users, UserPlus } from 'lucide-react'
import { getEvents } from '../../api/core'
import { addChampionshipResults } from '../../api/championships'
import { Button, Modal, Input, Select, Textarea, FieldLabel, StatCard } from '../ui'

const ROUNDS = [
  { value: '', label: 'Timed Finals' },
  { value: 'Finals', label: 'Finals' },
  { value: 'Prelims', label: 'Prelims' },
  { value: 'Heats', label: 'Heats' },
]

const CATEGORY_SUGGESTIONS = [
  'Seniors/Juniors', 'Seniors', 'Juniors', 'Cadets', 'Minimes', 'Benjamins',
  'Poussins', 'Open', '13-14', '15-16', '17-18',
]

const CELL_INPUT =
  'w-full h-9 border-0 rounded-sm px-1.5 py-1 text-body-sm bg-transparent text-ink-900 ' +
  'placeholder:text-ink-400 focus:ring-1 focus:ring-aqua-500 focus:outline-none'

const emptyRow = () => ({ name: '', birth_year: '', country: '', team: '', time: '' })

export default function AddResultsModal({ championshipId, onClose, onSaved }) {
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState('')
  const [gender, setGender] = useState('M')
  const [roundType, setRoundType] = useState('')
  const [category, setCategory] = useState('')
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()])
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const lastTimeRef = useRef(null)

  useEffect(() => {
    getEvents().then(res => {
      const evs = res.data
      setEvents(evs)
      if (evs.length && !eventId) setEventId(String(evs[0].id))
    }).catch(() => {})
  }, [])

  const setRow = (i, field, value) => {
    setRows(prev => prev.map((r, j) => (j === i ? { ...r, [field]: value } : r)))
  }
  const addRow = () => setRows(prev => [...prev, emptyRow()])
  const removeRow = (i) => setRows(prev => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev))

  const handleTimeKeyDown = (e, i) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (i === rows.length - 1) addRow()
      // Focus lands on next row's name via autofocus pattern below
      setTimeout(() => {
        const inputs = document.querySelectorAll('[data-row-name]')
        inputs[i + 1]?.focus()
      }, 0)
    }
  }

  const applyPaste = () => {
    // One result per line: Name [; YOB] [; NAT] [; Team] ; Time
    // separators: tab, semicolon or comma
    const parsed = pasteText.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const parts = line.split(/\t|;|,/).map(p => p.trim()).filter(Boolean)
      const row = emptyRow()
      if (parts.length === 0) return row
      row.name = parts[0]
      row.time = parts[parts.length - 1]
      for (const p of parts.slice(1, -1)) {
        if (/^\d{4}$/.test(p)) row.birth_year = p
        else if (/^[A-Za-z]{3}$/.test(p)) row.country = p.toUpperCase()
        else row.team = p
      }
      return row
    })
    if (parsed.length) {
      setRows(parsed)
      setPasteMode(false)
      setPasteText('')
    }
  }

  const validRows = rows.filter(r => r.name.trim() && r.time.trim())

  const handleSave = async () => {
    setError('')
    if (!eventId) { setError('Select an event'); return }
    if (validRows.length === 0) { setError('Add at least one row with a name and a time'); return }
    setSaving(true)
    try {
      const res = await addChampionshipResults(championshipId, {
        event: Number(eventId),
        gender,
        round_type: roundType,
        category: category.trim(),
        rows: validRows,
      })
      setSummary(res.data)
      onSaved?.()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save results')
    } finally {
      setSaving(false)
    }
  }

  const selectedEvent = events.find(e => String(e.id) === String(eventId))

  return (
    <Modal open onClose={onClose} title="Add Results" size="xl"
      footer={summary ? (
        <>
          <Button variant="secondary"
            onClick={() => { setSummary(null); setRows([emptyRow(), emptyRow(), emptyRow()]) }}>
            Add more
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="text-body-sm text-neg">{error}</div>
          <div className="flex items-center gap-3">
            <span className="text-body-sm text-ink-400 tnum">{validRows.length} row(s) ready</span>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={saving} disabled={saving || validRows.length === 0}>
              {saving ? 'Saving…' : `Save ${validRows.length || ''} results`}
            </Button>
          </div>
        </div>
      )}
    >
      <p className="text-body-sm text-ink-400 -mt-2 mb-4">
        Add a missing event, round or day — swimmers are matched automatically
      </p>

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Results Added" value={summary.created} icon={ListChecks} />
          <StatCard label="Times Improved" value={summary.updated} icon={TrendingUp} />
          <StatCard label="Matched Swimmers" value={summary.matched_swimmers} icon={Users} />
          <StatCard label="New Swimmers" value={summary.created_swimmers} icon={UserPlus} />
        </div>
      ) : (
        <>
          {/* Event / round selectors */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-md bg-ink-50 border border-ink-100 mb-4">
            <div className="col-span-2 md:col-span-1">
              <FieldLabel>Event</FieldLabel>
              <Select value={eventId} onChange={e => setEventId(e.target.value)}>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Gender</FieldLabel>
              <Select value={gender} onChange={e => setGender(e.target.value)}>
                <option value="M">Men</option>
                <option value="F">Women</option>
              </Select>
            </div>
            <div>
              <FieldLabel>Round</FieldLabel>
              <Select value={roundType} onChange={e => setRoundType(e.target.value)}>
                {ROUNDS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Age category</FieldLabel>
              <Input value={category} onChange={e => setCategory(e.target.value)} list="cat-suggestions"
                placeholder="Optional" />
              <datalist id="cat-suggestions">
                {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          {/* Rows */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="text-body-sm text-ink-400">
              {selectedEvent?.is_relay
                ? 'Relay: enter the team/country name per row'
                : 'Enter one swimmer per row — press Enter in the time field for a new row'}
            </div>
            <Button variant={pasteMode ? 'primary' : 'secondary'} size="sm"
              onClick={() => setPasteMode(p => !p)}>
              {pasteMode ? 'Back to table' : 'Paste list'}
            </Button>
          </div>

          {pasteMode ? (
            <div>
              <Textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                rows={8}
                placeholder={'One result per line, e.g.\nAhmed HAFNAOUI; 2002; TUN; 3:43.36\nMarwan ELKAMASH, 1993, EGY, 3:48.14'}
                className="tnum"
              />
              <div className="flex justify-end mt-2">
                <Button size="sm" onClick={applyPaste}>Parse rows</Button>
              </div>
            </div>
          ) : (
            <div className="border border-ink-100 rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm min-w-[560px]">
                  <thead>
                    <tr className="bg-ink-50 border-b border-ink-100 text-label text-ink-400">
                      <th scope="col" className="px-2 py-2 text-start w-8 font-semibold">#</th>
                      <th scope="col" className="px-2 py-2 text-start font-semibold">{selectedEvent?.is_relay ? 'Team' : 'Name'} *</th>
                      <th scope="col" className="px-2 py-2 text-start w-20 font-semibold">Born</th>
                      <th scope="col" className="px-2 py-2 text-start w-20 font-semibold">Country</th>
                      <th scope="col" className="px-2 py-2 text-start w-32 font-semibold">Club</th>
                      <th scope="col" className="px-2 py-2 text-start w-28 font-semibold">Time *</th>
                      <th scope="col" className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1 text-ink-400 text-body-sm tnum">{i + 1}</td>
                        <td className="px-1 py-1">
                          <input data-row-name value={r.name} onChange={e => setRow(i, 'name', e.target.value)}
                            placeholder="Full name" aria-label="Name" className={CELL_INPUT} />
                        </td>
                        <td className="px-1 py-1">
                          <input value={r.birth_year} onChange={e => setRow(i, 'birth_year', e.target.value)}
                            placeholder="2008" maxLength={4} aria-label="Birth year" className={`${CELL_INPUT} tnum`} />
                        </td>
                        <td className="px-1 py-1">
                          <input value={r.country} onChange={e => setRow(i, 'country', e.target.value.toUpperCase())}
                            placeholder="TUN" maxLength={3} aria-label="Country" className={`${CELL_INPUT} uppercase`} />
                        </td>
                        <td className="px-1 py-1">
                          <input value={r.team} onChange={e => setRow(i, 'team', e.target.value)}
                            placeholder="Club" aria-label="Club" className={CELL_INPUT} />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            ref={i === rows.length - 1 ? lastTimeRef : null}
                            value={r.time}
                            onChange={e => setRow(i, 'time', e.target.value)}
                            onKeyDown={e => handleTimeKeyDown(e, i)}
                            placeholder="1:02.34"
                            aria-label="Time"
                            className={`${CELL_INPUT} tnum font-semibold`}
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <button onClick={() => removeRow(i)} tabIndex={-1} aria-label="Remove row"
                            className="text-ink-200 hover:text-neg p-1.5 rounded-sm">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={addRow}
                className="w-full min-h-10 py-2 text-body-sm text-aqua-600 hover:bg-aqua-50 border-t border-ink-100 font-medium inline-flex items-center justify-center gap-1">
                <Plus size={14} /> Add row
              </button>
            </div>
          )}
        </>
      )}

      {summary?.errors?.length > 0 && (
        <div className="bg-neg/5 border border-neg/30 rounded-md p-3">
          <div className="text-body-sm font-medium text-neg mb-1 tnum">{summary.errors.length} row(s) skipped</div>
          <ul className="text-body-sm text-neg space-y-0.5 max-h-32 overflow-y-auto">
            {summary.errors.map((e, i) => <li key={i}>Row {e.row}: {e.reason}</li>)}
          </ul>
        </div>
      )}
    </Modal>
  )
}
