import React, { useState, useEffect, useRef } from 'react'
import { getEvents } from '../../api/core'
import { addChampionshipResults } from '../../api/championships'

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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="font-semibold text-lg">Add Results</h3>
            <p className="text-xs text-gray-500">Add a missing event, round or day — swimmers are matched automatically</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {summary ? (
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-600">{summary.created}</div>
                <div className="text-xs text-green-700">Results added</div>
              </div>
              <div className="bg-sky-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-sky-600">{summary.updated}</div>
                <div className="text-xs text-sky-700">Times improved</div>
              </div>
              <div className="bg-indigo-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-indigo-600">{summary.matched_swimmers}</div>
                <div className="text-xs text-indigo-700">Matched swimmers</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-600">{summary.created_swimmers}</div>
                <div className="text-xs text-amber-700">New swimmers</div>
              </div>
            </div>
            {summary.errors?.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-4">
                <div className="text-sm font-medium text-red-700 mb-1">{summary.errors.length} row(s) skipped</div>
                <ul className="text-xs text-red-600 space-y-0.5 max-h-32 overflow-y-auto">
                  {summary.errors.map((e, i) => <li key={i}>Row {e.row}: {e.reason}</li>)}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setSummary(null); setRows([emptyRow(), emptyRow(), emptyRow()]) }}
                className="px-4 py-2 text-sm rounded-lg border text-gray-600 hover:bg-gray-50"
              >
                Add more
              </button>
              <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700">
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Event / round selectors */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-4 border-b bg-gray-50">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Event</label>
                <select value={eventId} onChange={e => setEventId(e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white">
                  {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Gender</label>
                <select value={gender} onChange={e => setGender(e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white">
                  <option value="M">Men</option>
                  <option value="F">Women</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Round</label>
                <select value={roundType} onChange={e => setRoundType(e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white">
                  {ROUNDS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Age category</label>
                <input value={category} onChange={e => setCategory(e.target.value)} list="cat-suggestions"
                       placeholder="Optional"
                       className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white" />
                <datalist id="cat-suggestions">
                  {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>

            {/* Rows */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-gray-500">
                  {selectedEvent?.is_relay
                    ? 'Relay: enter the team/country name per row'
                    : 'Enter one swimmer per row — press Enter in the time field for a new row'}
                </div>
                <button
                  onClick={() => setPasteMode(p => !p)}
                  className={`text-xs px-2.5 py-1 rounded-lg border ${pasteMode ? 'bg-sky-600 text-white border-sky-600' : 'text-sky-600 border-sky-200 hover:bg-sky-50'}`}
                >
                  {pasteMode ? 'Back to table' : 'Paste list'}
                </button>
              </div>

              {pasteMode ? (
                <div>
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    rows={8}
                    placeholder={'One result per line, e.g.\nAhmed HAFNAOUI; 2002; TUN; 3:43.36\nMarwan ELKAMASH, 1993, EGY, 3:48.14'}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                  />
                  <div className="flex justify-end mt-2">
                    <button onClick={applyPaste} className="px-3 py-1.5 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700">
                      Parse rows
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b text-xs text-gray-500">
                        <th className="px-2 py-1.5 text-left w-8">#</th>
                        <th className="px-2 py-1.5 text-left">{selectedEvent?.is_relay ? 'Team' : 'Name'} *</th>
                        <th className="px-2 py-1.5 text-left w-20">Born</th>
                        <th className="px-2 py-1.5 text-left w-20">Country</th>
                        <th className="px-2 py-1.5 text-left w-32">Club</th>
                        <th className="px-2 py-1.5 text-left w-28">Time *</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-1 py-1">
                            <input data-row-name value={r.name} onChange={e => setRow(i, 'name', e.target.value)}
                                   placeholder="Full name"
                                   className="w-full border-0 focus:ring-1 focus:ring-sky-400 rounded px-1.5 py-1 text-sm bg-transparent" />
                          </td>
                          <td className="px-1 py-1">
                            <input value={r.birth_year} onChange={e => setRow(i, 'birth_year', e.target.value)}
                                   placeholder="2008" maxLength={4}
                                   className="w-full border-0 focus:ring-1 focus:ring-sky-400 rounded px-1.5 py-1 text-sm bg-transparent" />
                          </td>
                          <td className="px-1 py-1">
                            <input value={r.country} onChange={e => setRow(i, 'country', e.target.value.toUpperCase())}
                                   placeholder="TUN" maxLength={3}
                                   className="w-full border-0 focus:ring-1 focus:ring-sky-400 rounded px-1.5 py-1 text-sm bg-transparent uppercase" />
                          </td>
                          <td className="px-1 py-1">
                            <input value={r.team} onChange={e => setRow(i, 'team', e.target.value)}
                                   placeholder="Club"
                                   className="w-full border-0 focus:ring-1 focus:ring-sky-400 rounded px-1.5 py-1 text-sm bg-transparent" />
                          </td>
                          <td className="px-1 py-1">
                            <input
                              ref={i === rows.length - 1 ? lastTimeRef : null}
                              value={r.time}
                              onChange={e => setRow(i, 'time', e.target.value)}
                              onKeyDown={e => handleTimeKeyDown(e, i)}
                              placeholder="1:02.34"
                              className="w-full border-0 focus:ring-1 focus:ring-sky-400 rounded px-1.5 py-1 text-sm font-mono bg-transparent"
                            />
                          </td>
                          <td className="px-1 py-1 text-center">
                            <button onClick={() => removeRow(i)} tabIndex={-1}
                                    className="text-gray-300 hover:text-red-500 text-sm">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button onClick={addRow}
                          className="w-full py-2 text-xs text-sky-600 hover:bg-sky-50 border-t font-medium">
                    + Add row
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <div className="text-xs text-red-500">{error}</div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">{validRows.length} row(s) ready</span>
                <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border text-gray-600 hover:bg-white">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || validRows.length === 0}
                  className="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : `Save ${validRows.length || ''} results`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
