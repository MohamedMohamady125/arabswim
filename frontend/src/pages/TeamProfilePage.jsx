import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Waves, Trophy, Globe, Mail, Phone, MapPin, CalendarDays, Loader2, Medal as MedalLucide, Users } from 'lucide-react'
import { getTeamProfile, getTeamTimes, getTeamMedals, getTeamProgression } from '../api/teams'
import ProgressionChart from '../components/common/ProgressionChart'
import CountryFlag from '../components/common/CountryFlag'
import MedalIcon from '../components/common/MedalIcon'
import { Button, Badge, Card, Tabs, SegmentedControl, Select, Skeleton, EmptyState } from '../components/ui'
import { SwimmerCell, TimeDisplay } from '../components/domain'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../utils/constants'

export default function TeamProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()
  const isAdmin = !!token
  const [profile, setProfile] = useState(null)
  const [times, setTimes] = useState([])
  const [medals, setMedals] = useState([])
  const [timesLoaded, setTimesLoaded] = useState(false)
  const [medalsLoaded, setMedalsLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState('team')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progStroke, setProgStroke] = useState('Freestyle')
  const [progPool, setProgPool] = useState('LCM')
  const [progLines, setProgLines] = useState([])
  const [progLoading, setProgLoading] = useState(false)
  const [progLoaded, setProgLoaded] = useState(false)
  const [timesYear, setTimesYear] = useState('')

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
    if (activeTab === 'times') {
      const params = {}
      if (timesYear) params.year = timesYear
      getTeamTimes(id, params).then(res => { setTimes(res.data); setTimesLoaded(true) }).catch(() => {})
    }
    if (activeTab === 'medals' && !medalsLoaded) {
      getTeamMedals(id).then(res => { setMedals(res.data); setMedalsLoaded(true) }).catch(() => {})
    }
  }, [activeTab, id, timesYear])

  useEffect(() => {
    if (activeTab === 'progression') {
      setProgLoading(true)
      getTeamProgression(id, { stroke: progStroke, pool: progPool })
        .then(res => { setProgLines(res.data); setProgLoaded(true) })
        .catch(() => setProgLines([]))
        .finally(() => setProgLoading(false))
    }
  }, [activeTab, id, progStroke, progPool])

  if (loading) return (
    <div className="max-w-6xl mx-auto space-y-4">
      <Skeleton className="h-32 sm:h-48 w-full rounded-lg" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
  if (error) return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-neg/5 border border-neg/20 text-neg p-4 rounded-md text-body-sm">{error}</div>
    </div>
  )
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
    if (type === 'GOLD') return <span className="inline-block w-6 h-6 rounded-full bg-gold/20 border-2 border-gold text-center text-body-sm leading-5 font-bold text-gold tnum">1</span>
    if (type === 'SILVER') return <span className="inline-block w-6 h-6 rounded-full bg-silver/20 border-2 border-silver text-center text-body-sm leading-5 font-bold text-silver tnum">2</span>
    return <span className="inline-block w-6 h-6 rounded-full bg-bronze/20 border-2 border-bronze text-center text-body-sm leading-5 font-bold text-bronze tnum">3</span>
  }

  const maxMedal = Math.max(
    profile.medal_counts.national.GOLD + profile.medal_counts.national.SILVER + profile.medal_counts.national.BRONZE,
    profile.medal_counts.international.GOLD + profile.medal_counts.international.SILVER + profile.medal_counts.international.BRONZE,
    1
  )

  return (
    <div className="max-w-6xl mx-auto">
      {/* Banner */}
      <div className="relative h-32 sm:h-48 rounded-t-lg overflow-hidden bg-gradient-to-br from-ink-950 to-ink-900">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-aqua-600 via-aqua-400 to-aqua-600 z-10" />
        {team.banner && (
          <img src={team.banner} alt="" className="w-full h-full object-cover" />
        )}
        <div className="absolute top-3 start-3 sm:top-4 sm:start-4 z-10">
          <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => navigate('/teams')}>
            Back
          </Button>
        </div>
      </div>

      {/* Header Card */}
      <div className="bg-white border border-ink-100 border-t-0 rounded-b-lg shadow-card px-4 sm:px-6 py-4 sm:py-5 mb-4 sm:mb-6">
        <div className="flex items-start gap-3 sm:gap-5 -mt-10 sm:-mt-14">
          {/* Logo */}
          <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-md bg-white border-4 border-white shadow-pop flex items-center justify-center overflow-hidden shrink-0">
            {team.logo ? (
              <img src={team.logo} alt="" className="w-full h-full object-cover" />
            ) : (
              <Waves size={32} className="text-ink-400" />
            )}
          </div>
          <div className="flex-1 pt-6 sm:pt-10 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
              <h1 className="font-display font-bold text-[20px] leading-7 sm:text-[28px] sm:leading-[34px] text-ink-900 break-words min-w-0">{team.name}</h1>
              {team.is_national_team && <Badge variant="aqua">National Team</Badge>}
            </div>
            {country && (
              <CountryFlag code={country.code} flagUrl={country.flag_url} name={country.name} className="text-body-sm text-ink-500" />
            )}
          </div>
          {isAdmin && (
            <Button variant="ghost" size="sm" icon={Pencil} className="mt-6 sm:mt-10 shrink-0"
              onClick={() => navigate(`/teams/${id}/edit`)}>
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 lg:gap-6">
        {/* Main content */}
        <div className="min-w-0">
          {/* Team Info */}
          <Card className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm break-words">
              {team.founded_year && (
                <div className="flex items-center gap-2">
                  <CalendarDays size={15} className="text-ink-400 shrink-0" />
                  <span className="text-ink-500">Founded:</span> <span className="font-medium text-ink-900 tnum">{team.founded_year}</span>
                </div>
              )}
              {team.website && (
                <div className="min-w-0 flex items-center gap-2">
                  <Globe size={15} className="text-ink-400 shrink-0" />
                  <span className="text-ink-500">Website:</span>{' '}
                  <a href={team.website} target="_blank" rel="noreferrer" className="text-aqua-600 hover:underline font-medium break-all">{team.website}</a>
                </div>
              )}
              {team.address && (
                <div className="sm:col-span-2 flex items-center gap-2">
                  <MapPin size={15} className="text-ink-400 shrink-0" />
                  <span className="text-ink-500">Address:</span> <span className="font-medium text-ink-900">{team.address}</span>
                </div>
              )}
              {team.email && (
                <div className="flex items-center gap-2">
                  <Mail size={15} className="text-ink-400 shrink-0" />
                  <span className="text-ink-500">Email:</span> <span className="font-medium text-ink-900">{team.email}</span>
                </div>
              )}
              {team.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={15} className="text-ink-400 shrink-0" />
                  <span className="text-ink-500">Tel:</span> <span className="font-medium text-ink-900 tnum">{team.phone}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Tabs */}
          <Tabs
            className="mb-4 rounded-t-md"
            tabs={[
              { key: 'team', label: 'Team' },
              { key: 'times', label: 'Times' },
              { key: 'medals', label: 'Medals' },
              { key: 'progression', label: 'Progression' },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />

          {/* Tab Content */}
          {activeTab === 'team' && (
            <Card title={`Roster (${profile.roster.length})`} padding="none">
              {profile.roster.length === 0 ? (
                <EmptyState icon={Users} title="No swimmers registered" hint="No swimmers registered for this team." />
              ) : (
                <div className="overflow-x-auto max-w-full min-w-0">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-ink-50 border-b border-ink-100">
                        <th scope="col" className="px-3 sm:px-4 py-2.5 text-start text-label text-ink-400">Name</th>
                        <th scope="col" className="px-3 sm:px-4 py-2.5 text-start text-label text-ink-400">Nationality</th>
                        <th scope="col" className="px-3 sm:px-4 py-2.5 text-start text-label text-ink-400">Gender</th>
                        <th scope="col" className="px-3 sm:px-4 py-2.5 text-end text-label text-ink-400">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {profile.roster.map(s => (
                        <tr key={s.id} className="h-11 hover:bg-ink-50 cursor-pointer transition-colors" onClick={() => navigate(`/swimmers/${s.id}`)}>
                          <td className="px-3 sm:px-4 py-2.5">
                            <SwimmerCell
                              name={s.name}
                              countryCode={s.nationality_detail?.code}
                              flagUrl={s.nationality_detail?.flag_url}
                            />
                          </td>
                          <td className="px-3 sm:px-4 py-2.5 text-body-sm text-ink-500">{s.nationality_detail?.name || '-'}</td>
                          <td className="px-3 sm:px-4 py-2.5 text-body-sm text-ink-500">{s.sex === 'M' ? 'Male' : 'Female'}</td>
                          <td className="px-3 sm:px-4 py-2.5 text-body-sm text-ink-900 text-end tnum">{s.age}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {activeTab === 'times' && (
            <Card
              title="Times"
              padding="none"
              action={
                <Select
                  value={timesYear}
                  onChange={e => setTimesYear(e.target.value)}
                  className="w-32"
                  aria-label="Filter times by year"
                >
                  <option value="">All Years</option>
                  {(() => {
                    const years = []
                    for (let y = new Date().getFullYear(); y >= 2000; y--) years.push(y)
                    return years.map(y => <option key={y} value={y}>{y}</option>)
                  })()}
                </Select>
              }
            >
              {Object.keys(timesByEvent).length === 0 ? (
                <EmptyState icon={Waves} title="No times recorded" hint="No times recorded for this team." />
              ) : (
                <div className="divide-y divide-ink-100">
                  {Object.values(timesByEvent).map((group, gi) => (
                    <details key={gi} className="group">
                      <summary className="px-3 sm:px-4 py-3 min-h-11 cursor-pointer hover:bg-ink-50 flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
                          <span className="font-medium text-body-sm text-ink-900">{group.event_name}</span>
                          <span className="text-body-sm text-ink-500 whitespace-nowrap">{group.gender === 'M' ? "Men's" : "Women's"}{group.is_relay ? ' Relay' : ''}</span>
                        </div>
                        <span className="text-body-sm text-ink-400 tnum whitespace-nowrap shrink-0">{group.results.length} result{group.results.length !== 1 ? 's' : ''}</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 overflow-x-auto max-w-full min-w-0">
                        <table className="w-full min-w-[560px] sm:min-w-0">
                          <thead>
                            <tr className="text-label text-ink-400 border-b border-ink-100">
                              <th scope="col" className="py-1.5 text-start font-semibold">Swimmer</th>
                              <th scope="col" className="py-1.5 text-start font-semibold">Club/Team</th>
                              <th scope="col" className="py-1.5 text-end font-semibold">Age</th>
                              <th scope="col" className="py-1.5 text-end font-semibold">Time</th>
                              <th scope="col" className="py-1.5 text-start font-semibold ps-4">Championship</th>
                              <th scope="col" className="py-1.5 text-start font-semibold">Location</th>
                              <th scope="col" className="py-1.5 text-start font-semibold">Date</th>
                              <th scope="col" className="py-1.5 text-end font-semibold">FINA</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ink-100">
                            {group.results.map(r => (
                              <tr key={r.id} className="text-body-sm">
                                <td className="py-2 cursor-pointer text-aqua-600 hover:underline"
                                  onClick={() => navigate(`/swimmers/${r.swimmer_id}`)}>
                                  {r.swimmer_name}
                                </td>
                                <td className="py-2 text-ink-500">{r.team && r.team.toLowerCase() !== team.name.toLowerCase() ? r.team : ''}</td>
                                <td className="py-2 text-ink-500 text-end tnum">{r.age_at_competition || '-'}</td>
                                <td className="py-2 text-end"><TimeDisplay time={r.time} /></td>
                                <td className="py-2 text-ink-500 ps-4">{r.championship_name}</td>
                                <td className="py-2 text-ink-500">{r.championship_location || r.championship_country}</td>
                                <td className="py-2 text-ink-500 whitespace-nowrap">{formatDate(r.championship_date)}</td>
                                <td className="py-2 text-end tnum">{r.fina_points || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </Card>
          )}

          {activeTab === 'medals' && (
            <div className="space-y-4">
              {/* National vs International Analysis */}
              {(() => {
                const natTotal = profile.medal_counts.national.GOLD + profile.medal_counts.national.SILVER + profile.medal_counts.national.BRONZE
                const intTotal = profile.medal_counts.international.GOLD + profile.medal_counts.international.SILVER + profile.medal_counts.international.BRONZE
                const grandTotal = natTotal + intTotal
                if (grandTotal === 0) return null
                const barMax = Math.max(natTotal, intTotal, 1)
                return (
                  <Card title="Medal Analysis">
                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-5">
                      <div className="bg-ink-50 rounded-md p-3 text-center">
                        <div className="text-time-lg text-ink-900">{grandTotal}</div>
                        <div className="text-label text-ink-400">Total Medals</div>
                      </div>
                      <div className="bg-aqua-50 rounded-md p-3 text-center">
                        <div className="text-time-lg text-aqua-600">{intTotal}</div>
                        <div className="text-label text-ink-400">International</div>
                      </div>
                      <div className="bg-ink-50 rounded-md p-3 text-center">
                        <div className="text-time-lg text-ink-700">{natTotal}</div>
                        <div className="text-label text-ink-400">National</div>
                      </div>
                    </div>
                    {/* National vs International bars */}
                    <div className="space-y-3">
                      {[
                        { label: 'International', counts: profile.medal_counts.international, total: intTotal },
                        { label: 'National', counts: profile.medal_counts.national, total: natTotal },
                      ].map(cat => (
                        <div key={cat.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-body-sm font-semibold text-ink-700">{cat.label}</span>
                            <span className="text-body-sm font-bold text-ink-900 tnum">{cat.total}</span>
                          </div>
                          <div className="flex h-7 rounded-sm overflow-hidden bg-ink-50">
                            {cat.counts.GOLD > 0 && (
                              <div className="bg-gold h-full flex items-center justify-center text-body-sm font-bold text-white transition-all duration-500 tnum"
                                style={{ width: `${(cat.counts.GOLD / barMax) * 100}%`, minWidth: cat.counts.GOLD > 0 ? '24px' : 0 }}>
                                {cat.counts.GOLD}
                              </div>
                            )}
                            {cat.counts.SILVER > 0 && (
                              <div className="bg-silver h-full flex items-center justify-center text-body-sm font-bold text-white transition-all duration-500 tnum"
                                style={{ width: `${(cat.counts.SILVER / barMax) * 100}%`, minWidth: cat.counts.SILVER > 0 ? '24px' : 0 }}>
                                {cat.counts.SILVER}
                              </div>
                            )}
                            {cat.counts.BRONZE > 0 && (
                              <div className="bg-bronze h-full flex items-center justify-center text-body-sm font-bold text-white transition-all duration-500 tnum"
                                style={{ width: `${(cat.counts.BRONZE / barMax) * 100}%`, minWidth: cat.counts.BRONZE > 0 ? '24px' : 0 }}>
                                {cat.counts.BRONZE}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-body-sm text-ink-500">
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gold inline-block" /> {cat.counts.GOLD} Gold</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-silver inline-block" /> {cat.counts.SILVER} Silver</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-bronze inline-block" /> {cat.counts.BRONZE} Bronze</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Classification Breakdown */}
                    {profile.classification_breakdown && profile.classification_breakdown.length > 0 && (
                      <div className="mt-5 pt-4 border-t border-ink-100">
                        <h4 className="text-label text-ink-500 mb-3">Medals by Classification</h4>
                        <div className="space-y-2">
                          {profile.classification_breakdown.map(cls => {
                            const clsTotal = cls.GOLD + cls.SILVER + cls.BRONZE
                            return (
                              <div key={cls.name} className="flex items-center gap-2 sm:gap-3">
                                <span className="text-body-sm font-medium text-ink-500 w-20 sm:w-28 shrink-0 truncate" title={cls.name}>{cls.name}</span>
                                <div className="flex-1 flex h-5 rounded-sm overflow-hidden bg-ink-50">
                                  {cls.GOLD > 0 && (
                                    <div className="bg-gold h-full transition-all duration-500"
                                      style={{ width: `${(cls.GOLD / clsTotal) * 100}%` }} />
                                  )}
                                  {cls.SILVER > 0 && (
                                    <div className="bg-silver h-full transition-all duration-500"
                                      style={{ width: `${(cls.SILVER / clsTotal) * 100}%` }} />
                                  )}
                                  {cls.BRONZE > 0 && (
                                    <div className="bg-bronze h-full transition-all duration-500"
                                      style={{ width: `${(cls.BRONZE / clsTotal) * 100}%` }} />
                                  )}
                                </div>
                                <div className="flex items-center gap-1 sm:gap-1.5 text-body-sm text-ink-500 sm:w-24 justify-end shrink-0 tnum">
                                  <MedalIcon type="gold" size={14} /><span>{cls.GOLD}</span>
                                  <MedalIcon type="silver" size={14} /><span>{cls.SILVER}</span>
                                  <MedalIcon type="bronze" size={14} /><span>{cls.BRONZE}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })()}

              {/* All Medals List */}
              <Card title={`All Medals (${medals.length})`} padding="none">
                {medals.length === 0 ? (
                  <EmptyState icon={MedalLucide} title="No medals recorded" hint="No medals recorded for this team." />
                ) : (
                  <div className="divide-y divide-ink-100">
                    {medals.map(m => (
                      <div key={m.id} className="px-3 sm:px-4 py-3 min-h-11 flex items-center gap-2.5 sm:gap-3 hover:bg-ink-50">
                        {medalIcon(m.medal_type)}
                        <div className="flex-1 min-w-0">
                          <div className="text-body-sm font-medium text-ink-900">{m.event_name}</div>
                          <div className="text-body-sm text-ink-500">
                            {m.swimmer_name} &middot; {m.championship_name}
                            {m.team && m.team.toLowerCase() !== team.name.toLowerCase() && (
                              <span className="ms-1 text-ink-400">({m.team})</span>
                            )}
                          </div>
                        </div>
                        <div className="text-end text-body-sm text-ink-500 shrink-0">
                          <div>{m.championship_location || m.championship_country}</div>
                          <div>{formatDate(m.championship_date)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {activeTab === 'progression' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <SegmentedControl
                  options={['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley'].map(s => ({
                    key: s, label: s === 'Individual Medley' ? 'IM' : s,
                  }))}
                  value={progStroke}
                  onChange={setProgStroke}
                  className="max-w-full overflow-x-auto scrollbar-hide"
                />
                <SegmentedControl
                  options={[{ key: 'LCM', label: 'LCM' }, { key: 'SCM', label: 'SCM' }]}
                  value={progPool}
                  onChange={setProgPool}
                  className="ms-auto"
                />
              </div>
              {progLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={28} className="animate-spin text-aqua-600" />
                </div>
              ) : (
                <ProgressionChart lines={progLines} showSwimmer />
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Team Profile Summary */}
          <Card title="Team Profile">
            {/* Trophies */}
            {team.trophies && team.trophies.length > 0 && (
              <div className="mb-4">
                <h4 className="text-label text-ink-500 mb-2">Trophies</h4>
                <div className="space-y-1.5">
                  {team.trophies.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-body-sm text-ink-900">
                      <Trophy size={15} className="text-gold shrink-0" />
                      <span>{t.name} <span className="text-ink-400 tnum">({t.year})</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Medal Breakdown */}
            <div className="mb-4">
              <h4 className="text-label text-ink-500 mb-2">Medals</h4>
              {['national', 'international'].map(cat => {
                const counts = profile.medal_counts[cat]
                const total = counts.GOLD + counts.SILVER + counts.BRONZE
                if (total === 0) return null
                return (
                  <div key={cat} className="mb-2">
                    <div className="text-body-sm text-ink-500 capitalize mb-1">{cat}</div>
                    <div className="flex h-5 rounded-sm overflow-hidden bg-ink-50">
                      {counts.GOLD > 0 && (
                        <div className="bg-gold h-full" style={{ width: `${(counts.GOLD / maxMedal) * 100}%` }}
                          title={`${counts.GOLD} Gold`} />
                      )}
                      {counts.SILVER > 0 && (
                        <div className="bg-silver h-full" style={{ width: `${(counts.SILVER / maxMedal) * 100}%` }}
                          title={`${counts.SILVER} Silver`} />
                      )}
                      {counts.BRONZE > 0 && (
                        <div className="bg-bronze h-full" style={{ width: `${(counts.BRONZE / maxMedal) * 100}%` }}
                          title={`${counts.BRONZE} Bronze`} />
                      )}
                    </div>
                    <div className="flex gap-3 text-body-sm text-ink-500 mt-0.5 tnum">
                      <span className="flex items-center gap-1"><MedalIcon type="gold" size={18} /> {counts.GOLD}</span>
                      <span className="flex items-center gap-1"><MedalIcon type="silver" size={18} /> {counts.SILVER}</span>
                      <span className="flex items-center gap-1"><MedalIcon type="bronze" size={18} /> {counts.BRONZE}</span>
                    </div>
                  </div>
                )
              })}
              {profile.medal_counts.national.GOLD + profile.medal_counts.national.SILVER + profile.medal_counts.national.BRONZE +
               profile.medal_counts.international.GOLD + profile.medal_counts.international.SILVER + profile.medal_counts.international.BRONZE === 0 && (
                <div className="text-body-sm text-ink-400">No medals yet</div>
              )}
            </div>

            {/* Best Swimmers */}
            {profile.best_swimmers.length > 0 && (
              <div>
                <h4 className="text-label text-ink-500 mb-2">Best Swimmers</h4>
                <div className="space-y-1">
                  {profile.best_swimmers.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 cursor-pointer hover:bg-ink-50 rounded-sm p-1.5 -mx-1.5 min-h-10"
                      onClick={() => navigate(`/swimmers/${s.swimmer_id}`)}>
                      <Waves size={15} className="text-aqua-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-body-sm font-medium text-ink-900 truncate">{s.name}</div>
                      </div>
                      <span className="text-body-sm font-bold text-aqua-600 tnum">{s.fina_points}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
