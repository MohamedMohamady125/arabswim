import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRecords, getComputedRecords } from '../api/records'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg } from '../components/ui'
import { formatDate } from '../utils'

const COMPUTED_SCOPES = ['ARAB', 'GCC', 'NATIONAL']
const SCOPE_OPTIONS = [
  { value: 'ARAB', label: 'Arab' },
  { value: 'GCC', label: 'GCC' },
  { value: 'NATIONAL', label: 'National' },
  { value: 'AFRICAN', label: 'African' },
  { value: 'ASIAN', label: 'Asian' },
  { value: 'MEDITERRANEAN', label: 'Mediterranean' },
  { value: 'ISLAMIC', label: 'Islamic' },
]

// Normalize computed + manual record rows into one shape.
function normalizeComputed(r) {
  return {
    key: `${r.event_id}-${r.gender}-${r.swimmer_id}-${r.time_centiseconds}`,
    eventName: r.event_name,
    sortOrder: r.event_sort_order ?? 0,
    gender: r.gender,
    time: r.time,
    swimmerId: r.is_relay_team ? null : r.swimmer_id,
    swimmerName: r.swimmer_name,
    natCode: r.nationality_code,
    natName: r.nationality,
    meet: r.championship_name,
    location: r.championship_country,
    date: r.date,
  }
}

function normalizeManual(r) {
  return {
    key: `m-${r.id}`,
    eventName: r.event_detail?.name,
    sortOrder: r.event_detail?.sort_order ?? 0,
    gender: r.swimmer_detail?.sex,
    time: r.formatted_time,
    swimmerId: r.swimmer_detail?.is_relay_team ? null : r.swimmer,
    swimmerName: r.swimmer_detail?.name,
    natCode: r.swimmer_detail?.nationality_detail?.code,
    natName: r.swimmer_detail?.nationality_detail?.name,
    meet: r.meet_name,
    location: r.location,
    date: r.result_date,
  }
}

function RecordTable({ rows }) {
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>Event</th>
            <th className="time">Time</th>
            <th>Swimmer</th>
            <th className="hide-mobile">Meet</th>
            <th className="hide-mobile">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={{ fontWeight: 600 }}>{r.eventName}</td>
              <td className="time asw-time">{r.time}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Flag code={r.natCode} name={r.natName} />
                  {r.swimmerId ? (
                    <Link to={`/swimmers/${r.swimmerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmerName}</Link>
                  ) : (
                    r.swimmerName
                  )}
                </div>
              </td>
              <td className="text-muted hide-mobile">
                {[r.meet, r.location].filter(Boolean).join(' · ') || '—'}
              </td>
              <td className="hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Records() {
  const [scope, setScope] = useState('ARAB')
  const [pool, setPool] = useState('LCM')
  const [country, setCountry] = useState('')
  const [countries, setCountries] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCountries()
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.results || []
        setCountries(list.filter((c) => c.region === 'ARAB' || c.region === 'GCC'))
      })
      .catch(() => setCountries([]))
  }, [])

  const isComputed = COMPUTED_SCOPES.includes(scope)
  const needsCountry = scope === 'NATIONAL'

  useEffect(() => {
    if (needsCountry && !country) { setRows([]); setLoading(false); return }
    let alive = true
    setLoading(true)
    const req = isComputed
      ? getComputedRecords({ record_type: scope, pool, ...(needsCountry ? { country } : {}) })
      : getRecords({ record_type: scope, pool, page_size: 300 })
    req
      .then((res) => {
        if (!alive) return
        const data = res.data
        const list = Array.isArray(data) ? data : data?.results || []
        setRows(list.map(isComputed ? normalizeComputed : normalizeManual))
      })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [scope, pool, country, isComputed, needsCountry])

  const men = useMemo(
    () => rows.filter((r) => r.gender === 'M').sort((a, b) => a.sortOrder - b.sortOrder),
    [rows]
  )
  const women = useMemo(
    () => rows.filter((r) => r.gender === 'F').sort((a, b) => a.sortOrder - b.sortOrder),
    [rows]
  )

  return (
    <div>
      <PageHead kicker="Record books" title="Records" sub="Fastest swims ever by Arab swimmers, by scope and pool" />

      {/* filter bar */}
      <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Seg options={SCOPE_OPTIONS} value={scope} onChange={(v) => setScope(v)} />
        <Seg
          options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]}
          value={pool}
          onChange={setPool}
        />
        {needsCountry && (
          <select className="select" style={{ width: 190 }} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Select country…</option>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {needsCountry && !country ? (
        <Empty label="Select a country to view national records" />
      ) : loading ? (
        <Loading label="Loading records" />
      ) : rows.length === 0 ? (
        <Empty label="No records for this scope yet" />
      ) : (
        <>
          <div className="rule-b pad">
            <div className="kicker" style={{ marginBottom: 12 }}>Men · {pool}</div>
            {men.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 13 }}>No men's records yet.</div>
            ) : (
              <RecordTable rows={men} />
            )}
          </div>
          <div className="pad">
            <div className="kicker" style={{ marginBottom: 12 }}>Women · {pool}</div>
            {women.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 13 }}>No women's records yet.</div>
            ) : (
              <RecordTable rows={women} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
