import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getRankings } from '../api/rankings'
import { getCountries, getEvents } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg, Pager } from '../components/ui'
import { formatDate, AGE_GROUPS } from '../utils'

const PAGE_SIZE = 25
const STROKE_ORDER = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley', 'Freestyle Relay', 'Medley Relay']

export default function Rankings() {
  const navigate = useNavigate()
  const [countries, setCountries] = useState([])
  const [events, setEvents] = useState([])
  const [scope, setScope] = useState('arab')
  const [country, setCountry] = useState('')
  const [gender, setGender] = useState('M')
  const [pool, setPool] = useState('LCM')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [event, setEvent] = useState('')
  const [ageGroup, setAgeGroup] = useState('OPEN')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const years = useMemo(() => {
    const cur = new Date().getFullYear()
    const out = []
    for (let y = cur; y >= 2000; y--) out.push(y)
    return out
  }, [])

  useEffect(() => {
    let alive = true
    Promise.allSettled([getCountries(), getEvents({ has_results: true })]).then(([cRes, eRes]) => {
      if (!alive) return
      const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
      const list = (d) => (Array.isArray(d) ? d : d?.results || [])
      setCountries(list(val(cRes)).filter((c) => c.region === 'ARAB' || c.region === 'GCC'))
      const evs = list(val(eRes))
      setEvents(evs)
      // Auto-select first non-relay event
      const first = evs.find((e) => !e.is_relay) || evs[0]
      if (first) setEvent(String(first.id))
    })
    return () => { alive = false }
  }, [])

  // 100 IM only exists in SCM; group by stroke, distance-sorted within group.
  const eventGroups = useMemo(() => {
    const filtered = pool === 'LCM'
      ? events.filter((e) => !(e.stroke === 'Individual Medley' && e.distance === 100))
      : events
    const grouped = {}
    for (const e of filtered) {
      let stroke = e.stroke || 'Other'
      // Relays (incl. mixed) group under the relay strokes, not among
      // the individual events — a 4x50 free relay is not a 200 free.
      const isRelay = e.is_relay || /relay/i.test(e.name || '')
      if (isRelay && !/relay/i.test(stroke)) {
        stroke = stroke === 'Individual Medley' || /medley/i.test(e.name || '') ? 'Medley Relay' : `${stroke} Relay`
      }
      if (!grouped[stroke]) grouped[stroke] = []
      grouped[stroke].push(e)
    }
    Object.values(grouped).forEach((arr) => arr.sort((a, b) =>
      (a.distance - b.distance) || String(a.name).localeCompare(String(b.name))))
    const strokes = Object.keys(grouped).sort((a, b) => {
      const ai = STROKE_ORDER.indexOf(a)
      const bi = STROKE_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
    return strokes.map((stroke) => ({ stroke, events: grouped[stroke] }))
  }, [events, pool])

  // If the selected event disappears with the pool switch (100 IM), pick a valid one.
  useEffect(() => {
    if (!event) return
    const stillValid = eventGroups.some((g) => g.events.some((e) => String(e.id) === event))
    if (!stillValid) {
      const first = eventGroups[0]?.events[0]
      setEvent(first ? String(first.id) : '')
    }
  }, [eventGroups, event])

  useEffect(() => { setPage(1) }, [scope, country, gender, pool, year, event, ageGroup])

  useEffect(() => {
    if (!event) { setRows([]); setCount(0); setLoading(false); return }
    if (scope === 'national' && !country) { setRows([]); setCount(0); setLoading(false); return }
    let alive = true
    setLoading(true)
    const params = {
      scope, gender, pool, event,
      age_group: ageGroup,
      page, page_size: PAGE_SIZE,
    }
    if (year) params.year = year
    if (scope === 'national') params.country = country
    getRankings(params)
      .then((res) => {
        if (!alive) return
        const d = res.data
        setRows(Array.isArray(d) ? d : d?.results || [])
        setCount(Array.isArray(d) ? d.length : d?.count || 0)
      })
      .catch(() => { if (alive) { setRows([]); setCount(0) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [scope, country, gender, pool, year, event, ageGroup, page])

  const selectedEvent = events.find((e) => String(e.id) === event)

  return (
    <div>
      <PageHead title="Rankings" />

      {/* filter bar: two fixed lines — segments on top, dropdowns below */}
      <div className="rule-b records-filters" style={{ padding: '14px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Seg
            options={[{ value: 'national', label: 'National' }, { value: 'arab', label: 'Arab' }, { value: 'gcc', label: 'GCC' }]}
            value={scope}
            onChange={setScope}
          />
          <Seg
            options={[{ value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
            value={gender}
            onChange={setGender}
          />
          <Seg
            options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]}
            value={pool}
            onChange={setPool}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {scope === 'national' && (
            <select className="select" style={{ flex: '2 1 140px', width: 'auto', minWidth: 0 }} value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Select country…</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select className="select" style={{ flex: '3 1 170px', width: 'auto', minWidth: 0 }} value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="">Select event…</option>
            {eventGroups.map((g) => (
              <optgroup key={g.stroke} label={g.stroke}>
                {g.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </optgroup>
            ))}
          </select>
          <select className="select" style={{ flex: '1 1 90px', width: 'auto', minWidth: 0 }} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All-time</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="select" style={{ flex: '1 1 84px', width: 'auto', minWidth: 0 }} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
            {AGE_GROUPS.map((g) => <option key={g} value={g}>{g === 'OPEN' ? 'Open' : g}</option>)}
          </select>
        </div>
      </div>

      {scope === 'national' && !country ? (
        <Empty label="Select a country to view national rankings" />
      ) : !event ? (
        <Empty label="Select an event to view rankings" />
      ) : loading ? (
        <Loading label="Loading rankings" />
      ) : rows.length === 0 ? (
        <Empty label="No rankings for this selection" />
      ) : (
        <div className="pad">
          {selectedEvent && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, letterSpacing: '0.01em' }}>
                {selectedEvent.name}
              </span>
              <span className="kicker" style={{ marginLeft: 10 }}>
                {gender === 'M' ? 'Men' : 'Women'} · {pool} · {year || 'All-time'}
              </span>
            </div>
          )}
          <div className="table-scroll">
            <table className="table rankings-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th>Swimmer</th>
                  <th className="num">Age</th>
                  <th className="time">Time</th>
                  <th className="num">FINA</th>
                  <th className="hide-mobile">Meet</th>
                  <th className="hide-mobile">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const prevCs = i > 0 ? rows[i - 1].time_centiseconds : null
                  const isTied = prevCs !== null && r.time_centiseconds === prevCs
                  // deep link to the exact swim (expanded with splits) in the meet
                  const swimLink = r.championship_id && r.result_id
                    ? `/meets/${r.championship_id}?tab=results&event=${event}&gender=${gender}&result=${r.result_id}`
                    : null
                  return (
                    <tr
                      key={`${r.rank}-${r.swimmer_id}`}
                      onClick={() => { if (swimLink) navigate(swimLink) }}
                      style={swimLink ? { cursor: 'pointer' } : undefined}
                      title={swimLink ? 'View this swim' : undefined}
                    >
                      <td className="asw-num" style={{ fontWeight: 800 }}>{isTied ? '=' : r.rank}</td>
                      <td className="swimmer-cell">
                        {/* one line always — long names ellipsize instead of wrapping */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <Flag code={r.nationality_code} name={r.nationality} />
                          {/* whole row goes to the swim; profile stays a click away via the meet page */}
                          {swimLink
                            ? <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.swimmer_name}</span>
                            : <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.swimmer_name}</Link>}
                        </div>
                      </td>
                      <td className="num asw-num">{r.age_at_competition ?? '—'}</td>
                      <td className="time asw-time">{r.time}</td>
                      <td className="num asw-num">{r.fina_points ?? '—'}</td>
                      {/* one line — long meet names ellipsize so rows stay short */}
                      <td className="text-muted hide-mobile"
                        style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}
                        title={`${r.championship_name}${r.championship_location ? ` · ${r.championship_location}` : ''}`}>
                        {r.championship_name}
                        {r.championship_location ? ` · ${r.championship_location}` : ''}
                      </td>
                      <td className="hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
        </div>
      )}
    </div>
  )
}
