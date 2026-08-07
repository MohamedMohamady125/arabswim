import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getRecords, getComputedRecords } from '../api/records'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg } from '../components/ui'
import { AGE_GROUPS } from '../utils'

// Computed scopes are calculated live from the results database;
// the rest are curated manual record books.
const COMPUTED_SCOPES = ['arab', 'gcc', 'national']
const SCOPE_OPTIONS = [
  { value: 'arab', label: 'Arab' },
  { value: 'gcc', label: 'GCC' },
  { value: 'national', label: 'National' },
  { value: 'AFRICAN', label: 'African' },
  { value: 'ASIAN', label: 'Asian' },
  { value: 'MEDITERRANEAN', label: 'Mediterranean' },
  { value: 'ISLAMIC', label: 'Islamic' },
  { value: 'WORLD', label: 'World' },
]

const sortByEvent = (a, b) =>
  (a.isRelay - b.isRelay) || (a.sortOrder - b.sortOrder) || (a.distance - b.distance)

// Normalize computed + manual record rows into one shape.
function normalizeComputed(r) {
  return {
    key: `${r.event_id}-${r.gender}-${r.swimmer_id}-${r.time_centiseconds}`,
    // deep link to the exact swim (row expanded with splits) in the meet
    link: r.championship_id && r.result_id
      ? `/meets/${r.championship_id}?tab=results&event=${r.event_id}&gender=${r.gender}&result=${r.result_id}`
      : null,
    eventName: r.event_name,
    sortOrder: r.event_sort_order ?? 99,
    distance: r.event_distance ?? 0,
    gender: r.gender,
    isRelay: !!r.is_relay,
    time: r.time,
    fina: r.fina_points,
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
    sortOrder: r.event_detail?.sort_order ?? 99,
    distance: r.event_detail?.distance ?? 0,
    gender: r.swimmer_detail?.sex,
    isRelay: !!r.event_detail?.is_relay,
    time: r.formatted_time,
    fina: null,
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
  const navigate = useNavigate()
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>Event</th>
            <th className="hide-mobile">Swimmer</th>
            <th className="time">Time</th>
            <th className="hide-mobile">Meet</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              onClick={() => { if (r.link) navigate(r.link) }}
              style={r.link ? { cursor: 'pointer' } : undefined}
              title={r.link ? 'View this swim' : undefined}
            >
              <td style={{ fontWeight: 600 }}>
                {r.eventName}
                {/* phone: swimmer folds under the event name */}
                <div className="show-mobile">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, fontWeight: 400, fontSize: 13.5, color: 'var(--color-neutral-700)' }}>
                    <Flag code={r.natCode} name={r.natName} />
                    {r.swimmerId ? (
                      <Link to={`/swimmers/${r.swimmerId}`} onClick={(e) => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmerName}</Link>
                    ) : (
                      r.swimmerName
                    )}
                  </div>
                </div>
              </td>
              <td className="hide-mobile">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Flag code={r.natCode} name={r.natName} />
                  {r.swimmerId ? (
                    <Link to={`/swimmers/${r.swimmerId}`} onClick={(e) => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmerName}</Link>
                  ) : (
                    r.swimmerName
                  )}
                </div>
              </td>
              <td className="time asw-time">{r.time}</td>
              <td className="text-muted hide-mobile">{r.meet || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({ label, pool, rows, last }) {
  return (
    <div className={last ? 'pad' : 'rule-b pad'}>
      <div className="kicker" style={{ marginBottom: 12 }}>{label} · {pool}</div>
      {rows.length === 0 ? (
        <div className="text-muted" style={{ fontSize: 14 }}>No records yet.</div>
      ) : (
        <RecordTable rows={rows} />
      )}
    </div>
  )
}

export default function Records() {
  const [scope, setScope] = useState('arab')
  const [pool, setPool] = useState('LCM')
  const [gender, setGender] = useState('M')
  const [ageGroup, setAgeGroup] = useState('OPEN')
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
  const needsCountry = scope === 'national'

  useEffect(() => {
    if (needsCountry && !country) { setRows([]); setLoading(false); return }
    let alive = true
    setLoading(true)
    let req
    if (isComputed) {
      const params = { scope, pool, age_group: ageGroup }
      if (needsCountry) params.country = country
      if (gender) params.gender = gender
      req = getComputedRecords(params)
    } else {
      const params = { record_type: scope, pool, page_size: 500 }
      if (gender) params.gender = gender
      req = getRecords(params)
    }
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
  }, [scope, pool, gender, ageGroup, country, isComputed, needsCountry])

  const bySection = useMemo(() => {
    const sorted = [...rows].sort(sortByEvent)
    return {
      men: sorted.filter((r) => r.gender === 'M'),
      women: sorted.filter((r) => r.gender === 'F'),
    }
  }, [rows])

  const showMen = !gender || gender === 'M'
  const showWomen = !gender || gender === 'F'

  const sections = []
  if (showMen) sections.push({ label: 'Men', rows: bySection.men })
  if (showWomen) sections.push({ label: 'Women', rows: bySection.women })

  return (
    <div className="records-page">
      <PageHead title="Records" />

      {/* filter bar */}
      <div className="rule-b records-filters" style={{ padding: '14px 32px', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 150 }} value={scope} onChange={(e) => setScope(e.target.value)}>
          {SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {needsCountry && (
          <select className="select" style={{ width: 190 }} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Select country…</option>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <Seg
          options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]}
          value={pool}
          onChange={setPool}
        />
        <Seg
          options={[{ value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
          value={gender}
          onChange={setGender}
        />
        {isComputed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 'none' }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--color-neutral-700)' }}>
              Age category
            </span>
            <select className="select" style={{ width: 110 }} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
              {AGE_GROUPS.map((g) => <option key={g} value={g}>{g === 'OPEN' ? 'Open' : g}</option>)}
            </select>
          </div>
        )}
      </div>

      {needsCountry && !country ? (
        <Empty label="Select a country to view national records" />
      ) : loading ? (
        <Loading label="Loading records" />
      ) : rows.length === 0 ? (
        <Empty label={`No ${pool} records for this scope yet — try switching the pool or age group`} />
      ) : (
        sections.map((s, i) => (
          <Section
            key={s.label}
            label={s.label}
            pool={pool}
            rows={s.rows}
            showFina={isComputed}
            last={i === sections.length - 1}
          />
        ))
      )}
    </div>
  )
}
