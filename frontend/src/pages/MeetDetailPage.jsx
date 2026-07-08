import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getChampionship, getChampionshipResults, getChampionshipStats, getChampionshipCountrySwimmers, updateResult, deleteResult } from '../api/championships'
import CountryFlag from '../components/common/CountryFlag'
import MedalIcon from '../components/common/MedalIcon'
import AddResultsModal from '../components/championships/AddResultsModal'

// Display categories oldest → youngest, matching the source PDFs
const CATEGORY_ORDER = ['Seniors/Juniors', 'Seniors', 'Juniors', 'Cadets', 'Minimes', 'Benjamins', 'Poussins']
const catRank = (c) => {
  const i = CATEGORY_ORDER.indexOf(c)
  return i === -1 ? CATEGORY_ORDER.length : i
}

// "1:02.34" | "62.34" -> centiseconds, or null when invalid
function parseTimeToCs(text) {
  const t = (text || '').trim()
  let m = t.match(/^(\d{1,2}):(\d{2})[.,](\d{1,2})$/)
  if (m) return (+m[1]) * 6000 + (+m[2]) * 100 + +(m[3].padEnd(2, '0'))
  m = t.match(/^(\d{1,3})[.,](\d{1,2})$/)
  if (m) return (+m[1]) * 100 + +(m[2].padEnd(2, '0'))
  return null
}

