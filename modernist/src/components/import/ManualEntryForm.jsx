import { useState, useEffect, useRef } from 'react'
import { searchSwimmers, createSwimmer } from '../../api/swimmers'
import {
  getChampionships, createChampionship, addChampionshipResult,
  getClassifications, getSubClassifications,
} from '../../api/championships'
import { getCountries, getEvents, getFinaPointsPreview } from '../../api/core'
import { POOL_TYPES, parseTime, formatDate } from '../../utils'

const dropdownStyle = {
  position: 'absolute', zIndex: 10, width: '100%', background: 'var(--color-bg)',
  border: '1px solid var(--color-divider)', marginTop: 2, boxShadow: 'var(--shadow-md)',
  maxHeight: 200, overflowY: 'auto',
}

const dropdownItemStyle = {
  width: '100%', textAlign: 'left', padding: '8px 12px', border: 0, cursor: 'pointer',
  background: 'transparent', font: 'inherit', fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
}

function Section({ n, title, children }) {
  return (
    <div style={{ border: '1px solid var(--color-divider)', padding: 20 }}>
      <div className="kicker" style={{ marginBottom: 12 }}>{n} — {title}</div>
      {children}
    </div>
  )
}

function SelectedBox({ title, sub, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--color-accent-100)', padding: '10px 14px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{sub}</div>
      </div>
      <button type="button" className="btn btn-secondary" onClick={onChange}>Change</button>
    </div>
  )
}

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
    getCountries().then((res) => setCountries(res.data)).catch(() => {})
    getEvents().then((res) => setEvents(res.data)).catch(() => {})
    getClassifications().then((res) => setClassifications(res.data)).catch(() => {})
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
      }).then((res) => {
        if (res.data.points > 0) {
          setResultForm((f) => ({ ...f, fina_points: String(res.data.points) }))
        }
      }).catch(() => {})
    }, 400)
  }, [resultForm.time, resultForm.event, selectedSwimmer, selectedChamp])

  useEffect(() => {
    if (newChamp.classification) {
      getSubClassifications(newChamp.classification).then((res) => setSubClassifications(res.data)).catch(() => {})
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
        .then((res) => setSwimmerResults(res.data))
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
        .then((res) => setChampResults(res.data.results || res.data))
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
        event_name: events.find((e) => e.id === parseInt(resultForm.event))?.name || '',
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
      <div style={{ border: '1px solid var(--asw-fast)', padding: 32, textAlign: 'center' }}>
        <div className="kicker" style={{ color: 'var(--asw-fast)', marginBottom: 12 }}>Result added</div>
        <div style={{ fontSize: 13, marginBottom: 20 }}>
          <p style={{ fontWeight: 700, margin: '0 0 4px' }}>{success.swimmer_name}</p>
          <p style={{ margin: '0 0 4px' }}>{success.event_name} — <span className="asw-time">{success.time}</span></p>
          <p className="text-muted" style={{ margin: 0 }}>{success.championship_name}</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
          <button type="button" className="btn btn-primary" onClick={handleAddAnother}>Add another result</button>
          <button type="button" className="btn btn-secondary" onClick={handleDone}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && (
        <div style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '10px 12px', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Section A: Swimmer */}
      <Section n="1" title="Select swimmer *">
        {selectedSwimmer ? (
          <SelectedBox
            title={selectedSwimmer.name}
            sub={`${selectedSwimmer.nationality_detail?.name || ''} · ${selectedSwimmer.sex === 'M' ? 'Male' : 'Female'}${selectedSwimmer.club ? ` · ${selectedSwimmer.club}` : ''}`}
            onChange={() => setSelectedSwimmer(null)}
          />
        ) : showNewSwimmer ? (
          <div style={{ border: '1px solid var(--color-divider)', background: 'var(--color-neutral-100)', padding: 16 }}>
            <div className="micro" style={{ marginBottom: 12 }}>Create new swimmer</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="grid-2">
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Full name *</label>
                <input className="input" type="text" value={newSwimmer.name}
                  onChange={(e) => setNewSwimmer({ ...newSwimmer, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Date of birth *</label>
                <input className="input" type="date" value={newSwimmer.date_of_birth}
                  onChange={(e) => setNewSwimmer({ ...newSwimmer, date_of_birth: e.target.value })} />
              </div>
              <div className="field">
                <label>Nationality *</label>
                <select className="select" value={newSwimmer.nationality}
                  onChange={(e) => setNewSwimmer({ ...newSwimmer, nationality: e.target.value })}>
                  <option value="">Select…</option>
                  {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Sex</label>
                <select className="select" value={newSwimmer.sex}
                  onChange={(e) => setNewSwimmer({ ...newSwimmer, sex: e.target.value })}>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
              <div className="field">
                <label>Club</label>
                <input className="input" type="text" value={newSwimmer.club}
                  onChange={(e) => setNewSwimmer({ ...newSwimmer, club: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" className="btn btn-primary" onClick={handleCreateSwimmer}
                disabled={!newSwimmer.name || !newSwimmer.date_of_birth || !newSwimmer.nationality}>
                Create swimmer
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowNewSwimmer(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ position: 'relative' }} ref={swimmerDropdownRef}>
              <input className="input" type="text" placeholder="Search swimmers by name…" value={swimmerQuery}
                onChange={(e) => handleSwimmerSearch(e.target.value)} />
              {swimmerResults.length > 0 && (
                <div style={dropdownStyle}>
                  {swimmerResults.map((s) => (
                    <button key={s.id} type="button" style={dropdownItemStyle}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-neutral-100)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                      onClick={() => { setSelectedSwimmer(s); setSwimmerResults([]); setSwimmerQuery('') }}>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span className="text-muted" style={{ fontSize: 12 }}>
                        {s.nationality_detail?.name || ''} · {s.sex === 'M' ? 'M' : 'F'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 13, marginTop: 8 }}
              onClick={() => setShowNewSwimmer(true)}>
              + Create new swimmer
            </button>
          </div>
        )}
      </Section>

      {/* Section B: Championship */}
      <Section n="2" title="Select championship *">
        {selectedChamp ? (
          <SelectedBox
            title={selectedChamp.name}
            sub={`${formatDate(selectedChamp.date)} · ${selectedChamp.pool}${selectedChamp.location ? ` · ${selectedChamp.location}` : ''}`}
            onChange={() => setSelectedChamp(null)}
          />
        ) : showNewChamp ? (
          <div style={{ border: '1px solid var(--color-divider)', background: 'var(--color-neutral-100)', padding: 16 }}>
            <div className="micro" style={{ marginBottom: 12 }}>Create new championship</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="grid-2">
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Championship name *</label>
                <input className="input" type="text" value={newChamp.name}
                  onChange={(e) => setNewChamp({ ...newChamp, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Country *</label>
                <select className="select" value={newChamp.country}
                  onChange={(e) => setNewChamp({ ...newChamp, country: e.target.value })}>
                  <option value="">Select…</option>
                  {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Pool</label>
                <select className="select" value={newChamp.pool}
                  onChange={(e) => setNewChamp({ ...newChamp, pool: e.target.value })}>
                  {POOL_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Start date *</label>
                <input className="input" type="date" value={newChamp.date}
                  onChange={(e) => {
                    const date = e.target.value
                    // Pre-fill end date with the start date so the end-date
                    // picker opens in the same month (adjust the day only)
                    setNewChamp((prev) => ({
                      ...prev, date,
                      end_date: (!prev.end_date || prev.end_date < date) ? date : prev.end_date,
                    }))
                  }} />
              </div>
              <div className="field">
                <label>End date</label>
                <input className="input" type="date" value={newChamp.end_date} min={newChamp.date || undefined}
                  onChange={(e) => setNewChamp({ ...newChamp, end_date: e.target.value })} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Location</label>
                <input className="input" type="text" value={newChamp.location}
                  onChange={(e) => setNewChamp({ ...newChamp, location: e.target.value })} />
              </div>
              <div className="field">
                <label>Classification</label>
                <select className="select" value={newChamp.classification}
                  onChange={(e) => setNewChamp({ ...newChamp, classification: e.target.value, sub_classification: '' })}>
                  <option value="">Select…</option>
                  {classifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Sub classification</label>
                <select className="select" value={newChamp.sub_classification} disabled={!subClassifications.length}
                  onChange={(e) => setNewChamp({ ...newChamp, sub_classification: e.target.value })}>
                  <option value="">Select…</option>
                  {subClassifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" className="btn btn-primary" onClick={handleCreateChamp}
                disabled={!newChamp.name || !newChamp.country || !newChamp.date}>
                Create championship
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowNewChamp(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ position: 'relative' }} ref={champDropdownRef}>
              <input className="input" type="text" placeholder="Search championships by name…" value={champQuery}
                onChange={(e) => handleChampSearch(e.target.value)} />
              {champResults.length > 0 && (
                <div style={dropdownStyle}>
                  {champResults.map((c) => (
                    <button key={c.id} type="button" style={dropdownItemStyle}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-neutral-100)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                      onClick={() => { setSelectedChamp(c); setChampResults([]); setChampQuery('') }}>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <span className="text-muted" style={{ fontSize: 12 }}>{formatDate(c.date)} · {c.pool}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 13, marginTop: 8 }}
              onClick={() => setShowNewChamp(true)}>
              + Create new championship
            </button>
          </div>
        )}
      </Section>

      {/* Section C: Result */}
      <Section n="3" title="Result details *">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="grid-2">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Event *</label>
            <select className="select" value={resultForm.event}
              onChange={(e) => setResultForm({ ...resultForm, event: e.target.value })}>
              <option value="">Select event</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Time * (e.g. 1:23.45 or 56.78)</label>
            <input className="input asw-num" type="text" value={resultForm.time} placeholder="0:00.00"
              onChange={(e) => setResultForm({ ...resultForm, time: e.target.value })} />
          </div>
          <div className="field">
            <label>FINA (auto-calculated)</label>
            <input className="input asw-num" type="number" value={resultForm.fina_points}
              style={{ background: 'var(--color-accent-100)', fontWeight: 600 }}
              onChange={(e) => setResultForm({ ...resultForm, fina_points: e.target.value })} />
          </div>
          <div className="field">
            <label>Medal (optional)</label>
            <select className="select" value={resultForm.medal}
              onChange={(e) => setResultForm({ ...resultForm, medal: e.target.value })}>
              <option value="">No medal</option>
              <option value="GOLD">Gold</option>
              <option value="SILVER">Silver</option>
              <option value="BRONZE">Bronze</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Team / club</label>
            <input className="input" type="text" value={resultForm.team} placeholder="Club or team name at this meet"
              onChange={(e) => setResultForm({ ...resultForm, team: e.target.value })} />
          </div>
        </div>
      </Section>

      {/* Submit */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-primary" onClick={handleSubmit}
          disabled={loading || !selectedSwimmer || !selectedChamp || !resultForm.event || !resultForm.time}>
          {loading ? 'Adding result…' : 'Add result'}
        </button>
      </div>
    </div>
  )
}
