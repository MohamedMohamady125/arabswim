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
  { value: 'board', label: 'Board' },
  { value: 'team', label: 'Swimmers' },
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

// ─── Statistics dashboard (blue-themed cards matching ISF design) ───
const S = {
  bg: '#ffffff',
  card: { background: '#fff', borderRadius: 6, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', border: '1px solid #dde3ea', position: 'relative' },
  title: { fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 14, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#0b2948', display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.2 },
  sub: { fontSize: 10.5, color: '#7a8ca0', marginBottom: 14, marginTop: 3, lineHeight: 1.3 },
  viewAll: { fontSize: 10, color: '#4a90d9', fontWeight: 700, marginLeft: 'auto', cursor: 'pointer', textDecoration: 'none', textTransform: 'none', letterSpacing: '0.03em' },
  rankBadge: (i) => ({
    width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, color: '#fff',
    background: '#1a56a0',
    flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,.2)',
  }),
  medalCircle: (color) => ({
    width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, color: '#fff', background: color, flexShrink: 0,
    boxShadow: '0 1px 3px rgba(0,0,0,.15)',
  }),
  th: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a9bb5', padding: '8px 0', borderBottom: '2px solid #e2e8f0' },
  row: (i) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f0f3f7', fontSize: 13, background: i % 2 === 1 ? '#fafbfd' : 'transparent' }),
  photo: { width: 52, height: 52, borderRadius: '50%', background: '#e8ecf1', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#8a9bb5', border: '2px solid #d0d8e4', overflow: 'hidden' },
  photoSmall: { width: 28, height: 28, borderRadius: '50%', background: '#e8ecf1', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#8a9bb5', border: '1.5px solid #d0d8e4', overflow: 'hidden' },
}
const PERF_BAR_COLORS = ['#e63946', '#f4845f', '#f7b731', '#f5d547', '#52c78a', '#27ae60', '#3b9dd6', '#2471a3', '#7d3c98', '#b0bec5']

function SCard({ icon, title, subtitle, viewAll, children, style: extra }) {
  return (
    <div style={{ ...S.card, ...extra }}>
      <div style={S.title}>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
        {title}
        {viewAll && <span style={S.viewAll}>View All</span>}
      </div>
      {subtitle && <div style={S.sub}>{subtitle}</div>}
      {children}
    </div>
  )
}

function STableHead({ cols }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 6px', marginBottom: 4 }}>
      <span style={{ ...S.th, width: 24 }}>#</span>
      {cols.map(([label, w, align]) => (
        <span key={label} style={{ ...S.th, width: w || undefined, flex: w ? 'none' : 1, textAlign: align || 'left' }}>{label}</span>
      ))}
    </div>
  )
}

function RankedRow({ rank, idx, children }) {
  return (
    <div style={S.row(idx ?? rank - 1)}>
      <span style={S.rankBadge(rank - 1)}>{rank}</span>
      {children}
    </div>
  )
}

const AGE_CATS = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'Open']

function RecordsTab({ records, country }) {
  const [gender, setGender] = useState('')
  const [pool, setPool] = useState('')
  const [ageCat, setAgeCat] = useState('Open')

  const filtered = records.filter((r) => {
    if (gender && r.sex !== gender) return false
    if (pool && r.pool !== pool) return false
    return true
  })

  const selStyle = { padding: '10px 20px', border: '1px solid #c0cad8', borderRadius: 6, fontSize: 14, fontWeight: 600, color: '#0b2948', background: '#fff', cursor: 'pointer', minWidth: 180, appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%230b2948\' stroke-width=\'2\' fill=\'none\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }
  const pillBase = { padding: '8px 18px', border: '2px solid #1a56a0', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }
  const pillActive = { ...pillBase, background: '#1a56a0', color: '#fff' }
  const pillInactive = { ...pillBase, background: '#fff', color: '#1a56a0' }

  return (
    <div style={{ padding: '28px 28px', background: '#fff' }}>
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 28, marginBottom: 4 }}>🏅</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ width: 60, height: 2, background: '#1a56a0' }} />
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 26, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0b2948', margin: 0 }}>Records</h2>
          <div style={{ width: 60, height: 2, background: '#1a56a0' }} />
        </div>
      </div>

      {/* Filters: Gender + Pool dropdowns */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 20 }}>
        <select style={selStyle} value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="">♂ Gender</option>
          <option value="M">♂ Men's</option>
          <option value="F">♀ Women's</option>
        </select>
        <select style={selStyle} value={pool} onChange={(e) => setPool(e.target.value)}>
          <option value="">🏊 Pool</option>
          <option value="LCM">LCM (50m)</option>
          <option value="SCM">SCM (25m)</option>
        </select>
      </div>

      {/* Age category pills */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
        {AGE_CATS.map((cat) => (
          <button key={cat} type="button" onClick={() => setAgeCat(cat)}
            style={ageCat === cat ? pillActive : pillInactive}>
            {cat}
          </button>
        ))}
      </div>

      {/* Record cards grid */}
      {filtered.length === 0 ? <Empty label="No records for this selection" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16 }}>
          {filtered.map((r, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #dde3ea', borderRadius: 8, overflow: 'hidden', textAlign: 'center' }}>
              {/* Photo area */}
              <div style={{ height: 140, background: 'linear-gradient(135deg, #d6e4f0, #e8edf4)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#c8d5e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, color: '#8a9bb5', border: '3px solid #fff' }}>🏊</div>
              </div>
              {/* Info */}
              <div style={{ padding: '12px 10px 16px' }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#0b2948', marginBottom: 2 }}>
                  <SwimmerLink id={r.swimmer_id} name={r.swimmer} />
                </div>
                <div style={{ fontSize: 11, color: '#7a8ca0', marginBottom: 8 }}>{r.event}</div>
                <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 28, color: '#1a56a0', letterSpacing: '-0.02em', marginBottom: 6 }}>{r.time}</div>
                <div style={{ fontSize: 10, color: '#7a8ca0', fontWeight: 600 }}>National Record</div>
                <div style={{ fontSize: 10, color: '#9baab8' }}>{r.pool} | {r.sex === 'F' ? "Women's" : "Men's"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatisticsTab({ profile, country, topSwimmers, topMedalists, records, medalBoxes, hosted, participated }) {
  const maleTop = topSwimmers.filter((s) => s.sex === 'M').slice(0, 5)
  const femaleTop = topSwimmers.filter((s) => s.sex === 'F').slice(0, 5)
  const maleMedalists = topMedalists.filter((m) => m.sex === 'M').slice(0, 5)
  const femaleMedalists = topMedalists.filter((m) => m.sex === 'F').slice(0, 5)

  const maleRecords = records.filter((r) => r.sex === 'M').sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const femaleRecords = records.filter((r) => r.sex === 'F').sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const lastMR = maleRecords[0]
  const lastFR = femaleRecords[0]

  const recBySwimmer = {}
  records.forEach((r) => {
    const k = `${r.swimmer_id}_${r.sex}`
    if (!recBySwimmer[k]) recBySwimmer[k] = { id: r.swimmer_id, name: r.swimmer, sex: r.sex, count: 0 }
    recBySwimmer[k].count++
  })
  const topMaleRec = Object.values(recBySwimmer).filter((r) => r.sex === 'M').sort((a, b) => b.count - a.count)[0]
  const topFemaleRec = Object.values(recBySwimmer).filter((r) => r.sex === 'F').sort((a, b) => b.count - a.count)[0]

  const perfTiers = [
    { label: 'World Class', range: '1000+', min: 1000, max: Infinity },
    { label: 'Super Elite', range: '900-999', min: 900, max: 1000 },
    { label: 'Elite', range: '700-799', min: 700, max: 900 },
    { label: 'Excellence', range: '600-699', min: 600, max: 700 },
    { label: 'Advanced', range: '500-599', min: 500, max: 600 },
    { label: 'Competitive', range: '400-499', min: 400, max: 500 },
    { label: 'Developing', range: '300-399', min: 300, max: 400 },
    { label: 'Fondation', range: '200-299', min: 200, max: 300 },
    { label: 'Novice', range: '100-199', min: 100, max: 200 },
    { label: 'Initiation', range: '0-99', min: 0, max: 100 },
  ]
  const perfDist = perfTiers.map((t) => ({
    ...t, count: topSwimmers.filter((s) => (s.best_fina || 0) >= t.min && (s.best_fina || 0) < t.max).length,
  }))
  const maxPerf = Math.max(...perfDist.map((d) => d.count), 1)

  const partByClass = {}
  participated.forEach((c) => { partByClass[c.classification || 'Other'] = (partByClass[c.classification || 'Other'] || 0) + 1 })
  const participationList = Object.entries(partByClass).sort((a, b) => b[1] - a[1])
  const maxPart = Math.max(...participationList.map(([, n]) => n), 1)

  // Helpers
  const cardHeader = (icon, title, sub) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16, color: '#1a56a0' }}>{icon}</span>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0b2948' }}>{title}</span>
        <span style={{ fontSize: 10, color: '#4a90d9', fontWeight: 700, marginLeft: 'auto', cursor: 'pointer' }}>View All</span>
      </div>
      <div style={{ fontSize: 10.5, color: '#7a8ca0', marginTop: 2, lineHeight: 1.3 }}>{sub}</div>
    </div>
  )
  const card = (children, extra = {}) => (
    <div style={{ background: '#fff', borderRadius: 6, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', border: '1px solid #dde3ea', ...extra }}>{children}</div>
  )
  const thStyle = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a9bb5', paddingBottom: 6, borderBottom: '2px solid #e2e8f0' }
  const rowStyle = (i) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f4f8', fontSize: 12.5, background: i % 2 === 1 ? '#fafbfd' : 'transparent' })
  const badge = { width: 24, height: 24, borderRadius: '50%', background: '#1a56a0', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }
  const mc = (color) => ({ width: 26, height: 26, borderRadius: '50%', background: color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 })
  const barRow = (label, n, max) => (
    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
      <span style={{ width: 130, fontSize: 11.5, fontWeight: 600, flexShrink: 0, color: '#374151' }}>{label}</span>
      <div style={{ flex: 1, height: 18, background: '#e8eef6', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${(n / max) * 100}%`, height: '100%', background: '#1a56a0', borderRadius: 3, minWidth: n > 0 ? 8 : 0 }} />
      </div>
      <span className="asw-num" style={{ width: 28, textAlign: 'right', fontWeight: 800, color: '#0b2948', fontSize: 13, flexShrink: 0 }}>{n}</span>
    </div>
  )

  const topPerfTable = (list) => (
    <>
      <div style={{ display: 'flex', gap: 8, ...thStyle, padding: '0 0 6px' }}>
        <span style={{ width: 24 }}>#</span>
        <span style={{ flex: 1 }}>Swimmer</span>
        <span style={{ width: 120 }}>Event</span>
        <span style={{ width: 60, textAlign: 'right' }}>Time</span>
        <span style={{ width: 36, textAlign: 'right' }}>Pts</span>
      </div>
      {list.map((s, i) => (
        <div key={s.id} style={rowStyle(i)}>
          <span style={badge}>{i + 1}</span>
          <Flag code={s.nationality_code || country.code} />
          <span style={{ flex: 1, fontWeight: 700, fontSize: 12.5, color: '#0b2948' }}><SwimmerLink id={s.id} name={s.name} /></span>
          <span style={{ width: 120, color: '#6b7d94', fontSize: 11 }}>{s.best_event}</span>
          <span className="asw-num" style={{ width: 60, textAlign: 'right', fontWeight: 800, color: '#0b2948', fontSize: 12.5 }}>{s.best_time}</span>
          <span className="asw-num" style={{ width: 36, textAlign: 'right', fontWeight: 900, color: '#1a56a0', fontSize: 13 }}>{s.best_fina}</span>
        </div>
      ))}
    </>
  )

  const decoratedTable = (list) => (
    <>
      <div style={{ display: 'flex', gap: 8, ...thStyle, padding: '0 0 6px' }}>
        <span style={{ width: 24 }}>#</span>
        <span style={{ flex: 1 }}>Swimmer</span>
        <span style={{ width: 28, textAlign: 'center' }}>🥇</span>
        <span style={{ width: 28, textAlign: 'center' }}>🥈</span>
        <span style={{ width: 28, textAlign: 'center' }}>🥉</span>
        <span style={{ width: 40, textAlign: 'center' }}>Total</span>
      </div>
      {list.map((m, i) => (
        <div key={m.id ?? i} style={rowStyle(i)}>
          <span style={badge}>{i + 1}</span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 12.5, color: '#0b2948', display: 'flex', alignItems: 'center', gap: 6 }}><Flag code={m.nationality_code || country.code} /><SwimmerLink id={m.id} name={m.name} /></span>
          <span style={mc('#d4af37')}>{m.gold}</span>
          <span style={mc('#a8a9ad')}>{m.silver}</span>
          <span style={mc('#cd7f32')}>{m.bronze}</span>
          <span className="asw-num" style={{ width: 40, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0b2948' }}>{m.total}</span>
        </div>
      ))}
    </>
  )

  const recCard4 = (rec, label, sub, icon, isRecordman = false) => (
    <div style={{ background: '#fff', border: '1px solid #dde3ea', borderRadius: 6, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
      <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid #f0f3f7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 14, color: '#1a56a0' }}>{icon}</span>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0b2948' }}>{label}</span>
          <span style={{ fontSize: 9, color: '#4a90d9', fontWeight: 700, marginLeft: 'auto' }}>View All</span>
        </div>
        <div style={{ fontSize: 9.5, color: '#7a8ca0', marginTop: 2 }}>{sub}</div>
      </div>
      {rec ? (
        <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 130 }}>
          {/* Photo panel */}
          <div style={{ width: 100, background: 'linear-gradient(170deg, #0d2d5e 0%, #1a56a0 60%, #3b82c4 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>🏊</div>
          {/* Info */}
          <div style={{ padding: '12px 12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <Flag code={country.code} />
              <span style={{ fontWeight: 800, fontSize: 12.5, color: '#0b2948', lineHeight: 1.2 }}>
                <SwimmerLink id={isRecordman ? rec.id : rec.swimmer_id} name={isRecordman ? rec.name : rec.swimmer} />
              </span>
            </div>
            {!isRecordman && <div style={{ fontSize: 10.5, color: '#7a8ca0', marginBottom: 6 }}>{rec.event}</div>}
            {isRecordman && <div style={{ fontSize: 10.5, color: '#7a8ca0', marginBottom: 6 }}>Total Records</div>}
            <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: isRecordman ? 40 : 30, color: '#1a56a0', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {isRecordman ? rec.count : rec.time}
            </div>
            {!isRecordman && rec.date && <div style={{ fontSize: 10, color: '#9baab8', marginTop: 5 }}>{formatDate(rec.date)}</div>}
          </div>
        </div>
      ) : (
        <div style={{ padding: '30px', textAlign: 'center', color: '#bbb', fontSize: 13, minHeight: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>—</div>
      )}
    </div>
  )

  return (
    <div style={{ background: '#f8fafc', padding: '28px 24px' }}>
      {/* Page title */}
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 2, background: '#1a56a0' }} />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 26, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0b2948' }}>Statistics</span>
          <div style={{ width: 40, height: 2, background: '#1a56a0' }} />
        </div>
      </div>

      {/* Row 1: Top Performance Male | Female */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        {card(<>{cardHeader('♂', 'Top Performance', `Best Performances by ${country.name} Male Swimmers (FINA Points)`)}{maleTop.length ? topPerfTable(maleTop) : <Empty label="No data" />}</>)}
        {card(<>{cardHeader('♀', 'Top Performance', `Best Performances by ${country.name} Female Swimmers (FINA Points)`)}{femaleTop.length ? topPerfTable(femaleTop) : <Empty label="No data" />}</>)}
      </div>

      {/* Row 2: Participation | Championships Hosted | Most Participated */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        {card(<>
          {cardHeader('🌐', 'Participation', 'Total Participations by Competition')}
          {participationList.length === 0 ? <Empty label="No data" /> : participationList.map(([cls, n]) => barRow(cls, n, maxPart))}
        </>)}
        {card(<>
          {cardHeader('🏟', 'Championships Hosted', 'Number of Championships Hosted')}
          {hosted.length === 0 ? <Empty label="None" /> : (() => {
            const counts = {}
            hosted.forEach((c) => { const k = c.classification || 'Other'; counts[k] = (counts[k] || 0) + 1 })
            const list = Object.entries(counts).sort((a, b) => b[1] - a[1])
            const mx = Math.max(...list.map(([, n]) => n), 1)
            return list.map(([cls, n]) => barRow(cls, n, mx))
          })()}
        </>)}
        {card(<>
          {cardHeader('👥', 'Most Participated Swimmer', `Top 5 ${country.name} Swimmers by International Participations`)}
          <div style={{ display: 'flex', gap: 8, ...thStyle, padding: '0 0 6px' }}>
            <span style={{ width: 24 }}>#</span>
            <span style={{ flex: 1 }}>Swimmer</span>
            <span style={{ width: 90, textAlign: 'right' }}>Participations</span>
          </div>
          {topSwimmers.slice(0, 5).map((s, i) => (
            <div key={s.id} style={rowStyle(i)}>
              <span style={badge}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 12.5, color: '#0b2948', display: 'flex', alignItems: 'center', gap: 6 }}><Flag code={s.nationality_code || country.code} /><SwimmerLink id={s.id} name={s.name} /></span>
              <span className="asw-num" style={{ width: 90, textAlign: 'right', fontWeight: 900, fontSize: 14, color: '#0b2948' }}>{s.championships_count ?? '—'}</span>
            </div>
          ))}
        </>)}
      </div>

      {/* Row 3: Medals | Most Male Decorated | Most Female Decorated */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        {card(<>
          {cardHeader('🏅', 'Medals', 'Total Medals by Competition')}
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 11 }}>
            {[['Gold', '#d4af37'], ['Silver', '#a8a9ad'], ['Bronze', '#cd7f32']].map(([lbl, c]) => (
              <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: c, display: 'inline-block' }} />{lbl}
              </span>
            ))}
          </div>
          {(() => {
            const maxTotal = Math.max(...medalBoxes.map((m) => m.total), 1)
            return medalBoxes.map((m) => (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 }}>
                <span style={{ width: 88, fontSize: 11.5, fontWeight: 700, flexShrink: 0, color: '#374151' }}>{m.name}</span>
                <div style={{ flex: 1, height: 20, display: 'flex', background: '#e8eef6', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(m.total / maxTotal) * 100}%`, display: 'flex', minWidth: m.total > 0 ? 20 : 0 }}>
                    {[['gold', '#d4af37'], ['silver', '#a8a9ad'], ['bronze', '#cd7f32']].map(([key, color]) =>
                      m[key] > 0 && <div key={key} style={{ flex: m[key], background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 10, minWidth: 14 }} className="asw-num">{m[key]}</div>
                    )}
                  </div>
                </div>
                <span className="asw-num" style={{ width: 26, textAlign: 'right', fontWeight: 900, color: '#0b2948', fontSize: 13, flexShrink: 0 }}>{m.total}</span>
              </div>
            ))
          })()}
        </>)}
        {card(<>{cardHeader('♂', 'Most Male Decorated', `Top 5 ${country.name} Male Swimmers by Total Medals`)}{maleMedalists.length ? decoratedTable(maleMedalists) : <Empty label="No data" />}</>)}
        {card(<>{cardHeader('♀', 'Most Female Decorated', `Top 5 ${country.name} Female Swimmers by Total Medals`)}{femaleMedalists.length ? decoratedTable(femaleMedalists) : <Empty label="No data" />}</>)}
      </div>

      {/* Row 4: Last Male Record | Last Female Record | Most Male Recordan | Most Femal Recordan */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        {recCard4(lastMR, 'Last Male Record', `Most Recent ${country.name} Male Record`, '♂', false)}
        {recCard4(lastFR, 'Last Female Record', `Most Recent ${country.name} Female Record`, '♀', false)}
        {recCard4(topMaleRec, 'Most Male Recordan', `Top ${country.name} Male Swimmers by Records`, '♂', true)}
        {recCard4(topFemaleRec, 'Most Femal Recordan', `Top ${country.name} Female Swimmers by Records`, '♀', true)}
      </div>

      {/* Row 5: Performance Index (dark bg) | Country Battle */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        {/* Performance Index — dark navy background like ISF */}
        <div style={{ background: '#0b2948', borderRadius: 6, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 16, color: '#4a90d9' }}>📊</span>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>Performance Index</span>
            <span style={{ fontSize: 10, color: '#4a90d9', fontWeight: 700, marginLeft: 'auto', cursor: 'pointer' }}>View All</span>
          </div>
          <div style={{ fontSize: 10.5, color: '#8aaccc', marginBottom: 18, lineHeight: 1.3 }}>Distribution of {country.name} Swimmers by Performance Level</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 180 }}>
            {perfDist.map((d, i) => (
              <div key={d.label} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                {d.count > 0 && <div className="asw-num" style={{ fontSize: 11, fontWeight: 900, marginBottom: 4, color: '#fff' }}>{d.count}</div>}
                <div style={{ width: '75%', height: `${Math.max(4, (d.count / maxPerf) * 140)}px`, background: PERF_BAR_COLORS[i], borderRadius: '3px 3px 0 0' }} />
                <div style={{ fontSize: 7.5, marginTop: 6, lineHeight: 1.2, color: '#8aaccc', fontWeight: 700, wordBreak: 'break-word' }}>{d.label}</div>
                <div style={{ fontSize: 6.5, color: '#4a6a8a', marginTop: 1 }}>({d.range})</div>
              </div>
            ))}
          </div>
        </div>
        {/* Country Battle */}
        {card(<>
          {cardHeader('👥', 'Country Battle', 'Number of Swimmers in the Top 100 Arab Ranking')}
          <Empty label="Coming soon" />
        </>)}
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
      {tab === 'overview' && (() => {
        const bestPerf = topSwimmers[0]
        const topMedalist = topMedalists[0]
        const newestRecord = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
        const topRecords = records.slice(0, 5)
        const hCard = { background: '#fff', border: '1px solid #dde3ea', borderRadius: 12, overflow: 'hidden', display: 'flex', gap: 0, boxShadow: '0 2px 8px rgba(11,41,72,.06)' }
        const hPhoto = { width: 160, minHeight: 170, background: 'linear-gradient(135deg, #d6e4f0, #e2eaf3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, color: '#8a9bb5', flexShrink: 0 }
        const hBody = { padding: '20px 22px', flex: 1 }
        const hTitle = { fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 15, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#0b2948', marginBottom: 8, lineHeight: 1.25 }
        const hBig = { fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 34, color: '#1a56a0', letterSpacing: '-0.02em' }
        const hSub = { fontSize: 13, color: '#7a8ca0', marginTop: 3 }
        const secTitle = (text) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '28px 0 20px' }}>
            <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 20, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0b2948', margin: 0 }}>{text}</h3>
            <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
          </div>
        )
        return (
          <div style={{ padding: '0 28px 28px', background: '#fff' }}>
            {/* Main layout: News left + Highlights right */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, alignItems: 'start' }}>
              {/* LEFT: Latest News */}
              <div>
                <div style={{ textAlign: 'center', marginBottom: 4 }}><span style={{ fontSize: 20 }}>📰</span></div>
                {secTitle('Latest News')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ height: 120, background: 'linear-gradient(135deg, #c8d8e8, #dde6f0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#8a9bb5' }}>📷</div>
                      <div style={{ padding: '10px 10px 12px' }}>
                        <div style={{ fontSize: 10, color: '#4a90d9', fontWeight: 600, marginBottom: 4 }}>Coming soon</div>
                        <div style={{ fontSize: 12, color: '#0b2948', fontWeight: 600, lineHeight: 1.3, marginBottom: 8 }}>Federation news will appear here</div>
                        <span style={{ fontSize: 11, color: '#4a90d9', fontWeight: 600 }}>Read more →</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT: Highlight cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Best Season Performance */}
                <div style={hCard}>
                  <div style={hPhoto}>🏊</div>
                  <div style={hBody}>
                    <div style={hTitle}>Best Season Performance</div>
                    <div style={hBig}>{bestPerf?.best_time || '—'}</div>
                    <div style={hSub}>{bestPerf?.best_event || ''}</div>
                    <div style={hSub}>{bestPerf?.name || ''}</div>
                  </div>
                </div>

                {/* Most Decorated Swimmer */}
                <div style={hCard}>
                  <div style={hPhoto}>🏊</div>
                  <div style={hBody}>
                    <div style={hTitle}>Most Decorated Swimmer</div>
                    <div style={hBig}>{topMedalist?.total || 0}</div>
                    <div style={hSub}>Total Medals</div>
                    <div style={hSub}>{topMedalist?.name || '—'}</div>
                  </div>
                </div>

                {/* New Record */}
                <div style={hCard}>
                  <div style={hPhoto}>🏊</div>
                  <div style={hBody}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={hTitle}>New Record</span>
                      {newestRecord && <span style={{ fontSize: 11, fontWeight: 700, background: '#1a56a0', color: '#fff', padding: '3px 10px', borderRadius: 12 }}>NEW</span>}
                    </div>
                    <div style={hBig}>{newestRecord?.time || '—'}</div>
                    <div style={hSub}>{newestRecord?.event || ''}</div>
                    <div style={hSub}>{newestRecord?.swimmer || ''}</div>
                    {newestRecord?.date && <div style={hSub}>{formatDate(newestRecord.date)}</div>}
                  </div>
                </div>

                {/* Quick Stats */}
                <div style={hCard}>
                  <div style={hPhoto}>🏊</div>
                  <div style={hBody}>
                    <div style={hTitle}>Quick Stats</div>
                    <div style={hBig}>{formatNumber(profile.stats?.swimmers)}</div>
                    <div style={hSub}>Total Swimmers</div>
                    <div style={{ ...hSub, marginTop: 6 }}>{formatNumber(profile.stats?.medals)} Medals · {formatNumber(profile.stats?.records)} Records</div>
                  </div>
                </div>
              </div>
            </div>

            {/* National Record Holders */}
            <div style={{ textAlign: 'center', marginTop: 10 }}><span style={{ fontSize: 20 }}>🏅</span></div>
            {secTitle('National Record Holders')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 18 }}>
              {topRecords.map((r, i) => (
                <div key={i} style={{ border: '1px solid #dde3ea', borderRadius: 12, overflow: 'hidden', textAlign: 'center', background: '#fff', boxShadow: '0 2px 8px rgba(11,41,72,.06)' }}>
                  {/* Circular photo */}
                  <div style={{ padding: '24px 0 12px', background: '#f5f8fb' }}>
                    <div style={{ width: 150, height: 150, borderRadius: '50%', background: '#d6e0ec', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, color: '#8a9bb5', border: '4px solid #fff', boxShadow: '0 3px 10px rgba(0,0,0,.12)' }}>🏊</div>
                  </div>
                  <div style={{ padding: '12px 12px 0' }}>
                    <div style={{ fontWeight: 800, fontSize: 17, color: '#0b2948' }}><SwimmerLink id={r.swimmer_id} name={r.swimmer} /></div>
                    <div style={{ fontSize: 13, color: '#7a8ca0', marginTop: 4 }}>{r.event}</div>
                    <div style={{ fontSize: 13, color: '#7a8ca0' }}>{r.pool === 'LCM' ? 'Long Course' : 'Short Course'}</div>
                  </div>
                  {/* Blue footer with time */}
                  <div style={{ background: '#1a56a0', color: '#fff', padding: '14px 10px 16px', marginTop: 14 }}>
                    <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 28, letterSpacing: '-0.01em' }}>{r.time}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 3, opacity: 0.85 }}>National Record</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ===== BOARD ===== */}
      {tab === 'board' && (
        <div style={{ padding: '0 28px 28px', background: '#fff' }}>
          {/* Title */}
          <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 4 }}>
            <span style={{ fontSize: 24 }}>👥</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 10 }}>
            <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 24, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0b2948', margin: 0 }}>Board of Directors</h2>
            <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
          </div>
          <p style={{ textAlign: 'center', fontSize: 13, color: '#6b7d94', maxWidth: 500, margin: '0 auto 28px', lineHeight: 1.5 }}>
            The Board of Directors is responsible for the strategic direction, governance, and overall leadership of the {country.name} Swimming Federation.
          </p>

          {/* Board member cards — placeholder data */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 18 }}>
            {['President', 'Vice President', 'Treasurer', 'Secretary General', 'Technical Director',
              'Member', 'Member', 'Member', 'Member', 'Member'].map((role, i) => (
              <div key={i} style={{ borderRadius: 16, overflow: 'hidden', textAlign: 'center', background: 'linear-gradient(180deg, #f4f8fc 0%, #eef3f9 100%)', border: '1px solid #e2e9f2', boxShadow: '0 2px 10px rgba(11,41,72,.06)', position: 'relative', padding: '26px 14px 30px', minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* Number badge */}
                <div style={{ position: 'absolute', top: 12, left: 12, width: 30, height: 30, borderRadius: '50%', background: '#1a56a0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, zIndex: 1 }}>{i + 1}</div>
                {/* Circular photo blended on white ring */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ width: 170, height: 170, borderRadius: '50%', background: 'radial-gradient(circle at 50% 40%, #e8eef5, #cdd9e6)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56, color: '#8a9bb5', border: '6px solid #fff', boxShadow: '0 4px 14px rgba(11,41,72,.12)' }}>👤</div>
                </div>
                {/* Name + role */}
                <div style={{ padding: '26px 6px 0' }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: '#0b2948' }}>—</div>
                  <div style={{ fontSize: 14, color: '#5a6b80', fontWeight: 600, marginTop: 8 }}>{role}</div>
                </div>
                {/* Listen row: play button + waveform */}
                <div style={{ marginTop: 'auto', paddingTop: 22, width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#0d2d5e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', boxShadow: '0 2px 6px rgba(11,41,72,.25)' }}>
                      <div style={{ width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '11px solid #fff', marginLeft: 3 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 26 }}>
                      {[9, 15, 6, 19, 12, 23, 8, 16, 11, 21, 7, 14, 18, 10, 24, 13, 6, 17, 9, 20, 12, 7, 15, 10].map((h, k) => (
                        <span key={k} style={{ width: 2.5, height: h, background: '#0d2d5e', borderRadius: 2, display: 'inline-block' }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#0b2948', fontWeight: 700, marginTop: 10 }}>Listen</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== TEAM (Swimmers) ===== */}
      {tab === 'team' && (() => {
        const secTitle = (icon, text) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '28px 0 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>{icon}</span>
              <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
            </div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0b2948', margin: 0 }}>{text}</h3>
            <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
          </div>
        )
        const waveHeights = [7, 12, 5, 15, 9, 17, 6, 13, 8, 16, 5, 11, 14, 7, 18, 10, 5, 13, 7, 15, 9, 6, 12, 8]
        const listenRow = (label) => (
          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0d2d5e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', boxShadow: '0 2px 6px rgba(11,41,72,.25)' }}>
                <div style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '10px solid #fff', marginLeft: 3 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 20 }}>
                {waveHeights.map((h, k) => (
                  <span key={k} style={{ width: 2, height: h, background: '#0d2d5e', borderRadius: 2, display: 'inline-block' }} />
                ))}
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#0b2948', fontWeight: 600, marginTop: 8 }}>{label}</div>
          </div>
        )
        const coachCard = (role, i) => (
          <div key={i} style={{ borderRadius: 16, textAlign: 'center', background: '#fff', border: '1px solid #e2e9f2', boxShadow: '0 2px 12px rgba(11,41,72,.08)', padding: '14px 14px 20px', display: 'flex', flexDirection: 'column', minHeight: 370 }}>
            {/* Large rounded-square photo */}
            <div style={{ width: '100%', aspectRatio: '1 / 1.05', borderRadius: 12, background: 'linear-gradient(180deg, #e9eef4, #d4dde8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: '#8a9bb5' }}>👤</div>
            <div style={{ paddingTop: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#0b2948' }}>—</div>
              <div style={{ fontSize: 13.5, color: '#1a56a0', fontWeight: 600, marginTop: 6 }}>{role}</div>
            </div>
            {listenRow('Listen to message')}
          </div>
        )
        const swimmerCard = (s) => (
          <div key={s.id} style={{ borderRadius: 16, overflow: 'hidden', textAlign: 'center', background: '#fff', border: '1px solid #e2e9f2', boxShadow: '0 2px 12px rgba(11,41,72,.08)', padding: '22px 14px 18px', display: 'flex', flexDirection: 'column' }}>
            {/* Circular photo with navy ring */}
            <div style={{ width: 150, height: 150, borderRadius: '50%', background: 'linear-gradient(180deg, #dfe8f1, #c6d4e2)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, color: '#8a9bb5', border: '4px solid #0d2d5e', boxShadow: '0 4px 14px rgba(11,41,72,.14)' }}>🏊</div>
            {/* Info */}
            <div style={{ padding: '16px 4px 0' }}>
              <div style={{ fontWeight: 800, fontSize: 16.5, color: '#0b2948', marginBottom: 8 }}>
                <SwimmerLink id={s.id} name={s.name} />
              </div>
              <div style={{ fontSize: 13, color: '#33415c', fontWeight: 500, lineHeight: 1.6 }}>
                {s.best_event || '—'}<br />
                {s.sex === 'F' ? "Women's" : "Men's"}
              </div>
            </div>
            <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid #eef2f7' }}>
              <Link to={`/swimmers/${s.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#0b2948', fontWeight: 700, textDecoration: 'none', padding: '0 4px' }}>
                <span>View Profile</span><span style={{ color: '#1a56a0' }}>→</span>
              </Link>
            </div>
          </div>
        )
        return (
          <div style={{ padding: '0 28px 28px', background: '#eef3f9' }}>
            {/* Coaches section */}
            {secTitle('👤', 'Coaches')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginBottom: 36 }}>
              {['Head Coach', 'Assistant Coach', 'Swimming Coach', 'Conditioning Coach'].map(coachCard)}
            </div>
            {/* Swimmers section */}
            {secTitle('🏊', 'Swimmers')}
            {topSwimmers.length === 0 ? <Empty label="No swimmers" /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 18 }}>
                {topSwimmers.map(swimmerCard)}
              </div>
            )}
          </div>
        )
      })()}

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
      {tab === 'records' && <RecordsTab records={records} country={country} />}

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
