import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getReportOverview, getReportMedalTable, getReportTopTimes, getReportParticipation, getReportRecords,
} from '../api/reports'
import { getCountries, getEvents } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg } from '../components/ui'
import { formatDate, formatTime } from '../utils'

const STROKE_ORDER = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley', 'Freestyle Relay', 'Medley Relay']

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'medals', label: 'Medal Table' },
  { value: 'times', label: 'Top Times' },
  { value: 'participation', label: 'Participation' },
  { value: 'records', label: 'Records' },
]

const RECORD_GROUPS = [
  { value: 'country', label: 'By Country' },
  { value: 'swimmer', label: 'By Swimmer' },
  { value: 'event', label: 'By Event' },
  { value: 'type', label: 'By Type' },
]

const RECORD_TYPES = ['ARAB', 'NATIONAL', 'GCC', 'AFRICAN', 'ASIAN', 'MEDITERRANEAN', 'ISLAMIC', 'WORLD']

const MEDAL_GROUPS = [
  { value: 'country', label: 'By Country' },
  { value: 'club', label: 'By Club' },
  { value: 'swimmer', label: 'By Swimmer' },
]

const PART_GROUPS = [
  { value: 'meet', label: 'By Meet' },
  { value: 'club', label: 'By Club' },
  { value: 'country', label: 'By Country' },
  { value: 'event', label: 'By Event' },
  { value: 'swimmer', label: 'By Swimmer' },
]

const LIMITS = [25, 50, 100, 200, 500]

function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

const statCard = { border: '1px solid var(--color-neutral-200)', borderRadius: 8, padding: '14px 16px' }

