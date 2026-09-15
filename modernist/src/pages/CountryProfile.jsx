import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getCountryProfile, getCountryProgression } from '../api/core'
import { getClassifications } from '../api/championships'
import { getMedalSummary } from '../api/medals'
import Flag from '../components/Flag'
import { Loading, Empty, SectHead, Seg } from '../components/ui'
import { formatDate, formatNumber, formatTime } from '../utils'

const CLASS_ORDER = ['Arab', 'GCC', 'African', 'Asian', 'Mediterranean', 'Islamic', 'World', 'Olympic']
const CLASS_COLORS = {
  Arab: '#1c4e86', GCC: '#7d8a99', African: '#a8402f', Asian: '#a05f2c',
  Mediterranean: '#4a8fc0', Islamic: '#0d7a52', World: '#b98a1e', Olympic: '#0c2340',
}

const STROKES = [
  { value: 'Freestyle', label: 'Free' },
  { value: 'Backstroke', label: 'Back' },
  { value: 'Breaststroke', label: 'Breast' },
  { value: 'Butterfly', label: 'Fly' },
  { value: 'Individual Medley', label: 'IM' },
]

const LINE_HEX = ['#1c4e86', '#4a8fc0', '#0c2340', '#72a4cf', '#2f6cae', '#12253d', '#aecae4', '#17416f']

function SwimmerLink({ id, name }) {
  return <Link to={`/swimmers/${id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>{name}</Link>
}

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'team', label: 'Team' },
  { value: 'results', label: 'Results' },
  { value: 'championships', label: 'Championships' },
  { value: 'statistics', label: 'Statistics' },
  { value: 'records', label: 'Records' },
  { value: 'medals', label: 'Medals' },
  { value: 'clubs', label: 'Clubs' },
  { value: 'compare', label: 'Compare' },
]

function ProgressionChart({ lines }) {
  if (!lines || lines.length === 0) return <Empty label="No progression data" />
  const allPoints = lines.flatMap((l) => l.points || [])
  if (allPoints.length === 0) return <Empty label="No data for this stroke" />
  const csValues = allPoints.map((p) => p.cs).filter(Boolean)
  const minCs = Math.min(...csValues)
  const maxCs = Math.max(...csValues)
  const range = maxCs - minCs || 1
  const years = [...new Set(allPoints.map((p) => p.year))].sort()
  const W = 600; const H = 200; const pL = 70; const pR = 20; const pT = 10; const pB = 30
  const x = (yr) => pL + ((yr - years[0]) / (years[years.length - 1] - years[0] || 1)) * (W - pL - pR)
  const y = (cs) => pT + ((cs - minCs) / range) * (H - pT - pB)
  return (
    <div className="table-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 600, height: 'auto' }}>
        {csValues.length > 1 && Array.from({ length: 4 }, (_, i) => {
          const cs = minCs + (range * i) / 3
          const yy = y(cs)
          const m = Math.floor(cs / 6000); const s = Math.floor((cs % 6000) / 100); const c = cs % 100
          return <g key={i}><line x1={pL} x2={W - pR} y1={yy} y2={yy} stroke="#e5e9ed" /><text x={pL - 8} y={yy + 4} textAnchor="end" fill="#58687c" fontSize="11" style={{ fontVariantNumeric: 'tabular-nums' }}>{m ? `${m}:${String(s).padStart(2, '0')}` : `${s}.${String(c).padStart(2, '0')}`}</text></g>
        })}
        {years.filter((_, i) => i % Math.ceil(years.length / 8) === 0 || i === years.length - 1).map((yr) => (
          <text key={yr} x={x(yr)} y={H - 4} textAnchor="middle" fill="#58687c" fontSize="10">{yr}</text>
        ))}
        {lines.map((line, li) => {
          const pts = (line.points || []).filter((p) => p.cs)
          if (pts.length < 2) return null
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.year)},${y(p.cs)}`).join(' ')
          return <path key={li} d={d} fill="none" stroke={LINE_HEX[li % LINE_HEX.length]} strokeWidth={2} />
        })}
        {lines.map((line, li) => (line.points || []).filter((p) => p.cs).map((p, pi) => (
          <circle key={`${li}-${pi}`} cx={x(p.year)} cy={y(p.cs)} r={3} fill={LINE_HEX[li % LINE_HEX.length]}><title>{line.event} {p.year}: {formatTime(p.cs)} ({p.swimmer})</title></circle>
        )))}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 8 }}>
        {lines.map((l, i) => <span key={i} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 3, background: LINE_HEX[i % LINE_HEX.length], display: 'inline-block' }} />{l.event}</span>)}
      </div>
    </div>
  )
}

