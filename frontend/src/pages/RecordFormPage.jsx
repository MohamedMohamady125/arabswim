import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, X, Search, UserPlus } from 'lucide-react'
import { createRecord, updateRecord } from '../api/records'
import api from '../api/client'
import { getSwimmers, createSwimmer } from '../api/swimmers'
import { getCountries, getEvents } from '../api/core'
import { useToast } from '../context/ToastContext'
import { RECORD_TYPES, POOL_TYPES, formatTime, parseTime } from '../utils/constants'

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
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/records')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={15} /> Back to Records
      </button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Record' : 'Add Record'}</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Record Type *</label>
            <select value={form.record_type} onChange={set('record_type')} className="w-full border rounded-lg px-3 py-2 text-sm">
              {RECORD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Pool *</label>
            <select value={form.pool} onChange={set('pool')} className="w-full border rounded-lg px-3 py-2 text-sm">
              {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-sm font-medium mb-1">Event *</label>
            <select value={form.event} onChange={set('event')} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">— Select —</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Swimmer *</label>
          {swimmer ? (
            <div className="flex items-center justify-between border rounded-lg px-3 py-2 bg-blue-50">
              <span className="text-sm text-blue-800">
                {swimmer.name}
                {swimmer.nationality_detail && <span className="text-blue-500"> · {swimmer.nationality_detail.name}</span>}
              </span>
              <button type="button" onClick={() => setSwimmer(null)} className="text-gray-400 hover:text-red-600">
                <X size={15} />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
                <input type="text" value={swimmerQuery} onChange={(e) => setSwimmerQuery(e.target.value)}
                  className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm" placeholder="Search swimmers in the database..." />
                {swimmerResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {swimmerResults.map(s => (
                      <button key={s.id} type="button"
                        onClick={() => { setSwimmer(s); setSwimmerQuery(''); setSwimmerResults([]) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
                        {s.name}
                        {s.nationality_detail && <span className="text-gray-400"> · {s.nationality_detail.name}</span>}
                        {s.birth_year && <span className="text-gray-400"> · {s.birth_year}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!showNewSwimmer && (
                <button type="button" onClick={() => setShowNewSwimmer(true)}
                  className="mt-2 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
                  <UserPlus size={15} /> Swimmer not in database? Create new
                </button>
              )}
            </>
          )}

          {!swimmer && showNewSwimmer && (
            <div className="mt-3 border rounded-lg p-4 bg-gray-50 space-y-3">
              <div className="text-sm font-semibold text-gray-700">New Swimmer</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium mb-1">Name *</label>
                  <input type="text" value={newSwimmer.name}
                    onChange={(e) => setNewSwimmer(s => ({ ...s, name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Full name" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Gender *</label>
                  <select value={newSwimmer.sex}
                    onChange={(e) => setNewSwimmer(s => ({ ...s, sex: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Birth Year</label>
                  <input type="number" value={newSwimmer.birth_year}
                    onChange={(e) => setNewSwimmer(s => ({ ...s, birth_year: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="2005" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium mb-1">Country *</label>
                  <select value={newSwimmer.nationality}
                    onChange={(e) => setNewSwimmer(s => ({ ...s, nationality: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">— Select —</option>
                    {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleCreateSwimmer}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Create Swimmer</button>
                <button type="button" onClick={() => setShowNewSwimmer(false)}
                  className="px-4 py-1.5 border rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Time *</label>
            <input type="text" value={form.time} onChange={set('time')}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="1:54.32 or 54.32" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date *</label>
            <input type="date" value={form.result_date} onChange={set('result_date')}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-sm font-medium mb-1">Location / Meet</label>
            <input type="text" value={form.location} onChange={set('location')}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Doha 2024 Worlds" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/records')} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Record'}
          </button>
        </div>
      </form>
    </div>
  )
}
