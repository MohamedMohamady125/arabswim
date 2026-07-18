import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { searchSwimmers, compareSwimmers } from '../api/swimmers'
import CountryFlag from '../components/common/CountryFlag'

const MAX_SWIMMERS = 5

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
      <div className="bg-white rounded-2xl border shadow-sm p-4 text-center relative group animate-fade-in-up" style={{ animationDelay: `${index * 0.06}s` }}>
        <button onClick={onRemove}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-all">&times;</button>
        <div className="w-16 h-16 rounded-full bg-gray-100 mx-auto overflow-hidden mb-2 ring-2 ring-sky-100">
          {swimmer.photo ? <img src={swimmer.photo} alt="" className="w-full h-full object-cover" /> : (
            <div className="w-full h-full flex items-center justify-center"><svg className="w-8 h-8 text-gray-300" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg></div>
          )}
        </div>
        <div className="text-sm font-bold text-gray-800 truncate">{swimmer.name}</div>
        <div className="mt-1">
          <CountryFlag code={swimmer.nationality_detail?.code} flagUrl={swimmer.nationality_detail?.flag_url} name={swimmer.nationality_detail?.name} className="text-xs text-gray-500" />
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up" style={{ animationDelay: `${index * 0.06}s` }}>
      <div className="bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 p-4 text-center relative">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search swimmer..."
          className="w-full text-center text-sm bg-transparent outline-none placeholder:text-gray-300" />
        {results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-48 overflow-y-auto z-20">
            {results.map(s => (
              <button key={s.id} onClick={() => { onAdd(s); setSearch(''); setResults([]) }}
                className="w-full text-left px-3 py-2 hover:bg-sky-50 flex items-center gap-2 text-sm transition-colors">
                <div className="w-7 h-7 rounded-full bg-gray-100 overflow-hidden shrink-0">
                  {s.photo ? <img src={s.photo} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">-</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.name}</div>
                  <div className="text-[10px] text-gray-400">{s.nationality_detail?.name} {s.club ? `\u00b7 ${s.club}` : ''}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatRow({ label, values, best, format = 'number', higherIsBetter = true }) {
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-3 text-sm font-semibold text-gray-600 whitespace-nowrap">{label}</td>
      {values.map((v, i) => {
        const isBest = v != null && v === best
        const display = v == null ? '-' : format === 'time' ? v : v
        return (
          <td key={i} className="px-4 py-3 text-center">
            <span className={`text-sm font-mono font-bold ${isBest ? 'text-emerald-600' : 'text-gray-700'}`}>
              {display}
              {isBest && <span className="ml-1 text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded font-sans">Best</span>}
            </span>
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
    <div className="max-w-6xl mx-auto pb-12">
      <button onClick={() => navigate('/swimmers')}
        className="text-gray-400 hover:text-gray-600 text-sm mb-4 inline-flex items-center gap-1.5 group transition-colors">
        <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Back to Swimmers
      </button>

      <div className="mb-6 animate-fade-in-up">
        <h1 className="text-2xl font-bold text-gray-800">Compare Swimmers</h1>
        <p className="text-sm text-gray-400 mt-1">Select 2-5 swimmers to compare side-by-side</p>
      </div>

      {/* Swimmer Selection */}
      <div className={`grid gap-3 mb-6 ${selected.length < MAX_SWIMMERS ? `grid-cols-${Math.min(selected.length + 1, MAX_SWIMMERS)}` : `grid-cols-${MAX_SWIMMERS}`}`}
        style={{ gridTemplateColumns: `repeat(${Math.min(selected.length + (selected.length < MAX_SWIMMERS ? 1 : 0), MAX_SWIMMERS)}, minmax(0, 1fr))` }}>
        {selected.map((s, i) => (
          <SwimmerSlot key={s.id} swimmer={s} index={i} onRemove={() => removeSwimmer(s.id)} />
        ))}
        {selected.length < MAX_SWIMMERS && (
          <SwimmerSlot index={selected.length} onAdd={addSwimmer} />
        )}
      </div>

      {/* Compare Button */}
      {selected.length >= 2 && (
        <div className="flex justify-center mb-8 animate-fade-in">
          <button onClick={doCompare} disabled={loading}
            className="bg-sky-600 hover:bg-sky-700 text-white px-8 py-3 rounded-xl text-sm font-bold shadow-lg shadow-sky-200 hover:shadow-sky-300 transition-all duration-300 disabled:opacity-50 flex items-center gap-2">
            {loading ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Comparing...</>
            ) : (
              <>Compare {selected.length} Swimmers</>
            )}
          </button>
        </div>
      )}

      {/* Results */}
      {comparison && data.length >= 2 && (
        <div className="space-y-6 animate-fade-in-up">
          {/* Overview Cards */}
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-gradient-to-r from-gray-50 to-white">
              <h2 className="font-bold text-base text-gray-800">Career Overview</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50/80">
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider w-40">Metric</th>
                    {data.map(s => (
                      <th key={s.id} className="px-4 py-3 text-center">
                        <button onClick={() => navigate(`/swimmers/${s.id}`)} className="hover:text-sky-600 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-gray-100 mx-auto overflow-hidden mb-1 ring-1 ring-gray-200">
                            {s.photo ? <img src={s.photo} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">-</div>}
                          </div>
                          <div className="text-xs font-bold text-gray-800 truncate max-w-[120px] mx-auto">{s.name}</div>
                          <div className="flex justify-center mt-0.5">
                            <CountryFlag code={s.nationality_code} flagUrl={s.flag_url} name={s.nationality} className="text-[10px] text-gray-400" />
                          </div>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <StatRow label="Age" values={data.map(s => s.age)} best={null} />
                  <StatRow label="Club" values={data.map(s => s.club || '-')} best={null} />
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
          </div>

          {/* Head-to-Head: Shared Events */}
          {sharedEvents.length > 0 && (
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden animate-fade-in-up stagger-3">
              <div className="p-4 border-b bg-gradient-to-r from-gray-50 to-white">
                <h2 className="font-bold text-base text-gray-800">Head-to-Head</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Personal best times in events they share</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50/80">
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Event</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider w-16">Pool</th>
                      {data.map(s => (
                        <th key={s.id} className="px-4 py-3 text-center text-xs font-bold text-gray-600 max-w-[120px] truncate">{s.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sharedEvents.map((ev, ei) => {
                      const key = `${ev.event_id}_${ev.pool}`
                      const times = data.map(s => {
                        const pb = s.personal_bests[key]
                        return pb ? pb.best_cs : null
                      })
                      const bestTime = bestOf(times.filter(Boolean), false)
                      return (
                        <tr key={key} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors animate-fade-in-up" style={{ animationDelay: `${(ei + 4) * 0.04}s` }}>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-700">{ev.event_name}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              ev.pool === 'SCM' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
                            }`}>{ev.pool}</span>
                          </td>
                          {data.map((s, si) => {
                            const pb = s.personal_bests[key]
                            if (!pb) return <td key={si} className="px-4 py-3 text-center text-gray-300 text-sm">-</td>
                            const isBest = pb.best_cs === bestTime
                            return (
                              <td key={si} className="px-4 py-3 text-center">
                                <span className={`text-sm font-mono font-bold ${isBest ? 'text-emerald-600' : 'text-gray-700'}`}>
                                  {pb.best_time}
                                </span>
                                {isBest && <span className="ml-1 text-[8px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded font-sans font-bold">Fastest</span>}
                                <div className="text-[10px] text-gray-400 mt-0.5">{pb.swims} swim{pb.swims !== 1 ? 's' : ''}</div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Medal Comparison Visual */}
          <div className="bg-white rounded-2xl border shadow-sm p-5 animate-fade-in-up stagger-5">
            <h2 className="font-bold text-base text-gray-800 mb-4">Medal Comparison</h2>
            <div className="space-y-3">
              {data.map((s, i) => {
                const total = s.medals.total
                const maxTotal = Math.max(...data.map(d => d.medals.total)) || 1
                return (
                  <div key={s.id} className="flex items-center gap-3 animate-fade-in-up" style={{ animationDelay: `${(i + 6) * 0.06}s` }}>
                    <div className="w-28 text-sm font-semibold text-gray-600 truncate shrink-0">{s.name}</div>
                    <div className="flex-1">
                      <div className="flex h-6 rounded-full overflow-hidden bg-gray-100" style={{ width: `${Math.max((total / maxTotal) * 100, total > 0 ? 6 : 2)}%` }}>
                        {s.medals.gold > 0 && <div className="animate-grow-width" style={{ width: `${(s.medals.gold / total) * 100}%`, backgroundColor: '#FFD700' }} />}
                        {s.medals.silver > 0 && <div className="animate-grow-width" style={{ width: `${(s.medals.silver / total) * 100}%`, backgroundColor: '#C0C0C0' }} />}
                        {s.medals.bronze > 0 && <div className="animate-grow-width" style={{ width: `${(s.medals.bronze / total) * 100}%`, backgroundColor: '#CD7F32' }} />}
                      </div>
                    </div>
                    <div className="flex gap-1.5 text-[10px] font-bold shrink-0 w-24 justify-end">
                      {s.medals.gold > 0 && <span style={{ color: '#B8860B' }}>{s.medals.gold}G</span>}
                      {s.medals.silver > 0 && <span className="text-gray-500">{s.medals.silver}S</span>}
                      {s.medals.bronze > 0 && <span style={{ color: '#CD7F32' }}>{s.medals.bronze}B</span>}
                      {total === 0 && <span className="text-gray-300">None</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
