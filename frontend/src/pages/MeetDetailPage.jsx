import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { getChampionship, getChampionshipResults, getChampionshipStats, getChampionshipCountrySwimmers, updateResult, deleteResult, getMostImproved, getChampionshipComparison } from '../api/championships'
import { getMedals, getMedalSummary, getMedalClubSummary, getMedalSwimmerSummary } from '../api/medals'
import { getOrCreateAlbumForChampionship } from '../api/media'
import { uploadPhotos, createMediaItem, deleteMediaItem, updateMediaItem } from '../api/media'
import CountryFlag from '../components/common/CountryFlag'
import MedalIcon from '../components/common/MedalIcon'
import { formatDate } from '../utils/constants'
import AddResultsModal from '../components/championships/AddResultsModal'
import MeetEditModal from '../components/championships/MeetEditModal'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Hero, Tabs, SegmentedControl, Card, Button, Badge, PoolBadge, ConfirmDialog, EmptyState, Skeleton, TableSkeleton, Input } from '../components/ui'
import { SwimmerCell, TimeDisplay, MedalTally, RankNumber } from '../components/domain'
import {
  ArrowLeft, Pencil, Plus, Users, Timer, ChevronRight, ChevronUp, ChevronDown,
  Trash2, X, Camera, Medal, MapPin, Calendar, ListOrdered, Waves,
} from 'lucide-react'

