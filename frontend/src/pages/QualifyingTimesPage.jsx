import { useState, useEffect, useRef } from 'react'
import {
  Plus, Upload, Pencil, Trash2, ChevronLeft, ChevronRight,
  Clock, Check, X, Medal, Globe, Trophy,
} from 'lucide-react'
import {
  getQualifyingStandards, getQualifyingStandard,
  createQualifyingStandard, updateQualifyingStandard, deleteQualifyingStandard,
  uploadQualifyingPdf, addQualifyingTime, deleteQualifyingTime,
} from '../api/qualifyingTimes'
import { getEvents } from '../api/core'
import { formatDate } from '../utils/constants'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  Button, Card, Badge, SegmentedControl, Input, Select, FieldLabel,
  Modal, ConfirmDialog, EmptyState, Skeleton, PageHeader,
} from '../components/ui'
import TimeDisplay from '../components/domain/TimeDisplay'

const COMP_TYPES = [
  { value: 'olympics', label: 'Olympics', badge: 'medal', icon: Medal },
  { value: 'world_championships', label: 'World Championships', badge: 'aqua', icon: Globe },
]

// Resolve any competition_type (including custom ones) to a display config
function getCompType(value) {
  const known = COMP_TYPES.find(t => t.value === value)
  if (known) return known
  if (!value) return { value: '', label: 'Standard', badge: 'status', icon: Trophy }
  const label = value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return { value, label, badge: 'record', icon: Trophy }
}

function formatTime(cs) {
  if (!cs) return ''
  const minutes = Math.floor(cs / 6000)
  const seconds = Math.floor((cs % 6000) / 100)
  const centis = cs % 100
  if (minutes) return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  return `${seconds}.${String(centis).padStart(2, '0')}`
}

/* ───────── Standard form fields (shared by create/edit modals) ───────── */
function StandardFields({ name, setName, type, setType, customType, setCustomType, year, setYear, periodStart, setPeriodStart, periodEnd, setPeriodEnd, namePlaceholder }) {
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel required>Competition Name</FieldLabel>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder={namePlaceholder} autoFocus required />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Type</FieldLabel>
          <Select value={type} onChange={e => setType(e.target.value)}>
            {COMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            <option value="__custom__">Custom...</option>
          </Select>
          {type === '__custom__' && (
            <Input value={customType} onChange={e => setCustomType(e.target.value)}
              placeholder="e.g. Mediterranean Games" className="mt-2" required />
          )}
        </div>
        <div>
          <FieldLabel>Year</FieldLabel>
          <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Period Start</FieldLabel>
          <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Period End</FieldLabel>
          <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
        </div>
      </div>
    </div>
  )
}

/* ───────── Create Standard Modal ───────── */
function CreateModal({ onClose, onCreated }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [type, setType] = useState('olympics')
  const [customType, setCustomType] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    if (type === '__custom__' && !customType.trim()) return
    setSaving(true)
    try {
      await createQualifyingStandard({
        name: name.trim(),
        competition_type: type === '__custom__'
          ? customType.trim().toLowerCase().replace(/\s+/g, '_')
          : type,
        year,
        qualifying_period_start: periodStart || null,
        qualifying_period_end: periodEnd || null,
      })
      onCreated()
    } catch {
      toast.error('Failed to create')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="New Qualifying Standard">
      <form onSubmit={handleSubmit}>
        <StandardFields
          name={name} setName={setName} type={type} setType={setType}
          customType={customType} setCustomType={setCustomType}
          year={year} setYear={setYear}
          periodStart={periodStart} setPeriodStart={setPeriodStart}
          periodEnd={periodEnd} setPeriodEnd={setPeriodEnd}
          namePlaceholder="e.g. Paris 2024 Olympics"
        />
        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Create</Button>
        </div>
      </form>
    </Modal>
  )
}

