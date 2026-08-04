import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRankings } from '../api/rankings'
import { getCountries, getEvents } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg, Pager } from '../components/ui'
import { formatDate, AGE_GROUPS } from '../utils'

const PAGE_SIZE = 25
const STROKE_ORDER = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley', 'Freestyle Relay', 'Medley Relay']

export default function Rankings() {
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
      const stroke = e.stroke || 'Other'
      if (!grouped[stroke]) grouped[stroke] = []
      grouped[stroke].push(e)
    }
    Object.values(grouped).forEach((arr) => arr.sort((a, b) => a.distance - b.distance))
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
      <PageHead kicker="Data" title="Rankings" sub="All-time and yearly best performances by event" />

      {/* filter bar */}
      <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Seg
          options={[{ value: 'national', label: 'National' }, { value: 'arab', label: 'Arab' }, { value: 'gcc', label: 'GCC' }]}
          value={scope}
          onChange={setScope}
        />
        {scope === 'national' && (
          <select className="select" style={{ flex: '2 1 170px', width: 'auto' }} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Select country…</option>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
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
        <select className="select" style={{ flex: '1 1 110px', width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All-time</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="select" style={{ flex: '3 1 200px', width: 'auto' }} value={event} onChange={(e) => setEvent(e.target.value)}>
          <option value="">Select event…</option>
          {eventGroups.map((g) => (
            <optgroup key={g.stroke} label={g.stroke}>
              {g.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </optgroup>
          ))}
        </select>
        <select className="select" style={{ flex: '1 1 110px', width: 'auto' }} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
          {AGE_GROUPS.map((g) => <option key={g} value={g}>{g === 'OPEN' ? 'Open' : g}</option>)}
        </select>
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
            <div className="kicker" style={{ marginBottom: 12 }}>
              {selectedEvent.name} · {gender === 'M' ? 'Men' : 'Women'} · {pool} · {year || 'All-time'}
            </div>
          )}
          <div className="table-scroll">
            <table className="table">
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
                  return (
                    <tr key={`${r.rank}-${r.swimmer_id}`}>
                      <td className="asw-num" style={{ fontWeight: 800 }}>{isTied ? '=' : r.rank}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Flag code={r.nationality_code} name={r.nationality} />
                          <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmer_name}</Link>
                        </div>
                      </td>
                      <td className="num asw-num">{r.age_at_competition ?? '—'}</td>
                      <td className="time asw-time">{r.time}</td>
                      <td className="num asw-num">{r.fina_points ?? '—'}</td>
                      <td className="text-muted hide-mobile">
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
