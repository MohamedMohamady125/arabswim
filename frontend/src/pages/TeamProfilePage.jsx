import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Pencil, Waves, Trophy, Globe, Mail, Phone, MapPin, CalendarDays,
  Loader2, Medal as MedalLucide, Users, BarChart3, Newspaper, Image as ImageIcon,
  Star, User, ChevronRight,
} from 'lucide-react'
import {
  getTeamProfile, getTeamTimes, getTeamMedals, getTeamProgression,
  getTeamRecords, getTeamStats, getTeamRanking,
} from '../api/teams'
import { getArticles } from '../api/news'
import { getCoaches } from '../api/coaches'
import ProgressionChart from '../components/common/ProgressionChart'
import CountryFlag from '../components/common/CountryFlag'
import MedalIcon from '../components/common/MedalIcon'
import { Button, Badge, Card, Tabs, SegmentedControl, Select, Skeleton, EmptyState, Breadcrumbs } from '../components/ui'
import { SwimmerCell, TimeDisplay, EventLabel } from '../components/domain'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../utils/constants'

const TEAM_TABS = [
  { key: 'club', label: 'Club', icon: Waves },
  { key: 'team', label: 'Team', icon: Users },
  { key: 'trophies', label: 'Trophies', icon: Trophy },
  { key: 'records', label: 'Records', icon: Star },
  { key: 'stats', label: 'Stats', icon: BarChart3 },
  { key: 'ranking', label: 'Ranking', icon: MedalLucide },
  { key: 'news', label: 'News', icon: Newspaper },
  { key: 'gallery', label: 'Gallery', icon: ImageIcon },
]