/* ───────── Edit Standard Modal ───────── */
function EditStandardModal({ standard, onClose, onSaved }) {
  const toast = useToast()
  const isKnownType = COMP_TYPES.some(t => t.value === standard.competition_type)
  const [name, setName] = useState(standard.name)
  const [type, setType] = useState(isKnownType ? standard.competition_type : '__custom__')
  const [customType, setCustomType] = useState(isKnownType ? '' : (standard.competition_type || ''))
  const [year, setYear] = useState(standard.year)
  const [periodStart, setPeriodStart] = useState(standard.qualifying_period_start || '')
  const [periodEnd, setPeriodEnd] = useState(standard.qualifying_period_end || '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    if (type === '__custom__' && !customType.trim()) return
    setSaving(true)
    try {
      await updateQualifyingStandard(standard.id, {
        name: name.trim(),
        competition_type: type === '__custom__'
          ? customType.trim().toLowerCase().replace(/\s+/g, '_')
          : type,
        year,
        qualifying_period_start: periodStart || null,
        qualifying_period_end: periodEnd || null,
      })
      onSaved()
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit Standard">
      <form onSubmit={handleSubmit}>
        <StandardFields
          name={name} setName={setName} type={type} setType={setType}
          customType={customType} setCustomType={setCustomType}
          year={year} setYear={setYear}
          periodStart={periodStart} setPeriodStart={setPeriodStart}
          periodEnd={periodEnd} setPeriodEnd={setPeriodEnd}
        />
        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save</Button>
        </div>
      </form>
    </Modal>
  )
}

/* ───────── Add Time Modal ───────── */
function AddTimeModal({ standardId, events, onClose, onAdded }) {
  const toast = useToast()
  const [eventId, setEventId] = useState('')
  const [gender, setGender] = useState('M')
  const [cut, setCut] = useState('A')
  const [pool, setPool] = useState('LCM')
  const [timeText, setTimeText] = useState('')
  const [saving, setSaving] = useState(false)

  const individualEvents = events.filter(e => !e.is_relay)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!eventId || !timeText.trim()) return
    setSaving(true)
    try {
      await addQualifyingTime(standardId, { event: eventId, gender, cut, pool, time_text: timeText.trim() })
      onAdded()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add time')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Add Qualifying Time">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel required>Event</FieldLabel>
          <Select value={eventId} onChange={e => setEventId(e.target.value)} required>
            <option value="">Select event...</option>
            {individualEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <FieldLabel>Gender</FieldLabel>
            <Select value={gender} onChange={e => setGender(e.target.value)}>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </Select>
          </div>
          <div>
            <FieldLabel>Cut</FieldLabel>
            <Select value={cut} onChange={e => setCut(e.target.value)}>
              <option value="A">A Standard</option>
              <option value="B">B Standard</option>
            </Select>
          </div>
          <div>
            <FieldLabel>Pool</FieldLabel>
            <Select value={pool} onChange={e => setPool(e.target.value)}>
              <option value="LCM">LCM (50m)</option>
              <option value="SCM">SCM (25m)</option>
            </Select>
          </div>
        </div>
        <div>
          <FieldLabel required>Time</FieldLabel>
          <Input value={timeText} onChange={e => setTimeText(e.target.value)}
            placeholder="1:02.34 or 28.75" className="tnum" required />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Add Time</Button>
        </div>
      </form>
    </Modal>
  )
}

/* ───────── Standard Detail View ───────── */
function StandardDetail({ standardId, onBack, isAdmin }) {
  const toast = useToast()
  const [standard, setStandard] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddTime, setShowAddTime] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingTimeId, setEditingTimeId] = useState(null)
  const [editTimeText, setEditTimeText] = useState('')
  const [savingTime, setSavingTime] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [genderFilter, setGenderFilter] = useState('M')
  const [poolFilter, setPoolFilter] = useState('LCM')
  const [cutFilter, setCutFilter] = useState('A')
  const [pendingDeleteTime, setPendingDeleteTime] = useState(null)
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
    // Don't send pool — let backend auto-detect from PDF content
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

  const confirmDeleteTime = async () => {
    if (!pendingDeleteTime) return
    await deleteQualifyingTime(standardId, pendingDeleteTime)
    setPendingDeleteTime(null)
    refresh()
  }

  const startEditTime = (t) => {
    setEditingTimeId(t.id)
    setEditTimeText(t.formatted_time)
  }

  const handleSaveTime = async (t) => {
    const text = editTimeText.trim()
    if (!text) return
    setSavingTime(true)
    try {
      // add-time upserts on (event, gender, cut, pool) — same keys = update
      await addQualifyingTime(standardId, {
        event: t.event, gender: t.gender, cut: t.cut, pool: t.pool, time_text: text,
      })
      setEditingTimeId(null)
      refresh()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save time')
    } finally {
      setSavingTime(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }
  if (!standard) return null

  const compType = getCompType(standard.competition_type)
  const CompIcon = compType.icon
  const times = (standard.times || []).filter(t => t.gender === genderFilter && t.pool === poolFilter && t.cut === cutFilter)

  // Group times by event for the selected cut
  const byEvent = {}
  for (const t of times) {
    const key = t.event
    if (!byEvent[key]) byEvent[key] = { event_name: t.event_name, distance: t.event_distance, stroke: t.event_stroke, time: t }
    else byEvent[key].time = t
  }
  const STROKE_ORDER = { Freestyle: 0, Backstroke: 1, Breaststroke: 2, Butterfly: 3, 'Individual Medley': 4 }
  const eventRows = Object.values(byEvent).sort((a, b) => {
    const sa = STROKE_ORDER[a.stroke] ?? 99
    const sb = STROKE_ORDER[b.stroke] ?? 99
    if (sa !== sb) return sa - sb
    return a.distance - b.distance
  })

  // Group by stroke
  const byStroke = {}
  for (const row of eventRows) {
    if (!byStroke[row.stroke]) byStroke[row.stroke] = []
    byStroke[row.stroke].push(row)
  }

  return (
    <div className="space-y-5 md:space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={onBack} aria-label="Back to standards" className="mt-1 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <CompIcon size={22} className="text-aqua-600 shrink-0" />
            <h1 className="text-display text-ink-900">{standard.name}</h1>
            {isAdmin && (
              <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setShowEdit(true)} aria-label="Edit standard" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant={compType.badge}>{compType.label}</Badge>
            {standard.qualifying_period_start && standard.qualifying_period_end && (
              <span className="text-body-sm text-ink-400">
                Qualifying: {formatDate(standard.qualifying_period_start)} – {formatDate(standard.qualifying_period_end)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filters + admin actions */}
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          options={[{ key: 'M', label: 'Men' }, { key: 'F', label: 'Women' }]}
          value={genderFilter} onChange={setGenderFilter}
        />
        <SegmentedControl
          options={[{ key: 'LCM', label: 'LCM 50m' }, { key: 'SCM', label: 'SCM 25m' }]}
          value={poolFilter} onChange={setPoolFilter}
        />
        <SegmentedControl
          options={[{ key: 'A', label: 'A Cut' }, { key: 'B', label: 'B Cut' }]}
          value={cutFilter} onChange={setCutFilter}
        />

        {isAdmin && (
          <div className="flex gap-2 ms-auto">
            <Button size="sm" icon={Plus} onClick={() => setShowAddTime(true)}>Add Time</Button>
            <label className={uploading ? 'opacity-50 pointer-events-none' : ''}>
              <span className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-sm text-body-sm font-medium bg-white text-ink-900 border border-ink-200 hover:border-aqua-500/40 hover:bg-aqua-50 cursor-pointer transition-colors">
                <Upload size={16} />
                {uploading ? 'Uploading...' : 'Import PDF'}
              </span>
              <input ref={fileRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" />
            </label>
          </div>
        )}
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div className={`rounded-md border p-4 text-body-sm ${uploadResult.error ? 'bg-neg/5 border-neg/20 text-neg' : 'bg-pos/5 border-pos/20 text-pos'}`}>
          {uploadResult.error ? (
            <p>{uploadResult.error}</p>
          ) : (
            <div className="space-y-1">
              <p className="font-semibold">Import complete: {uploadResult.created} created, {uploadResult.updated} updated</p>
              {uploadResult.pools_used && (
                <p>
                  Pool{uploadResult.pools_used.length > 1 ? 's' : ''} detected:
                  {uploadResult.pools_used.map(p => <span key={p} className="inline-block ms-1.5 px-2 py-0.5 rounded-sm bg-pos/10 font-semibold">{p}</span>)}
                </p>
              )}
              {uploadResult.skipped?.length > 0 && (
                <details>
                  <summary className="cursor-pointer font-semibold">{uploadResult.skipped.length} skipped</summary>
                  <ul className="mt-1 space-y-0.5 ps-5 list-disc">{uploadResult.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* Times tables grouped by stroke */}
      {eventRows.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={Clock}
            title={`No qualifying times for ${genderFilter === 'M' ? 'Men' : 'Women'} (${poolFilter}) yet`}
            hint={isAdmin ? 'Import a PDF or add times manually' : 'Times for this selection will appear here once published'}
          />
        </Card>
      ) : (
        <div className="space-y-4 md:space-y-5">
          {Object.entries(byStroke).map(([stroke, rows]) => (
            <Card
              key={stroke}
              padding="none"
              title={stroke}
              action={<span className="text-label text-ink-400">{rows.length} event{rows.length !== 1 ? 's' : ''}</span>}
            >
              <table className="w-full">
                <thead>
                  <tr className="bg-ink-50 border-b border-ink-100">
                    <th scope="col" className="px-4 md:px-5 py-2.5 text-start text-label text-ink-400">Event</th>
                    <th scope="col" className="px-4 py-2.5 text-end text-label text-ink-400">
                      {cutFilter === 'A' ? 'A Standard' : 'B Standard'}
                    </th>
                    {isAdmin && <th scope="col" className="px-2 py-2.5 w-10" aria-label="Actions" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-ink-50 transition-colors">
                      <td className="px-4 md:px-5 py-3 text-body-sm font-medium text-ink-900">{row.event_name}</td>
                      <td className="px-4 py-2 text-end">
                        {row.time ? (
                          isAdmin && editingTimeId === row.time.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Input value={editTimeText} onChange={e => setEditTimeText(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); handleSaveTime(row.time) }
                                  if (e.key === 'Escape') setEditingTimeId(null)
                                }}
                                className="w-28 tnum text-center h-9"
                                autoFocus />
                              <Button size="sm" icon={Check} loading={savingTime} onClick={() => handleSaveTime(row.time)} aria-label="Save time" />
                              <Button size="sm" variant="ghost" icon={X} onClick={() => setEditingTimeId(null)} aria-label="Cancel editing" />
                            </span>
                          ) : isAdmin ? (
                            <button onClick={() => startEditTime(row.time)} title="Tap to edit"
                              className="rounded-sm px-2 py-1.5 -me-2 hover:bg-aqua-50 hover:ring-1 hover:ring-aqua-500/40 transition-all">
                              <TimeDisplay time={row.time.formatted_time} />
                            </button>
                          ) : (
                            <TimeDisplay time={row.time.formatted_time} />
                          )
                        ) : <span className="text-ink-200">–</span>}
                      </td>
                      {isAdmin && (
                        <td className="px-2 py-2 text-end">
                          {row.time && editingTimeId !== row.time.id && (
                            <Button variant="ghost" size="sm" icon={Trash2}
                              onClick={() => setPendingDeleteTime(row.time.id)}
                              aria-label="Delete time"
                              className="text-ink-400 hover:text-neg" />
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}

      {isAdmin && showEdit && <EditStandardModal standard={standard} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); refresh() }} />}
      {isAdmin && showAddTime && <AddTimeModal standardId={standardId} events={events} onClose={() => setShowAddTime(false)} onAdded={() => { setShowAddTime(false); refresh() }} />}
      <ConfirmDialog
        open={!!pendingDeleteTime}
        title="Delete qualifying time"
        message="Delete this qualifying time? This cannot be undone."
        destructive
        onConfirm={confirmDeleteTime}
        onCancel={() => setPendingDeleteTime(null)}
      />
    </div>
  )
}

/* ───────── Main Page ───────── */
export default function QualifyingTimesPage() {
  const { token } = useAuth()
  const isAdmin = !!token
  const toast = useToast()
  const [standards, setStandards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  const refresh = () => {
    getQualifyingStandards().then(res => setStandards(res.data.results || res.data)).catch(() => {})
  }

  useEffect(() => {
    getQualifyingStandards()
      .then(res => setStandards(res.data.results || res.data))
      .finally(() => setLoading(false))
  }, [])

  const confirmDeleteStandard = () => {
    if (!pendingDelete) return
    deleteQualifyingStandard(pendingDelete.id).then(refresh).catch(() => toast.error('Failed to delete'))
    setPendingDelete(null)
  }

  if (selectedId) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-6">
        <StandardDetail standardId={selectedId} isAdmin={isAdmin} onBack={() => { setSelectedId(null); refresh() }} />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-6">
      <PageHeader
        title="Qualifying Times"
        subtitle="Olympic & World Championship entry standards"
        action={isAdmin && (
          <Button icon={Plus} onClick={() => setShowCreate(true)}>New Standard</Button>
        )}
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-md shadow-card border border-ink-100 p-5">
              <Skeleton className="h-5 w-2/3 mb-3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      ) : standards.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={Clock}
            title="No qualifying standards yet"
            hint={isAdmin ? 'Create one to start adding A & B cut times' : 'Qualifying standards will appear here once published'}
            action={isAdmin && <Button icon={Plus} onClick={() => setShowCreate(true)}>New Standard</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {standards.map((s, i) => {
            const compType = getCompType(s.competition_type)
            const CompIcon = compType.icon
            return (
              <div key={s.id}
                className="bg-white rounded-md shadow-card border border-ink-100 p-4 md:p-5 hover:border-aqua-500/40 hover:bg-aqua-50/30 transition-colors group animate-fade-up"
                style={{ animationDelay: `${i * 0.04}s` }}>
                <div className="flex items-start gap-3 cursor-pointer" onClick={() => setSelectedId(s.id)}>
                  <span className="w-10 h-10 rounded-full bg-aqua-50 text-aqua-600 flex items-center justify-center shrink-0">
                    <CompIcon size={20} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-body font-semibold text-ink-900 group-hover:text-aqua-600 transition-colors truncate">{s.name}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant={compType.badge}>{compType.label}</Badge>
                      <span className="text-body-sm text-ink-400 tnum">{s.times_count || 0} times</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isAdmin && (
                      <Button variant="ghost" size="sm" icon={Trash2}
                        onClick={(e) => { e.stopPropagation(); setPendingDelete(s) }}
                        aria-label="Delete standard"
                        className="text-ink-400 hover:text-neg" />
                    )}
                    <ChevronRight size={18} className="text-ink-200 group-hover:text-aqua-500 transition-colors" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isAdmin && showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refresh() }} />}
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete standard"
        message={pendingDelete ? `Delete "${pendingDelete.name}" and all its qualifying times? This cannot be undone.` : ''}
        destructive
        onConfirm={confirmDeleteStandard}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
