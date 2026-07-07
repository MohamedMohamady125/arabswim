import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTeamProfile, getTeamTimes, getTeamMedals } from '../api/teams'
import CountryFlag from '../components/common/CountryFlag'
import MedalIcon from '../components/common/MedalIcon'

export default function TeamProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [times, setTimes] = useState([])
  const [medals, setMedals] = useState([])
  const [timesLoaded, setTimesLoaded] = useState(false)
  const [medalsLoaded, setMedalsLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState('team')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    setTimesLoaded(false)
    setMedalsLoaded(false)
    setTimes([])
    setMedals([])
    getTeamProfile(id)
      .then(res => {
        setProfile(res.data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'Failed to load team profile')
        setLoading(false)
      })
  }, [id])

  useEffect(() => {
    if (activeTab === 'times' && !timesLoaded) {
      getTeamTimes(id).then(res => { setTimes(res.data); setTimesLoaded(true) }).catch(() => {})
    }
    if (activeTab === 'medals' && !medalsLoaded) {
      getTeamMedals(id).then(res => { setMedals(res.data); setMedalsLoaded(true) }).catch(() => {})
    }
  }, [activeTab, id])

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>
  if (error) return <div className="max-w-5xl mx-auto"><div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div></div>
  if (!profile) return null

  const team = profile.team
  const country = team.country_detail

  // Group times by event
  const timesByEvent = {}
  for (const t of times) {
    const key = `${t.event_name}|${t.swimmer_sex}`
    if (!timesByEvent[key]) {
      timesByEvent[key] = { event_name: t.event_name, gender: t.swimmer_sex, is_relay: t.is_relay, results: [] }
    }
    timesByEvent[key].results.push(t)
  }

  const medalIcon = (type) => {
    if (type === 'GOLD') return <span className="inline-block w-6 h-6 rounded-full bg-yellow-400 border-2 border-yellow-500 text-center text-xs leading-5 font-bold text-yellow-800">1</span>
    if (type === 'SILVER') return <span className="inline-block w-6 h-6 rounded-full bg-gray-300 border-2 border-gray-400 text-center text-xs leading-5 font-bold text-gray-700">2</span>
    return <span className="inline-block w-6 h-6 rounded-full bg-orange-300 border-2 border-orange-400 text-center text-xs leading-5 font-bold text-orange-800">3</span>
  }

  const maxMedal = Math.max(
    profile.medal_counts.national.GOLD + profile.medal_counts.national.SILVER + profile.medal_counts.national.BRONZE,
    profile.medal_counts.international.GOLD + profile.medal_counts.international.SILVER + profile.medal_counts.international.BRONZE,
    1
  )

  return (
    <div className="max-w-6xl mx-auto">
      {/* Banner */}
      <div className="relative h-48 rounded-t-xl overflow-hidden bg-gradient-to-r from-cyan-500 to-blue-600">
        {team.banner && (
          <img src={team.banner} alt="" className="w-full h-full object-cover" />
        )}
        <div className="absolute top-4 left-4">
          <button onClick={() => navigate('/teams')} className="bg-white/80 text-gray-700 px-3 py-1 rounded text-sm hover:bg-white">
            &larr; Back
          </button>
        </div>
      </div>

      {/* Header Card */}
      <div className="bg-white border border-t-0 rounded-b-xl px-6 py-5 mb-6">
        <div className="flex items-start gap-5 -mt-14">
          {/* Logo */}
          <div className="w-24 h-24 rounded-xl bg-white border-4 border-white shadow-md flex items-center justify-center overflow-hidden shrink-0">
            {team.logo ? (
              <img src={team.logo} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl">🏊</span>
            )}
          </div>
          <div className="flex-1 pt-10">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold">{team.name}</h1>
              {team.is_national_team && (
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">National Team</span>
              )}
            </div>
            {country && (
              <CountryFlag code={country.code} flagUrl={country.flag_url} name={country.name} className="text-sm text-gray-600" />
            )}
          </div>
          <button onClick={() => navigate(`/teams/${id}/edit`)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 mt-10">
            Edit
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main content */}
        <div>
          {/* Team Info */}
          <div className="bg-white rounded-lg border p-5 mb-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {team.founded_year && (
                <div><span className="text-gray-500">Founded:</span> <span className="font-medium">{team.founded_year}</span></div>
              )}
              {team.website && (
                <div><span className="text-gray-500">Website:</span> <a href={team.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">{team.website}</a></div>
              )}
              {team.address && (
                <div className="col-span-2"><span className="text-gray-500">Address:</span> <span className="font-medium">{team.address}</span></div>
              )}
              {team.email && (
                <div><span className="text-gray-500">Email:</span> <span className="font-medium">{team.email}</span></div>
              )}
              {team.phone && (
                <div><span className="text-gray-500">Tel:</span> <span className="font-medium">{team.phone}</span></div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4">
            {['team', 'times', 'medals'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold capitalize transition-colors ${
                  activeTab === tab ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {tab === 'team' ? 'Team' : tab === 'times' ? 'Times' : 'Medals'}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'team' && (
            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b">
                <h3 className="font-semibold">Roster ({profile.roster.length})</h3>
              </div>
              {profile.roster.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No swimmers registered for this team</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nationality</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Gender</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {profile.roster.map(s => (
                        <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/swimmers/${s.id}`)}>
                          <td className="px-4 py-2 text-sm font-medium">{s.name}</td>
                          <td className="px-4 py-2 text-sm">
                            {s.nationality_detail && <CountryFlag code={s.nationality_detail.code} flagUrl={s.nationality_detail.flag_url} name={s.nationality_detail.name} />}
                          </td>
                          <td className="px-4 py-2 text-sm">{s.sex === 'M' ? 'Male' : 'Female'}</td>
                          <td className="px-4 py-2 text-sm">{s.age}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'times' && (
            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b">
                <h3 className="font-semibold">Times</h3>
              </div>
              {Object.keys(timesByEvent).length === 0 ? (
                <div className="p-8 text-center text-gray-400">No times recorded for this team</div>
              ) : (
                <div className="divide-y">
                  {Object.values(timesByEvent).map((group, gi) => (
                    <details key={gi} className="group">
                      <summary className="px-4 py-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-sm">{group.event_name}</span>
                          <span className="text-xs text-gray-500">{group.gender === 'M' ? "Men's" : "Women's"}{group.is_relay ? ' Relay' : ''}</span>
                        </div>
                        <span className="text-xs text-gray-400">{group.results.length} result{group.results.length !== 1 ? 's' : ''}</span>
                      </summary>
                      <div className="px-4 pb-3">
                        <table className="w-full">
                          <thead>
                            <tr className="text-xs text-gray-500 border-b">
                              <th className="py-1 text-left">Swimmer</th>
                              <th className="py-1 text-left">Age</th>
                              <th className="py-1 text-left">Time</th>
                              <th className="py-1 text-left">Championship</th>
                              <th className="py-1 text-left">Location</th>
                              <th className="py-1 text-left">Date</th>
                              <th className="py-1 text-left">FINA</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {group.results.map(r => (
                              <tr key={r.id} className="text-sm">
                                <td className="py-1.5 cursor-pointer text-blue-600 hover:underline"
                                  onClick={() => navigate(`/swimmers/${r.swimmer_id}`)}>
                                  {r.swimmer_name}
                                </td>
                                <td className="py-1.5 text-gray-500">{r.age_at_competition || '-'}</td>
                                <td className="py-1.5 font-mono font-semibold">{r.time}</td>
                                <td className="py-1.5 text-gray-600">{r.championship_name}</td>
                                <td className="py-1.5 text-gray-500">{r.championship_location || r.championship_country}</td>
                                <td className="py-1.5 text-gray-500">{r.championship_date}</td>
                                <td className="py-1.5">{r.fina_points || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'medals' && (
            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b">
                <h3 className="font-semibold">Medals ({medals.length})</h3>
              </div>
              {medals.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No medals recorded for this team</div>
              ) : (
                <div className="divide-y">
                  {medals.map(m => (
                    <div key={m.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
                      {medalIcon(m.medal_type)}
                      <div className="flex-1">
                        <div className="text-sm font-medium">{m.event_name}</div>
                        <div className="text-xs text-gray-500">
                          {m.swimmer_name} &middot; {m.championship_name}
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <div>{m.championship_location || m.championship_country}</div>
                        <div>{m.championship_date}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Team Profile Summary */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-bold text-lg mb-3">Team Profile</h3>

            {/* Trophies */}
            {team.trophies && team.trophies.length > 0 && (
              <div className="mb-4">
                <h4 className="font-semibold text-sm mb-2">Trophies</h4>
                <div className="space-y-1">
                  {team.trophies.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-yellow-500">🏆</span>
                      <span>{t.name} ({t.year})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Medal Breakdown */}
            <div className="mb-4">
              <h4 className="font-semibold text-sm mb-2">Medals</h4>
              {['national', 'international'].map(cat => {
                const counts = profile.medal_counts[cat]
                const total = counts.GOLD + counts.SILVER + counts.BRONZE
                if (total === 0) return null
                return (
                  <div key={cat} className="mb-2">
                    <div className="text-xs text-gray-500 capitalize mb-1">{cat}</div>
                    <div className="flex h-5 rounded overflow-hidden bg-gray-100">
                      {counts.GOLD > 0 && (
                        <div className="bg-yellow-400 h-full" style={{ width: `${(counts.GOLD / maxMedal) * 100}%` }}
                          title={`${counts.GOLD} Gold`} />
                      )}
                      {counts.SILVER > 0 && (
                        <div className="bg-gray-400 h-full" style={{ width: `${(counts.SILVER / maxMedal) * 100}%` }}
                          title={`${counts.SILVER} Silver`} />
                      )}
                      {counts.BRONZE > 0 && (
                        <div className="bg-orange-400 h-full" style={{ width: `${(counts.BRONZE / maxMedal) * 100}%` }}
                          title={`${counts.BRONZE} Bronze`} />
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1"><MedalIcon type="gold" size={18} /> {counts.GOLD}</span>
                      <span className="flex items-center gap-1"><MedalIcon type="silver" size={18} /> {counts.SILVER}</span>
                      <span className="flex items-center gap-1"><MedalIcon type="bronze" size={18} /> {counts.BRONZE}</span>
                    </div>
                  </div>
                )
              })}
              {profile.medal_counts.national.GOLD + profile.medal_counts.national.SILVER + profile.medal_counts.national.BRONZE +
               profile.medal_counts.international.GOLD + profile.medal_counts.international.SILVER + profile.medal_counts.international.BRONZE === 0 && (
                <div className="text-xs text-gray-400">No medals yet</div>
              )}
            </div>

            {/* Best Swimmers */}
            {profile.best_swimmers.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">Best Swimmers</h4>
                <div className="space-y-2">
                  {profile.best_swimmers.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded p-1 -mx-1"
                      onClick={() => navigate(`/swimmers/${s.swimmer_id}`)}>
                      <span className="text-sm">🏊</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{s.name}</div>
                      </div>
                      <span className="text-sm font-bold text-blue-600">{s.fina_points}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
