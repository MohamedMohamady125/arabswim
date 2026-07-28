import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { X, Search, UserPlus, Save } from 'lucide-react'
import { createRecord, updateRecord } from '../api/records'
import api from '../api/client'
import { getSwimmers, createSwimmer } from '../api/swimmers'
import { getCountries, getEvents } from '../api/core'
import { useToast } from '../context/ToastContext'
import { RECORD_TYPES, POOL_TYPES, formatTime, parseTime } from '../utils/constants'
import { Button, Card, PageHeader, Input, Select, FieldLabel } from '../components/ui'

export default function RecordFormPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = Boolean(id)

  const [countries, setCountries] = useState([])
  const [events, setEvents] = useState([])
  const [saving, setSaving] = useState(false)

  const [swimmerQuery, setSwimmerQuery] = useState('')
  const [swimmerResults, setSwimmerResults] = useState([])
  const [swimmer, setSwimmer] = useState(null)
  const searchTimer = useRef(null)

  // Inline "create new swimmer" mini-form
  const [showNewSwimmer, setShowNewSwimmer] = useState(false)
  const [newSwimmer, setNewSwimmer] = useState({ name: '', sex: 'M', nationality: '', birth_year: '' })

  const [form, setForm] = useState({
    record_type: searchParams.get('type') || 'AFRICAN',
    event: '',
    pool: 'LCM',
    time: '',
    location: '',
    result_date: '',
  })

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
    getEvents().then(res => {
      const list = Array.isArray(res.data) ? res.data : res.data.results || []
      list.sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99) || a.distance - b.distance)
      setEvents(list)
    }).catch(() => {})
    if (isEdit) {
      api.get(`/records/${id}/`).then(res => {
        const r = res.data
        setForm({
          record_type: r.record_type,
          event: r.event,
          pool: r.pool || 'LCM',
          time: formatTime(r.time_centiseconds),
          location: r.location || '',
          result_date: r.result_date || '',
        })
        if (r.swimmer_detail) setSwimmer(r.swimmer_detail)
      }).catch(() => toast.error('Failed to load record'))
    }
  }, [id])

  useEffect(() => {
    if (!swimmerQuery.trim()) { setSwimmerResults([]); return }
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      getSwimmers({ search: swimmerQuery, page_size: 8 }).then(res => {
        setSwimmerResults(Array.isArray(res.data) ? res.data : res.data.results || [])
      }).catch(() => {})
    }, 300)
    return () => clearTimeout(searchTimer.current)
  }, [swimmerQuery])

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const handleCreateSwimmer = async () => {
    if (!newSwimmer.name.trim()) { toast.error('Swimmer name is required'); return }
    if (!newSwimmer.nationality) { toast.error('Swimmer country is required'); return }
    try {
      const payload = {
        name: newSwimmer.name.trim(),
        sex: newSwimmer.sex,
        nationality: newSwimmer.nationality,
      }
      if (newSwimmer.birth_year) payload.birth_year = parseInt(newSwimmer.birth_year)
      const res = await createSwimmer(payload)
      const country = countries.find(c => c.id === parseInt(newSwimmer.nationality))
      setSwimmer({ ...res.data, nationality_detail: country })
      setShowNewSwimmer(false)
      setNewSwimmer({ name: '', sex: 'M', nationality: '', birth_year: '' })
      toast.success('Swimmer created')
    } catch {
      toast.error('Failed to create swimmer')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!swimmer) { toast.error('Select or create a swimmer'); return }
    if (!form.event) { toast.error('Select an event'); return }
    if (!form.time.trim()) { toast.error('Time is required'); return }
    if (!form.result_date) { toast.error('Date is required'); return }
    let cs
    try {
      cs = parseTime(form.time.trim())
      if (!cs || Number.isNaN(cs)) throw new Error()
    } catch {
      toast.error('Invalid time — use mm:ss.cc or ss.cc')
      return
    }
    setSaving(true)
    try {
      const payload = {
        swimmer: swimmer.id,
        event: form.event,
        record_type: form.record_type,
        pool: form.pool,
        time_centiseconds: cs,
        location: form.location,
        result_date: form.result_date,
        is_new: true,
      }
      if (isEdit) await updateRecord(id, payload)
      else await createRecord(payload)
      toast.success(isEdit ? 'Record updated' : 'Record added')
      navigate('/records')
    } catch {
      toast.error('Failed to save record')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-6">
      <PageHeader
        breadcrumb={[{ label: 'Records', to: '/records' }, { label: isEdit ? 'Edit' : 'New' }]}
        title={isEdit ? 'Edit Record' : 'Add Record'}
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <div className="space-y-6">
            <section>
              <h3 className="text-label text-ink-400 mb-4">Record</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <FieldLabel required>Record Type</FieldLabel>
                  <Select value={form.record_type} onChange={set('record_type')}>
                    {RECORD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                </div>
                <div>
                  <FieldLabel required>Pool</FieldLabel>
                  <Select value={form.pool} onChange={set('pool')}>
                    {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </Select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <FieldLabel required>Event</FieldLabel>
                  <Select value={form.event} onChange={set('event')}>
                    <option value="">— Select —</option>
                    {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                  </Select>
                </div>
              </div>
            </section>

            <section className="border-t border-ink-100 pt-5">
              <FieldLabel required>Swimmer</FieldLabel>
              {swimmer ? (
                <div className="flex items-center justify-between border border-aqua-100 rounded-sm ps-3 pe-2 py-2 bg-aqua-50">
                  <span className="text-body-sm text-ink-900">
                    {swimmer.name}
                    {swimmer.nationality_detail && <span className="text-ink-400"> · {swimmer.nationality_detail.name}</span>}
                  </span>
                  <button type="button" aria-label="Clear swimmer" onClick={() => setSwimmer(null)} className="p-2 text-ink-400 hover:text-neg rounded-sm">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                    <Input type="text" value={swimmerQuery} onChange={(e) => setSwimmerQuery(e.target.value)}
                      className="ps-9" placeholder="Search swimmers in the database..." />
                    {swimmerResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-ink-100 rounded-md shadow-pop max-h-56 overflow-y-auto">
                        {swimmerResults.map(s => (
                          <button key={s.id} type="button"
                            onClick={() => { setSwimmer(s); setSwimmerQuery(''); setSwimmerResults([]) }}
                            className="w-full text-start px-3 py-2.5 text-body-sm text-ink-900 hover:bg-aqua-50">
                            {s.name}
                            {s.nationality_detail && <span className="text-ink-400"> · {s.nationality_detail.name}</span>}
                            {s.birth_year && <span className="text-ink-400"> · {s.birth_year}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!showNewSwimmer && (
                    <button type="button" onClick={() => setShowNewSwimmer(true)}
                      className="mt-2 flex items-center gap-1.5 py-2 text-body-sm text-aqua-600 hover:text-ink-900 font-medium">
                      <UserPlus size={15} /> Swimmer not in database? Create new
                    </button>
                  )}
                </>
              )}

              {!swimmer && showNewSwimmer && (
                <div className="mt-3 border border-ink-100 rounded-md p-4 bg-ink-50 space-y-3">
                  <div className="text-label text-ink-400">New Swimmer</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="col-span-2">
                      <FieldLabel required>Name</FieldLabel>
                      <Input type="text" value={newSwimmer.name}
                        onChange={(e) => setNewSwimmer(s => ({ ...s, name: e.target.value }))}
                        placeholder="Full name" />
                    </div>
                    <div>
                      <FieldLabel required>Gender</FieldLabel>
                      <Select value={newSwimmer.sex}
                        onChange={(e) => setNewSwimmer(s => ({ ...s, sex: e.target.value }))}>
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                      </Select>
                    </div>
                    <div>
                      <FieldLabel>Birth Year</FieldLabel>
                      <Input type="number" value={newSwimmer.birth_year}
                        onChange={(e) => setNewSwimmer(s => ({ ...s, birth_year: e.target.value }))}
                        placeholder="2005" />
                    </div>
                    <div className="col-span-2">
                      <FieldLabel required>Country</FieldLabel>
                      <Select value={newSwimmer.nationality}
                        onChange={(e) => setNewSwimmer(s => ({ ...s, nationality: e.target.value }))}>
                        <option value="">— Select —</option>
                        {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={handleCreateSwimmer}>Create Swimmer</Button>
                    <Button type="button" variant="secondary" onClick={() => setShowNewSwimmer(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </section>

            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Performance</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <FieldLabel required>Time</FieldLabel>
                  <Input type="text" value={form.time} onChange={set('time')}
                    className="tnum" placeholder="1:54.32 or 54.32" />
                </div>
                <div>
                  <FieldLabel required>Date</FieldLabel>
                  <Input type="date" value={form.result_date} onChange={set('result_date')} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <FieldLabel>Location / Meet</FieldLabel>
                  <Input type="text" value={form.location} onChange={set('location')}
                    placeholder="e.g. Doha 2024 Worlds" />
                </div>
              </div>
            </section>
          </div>
        </Card>

        <div className="sticky bottom-0 z-10 mt-4 rounded-md border border-ink-100 bg-white/95 backdrop-blur-sm shadow-pop px-4 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/records')}>Cancel</Button>
          <Button type="submit" icon={Save} loading={saving}>{isEdit ? 'Save Changes' : 'Add Record'}</Button>
        </div>
      </form>
    </div>
  )
}
