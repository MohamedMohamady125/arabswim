import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { searchSwimmers, compareSwimmers, getSwimmerEvents, getSwimmer } from '../api/swimmers'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty } from '../components/ui'

const MAX = 5
const list = (d) => (Array.isArray(d) ? d : d?.results || [])

export default function Compare() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selected, setSelected] = useState([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null) // { swimmers, rows }
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const boxRef = useRef(null)
  const hydratedRef = useRef(false)
  const startedRef = useRef(false)

  // hydrate selection from ?ids= (swimmer profiles link here)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    const ids = (searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, MAX)
    if (ids.length === 0) { hydratedRef.current = true; return }
    Promise.allSettled(ids.map((id) => getSwimmer(id))).then((res) => {
      const swimmers = res.filter((r) => r.status === 'fulfilled').map((r) => r.value.data).filter(Boolean)
      hydratedRef.current = true
      if (swimmers.length) setSelected(swimmers)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keep ?ids= in sync with selection (after hydration completes)
  useEffect(() => {
    if (!hydratedRef.current) return
    const ids = selected.map((s) => s.id).join(',')
    setSearchParams(ids ? { ids } : {}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // search dropdown (debounced)
  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(() => {
      searchSwimmers(q.trim())
        .then((res) => {
          const l = list(res.data).filter((s) => !s.is_relay_team)
          setResults(l.slice(0, 8))
          setOpen(true)
        })
        .catch(() => setResults([]))
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [q])

  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const add = (s) => {
    if (selected.length >= MAX || selected.some((x) => x.id === s.id)) return
    setSelected([...selected, s])
    setQ('')
    setResults([])
    setOpen(false)
  }
  const remove = (id) => setSelected(selected.filter((s) => s.id !== id))

  // fetch comparison when 2+ selected
  useEffect(() => {
    if (selected.length < 2) { setData(null); return }
    let alive = true
    setLoading(true)
    async function load() {
      const ids = selected.map((s) => s.id)
      try {
        const res = await compareSwimmers(ids)
        if (!alive) return
        const swimmers = res.data?.swimmers || []
        // union of PB keys "eventId_pool"
        const rowMap = new Map()
        swimmers.forEach((sw) => {
          Object.entries(sw.personal_bests || {}).forEach(([key, pb]) => {
            if (!rowMap.has(key)) {
              rowMap.set(key, { key, event_name: pb.event_name, pool: pb.pool, event_id: parseInt(key), times: {} })
            }
            rowMap.get(key).times[sw.id] = pb
          })
        })
        const rows = [...rowMap.values()].sort((a, b) => a.pool.localeCompare(b.pool) || a.event_id - b.event_id)
        setData({ swimmers, rows })
      } catch {
        // fallback: fetch each swimmer's events and align by event+pool
        try {
          const eventRes = await Promise.allSettled(ids.map((sid) => getSwimmerEvents(sid)))
          if (!alive) return
          const swimmers = selected.map((s) => ({
            id: s.id,
            name: s.name,
            nationality_code: s.nationality_detail?.code,
            nationality: s.nationality_detail?.name,
            club: s.club,
            age: s.age,
          }))
          const rowMap = new Map()
          eventRes.forEach((r, i) => {
            if (r.status !== 'fulfilled') return
            list(r.value.data).forEach((e) => {
              if (!(e.times_count > 0)) return
              const key = `${e.event_id}_${e.pool}`
              if (!rowMap.has(key)) {
                rowMap.set(key, { key, event_name: e.event_name, pool: e.pool, event_id: e.event_id, times: {} })
              }
              rowMap.get(key).times[ids[i]] = { best_time: e.best_time, best_cs: e.best_time_centiseconds, swims: e.times_count }
            })
          })
          const rows = [...rowMap.values()].sort((a, b) => a.pool.localeCompare(b.pool) || a.event_id - b.event_id)
          setData({ swimmers, rows })
        } catch {
          if (alive) setData({ swimmers: [], rows: [] })
        }
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [selected])

  const sharedRows = useMemo(
    () => (data?.rows || []).filter((r) => Object.keys(r.times).length > 0),
    [data]
  )

  return (
    <div>
      <PageHead kicker="People" title="Compare swimmers" sub={`Pick up to ${MAX} swimmers to compare personal bests side by side.`} />

      {/* picker */}
      <div className="rule-b" style={{ padding: '18px 32px' }}>
        <div ref={boxRef} style={{ position: 'relative', maxWidth: 380 }}>
          <input
            className="input"
            placeholder={selected.length >= MAX ? `Maximum ${MAX} swimmers` : 'Search a swimmer to add…'}
            value={q}
            disabled={selected.length >= MAX}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => { if (results.length) setOpen(true) }}
          />
          {open && results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderTop: 0, boxShadow: 'var(--shadow-md)' }}>
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => add(s)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--color-neutral-200)', cursor: 'pointer', font: 'inherit', fontSize: 13, textAlign: 'left' }}
                >
                  <Flag code={s.nationality_detail?.code} name={s.nationality_detail?.name} />
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span className="text-muted asw-num" style={{ fontSize: 12 }}>{s.birth_year || ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {selected.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {selected.map((s) => (
              <span key={s.id} className="tag tag-dark" style={{ gap: 8, paddingRight: 6 }}>
                {s.name}
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  aria-label={`Remove ${s.name}`}
                  style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', font: 'inherit', padding: '0 2px' }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {selected.length < 2 ? (
        <Empty label="Select at least two swimmers" />
      ) : loading ? (
        <Loading label="Comparing" />
      ) : !data || data.swimmers.length === 0 ? (
        <Empty label="Comparison unavailable" />
      ) : (
        <div className="pad">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  {data.swimmers.map((sw) => (
                    <th key={sw.id} className="time">
                      <Link to={`/swimmers/${sw.id}`} style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <Flag code={sw.nationality_code} name={sw.nationality} />
                        {sw.name}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* summary rows when available */}
                {data.swimmers.some((sw) => sw.best_fina != null) && (
                  <tr>
                    <td className="micro">Best FINA</td>
                    {data.swimmers.map((sw) => (
                      <td key={sw.id} className="time asw-num">{sw.best_fina ?? '—'}</td>
                    ))}
                  </tr>
                )}
                {data.swimmers.some((sw) => sw.medals) && (
                  <tr>
                    <td className="micro">Medals G·S·B</td>
                    {data.swimmers.map((sw) => (
                      <td key={sw.id} className="time asw-num">
                        {sw.medals ? `${sw.medals.gold}·${sw.medals.silver}·${sw.medals.bronze}` : '—'}
                      </td>
                    ))}
                  </tr>
                )}
                {sharedRows.map((row) => {
                  const values = data.swimmers.map((sw) => row.times[sw.id]?.best_cs).filter((v) => v != null)
                  const best = values.length ? Math.min(...values) : null
                  return (
                    <tr key={row.key}>
                      <td style={{ fontWeight: 600 }}>
                        {row.event_name} <span className="text-muted" style={{ fontWeight: 400, fontSize: 12 }}>{row.pool}</span>
                      </td>
                      {data.swimmers.map((sw) => {
                        const pb = row.times[sw.id]
                        const isBest = pb?.best_cs != null && pb.best_cs === best && values.length > 1
                        return (
                          <td key={sw.id} className="time asw-time" style={isBest ? { color: 'var(--asw-fast)', fontWeight: 800 } : undefined}>
                            {isBest && (
                              <span className="tag" style={{ background: 'var(--asw-fast)', color: '#fff', marginRight: 8, fontWeight: 600 }}>
                                Best
                              </span>
                            )}
                            {pb?.best_time || '—'}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {sharedRows.length === 0 && (
                  <tr><td colSpan={1 + data.swimmers.length} className="text-muted" style={{ textAlign: 'center', padding: 24 }}>No personal bests to compare</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
