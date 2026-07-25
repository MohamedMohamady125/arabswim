import { useState, useEffect, useRef } from 'react'
import {
  getQualifyingStandards, getQualifyingStandard,
  createQualifyingStandard, deleteQualifyingStandard,
  uploadQualifyingPdf, addQualifyingTime, deleteQualifyingTime,
} from '../api/qualifyingTimes'
import { getEvents } from '../api/core'

const COMP_TYPES = [
  { value: 'olympics', label: 'Olympics', color: 'bg-amber-100 text-amber-800', icon: '\u{1F3C5}' },
  { value: 'world_championships', label: 'World Championships', color: 'bg-sky-100 text-sky-800', icon: '\u{1F30D}' },
]

function formatTime(cs) {
  if (!cs) return ''
  const minutes = Math.floor(cs / 6000)
  const seconds = Math.floor((cs % 6000) / 100)
  const centis = cs % 100
  if (minutes) return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  return `${seconds}.${String(centis).padStart(2, '0')}`
}

/* ───────── Create Standard Modal ───────── */
function CreateModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('olympics')
  const [year, setYear] = useState(new Date().getFullYear())
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await createQualifyingStandard({
        name: name.trim(),
        competition_type: type,
        year,
        qualifying_period_start: periodStart || null,
        qualifying_period_end: periodEnd || null,
      })
      onCreated()
    } catch {
      alert('Failed to create')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-bold text-gray-800">New Qualifying Standard</h2>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Competition Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Paris 2024 Olympics"
            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" autoFocus required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm">
              {COMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Year</label>
            <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))}
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Period Start</label>
            <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Period End</label>
            <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={saving}
            className="flex-1 bg-sky-600 text-white font-bold py-2.5 rounded-xl hover:bg-sky-700 disabled:opacity-50 text-sm">
            {saving ? 'Creating...' : 'Create'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2.5 border rounded-xl text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
        </div>
      </form>
    </div>
  )
}

