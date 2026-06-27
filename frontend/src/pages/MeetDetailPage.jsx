import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getChampionship, getChampionshipResults, getChampionshipStats } from '../api/championships'
import CountryFlag from '../components/common/CountryFlag'

export default function MeetDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [meet, setMeet] = useState(null)
  const [stats, setStats] = useState(null)
  const [results, setResults] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [loadingResults, setLoadingResults] = useState(false)

  useEffect(() => {
    getChampionship(id).then(res => setMeet(res.data))
    getChampionshipStats(id).then(res => setStats(res.data))
  }, [id])

  const handleEventClick = async (event) => {
    setSelectedEvent(event)
    setLoadingResults(true)
    try {
      const params = { event: event.event_id, gender: event.gender }
      const res = await getChampionshipResults(id, params)
      setResults(res.data)
    } catch {
      setResults([])
    } finally {
      setLoadingResults(false)
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
            <div className="text-2xl font-bold">{stats.total_events}</div>
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
            <div className="divide-y max-h-48 overflow-y-auto">
              {stats.countries.map((c, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2">
                  <CountryFlag
                    code={c.swimmer__nationality__code}
                    flagUrl={c.swimmer__nationality__flag_url}
                    name={c.swimmer__nationality__name}
                    className="text-sm"
                  />
                  <div className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{c.swimmers_count}</span> swimmers
                  </div>
                </div>
              ))}
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
                    <p className="text-xs text-gray-500 mt-1">Highest FINA points at this championship</p>
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
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">FINA Pts</th>
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
                  <h3 className="font-semibold">{selectedEvent.event_name} — {selectedEvent.gender_label || (selectedEvent.gender === 'M' ? 'Men' : 'Women')}</h3>
                  <p className="text-xs text-gray-500">{results.length} results</p>
                </div>
                <button onClick={() => { setSelectedEvent(null); setResults([]) }} className="text-sm text-gray-500 hover:text-gray-700">
                  ← All events
                </button>
              </div>

              {loadingResults ? (
                <div className="p-12 text-center text-gray-400">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Rank</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Swimmer</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Nationality</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Team</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Time</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">FINA Pts</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {results.map((r, i) => {
                        const isBest = i === 0
                        return (
                          <tr
                            key={r.id}
                            className={`hover:bg-gray-50 cursor-pointer ${isBest ? 'bg-amber-50' : ''}`}
                            onClick={() => navigate(`/swimmers/${r.swimmer_detail?.id || r.swimmer}`)}
                          >
                            <td className="px-4 py-2 text-sm">
                              {i === 0 && <span className="text-amber-500 font-bold">🥇</span>}
                              {i === 1 && <span className="text-gray-400 font-bold">🥈</span>}
                              {i === 2 && <span className="text-orange-400 font-bold">🥉</span>}
                              {i > 2 && <span className="text-gray-500">{i + 1}</span>}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium">{r.swimmer_detail?.name}</td>
                            <td className="px-4 py-2 text-sm">
                              <CountryFlag
                                code={r.swimmer_detail?.nationality_detail?.code}
                                flagUrl={r.swimmer_detail?.nationality_detail?.flag_url}
                                name={r.swimmer_detail?.nationality_detail?.name}
                              />
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">{r.team || '-'}</td>
                            <td className="px-4 py-2 text-sm font-mono font-semibold">{r.formatted_time}</td>
                            <td className="px-4 py-2 text-sm">{r.fina_points || '-'}</td>
                            <td className="px-4 py-2 text-sm text-gray-500">{r.age_at_competition || '-'}</td>
                          </tr>
                        )
                      })}
                      {results.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No results</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
