import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getReportMedalTable, getReportParticipation, getReportSwimmer,
  getReportAge, getReportImprovement, getReportHighPerformance,
} from '../api/reports'
import { getRankings } from '../api/rankings'
import { getComputedRecords } from '../api/records'
import { getChampionships, getClassifications, getSubClassifications } from '../api/championships'
import { getCountries, getEvents } from '../api/core'
import { searchSwimmers } from '../api/swimmers'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg } from '../components/ui'
import { formatDate, formatTime } from '../utils'

// ── Filter 1: the eight report categories ────────────────────────────────────
const CATEGORIES = [
  { value: 'swimmers', label: 'Swimmers' },
  { value: 'medals', label: 'Medals' },
  { value: 'ranking', label: 'Ranking' },
  { value: 'records', label: 'Records' },
  { value: 'participations', label: 'Participations' },
  { value: 'age', label: 'Age' },
  { value: 'high_performance', label: 'High Performance' },
  { value: 'improvement', label: 'Best Improvement' },
]

const STROKE_ORDER = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley', 'Freestyle Relay', 'Medley Relay']
const AGE_GROUPS = ['OPEN', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18']
const LIMITS = [10, 20, 50, 100]

const YEARS = (() => {
  const now = new Date().getFullYear()
  const yrs = [{ value: '', label: 'All time' }]
  for (let y = now; y >= 2015; y--) yrs.push({ value: String(y), label: String(y) })
  return yrs
})()

const PLAIN_YEARS = (() => {
  const now = new Date().getFullYear()
  const yrs = []
  for (let y = now; y >= 2015; y--) yrs.push(String(y))
  return yrs
})()

const GENDER_OPTS = [{ value: '', label: 'All' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]
const POOL_OPTS = [{ value: '', label: 'All pools' }, { value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]

const CTRL = { flex: '0 1 auto', width: 'auto', minWidth: 0, height: 36 }
const statCard = { border: '1px solid var(--color-neutral-200)', borderRadius: 8, padding: '14px 16px' }
const barStyle = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '14px 32px' }

function list(d) { return Array.isArray(d) ? d : d?.results || [] }
function yearRange(year) {
  return year ? { date_from: `${year}-01-01`, date_to: `${year}-12-31` } : {}
}

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

// ── Reusable filter controls ─────────────────────────────────────────────────
function CountrySelect({ countries, value, onChange, label = 'All countries' }) {
  return (
    <select className="select" style={CTRL} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}</option>
      {countries.map((c) => <option key={c.id} value={c.code}>{c.name}</option>)}
    </select>
  )
}

function EventSelect({ eventGroups, value, onChange, label = 'All events' }) {
  return (
    <select className="select" style={{ ...CTRL, flex: '1 1 180px' }} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}</option>
      {eventGroups.map((g) => (
        <optgroup key={g.stroke} label={g.stroke}>
          {g.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

function ChampionshipSelect({ championships, value, onChange, label = 'All championships' }) {
  return (
    <select className="select" style={{ ...CTRL, flex: '1 1 200px' }} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}</option>
      {championships.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )
}

function AgeGroupSelect({ value, onChange }) {
  return (
    <select className="select" style={CTRL} value={value} onChange={(e) => onChange(e.target.value)}>
      {AGE_GROUPS.map((g) => <option key={g} value={g}>{g === 'OPEN' ? 'Open' : g}</option>)}
    </select>
  )
}

function YearSelect({ value, onChange }) {
  return (
    <select className="select" style={CTRL} value={value} onChange={(e) => onChange(e.target.value)}>
      {YEARS.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
    </select>
  )
}

function ExportButton({ onClick }) {
  return (
    <button className="btn btn-secondary" style={{ height: 32, marginLeft: 'auto' }} onClick={onClick}>
      Export CSV
    </button>
  )
}

function SwimmerSearch({ country, gender, onPick }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  useEffect(() => {
    if (!q.trim() || q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      searchSwimmers(q.trim(), { country: country || undefined, gender: gender || undefined })
        .then((res) => { setResults(list(res.data).slice(0, 12)); setOpen(true) })
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [q, country, gender])

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div ref={box} style={{ position: 'relative', flex: '1 1 260px' }}>
      <input
        className="input"
        style={{ width: '100%', height: 36 }}
        placeholder="Search a swimmer…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 40, left: 0, right: 0, zIndex: 20,
          background: 'var(--color-surface, #fff)', border: '1px solid var(--color-neutral-200)',
          borderRadius: 8, maxHeight: 320, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          {results.map((s) => (
            <div
              key={s.id}
              onClick={() => { onPick({ id: s.id, name: s.name }); setQ(s.name); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer' }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {(s.nationality_code || s.country_code) && <Flag code={s.nationality_code || s.country_code} name={s.name} />}
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Category: Swimmers ───────────────────────────────────────────────────────
function SwimmersReport({ countries }) {
  const [country, setCountry] = useState('')
  const [gender, setGender] = useState('')
  const [picked, setPicked] = useState(null) // {id, name}
  const [view, setView] = useState('stats') // stats | best | championship
  const [champ, setChamp] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!picked) { setData(null); return }
    let alive = true
    setLoading(true)
    getReportSwimmer({ swimmer: picked.id, championship: view === 'championship' && champ ? champ : undefined })
      .then((res) => { if (alive) setData(res.data) })
      .catch(() => { if (alive) setData(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [picked, view, champ])

  const exportBest = () => {
    if (!data) return
    downloadCsv(`${data.swimmer.name}-best-times.csv`,
      ['Event', 'Time', 'FINA', 'Age', 'Meet', 'Date', 'Pool'],
      data.best_times.map((r) => [r.event_name, r.time, r.fina_points ?? '', r.age ?? '', r.championship_name, r.date, r.pool]))
  }

  return (
    <div>
      <div className="rule-b" style={barStyle}>
        <SwimmerSearch country={country} gender={gender} onPick={setPicked} />
        <CountrySelect countries={countries} value={country} onChange={setCountry} label="All nationalities" />
        <Seg options={GENDER_OPTS} value={gender} onChange={setGender} />
      </div>

      {!picked ? (
        <Empty label="Search and pick a swimmer to see their report" />
      ) : loading || !data ? (
        <Loading label="Loading swimmer" />
      ) : (
        <div>
          <div className="rule-b" style={{ padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {data.swimmer.country_code && <Flag code={data.swimmer.country_code} name={data.swimmer.name} />}
            <Link to={`/swimmers/${data.swimmer.id}`} style={{ color: 'inherit', fontWeight: 800, fontSize: 20, fontFamily: 'var(--font-heading)' }}>
              {data.swimmer.name}
            </Link>
            <span className="text-muted">{data.swimmer.country_name}{data.swimmer.age ? ` · ${data.swimmer.age} yrs` : ''}</span>
            <div style={{ marginLeft: 'auto' }}>
              <Seg
                options={[{ value: 'stats', label: 'Quick Stats' }, { value: 'championship', label: 'In a Championship' }, { value: 'best', label: 'Best Times' }]}
                value={view}
                onChange={setView}
              />
            </div>
          </div>

          {view === 'stats' && <SwimmerStats stats={data.quick_stats} />}

          {view === 'best' && (
            <div className="pad">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                {data.best_times.length > 0 && <ExportButton onClick={exportBest} />}
              </div>
              {data.best_times.length === 0 ? <Empty label="No timed swims" /> : (
                <div className="table-scroll">
                  <table className="table">
                    <thead><tr><th>Event</th><th className="time">Best</th><th className="num">FINA</th><th className="num hide-mobile">Age</th><th className="hide-mobile">Meet</th><th className="hide-mobile">Date</th></tr></thead>
                    <tbody>
                      {data.best_times.map((r) => (
                        <tr key={`${r.event_id}-${r.pool}`}>
                          <td style={{ whiteSpace: 'nowrap' }}>{r.event_name} <span className="text-muted">{r.pool}</span></td>
                          <td className="time asw-time">{r.time}</td>
                          <td className="num asw-num">{r.fina_points ?? '—'}</td>
                          <td className="num asw-num hide-mobile">{r.age ?? '—'}</td>
                          <td className="text-muted hide-mobile">{r.championship_name}</td>
                          <td className="hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {view === 'championship' && (
            <div className="pad">
              <select className="select" style={{ ...CTRL, flex: '1 1 260px', marginBottom: 12 }} value={champ} onChange={(e) => setChamp(e.target.value)}>
                <option value="">Choose a championship…</option>
                {data.championships.map((c) => <option key={c.id} value={c.id}>{c.name} ({formatDate(c.date)})</option>)}
              </select>
              {!champ ? <Empty label="Choose a championship to see results" />
                : data.results_in_championship.length === 0 ? <Empty label="No results at this meet" /> : (
                  <div className="table-scroll">
                    <table className="table">
                      <thead><tr><th>Event</th><th className="time">Time</th><th className="num">FINA</th><th className="hide-mobile">Round</th><th className="num hide-mobile">Age</th></tr></thead>
                      <tbody>
                        {data.results_in_championship.map((r, i) => (
                          <tr key={`${r.event_id}-${i}`}>
                            <td style={{ whiteSpace: 'nowrap' }}>{r.event_name}</td>
                            <td className="time asw-time">{r.time}</td>
                            <td className="num asw-num">{r.fina_points ?? '—'}</td>
                            <td className="text-muted hide-mobile">{r.round || '—'}</td>
                            <td className="num asw-num hide-mobile">{r.age ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SwimmerStats({ stats }) {
  const items = [
    ['Swims', stats.results], ['Meets', stats.meets], ['Events', stats.events], ['Best FINA', stats.best_fina],
    ['Gold', stats.gold], ['Silver', stats.silver], ['Bronze', stats.bronze], ['Medals', stats.medals],
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

// ── Category: Medals ─────────────────────────────────────────────────────────
function MedalsReport({ countries }) {
  const [group, setGroup] = useState('country')
  const [classification, setClassification] = useState('')
  const [subClass, setSubClass] = useState('')
  const [classifications, setClassifications] = useState([])
  const [subClasses, setSubClasses] = useState([])
  const [country, setCountry] = useState('')
  const [gender, setGender] = useState('')
  const [pool, setPool] = useState('')
  const [year, setYear] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getClassifications().then((res) => setClassifications(list(res.data))).catch(() => {})
  }, [])
  useEffect(() => {
    setSubClass('')
    if (!classification) { setSubClasses([]); return }
    getSubClassifications(classification).then((res) => setSubClasses(list(res.data))).catch(() => setSubClasses([]))
  }, [classification])

  useEffect(() => {
    let alive = true
    setLoading(true)
    getReportMedalTable({
      group, classification: classification || undefined, sub_classification: subClass || undefined,
      country: country || undefined, gender: gender || undefined, pool: pool || undefined, ...yearRange(year), limit: 100,
    })
      .then((res) => { if (alive) setRows(list(res.data)) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [group, classification, subClass, country, gender, pool, year])

  const exportCsv = () => downloadCsv(`medals-${group}.csv`,
    ['Rank', 'Name', 'Gold', 'Silver', 'Bronze', 'Total'],
    rows.map((r, i) => [i + 1, r.name, r.gold, r.silver, r.bronze, r.total]))

  const label = group === 'swimmer' ? 'Swimmer' : group === 'championship' ? 'Championship' : 'Country'

  return (
    <div>
      <div className="rule-b" style={barStyle}>
        <Seg options={[{ value: 'country', label: 'By Country' }, { value: 'swimmer', label: 'By Swimmer' }, { value: 'championship', label: 'By Championship' }]} value={group} onChange={setGroup} />
        <select className="select" style={CTRL} value={classification} onChange={(e) => setClassification(e.target.value)}>
          <option value="">All classifications</option>
          {classifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select" style={CTRL} value={subClass} onChange={(e) => setSubClass(e.target.value)} disabled={!subClasses.length}>
          <option value="">All sub-classifications</option>
          {subClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <CountrySelect countries={countries} value={country} onChange={setCountry} label="All nationalities" />
        <Seg options={GENDER_OPTS} value={gender} onChange={setGender} />
        <Seg options={POOL_OPTS} value={pool} onChange={setPool} />
        <YearSelect value={year} onChange={setYear} />
      </div>
      {loading ? <Loading label="Building medal table" /> : rows.length === 0 ? <Empty label="No medals for this selection" /> : (
        <div className="pad">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><ExportButton onClick={exportCsv} /></div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th style={{ width: 34 }}>#</th><th>{label}</th>{group === 'championship' && <th className="hide-mobile">Date</th>}<th className="num">🥇</th><th className="num">🥈</th><th className="num">🥉</th><th className="num">Total</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`}>
                    <td className="asw-num" style={{ fontWeight: 800 }}>{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        {r.country_code && <Flag code={r.country_code} name={r.country_name || r.name} />}
                        {group === 'swimmer' && r.swimmer_id
                          ? <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit' }}>{r.name}</Link>
                          : group === 'championship' && r.championship_id
                            ? <Link to={`/championships/${r.championship_id}`} style={{ color: 'inherit' }}>{r.name}{r.pool ? <span className="text-muted"> · {r.pool}</span> : null}</Link>
                            : r.name}
                      </div>
                    </td>
                    {group === 'championship' && <td className="hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>}
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
      )}
    </div>
  )
}

// ── Category: Ranking ────────────────────────────────────────────────────────
function RankingReport({ countries, eventGroups, championships }) {
  const [limit, setLimit] = useState(20)
  const [scope, setScope] = useState('arab')
  const [country, setCountry] = useState('')
  const [ageGroup, setAgeGroup] = useState('OPEN')
  const [gender, setGender] = useState('M')
  const [pool, setPool] = useState('LCM')
  const [year, setYear] = useState('')
  const [champ, setChamp] = useState('')
  const [event, setEvent] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!event) { setRows([]); return }
    let alive = true
    setLoading(true)
    getRankings({
      scope, country: scope === 'national' ? (country || undefined) : undefined,
      event, gender: gender || undefined, pool: pool || undefined,
      age_group: ageGroup, year: year || undefined, championship: champ || undefined, limit,
    })
      .then((res) => { if (alive) setRows(list(res.data)) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [scope, country, event, gender, pool, ageGroup, year, champ, limit])

  const exportCsv = () => downloadCsv('ranking.csv',
    ['Rank', 'Swimmer', 'Country', 'Time', 'FINA', 'Age', 'Meet', 'Date'],
    rows.map((r) => [r.rank, r.swimmer_name, r.nationality_code || '', r.time, r.fina_points ?? '', r.age_at_competition ?? '', r.championship_name, r.date]))

  return (
    <div>
      <div className="rule-b" style={barStyle}>
        <select className="select" style={CTRL} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          {LIMITS.map((n) => <option key={n} value={n}>Top {n}</option>)}
        </select>
        <Seg options={[{ value: 'arab', label: 'Arab' }, { value: 'gcc', label: 'GCC' }, { value: 'national', label: 'National' }]} value={scope} onChange={setScope} />
        {scope === 'national' && <CountrySelect countries={countries} value={country} onChange={setCountry} label="Pick a country" />}
        <AgeGroupSelect value={ageGroup} onChange={setAgeGroup} />
        <Seg options={GENDER_OPTS} value={gender} onChange={setGender} />
        <Seg options={POOL_OPTS} value={pool} onChange={setPool} />
        <YearSelect value={year} onChange={setYear} />
        <ChampionshipSelect championships={championships} value={champ} onChange={setChamp} />
        <EventSelect eventGroups={eventGroups} value={event} onChange={setEvent} label="Pick an event *" />
      </div>
      {!event ? <Empty label="Pick an event to see the ranking" />
        : loading ? <Loading label="Ranking swimmers" />
          : rows.length === 0 ? <Empty label="No times for this selection" /> : (
            <div className="pad">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><ExportButton onClick={exportCsv} /></div>
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th style={{ width: 34 }}>#</th><th>Swimmer</th><th className="time">Time</th><th className="num">FINA</th><th className="num hide-mobile">Age</th><th className="hide-mobile">Meet</th><th className="hide-mobile">Date</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.result_id}>
                        <td className="asw-num" style={{ fontWeight: 800 }}>{r.rank}</td>
                        <td className="swimmer-cell">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <Flag code={r.nationality_code} name={r.nationality} />
                            <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.swimmer_name}</Link>
                          </div>
                        </td>
                        <td className="time asw-time">{r.time}</td>
                        <td className="num asw-num">{r.fina_points ?? '—'}</td>
                        <td className="num asw-num hide-mobile">{r.age_at_competition ?? '—'}</td>
                        <td className="text-muted hide-mobile">{r.championship_name}</td>
                        <td className="hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
    </div>
  )
}

// ── Category: Records ────────────────────────────────────────────────────────
function RecordsReport({ countries, championships }) {
  const [scope, setScope] = useState('arab')
  const [country, setCountry] = useState('')
  const [ageGroup, setAgeGroup] = useState('OPEN')
  const [gender, setGender] = useState('')
  const [pool, setPool] = useState('LCM')
  const [year, setYear] = useState('')
  const [champ, setChamp] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (scope === 'national' && !country) { setRows([]); setLoading(false); return }
    let alive = true
    setLoading(true)
    getComputedRecords({
      scope, country: country || undefined, pool, gender: gender || undefined,
      age_group: ageGroup, year: year || undefined, championship: champ || undefined,
    })
      .then((res) => { if (alive) setRows(list(res.data)) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [scope, country, pool, gender, ageGroup, year, champ])

  const exportCsv = () => downloadCsv('records.csv',
    ['Event', 'Gender', 'Holder', 'Country', 'Time', 'FINA', 'Meet', 'Date'],
    rows.map((r) => [r.event_name, r.gender, r.swimmer_name, r.nationality_code || '', r.time, r.fina_points ?? '', r.championship_name, r.date]))

  return (
    <div>
      <div className="rule-b" style={barStyle}>
        <Seg options={[{ value: 'arab', label: 'Arab' }, { value: 'gcc', label: 'GCC' }, { value: 'national', label: 'National' }]} value={scope} onChange={setScope} />
        {scope === 'national' && <CountrySelect countries={countries} value={country} onChange={setCountry} label="Pick a country" />}
        <AgeGroupSelect value={ageGroup} onChange={setAgeGroup} />
        <Seg options={GENDER_OPTS} value={gender} onChange={setGender} />
        <Seg options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]} value={pool} onChange={setPool} />
        <YearSelect value={year} onChange={setYear} />
        <ChampionshipSelect championships={championships} value={champ} onChange={setChamp} />
      </div>
      {scope === 'national' && !country ? <Empty label="Pick a country to see its records" />
        : loading ? <Loading label="Computing records" />
          : rows.length === 0 ? <Empty label="No records for this selection" /> : (
            <div className="pad">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><ExportButton onClick={exportCsv} /></div>
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Event</th><th className="hide-mobile">Gender</th><th>Holder</th><th className="time">Time</th><th className="num">FINA</th><th className="hide-mobile">Meet</th><th className="hide-mobile">Date</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.result_id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.event_name}</td>
                        <td className="text-muted hide-mobile">{r.gender}</td>
                        <td className="swimmer-cell">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <Flag code={r.nationality_code} name={r.nationality} />
                            {r.is_relay_team ? r.swimmer_name : <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmer_name}</Link>}
                          </div>
                        </td>
                        <td className="time asw-time">{r.time}</td>
                        <td className="num asw-num">{r.fina_points ?? '—'}</td>
                        <td className="text-muted hide-mobile">{r.championship_name}</td>
                        <td className="hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
    </div>
  )
}

// ── Category: Participations ─────────────────────────────────────────────────
function ParticipationsReport({ countries, championships }) {
  const [group, setGroup] = useState('meet')
  const [country, setCountry] = useState('')
  const [gender, setGender] = useState('')
  const [pool, setPool] = useState('')
  const [year, setYear] = useState('')
  const [champ, setChamp] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getReportParticipation({
      group, country: country || undefined, gender: gender || undefined,
      pool: pool || undefined, ...yearRange(year), championship: champ || undefined, limit: 100,
    })
      .then((res) => { if (alive) setRows(list(res.data)) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [group, country, gender, pool, year, champ])

  const exportCsv = () => {
    if (group === 'swimmer') {
      downloadCsv('participation-swimmer.csv', ['Rank', 'Swimmer', 'Country', 'Swims', 'Meets', 'Events', 'Best FINA'],
        rows.map((r, i) => [i + 1, r.name, r.country_code || '', r.results, r.meets, r.events, r.best_fina ?? '']))
    } else {
      downloadCsv(`participation-${group}.csv`, ['Rank', 'Name', 'Swimmers', 'Results', 'Clubs', 'Best FINA'],
        rows.map((r, i) => [i + 1, r.name, r.swimmers, r.results, r.clubs, r.best_fina ?? '']))
    }
  }

  const label = { meet: 'Meet', club: 'Club', country: 'Country', event: 'Event', swimmer: 'Swimmer' }[group]

  return (
    <div>
      <div className="rule-b" style={barStyle}>
        <Seg options={[{ value: 'meet', label: 'By Championship' }, { value: 'country', label: 'By Country' }, { value: 'club', label: 'By Club' }, { value: 'event', label: 'By Event' }, { value: 'swimmer', label: 'By Swimmer' }]} value={group} onChange={setGroup} />
        <CountrySelect countries={countries} value={country} onChange={setCountry} label="All nationalities" />
        <Seg options={GENDER_OPTS} value={gender} onChange={setGender} />
        <Seg options={POOL_OPTS} value={pool} onChange={setPool} />
        <YearSelect value={year} onChange={setYear} />
        <ChampionshipSelect championships={championships} value={champ} onChange={setChamp} />
      </div>
      {loading ? <Loading label="Counting participation" /> : rows.length === 0 ? <Empty label="No data for this selection" /> : (
        <div className="pad">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><ExportButton onClick={exportCsv} /></div>
          <div className="table-scroll">
            {group === 'swimmer' ? (
              <table className="table">
                <thead><tr><th style={{ width: 34 }}>#</th><th>Swimmer</th><th className="num">Swims</th><th className="num">Meets</th><th className="num">Events</th><th className="num hide-mobile">Best FINA</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.swimmer_id}-${i}`}>
                      <td className="asw-num" style={{ fontWeight: 800 }}>{i + 1}</td>
                      <td className="swimmer-cell">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <Flag code={r.country_code} name={r.name} />
                          <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.name}</Link>
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
            ) : (
              <table className="table">
                <thead><tr><th style={{ width: 34 }}>#</th><th>{label}</th>{group === 'meet' && <th className="hide-mobile">Date</th>}<th className="num">Swimmers</th><th className="num">Results</th>{group !== 'club' && <th className="num hide-mobile">Clubs</th>}<th className="num hide-mobile">Best FINA</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.name}-${i}`}>
                      <td className="asw-num" style={{ fontWeight: 800 }}>{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          {r.country_code && <Flag code={r.country_code} name={r.name} />}
                          <span style={{ minWidth: 0 }}>{group === 'meet' && r.championship_id ? <Link to={`/championships/${r.championship_id}`} style={{ color: 'inherit' }}>{r.name}</Link> : r.name}{group === 'meet' && r.pool ? <span className="text-muted"> · {r.pool}</span> : null}</span>
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
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Category: Age ────────────────────────────────────────────────────────────
function AgeReport({ countries, championships }) {
  const [country, setCountry] = useState('')
  const [gender, setGender] = useState('')
  const [pool, setPool] = useState('')
  const [champ, setChamp] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getReportAge({ country: country || undefined, gender: gender || undefined, pool: pool || undefined, championship: champ || undefined, limit: 200 })
      .then((res) => { if (alive) setData(res.data) })
      .catch(() => { if (alive) setData(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [country, gender, pool, champ])

  const exportCsv = () => data && downloadCsv('age-roster.csv',
    ['Swimmer', 'Country', 'Gender', 'Age', 'Swims'],
    data.roster.map((r) => [r.name, r.country_code || '', r.gender, r.age, r.results]))

  const maxSwimmers = useMemo(() => data ? Math.max(1, ...data.distribution.map((d) => d.swimmers)) : 1, [data])

  return (
    <div>
      <div className="rule-b" style={barStyle}>
        <CountrySelect countries={countries} value={country} onChange={setCountry} label="All nationalities" />
        <Seg options={GENDER_OPTS} value={gender} onChange={setGender} />
        <Seg options={POOL_OPTS} value={pool} onChange={setPool} />
        <ChampionshipSelect championships={championships} value={champ} onChange={setChamp} />
      </div>
      {loading ? <Loading label="Grouping by age" /> : !data || data.distribution.length === 0 ? <Empty label="No aged swimmers for this selection" /> : (
        <div className="pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="kicker">Age distribution</div>
            {data.roster.length > 0 && <ExportButton onClick={exportCsv} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
            {data.distribution.map((d) => (
              <div key={d.age} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="asw-num" style={{ width: 40, textAlign: 'right', fontWeight: 700 }}>{d.age}</span>
                <div style={{ flex: 1, background: 'var(--color-neutral-100, #f1f1f1)', borderRadius: 4, height: 20, position: 'relative' }}>
                  <div style={{ width: `${(d.swimmers / maxSwimmers) * 100}%`, background: 'var(--color-primary, #1f6feb)', height: '100%', borderRadius: 4, minWidth: 2 }} />
                </div>
                <span className="asw-num text-muted" style={{ width: 90, fontSize: 13 }}>{d.swimmers} swimmers</span>
              </div>
            ))}
          </div>
          <div className="kicker" style={{ marginBottom: 8 }}>Roster</div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th style={{ width: 34 }}>#</th><th>Swimmer</th><th className="num">Age</th><th className="hide-mobile">Gender</th><th className="num hide-mobile">Swims</th></tr></thead>
              <tbody>
                {data.roster.map((r, i) => (
                  <tr key={`${r.swimmer_id}-${i}`}>
                    <td className="asw-num" style={{ fontWeight: 800 }}>{i + 1}</td>
                    <td className="swimmer-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        {r.country_code && <Flag code={r.country_code} name={r.name} />}
                        <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.name}</Link>
                      </div>
                    </td>
                    <td className="num asw-num" style={{ fontWeight: 700 }}>{r.age}</td>
                    <td className="text-muted hide-mobile">{r.gender}</td>
                    <td className="num asw-num hide-mobile">{r.results}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Category: High Performance ───────────────────────────────────────────────
function HighPerformanceReport({ countries, eventGroups, championships }) {
  const [group, setGroup] = useState('swimmer')
  const [event, setEvent] = useState('')
  const [pool, setPool] = useState('')
  const [gender, setGender] = useState('')
  const [year, setYear] = useState('')
  const [champ, setChamp] = useState('')
  const [finaMin, setFinaMin] = useState(700)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getReportHighPerformance({
      group, event: event || undefined, pool: pool || undefined, gender: gender || undefined,
      ...yearRange(year), championship: champ || undefined, fina_min: finaMin || 700, limit: 100,
    })
      .then((res) => { if (alive) setRows(list(res.data)) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [group, event, pool, gender, year, champ, finaMin])

  const exportCsv = () => {
    if (group === 'swimmer') {
      downloadCsv('high-performance.csv', ['Rank', 'Swimmer', 'Country', 'Event', 'Time', 'FINA', 'Meet', 'Date'],
        rows.map((r, i) => [i + 1, r.swimmer_name, r.country_code || '', r.event_name, formatTime(r.time_centiseconds), r.fina_points ?? '', r.championship_name, r.date]))
    } else {
      downloadCsv(`high-performance-${group}.csv`, ['Rank', 'Name', 'Swims', 'Swimmers', 'Best FINA'],
        rows.map((r, i) => [i + 1, r.name, r.swims, r.swimmers, r.best_fina ?? '']))
    }
  }

  return (
    <div>
      <div className="rule-b" style={barStyle}>
        <Seg options={[{ value: 'swimmer', label: 'By Swimmer' }, { value: 'country', label: 'By Country' }, { value: 'club', label: 'By Club' }]} value={group} onChange={setGroup} />
        <EventSelect eventGroups={eventGroups} value={event} onChange={setEvent} />
        <Seg options={GENDER_OPTS} value={gender} onChange={setGender} />
        <Seg options={POOL_OPTS} value={pool} onChange={setPool} />
        <YearSelect value={year} onChange={setYear} />
        <ChampionshipSelect championships={championships} value={champ} onChange={setChamp} />
        <input className="input" type="number" min="0" max="1200" style={{ ...CTRL, flex: '0 1 110px' }} placeholder="Min FINA" value={finaMin} onChange={(e) => setFinaMin(e.target.value)} />
      </div>
      {loading ? <Loading label="Finding top swims" /> : rows.length === 0 ? <Empty label="No swims above this FINA threshold" /> : (
        <div className="pad">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><ExportButton onClick={exportCsv} /></div>
          <div className="table-scroll">
            {group === 'swimmer' ? (
              <table className="table">
                <thead><tr><th style={{ width: 34 }}>#</th><th>Swimmer</th><th>Event</th><th className="time">Time</th><th className="num">FINA</th><th className="hide-mobile">Meet</th><th className="hide-mobile">Date</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.swimmer_id}-${i}`}>
                      <td className="asw-num" style={{ fontWeight: 800 }}>{i + 1}</td>
                      <td className="swimmer-cell">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <Flag code={r.country_code} name={r.country_name} />
                          <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmer_name}</Link>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.event_name} <span className="text-muted">{r.pool}</span></td>
                      <td className="time asw-time">{formatTime(r.time_centiseconds)}</td>
                      <td className="num asw-num" style={{ fontWeight: 800 }}>{r.fina_points ?? '—'}</td>
                      <td className="text-muted hide-mobile">{r.championship_name}</td>
                      <td className="hide-mobile" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="table">
                <thead><tr><th style={{ width: 34 }}>#</th><th>{group === 'club' ? 'Club' : 'Country'}</th><th className="num">Swims</th><th className="num">Swimmers</th><th className="num">Best FINA</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.name}-${i}`}>
                      <td className="asw-num" style={{ fontWeight: 800 }}>{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          {r.country_code && <Flag code={r.country_code} name={r.name} />}
                          {r.name}
                        </div>
                      </td>
                      <td className="num asw-num">{r.swims}</td>
                      <td className="num asw-num">{r.swimmers}</td>
                      <td className="num asw-num" style={{ fontWeight: 800 }}>{r.best_fina ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Category: Best Improvement ───────────────────────────────────────────────
function ImprovementReport({ countries, eventGroups }) {
  const now = new Date().getFullYear()
  const [yearFrom, setYearFrom] = useState(String(now - 1))
  const [yearTo, setYearTo] = useState(String(now))
  const [event, setEvent] = useState('')
  const [country, setCountry] = useState('')
  const [gender, setGender] = useState('')
  const [pool, setPool] = useState('')
  const [ageGroup, setAgeGroup] = useState('OPEN')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!yearFrom || !yearTo) { setRows([]); return }
    let alive = true
    setLoading(true)
    const ageMax = ageGroup !== 'OPEN' ? Number(ageGroup.replace('U', '')) : undefined
    getReportImprovement({
      year_from: yearFrom, year_to: yearTo, event: event || undefined,
      country: country || undefined, gender: gender || undefined, pool: pool || undefined,
      age_max: ageMax, limit: 100,
    })
      .then((res) => { if (alive) setRows(list(res.data)) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [yearFrom, yearTo, event, country, gender, pool, ageGroup])

  const exportCsv = () => downloadCsv('best-improvement.csv',
    ['Rank', 'Swimmer', 'Country', 'Event', 'From', 'To', 'Drop', 'Drop %'],
    rows.map((r, i) => [i + 1, r.swimmer_name, r.country_code || '', r.event_name, r.from_time, r.to_time, (r.drop_cs / 100).toFixed(2), r.drop_pct]))

  return (
    <div>
      <div className="rule-b" style={barStyle}>
        <select className="select" style={CTRL} value={yearFrom} onChange={(e) => setYearFrom(e.target.value)}>
          {PLAIN_YEARS.map((y) => <option key={y} value={y}>From {y}</option>)}
        </select>
        <select className="select" style={CTRL} value={yearTo} onChange={(e) => setYearTo(e.target.value)}>
          {PLAIN_YEARS.map((y) => <option key={y} value={y}>To {y}</option>)}
        </select>
        <EventSelect eventGroups={eventGroups} value={event} onChange={setEvent} />
        <CountrySelect countries={countries} value={country} onChange={setCountry} label="All nationalities" />
        <Seg options={GENDER_OPTS} value={gender} onChange={setGender} />
        <Seg options={POOL_OPTS} value={pool} onChange={setPool} />
        <AgeGroupSelect value={ageGroup} onChange={setAgeGroup} />
      </div>
      {loading ? <Loading label="Finding biggest time drops" /> : rows.length === 0 ? <Empty label="No improvements between these years" /> : (
        <div className="pad">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><ExportButton onClick={exportCsv} /></div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th style={{ width: 34 }}>#</th><th>Swimmer</th><th>Event</th><th className="time hide-mobile">{yearFrom}</th><th className="time hide-mobile">{yearTo}</th><th className="time">Drop</th><th className="num">%</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.swimmer_id}-${r.event_id}-${i}`}>
                    <td className="asw-num" style={{ fontWeight: 800 }}>{i + 1}</td>
                    <td className="swimmer-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Flag code={r.country_code} name={r.swimmer_name} />
                        <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmer_name}</Link>
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.event_name}</td>
                    <td className="time asw-time hide-mobile">{r.from_time}</td>
                    <td className="time asw-time hide-mobile">{r.to_time}</td>
                    <td className="time asw-time" style={{ fontWeight: 800, color: 'var(--color-success, #2e7d32)' }}>−{(r.drop_cs / 100).toFixed(2)}</td>
                    <td className="num asw-num">{r.drop_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page shell ───────────────────────────────────────────────────────────────
export default function Reports() {
  const [category, setCategory] = useState('swimmers')
  const [countries, setCountries] = useState([])
  const [events, setEvents] = useState([])
  const [championships, setChampionships] = useState([])

  useEffect(() => {
    let alive = true
    Promise.allSettled([
      getCountries(),
      getEvents({ has_results: true }),
      getChampionships({ limit: 500 }),
    ]).then(([cRes, eRes, chRes]) => {
      if (!alive) return
      const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
      setCountries(list(val(cRes)))
      setEvents(list(val(eRes)))
      setChampionships(list(val(chRes)))
    })
    return () => { alive = false }
  }, [])

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

  const ref = { countries, eventGroups, championships }

  return (
    <div>
      <PageHead
        title="Reports"
        kicker="Analytics"
        sub="Pick a report, then narrow it with the filters below. Every view exports to CSV."
      />

      <div className="rule-b" style={{ padding: '12px 32px' }}>
        <Seg options={CATEGORIES} value={category} onChange={setCategory} tabs />
      </div>

      {category === 'swimmers' && <SwimmersReport {...ref} />}
      {category === 'medals' && <MedalsReport {...ref} />}
      {category === 'ranking' && <RankingReport {...ref} />}
      {category === 'records' && <RecordsReport {...ref} />}
      {category === 'participations' && <ParticipationsReport {...ref} />}
      {category === 'age' && <AgeReport {...ref} />}
      {category === 'high_performance' && <HighPerformanceReport {...ref} />}
      {category === 'improvement' && <ImprovementReport {...ref} />}
    </div>
  )
}
