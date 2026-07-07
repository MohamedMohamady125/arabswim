import { useState, useEffect, useRef } from 'react'
import { searchSwimmers, createSwimmer } from '../../api/swimmers'
import { getChampionships, createChampionship, addChampionshipResult } from '../../api/championships'
import { getCountries, getEvents } from '../../api/core'
import { getClassifications, getSubClassifications } from '../../api/championships'
import { POOL_TYPES, parseTime } from '../../utils/constants'

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
  const [resultForm, setResultForm] = useState({ event: '', time: '', team: '', fina_points: '' })

  // Reference data
  const [countries, setCountries] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)

  const swimmerDebounce = useRef(null)
  const champDebounce = useRef(null)
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

  const handleCreateSwimmer = async () => {
    setError('')
    try {
      const res = await createSwimmer(newSwimmer)
      setSelectedSwimmer(res.data)
      setShowNewSwimmer(false)
      setSwimmerQuery('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create swimmer')
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
      setError(err.response?.data?.detail || 'Failed to create championship')
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
      })
      setSuccess({
        swimmer_name: selectedSwimmer.name,
        championship_name: selectedChamp.name,
        event_name: events.find(e => e.id === parseInt(resultForm.event))?.name || '',
        time: resultForm.time,
      })
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.non_field_errors?.[0] || 'Failed to add result')
    } finally {
      setLoading(false)
    }
  }

  const handleAddAnother = () => {
    setResultForm({ event: '', time: '', team: '', fina_points: '' })
    setSuccess(null)
  }

  const handleDone = () => {
    if (onComplete) onComplete()
  }

  if (success) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <div className="text-5xl mb-4">&#x2705;</div>
        <h2 className="text-xl font-semibold mb-2">Result Added!</h2>
        <div className="text-sm text-gray-600 mb-6">
          <p><strong>{success.swimmer_name}</strong></p>
          <p>{success.event_name} &mdash; {success.time}</p>
          <p className="text-gray-400">{success.championship_name}</p>
        </div>
        <div className="flex justify-center gap-3">
          <button onClick={handleAddAnother} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Add Another Result
          </button>
          <button onClick={handleDone} className="px-6 py-2 border rounded-lg hover:bg-gray-50">
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>}

      {/* Section A: Swimmer */}
      <div className="bg-white rounded-lg border p-5">
        <h3 className="font-semibold mb-3">1. Select Swimmer *</h3>

        {selectedSwimmer ? (
          <div className="flex items-center gap-3 bg-blue-50 rounded-lg p-3">
            <div className="flex-1">
              <div className="font-medium">{selectedSwimmer.name}</div>
              <div className="text-xs text-gray-500">
                {selectedSwimmer.nationality_detail?.name || ''} &middot; {selectedSwimmer.sex === 'M' ? 'Male' : 'Female'}
                {selectedSwimmer.club && ` · ${selectedSwimmer.club}`}
              </div>
            </div>
            <button onClick={() => setSelectedSwimmer(null)} className="text-sm text-gray-500 hover:text-gray-700">Change</button>
          </div>
        ) : showNewSwimmer ? (
          <div className="border rounded-lg p-4 bg-gray-50">
            <h4 className="text-sm font-medium mb-3">Create New Swimmer</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <input type="text" placeholder="Full Name *" value={newSwimmer.name}
                  onChange={(e) => setNewSwimmer({ ...newSwimmer, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <input type="date" value={newSwimmer.date_of_birth}
                  onChange={(e) => setNewSwimmer({ ...newSwimmer, date_of_birth: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                <span className="text-xs text-gray-400">Date of Birth *</span>
              </div>
              <div>
                <select value={newSwimmer.nationality} onChange={(e) => setNewSwimmer({ ...newSwimmer, nationality: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Nationality *</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <select value={newSwimmer.sex} onChange={(e) => setNewSwimmer({ ...newSwimmer, sex: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
              <div>
                <input type="text" placeholder="Club" value={newSwimmer.club}
                  onChange={(e) => setNewSwimmer({ ...newSwimmer, club: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleCreateSwimmer}
                disabled={!newSwimmer.name || !newSwimmer.date_of_birth || !newSwimmer.nationality}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                Create Swimmer
              </button>
              <button onClick={() => setShowNewSwimmer(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="relative" ref={swimmerDropdownRef}>
              <input type="text" placeholder="Search swimmers by name..." value={swimmerQuery}
                onChange={(e) => handleSwimmerSearch(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
              {swimmerResults.length > 0 && (
                <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-lg max-h-48 overflow-y-auto">
                  {swimmerResults.map(s => (
                    <button key={s.id} onClick={() => { setSelectedSwimmer(s); setSwimmerResults([]); setSwimmerQuery('') }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center justify-between">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-gray-400">
                        {s.nationality_detail?.name || ''} &middot; {s.sex === 'M' ? 'M' : 'F'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setShowNewSwimmer(true)} className="text-blue-600 text-sm mt-2 hover:text-blue-800">
              + Create New Swimmer
            </button>
          </div>
        )}
      </div>

      {/* Section B: Championship */}
      <div className="bg-white rounded-lg border p-5">
        <h3 className="font-semibold mb-3">2. Select Championship *</h3>

        {selectedChamp ? (
          <div className="flex items-center gap-3 bg-blue-50 rounded-lg p-3">
            <div className="flex-1">
              <div className="font-medium">{selectedChamp.name}</div>
              <div className="text-xs text-gray-500">
                {selectedChamp.date} &middot; {selectedChamp.pool}
                {selectedChamp.location && ` · ${selectedChamp.location}`}
              </div>
            </div>
            <button onClick={() => setSelectedChamp(null)} className="text-sm text-gray-500 hover:text-gray-700">Change</button>
          </div>
        ) : showNewChamp ? (
          <div className="border rounded-lg p-4 bg-gray-50">
            <h4 className="text-sm font-medium mb-3">Create New Championship</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <input type="text" placeholder="Championship Name *" value={newChamp.name}
                  onChange={(e) => setNewChamp({ ...newChamp, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <select value={newChamp.country} onChange={(e) => setNewChamp({ ...newChamp, country: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Country *</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <select value={newChamp.pool} onChange={(e) => setNewChamp({ ...newChamp, pool: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <input type="date" value={newChamp.date}
                  onChange={(e) => setNewChamp({ ...newChamp, date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                <span className="text-xs text-gray-400">Start Date *</span>
              </div>
              <div>
                <input type="date" value={newChamp.end_date}
                  onChange={(e) => setNewChamp({ ...newChamp, end_date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                <span className="text-xs text-gray-400">End Date</span>
              </div>
              <div className="col-span-2">
                <input type="text" placeholder="Location" value={newChamp.location}
                  onChange={(e) => setNewChamp({ ...newChamp, location: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <select value={newChamp.classification} onChange={(e) => setNewChamp({ ...newChamp, classification: e.target.value, sub_classification: '' })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Classification</option>
                  {classifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <select value={newChamp.sub_classification} onChange={(e) => setNewChamp({ ...newChamp, sub_classification: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!subClassifications.length}>
                  <option value="">Sub Classification</option>
                  {subClassifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleCreateChamp}
                disabled={!newChamp.name || !newChamp.country || !newChamp.date}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                Create Championship
              </button>
              <button onClick={() => setShowNewChamp(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="relative" ref={champDropdownRef}>
              <input type="text" placeholder="Search championships by name..." value={champQuery}
                onChange={(e) => handleChampSearch(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
              {champResults.length > 0 && (
                <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-lg max-h-48 overflow-y-auto">
                  {champResults.map(c => (
                    <button key={c.id} onClick={() => { setSelectedChamp(c); setChampResults([]); setChampQuery('') }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center justify-between">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-gray-400">{c.date} &middot; {c.pool}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setShowNewChamp(true)} className="text-blue-600 text-sm mt-2 hover:text-blue-800">
              + Create New Championship
            </button>
          </div>
        )}
      </div>

      {/* Section C: Result */}
      <div className="bg-white rounded-lg border p-5">
        <h3 className="font-semibold mb-3">3. Result Details *</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Event *</label>
            <select value={resultForm.event} onChange={(e) => setResultForm({ ...resultForm, event: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select event</option>
              {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Time * <span className="text-xs text-gray-400">(e.g. 1:23.45 or 56.78)</span></label>
            <input type="text" value={resultForm.time} onChange={(e) => setResultForm({ ...resultForm, time: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="0:00.00" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">FINA</label>
            <input type="number" value={resultForm.fina_points} onChange={(e) => setResultForm({ ...resultForm, fina_points: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Team / Club</label>
            <input type="text" value={resultForm.team} onChange={(e) => setResultForm({ ...resultForm, team: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Club or team name at this meet" />
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <button onClick={handleSubmit} disabled={loading || !selectedSwimmer || !selectedChamp || !resultForm.event || !resultForm.time}
          className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
          {loading ? 'Adding Result...' : 'Add Result'}
        </button>
      </div>
    </div>
  )
}