/* ───────── Add Time Modal ───────── */
function AddTimeModal({ standardId, events, onClose, onAdded }) {
  const [eventId, setEventId] = useState('')
  const [gender, setGender] = useState('M')
  const [cut, setCut] = useState('A')
  const [timeText, setTimeText] = useState('')
  const [saving, setSaving] = useState(false)

  const individualEvents = events.filter(e => !e.is_relay)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!eventId || !timeText.trim()) return
    setSaving(true)
    try {
      await addQualifyingTime(standardId, { event: eventId, gender, cut, time_text: timeText.trim() })
      onAdded()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add time')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-bold text-gray-800">Add Qualifying Time</h2>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Event</label>
          <select value={eventId} onChange={e => setEventId(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" required>
            <option value="">Select event...</option>
            {individualEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Gender</label>
            <select value={gender} onChange={e => setGender(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm">
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Cut</label>
            <select value={cut} onChange={e => setCut(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm">
              <option value="A">A Standard</option>
              <option value="B">B Standard</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Time</label>
          <input value={timeText} onChange={e => setTimeText(e.target.value)} placeholder="1:02.34 or 28.75"
            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm font-mono" required />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={saving}
            className="flex-1 bg-sky-600 text-white font-bold py-2.5 rounded-xl hover:bg-sky-700 disabled:opacity-50 text-sm">
            {saving ? 'Saving...' : 'Add Time'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2.5 border rounded-xl text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
        </div>
      </form>
    </div>
  )
}

/* ───────── Standard Detail View ───────── */
function StandardDetail({ standardId, onBack }) {
  const [standard, setStandard] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddTime, setShowAddTime] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [genderFilter, setGenderFilter] = useState('M')
  const fileRef = useRef()

  const refresh = () => {
    getQualifyingStandard(standardId).then(res => setStandard(res.data))
  }

  useEffect(() => {
    Promise.all([
      getQualifyingStandard(standardId),
      getEvents(),
    ]).then(([sRes, eRes]) => {
      setStandard(sRes.data)
      setEvents(eRes.data)
    }).finally(() => setLoading(false))
  }, [standardId])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await uploadQualifyingPdf(standardId, formData)
      setUploadResult(res.data)
      refresh()
    } catch (err) {
      setUploadResult({ error: err.response?.data?.error || 'Upload failed' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDeleteTime = async (timeId) => {
    if (!window.confirm('Delete this qualifying time?')) return
    await deleteQualifyingTime(standardId, timeId)
    refresh()
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" /></div>
  if (!standard) return null

  const compType = COMP_TYPES.find(t => t.value === standard.competition_type)
  const times = (standard.times || []).filter(t => t.gender === genderFilter)

  // Group times by event
  const byEvent = {}
  for (const t of times) {
    const key = t.event
    if (!byEvent[key]) byEvent[key] = { event_name: t.event_name, distance: t.event_distance, stroke: t.event_stroke, a: null, b: null }
    byEvent[key][t.cut.toLowerCase()] = t
  }
  const eventRows = Object.values(byEvent).sort((a, b) => {
    if (a.stroke !== b.stroke) return a.stroke.localeCompare(b.stroke)
    return a.distance - b.distance
  })

  // Group by stroke
  const byStroke = {}
  for (const row of eventRows) {
    if (!byStroke[row.stroke]) byStroke[row.stroke] = []
    byStroke[row.stroke].push(row)
  }

  const strokeColors = {
    Freestyle: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', header: 'bg-sky-100' },
    Backstroke: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', header: 'bg-violet-100' },
    Butterfly: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', header: 'bg-amber-100' },
    Breaststroke: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', header: 'bg-emerald-100' },
    'Individual Medley': { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', header: 'bg-pink-100' },
  }
  const defaultColors = { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', header: 'bg-gray-100' }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={onBack} className="mt-1 p-2 rounded-xl border hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{compType?.icon}</span>
            <h1 className="text-xl sm:text-2xl font-black text-gray-800">{standard.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`px-2.5 py-1 rounded-lg font-bold ${compType?.color}`}>{compType?.label}</span>
            {standard.qualifying_period_start && standard.qualifying_period_end && (
              <span className="text-gray-400">
                Qualifying: {new Date(standard.qualifying_period_start).toLocaleDateString()} - {new Date(standard.qualifying_period_end).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Gender Toggle */}
        <div className="flex rounded-xl border overflow-hidden">
          {[{ v: 'M', l: 'Men' }, { v: 'F', l: 'Women' }].map(g => (
            <button key={g.v} onClick={() => setGenderFilter(g.v)}
              className={`px-4 py-2 text-xs font-bold transition-all ${genderFilter === g.v ? 'bg-sky-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {g.l}
            </button>
          ))}
        </div>

        <div className="flex gap-2 ml-auto">
          <button onClick={() => setShowAddTime(true)}
            className="px-3 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold hover:bg-sky-700 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add Time
          </button>
          <label className={`px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
            {uploading ? 'Uploading...' : 'Import PDF'}
            <input ref={fileRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div className={`rounded-xl border p-4 text-sm ${uploadResult.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          {uploadResult.error ? (
            <p>{uploadResult.error}</p>
          ) : (
            <div className="space-y-1">
              <p className="font-bold">Import complete: {uploadResult.created} created, {uploadResult.updated} updated</p>
              {uploadResult.skipped?.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-semibold">{uploadResult.skipped.length} skipped</summary>
                  <ul className="mt-1 space-y-0.5 pl-4 list-disc">{uploadResult.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* Times Table grouped by stroke */}
      {eventRows.length === 0 ? (
        <div className="bg-white rounded-2xl border shadow-sm p-12 text-center">
          <svg className="w-14 h-14 mx-auto mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-400 font-medium">No qualifying times for {genderFilter === 'M' ? 'Men' : 'Women'} yet</p>
          <p className="text-gray-300 text-sm mt-1">Import a PDF or add times manually</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byStroke).map(([stroke, rows]) => {
            const colors = strokeColors[stroke] || defaultColors
            return (
              <div key={stroke} className={`rounded-2xl border ${colors.border} overflow-hidden shadow-sm`}>
                <div className={`${colors.header} px-4 py-2.5 flex items-center gap-2`}>
                  <h3 className={`font-bold text-sm ${colors.text}`}>{stroke}</h3>
                  <span className={`text-[10px] font-bold ${colors.text} opacity-60`}>{rows.length} event{rows.length !== 1 ? 's' : ''}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`${colors.bg} border-b ${colors.border}`}>
                      <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Event</th>
                      <th className="px-4 py-2 text-center text-[10px] font-bold uppercase tracking-wider" style={{ color: '#059669' }}>A Cut</th>
                      <th className="px-4 py-2 text-center text-[10px] font-bold uppercase tracking-wider" style={{ color: '#d97706' }}>B Cut</th>
                      <th className="px-4 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={`border-b ${colors.border} last:border-0 hover:${colors.bg} transition-colors`}>
                        <td className="px-4 py-2.5 font-semibold text-gray-800">{row.event_name}</td>
                        <td className="px-4 py-2.5 text-center">
                          {row.a ? (
                            <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg text-xs">
                              {row.a.formatted_time}
                            </span>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {row.b ? (
                            <span className="font-mono font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg text-xs">
                              {row.b.formatted_time}
                            </span>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => {
                            if (row.a) handleDeleteTime(row.a.id)
                            if (row.b) handleDeleteTime(row.b.id)
                          }} className="text-gray-300 hover:text-red-500 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {showAddTime && <AddTimeModal standardId={standardId} events={events} onClose={() => setShowAddTime(false)} onAdded={() => { setShowAddTime(false); refresh() }} />}
    </div>
  )
}

/* ───────── Main Page ───────── */
export default function QualifyingTimesPage() {
  const [standards, setStandards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const refresh = () => {
    getQualifyingStandards().then(res => setStandards(res.data.results || res.data)).catch(() => {})
  }

  useEffect(() => {
    getQualifyingStandards()
      .then(res => setStandards(res.data.results || res.data))
      .finally(() => setLoading(false))
  }, [])

  if (selectedId) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <StandardDetail standardId={selectedId} onBack={() => { setSelectedId(null); refresh() }} />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-br from-sky-600 via-sky-700 to-indigo-800 rounded-2xl p-6 sm:p-8 text-white shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black">Qualifying Times</h1>
            <p className="text-sky-200 text-sm mt-1">Olympic & World Championship entry standards</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Standard
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" /></div>
      ) : standards.length === 0 ? (
        <div className="bg-white rounded-2xl border shadow-sm p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-400 font-medium text-lg">No qualifying standards yet</p>
          <p className="text-gray-300 text-sm mt-1">Create one to start adding A & B cut times</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {standards.map((s, i) => {
            const compType = COMP_TYPES.find(t => t.value === s.competition_type)
            return (
              <button key={s.id} onClick={() => setSelectedId(s.id)}
                className="bg-white rounded-2xl border shadow-sm p-5 text-left hover:shadow-md hover:border-sky-200 transition-all group animate-fade-in-up"
                style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{compType?.icon}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-800 group-hover:text-sky-700 transition-colors">{s.name}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${compType?.color}`}>{compType?.label}</span>
                      <span className="text-[10px] text-gray-400">{s.times_count || 0} times</span>
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-gray-300 group-hover:text-sky-500 transition-colors mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refresh() }} />}
    </div>
  )
}
