import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Plus, AlertTriangle } from 'lucide-react'
import { searchSwimmers, createSwimmer } from '../../api/swimmers'
import { getChampionships, createChampionship, addChampionshipResult } from '../../api/championships'
import { getCountries, getEvents, getFinaPointsPreview } from '../../api/core'
import { getClassifications, getSubClassifications } from '../../api/championships'
import { POOL_TYPES, parseTime, formatDate } from '../../utils/constants'
import { Button, Card, Input, Select, SearchInput, FieldLabel } from '../ui'

export default function ManualEntryForm({ onComplete }) {
  // Swimmer state
  const [swimmerQuery, setSwimmerQuery] = useState('')
  const [swimmerResults, setSwimmerResults] = useState([])
  const [selectedSwimmer, setSelectedSwimmer] = useState(null)
  const [showNewSwimmer, setShowNewSwimmer] = useState(false)
  const [newSwimmer, setNewSwimmer] = useState({ name: '', date_of_birth: '', nationality: '', sex: 'M', club: '' })

  // Championship state
  const [champQuery, setChampQuery] = useState('')
  const [champResults, setChampResults] = useState([])
  const [selectedChamp, setSelectedChamp] = useState(null)
  const [showNewChamp, setShowNewChamp] = useState(false)
  const [newChamp, setNewChamp] = useState({
    name: '', date: '', end_date: '', pool: 'LCM', country: '', location: '',
    classification: '', sub_classification: '',
  })

  // Result state
  const [events, setEvents] = useState([])
  const [resultForm, setResultForm] = useState({ event: '', time: '', team: '', fina_points: '', medal: '' })

  // Reference data
  const [countries, setCountries] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)

  const swimmerDebounce = useRef(null)
  const champDebounce = useRef(null)
  const finaDebounce = useRef(null)
  const swimmerDropdownRef = useRef(null)
  const champDropdownRef = useRef(null)

  useEffect(() => {
    getCountries().then(res => setCountries(res.data))
    getEvents().then(res => setEvents(res.data))
    getClassifications().then(res => setClassifications(res.data))
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (swimmerDropdownRef.current && !swimmerDropdownRef.current.contains(e.target)) {
        setSwimmerResults([])
      }
      if (champDropdownRef.current && !champDropdownRef.current.contains(e.target)) {
        setChampResults([])
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-calculate FINA points when time + event are filled
  useEffect(() => {
    if (finaDebounce.current) clearTimeout(finaDebounce.current)
    const timeCs = resultForm.time ? parseTime(resultForm.time) : null
    if (!timeCs || !resultForm.event) return
    finaDebounce.current = setTimeout(() => {
      getFinaPointsPreview({
        time_cs: timeCs,
        event: resultForm.event,
        gender: selectedSwimmer?.sex || 'M',
        pool: selectedChamp?.pool || 'LCM',
      }).then(res => {
        if (res.data.points > 0) {
          setResultForm(f => ({ ...f, fina_points: String(res.data.points) }))
        }
      }).catch(() => {})
    }, 400)
  }, [resultForm.time, resultForm.event, selectedSwimmer, selectedChamp])

  useEffect(() => {
    if (newChamp.classification) {
      getSubClassifications(newChamp.classification).then(res => setSubClassifications(res.data))
    } else {
      setSubClassifications([])
    }
  }, [newChamp.classification])

  // Swimmer search
  const handleSwimmerSearch = (q) => {
    setSwimmerQuery(q)
    if (swimmerDebounce.current) clearTimeout(swimmerDebounce.current)
    if (q.length < 2) { setSwimmerResults([]); return }
    swimmerDebounce.current = setTimeout(() => {
      searchSwimmers(q)
        .then(res => setSwimmerResults(res.data))
        .catch(() => setSwimmerResults([]))
    }, 300)
  }

  // Championship search
  const handleChampSearch = (q) => {
    setChampQuery(q)
    if (champDebounce.current) clearTimeout(champDebounce.current)
    if (q.length < 2) { setChampResults([]); return }
    champDebounce.current = setTimeout(() => {
      getChampionships({ search: q, page_size: 10 })
        .then(res => setChampResults(res.data.results || res.data))
        .catch(() => setChampResults([]))
    }, 300)
  }

  const extractError = (err, fallback) => {
    const d = err.response?.data
    if (!d || typeof d === 'string') return fallback
    if (d.detail) return d.detail
    if (Array.isArray(d.non_field_errors)) return d.non_field_errors[0]
    const k = Object.keys(d)[0]
    if (k && Array.isArray(d[k])) return `${k}: ${d[k][0]}`
    return fallback
  }

  const handleCreateSwimmer = async () => {
    setError('')
    try {
      const res = await createSwimmer(newSwimmer)
      setSelectedSwimmer(res.data)
      setShowNewSwimmer(false)
      setSwimmerQuery('')
    } catch (err) {
      setError(extractError(err, 'Failed to create swimmer'))
    }
  }

  const handleCreateChamp = async () => {
    setError('')
    try {
      const formData = new FormData()
      Object.entries(newChamp).forEach(([k, v]) => { if (v) formData.append(k, v) })
      const res = await createChampionship(formData)
      setSelectedChamp(res.data)
      setShowNewChamp(false)
      setChampQuery('')
    } catch (err) {
      setError(extractError(err, 'Failed to create championship'))
    }
  }

  const handleSubmit = async () => {
    if (!selectedSwimmer || !selectedChamp || !resultForm.event || !resultForm.time) {
      setError('Please fill in all required fields: swimmer, championship, event, and time')
      return
    }

    setLoading(true)
    setError('')
    try {
      const timeCentiseconds = parseTime(resultForm.time)
      await addChampionshipResult(selectedChamp.id, {
        swimmer: selectedSwimmer.id,
        event: resultForm.event,
        time_centiseconds: timeCentiseconds,
        team: resultForm.team || '',
        fina_points: resultForm.fina_points ? parseInt(resultForm.fina_points) : null,
        medal: resultForm.medal || '',
      })
      setSuccess({
        swimmer_name: selectedSwimmer.name,
        championship_name: selectedChamp.name,
        event_name: events.find(e => e.id === parseInt(resultForm.event))?.name || '',
        time: resultForm.time,
      })
    } catch (err) {
      setError(extractError(err, 'Failed to add result'))
    } finally {
      setLoading(false)
    }
  }

  const handleAddAnother = () => {
    setResultForm({ event: '', time: '', team: '', fina_points: '', medal: '' })
    setSuccess(null)
  }

  const handleDone = () => {
    if (onComplete) onComplete()
  }

  if (success) {
    return (
      <Card>
        <div className="text-center py-4">
          <span className="mx-auto mb-4 w-14 h-14 rounded-full bg-pos/10 text-pos flex items-center justify-center">
            <CheckCircle2 size={28} />
          </span>
          <h2 className="text-title text-ink-900 mb-2">Result Added!</h2>
          <div className="text-body-sm text-ink-500 mb-6">
            <p className="font-semibold text-ink-900">{success.swimmer_name}</p>
            <p>{success.event_name} &mdash; <span className="tnum font-semibold">{success.time}</span></p>
            <p className="text-ink-400">{success.championship_name}</p>
          </div>
          <div className="flex justify-center gap-3">
            <Button onClick={handleAddAnother}>Add Another Result</Button>
            <Button variant="secondary" onClick={handleDone}>Done</Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-2.5 bg-neg/10 text-neg p-4 rounded-md text-body-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Section A: Swimmer */}
      <Card title="1. Select Swimmer *">
        {selectedSwimmer ? (
          <div className="flex items-center gap-3 bg-aqua-50 rounded-md p-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-ink-900">{selectedSwimmer.name}</div>
              <div className="text-body-sm text-ink-500">
                {selectedSwimmer.nationality_detail?.name || ''} &middot; {selectedSwimmer.sex === 'M' ? 'Male' : 'Female'}
                {selectedSwimmer.club && ` · ${selectedSwimmer.club}`}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedSwimmer(null)}>Change</Button>
          </div>
        ) : showNewSwimmer ? (
          <div className="border border-ink-100 rounded-md p-4 bg-ink-50">
            <h4 className="text-body-sm font-semibold text-ink-900 mb-3">Create New Swimmer</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <FieldLabel required>Full Name</FieldLabel>
                <Input type="text" placeholder="Full Name" value={newSwimmer.name}
                  onChange={(e) => setNewSwimmer({ ...newSwimmer, name: e.target.value })} />
              </div>
              <div>
                <FieldLabel required>Date of Birth</FieldLabel>
                <Input type="date" value={newSwimmer.date_of_birth}
                  onChange={(e) => setNewSwimmer({ ...newSwimmer, date_of_birth: e.target.value })} />
              </div>
              <div>
                <FieldLabel required>Nationality</FieldLabel>
                <Select value={newSwimmer.nationality} onChange={(e) => setNewSwimmer({ ...newSwimmer, nationality: e.target.value })}>
                  <option value="">Nationality</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel>Sex</FieldLabel>
                <Select value={newSwimmer.sex} onChange={(e) => setNewSwimmer({ ...newSwimmer, sex: e.target.value })}>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </Select>
              </div>
              <div>
                <FieldLabel>Club</FieldLabel>
                <Input type="text" placeholder="Club" value={newSwimmer.club}
                  onChange={(e) => setNewSwimmer({ ...newSwimmer, club: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleCreateSwimmer}
                disabled={!newSwimmer.name || !newSwimmer.date_of_birth || !newSwimmer.nationality}>
                Create Swimmer
              </Button>
              <Button variant="secondary" onClick={() => setShowNewSwimmer(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="relative" ref={swimmerDropdownRef}>
              <SearchInput placeholder="Search swimmers by name..." value={swimmerQuery}
                onChange={(e) => handleSwimmerSearch(e.target.value)} />
              {swimmerResults.length > 0 && (
                <div className="absolute z-10 w-full bg-white border border-ink-100 rounded-md mt-1 shadow-pop max-h-48 overflow-y-auto">
                  {swimmerResults.map(s => (
                    <button key={s.id} onClick={() => { setSelectedSwimmer(s); setSwimmerResults([]); setSwimmerQuery('') }}
                      className="w-full text-start px-3 py-2.5 hover:bg-ink-50 text-body-sm flex items-center justify-between gap-2 min-h-10">
                      <span className="font-medium text-ink-900">{s.name}</span>
                      <span className="text-body-sm text-ink-400">
                        {s.nationality_detail?.name || ''} &middot; {s.sex === 'M' ? 'M' : 'F'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setShowNewSwimmer(true)}
              className="inline-flex items-center gap-1 text-aqua-600 text-body-sm mt-2 hover:text-aqua-500 font-medium min-h-10">
              <Plus size={14} /> Create New Swimmer
            </button>
          </div>
        )}
      </Card>

      {/* Section B: Championship */}
      <Card title="2. Select Championship *">
        {selectedChamp ? (
          <div className="flex items-center gap-3 bg-aqua-50 rounded-md p-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-ink-900">{selectedChamp.name}</div>
              <div className="text-body-sm text-ink-500">
                {formatDate(selectedChamp.date)} &middot; {selectedChamp.pool}
                {selectedChamp.location && ` · ${selectedChamp.location}`}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedChamp(null)}>Change</Button>
          </div>
        ) : showNewChamp ? (
          <div className="border border-ink-100 rounded-md p-4 bg-ink-50">
            <h4 className="text-body-sm font-semibold text-ink-900 mb-3">Create New Championship</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <FieldLabel required>Championship Name</FieldLabel>
                <Input type="text" placeholder="Championship Name" value={newChamp.name}
                  onChange={(e) => setNewChamp({ ...newChamp, name: e.target.value })} />
              </div>
              <div>
                <FieldLabel required>Country</FieldLabel>
                <Select value={newChamp.country} onChange={(e) => setNewChamp({ ...newChamp, country: e.target.value })}>
                  <option value="">Country</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel>Pool</FieldLabel>
                <Select value={newChamp.pool} onChange={(e) => setNewChamp({ ...newChamp, pool: e.target.value })}>
                  {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel required>Start Date</FieldLabel>
                <Input type="date" value={newChamp.date}
                  onChange={(e) => {
                    const date = e.target.value
                    // Pre-fill end date with the start date so the end-date
                    // picker opens in the same month (adjust the day only)
                    setNewChamp(prev => ({
                      ...prev, date,
                      end_date: (!prev.end_date || prev.end_date < date) ? date : prev.end_date,
                    }))
                  }} />
              </div>
              <div>
                <FieldLabel>End Date</FieldLabel>
                <Input type="date" value={newChamp.end_date} min={newChamp.date || undefined}
                  onChange={(e) => setNewChamp({ ...newChamp, end_date: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel>Location</FieldLabel>
                <Input type="text" placeholder="Location" value={newChamp.location}
                  onChange={(e) => setNewChamp({ ...newChamp, location: e.target.value })} />
              </div>
              <div>
                <FieldLabel>Classification</FieldLabel>
                <Select value={newChamp.classification} onChange={(e) => setNewChamp({ ...newChamp, classification: e.target.value, sub_classification: '' })}>
                  <option value="">Classification</option>
                  {classifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel>Sub Classification</FieldLabel>
                <Select value={newChamp.sub_classification} onChange={(e) => setNewChamp({ ...newChamp, sub_classification: e.target.value })}
                  disabled={!subClassifications.length}>
                  <option value="">Sub Classification</option>
                  {subClassifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleCreateChamp}
                disabled={!newChamp.name || !newChamp.country || !newChamp.date}>
                Create Championship
              </Button>
              <Button variant="secondary" onClick={() => setShowNewChamp(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="relative" ref={champDropdownRef}>
              <SearchInput placeholder="Search championships by name..." value={champQuery}
                onChange={(e) => handleChampSearch(e.target.value)} />
              {champResults.length > 0 && (
                <div className="absolute z-10 w-full bg-white border border-ink-100 rounded-md mt-1 shadow-pop max-h-48 overflow-y-auto">
                  {champResults.map(c => (
                    <button key={c.id} onClick={() => { setSelectedChamp(c); setChampResults([]); setChampQuery('') }}
                      className="w-full text-start px-3 py-2.5 hover:bg-ink-50 text-body-sm flex items-center justify-between gap-2 min-h-10">
                      <span className="font-medium text-ink-900">{c.name}</span>
                      <span className="text-body-sm text-ink-400">{formatDate(c.date)} &middot; {c.pool}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setShowNewChamp(true)}
              className="inline-flex items-center gap-1 text-aqua-600 text-body-sm mt-2 hover:text-aqua-500 font-medium min-h-10">
              <Plus size={14} /> Create New Championship
            </button>
          </div>
        )}
      </Card>

      {/* Section C: Result */}
      <Card title="3. Result Details *">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <FieldLabel required>Event</FieldLabel>
            <Select value={resultForm.event} onChange={(e) => setResultForm({ ...resultForm, event: e.target.value })}>
              <option value="">Select event</option>
              {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel required>Time (e.g. 1:23.45 or 56.78)</FieldLabel>
            <Input type="text" value={resultForm.time} onChange={(e) => setResultForm({ ...resultForm, time: e.target.value })}
              className="tnum" placeholder="0:00.00" />
          </div>
          <div>
            <FieldLabel>FINA (auto-calculated)</FieldLabel>
            <Input type="number" value={resultForm.fina_points} onChange={(e) => setResultForm({ ...resultForm, fina_points: e.target.value })}
              className="bg-aqua-50 font-medium tnum" />
          </div>
          <div>
            <FieldLabel>Medal (optional)</FieldLabel>
            <Select value={resultForm.medal} onChange={(e) => setResultForm({ ...resultForm, medal: e.target.value })}>
              <option value="">No medal</option>
              <option value="GOLD">Gold</option>
              <option value="SILVER">Silver</option>
              <option value="BRONZE">Bronze</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Team / Club</FieldLabel>
            <Input type="text" value={resultForm.team} onChange={(e) => setResultForm({ ...resultForm, team: e.target.value })}
              placeholder="Club or team name at this meet" />
          </div>
        </div>
      </Card>

      {/* Submit */}
      <div className="flex justify-end">
        <Button onClick={handleSubmit} loading={loading}
          disabled={loading || !selectedSwimmer || !selectedChamp || !resultForm.event || !resultForm.time}>
          {loading ? 'Adding Result...' : 'Add Result'}
        </Button>
      </div>
    </div>
  )
}