function RecordsTable({ records }) {
  return (
    <div className="table-scroll">
      <table className="table">
        <thead><tr><th>Event</th><th>Pool</th><th>Sex</th><th className="time">Time</th><th>Swimmer</th><th>Meet</th><th>Date</th></tr></thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600 }}>{r.event}</td>
              <td className="text-muted">{r.pool}</td>
              <td className="text-muted">{r.sex === 'F' ? "Women's" : "Men's"}</td>
              <td className="time asw-time">{r.time}</td>
              <td><SwimmerLink id={r.swimmer_id} name={r.swimmer} /></td>
              <td className="text-muted">{r.championship || '—'}</td>
              <td className="text-muted">{formatDate(r.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const CARD = { background: '#fff', border: '1px solid var(--color-divider)', padding: '16px 18px' }
const CARD_TITLE = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }
const CARD_SUB = { fontSize: 11, color: 'var(--color-neutral-500)', marginBottom: 12 }
const PERF_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#27ae60', '#3498db', '#2980b9', '#9b59b6', '#8e44ad']

function StatCard({ title, subtitle, children }) {
  return (
    <div style={CARD}>
      <div style={CARD_TITLE}>{title}</div>
      {subtitle && <div style={CARD_SUB}>{subtitle}</div>}
      {children}
    </div>
  )
}

function TopPerfTable({ swimmers, sex }) {
  const filtered = swimmers.filter((s) => s.sex === sex).slice(0, 5)
  if (!filtered.length) return <Empty label="No data" />
  return (
    <table className="table" style={{ fontSize: 13 }}>
      <thead><tr><th style={{ width: 24 }}>#</th><th>Swimmer</th><th>Event</th><th className="time">Time</th><th className="num">Pts</th></tr></thead>
      <tbody>{filtered.map((s, i) => (
        <tr key={s.id}><td className="asw-num" style={{ fontWeight: 800, color: i < 3 ? 'var(--color-accent)' : undefined }}>{i + 1}</td>
        <td><SwimmerLink id={s.id} name={s.name} /></td><td className="text-muted">{s.best_event}</td>
        <td className="time asw-time">{s.best_time}</td><td className="num asw-num" style={{ fontWeight: 700 }}>{s.best_fina}</td></tr>
      ))}</tbody>
    </table>
  )
}

function MedalRow({ name, gold, silver, bronze, total, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 13 }}>
      <span style={{ flex: 1, fontWeight: 600 }}>{name}</span>
      <span className="asw-num" style={{ width: 28, textAlign: 'center', fontWeight: 800, color: 'var(--asw-gold)' }}>{gold}</span>
      <span className="asw-num" style={{ width: 28, textAlign: 'center', color: 'var(--asw-silver)' }}>{silver}</span>
      <span className="asw-num" style={{ width: 28, textAlign: 'center', color: 'var(--asw-bronze)' }}>{bronze}</span>
      <span className="asw-num" style={{ width: 36, textAlign: 'center', fontWeight: 800 }}>{total}</span>
    </div>
  )
}

function DecoratedTable({ swimmers, sex }) {
  const filtered = swimmers.filter((s) => (sex === 'M' ? !s.name?.includes('(F)') : true)).slice(0, 5)
  if (!filtered.length) return <Empty label="No data" />
  return (
    <table className="table" style={{ fontSize: 13 }}>
      <thead><tr><th style={{ width: 24 }}>#</th><th>Swimmer</th><th className="num" style={{ color: 'var(--asw-gold)' }}>G</th><th className="num" style={{ color: 'var(--asw-silver)' }}>S</th><th className="num" style={{ color: 'var(--asw-bronze)' }}>B</th><th className="num">Total</th></tr></thead>
      <tbody>{filtered.map((m, i) => (
        <tr key={m.id ?? i}><td className="asw-num" style={{ fontWeight: 800, color: i < 3 ? 'var(--color-accent)' : undefined }}>{i + 1}</td>
        <td><SwimmerLink id={m.id} name={m.name} /></td>
        <td className="num asw-num" style={{ fontWeight: 800, color: 'var(--asw-gold)' }}>{m.gold}</td>
        <td className="num asw-num">{m.silver}</td><td className="num asw-num">{m.bronze}</td>
        <td className="num asw-num" style={{ fontWeight: 800 }}>{m.total}</td></tr>
      ))}</tbody>
    </table>
  )
}