// Display categories oldest → youngest (bigger age first).
// Extracts the highest age number from the category string for sorting.
// Named categories (Seniors, Juniors, etc.) have fixed ranks.
const NAMED_RANKS = { 'Seniors/Juniors': 0, 'Seniors': 1, 'Juniors': 2, 'Cadets': 3, 'Minimes': 4, 'Benjamins': 5, 'Poussins': 6 }
const catRank = (c) => {
  if (!c) return 9999
  // Check named categories first
  const named = NAMED_RANKS[c]
  if (named !== undefined) return named
  // Extract the highest age number: "18 & Over" → 18, "15-17" → 17,
  // "Girl's 15-16" → 16, "12-14" → 14, "Open" → -1 (top)
  if (/open/i.test(c)) return -1
  const nums = c.match(/\d+/g)
  if (nums) {
    const maxAge = Math.max(...nums.map(Number))
    // Negate so bigger age sorts first (descending)
    return -maxAge
  }
  return 9998
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

const GENDER_OPTIONS = [
  { key: 'overall', label: 'Overall' },
  { key: 'M', label: 'Male' },
  { key: 'F', label: 'Female' },
]

const TH = 'px-3 md:px-4 py-2.5 text-label text-ink-400 text-start whitespace-nowrap'
const TH_END = 'px-3 md:px-4 py-2.5 text-label text-ink-400 text-end whitespace-nowrap'
const TD = 'px-3 md:px-4 py-2.5 text-body-sm text-ink-900'

function finaTierClass(points) {
  if (points >= 1000) return 'text-gold'
  if (points >= 900) return 'text-pos'
  if (points >= 800) return 'text-aqua-600'
  if (points >= 600) return 'text-lcm'
  return 'text-ink-500'
}

function TopPerformersTable({ performers, navigate }) {
  const [genderFilter, setGenderFilter] = useState('overall')
  if (!performers || performers.length === 0) return null

  const filtered = genderFilter === 'overall'
    ? performers
    : performers.filter(t => t.gender === genderFilter)

  return (
    <Card
      padding="none"
      title="Top Performances"
      action={<SegmentedControl options={GENDER_OPTIONS} value={genderFilter} onChange={setGenderFilter} />}
    >
      <p className="px-4 md:px-5 pt-3 text-body-sm text-ink-400">Highest FINA points at this championship</p>
      {filtered.length > 0 ? (
        <div className="overflow-x-auto mt-2">
          <table className="w-full">
            <thead>
              <tr className="bg-ink-50 border-b border-ink-100">
                <th scope="col" className={`${TH} w-10`}>#</th>
                <th scope="col" className={TH}>Swimmer</th>
                <th scope="col" className={TH}>Event</th>
                <th scope="col" className={TH_END}>Time</th>
                <th scope="col" className={TH_END}>FINA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((t, i) => (
                <tr key={i} className="h-11 hover:bg-ink-50 cursor-pointer transition-colors" onClick={() => navigate(`/swimmers/${t.swimmer_id}`)}>
                  <td className={TD}><RankNumber rank={i + 1} /></td>
                  <td className={TD}>
                    <SwimmerCell name={t.swimmer_name} countryCode={t.nationality_code} flagUrl={t.flag_url} />
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{t.event_name}</td>
                  <td className={`${TD} text-end`}><TimeDisplay time={t.time} /></td>
                  <td className={`${TD} text-end tnum font-bold text-aqua-600`}>{t.fina_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-ink-400 text-body-sm">No performances for this filter</div>
      )}
    </Card>
  )
}

function MostImprovedTable({ swimmers, navigate }) {
  const [genderFilter, setGenderFilter] = useState('overall')

  const filtered = genderFilter === 'overall'
    ? swimmers
    : swimmers.filter(s => s.gender === genderFilter)

  return (
    <Card
      padding="none"
      title="Most Improved Swimmers"
      action={<SegmentedControl options={GENDER_OPTIONS} value={genderFilter} onChange={setGenderFilter} />}
    >
      <p className="px-4 md:px-5 pt-3 text-body-sm text-ink-400">Biggest time drops vs previous personal best</p>
      {filtered.length > 0 ? (
        <div className="overflow-x-auto mt-2">
          <table className="w-full">
            <thead>
              <tr className="bg-ink-50 border-b border-ink-100">
                <th scope="col" className={`${TH} w-10`}>#</th>
                <th scope="col" className={TH}>Swimmer</th>
                <th scope="col" className={TH}>Event</th>
                <th scope="col" className={TH}>Previous Best</th>
                <th scope="col" className={TH_END}>New Time</th>
                <th scope="col" className={TH_END}>Improvement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((s, i) => (
                <tr key={i} className="h-11 hover:bg-ink-50 cursor-pointer transition-colors" onClick={() => navigate(`/swimmers/${s.swimmer_id}`)}>
                  <td className={TD}><RankNumber rank={i + 1} /></td>
                  <td className={TD}>
                    <SwimmerCell name={s.swimmer_name} countryCode={s.nationality_code} flagUrl={s.flag_url} />
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{s.event_name}</td>
                  <td className={TD}>
                    {s.is_new_entry ? (
                      <Badge variant="aqua">New Entry</Badge>
                    ) : (
                      <>
                        <div className="tnum text-ink-500">{s.previous_best}</div>
                        <div className="flex items-center gap-1 mt-0.5 cursor-pointer group" onClick={(e) => { e.stopPropagation(); navigate(`/meets/${s.previous_best_meet_id}`) }}>
                          <span className="text-label normal-case tracking-normal text-aqua-600 group-hover:underline truncate max-w-[140px]" title={s.previous_best_meet}>
                            {s.previous_best_meet}
                          </span>
                          {s.previous_best_date && (
                            <span className="text-label normal-case tracking-normal text-ink-400">({new Date(s.previous_best_date).getFullYear()})</span>
                          )}
                        </div>
                      </>
                    )}
                  </td>
                  <td className={`${TD} text-end`}><TimeDisplay time={s.current_time} /></td>
                  <td className={`${TD} text-end tnum font-bold text-pos`}>
                    {s.is_new_entry ? <span className="text-ink-400 font-normal">—</span> : `-${s.improvement}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-ink-400 text-body-sm">No improvements for this filter</div>
      )}
    </Card>
  )
}

function MedalsTab({ stats, meet, medals, medalSummary, medalClubSummary, medalSwimmerSummary, navigate }) {
  const [medalFilter, setMedalFilter] = useState('ALL')
  const [tallyFilter, setTallyFilter] = useState('ALL')
  const [tallySection, setTallySection] = useState('main')   // 'main' = country/club tally, 'swimmers'
  const [swimmerGender, setSwimmerGender] = useState('ALL')
  // National/Other meets: no country tally — clubs + swimmers tallies instead
  const isNational = meet?.classification_name
    ? ['National', 'Other'].includes(meet.classification_name)
    : (stats?.countries?.length || 0) <= 1
  const safeMedals = Array.isArray(medals) ? medals : []
  const safeSummary = Array.isArray(medalSummary) ? medalSummary : []
  const safeClubSummary = Array.isArray(medalClubSummary) ? medalClubSummary : []
  const safeSwimmerSummary = Array.isArray(medalSwimmerSummary) ? medalSwimmerSummary : []

  const goldCount = safeMedals.filter(m => m.medal_type === 'GOLD').length
  const silverCount = safeMedals.filter(m => m.medal_type === 'SILVER').length
  const bronzeCount = safeMedals.filter(m => m.medal_type === 'BRONZE').length

  const filteredMedals = medalFilter === 'ALL'
    ? [...safeMedals].sort((a, b) => {
        const order = { GOLD: 0, SILVER: 1, BRONZE: 2 }
        return (order[a.medal_type] ?? 3) - (order[b.medal_type] ?? 3)
      })
    : safeMedals.filter(m => m.medal_type === medalFilter)

  return (
    <div className="space-y-6">
      {/* Medal Count Cards */}
      {safeMedals.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {[
            { type: 'gold', count: goldCount, label: 'Gold', accent: 'border-s-2 border-gold text-gold' },
            { type: 'silver', count: silverCount, label: 'Silver', accent: 'border-s-2 border-silver text-silver' },
            { type: 'bronze', count: bronzeCount, label: 'Bronze', accent: 'border-s-2 border-bronze text-bronze' },
          ].map(m => (
            <div key={m.type} className={`bg-white rounded-md shadow-card border border-ink-100 ${m.accent} p-3 sm:p-4 text-center`}>
              <MedalIcon type={m.type} size={32} />
              <div className="text-time-lg text-ink-900 mt-1">{m.count}</div>
              <div className="text-label text-ink-400">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tally switcher: Country/Club Medal Tally vs Swimmer Medal Tally */}
      {(safeSummary.length > 0 || safeClubSummary.length > 0 || safeSwimmerSummary.length > 0) && (
        <SegmentedControl
          options={[
            { key: 'main', label: isNational ? 'Club Tally' : 'Country Tally' },
            ...(!isNational && safeClubSummary.length > 0 ? [{ key: 'clubs', label: 'Club Tally' }] : []),
            { key: 'swimmers', label: 'Swimmer Tally' },
          ]}
          value={tallySection}
          onChange={setTallySection}
        />
      )}

      {/* Country Medal Tally (international) or Club Medal Tally (national) */}
      {tallySection === 'main' && !isNational && safeSummary.length > 0 && (() => {
        const filteredSummary = tallyFilter === 'ARAB'
          ? safeSummary.filter(r => r.swimmer__nationality__region === 'ARAB' || r.swimmer__nationality__region === 'GCC')
          : safeSummary
        return (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h3 className="text-title text-ink-900">Country Medal Tally</h3>
              <SegmentedControl
                options={[{ key: 'ALL', label: 'Overall' }, { key: 'ARAB', label: 'Arab' }]}
                value={tallyFilter}
                onChange={setTallyFilter}
              />
            </div>
            <MedalTally
              entityLabel="Country"
              rows={filteredSummary.map((row, i) => ({
                id: row.swimmer__nationality__code || i,
                entity: (
                  <span className="text-body-sm text-ink-900">
                    <CountryFlag code={row.swimmer__nationality__code} flagUrl={row.swimmer__nationality__flag_url} name={row.swimmer__nationality__name} />
                  </span>
                ),
                gold: row.gold || 0,
                silver: row.silver || 0,
                bronze: row.bronze || 0,
              }))}
            />
          </div>
        )
      })()}

      {(tallySection === 'clubs' || (tallySection === 'main' && isNational)) && safeClubSummary.length > 0 && (
        <div>
          <h3 className="text-title text-ink-900 mb-3">Club Medal Tally</h3>
          <MedalTally
            entityLabel="Club"
            rows={safeClubSummary.map((row, i) => ({
              id: i,
              entity: <span className="text-body-sm font-medium text-ink-900">{row.result__team}</span>,
              gold: row.gold || 0,
              silver: row.silver || 0,
              bronze: row.bronze || 0,
            }))}
          />
        </div>
      )}

      {/* Swimmer Medal Tally */}
      {tallySection === 'swimmers' && safeSwimmerSummary.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-title text-ink-900">Swimmer Medal Tally</h3>
            <SegmentedControl
              options={[{ key: 'ALL', label: 'All' }, { key: 'M', label: 'Men' }, { key: 'F', label: 'Women' }]}
              value={swimmerGender}
              onChange={setSwimmerGender}
            />
          </div>
          <MedalTally
            entityLabel="Swimmer"
            onRowClick={(row) => navigate(`/swimmers/${row.swimmerId}`)}
            rows={(swimmerGender === 'ALL'
              ? safeSwimmerSummary
              : safeSwimmerSummary.filter(r => r.swimmer__sex === swimmerGender)
            ).map((row, i) => ({
              id: row.swimmer__id || i,
              swimmerId: row.swimmer__id,
              entity: (
                <SwimmerCell
                  name={row.swimmer__name}
                  countryCode={row.swimmer__nationality__code}
                  flagUrl={row.swimmer__nationality__flag_url}
                />
              ),
              gold: row.gold || 0,
              silver: row.silver || 0,
              bronze: row.bronze || 0,
            }))}
          />
        </div>
      )}

      {/* All Medals with filter buttons */}
      {safeMedals.length > 0 && (
        <Card
          padding="none"
          title={`All Medals (${filteredMedals.length})`}
          action={
            <SegmentedControl
              options={[
                { key: 'ALL', label: `All (${safeMedals.length})` },
                { key: 'GOLD', label: `Gold (${goldCount})` },
                { key: 'SILVER', label: `Silver (${silverCount})` },
                { key: 'BRONZE', label: `Bronze (${bronzeCount})` },
              ]}
              value={medalFilter}
              onChange={setMedalFilter}
            />
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-ink-50 border-b border-ink-100">
                  <th scope="col" className={`${TH} w-14`}>Medal</th>
                  <th scope="col" className={TH}>Swimmer</th>
                  <th scope="col" className={TH}>Event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredMedals.map((m, i) => (
                  <tr key={m.id || i} className="h-11 hover:bg-ink-50 cursor-pointer transition-colors" onClick={() => navigate(`/swimmers/${m.swimmer_detail?.id || m.swimmer}`)}>
                    <td className={TD}><MedalIcon type={m.medal_type?.toLowerCase()} size={24} /></td>
                    <td className={TD}>
                      <SwimmerCell
                        name={m.swimmer_detail?.name}
                        countryCode={m.swimmer_detail?.nationality_detail?.code}
                        flagUrl={m.swimmer_detail?.nationality_detail?.flag_url}
                      />
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{m.event_detail?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {safeSummary.length === 0 && safeClubSummary.length === 0 && safeMedals.length === 0 && (
        <Card padding="none">
          <EmptyState
            icon={Medal}
            title="No medals yet"
            hint="Medals are computed from results automatically"
          />
        </Card>
      )}
    </div>
  )
}

export default function MeetDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { token } = useAuth()
  const isAdmin = !!token
  const toast = useToast()
  const activeTab = searchParams.get('tab') || 'results'
  const setActiveTab = (tab) => setSearchParams({ tab })
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
  const [showEditModal, setShowEditModal] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editValues, setEditValues] = useState({ time: '', team: '' })
  const [selectedCategory, setSelectedCategory] = useState(null)  // null = all
  const [genderFilter, setGenderFilter] = useState('')  // '' = all, 'M' = men, 'F' = women
  const [pendingDeleteResult, setPendingDeleteResult] = useState(null)  // result row awaiting confirm
  const [pendingDeleteMedia, setPendingDeleteMedia] = useState(null)    // media item awaiting confirm

  // Medals tab state
  const [medals, setMedals] = useState([])
  const [medalSummary, setMedalSummary] = useState([])
  const [medalClubSummary, setMedalClubSummary] = useState([])
  const [medalSwimmerSummary, setMedalSwimmerSummary] = useState([])

  // Statistics tab state
  const [mostImproved, setMostImproved] = useState([])
  const [comparison, setComparison] = useState([])

  // Gallery tab state
  const [album, setAlbum] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    getChampionship(id).then(res => setMeet(res.data)).catch(() => {})
    getChampionshipStats(id).then(res => setStats(res.data)).catch(() => {})
  }, [id])

  // Load most improved and comparison when statistics tab is active
  useEffect(() => {
    if (activeTab === 'statistics') {
      getMostImproved(id).then(res => setMostImproved(res.data)).catch(() => {})
      getChampionshipComparison(id).then(res => setComparison(res.data)).catch(() => {})
    }
  }, [id, activeTab])

  // Load medals when medals tab is active
  useEffect(() => {
    if (activeTab === 'medals') {
      getMedalSummary({ championship: id }).then(res => setMedalSummary(res.data)).catch(() => {})
      getMedals({ championship: id, page_size: 500 }).then(res => setMedals(res.data?.results || res.data || [])).catch(() => {})
      getMedalClubSummary({ championship: id }).then(res => setMedalClubSummary(res.data)).catch(() => {})
      // Full swimmer tally for the meet, not just top 10
      getMedalSwimmerSummary({ championship: id, limit: 'all' })
        .then(res => setMedalSwimmerSummary(res.data)).catch(() => {})
    }
  }, [id, activeTab])

  // Load gallery when gallery tab is active
  useEffect(() => {
    if (activeTab === 'gallery' && !album) {
      getOrCreateAlbumForChampionship(id).then(res => setAlbum(res.data)).catch(() => {})
    }
  }, [id, activeTab])

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
    if (!cs) { toast.error('Invalid time — use 1:02.34 or 28.75'); return }
    try {
      await updateResult(r.id, { time_centiseconds: cs, team: editValues.team })
      setEditingId(null)
      await Promise.all([refreshResults(), refreshStats()])
    } catch {
      toast.error('Failed to save the result')
    }
  }

  const removeRow = (r) => setPendingDeleteResult(r)

  const confirmRemoveRow = async () => {
    const r = pendingDeleteResult
    setPendingDeleteResult(null)
    if (!r) return
    try {
      await deleteResult(r.id)
      await Promise.all([refreshResults(), refreshStats()])
    } catch {
      toast.error('Failed to delete the result')
    }
  }

  const confirmRemoveMedia = () => {
    const item = pendingDeleteMedia
    setPendingDeleteMedia(null)
    if (!item) return
    deleteMediaItem(item.id).then(() => {
      setAlbum(a => ({ ...a, items: a.items.filter(i => i.id !== item.id) }))
    }).catch(() => {})
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

  if (!meet || !stats) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-11 w-full" />
        <TableSkeleton rows={8} />
      </div>
    )
  }

  const heroStats = [
    { label: 'Swimmers', value: stats.total_swimmers },
    { label: 'Results', value: stats.total_results },
    { label: 'Events', value: stats.events.length },
    { label: 'Male', value: stats.male_count, hideMobile: true },
    { label: 'Female', value: stats.female_count, hideMobile: true },
  ]

  return (
    <div className="max-w-7xl mx-auto">
      {/* Top row: back + admin actions */}
      <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate('/calendar')}>Back</Button>
        {isAdmin && (
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setShowEditModal(true)}>
              <span className="hidden sm:inline">Edit Meet</span><span className="sm:hidden">Edit</span>
            </Button>
            <Button variant="ghost" size="sm" icon={Plus} onClick={() => setShowAddModal(true)}>
              <span className="hidden sm:inline">Add Results</span><span className="sm:hidden">Add</span>
            </Button>
          </div>
        )}
      </div>

      {/* Meet Hero */}
      <Hero image={meet.meet_photo || meet.photo} className="mb-5 sm:mb-6">
        <h1 className="text-display sm:text-display-xl">{meet.name}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-body-sm text-white/80">
          {meet.country_detail && (
            <CountryFlag code={meet.country_detail.code} flagUrl={meet.country_detail.flag_url} name={meet.country_detail.name} />
          )}
          {meet.location && (
            <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{meet.location}</span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Calendar size={14} />
            {formatDate(meet.date)}{meet.end_date ? ` to ${formatDate(meet.end_date)}` : ''}
          </span>
          <PoolBadge pool={meet.pool} />
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3 mt-5 sm:mt-6">
          {heroStats.map(s => (
            <div key={s.label} className={`bg-white/10 rounded-sm px-2 py-2.5 sm:p-3 text-center ${s.hideMobile ? 'hidden sm:block' : ''}`}>
              <div className="text-time-lg text-white">{s.value}</div>
              <div className="text-label text-white/60">{s.label}</div>
            </div>
          ))}
        </div>
      </Hero>

      {/* Tab Navigation */}
      <Tabs
        sticky
        className="mb-5 sm:mb-6 rounded-t-md"
        tabs={[
          { key: 'results', label: 'Results', icon: ListOrdered },
          { key: 'statistics', label: 'Stats', icon: Waves },
          { key: 'medals', label: 'Medals', icon: Medal },
          { key: 'gallery', label: 'Gallery', icon: Camera },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* Results Tab */}
      {activeTab === 'results' && (!selectedEvent ? (
        /* Full-width events grid when no event is selected */
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-title text-ink-900">Events ({stats.events.length})</h3>
            <SegmentedControl
              options={[
                { key: '', label: 'All' },
                { key: 'M', label: 'Men' },
                { key: 'F', label: 'Women' },
                { key: 'X', label: 'Mixed' },
              ]}
              value={genderFilter}
              onChange={setGenderFilter}
            />
          </div>
          {(() => {
            const filtered = stats.events.filter(e => !genderFilter || e.gender === genderFilter)
            const genders = [...new Set(filtered.map(e => e.gender))]
            return genders.map(g => {
              const genderEvents = filtered.filter(e => e.gender === g)
              const gLabel = genderEvents[0]?.gender_label || ({M: 'Men', F: 'Women', X: 'Mixed'}[g] || g)
              return (
                <div key={g} className="mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <h4 className="text-label text-ink-400">{gLabel}</h4>
                    <div className="flex-1 h-px bg-ink-100" />
                    <span className="text-body-sm text-ink-400 tnum">{genderEvents.length} events</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {genderEvents.map(e => {
                      const isActive = selectedEvent?.event_id === e.event_id && selectedEvent?.gender === e.gender
                      return (
                        <button
                          key={`${e.event_id}-${e.gender}`}
                          onClick={() => handleEventClick(e)}
                          className={`rounded-md p-4 text-start min-h-11 transition-colors shadow-card ${
                            isActive
                              ? 'bg-ink-900 text-white border border-ink-900'
                              : 'bg-white border border-ink-100 hover:border-aqua-500/40 hover:bg-aqua-50/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className={`text-body font-semibold ${isActive ? 'text-white' : 'text-ink-900'}`}>{e.event_name}</div>
                            <ChevronRight size={18} className={isActive ? 'text-white/70' : 'text-ink-400'} />
                          </div>
                          <div className="flex items-center gap-3 mt-2.5">
                            <div className={`flex items-center gap-1.5 text-body-sm tnum ${isActive ? 'text-white/70' : 'text-ink-500'}`}>
                              <Users size={14} />
                              {e.results_count} results
                            </div>
                            <div className={`flex items-center gap-1.5 text-body-sm tnum font-semibold ${isActive ? 'text-aqua-400' : 'text-aqua-600'}`}>
                              <Timer size={14} />
                              {e.best_time}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Left: Events sidebar */}
        <div className="space-y-4">
          <Card padding="none">
            <div className="p-3 border-b border-ink-100">
              <div className="flex items-center justify-between">
                <h3 className="text-body-sm font-semibold text-ink-900">Events ({stats.events.length})</h3>
              </div>
              <SegmentedControl
                className="mt-2 w-full [&>button]:flex-1"
                options={[
                  { key: '', label: 'All' },
                  { key: 'M', label: 'Men' },
                  { key: 'F', label: 'Women' },
                  { key: 'X', label: 'Mixed' },
                ]}
                value={genderFilter}
                onChange={setGenderFilter}
              />
            </div>
            <div className="divide-y divide-ink-100 max-h-[500px] overflow-y-auto">
              {stats.events.filter(e => !genderFilter || e.gender === genderFilter).map((e, i, filtered) => {
                const isSelected = selectedEvent?.event_id === e.event_id && selectedEvent?.gender === e.gender
                const prevGender = i > 0 ? filtered[i-1].gender : null
                const showDivider = prevGender && prevGender !== e.gender
                return (
                  <div key={`${e.event_id}-${e.gender}`}>
                    {showDivider && (
                      <div className="bg-ink-50 px-3 py-1.5 text-label text-ink-400">
                        {e.gender_label}
                      </div>
                    )}
                    {i === 0 && (
                      <div className="bg-ink-50 px-3 py-1.5 text-label text-ink-400">
                        {e.gender_label}
                      </div>
                    )}
                    <button
                      onClick={() => handleEventClick(e)}
                      className={`w-full text-start px-3 py-2.5 min-h-11 hover:bg-ink-50 transition-colors ${
                        isSelected ? 'bg-aqua-50 border-s-4 border-aqua-500' : ''
                      }`}
                    >
                      <div className="text-body-sm font-medium text-ink-900">{e.event_name}</div>
                      <div className="flex items-center gap-2 text-body-sm text-ink-400 mt-0.5">
                        <span className="tnum">{e.results_count} results</span>
                        <span className="text-aqua-600 tnum font-semibold">{e.best_time}</span>
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Right: Results Table */}
        <div>
          {(
            <Card padding="none">
              <div className="p-4 border-b border-ink-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-title text-ink-900">{selectedEvent.event_name} — {selectedEvent.gender_label || ({M: 'Men', F: 'Women', X: 'Mixed'}[selectedEvent.gender] || 'Men')}</h3>
                  <p className="text-body-sm text-ink-400 tnum">{results.length} results</p>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Button
                      variant={editMode ? 'secondary' : 'ghost'}
                      size="sm"
                      icon={Pencil}
                      onClick={() => { setEditMode(m => !m); setEditingId(null) }}
                    >
                      {editMode ? 'Done editing' : 'Edit'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={ArrowLeft}
                    onClick={() => { setSelectedEvent(null); setResults([]); setSelectedRound(null); setEditMode(false); setEditingId(null) }}
                  >
                    All events
                  </Button>
                </div>
              </div>

              {/* Round tabs (Finals / Prelims / Heats) */}
              {!loadingResults && (() => {
                const rounds = [...new Set(results.map(r => r.round_type || ''))]
                if (rounds.length <= 1) return null
                rounds.sort((a, b) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b))
                return (
                  <div className="px-4 py-3 border-b border-ink-100">
                    <SegmentedControl
                      options={rounds.map(round => ({ key: round, label: roundLabel(round) }))}
                      value={selectedRound}
                      onChange={(round) => { setSelectedRound(round); setSelectedCategory(null); setExpandedRelay(null) }}
                    />
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
                const pill = (active) => `px-3 py-1.5 min-h-9 text-body-sm font-medium rounded-full border transition-colors ${
                  active
                    ? 'bg-aqua-600 text-white border-aqua-600'
                    : 'bg-white text-ink-500 border-ink-200 hover:border-aqua-500/40 hover:text-aqua-600'
                }`
                return (
                  <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-ink-100 bg-ink-50/60">
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
                <div className="p-4"><TableSkeleton rows={8} /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-ink-50 border-b border-ink-100">
                        <th scope="col" className={`${TH} w-14`}>Rank</th>
                        <th scope="col" className={TH}>Swimmer</th>
                        <th scope="col" className={TH}>Age</th>
                        <th scope="col" className={TH}>Team</th>
                        <th scope="col" className={TH_END}>Time</th>
                        <th scope="col" className={TH_END}>FINA</th>
                        {editMode && <th scope="col" className={TH_END}>Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
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
                        // Sort HC results to the bottom within each category
                        const sorted = [...catFiltered].sort((a, b) => {
                          if (a.is_hc !== b.is_hc) return a.is_hc ? 1 : -1
                          return a.time_centiseconds - b.time_centiseconds
                        })
                        const order = []
                        const byCat = new Map()
                        for (const r of sorted) {
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
                          // Competition ranking: tied times share a rank (1,2,2,4); HC results are unranked
                          const ranked = arr.filter(x => !x.is_hc)
                          const rank = r.is_hc ? 0 : ranked.findIndex(x => x.time_centiseconds === r.time_centiseconds) + 1
                          const isBest = rank === 1
                          const isExpanded = expandedRelay === r.id
                          const swimmers = r.relay_swimmers || []
                          const splits = r.splits || []
                          const hasSplits = !isRelay && splits.length > 0
                          const isEditing = editingId === r.id
                          const medalOnRow = showMedals && !r.is_manual && !r.is_hc
                          const medalAccent = medalOnRow && rank === 1 ? 'border-s-2 border-s-gold bg-gold/5'
                            : medalOnRow && rank === 2 ? 'border-s-2 border-s-silver bg-silver/5'
                            : medalOnRow && rank === 3 ? 'border-s-2 border-s-bronze bg-bronze/5'
                            : ''
                          return (
                            <React.Fragment key={r.id}>
                              <tr
                                className={`h-11 hover:bg-ink-50 transition-colors ${editMode ? '' : 'cursor-pointer'} ${medalAccent} ${isEditing ? 'bg-aqua-50' : ''}`}
                                onClick={() => {
                                  if (editMode) return
                                  if (isRelay && swimmers.length > 0) {
                                    setExpandedRelay(isExpanded ? null : r.id)
                                  } else {
                                    navigate(`/swimmers/${r.swimmer_detail?.id || r.swimmer}`)
                                  }
                                }}
                              >
                                <td className={TD}>
                                  {r.is_hc ? (
                                    <Badge variant="status" title={r.hc_type === 'TLD' ? 'Time limit exceeded' : 'Hors concours'}>{r.hc_type || 'HC'}</Badge>
                                  ) : (<>
                                    {showMedals && !r.is_manual && rank === 1 && <MedalIcon type="gold" size={22} />}
                                    {showMedals && !r.is_manual && rank === 2 && <MedalIcon type="silver" size={22} />}
                                    {showMedals && !r.is_manual && rank === 3 && <MedalIcon type="bronze" size={22} />}
                                    {(!showMedals || r.is_manual || rank > 3) && <RankNumber rank={rank} />}
                                  </>)}
                                </td>
                                <td className={TD}>
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <SwimmerCell
                                      name={r.swimmer_detail?.name}
                                      countryCode={r.swimmer_detail?.nationality_detail?.code}
                                      flagUrl={r.swimmer_detail?.nationality_detail?.flag_url}
                                    />
                                    {!isRelay && (r.team || '').toUpperCase() === 'LP' && (
                                      <Badge variant="record" className="shrink-0" title="No club — transferring (libre passage)">LP</Badge>
                                    )}
                                    {isRelay && swimmers.length > 0 && (
                                      isExpanded
                                        ? <ChevronUp size={14} className="text-ink-400 shrink-0" />
                                        : <ChevronDown size={14} className="text-ink-400 shrink-0" />
                                    )}
                                  </div>
                                </td>
                                <td className={`${TD} text-ink-500 tnum`}>{r.age_at_competition || '-'}</td>
                                <td className={`${TD} text-ink-500`}>
                                  {isEditing ? (
                                    <Input
                                      value={editValues.team}
                                      onChange={e => setEditValues(v => ({ ...v, team: e.target.value }))}
                                      className="w-28 h-8"
                                      placeholder="Club"
                                    />
                                  ) : (r.team || '-')}
                                </td>
                                <td className={`${TD} text-end whitespace-nowrap`}>
                                  {isEditing ? (
                                    <Input
                                      value={editValues.time}
                                      onChange={e => setEditValues(v => ({ ...v, time: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Enter') saveEditRow(r); if (e.key === 'Escape') setEditingId(null) }}
                                      className="w-24 h-8 tnum"
                                      autoFocus
                                    />
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5">
                                      <TimeDisplay time={r.formatted_time} />
                                      {r.is_hc && (
                                        <Badge variant="status" title={r.hc_type === 'TLD' ? 'Time limit exceeded' : 'Hors concours'}>{r.hc_type || 'HC'}</Badge>
                                      )}
                                      {hasSplits && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setExpandedRelay(isExpanded ? null : r.id) }}
                                          className={`inline-flex items-center gap-0.5 text-label px-1.5 py-0.5 rounded-full transition-colors ${isExpanded ? 'bg-aqua-600 text-white' : 'bg-aqua-50 text-aqua-600 hover:bg-aqua-100'}`}
                                          title="Show split times">
                                          Splits {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                        </button>
                                      )}
                                    </span>
                                  )}
                                </td>
                                <td className={`${TD} text-end tnum`}>{r.fina_points || '-'}</td>
                                {editMode && (
                                  <td className={`${TD} text-end whitespace-nowrap`}>
                                    {isEditing ? (
                                      <span className="inline-flex items-center gap-1">
                                        <Button size="sm" onClick={() => saveEditRow(r)}>Save</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-0.5">
                                        <button onClick={() => startEditRow(r)} title="Edit" aria-label="Edit result" className="p-2 rounded-sm text-ink-400 hover:text-aqua-600 hover:bg-ink-50">
                                          <Pencil size={15} />
                                        </button>
                                        <button onClick={() => removeRow(r)} title="Delete" aria-label="Delete result" className="p-2 rounded-sm text-ink-400 hover:text-neg hover:bg-ink-50">
                                          <Trash2 size={15} />
                                        </button>
                                      </span>
                                    )}
                                  </td>
                                )}
                              </tr>
                              {hasSplits && isExpanded && (
                                <tr className="bg-aqua-50/60">
                                  <td colSpan={editMode ? 7 : 6} className="px-4 py-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      {splits.map((s, j) => (
                                        <span key={j} className="inline-flex items-center gap-1.5 bg-white border border-ink-100 rounded-sm px-2 py-1 shadow-card">
                                          <span className="text-label text-ink-400">{s.distance ? `${s.distance}m` : `#${j + 1}`}</span>
                                          <span className="text-body-sm tnum font-semibold text-ink-700">{s.time}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                              {isRelay && isExpanded && swimmers.map((s, j) => (
                                <tr key={`${r.id}-${j}`} className="bg-aqua-50/40">
                                  <td className={`${TD} text-ink-400 text-end tnum`}>{j + 1}</td>
                                  <td className={`${TD} ps-8`}>{s.name}</td>
                                  <td className={TD} colSpan={2}></td>
                                  <td className={`${TD} text-end tnum text-ink-500`}>{s.split_time || '-'}</td>
                                  <td className={TD} colSpan={editMode ? 2 : 1}></td>
                                </tr>
                              ))}
                            </React.Fragment>
                          )
                        }

                        if (catFiltered.length === 0) {
                          return <tr><td colSpan={editMode ? 7 : 6} className="px-4 py-8 text-center text-body-sm text-ink-400">No results</td></tr>
                        }

                        return order.map(cat => (
                          <React.Fragment key={cat || '_general'}>
                            {hasCategories && (
                              <tr className="bg-ink-50">
                                <td colSpan={editMode ? 7 : 6} className="px-4 py-2 text-label text-ink-500">
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
            </Card>
          )}
        </div>
      </div>))}

      {/* Statistics Tab */}
      {activeTab === 'statistics' && stats && (
        <div className="space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
            {[
              { label: 'Swimmers', value: stats.total_swimmers },
              { label: 'Results', value: stats.total_results },
              { label: 'Events', value: stats.events.length },
              { label: 'Male', value: stats.male_count },
              { label: 'Female', value: stats.female_count },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-md shadow-card border border-ink-100 p-4 text-center">
                <div className="text-time-lg text-aqua-600">{s.value}</div>
                <div className="text-label text-ink-400 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Countries Breakdown */}
          <Card padding="none" title={`Countries (${stats.countries.length})`}>
            <div className="divide-y divide-ink-100 max-h-[500px] overflow-y-auto">
              {stats.countries.map((c, i) => (
                <div key={c.swimmer__nationality__id ?? i} className="flex items-center justify-between px-4 py-3 min-h-11 text-body-sm">
                  <CountryFlag
                    code={c.swimmer__nationality__code}
                    flagUrl={c.swimmer__nationality__flag_url}
                    name={c.swimmer__nationality__name}
                  />
                  <span className="text-body-sm font-medium text-ink-500 tnum">{c.swimmers_count} swimmers</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Top Performers */}
          <TopPerformersTable performers={stats.top_performers} navigate={navigate} />

          {/* Personal Bests */}
          {stats.personal_bests?.length > 0 && (
            <Card padding="none" title="Personal Bests Achieved">
              <p className="px-4 md:px-5 pt-3 text-body-sm text-ink-400">Swimmers who set their all-time best at this meet</p>
              <div className="overflow-x-auto mt-2">
                <table className="w-full">
                  <thead>
                    <tr className="bg-ink-50 border-b border-ink-100">
                      <th scope="col" className={`${TH} w-10`}>#</th>
                      <th scope="col" className={TH}>Swimmer</th>
                      <th scope="col" className={TH}>Event</th>
                      <th scope="col" className={TH_END}>Time</th>
                      <th scope="col" className={TH_END}>FINA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {stats.personal_bests.map((s, i) => (
                      <tr key={i} className="h-11 hover:bg-ink-50 cursor-pointer transition-colors" onClick={() => navigate(`/swimmers/${s.swimmer_id}`)}>
                        <td className={TD}><RankNumber rank={i + 1} /></td>
                        <td className={TD}>
                          <SwimmerCell name={s.swimmer_name} countryCode={s.nationality_code} flagUrl={s.flag_url} />
                        </td>
                        <td className={`${TD} whitespace-nowrap`}>{s.event_name}</td>
                        <td className={`${TD} text-end`}><TimeDisplay time={s.time} pb /></td>
                        <td className={`${TD} text-end`}>
                          {s.fina_points ? (
                            <span className={`tnum font-semibold ${finaTierClass(s.fina_points)}`}>{s.fina_points}</span>
                          ) : <span className="text-ink-400">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Records Broken */}
          {stats.records_broken?.length > 0 && (
            <Card padding="none" title="Records Broken">
              <p className="px-4 md:px-5 pt-3 text-body-sm text-ink-400">Records set or broken at this championship</p>
              <div className="overflow-x-auto mt-2">
                <table className="w-full">
                  <thead>
                    <tr className="bg-ink-50 border-b border-ink-100">
                      <th scope="col" className={`${TH} w-16`}>Record</th>
                      <th scope="col" className={TH}>Swimmer</th>
                      <th scope="col" className={TH}>Event</th>
                      <th scope="col" className={TH_END}>Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {stats.records_broken.map((r, i) => (
                      <tr key={i} className="h-11 hover:bg-ink-50 cursor-pointer transition-colors" onClick={() => navigate(`/swimmers/${r.swimmer_id}`)}>
                        <td className={TD}>
                          <Badge variant={r.record_type === 'ARAB' ? 'pos' : r.record_type === 'GCC' ? 'aqua' : 'record'}>
                            {r.record_type}
                          </Badge>
                        </td>
                        <td className={TD}>
                          <SwimmerCell name={r.swimmer_name} countryCode={r.nationality_code} flagUrl={r.flag_url} />
                        </td>
                        <td className={`${TD} whitespace-nowrap`}>{r.event_name}</td>
                        <td className={`${TD} text-end`}><TimeDisplay time={r.time} record /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Most Improved Swimmers */}
          {mostImproved.length > 0 && (
            <MostImprovedTable swimmers={mostImproved} navigate={navigate} />
          )}

          {/* Championship Comparison */}
          {comparison.length > 1 && (
            <Card padding="none" title="Compare with Previous Editions">
              <p className="px-4 md:px-5 pt-3 text-body-sm text-ink-400">Same classification, same pool type</p>
              <div className="overflow-x-auto mt-2">
                <table className="w-full">
                  <thead>
                    <tr className="bg-ink-50 border-b border-ink-100">
                      <th scope="col" className={TH}>Championship</th>
                      <th scope="col" className={TH}>Host</th>
                      <th scope="col" className={TH_END}>Year</th>
                      <th scope="col" className={TH_END}>Swimmers</th>
                      <th scope="col" className={TH_END}>Countries</th>
                      <th scope="col" className={TH_END}>Events</th>
                      <th scope="col" className={TH_END}>Results</th>
                      <th scope="col" className={TH_END}>Best FINA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {comparison.map((ch) => (
                      <tr key={ch.id} className={`h-11 hover:bg-ink-50 transition-colors ${ch.is_current ? 'bg-aqua-50 font-medium' : 'cursor-pointer'}`}
                        onClick={() => !ch.is_current && navigate(`/meets/${ch.id}?tab=statistics`)}>
                        <td className={TD}>
                          {ch.name}
                          {ch.is_current && <Badge variant="aqua" className="ms-2">Current</Badge>}
                        </td>
                        <td className={`${TD} whitespace-nowrap`}>
                          <CountryFlag code={ch.country_code} flagUrl={ch.flag_url} name={ch.country} />
                        </td>
                        <td className={`${TD} text-end tnum`}>{ch.year}</td>
                        <td className={`${TD} text-end tnum`}>{ch.total_swimmers}</td>
                        <td className={`${TD} text-end tnum`}>{ch.countries_count}</td>
                        <td className={`${TD} text-end tnum`}>{ch.total_events}</td>
                        <td className={`${TD} text-end tnum`}>{ch.total_results}</td>
                        <td className={`${TD} text-end tnum font-bold text-aqua-600`}>{ch.best_fina || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Medals Tab */}
      {activeTab === 'medals' && (
        <MedalsTab
          stats={stats}
          meet={meet}
          medals={medals}
          medalSummary={medalSummary}
          medalClubSummary={medalClubSummary}
          medalSwimmerSummary={medalSwimmerSummary}
          navigate={navigate}
        />
      )}

      {/* Gallery Tab */}
      {activeTab === 'gallery' && (
        <div>
          {!album ? (
            <TableSkeleton rows={4} />
          ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="text-body-sm text-ink-400 tnum">{(album.items || []).length} item{(album.items || []).length === 1 ? '' : 's'}</div>
                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-3">
                    <form onSubmit={(e) => {
                      e.preventDefault()
                      if (!videoUrl.trim()) return
                      createMediaItem({ album: album.id, media_type: 'VIDEO', video_url: videoUrl.trim() })
                        .then(() => { setVideoUrl(''); getOrCreateAlbumForChampionship(id).then(res => setAlbum(res.data)) })
                        .catch(() => {})
                    }} className="flex gap-2">
                      <Input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
                        placeholder="YouTube / Instagram link..."
                        className="w-56" />
                      <Button type="submit" variant="secondary" size="md">Add Video</Button>
                    </form>
                    <label className={`inline-flex items-center justify-center gap-2 h-10 px-4 rounded-sm text-body-sm font-medium bg-white text-ink-900 border border-ink-200 hover:border-aqua-500/40 hover:bg-aqua-50 cursor-pointer transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                      <Camera size={16} />
                      {uploading ? 'Uploading...' : 'Add Photos'}
                      <input type="file" accept="image/*" multiple onChange={async (e) => {
                        const files = Array.from(e.target.files || [])
                        e.target.value = ''
                        if (!files.length) return
                        setUploading(true)
                        try {
                          const fd = new FormData()
                          fd.append('album', album.id)
                          files.forEach(f => fd.append('images', f))
                          await uploadPhotos(fd)
                          const res = await getOrCreateAlbumForChampionship(id)
                          setAlbum(res.data)
                        } catch { /* ignore */ }
                        finally { setUploading(false) }
                      }} className="hidden" />
                    </label>
                  </div>
                )}
              </div>

              {(album.items || []).length === 0 ? (
                <Card padding="none">
                  <EmptyState
                    icon={Camera}
                    title="No photos or videos yet"
                    hint={isAdmin ? 'Add photos or video links for this meet' : 'Media from this meet will appear here'}
                  />
                </Card>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {(album.items || []).map(item => (
                    <div key={item.id} className="group bg-white rounded-md border border-ink-100 shadow-card overflow-hidden">
                      <div className="h-40 bg-ink-950 relative cursor-pointer"
                        onClick={() => item.media_type === 'VIDEO' && item.video_url
                          ? window.open(item.video_url, '_blank')
                          : setLightbox(item)}>
                        {item.media_type === 'PHOTO' && item.image ? (
                          <img src={item.image} alt={item.caption} className="w-full h-full object-cover" />
                        ) : item.embed_thumbnail ? (
                          <img src={item.embed_thumbnail} alt={item.caption} className="w-full h-full object-cover opacity-80" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-ink-400 text-body-sm">Video</div>
                        )}
                        {isAdmin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setPendingDeleteMedia(item) }}
                            aria-label="Delete item"
                            className="absolute top-2 end-2 bg-ink-950/50 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-neg transition-opacity">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      {isAdmin ? (
                        <input
                          type="text" defaultValue={item.caption || ''} placeholder="Add a caption..."
                          onBlur={(e) => {
                            if (e.target.value !== (item.caption || ''))
                              updateMediaItem(item.id, { caption: e.target.value }).then(() => {
                                setAlbum(a => ({ ...a, items: a.items.map(i => i.id === item.id ? { ...i, caption: e.target.value } : i) }))
                              }).catch(() => {})
                          }}
                          className="w-full px-3 py-2 text-body-sm text-ink-500 focus:outline-none focus:bg-aqua-50"
                        />
                      ) : (
                        item.caption ? <div className="px-3 py-2 text-body-sm text-ink-500 truncate">{item.caption}</div> : null
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Lightbox */}
          {lightbox && (
            <div className="fixed inset-0 bg-ink-950/90 z-50 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
              <button aria-label="Close" className="absolute top-5 end-5 text-white/70 hover:text-white p-2"><X size={24} /></button>
              <img src={lightbox.image} alt={lightbox.caption} className="max-h-full max-w-full object-contain rounded-md" />
              {lightbox.caption && (
                <div className="absolute bottom-6 inset-x-0 text-center text-white/80 text-body-sm">{lightbox.caption}</div>
              )}
            </div>
          )}
        </div>
      )}

      {isAdmin && showAddModal && (
        <AddResultsModal
          championshipId={id}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { refreshStats(); refreshResults() }}
        />
      )}

      {isAdmin && showEditModal && (
        <MeetEditModal
          meet={meet}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            getChampionship(id).then(res => setMeet(res.data)).catch(() => {})
            refreshStats()
            refreshResults()
          }}
        />
      )}

      {/* Delete result confirmation */}
      <ConfirmDialog
        open={!!pendingDeleteResult}
        destructive
        title="Delete result"
        message={pendingDeleteResult
          ? `Delete ${pendingDeleteResult.swimmer_detail?.name}'s ${selectedEvent?.event_name} result (${pendingDeleteResult.formatted_time})? This cannot be undone.`
          : ''}
        onConfirm={confirmRemoveRow}
        onCancel={() => setPendingDeleteResult(null)}
      />

      {/* Delete media confirmation */}
      <ConfirmDialog
        open={!!pendingDeleteMedia}
        destructive
        title="Delete media item"
        message="Delete this item? This cannot be undone."
        onConfirm={confirmRemoveMedia}
        onCancel={() => setPendingDeleteMedia(null)}
      />
    </div>
  )
}
