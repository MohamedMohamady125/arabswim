import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, MapPin, Plus, Waves, Pencil, Trash2, ChevronRight, Trophy, BarChart3, Medal, Images, Upload } from 'lucide-react'
import { getChampionships, deleteChampionship } from '../api/championships'
import { getCountries } from '../api/core'
import CountryFlag from '../components/common/CountryFlag'
import { Button, Badge, PoolBadge, FilterBar, Select, SearchInput, EmptyState, Hero, ConfirmDialog, CardsSkeleton, Breadcrumbs } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { POOL_TYPES, mediaUrl, formatDate } from '../utils/constants'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function ChampionshipsPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const isAdmin = !!token
  const toast = useToast()
  const [championships, setChampionships] = useState([])
  const [countries, setCountries] = useState([])
  const [search, setSearch] = useState('')
  const [filterPool, setFilterPool] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const years = []
  for (let y = new Date().getFullYear() + 2; y >= 2000; y--) years.push(y)

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const params = {
      page_size: 500, ordering: '-date', search: search || undefined,
      pool: filterPool || undefined, country: filterCountry || undefined,
    }
    if (filterYear) params.year = filterYear
    getChampionships(params).then(res => {
      setChampionships(res.data.results || res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [search, filterPool, filterCountry, filterYear])

  const handleDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deleteChampionship(pendingDelete.id)
      setChampionships(prev => prev.filter(c => c.id !== pendingDelete.id))
      toast.success(`Deleted "${pendingDelete.name}"`)
      setPendingDelete(null)
    } catch {
      toast.error('Failed to delete championship')
    } finally {
      setDeleting(false)
    }
  }

  // Group by month
  const grouped = {}
  championships.forEach(c => {
    const d = dayjs(c.date, 'DD/MM/YYYY')
    const key = d.isValid() ? `${d.year()}-${String(d.month() + 1).padStart(2, '0')}` : 'unknown'
    if (!grouped[key]) grouped[key] = { year: d.year(), month: d.month(), events: [] }
    grouped[key].events.push(c)
  })

  // Featured meet: nearest upcoming, else most recent (list is ordered -date)
  const today = dayjs()
  const dated = championships
    .map(c => ({ c, d: dayjs(c.date, 'DD/MM/YYYY') }))
    .filter(x => x.d.isValid())
  const upcoming = dated.filter(x => x.d.isAfter(today, 'day')).sort((a, b) => a.d.valueOf() - b.d.valueOf())
  const featured = upcoming[0]?.c || dated[0]?.c

  const chips = [
    filterYear && { key: 'year', label: filterYear, onRemove: () => setFilterYear('') },
    filterPool && { key: 'pool', label: filterPool === 'LCM' ? 'LCM 50m' : 'SCM 25m', onRemove: () => setFilterPool('') },
    filterCountry && { key: 'country', label: countries.find(c => String(c.id) === String(filterCountry))?.name || 'Country', onRemove: () => setFilterCountry('') },
  ].filter(Boolean)

  return (
    <div className="space-y-4 sm:space-y-5">
      <Breadcrumbs items={[{ label: 'Championships' }]} />
      {/* Hero — page title + featured/nearest meet */}
      <Hero image={featured?.meet_photo ? mediaUrl(featured.meet_photo) : undefined}>
        <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="font-display font-extrabold text-[28px] leading-[34px] md:text-[36px] md:leading-[40px]">Championships</h1>
            <p className="text-body text-white/70 mt-1">Every meet across the Arab swimming world.</p>
            {featured && (
              <div className="mt-4 sm:mt-5">
                <div className="text-label text-aqua-400 mb-1">
                  {upcoming[0] ? 'Next meet' : 'Latest meet'}
                </div>
                <button
                  onClick={() => navigate(`/meets/${featured.id}`)}
                  className="text-start group"
                >
                  <div className="text-title group-hover:text-aqua-400 transition-colors line-clamp-2">{featured.name}</div>
                </button>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-body-sm text-white/70">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar size={14} className="shrink-0" />
                    {formatDate(featured.date)}{featured.end_date && featured.end_date !== featured.date ? ` — ${formatDate(featured.end_date)}` : ''}
                  </span>
                  {featured.country_detail && (
                    <CountryFlag code={featured.country_detail.code} flagUrl={featured.country_detail.flag_url} name={featured.country_detail.name} />
                  )}
                  {featured.location && (
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <MapPin size={14} className="shrink-0" />
                      <span className="truncate">{featured.location}</span>
                    </span>
                  )}
                  <PoolBadge pool={featured.pool} />
                </div>
              </div>
            )}
          </div>
          {isAdmin && (
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => navigate('/championships/new')}>
              Add meet
            </Button>
          )}
        </div>
      </Hero>

      {/* Filters */}
      <FilterBar
        chips={chips}
        onReset={() => { setFilterYear(''); setFilterPool(''); setFilterCountry('') }}
      >
        <SearchInput
          placeholder="Search meets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-64"
        />
        <Select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="md:w-32" aria-label="Year">
          <option value="">All years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Select value={filterPool} onChange={(e) => setFilterPool(e.target.value)} className="md:w-36" aria-label="Pool">
          <option value="">All pools</option>
          {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
        <Select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} className="md:w-44" aria-label="Country">
          <option value="">All countries</option>
          {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </FilterBar>

      {/* Loading */}
      {loading && <CardsSkeleton count={4} />}

      {/* Empty state */}
      {!loading && Object.keys(grouped).length === 0 && (
        <EmptyState
          icon={Trophy}
          title="No championships found"
          hint="Try adjusting the search or filters."
        />
      )}

      {/* Championships grouped by month */}
      {!loading && Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([key, group]) => (
        <section key={key}>
          {/* Month band */}
          <div className="flex items-center gap-3 rounded-sm bg-ink-50 border border-ink-100 px-3 sm:px-4 py-2 mb-2.5 sm:mb-3">
            <h2 className="text-label text-ink-900">
              {MONTHS[group.month]} {group.year}
            </h2>
            <span className="ms-auto text-body-sm text-ink-400 whitespace-nowrap tnum">
              {group.events.length} meet{group.events.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Meet cards */}
          <div className="space-y-2.5 sm:space-y-3">
            {group.events.map(c => {
              const isExpanded = expandedId === c.id

              return (
                <div key={c.id}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    className={`bg-white border px-3 py-3 sm:px-5 sm:py-4 flex items-center gap-3 sm:gap-5 cursor-pointer transition-colors ${
                      isExpanded ? 'border-aqua-500/40 bg-aqua-50/40 rounded-t-md' : 'border-ink-100 shadow-card rounded-md hover:border-aqua-500/40'
                    }`}
                  >
                    {/* Meet photo/logo */}
                    {c.meet_photo ? (
                      <div className="w-24 h-20 sm:w-40 sm:h-28 rounded-sm overflow-hidden shrink-0">
                        <img src={mediaUrl(c.meet_photo)} alt={c.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-24 h-20 sm:w-40 sm:h-28 bg-gradient-to-br from-ink-900 to-ink-700 rounded-sm flex items-center justify-center shrink-0">
                        <Waves size={32} className="text-aqua-400/80" />
                      </div>
                    )}

                    {/* Meet info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[15px] leading-snug sm:font-display sm:font-bold sm:text-[20px] sm:leading-7 text-ink-900 line-clamp-2 sm:truncate">{c.name}</h3>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Calendar size={14} className="text-ink-400 shrink-0" />
                        <span className="text-body-sm text-ink-500 min-w-0">
                          {formatDate(c.date)}{c.end_date && c.end_date !== c.date ? ` — ${formatDate(c.end_date)}` : ''}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-body-sm text-ink-500 mt-1">
                        {c.country_detail && (
                          <CountryFlag code={c.country_detail.code} flagUrl={c.country_detail.flag_url} name={c.country_detail.name} />
                        )}
                        {c.location && (
                          <span className="flex items-center gap-1 min-w-0 max-w-full">
                            <MapPin size={14} className="text-ink-400 shrink-0" />
                            <span className="truncate">{c.location}</span>
                          </span>
                        )}
                        <PoolBadge pool={c.pool} />
                      </div>
                      {/* Stats — inline on mobile */}
                      <div className="flex sm:hidden flex-wrap items-center gap-1.5 mt-1.5">
                        {c.results_count > 0 && <Badge variant="pos">{c.results_count} results</Badge>}
                        {c.swimmers_count > 0 && <Badge variant="aqua">{c.swimmers_count} swimmers</Badge>}
                        {!c.results_count && <Badge variant="status">No results</Badge>}
                      </div>
                    </div>

                    {/* Stats — side column on desktop */}
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      {c.results_count > 0 && <Badge variant="pos">{c.results_count} results</Badge>}
                      {c.swimmers_count > 0 && <Badge variant="aqua">{c.swimmers_count} swimmers</Badge>}
                      {!c.results_count && <Badge variant="status">No results</Badge>}
                    </div>

                    <ChevronRight size={18} className={`text-ink-400 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="bg-ink-50 border border-aqua-500/40 border-t-0 rounded-b-md px-3 py-3 sm:px-5 sm:py-4">
                      <div className="flex flex-wrap gap-2">
                        {c.results_count > 0 && (
                          <Button size="sm" icon={Trophy}
                            onClick={(e) => { e.stopPropagation(); navigate({ pathname: `/meets/${c.id}`, search: '?tab=results' }) }}>
                            View Results
                          </Button>
                        )}
                        {c.results_count > 0 && (
                          <Button variant="secondary" size="sm" icon={BarChart3}
                            onClick={(e) => { e.stopPropagation(); navigate({ pathname: `/meets/${c.id}`, search: '?tab=statistics' }) }}>
                            Statistics
                          </Button>
                        )}
                        {c.results_count > 0 && (
                          <Button variant="secondary" size="sm" icon={Medal}
                            onClick={(e) => { e.stopPropagation(); navigate({ pathname: `/meets/${c.id}`, search: '?tab=medals' }) }}>
                            Medals
                          </Button>
                        )}
                        {isAdmin && !c.results_count && (
                          <Button size="sm" icon={Plus}
                            onClick={(e) => { e.stopPropagation(); navigate({ pathname: `/meets/${c.id}`, search: '?tab=results' }) }}>
                            Add Results
                          </Button>
                        )}
                        {isAdmin && !c.results_count && (
                          <Button variant="secondary" size="sm" icon={Upload}
                            onClick={(e) => { e.stopPropagation(); navigate(`/import?championship=${c.id}`) }}>
                            Import File
                          </Button>
                        )}
                        <Button variant="secondary" size="sm" icon={Images}
                          onClick={(e) => { e.stopPropagation(); navigate({ pathname: `/meets/${c.id}`, search: '?tab=gallery' }) }}>
                          Galleries
                        </Button>
                        {isAdmin && (
                          <>
                            <Button variant="ghost" size="sm" icon={Pencil}
                              onClick={(e) => { e.stopPropagation(); navigate(`/championships/${c.id}/edit`) }}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" icon={Trash2} className="text-neg hover:text-neg"
                              onClick={(e) => { e.stopPropagation(); setPendingDelete({ id: c.id, name: c.name }) }}>
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete championship"
        message={pendingDelete ? `Delete championship "${pendingDelete.name}"? This cannot be undone.` : ''}
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
