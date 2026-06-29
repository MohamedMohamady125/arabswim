import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSwimmer, getSwimmerEvents, getSwimmerEventHistory } from '../api/swimmers'
import CountryFlag from '../components/common/CountryFlag'

export default function SwimmerProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [swimmer, setSwimmer] = useState(null)
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    getSwimmer(id).then(res => setSwimmer(res.data)).catch(() => {})
    getSwimmerEvents(id).then(res => setEvents(res.data)).catch(() => {})
  }, [id])

  const handleEventClick = async (event) => {
    setSelectedEvent(event)
    setLoadingHistory(true)
    try {
      const res = await getSwimmerEventHistory(id, event.event_id)
      setHistory(res.data)
    } catch {
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  if (!swimmer) return <div className="text-center py-8 text-gray-500">Loading...</div>

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/swimmers')} className="text-gray-500 hover:text-gray-700">&larr; Back</button>
        <h1 className="text-2xl font-bold">Swimmer Profile</h1>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <div className="flex items-start gap-6">
          <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shrink-0">
            {swimmer.photo ? (
              <img src={swimmer.photo} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl text-gray-400">&#x1F464;</span>
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold mb-1">{swimmer.name}</h2>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              <CountryFlag code={swimmer.nationality_detail?.code} flagUrl={swimmer.nationality_detail?.flag_url} name={swimmer.nationality_detail?.name} />
              <span>{swimmer.sex === 'M' ? 'Male' : 'Female'}</span>
              {swimmer.age != null && <span>Age: {swimmer.age}</span>}
              {swimmer.date_of_birth ? (
                <span>DOB: {swimmer.date_of_birth}</span>
              ) : swimmer.birth_year ? (
                <span>Born: {swimmer.birth_year}</span>
              ) : null}
              {swimmer.club && <span>Club: {swimmer.club}</span>}
            </div>
            {swimmer.nicknames?.length > 0 && (
              <div className="flex gap-2 mt-2">
                {swimmer.nicknames.map((n, i) => (
                  <span key={i} className="bg-gray-100 px-2 py-0.5 rounded-full text-xs">{n.nickname}</span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => navigate(`/swimmers/${id}/edit`)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Events + History */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-6">
        {/* Events List */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Events ({events.length})</h3>
          </div>
          <div className="divide-y max-h-[500px] overflow-y-auto">
            {events.length === 0 && (
              <div className="p-4 text-sm text-gray-400 text-center">No competition results yet</div>
            )}
            {events.map((e) => (
              <button
                key={`${e.event_id}-${e.is_relay ? 'relay' : 'ind'}`}
                onClick={() => handleEventClick(e)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                  selectedEvent?.event_id === e.event_id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                }`}
              >
                <div className="font-medium text-sm">
                  {e.event_name}
                  {e.is_relay && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Relay</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                  <span className="font-mono text-blue-600 font-semibold">{e.best_time}</span>
                  <span>{e.times_count} {e.times_count === 1 ? 'time' : 'times'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Time History */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h3 className="font-semibold">
              {selectedEvent ? `${selectedEvent.event_name} — Time History` : 'Select an event to view history'}
            </h3>
          </div>
          {!selectedEvent ? (
            <div className="p-8 text-center text-gray-400">
              <div className="text-4xl mb-2">&#x1F4CA;</div>
              <p>Click on an event to see all times</p>
            </div>
          ) : loadingHistory ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Round</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Team</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Championship</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pool</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">FINA Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((h, i) => {
                    const isBest = h.time_centiseconds === Math.min(...history.map(x => x.time_centiseconds))
                    return (
                      <tr key={h.id} className={`hover:bg-gray-50 ${isBest ? 'bg-green-50' : ''}`}>
                        <td className="px-4 py-2 text-sm text-gray-500">{i + 1}</td>
                        <td className="px-4 py-2 text-sm font-mono font-semibold">
                          {h.is_relay ? (
                            <>
                              <span>{h.time}</span>
                              {h.split_time && <span className="ml-2 text-xs text-purple-600 font-normal">Split: {h.split_time}</span>}
                            </>
                          ) : (
                            <>
                              {h.time}
                              {isBest && <span className="ml-2 text-xs text-green-600 font-normal">PB</span>}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {h.round_type ? (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${h.round_type === 'Finals' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                              {h.round_type}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-2 text-sm">{h.team || '-'}</td>
                        <td className="px-4 py-2 text-sm">{h.championship_name}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{h.championship_location || h.championship_country}</td>
                        <td className="px-4 py-2 text-sm">{h.pool}</td>
                        <td className="px-4 py-2 text-sm">{h.championship_date}</td>
                        <td className="px-4 py-2 text-sm">{h.fina_points || '-'}</td>
                      </tr>
                    )
                  })}
                  {history.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No times recorded</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