export default function Reports() {
  const [countries, setCountries] = useState([])
  const [events, setEvents] = useState([])

  // shared filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [country, setCountry] = useState('')
  const [hostCountry, setHostCountry] = useState('')
  const [team, setTeam] = useState('')
  const [teamInput, setTeamInput] = useState('')
  const [event, setEvent] = useState('')
  const [pool, setPool] = useState('')
  const [gender, setGender] = useState('')
  const [ageMin, setAgeMin] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [championship, setChampionship] = useState(null) // { id, name } set by clicking a meet row
  const [limit, setLimit] = useState(50)

  // report selection
  const [tab, setTab] = useState('overview')
  const [medalGroup, setMedalGroup] = useState('country')
  const [partGroup, setPartGroup] = useState('meet')
  const [recordGroup, setRecordGroup] = useState('country')
  const [recordType, setRecordType] = useState('')
  const [bestPerSwimmer, setBestPerSwimmer] = useState(true)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.allSettled([getCountries(), getEvents({ has_results: true })]).then(([cRes, eRes]) => {
      if (!alive) return
      const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
      const list = (d) => (Array.isArray(d) ? d : d?.results || [])
      setCountries(list(val(cRes)))
      setEvents(list(val(eRes)))
    })
    return () => { alive = false }
  }, [])

  // debounce the free-text club filter
  useEffect(() => {
    const t = setTimeout(() => setTeam(teamInput.trim()), 500)
    return () => clearTimeout(t)
  }, [teamInput])

  const eventGroups = useMemo(() => {
    const grouped = {}
    for (const e of events) {
      let stroke = e.stroke || 'Other'
      const isRelay = e.is_relay || /relay/i.test(e.name || '')
      if (isRelay && !/relay/i.test(stroke)) {
        stroke = stroke === 'Individual Medley' || /medley/i.test(e.name || '') ? 'Medley Relay' : `${stroke} Relay`
      }
      if (!grouped[stroke]) grouped[stroke] = []
      grouped[stroke].push(e)
    }
    Object.values(grouped).forEach((arr) => arr.sort((a, b) =>
      (a.distance - b.distance) || String(a.name).localeCompare(String(b.name))))
    return Object.keys(grouped)
      .sort((a, b) => {
        const ai = STROKE_ORDER.indexOf(a)
        const bi = STROKE_ORDER.indexOf(b)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
      .map((stroke) => ({ stroke, events: grouped[stroke] }))
  }, [events])

  const params = useMemo(() => {
    const p = {}
    if (dateFrom) p.date_from = dateFrom
    if (dateTo) p.date_to = dateTo
    if (country) p.country = country
    if (hostCountry) p.host_country = hostCountry
    if (team) p.team = team
    if (event) p.event = event
    if (pool) p.pool = pool
    if (gender) p.gender = gender
    if (ageMin) p.age_min = ageMin
    if (ageMax) p.age_max = ageMax
    if (championship) p.championship = championship.id
    p.limit = limit
    return p
  }, [dateFrom, dateTo, country, hostCountry, team, event, pool, gender, ageMin, ageMax, championship, limit])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const call = tab === 'overview' ? getReportOverview(params)
      : tab === 'medals' ? getReportMedalTable({ ...params, group: medalGroup })
      : tab === 'times' ? getReportTopTimes({ ...params, best_per_swimmer: bestPerSwimmer ? 1 : 0 })
      : tab === 'records' ? getReportRecords({ ...params, group: recordGroup, record_type: recordType || undefined })
      : getReportParticipation({ ...params, group: partGroup })
    call
      .then((res) => { if (alive) setData(res.data) })
      .catch(() => { if (alive) setData(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [tab, medalGroup, partGroup, recordGroup, recordType, bestPerSwimmer, params])

  const hasFilters = dateFrom || dateTo || country || hostCountry || team || teamInput || event || pool || gender || ageMin || ageMax || championship
  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setCountry(''); setHostCountry(''); setTeam(''); setTeamInput('')
    setEvent(''); setPool(''); setGender(''); setAgeMin(''); setAgeMax(''); setChampionship(null)
  }

  const exportCsv = () => {
    if (!data) return
    if (tab === 'overview') {
      downloadCsv('report-overview.csv', Object.keys(data), [Object.values(data)])
    } else if (tab === 'medals') {
      downloadCsv(`medal-table-${medalGroup}.csv`,
        ['Rank', 'Name', 'Country', 'Gold', 'Silver', 'Bronze', 'Total'],
        data.map((r, i) => [i + 1, r.name, r.country_name || '', r.gold, r.silver, r.bronze, r.total]))
    } else if (tab === 'times') {
      downloadCsv('top-times.csv',
        ['Rank', 'Swimmer', 'Country', 'Event', 'Time', 'FINA', 'Age', 'Club', 'Round', 'Meet', 'Date', 'Pool'],
        data.map((r, i) => [i + 1, r.swimmer_name, r.country_code || '', r.event_name,
          formatTime(r.time_centiseconds), r.fina_points ?? '', r.age ?? '', r.team,
          r.round, r.championship_name, r.date, r.pool]))
    } else if (tab === 'records') {
      downloadCsv(`records-${recordGroup}.csv`,
        ['Rank', 'Name', 'Records', 'Standing', 'Latest'],
        data.map((r, i) => [i + 1, r.name, r.records, r.standing, r.latest || '']))
    } else if (partGroup === 'swimmer') {
      downloadCsv('participation-swimmer.csv',
        ['Rank', 'Swimmer', 'Country', 'Swims', 'Meets', 'Events', 'Best FINA'],
        data.map((r, i) => [i + 1, r.name, r.country_code || '', r.results, r.meets, r.events, r.best_fina ?? '']))
    } else {
      downloadCsv(`participation-${partGroup}.csv`,
        ['Rank', 'Name', 'Swimmers', 'Results', 'Clubs', 'Best FINA'],
        data.map((r, i) => [i + 1, r.name, r.swimmers, r.results, r.clubs, r.best_fina ?? '']))
    }
  }

  const selStyle = { flex: '1 1 150px', width: 'auto', minWidth: 0 }
  const inputStyle = { flex: '1 1 120px', width: 'auto', minWidth: 0, height: 38 }

  return (
    <div>
      <PageHead
        title="Reports"
        kicker="Analytics"
        sub="Cross-meet analytics over the whole database — filter by date, country, club, event and more, then export as CSV."
      />

      {/* filter bar */}
      <div className="rule-b records-filters" style={{ padding: '12px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Seg
            options={[{ value: '', label: 'All' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
            value={gender}
            onChange={setGender}
          />
          <Seg
            options={[{ value: '', label: 'All pools' }, { value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]}
            value={pool}
            onChange={setPool}
          />
          {hasFilters && (
            <button className="btn btn-secondary" style={{ height: 32 }} onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="select" style={selStyle} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All nationalities</option>
            {countries.map((c) => <option key={c.id} value={c.code}>{c.name}</option>)}
          </select>
          <select className="select" style={selStyle} value={hostCountry} onChange={(e) => setHostCountry(e.target.value)}>
            <option value="">Any host country</option>
            {countries.map((c) => <option key={c.id} value={c.code}>{c.name}</option>)}
          </select>
          <select className="select" style={{ ...selStyle, flex: '2 1 170px' }} value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="">All events</option>
            {eventGroups.map((g) => (
              <optgroup key={g.stroke} label={g.stroke}>
                {g.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </optgroup>
            ))}
          </select>
          <input className="input" style={{ ...inputStyle, flex: '2 1 150px' }} placeholder="Club contains…"
            value={teamInput} onChange={(e) => setTeamInput(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" type="date" style={inputStyle} title="From date"
            value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input className="input" type="date" style={inputStyle} title="To date"
            value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <input className="input" type="number" min="5" max="99" style={{ ...inputStyle, flex: '0 1 90px' }}
            placeholder="Age min" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} />
          <input className="input" type="number" min="5" max="99" style={{ ...inputStyle, flex: '0 1 90px' }}
            placeholder="Age max" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} />
          <select className="select" style={{ flex: '0 1 110px', width: 'auto', minWidth: 0 }} value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}>
            {LIMITS.map((n) => <option key={n} value={n}>Top {n}</option>)}
          </select>
        </div>
        {championship && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span className="kicker">Meet:</span>
            <span style={{ fontWeight: 700 }}>{championship.name}</span>
            <button className="btn btn-secondary" style={{ height: 26, padding: '0 10px', fontSize: 12 }}
              onClick={() => setChampionship(null)}>✕ remove</button>
          </div>
        )}
      </div>

      {/* report tabs + sub-controls */}
      <div className="rule-b" style={{ padding: '10px 32px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Seg options={TABS} value={tab} onChange={setTab} tabs />
        {tab === 'medals' && <Seg options={MEDAL_GROUPS} value={medalGroup} onChange={setMedalGroup} />}
        {tab === 'participation' && <Seg options={PART_GROUPS} value={partGroup} onChange={setPartGroup} />}
        {tab === 'records' && (
          <>
            <Seg options={RECORD_GROUPS} value={recordGroup} onChange={setRecordGroup} />
            <select className="select" style={{ width: 'auto', minWidth: 0 }} value={recordType}
              onChange={(e) => setRecordType(e.target.value)}>
              <option value="">All record types</option>
              {RECORD_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
            </select>
          </>
        )}
        {tab === 'times' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={bestPerSwimmer} onChange={(e) => setBestPerSwimmer(e.target.checked)} />
            Best per swimmer
          </label>
        )}
        {tab !== 'overview' && data && data.length > 0 && (
          <button className="btn btn-secondary" style={{ height: 32, marginLeft: 'auto' }} onClick={exportCsv}>
            Export CSV
          </button>
        )}
      </div>

      {/* while switching tabs, `data` can briefly hold the previous tab's
          shape (object vs list) — treat a shape mismatch as still loading */}
      {loading || (data && (tab === 'overview') === Array.isArray(data)) ? (
        <Loading label="Building report" />
      ) : !data || (Array.isArray(data) && data.length === 0) ? (
        <Empty label="No data for this selection" />
      ) : tab === 'overview' ? (
        <OverviewCards d={data} />
      ) : tab === 'medals' ? (
        <MedalTableReport rows={data} group={medalGroup} />
      ) : tab === 'times' ? (
        <TopTimesReport rows={data} onPickMeet={(m) => setChampionship(m)} />
      ) : tab === 'records' ? (
        <RecordsReport rows={data} group={recordGroup} />
      ) : (
        <ParticipationReport rows={data} group={partGroup} onPickMeet={(m) => setChampionship(m)} />
      )}
    </div>
  )
}

function OverviewCards({ d }) {
  const items = [
    ['Results', d.results], ['Swimmers', d.swimmers], ['Men', d.men], ['Women', d.women],
    ['Meets', d.meets], ['Clubs', d.clubs], ['Countries', d.countries], ['Events', d.events],
    ['Medals', d.medals], ['Best FINA', d.best_fina], ['Avg FINA', d.avg_fina], ['Avg Age', d.avg_age],
  ]
  return (
    <div className="pad">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {items.map(([label, value]) => (
          <div key={label} style={statCard}>
            <div className="kicker" style={{ marginBottom: 4 }}>{label}</div>
            <div className="asw-num" style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
              {value === null || value === undefined ? '—' : Number(value).toLocaleString('en-US')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MedalTableReport({ rows, group }) {
  return (
    <div className="pad">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>{group === 'club' ? 'Club' : group === 'swimmer' ? 'Swimmer' : 'Country'}</th>
              <th className="num">🥇</th>
              <th className="num">🥈</th>
              <th className="num">🥉</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`}>
                <td className="asw-num" style={{ fontWeight: 800 }}>{i + 1}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {r.country_code && <Flag code={r.country_code} name={r.country_name || r.name} />}
                    {group === 'swimmer' && r.swimmer_id
                      ? <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit' }}>{r.name}</Link>
                      : r.name}
                  </div>
                </td>
                <td className="num asw-num">{r.gold}</td>
                <td className="num asw-num">{r.silver}</td>
                <td className="num asw-num">{r.bronze}</td>
                <td className="num asw-num" style={{ fontWeight: 800 }}>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TopTimesReport({ rows, onPickMeet }) {
  return (
    <div className="pad">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>Swimmer</th>
              <th>Event</th>
              <th className="time">Time</th>
              <th className="num">FINA</th>
              <th className="num hide-mobile">Age</th>
              <th className="hide-mobile">Club</th>
              <th className="hide-mobile">Meet</th>
              <th className="hide-mobile">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.swimmer_id}-${r.event_id}-${i}`}>
                <td className="asw-num" style={{ fontWeight: 800 }}>{i + 1}</td>
                <td className="swimmer-cell">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Flag code={r.country_code} name={r.country_name} />
                    <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.swimmer_name}
                    </Link>
                  </div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{r.event_name} <span className="text-muted">{r.pool}</span></td>
                <td className="time asw-time">{formatTime(r.time_centiseconds)}</td>
                <td className="num asw-num">{r.fina_points ?? '—'}</td>
                <td className="num asw-num hide-mobile">{r.age ?? '—'}</td>
                <td className="text-muted hide-mobile">{r.team || '—'}</td>
                <td className="text-muted hide-mobile">
                  <span
                    style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                    title="Filter reports to this meet"
                    onClick={() => onPickMeet({ id: r.championship_id, name: r.championship_name })}
                  >
                    {r.championship_name}
                  </span>
                </td>
                <td className="hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ParticipationReport({ rows, group, onPickMeet }) {
  if (group === 'swimmer') {
    return (
      <div className="pad">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th>
                <th>Swimmer</th>
                <th className="num">Swims</th>
                <th className="num">Meets</th>
                <th className="num">Events</th>
                <th className="num hide-mobile">Best FINA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.swimmer_id}-${i}`}>
                  <td className="asw-num" style={{ fontWeight: 800 }}>{i + 1}</td>
                  <td className="swimmer-cell">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <Flag code={r.country_code} name={r.name} />
                      <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name}
                      </Link>
                    </div>
                  </td>
                  <td className="num asw-num">{r.results?.toLocaleString('en-US')}</td>
                  <td className="num asw-num">{r.meets}</td>
                  <td className="num asw-num">{r.events}</td>
                  <td className="num asw-num hide-mobile">{r.best_fina ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }
  const label = { meet: 'Meet', club: 'Club', country: 'Country', event: 'Event' }[group]
  return (
    <div className="pad">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>{label}</th>
              {group === 'meet' && <th className="hide-mobile">Date</th>}
              <th className="num">Swimmers</th>
              <th className="num">Results</th>
              {group !== 'club' && <th className="num hide-mobile">Clubs</th>}
              <th className="num hide-mobile">Best FINA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.name}-${i}`}
                onClick={group === 'meet' ? () => onPickMeet({ id: r.championship_id, name: r.name }) : undefined}
                style={group === 'meet' ? { cursor: 'pointer' } : undefined}
                title={group === 'meet' ? 'Filter reports to this meet' : undefined}
              >
                <td className="asw-num" style={{ fontWeight: 800 }}>{i + 1}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {r.country_code && <Flag code={r.country_code} name={r.name} />}
                    <span style={{ minWidth: 0 }}>{r.name}{group === 'meet' && r.pool ? <span className="text-muted"> · {r.pool}</span> : null}</span>
                  </div>
                </td>
                {group === 'meet' && <td className="hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>}
                <td className="num asw-num">{r.swimmers?.toLocaleString('en-US')}</td>
                <td className="num asw-num">{r.results?.toLocaleString('en-US')}</td>
                {group !== 'club' && <td className="num asw-num hide-mobile">{r.clubs}</td>}
                <td className="num asw-num hide-mobile">{r.best_fina ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RecordsReport({ rows, group }) {
  const label = { country: 'Country', swimmer: 'Swimmer', event: 'Event', type: 'Record Type' }[group]
  return (
    <div className="pad">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>{label}</th>
              <th className="num">Records</th>
              <th className="num" title="Records still standing today">Standing</th>
              <th className="hide-mobile">Latest</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`}>
                <td className="asw-num" style={{ fontWeight: 800 }}>{i + 1}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {r.country_code && <Flag code={r.country_code} name={r.name} />}
                    {group === 'swimmer' && r.swimmer_id
                      ? <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit' }}>{r.name}</Link>
                      : group === 'type'
                        ? r.name.charAt(0) + r.name.slice(1).toLowerCase()
                        : r.name}
                  </div>
                </td>
                <td className="num asw-num" style={{ fontWeight: 800 }}>{r.records}</td>
                <td className="num asw-num">{r.standing}</td>
                <td className="hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.latest)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