export default function MeetDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [meet, setMeet] = useState(null)
  const [stats, setStats] = useState(null)
  const [results, setResults] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [selectedRound, setSelectedRound] = useState(null)
  const [loadingResults, setLoadingResults] = useState(false)
  const [expandedRelay, setExpandedRelay] = useState(null)
  const [expandedCountry, setExpandedCountry] = useState(null)
  const [countrySwimmers, setCountrySwimmers] = useState({})   // countryId -> swimmers[]
  const [loadingCountry, setLoadingCountry] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editValues, setEditValues] = useState({ time: '', team: '' })
  const [selectedCategory, setSelectedCategory] = useState(null)  // null = all

  useEffect(() => {
    getChampionship(id).then(res => setMeet(res.data)).catch(() => {})
    getChampionshipStats(id).then(res => setStats(res.data)).catch(() => {})
  }, [id])

  const refreshStats = () => getChampionshipStats(id).then(res => setStats(res.data)).catch(() => {})

  const refreshResults = async () => {
    if (!selectedEvent) return
    try {
      const params = { event: selectedEvent.event_id, gender: selectedEvent.gender, all_rounds: 1 }
      const res = await getChampionshipResults(id, params)
      setResults(res.data)
    } catch { /* keep current */ }
  }

  const startEditRow = (r) => {
    setEditingId(r.id)
    setEditValues({ time: r.formatted_time || '', team: r.team || '' })
  }

  const saveEditRow = async (r) => {
    const cs = parseTimeToCs(editValues.time)
    if (!cs) { alert('Invalid time — use 1:02.34 or 28.75'); return }
    try {
      await updateResult(r.id, { time_centiseconds: cs, team: editValues.team })
      setEditingId(null)
      await Promise.all([refreshResults(), refreshStats()])
    } catch {
      alert('Failed to save the result')
    }
  }

  const removeRow = async (r) => {
    if (!window.confirm(`Delete ${r.swimmer_detail?.name}'s ${selectedEvent?.event_name} result (${r.formatted_time})?`)) return
    try {
      await deleteResult(r.id)
      await Promise.all([refreshResults(), refreshStats()])
    } catch {
      alert('Failed to delete the result')
    }
  }

  // Round display order: finals first, then semis/consolation, prelims/heats
  const ROUND_ORDER = ['Finals', 'Consolation', 'Prelims', 'Heats', '']
  const roundLabel = (r) => r || 'Timed Finals'

  const handleEventClick = async (event) => {
    setSelectedEvent(event)
    setSelectedRound(null)
    setSelectedCategory(null)
    setExpandedRelay(null)
    setLoadingResults(true)
    try {
      const params = { event: event.event_id, gender: event.gender, all_rounds: 1 }
      const res = await getChampionshipResults(id, params)
      setResults(res.data)
      // Default to the most important round present (Finals if available)
      const rounds = [...new Set(res.data.map(r => r.round_type || ''))]
      rounds.sort((a, b) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b))
      setSelectedRound(rounds[0] ?? '')
    } catch {
      setResults([])
    } finally {
      setLoadingResults(false)
    }
  }

  const handleCountryClick = async (countryId) => {
    if (expandedCountry === countryId) {
      setExpandedCountry(null)
      return
    }
    setExpandedCountry(countryId)
    if (!countrySwimmers[countryId]) {
      setLoadingCountry(countryId)
      try {
        const res = await getChampionshipCountrySwimmers(id, countryId)
        setCountrySwimmers(prev => ({ ...prev, [countryId]: res.data }))
      } catch {
        // don't cache the failure — leave it unset so the next click retries
      } finally {
        setLoadingCountry(null)
      }
    }
  }

  if (!meet || !stats) return <div className="text-center py-12 text-gray-400">Loading...</div>

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/calendar')} className="text-gray-500 hover:text-gray-700">← Back</button>
      </div>

      {/* Meet Banner */}
      <div className="bg-gradient-to-r from-sky-600 to-sky-500 text-white rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">{meet.name}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sky-100 text-sm">
              {meet.country_detail && (
                <span className="flex items-center gap-1.5">
                  <img src={`https://flagcdn.com/w40/${meet.country_detail.flag_url || meet.country_detail.code?.toLowerCase().slice(0,2)}.png`} alt="" className="w-5 h-3.5 rounded-sm" />
                  {meet.country_detail.name}
                </span>
              )}
              {meet.location && <span>{meet.location}</span>}
              <span>{meet.date}{meet.end_date ? ` to ${meet.end_date}` : ''}</span>
              <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-medium">{meet.pool}</span>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="shrink-0 flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition-colors px-3.5 py-2 rounded-lg text-sm font-medium"
          >
            <span className="text-base leading-none">＋</span> Add Results
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
          <div className="bg-white/15 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{stats.total_swimmers}</div>
            <div className="text-xs text-sky-200">Swimmers</div>
          </div>
          <div className="bg-white/15 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{stats.total_results}</div>
            <div className="text-xs text-sky-200">Results</div>
          </div>
          <div className="bg-white/15 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{stats.events.length}</div>
            <div className="text-xs text-sky-200">Events</div>
          </div>
          <div className="bg-white/15 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{stats.male_count}</div>
            <div className="text-xs text-sky-200">Male</div>
          </div>
          <div className="bg-white/15 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{stats.female_count}</div>
            <div className="text-xs text-sky-200">Female</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Left: Countries + Events */}
        <div className="space-y-4">
          {/* Countries */}
          <div className="bg-white rounded-lg border">
            <div className="p-3 border-b">
              <h3 className="font-semibold text-sm">Countries ({stats.countries.length})</h3>
            </div>
            <div className="divide-y max-h-96 overflow-y-auto">
              {stats.countries.map((c, i) => {
                const countryId = c.swimmer__nationality__id
                const isOpen = expandedCountry === countryId
                const swimmers = countrySwimmers[countryId]
                return (
                  <div key={countryId ?? i}>
                    <button
                      onClick={() => handleCountryClick(countryId)}
                      className={`w-full flex items-center justify-between px-3 py-2 transition-colors hover:bg-gray-50 ${
                        isOpen ? 'bg-sky-50' : ''
                      }`}
                    >
                      <CountryFlag
                        code={c.swimmer__nationality__code}
                        flagUrl={c.swimmer__nationality__flag_url}
                        name={c.swimmer__nationality__name}
                        className="text-sm"
                      />
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span><span className="font-medium text-gray-700">{c.swimmers_count}</span> swimmers</span>
                        <svg
                          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="bg-gray-50 border-t border-gray-100">
                        {loadingCountry === countryId ? (
                          <div className="px-3 py-3 text-xs text-gray-400 text-center">Loading swimmers...</div>
                        ) : (swimmers || []).length === 0 ? (
                          <div className="px-3 py-3 text-xs text-gray-400 text-center">No individual swimmers</div>
                        ) : (
                          swimmers.map(s => (
                            <button
                              key={s.swimmer_id}
                              onClick={() => navigate(`/swimmers/${s.swimmer_id}`)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white transition-colors group"
                            >
                              <div className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-bold">
                                {s.photo ? (
                                  <img src={s.photo} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  s.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-gray-800 truncate group-hover:text-sky-600">
                                  {s.name}
                                </div>
                                <div className="text-[11px] text-gray-400">
                                  {s.events_count} {s.events_count === 1 ? 'event' : 'events'}
                                  {s.best_fina > 0 && (
                                    <> · best <span className="font-mono text-sky-600 font-semibold">{s.best_time}</span> ({s.best_event})</>
                                  )}
                                </div>
                              </div>
                              <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                s.sex === 'F' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'
                              }`}>
                                {s.sex}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Events */}
          <div className="bg-white rounded-lg border">
            <div className="p-3 border-b">
              <h3 className="font-semibold text-sm">Events ({stats.events.length})</h3>
            </div>
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {stats.events.map((e, i) => {
                const isSelected = selectedEvent?.event_id === e.event_id && selectedEvent?.gender === e.gender
                const prevGender = i > 0 ? stats.events[i-1].gender : null
                const showDivider = prevGender && prevGender !== e.gender
                return (
                  <div key={`${e.event_id}-${e.gender}`}>
                    {showDivider && (
                      <div className="bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-500 uppercase">
                        {e.gender_label}
                      </div>
                    )}
                    {i === 0 && (
                      <div className="bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-500 uppercase">
                        {e.gender_label}
                      </div>
                    )}
                    <button
                      onClick={() => handleEventClick(e)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors ${
                        isSelected ? 'bg-sky-50 border-l-4 border-sky-500' : ''
                      }`}
                    >
                      <div className="text-sm font-medium">{e.event_name}</div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span>{e.results_count} results</span>
                        <span className="text-sky-600 font-mono font-semibold">{e.best_time}</span>
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right: Results Table or Top Performers */}
        <div>
          {!selectedEvent ? (
            <div>
              {/* Top Performers */}
              {stats.top_performers.length > 0 && (
                <div className="bg-white rounded-lg border">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold">Top Performers</h3>
                    <p className="text-xs text-gray-500 mt-1">Highest FINA at this championship</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">#</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Swimmer</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Nationality</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Event</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Time</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">FINA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {stats.top_performers.map((t, i) => (
                          <tr key={i} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/swimmers/${t.swimmer_id}`)}>
                            <td className="px-4 py-2 text-sm text-gray-500">{i + 1}</td>
                            <td className="px-4 py-2 text-sm font-medium">{t.swimmer_name}</td>
                            <td className="px-4 py-2 text-sm">
                              <CountryFlag code={t.nationality_code} flagUrl={t.flag_url} name={t.nationality} />
                            </td>
                            <td className="px-4 py-2 text-sm">{t.event_name}</td>
                            <td className="px-4 py-2 text-sm font-mono">{t.time}</td>
                            <td className="px-4 py-2 text-sm font-bold text-sky-600">{t.fina_points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {stats.top_performers.length === 0 && (
                <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
                  <div className="text-5xl mb-3">🏊</div>
                  <p className="text-lg font-medium mb-1">Select an event to view results</p>
                  <p className="text-sm">Click any event on the left to see all times</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{selectedEvent.event_name} — {selectedEvent.gender_label || ({M: 'Men', F: 'Women', X: 'Mixed'}[selectedEvent.gender] || 'Men')}</h3>
                  <p className="text-xs text-gray-500">{results.length} results</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditMode(m => !m); setEditingId(null) }}
                    className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                      editMode
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {editMode ? 'Done editing' : '✎ Edit'}
                  </button>
                  <button onClick={() => { setSelectedEvent(null); setResults([]); setSelectedRound(null); setEditMode(false); setEditingId(null) }} className="text-sm text-gray-500 hover:text-gray-700">
                    ← All events
                  </button>
                </div>
              </div>

              {/* Round tabs (Finals / Prelims / Heats) */}
              {!loadingResults && (() => {
                const rounds = [...new Set(results.map(r => r.round_type || ''))]
                if (rounds.length <= 1) return null
                rounds.sort((a, b) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b))
                return (
                  <div className="flex gap-2 px-4 pt-3 border-b">
                    {rounds.map(round => {
                      const count = results.filter(r => (r.round_type || '') === round).length
                      const active = selectedRound === round
                      return (
                        <button
                          key={round || '_timed'}
                          onClick={() => { setSelectedRound(round); setSelectedCategory(null); setExpandedRelay(null) }}
                          className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
                            active
                              ? 'bg-sky-600 text-white border-sky-600'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {roundLabel(round)}
                          <span className={`ml-1.5 text-xs ${active ? 'text-sky-200' : 'text-gray-400'}`}>{count}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Age category filter pills */}
              {!loadingResults && (() => {
                const roundResults = results.filter(r => (r.round_type || '') === (selectedRound ?? ''))
                const cats = [...new Set(roundResults.map(r => r.category || ''))]
                if (cats.filter(c => c !== '').length === 0 || cats.length <= 1) return null
                cats.sort((a, b) => catRank(a) - catRank(b))
                // Auto-select first category when none is selected
                if (selectedCategory === null && cats.length > 0) {
                  setTimeout(() => setSelectedCategory(cats[0]), 0)
                }
                const pill = (active) => `px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  active
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-sky-300 hover:text-sky-600'
                }`
                return (
                  <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b bg-gray-50/60">
                    {cats.map(cat => {
                      const active = selectedCategory === cat
                      return (
                        <button key={cat || '_general'} onClick={() => setSelectedCategory(cat)} className={pill(active)}>
                          {cat || 'General'}
                        </button>
                      )
                    })}
                  </div>
                )
              })()}

              {loadingResults ? (
                <div className="p-12 text-center text-gray-400">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Rank</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Swimmer</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Age</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Nationality</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Team</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Time</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">FINA</th>
                        {editMode && <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(() => {
                        // Show only the selected round (Finals / Prelims / Heats)
                        const roundResults = results.filter(r => (r.round_type || '') === (selectedRound ?? ''))
                        // Medals belong to the round that decides the ranking:
                        // Finals, or the only round swum (timed finals)
                        const roundsPresent = new Set(results.map(r => r.round_type || ''))
                        const showMedals = selectedRound === 'Finals' || roundsPresent.size <= 1

                        // Group results by age category (meets split by category).
                        // Results arrive time-sorted, so each category keeps its
                        // own ranking (medals restart per category).
                        const catFiltered = selectedCategory === null
                          ? roundResults
                          : roundResults.filter(r => (r.category || '') === selectedCategory)
                        const order = []
                        const byCat = new Map()
                        for (const r of catFiltered) {
                          const cat = r.category || ''
                          if (!byCat.has(cat)) { byCat.set(cat, []); order.push(cat) }
                          byCat.get(cat).push(r)
                        }
                        order.sort((a, b) => catRank(a) - catRank(b))
                        // Category header rows only in the "All" view — a
                        // selected pill already names the category.
                        const hasCategories = selectedCategory === null && order.some(c => c !== '')
                        const isRelay = selectedEvent?.event_name?.toLowerCase().includes('relay')

                        const renderRow = (r, i, arr) => {
                          // Competition ranking: tied times share a rank (1,2,2,4)
                          const rank = arr.findIndex(x => x.time_centiseconds === r.time_centiseconds) + 1
                          const isBest = rank === 1
                          const isExpanded = expandedRelay === r.id
                          const swimmers = r.relay_swimmers || []
                          const isEditing = editingId === r.id
                          return (
                            <React.Fragment key={r.id}>
                              <tr
                                className={`hover:bg-gray-50 ${editMode ? '' : 'cursor-pointer'} ${isBest ? 'bg-amber-50' : ''} ${isEditing ? 'bg-sky-50' : ''}`}
                                onClick={() => {
                                  if (editMode) return
                                  if (isRelay && swimmers.length > 0) {
                                    setExpandedRelay(isExpanded ? null : r.id)
                                  } else {
                                    navigate(`/swimmers/${r.swimmer_detail?.id || r.swimmer}`)
                                  }
                                }}
                              >
                                <td className="px-4 py-2 text-sm">
                                  {showMedals && rank === 1 && <MedalIcon type="gold" size={22} />}
                                  {showMedals && rank === 2 && <MedalIcon type="silver" size={22} />}
                                  {showMedals && rank === 3 && <MedalIcon type="bronze" size={22} />}
                                  {(!showMedals || rank > 3) && <span className="text-gray-500">{rank}</span>}
                                </td>
                                <td className="px-4 py-2 text-sm font-medium">
                                  {r.swimmer_detail?.name}
                                  {isRelay && swimmers.length > 0 && (
                                    <span className="ml-2 text-xs text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-500">{r.age_at_competition || '-'}</td>
                                <td className="px-4 py-2 text-sm">
                                  <CountryFlag
                                    code={r.swimmer_detail?.nationality_detail?.code}
                                    flagUrl={r.swimmer_detail?.nationality_detail?.flag_url}
                                    name={r.swimmer_detail?.nationality_detail?.name}
                                  />
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-500">
                                  {isEditing ? (
                                    <input
                                      value={editValues.team}
                                      onChange={e => setEditValues(v => ({ ...v, team: e.target.value }))}
                                      className="w-28 border rounded px-1.5 py-1 text-sm"
                                      placeholder="Club"
                                    />
                                  ) : (r.team || '-')}
                                </td>
                                <td className="px-4 py-2 text-sm font-mono font-semibold">
                                  {isEditing ? (
                                    <input
                                      value={editValues.time}
                                      onChange={e => setEditValues(v => ({ ...v, time: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Enter') saveEditRow(r); if (e.key === 'Escape') setEditingId(null) }}
                                      className="w-24 border rounded px-1.5 py-1 text-sm font-mono"
                                      autoFocus
                                    />
                                  ) : r.formatted_time}
                                </td>
                                <td className="px-4 py-2 text-sm">{r.fina_points || '-'}</td>
                                {editMode && (
                                  <td className="px-4 py-2 text-right whitespace-nowrap">
                                    {isEditing ? (
                                      <>
                                        <button onClick={() => saveEditRow(r)} className="text-xs px-2 py-1 rounded bg-sky-600 text-white hover:bg-sky-700 mr-1">Save</button>
                                        <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 rounded border text-gray-500 hover:bg-gray-50">Cancel</button>
                                      </>
                                    ) : (
                                      <>
                                        <button onClick={() => startEditRow(r)} title="Edit" className="text-gray-400 hover:text-sky-600 px-1.5">✎</button>
                                        <button onClick={() => removeRow(r)} title="Delete" className="text-gray-400 hover:text-red-500 px-1.5">🗑</button>
                                      </>
                                    )}
                                  </td>
                                )}
                              </tr>
                              {isRelay && isExpanded && swimmers.map((s, j) => (
                                <tr key={`${r.id}-${j}`} className="bg-blue-50">
                                  <td className="px-4 py-1.5 text-sm text-gray-400 text-right">{j + 1}</td>
                                  <td className="px-4 py-1.5 text-sm pl-8">{s.name}</td>
                                  <td className="px-4 py-1.5 text-sm" colSpan={3}></td>
                                  <td className="px-4 py-1.5 text-sm font-mono text-gray-600">{s.split_time || '-'}</td>
                                  <td className="px-4 py-1.5 text-sm" colSpan={editMode ? 2 : 1}></td>
                                </tr>
                              ))}
                            </React.Fragment>
                          )
                        }

                        if (catFiltered.length === 0) {
                          return <tr><td colSpan={editMode ? 8 : 7} className="px-4 py-8 text-center text-gray-400">No results</td></tr>
                        }

                        return order.map(cat => (
                          <React.Fragment key={cat || '_general'}>
                            {hasCategories && (
                              <tr className="bg-sky-50">
                                <td colSpan={editMode ? 8 : 7} className="px-4 py-2 text-sm font-semibold text-sky-800 uppercase tracking-wide">
                                  {cat || 'General'}
                                </td>
                              </tr>
                            )}
                            {byCat.get(cat).map((r, i, arr) => renderRow(r, i, arr))}
                          </React.Fragment>
                        ))
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddResultsModal
          championshipId={id}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { refreshStats(); refreshResults() }}
        />
      )}
    </div>
  )
}