function StatisticsTab({ profile, country, topSwimmers, topMedalists, records, medalBoxes, hosted, participated }) {
  const maleTopSwimmers = topSwimmers.filter((s) => s.sex === 'M')
  const femaleTopSwimmers = topSwimmers.filter((s) => s.sex === 'F')
  const maleTopMedalists = topMedalists.filter((m) => m.sex === 'M').slice(0, 5)
  const femaleTopMedalists = topMedalists.filter((m) => m.sex === 'F').slice(0, 5)

  // Last records
  const maleRecords = records.filter((r) => r.sex === 'M').sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const femaleRecords = records.filter((r) => r.sex === 'F').sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const lastMaleRecord = maleRecords[0]
  const lastFemaleRecord = femaleRecords[0]

  // Most records by swimmer
  const recBySwimmer = {}
  records.forEach((r) => {
    const key = `${r.swimmer_id}_${r.sex}`
    if (!recBySwimmer[key]) recBySwimmer[key] = { id: r.swimmer_id, name: r.swimmer, sex: r.sex, count: 0 }
    recBySwimmer[key].count++
  })
  const maleRecordmen = Object.values(recBySwimmer).filter((r) => r.sex === 'M').sort((a, b) => b.count - a.count).slice(0, 1)
  const femaleRecordmen = Object.values(recBySwimmer).filter((r) => r.sex === 'F').sort((a, b) => b.count - a.count).slice(0, 1)

  // Performance index distribution from topSwimmers FINA points
  const perfTiers = [
    { label: 'World-Class', min: 900, max: Infinity },
    { label: 'Int\'l Elite', min: 800, max: 900 },
    { label: 'High Perf', min: 700, max: 800 },
    { label: 'Advanced', min: 600, max: 700 },
    { label: 'Competitive', min: 500, max: 600 },
    { label: 'Developing', min: 400, max: 500 },
    { label: 'Foundation', min: 300, max: 400 },
    { label: 'Novice', min: 200, max: 300 },
    { label: 'Entry', min: 100, max: 200 },
  ]
  const perfDist = perfTiers.map((t) => ({
    ...t, count: topSwimmers.filter((s) => s.best_fina >= t.min && s.best_fina < t.max).length,
  }))
  const maxPerf = Math.max(...perfDist.map((d) => d.count), 1)

  // Participation by competition
  const partByClass = {}
  participated.forEach((c) => {
    const cls = c.classification || 'Other'
    partByClass[cls] = (partByClass[cls] || 0) + 1
  })
  const participationList = Object.entries(partByClass).sort((a, b) => b[1] - a[1])

  return (
    <div className="pad-lg" style={{ background: 'var(--color-surface)' }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, textAlign: 'center', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>Statistics</h2>

      {/* Row 1: Top Performance Male + Female */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <StatCard title="Top Performance" subtitle={`Best Performances by ${country.name} Male Swimmers (FINA Points)`}>
          <TopPerfTable swimmers={topSwimmers} sex="M" />
        </StatCard>
        <StatCard title="Top Performance" subtitle={`Best Performances by ${country.name} Female Swimmers (FINA Points)`}>
          <TopPerfTable swimmers={topSwimmers} sex="F" />
        </StatCard>
      </div>

      {/* Row 2: Participation | Championships Hosted | Most Participated */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <StatCard title="Participation" subtitle="Total Participations by Competition">
          {participationList.map(([cls, n]) => (
            <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
              <span style={{ flex: 1 }}>{cls}</span>
              <span className="asw-num" style={{ fontWeight: 700 }}>{n}</span>
            </div>
          ))}
        </StatCard>
        <StatCard title="Championships Hosted" subtitle="Number of Championships Hosted">
          {hosted.length === 0 ? <Empty label="None" /> : hosted.slice(0, 6).map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
              <span style={{ flex: 1 }}>{c.name}</span>
              <div style={{ width: Math.min(120, 120 * (1)), height: 18, background: 'var(--color-accent)', borderRadius: 2 }} />
            </div>
          ))}
        </StatCard>
        <StatCard title="Most Participated Swimmer" subtitle={`Top 5 ${country.name} Swimmers by International Participations`}>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th style={{ width: 24 }}>#</th><th>Swimmer</th><th className="num">Participations</th></tr></thead>
            <tbody>{maleTopSwimmers.slice(0, 5).map((s, i) => (
              <tr key={s.id}><td className="asw-num" style={{ fontWeight: 800, color: i < 3 ? 'var(--color-accent)' : undefined }}>{i + 1}</td>
              <td><SwimmerLink id={s.id} name={s.name} /></td>
              <td className="num asw-num">{s.championships_count || '—'}</td></tr>
            ))}</tbody>
          </table>
        </StatCard>
      </div>

      {/* Row 3: Medals | Most Male Decorated | Most Female Decorated */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <StatCard title="Medals" subtitle="Total Medals by Competition">
          <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 11 }}>
            <span style={{ color: 'var(--asw-gold)', fontWeight: 700 }}>● Gold</span>
            <span style={{ color: 'var(--asw-silver)', fontWeight: 700 }}>● Silver</span>
            <span style={{ color: 'var(--asw-bronze)', fontWeight: 700 }}>● Bronze</span>
          </div>
          {medalBoxes.map((m) => <MedalRow key={m.name} {...m} />)}
        </StatCard>
        <StatCard title="Most Male Decorated" subtitle={`Top 5 ${country.name} Male Swimmers by Total Medals`}>
          <DecoratedTable swimmers={maleTopMedalists} sex="M" />
        </StatCard>
        <StatCard title="Most Female Decorated" subtitle={`Top 5 ${country.name} Female Swimmers by Total Medals`}>
          <DecoratedTable swimmers={femaleTopMedalists} sex="F" />
        </StatCard>
      </div>

      {/* Row 4: Last Records + Most Recordmen */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <StatCard title="Last Male Record" subtitle="Most Recent Male Record">
          {lastMaleRecord ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}><SwimmerLink id={lastMaleRecord.swimmer_id} name={lastMaleRecord.swimmer} /></div>
              <div className="text-muted" style={{ fontSize: 12 }}>{lastMaleRecord.event}</div>
              <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 28, color: 'var(--color-accent)', margin: '6px 0' }}>{lastMaleRecord.time}</div>
              <div className="text-muted" style={{ fontSize: 12 }}>{formatDate(lastMaleRecord.date)}</div>
            </div>
          ) : <Empty label="No records" />}
        </StatCard>
        <StatCard title="Last Female Record" subtitle="Most Recent Female Record">
          {lastFemaleRecord ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}><SwimmerLink id={lastFemaleRecord.swimmer_id} name={lastFemaleRecord.swimmer} /></div>
              <div className="text-muted" style={{ fontSize: 12 }}>{lastFemaleRecord.event}</div>
              <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 28, color: 'var(--color-accent)', margin: '6px 0' }}>{lastFemaleRecord.time}</div>
              <div className="text-muted" style={{ fontSize: 12 }}>{formatDate(lastFemaleRecord.date)}</div>
            </div>
          ) : <Empty label="No records" />}
        </StatCard>
        <StatCard title="Most Male Recordman" subtitle={`Top ${country.name} Male by Records`}>
          {maleRecordmen[0] ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}><SwimmerLink id={maleRecordmen[0].id} name={maleRecordmen[0].name} /></div>
              <div className="text-muted" style={{ fontSize: 12 }}>Total Records</div>
              <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 36, color: 'var(--color-accent)' }}>{maleRecordmen[0].count}</div>
            </div>
          ) : <Empty label="No records" />}
        </StatCard>
        <StatCard title="Most Female Recordman" subtitle={`Top ${country.name} Female by Records`}>
          {femaleRecordmen[0] ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}><SwimmerLink id={femaleRecordmen[0].id} name={femaleRecordmen[0].name} /></div>
              <div className="text-muted" style={{ fontSize: 12 }}>Total Records</div>
              <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 36, color: 'var(--color-accent)' }}>{femaleRecordmen[0].count}</div>
            </div>
          ) : <Empty label="No records" />}
        </StatCard>
      </div>

      {/* Row 5: Performance Index */}
      <div style={{ ...CARD, marginBottom: 14 }}>
        <div style={CARD_TITLE}>Performance Index</div>
        <div style={CARD_SUB}>Distribution of {country.name} Swimmers by Performance Level</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, padding: '0 4px' }}>
          {perfDist.map((d, i) => (
            <div key={d.label} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <div className="asw-num" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{d.count || ''}</div>
              <div style={{ width: '70%', height: `${Math.max(4, (d.count / maxPerf) * 120)}px`, background: PERF_COLORS[i % PERF_COLORS.length], borderRadius: '3px 3px 0 0' }} />
              <div style={{ fontSize: 8, marginTop: 4, lineHeight: 1.2, color: 'var(--color-neutral-500)' }}>{d.label}<br />({d.min}-{d.max === Infinity ? '+' : d.max})</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CountryProfile() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'overview'
  const setTab = (t) => setSearchParams({ tab: t }, { replace: true })

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [btSex, setBtSex] = useState('')
  const [btPool, setBtPool] = useState('')
  const [progStroke, setProgStroke] = useState('Freestyle')
  const [progPool, setProgPool] = useState('LCM')
  const [progLines, setProgLines] = useState([])
  const [progLoading, setProgLoading] = useState(false)
  const [openChamp, setOpenChamp] = useState(null)
  const [classMedals, setClassMedals] = useState(null)

  useEffect(() => {
    let alive = true
    getClassifications()
      .then(async (res) => {
        const all = Array.isArray(res.data) ? res.data : res.data?.results || []
        const wanted = CLASS_ORDER.map((name) => all.find((c) => c.name === name)).filter(Boolean)
        const sums = await Promise.all(wanted.map((c) =>
          getMedalSummary({ classification: c.id, country: id })
            .then((r) => { const rows = Array.isArray(r.data) ? r.data : r.data?.results || []; const row = rows[0] || {}; return { name: c.name, gold: row.gold || 0, silver: row.silver || 0, bronze: row.bronze || 0, total: row.total || 0 } })
            .catch(() => ({ name: c.name, gold: 0, silver: 0, bronze: 0, total: 0 }))))
        if (alive) setClassMedals(sums)
      })
      .catch(() => { if (alive) setClassMedals([]) })
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    let alive = true; setLoading(true)
    getCountryProfile(id)
      .then((res) => alive && setProfile(res.data))
      .catch(() => alive && setProfile(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    if (!profile) return
    let alive = true; setProgLoading(true)
    getCountryProgression(id, { stroke: progStroke, pool: progPool })
      .then((res) => alive && setProgLines(Array.isArray(res.data) ? res.data : []))
      .catch(() => alive && setProgLines([]))
      .finally(() => alive && setProgLoading(false))
    return () => { alive = false }
  }, [id, profile, progStroke, progPool])

  if (loading) return <Loading label="Loading federation profile" />
  if (!profile?.country) return <Empty label="Federation not found" />

  const { country, medals } = profile
  const topSwimmers = profile.top_swimmers || []
  const topMedalists = profile.top_medalists || []
  const bestTimes = profile.best_times || []
  const records = profile.records || []
  const hosted = profile.championships_hosted || []
  const participated = profile.championships_participated || []
  const teams = profile.teams || []
  const filteredBest = bestTimes.filter((b) => (!btSex || b.sex === btSex) && (!btPool || b.pool === btPool))
  const newRecords = records.filter((r) => r.is_new)
  const currentRecords = records.filter((r) => !r.is_new)
  const medalBoxes = (classMedals || []).filter((m) => m.name === 'Arab' || (m.name === 'GCC' && country.region === 'GCC') || m.total > 0)

  return (
    <div>
      {/* Header */}
      <div className="pad-lg rule-b">
        <Link to="/countries" style={{ fontSize: 12, textDecoration: 'none' }}>← All federations</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
          <Flag code={country.code} name={country.name} large />
          <div>
            <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>{country.name}</h1>
            <div className="micro" style={{ marginTop: 4 }}>Federation · {country.code}</div>
          </div>
          {country.region === 'GCC' ? <span className="tag tag-dark">GCC</span>
            : country.region === 'ARAB' ? <span className="tag tag-accent">Arab</span>
            : <span className="tag tag-neutral">Other</span>}
          {medals && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 18, alignItems: 'baseline' }}>
              {[['G', medals.gold, 'var(--asw-gold)'], ['S', medals.silver, 'var(--asw-silver)'], ['B', medals.bronze, 'var(--asw-bronze)'], ['T', medals.total, 'var(--color-text)']].map(([l, n, color]) => (
                <span key={l} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
                  <span className="micro">{l}</span>
                  <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color }}>{formatNumber(n)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="rule-b" style={{ padding: '0 32px', display: 'flex', gap: 0, overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t.value} type="button" onClick={() => setTab(t.value)}
            style={{
              padding: '12px 16px', background: 'none', border: 'none', borderBottom: tab === t.value ? '3px solid var(--color-accent)' : '3px solid transparent',
              cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: tab === t.value ? 800 : 600,
              fontSize: 13, color: tab === t.value ? 'var(--color-accent)' : 'var(--color-text)', whiteSpace: 'nowrap',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== OVERVIEW ===== */}
      {tab === 'overview' && (
        <div>
          {/* Medals by competition */}
          {medalBoxes.length > 0 && (
            <div className="pad-lg rule-b">
              <SectHead title="Medals by Competition" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {medalBoxes.map((m) => (
                  <div key={m.name} className="asw-fade-up" style={{ background: CLASS_COLORS[m.name] || 'var(--color-accent)', color: '#fff', padding: '12px 18px', minWidth: 150, flex: '1 1 150px', maxWidth: 240 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.75 }}>{m.name}</div>
                    <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, lineHeight: 1.1, marginTop: 2 }}>{formatNumber(m.total)}</div>
                    <div className="asw-num" style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12, fontWeight: 700 }}>
                      <span style={{ color: 'var(--asw-gold)' }}>{m.gold}G</span>
                      <span style={{ color: 'var(--asw-silver)' }}>{m.silver}S</span>
                      <span style={{ color: '#e3a869' }}>{m.bronze}B</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div className="pad-lg rule-b">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {[
                ['Swimmers', profile.stats?.swimmers],
                ['Results', profile.stats?.results],
                ['Records', profile.stats?.records],
                ['Medals', profile.stats?.medals],
                ['Clubs', teams.length],
                ['Championships Hosted', hosted.length],
              ].map(([label, val]) => (
                <div key={label} style={{ background: 'var(--color-surface)', padding: '14px 16px', border: '1px solid var(--color-divider)' }}>
                  <div className="micro" style={{ marginBottom: 4 }}>{label}</div>
                  <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>{formatNumber(val)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Top swimmers + medalists */}
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            <div className="pad-lg rule-r">
              <SectHead title={`Top Swimmers · ${topSwimmers.length}`} />
              {topSwimmers.length === 0 ? <Empty label="No swimmers" /> : (
                <div className="table-scroll"><table className="table"><thead><tr><th style={{ width: 30 }}>#</th><th>Swimmer</th><th>Best event</th><th className="time">Time</th><th className="num">FINA</th></tr></thead><tbody>
                  {topSwimmers.map((s, i) => (<tr key={s.id}><td className="asw-num">{i + 1}</td><td><SwimmerLink id={s.id} name={s.name} /><span className="text-muted" style={{ fontSize: 12 }}> · {s.sex === 'F' ? 'W' : 'M'}</span></td><td>{s.best_event || '—'}</td><td className="time asw-time">{s.best_time || '—'}</td><td className="num asw-num">{s.best_fina ?? '—'}</td></tr>))}
                </tbody></table></div>
              )}
            </div>
            <div className="pad-lg">
              <SectHead title={`Top Medalists · ${topMedalists.length}`} />
              {topMedalists.length === 0 ? <Empty label="No medals" /> : (
                <div className="table-scroll"><table className="table"><thead><tr><th style={{ width: 30 }}>#</th><th>Swimmer</th><th className="num">G</th><th className="num">S</th><th className="num">B</th><th className="num">Total</th></tr></thead><tbody>
                  {topMedalists.map((m, i) => (<tr key={m.id ?? i}><td className="asw-num">{i + 1}</td><td><SwimmerLink id={m.id} name={m.name} /></td><td className="num asw-num" style={{ fontWeight: 800, color: 'var(--asw-gold)' }}>{m.gold}</td><td className="num asw-num">{m.silver}</td><td className="num asw-num">{m.bronze}</td><td className="num asw-num" style={{ fontWeight: 800 }}>{m.total}</td></tr>))}
                </tbody></table></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== TEAM (Swimmers) ===== */}
      {tab === 'team' && (
        <div className="pad-lg">
          <SectHead title={`National Team · ${topSwimmers.length} swimmers`} />
          {topSwimmers.length === 0 ? <Empty label="No swimmers" /> : (
            <div className="table-scroll"><table className="table"><thead><tr><th style={{ width: 30 }}>#</th><th>Swimmer</th><th>Sex</th><th>Best event</th><th className="time">Time</th><th className="num">FINA</th></tr></thead><tbody>
              {topSwimmers.map((s, i) => (<tr key={s.id}><td className="asw-num">{i + 1}</td><td><SwimmerLink id={s.id} name={s.name} /></td><td className="text-muted">{s.sex === 'F' ? "Women's" : "Men's"}</td><td>{s.best_event || '—'}</td><td className="time asw-time">{s.best_time || '—'}</td><td className="num asw-num">{s.best_fina ?? '—'}</td></tr>))}
            </tbody></table></div>
          )}
        </div>
      )}

      {/* ===== RESULTS (Best Times) ===== */}
      {tab === 'results' && (
        <div className="pad-lg">
          <SectHead title={`National Best Times · ${filteredBest.length}`}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Seg options={[{ value: '', label: 'All' }, { value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }]} value={btSex} onChange={setBtSex} />
              <Seg options={[{ value: '', label: 'All Pools' }, { value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]} value={btPool} onChange={setBtPool} />
            </div>
          </SectHead>
          {filteredBest.length === 0 ? <Empty label="No times" /> : (
            <div className="table-scroll"><table className="table"><thead><tr><th>Event</th><th>Sex</th><th>Pool</th><th className="time">Time</th><th className="num">FINA</th><th>Swimmer</th><th className="num">Age</th><th>Championship</th><th>Date</th></tr></thead><tbody>
              {filteredBest.map((t, i) => (<tr key={i}><td style={{ fontWeight: 600 }}>{t.event}</td><td className="text-muted">{t.sex === 'F' ? "Women's" : "Men's"}</td><td className="text-muted">{t.pool}</td><td className="time asw-time">{t.time}</td><td className="num asw-num">{t.fina ?? '—'}</td><td><SwimmerLink id={t.swimmer_id} name={t.swimmer} /></td><td className="num asw-num">{t.age_at_competition || '—'}</td><td className="text-muted">{t.championship || '—'}</td><td className="text-muted">{formatDate(t.date)}</td></tr>))}
            </tbody></table></div>
          )}
        </div>
      )}

      {/* ===== CHAMPIONSHIPS ===== */}
      {tab === 'championships' && (
        <div>
          {/* Hosted */}
          <div className="pad-lg rule-b">
            <SectHead title={`Hosted · ${hosted.length}`} />
            {hosted.length === 0 ? <Empty label="No championships hosted" /> : (
              <div>{hosted.map((c) => (
                <Link key={c.id} to={`/meets/${c.id}`} className="hair-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', color: 'inherit', textDecoration: 'none' }}>
                  <span style={{ minWidth: 0 }}><span style={{ fontWeight: 600, display: 'block' }}>{c.name}</span><span className="text-muted" style={{ fontSize: 12 }}>{c.location}</span></span>
                  <span className="text-muted asw-num" style={{ fontSize: 12, textAlign: 'right', flex: 'none' }}>{formatDate(c.date)}<br />{c.pool}</span>
                </Link>
              ))}</div>
            )}
          </div>
          {/* Participated */}
          <div className="pad-lg">
            <SectHead title={`Participated · ${participated.length}`} />
            {participated.length === 0 ? <Empty label="No participations" /> : (
              <div>{participated.map((c) => {
                const isOpen = openChamp === c.id
                return (
                  <div key={c.id} className="hair-b">
                    <button type="button" onClick={() => setOpenChamp(isOpen ? null : c.id)}
                      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 0', background: 'none', border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', color: 'inherit' }}>
                      <span style={{ flex: 1, minWidth: 220 }}><span style={{ fontWeight: 600, display: 'block' }}>{c.name}</span><span className="text-muted" style={{ fontSize: 12 }}>{formatDate(c.date)} · {c.pool}{c.location ? ` · ${c.location}` : ''}</span></span>
                      <span className="asw-num text-muted" style={{ fontSize: 12 }}>{c.swimmers_count} swimmers · {c.results_count} results</span>
                      {c.medals?.total > 0 && <span className="asw-num" style={{ fontSize: 12, display: 'inline-flex', gap: 8 }}>{c.medals.gold > 0 && <span style={{ color: 'var(--asw-gold)', fontWeight: 800 }}>{c.medals.gold}G</span>}{c.medals.silver > 0 && <span style={{ color: 'var(--asw-silver)', fontWeight: 800 }}>{c.medals.silver}S</span>}{c.medals.bronze > 0 && <span style={{ color: 'var(--asw-bronze)', fontWeight: 800 }}>{c.medals.bronze}B</span>}</span>}
                      <span className="micro">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 0 16px' }}>
                        <Link to={`/meets/${c.id}`} style={{ fontSize: 12 }}>View full meet details →</Link>
                        {Array.isArray(c.swimmers) && c.swimmers.length > 0 && (
                          <><div className="micro" style={{ margin: '12px 0 6px' }}>Athletes · {c.swimmers.length}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '2px 16px' }}>
                            {c.swimmers.map((s) => (<Link key={s.id} to={`/swimmers/${s.id}`} style={{ color: 'inherit', textDecoration: 'none', fontSize: 13, padding: '2px 0' }}>{s.name} <span className="text-muted" style={{ fontSize: 11 }}>{s.sex === 'F' ? 'W' : 'M'}</span></Link>))}
                          </div></>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}</div>
            )}
          </div>
        </div>
      )}

      {/* ===== STATISTICS ===== */}
      {tab === 'statistics' && <StatisticsTab
        profile={profile} country={country} topSwimmers={topSwimmers}
        topMedalists={topMedalists} records={records} medalBoxes={medalBoxes}
        hosted={hosted} participated={participated}
        progStroke={progStroke} setProgStroke={setProgStroke}
        progPool={progPool} setProgPool={setProgPool}
        progLines={progLines} progLoading={progLoading}
      />}

      {/* ===== RECORDS ===== */}
      {tab === 'records' && (
        <div className="pad-lg">
          {newRecords.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <SectHead title={`New Records · ${newRecords.length}`} to="/new-records" linkLabel="All new records" />
              <RecordsTable records={newRecords} />
            </div>
          )}
          <SectHead title={`Records Held · ${currentRecords.length}`} />
          {currentRecords.length === 0 ? <Empty label="No records held" /> : <RecordsTable records={currentRecords} />}
        </div>
      )}

      {/* ===== MEDALS ===== */}
      {tab === 'medals' && (
        <div className="pad-lg">
          <SectHead title="Medal Tally by Competition" />
          {medalBoxes.length === 0 ? <Empty label="No medals" /> : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
              {medalBoxes.map((m) => (
                <div key={m.name} style={{ background: CLASS_COLORS[m.name] || 'var(--color-accent)', color: '#fff', padding: '12px 18px', minWidth: 150, flex: '1 1 150px', maxWidth: 240 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.75 }}>{m.name}</div>
                  <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, lineHeight: 1.1, marginTop: 2 }}>{formatNumber(m.total)}</div>
                  <div className="asw-num" style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12, fontWeight: 700 }}>
                    <span style={{ color: 'var(--asw-gold)' }}>{m.gold}G</span>
                    <span style={{ color: 'var(--asw-silver)' }}>{m.silver}S</span>
                    <span style={{ color: '#e3a869' }}>{m.bronze}B</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <SectHead title={`Top Medalists · ${topMedalists.length}`} />
          {topMedalists.length === 0 ? <Empty label="No medals" /> : (
            <div className="table-scroll"><table className="table"><thead><tr><th style={{ width: 30 }}>#</th><th>Swimmer</th><th className="num">G</th><th className="num">S</th><th className="num">B</th><th className="num">Total</th></tr></thead><tbody>
              {topMedalists.map((m, i) => (<tr key={m.id ?? i}><td className="asw-num">{i + 1}</td><td><SwimmerLink id={m.id} name={m.name} /></td><td className="num asw-num" style={{ fontWeight: 800, color: 'var(--asw-gold)' }}>{m.gold}</td><td className="num asw-num">{m.silver}</td><td className="num asw-num">{m.bronze}</td><td className="num asw-num" style={{ fontWeight: 800 }}>{m.total}</td></tr>))}
            </tbody></table></div>
          )}
        </div>
      )}

      {/* ===== CLUBS ===== */}
      {tab === 'clubs' && (
        <div className="pad-lg">
          <SectHead title={`Clubs & Teams · ${teams.length}`} />
          {teams.length === 0 ? <Empty label="No clubs registered" /> : (
            <div>{teams.map((t) => (
              <Link key={t.id} to={`/teams/${t.id}`} className="hair-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', color: 'inherit', textDecoration: 'none' }}>
                <span style={{ fontWeight: 600 }}>{t.name}</span>
                {t.is_national_team && <span className="tag tag-dark">National team</span>}
              </Link>
            ))}</div>
          )}
        </div>
      )}

      {/* ===== COMPARE ===== */}
      {tab === 'compare' && (
        <div className="pad-lg">
          <Empty label="Federation comparison — coming soon" />
        </div>
      )}
    </div>
  )
}
