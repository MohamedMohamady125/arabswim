import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRankings } from '../api/rankings'
import { getCountries, getEvents } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg, Pager } from '../components/ui'
import { formatDate, AGE_GROUPS } from '../utils'

const PAGE_SIZE = 25

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
    for (let y = cur; y >= 2015; y--) out.push(y)
    return out
  }, [])

  useEffect(() => {
    let alive = true
    Promise.allSettled([getCountries(), getEvents()]).then(([cRes, eRes]) => {
      if (!alive) return
      const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
      const list = (d) => (Array.isArray(d) ? d : d?.results || [])
      setCountries(list(val(cRes)).filter((c) => c.region === 'ARAB' || c.region === 'GCC'))
      const evs = list(val(eRes))
      const sorted = [
        ...evs.filter((e) => !e.is_relay),
        ...evs.filter((e) => e.is_relay),
      ]
      setEvents(sorted)
      if (sorted[0]) setEvent(String(sorted[0].id))
    })
    return () => { alive = false }
  }, [])

  useEffect(() => { setPage(1) }, [scope, country, gender, pool, year, event, ageGroup])

  useEffect(() => {
    if (!event) return
    if (scope === 'national' && !country) { setRows([]); setCount(0); setLoading(false); return }
    let alive = true
    setLoading(true)
    const params = {
      scope, gender, pool, year, event,
      age_group: ageGroup,
      page, page_size: PAGE_SIZE,
    }
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

  return (
    <div>
      <PageHead kicker="Data" title="Rankings" sub="Season best times across the Arab world" />

      {/* filter bar */}
      <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Seg
          options={[{ value: 'arab', label: 'Arab' }, { value: 'gcc', label: 'GCC' }, { value: 'national', label: 'National' }]}
          value={scope}
          onChange={setScope}
        />
        {scope === 'national' && (
          <select className="select" style={{ width: 170 }} value={country} onChange={(e) => setCountry(e.target.value)}>
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
        <select className="select" style={{ width: 100 }} value={year} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="select" style={{ width: 190 }} value={event} onChange={(e) => setEvent(e.target.value)}>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
        <select className="select" style={{ width: 110 }} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
          {AGE_GROUPS.map((g) => <option key={g} value={g}>{g === 'OPEN' ? 'Open' : g}</option>)}
        </select>
      </div>

      {scope === 'national' && !country ? (
        <Empty label="Select a country to view national rankings" />
      ) : loading ? (
        <Loading label="Loading rankings" />
      ) : rows.length === 0 ? (
        <Empty label="No rankings for this selection" />
      ) : (
        <div className="pad">
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
                {rows.map((r) => (
                  <tr key={`${r.rank}-${r.swimmer_id}`}>
                    <td className="asw-num" style={{ fontWeight: 800 }}>{r.rank}</td>
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
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
        </div>
      )}
    </div>
  )
}