export default function TeamProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { token } = useAuth()
  const isAdmin = !!token
  const activeTab = searchParams.get('tab') || 'club'
  const setActiveTab = (tab) => setSearchParams({ tab })

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Lazy-loaded tab data
  const [teamRecords, setTeamRecords] = useState(null)
  const [teamStats, setTeamStats] = useState(null)
  const [teamRanking, setTeamRanking] = useState(null)
  const [coaches, setCoaches] = useState(null)
  const [news, setNews] = useState(null)
  const [medals, setMedals] = useState(null)
  const [teamSection, setTeamSection] = useState('swimmers') // swimmers | coaches

  useEffect(() => {
    setLoading(true)
    setError('')
    getTeamProfile(id)
      .then(res => { setProfile(res.data); setLoading(false) })
      .catch(err => { setError(err.response?.data?.detail || 'Failed to load'); setLoading(false) })
  }, [id])

  // Lazy load tab data
  useEffect(() => {
    if (activeTab === 'records' && !teamRecords) {
      getTeamRecords(id).then(r => setTeamRecords(r.data)).catch(() => setTeamRecords([]))
    }
    if (activeTab === 'stats' && !teamStats) {
      getTeamStats(id).then(r => setTeamStats(r.data)).catch(() => setTeamStats({}))
    }
    if (activeTab === 'ranking' && !teamRanking) {
      getTeamRanking(id).then(r => setTeamRanking(r.data)).catch(() => setTeamRanking([]))
    }
    if (activeTab === 'team' && teamSection === 'coaches' && !coaches) {
      getCoaches({ team: id }).then(r => setCoaches(r.data?.results || r.data || [])).catch(() => setCoaches([]))
    }
    if (activeTab === 'news' && !news) {
      getArticles({ team: id, status: 'PUBLISHED' }).then(r => setNews(r.data?.results || r.data || [])).catch(() => setNews([]))
    }
    if ((activeTab === 'stats' || activeTab === 'club') && !medals) {
      getTeamMedals(id).then(r => setMedals(r.data)).catch(() => setMedals([]))
    }
  }, [activeTab, id, teamSection])

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

  return (
    <div className="max-w-6xl mx-auto">
      <Breadcrumbs items={[
        { label: 'Teams', to: '/teams' },
        { label: team.name },
      ]} />

      {/* Banner */}
      <div className="relative h-32 sm:h-48 rounded-t-lg overflow-hidden bg-gradient-to-br from-ink-950 to-ink-900">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-aqua-600 via-aqua-400 to-aqua-600 z-10" />
        {team.banner && <img src={team.banner} alt="" className="w-full h-full object-cover" />}
      </div>

      {/* Header Card */}
      <div className="bg-white border border-ink-100 border-t-0 rounded-b-lg shadow-card px-4 sm:px-6 py-4 sm:py-5 mb-4 sm:mb-6">
        <div className="flex items-start gap-3 sm:gap-5 -mt-10 sm:-mt-14">
          <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-md bg-white border-4 border-white shadow-pop flex items-center justify-center overflow-hidden shrink-0">
            {team.logo ? <img src={team.logo} alt="" className="w-full h-full object-cover" /> : <Waves size={32} className="text-ink-400" />}
          </div>
          <div className="flex-1 pt-6 sm:pt-10 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
              <h1 className="font-display font-bold text-[20px] leading-7 sm:text-[28px] sm:leading-[34px] text-ink-900 break-words min-w-0">{team.name}</h1>
              {team.is_national_team && <Badge variant="aqua">National Team</Badge>}
            </div>
            {country && <CountryFlag code={country.code} flagUrl={country.flag_url} name={country.name} className="text-body-sm text-ink-500" />}
          </div>
          {isAdmin && (
            <Button variant="ghost" size="sm" icon={Pencil} className="mt-6 sm:mt-10 shrink-0"
              onClick={() => navigate(`/teams/${id}/edit`)}>Edit</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={TEAM_TABS}
        active={activeTab}
        onChange={setActiveTab}
        sticky
        className="mb-4 sm:mb-6 rounded-t-md"
      />

      {/* Tab Content */}
      <div key={activeTab} className="animate-fade-up">
        {activeTab === 'club' && <ClubTab team={team} country={country} profile={profile} />}
        {activeTab === 'team' && (
          <TeamTab
            profile={profile}
            coaches={coaches}
            navigate={navigate}
            section={teamSection}
            setSection={setTeamSection}
          />
        )}
        {activeTab === 'trophies' && <TrophiesTab trophies={team.trophies || []} />}
        {activeTab === 'records' && <RecordsTab records={teamRecords} navigate={navigate} />}
        {activeTab === 'stats' && <StatsTab stats={teamStats} profile={profile} navigate={navigate} />}
        {activeTab === 'ranking' && <RankingTab ranking={teamRanking} teamId={parseInt(id)} navigate={navigate} />}
        {activeTab === 'news' && <NewsTab articles={news} />}
        {activeTab === 'gallery' && <GalleryTab teamId={id} />}
      </div>
    </div>
  )
}

/* ── Club Tab ── */
function ClubTab({ team, country, profile }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 sm:gap-4">
      <div className="space-y-4">
        <Card title="About">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm break-words">
            {team.founded_year && (
              <div className="flex items-center gap-2">
                <CalendarDays size={15} className="text-ink-400 shrink-0" />
                <span className="text-ink-500">Founded:</span> <span className="font-medium text-ink-900 tnum">{team.founded_year}</span>
              </div>
            )}
            {country && (
              <div className="flex items-center gap-2">
                <Globe size={15} className="text-ink-400 shrink-0" />
                <span className="text-ink-500">Country:</span>
                <CountryFlag code={country.code} flagUrl={country.flag_url} name={country.name} />
              </div>
            )}
            {team.website && (
              <div className="sm:col-span-2 min-w-0 flex items-center gap-2">
                <Globe size={15} className="text-ink-400 shrink-0" />
                <span className="text-ink-500">Website:</span>
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
      </div>

      {/* Sidebar — quick stats */}
      <div className="space-y-4">
        <Card title="Quick Stats">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-ink-50 rounded-md p-3 text-center">
              <div className="text-xl font-bold tnum text-ink-900">{profile.roster.length}</div>
              <div className="text-label text-ink-400">Swimmers</div>
            </div>
            <div className="bg-gold/10 rounded-md p-3 text-center">
              <div className="text-xl font-bold tnum text-gold">
                {profile.medal_counts.national.GOLD + profile.medal_counts.national.SILVER + profile.medal_counts.national.BRONZE +
                 profile.medal_counts.international.GOLD + profile.medal_counts.international.SILVER + profile.medal_counts.international.BRONZE}
              </div>
              <div className="text-label text-ink-400">Medals</div>
            </div>
          </div>
        </Card>
        {profile.best_swimmers.length > 0 && (
          <Card title="Top Swimmers">
            <div className="space-y-1">
              {profile.best_swimmers.slice(0, 5).map((s, i) => (
                <div key={i} className="flex items-center gap-2 cursor-pointer hover:bg-ink-50 rounded-sm p-1.5 -mx-1.5 min-h-10"
                  onClick={() => window.location.href = `/swimmers/${s.swimmer_id}`}>
                  <span className="w-6 text-center text-body-sm font-bold text-ink-400 tnum">{i + 1}</span>
                  <div className="flex-1 min-w-0 text-body-sm font-medium text-ink-900 truncate">{s.name}</div>
                  <span className="text-body-sm font-bold text-aqua-600 tnum">{s.fina_points}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

/* ── Team Tab (Coaches + Swimmers) ── */
function TeamTab({ profile, coaches, navigate, section, setSection }) {
  return (
    <div>
      <SegmentedControl
        options={[{ key: 'swimmers', label: `Swimmers (${profile.roster.length})` }, { key: 'coaches', label: 'Coaches' }]}
        value={section}
        onChange={setSection}
        className="mb-4"
      />
      {section === 'swimmers' && (
        <Card padding="none">
          {profile.roster.length === 0 ? (
            <EmptyState icon={Users} title="No swimmers registered" />
          ) : (
            <div className="divide-y divide-ink-100">
              {profile.roster.map(s => (
                <div key={s.id} onClick={() => navigate(`/swimmers/${s.id}`)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50 cursor-pointer transition-colors">
                  <div className="w-10 h-10 rounded-full bg-ink-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {s.photo ? <img src={s.photo} alt="" className="w-full h-full object-cover" /> : <User size={16} className="text-ink-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <SwimmerCell name={s.name} countryCode={s.nationality_detail?.code} flagUrl={s.nationality_detail?.flag_url} />
                  </div>
                  <Badge variant={s.sex === 'M' ? 'pool-lcm' : 'scope'}>{s.sex === 'M' ? 'Male' : 'Female'}</Badge>
                  <span className="text-body-sm text-ink-400 tnum w-12 text-end">{s.age || '-'}</span>
                  <ChevronRight size={14} className="text-ink-200" />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      {section === 'coaches' && (
        <div>
          {!coaches ? (
            <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-aqua-600" /></div>
          ) : coaches.length === 0 ? (
            <Card><EmptyState icon={Users} title="No coaches registered" /></Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {coaches.map(c => (
                <Card key={c.id} hoverable className="text-center">
                  <div className="w-20 h-20 rounded-full bg-ink-100 overflow-hidden mx-auto mb-3 flex items-center justify-center">
                    {c.photo ? <img src={c.photo} alt="" className="w-full h-full object-cover" /> : <User size={28} className="text-ink-400" />}
                  </div>
                  <div className="text-body-sm font-semibold text-ink-900">{c.name}</div>
                  {c.level && <div className="text-body-sm text-ink-400 mt-0.5">{c.get_level_display || c.level}</div>}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Trophies Tab ── */
function TrophiesTab({ trophies }) {
  if (trophies.length === 0) return <Card><EmptyState icon={Trophy} title="No trophies yet" /></Card>
  return (
    <Card padding="none">
      <div className="divide-y divide-ink-100">
        {trophies.map((t, i) => (
          <div key={t.id || i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
              <Trophy size={18} className="text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-body-sm font-semibold text-ink-900">{t.name}</div>
            </div>
            <span className="text-body-sm font-bold text-ink-400 tnum">{t.year}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ── Records Tab ── */
function RecordsTab({ records, navigate }) {
  if (!records) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-aqua-600" /></div>
  if (records.length === 0) return <Card><EmptyState icon={Star} title="No records held" /></Card>
  return (
    <Card padding="none">
      <div className="divide-y divide-ink-100">
        {records.map(r => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ink-50 cursor-pointer transition-colors"
            onClick={() => navigate(`/swimmers/${r.swimmer_id}`)}>
            <Badge variant={r.record_type === 'ARAB' ? 'pos' : r.record_type === 'GCC' ? 'aqua' : 'record'}>{r.record_type}</Badge>
            <div className="flex-1 min-w-0">
              <EventLabel name={r.event_name} className="font-semibold" />
              <div className="text-body-sm text-ink-400 mt-0.5">
                <CountryFlag code={r.nationality_code} flagUrl={r.nationality_flag} className="[&>img]:w-4 [&>img]:h-3" />
                <span className="ms-1">{r.swimmer_name}</span>
              </div>
            </div>
            <div className="text-end shrink-0">
              <TimeDisplay time={r.time} record />
              <div className="text-body-sm text-ink-400">{formatDate(r.date)}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ── Stats Tab ── */
function StatsTab({ stats, profile, navigate }) {
  if (!stats) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-aqua-600" /></div>
  const mc = profile.medal_counts
  const totalMedals = mc.national.GOLD + mc.national.SILVER + mc.national.BRONZE +
    mc.international.GOLD + mc.international.SILVER + mc.international.BRONZE

  return (
    <div className="space-y-4">
      {/* Quick stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-white rounded-md shadow-card border border-ink-100 p-4 text-center">
          <div className="text-3xl font-bold tnum text-ink-900">{stats.swimmers}</div>
          <div className="text-label text-ink-400 mt-1">Swimmers</div>
        </div>
        <div className="bg-white rounded-md shadow-card border border-gold/30 p-4 text-center">
          <div className="text-3xl font-bold tnum text-gold">{totalMedals}</div>
          <div className="text-label text-ink-400 mt-1">Medals</div>
        </div>
        <div className="bg-white rounded-md shadow-card border border-ink-100 p-4 text-center">
          <div className="text-3xl font-bold tnum text-ink-900">{stats.championships}</div>
          <div className="text-label text-ink-400 mt-1">Championships</div>
        </div>
        <div className="bg-white rounded-md shadow-card border border-aqua-600/30 p-4 text-center">
          <div className="text-3xl font-bold tnum text-aqua-600">{stats.best_fina?.points || 0}</div>
          <div className="text-label text-ink-400 mt-1">Best FINA</div>
        </div>
      </div>

      {/* Best FINA + Top Medalist */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {stats.best_fina && (
          <Card className="border-aqua-600/30 bg-aqua-50/30">
            <div className="text-label text-aqua-600 mb-2">Highest FINA Points</div>
            <div className="text-4xl font-bold tnum text-aqua-600">{stats.best_fina.points}</div>
            <div className="text-body-sm font-semibold text-ink-700 mt-2 cursor-pointer hover:text-aqua-600"
              onClick={() => navigate(`/swimmers/${stats.best_fina.swimmer_id}`)}>
              {stats.best_fina.swimmer_name}
            </div>
            <div className="text-body-sm text-ink-400">{stats.best_fina.event_name}</div>
          </Card>
        )}
        {stats.top_medalist && (
          <Card className="border-gold/40 bg-gold/5">
            <div className="text-label text-gold mb-2">Most Decorated Swimmer</div>
            <div className="text-4xl font-bold tnum text-gold">{stats.top_medalist.count}</div>
            <div className="text-body-sm text-ink-400 mt-1">medals</div>
            <div className="text-body-sm font-semibold text-ink-700 mt-2 cursor-pointer hover:text-aqua-600"
              onClick={() => navigate(`/swimmers/${stats.top_medalist.swimmer_id}`)}>
              {stats.top_medalist.swimmer_name}
            </div>
          </Card>
        )}
      </div>

      {/* Medal bars */}
      <Card title="Medal Breakdown">
        {['international', 'national'].map(cat => {
          const counts = mc[cat]
          const total = counts.GOLD + counts.SILVER + counts.BRONZE
          if (total === 0) return null
          const barMax = Math.max(total, 1)
          return (
            <div key={cat} className="mb-4 last:mb-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-body-sm font-semibold text-ink-700 capitalize">{cat}</span>
                <span className="text-body-sm font-bold text-ink-900 tnum">{total}</span>
              </div>
              <div className="flex h-7 rounded-sm overflow-hidden bg-ink-50">
                {counts.GOLD > 0 && <div className="bg-gold h-full flex items-center justify-center text-body-sm font-bold text-white tnum" style={{ width: `${(counts.GOLD / barMax) * 100}%`, minWidth: '24px' }}>{counts.GOLD}</div>}
                {counts.SILVER > 0 && <div className="bg-silver h-full flex items-center justify-center text-body-sm font-bold text-white tnum" style={{ width: `${(counts.SILVER / barMax) * 100}%`, minWidth: '24px' }}>{counts.SILVER}</div>}
                {counts.BRONZE > 0 && <div className="bg-bronze h-full flex items-center justify-center text-body-sm font-bold text-white tnum" style={{ width: `${(counts.BRONZE / barMax) * 100}%`, minWidth: '24px' }}>{counts.BRONZE}</div>}
              </div>
              <div className="flex gap-3 mt-1 text-body-sm text-ink-500 tnum">
                <span className="flex items-center gap-1"><MedalIcon type="gold" size={14} /> {counts.GOLD}</span>
                <span className="flex items-center gap-1"><MedalIcon type="silver" size={14} /> {counts.SILVER}</span>
                <span className="flex items-center gap-1"><MedalIcon type="bronze" size={14} /> {counts.BRONZE}</span>
              </div>
            </div>
          )
        })}
        {totalMedals === 0 && <div className="text-body-sm text-ink-400">No medals yet</div>}
      </Card>
    </div>
  )
}

/* ── Ranking Tab ── */
function RankingTab({ ranking, teamId, navigate }) {
  if (!ranking) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-aqua-600" /></div>
  if (ranking.length === 0) return <Card><EmptyState icon={BarChart3} title="No ranking data" /></Card>
  return (
    <Card padding="none" title="Club Ranking">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-ink-900">
              <th className="px-4 py-2.5 text-start text-label text-white/70 w-14">#</th>
              <th className="px-4 py-2.5 text-start text-label text-white/70">Club</th>
              <th className="px-4 py-2.5 text-end text-label text-white/70">Gold</th>
              <th className="px-4 py-2.5 text-end text-label text-white/70">Silver</th>
              <th className="px-4 py-2.5 text-end text-label text-white/70">Bronze</th>
              <th className="px-4 py-2.5 text-end text-label text-white/70">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {ranking.map(r => (
              <tr key={r.team_id}
                className={`h-12 transition-colors ${r.is_current ? 'bg-aqua-50 font-semibold' : 'hover:bg-ink-50'} ${r.team_id !== teamId ? 'cursor-pointer' : ''}`}
                onClick={() => r.team_id !== teamId && navigate(`/teams/${r.team_id}?tab=ranking`)}>
                <td className="px-4 py-2.5 text-body-sm tnum font-bold text-ink-400">{r.rank}</td>
                <td className="px-4 py-2.5 text-body-sm text-ink-900">
                  {r.team_name}
                  {r.is_current && <Badge variant="aqua" className="ms-2">You</Badge>}
                </td>
                <td className="px-4 py-2.5 text-end text-body-sm tnum text-gold font-semibold">{r.gold}</td>
                <td className="px-4 py-2.5 text-end text-body-sm tnum text-silver font-semibold">{r.silver}</td>
                <td className="px-4 py-2.5 text-end text-body-sm tnum text-bronze font-semibold">{r.bronze}</td>
                <td className="px-4 py-2.5 text-end text-body-sm tnum font-bold text-ink-900">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ── News Tab ── */
function NewsTab({ articles }) {
  if (!articles) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-aqua-600" /></div>
  if (articles.length === 0) return <Card><EmptyState icon={Newspaper} title="No news articles" /></Card>
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {articles.map(a => (
        <Card key={a.id} hoverable className="overflow-hidden">
          {a.cover_image && (
            <img src={a.cover_image} alt="" className="w-full h-40 object-cover rounded-t-md -mt-3 sm:-mt-4 md:-mt-5 -mx-3 sm:-mx-4 md:-mx-5 mb-3"
              style={{ width: 'calc(100% + var(--p, 24px) * 2)' }} />
          )}
          <div className="text-body-sm font-semibold text-ink-900 line-clamp-2">{a.title}</div>
          {a.published_at && <div className="text-body-sm text-ink-400 mt-1">{formatDate(a.published_at)}</div>}
          {a.body && <p className="text-body-sm text-ink-500 mt-2 line-clamp-3">{a.body}</p>}
        </Card>
      ))}
    </div>
  )
}

/* ── Gallery Tab ── */
function GalleryTab({ teamId }) {
  const [albums, setAlbums] = useState(null)
  useEffect(() => {
    import('../api/media').then(mod => {
      const fn = mod.getAlbums || mod.default?.get
      if (fn) fn({ team: teamId }).then(r => setAlbums(r.data?.results || r.data || [])).catch(() => setAlbums([]))
      else setAlbums([])
    }).catch(() => setAlbums([]))
  }, [teamId])

  if (!albums) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-aqua-600" /></div>
  if (albums.length === 0) return <Card><EmptyState icon={ImageIcon} title="No gallery albums" /></Card>
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {albums.map(a => (
        <a key={a.id} href={`/media/albums/${a.id}`} className="group">
          <Card hoverable className="overflow-hidden">
            {a.cover ? (
              <img src={a.cover} alt="" className="w-full h-32 object-cover rounded-sm" />
            ) : (
              <div className="w-full h-32 bg-ink-50 rounded-sm flex items-center justify-center">
                <ImageIcon size={28} className="text-ink-200" />
              </div>
            )}
            <div className="text-body-sm font-semibold text-ink-900 mt-2 truncate group-hover:text-aqua-600 transition-colors">{a.title}</div>
            <div className="text-body-sm text-ink-400">{a.items_count || 0} photos</div>
          </Card>
        </a>
      ))}
    </div>
  )
}
