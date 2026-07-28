import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, ChevronLeft, User, X, Users } from 'lucide-react'
import { searchSwimmers, compareSwimmers } from '../api/swimmers'
import CountryFlag from '../components/common/CountryFlag'
import { Button, Card, PoolBadge, SearchInput, Badge, EmptyState } from '../components/ui'

const MAX_SWIMMERS = 5

function Avatar({ photo, size = 'md' }) {
  const cls = size === 'lg' ? 'w-16 h-16' : size === 'md' ? 'w-10 h-10' : 'w-7 h-7'
  return (
    <div className={`${cls} rounded-full bg-ink-50 overflow-hidden shrink-0 ring-1 ring-ink-100`}>
      {photo ? (
        <img src={photo} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-ink-200">
          <User size={size === 'lg' ? 28 : size === 'md' ? 18 : 13} />
        </div>
      )}
    </div>
  )
}

function SwimmerSlot({ swimmer, onRemove, onAdd, index }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (search.length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      searchSwimmers(search).then(res => setResults(res.data)).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  if (swimmer) {
    return (
      <div className="bg-white rounded-md border border-ink-100 shadow-card p-4 text-center relative animate-fade-up" style={{ animationDelay: `${index * 0.04}s` }}>
        <button onClick={onRemove} aria-label={`Remove ${swimmer.name}`}
          className="absolute top-2 end-2 w-7 h-7 rounded-full bg-ink-50 text-ink-400 hover:bg-neg/10 hover:text-neg flex items-center justify-center transition-colors">
          <X size={14} />
        </button>
        <div className="mx-auto mb-2 flex justify-center"><Avatar photo={swimmer.photo} size="lg" /></div>
        <div className="text-body-sm font-semibold text-ink-900 truncate">{swimmer.name}</div>
        <div className="mt-1 flex justify-center min-w-0">
          <CountryFlag code={swimmer.nationality_detail?.code} flagUrl={swimmer.nationality_detail?.flag_url} name={swimmer.nationality_detail?.name} className="text-body-sm text-ink-500 min-w-0 max-w-full [&>span:last-child]:truncate [&>span:last-child]:min-w-0" />
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-up" style={{ animationDelay: `${index * 0.04}s` }}>
      <div className="bg-ink-50 rounded-md border-2 border-dashed border-ink-200 p-4 relative">
        <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search swimmer..." />
        {results.length > 0 && (
          <div className="absolute top-full inset-x-0 mt-1 bg-white border border-ink-100 rounded-md shadow-pop max-h-48 overflow-y-auto z-20">
            {results.map(s => (
              <button key={s.id} onClick={() => { onAdd(s); setSearch(''); setResults([]) }}
                className="w-full text-start px-3 py-2.5 hover:bg-aqua-50 flex items-center gap-2.5 transition-colors">
                <Avatar photo={s.photo} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-body-sm font-medium text-ink-900 truncate">{s.name}</div>
                  <div className="text-body-sm text-ink-400 truncate">{s.nationality_detail?.name} {s.club ? `\u00b7 ${s.club}` : ''}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatRow({ label, values, best }) {
  return (
    <tr className="hover:bg-ink-50 transition-colors">
      <td className="px-4 py-3 text-body-sm font-medium text-ink-500 whitespace-nowrap sticky start-0 bg-white">{label}</td>
      {values.map((v, i) => {
        const isBest = v != null && v === best
        const display = v == null ? '–' : v
        return (
          <td key={i} className="px-4 py-3 text-center">
            <span className={`text-body-sm font-semibold tnum ${isBest ? 'text-pos' : 'text-ink-900'}`}>
              {display}
            </span>
            {isBest && <Badge variant="pos" className="ms-1.5">Best</Badge>}
          </td>
        )
      })}
    </tr>
  )
}

export default function CompareSwimmersPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selected, setSelected] = useState([])
  const [comparison, setComparison] = useState(null)
  const [loading, setLoading] = useState(false)

  // Load from URL params on mount
  useEffect(() => {
    const ids = searchParams.get('ids')
    if (ids) {
      const idList = ids.split(',').filter(Boolean)
      // Fetch swimmer details for pre-selected IDs
      Promise.all(idList.map(id =>
        import('../api/swimmers').then(m => m.getSwimmer(id)).then(r => r.data).catch(() => null)
      )).then(swimmers => {
        setSelected(swimmers.filter(Boolean))
      })
    }
  }, [])

  const addSwimmer = (swimmer) => {
    if (selected.length >= MAX_SWIMMERS) return
    if (selected.find(s => s.id === swimmer.id)) return
    setSelected([...selected, swimmer])
  }

  const removeSwimmer = (id) => {
    setSelected(selected.filter(s => s.id !== id))
    setComparison(null)
  }

  const doCompare = async () => {
    if (selected.length < 2) return
    setLoading(true)
    const ids = selected.map(s => s.id)
    setSearchParams({ ids: ids.join(',') })
    try {
      const res = await compareSwimmers(ids)
      setComparison(res.data)
    } catch { setComparison(null) }
    finally { setLoading(false) }
  }

  const data = comparison?.swimmers || []
  const sharedEvents = comparison?.shared_events || []

  // Helpers
  const bestOf = (vals, higherIsBetter = true) => {
    const valid = vals.filter(v => v != null)
    if (!valid.length) return null
    return higherIsBetter ? Math.max(...valid) : Math.min(...valid)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-6 pb-12">
      <nav className="flex items-center gap-1 text-body-sm text-ink-400 mb-2" aria-label="Breadcrumb">
        <button onClick={() => navigate('/swimmers')} className="inline-flex items-center gap-1 hover:text-aqua-600 transition-colors">
          <ChevronLeft size={14} />
          Swimmers
        </button>
      </nav>
      <div className="mb-5 md:mb-6 animate-fade-up">
        <h1 className="text-display text-ink-900">Compare Swimmers</h1>
        <p className="text-body text-ink-500 mt-1">Select 2–5 swimmers to compare side-by-side</p>
      </div>

      {/* Swimmer Selection */}
      <div className="grid gap-3 mb-6 grid-cols-2 sm:grid-cols-3 md:[grid-template-columns:var(--cmp-cols)]"
        style={{ '--cmp-cols': `repeat(${Math.min(selected.length + (selected.length < MAX_SWIMMERS ? 1 : 0), MAX_SWIMMERS)}, minmax(0, 1fr))` }}>
        {selected.map((s, i) => (
          <SwimmerSlot key={s.id} swimmer={s} index={i} onRemove={() => removeSwimmer(s.id)} />
        ))}
        {selected.length < MAX_SWIMMERS && (
          <SwimmerSlot index={selected.length} onAdd={addSwimmer} />
        )}
      </div>

      {/* Compare Button */}
      {selected.length >= 2 && (
        <div className="flex justify-center mb-8 animate-fade-up">
          <Button icon={ArrowLeftRight} loading={loading} onClick={doCompare}>
            {loading ? 'Comparing...' : `Compare ${selected.length} Swimmers`}
          </Button>
        </div>
      )}

      {selected.length < 2 && !comparison && (
        <Card padding="none" className="mb-6">
          <EmptyState
            icon={Users}
            title="Pick at least two swimmers"
            hint="Search and add 2–5 swimmers above, then run the comparison to see career stats, head-to-head best times, and medals."
          />
        </Card>
      )}

      {/* Results */}
      {comparison && data.length >= 2 && (
        <div className="space-y-6 md:space-y-8 animate-fade-up">
          {/* Career Overview */}
          <Card title="Career Overview" padding="none">
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50">
                    <th scope="col" className="px-4 py-3 text-start text-label text-ink-400 w-28 sm:w-40 sticky start-0 bg-ink-50">Metric</th>
                    {data.map(s => (
                      <th key={s.id} scope="col" className="px-4 py-3 text-center min-w-32">
                        <button onClick={() => navigate(`/swimmers/${s.id}`)} className="group mx-auto">
                          <div className="mx-auto mb-1 flex justify-center"><Avatar photo={s.photo} /></div>
                          <div className="text-body-sm font-semibold text-ink-900 group-hover:text-aqua-600 transition-colors truncate max-w-32 mx-auto">{s.name}</div>
                          <div className="flex justify-center mt-0.5">
                            <CountryFlag code={s.nationality_code} flagUrl={s.flag_url} name={s.nationality} className="text-body-sm text-ink-400" />
                          </div>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  <StatRow label="Age" values={data.map(s => s.age)} best={null} />
                  <StatRow label="Club" values={data.map(s => s.club || '–')} best={null} />
                  <StatRow label="Championships" values={data.map(s => s.total_championships)} best={bestOf(data.map(s => s.total_championships))} />
                  <StatRow label="Total Swims" values={data.map(s => s.total_swims)} best={bestOf(data.map(s => s.total_swims))} />
                  <StatRow label="Best FINA" values={data.map(s => s.best_fina)} best={bestOf(data.map(s => s.best_fina))} />
                  <StatRow label="Avg FINA" values={data.map(s => s.avg_fina)} best={bestOf(data.map(s => s.avg_fina))} />
                  <StatRow label="Gold Medals" values={data.map(s => s.medals.gold)} best={bestOf(data.map(s => s.medals.gold))} />
                  <StatRow label="Silver Medals" values={data.map(s => s.medals.silver)} best={bestOf(data.map(s => s.medals.silver))} />
                  <StatRow label="Bronze Medals" values={data.map(s => s.medals.bronze)} best={bestOf(data.map(s => s.medals.bronze))} />
                  <StatRow label="Total Medals" values={data.map(s => s.medals.total)} best={bestOf(data.map(s => s.medals.total))} />
                  <StatRow label="Records Held" values={data.map(s => s.records_count)} best={bestOf(data.map(s => s.records_count))} />
                </tbody>
              </table>
            </div>
          </Card>

          {/* Head-to-Head: Shared Events */}
          {sharedEvents.length > 0 && (
            <Card
              title="Head-to-Head"
              action={<span className="text-body-sm text-ink-400">Personal bests in shared events</span>}
              padding="none"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <thead>
                    <tr className="border-b border-ink-100 bg-ink-50">
                      <th scope="col" className="px-4 py-3 text-start text-label text-ink-400 sticky start-0 bg-ink-50">Event</th>
                      <th scope="col" className="px-4 py-3 text-start text-label text-ink-400 w-20">Pool</th>
                      {data.map(s => (
                        <th key={s.id} scope="col" className="px-4 py-3 text-center text-body-sm font-semibold text-ink-900 max-w-32 truncate">{s.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {sharedEvents.map((ev) => {
                      const key = `${ev.event_id}_${ev.pool}`
                      const times = data.map(s => {
                        const pb = s.personal_bests[key]
                        return pb ? pb.best_cs : null
                      })
                      const bestTime = bestOf(times.filter(Boolean), false)
                      return (
                        <tr key={key} className="hover:bg-ink-50 transition-colors">
                          <td className="px-4 py-3 text-body-sm font-medium text-ink-900 whitespace-nowrap sticky start-0 bg-white">{ev.event_name}</td>
                          <td className="px-4 py-3"><PoolBadge pool={ev.pool} /></td>
                          {data.map((s, si) => {
                            const pb = s.personal_bests[key]
                            if (!pb) return <td key={si} className="px-4 py-3 text-center text-ink-200 text-body-sm">–</td>
                            const isBest = pb.best_cs === bestTime
                            return (
                              <td key={si} className="px-4 py-3 text-center">
                                <span className={`text-time tnum ${isBest ? 'text-pos' : 'text-ink-900'}`}>
                                  {pb.best_time}
                                </span>
                                {isBest && <Badge variant="pos" className="ms-1.5">Fastest</Badge>}
                                <div className="text-body-sm text-ink-400 mt-0.5 tnum">{pb.swims} swim{pb.swims !== 1 ? 's' : ''}</div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Medal Comparison Visual */}
          <Card title="Medal Comparison">
            <div className="space-y-3">
              {data.map((s) => {
                const total = s.medals.total
                const maxTotal = Math.max(...data.map(d => d.medals.total)) || 1
                return (
                  <div key={s.id} className="flex items-center gap-2 sm:gap-3">
                    <div className="w-20 sm:w-28 text-body-sm font-medium text-ink-500 truncate shrink-0">{s.name}</div>
                    <div className="flex-1">
                      <div className="flex h-5 rounded-full overflow-hidden bg-ink-50" style={{ width: `${Math.max((total / maxTotal) * 100, total > 0 ? 6 : 2)}%` }}>
                        {s.medals.gold > 0 && <div className="bg-gold" style={{ width: `${(s.medals.gold / total) * 100}%` }} />}
                        {s.medals.silver > 0 && <div className="bg-silver" style={{ width: `${(s.medals.silver / total) * 100}%` }} />}
                        {s.medals.bronze > 0 && <div className="bg-bronze" style={{ width: `${(s.medals.bronze / total) * 100}%` }} />}
                      </div>
                    </div>
                    <div className="flex gap-1.5 sm:gap-2 text-body-sm font-semibold tnum shrink-0 sm:w-24 justify-end">
                      {s.medals.gold > 0 && <span className="text-gold">{s.medals.gold}G</span>}
                      {s.medals.silver > 0 && <span className="text-silver">{s.medals.silver}S</span>}
                      {s.medals.bronze > 0 && <span className="text-bronze">{s.medals.bronze}B</span>}
                      {total === 0 && <span className="text-ink-200 font-normal">None</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
