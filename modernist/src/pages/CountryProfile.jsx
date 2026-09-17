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

// ─── Statistics dashboard (blue-themed cards matching ISF design) ───
const S = {
  bg: 'linear-gradient(180deg, #091e3a 0%, #0c2d54 40%, #0e3668 100%)',
  card: { background: '#fff', borderRadius: 12, padding: '20px 22px', boxShadow: '0 3px 15px rgba(0,0,0,.15)', borderLeft: '4px solid #1a56a0', position: 'relative' },
  title: { fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 14, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#0b2948', display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.2 },
  sub: { fontSize: 10.5, color: '#7a8ca0', marginBottom: 14, marginTop: 3, lineHeight: 1.3 },
  viewAll: { fontSize: 10, color: '#4a90d9', fontWeight: 700, marginLeft: 'auto', cursor: 'pointer', textDecoration: 'none', textTransform: 'none', letterSpacing: '0.03em' },
  rankBadge: (i) => ({
    width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, color: '#fff',
    background: i === 0 ? '#0b2948' : i === 1 ? '#1a4a7a' : i === 2 ? '#2d6aaa' : '#b0bec5',
    flexShrink: 0, boxShadow: i < 3 ? '0 1px 3px rgba(0,0,0,.2)' : 'none',
  }),
  medalCircle: (color) => ({
    width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, color: '#fff', background: color, flexShrink: 0,
    boxShadow: '0 1px 3px rgba(0,0,0,.15)',
  }),
  th: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a9bb5', padding: '8px 0', borderBottom: '2px solid #e2e8f0' },
  row: (i) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f0f3f7', fontSize: 13, background: i % 2 === 1 ? '#fafbfd' : 'transparent' }),
  photo: { width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg, #e8edf3, #d0d8e4)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#8a9bb5', border: '2px solid #e2e8f0' },
}
const PERF_BAR_COLORS = ['#e63946', '#f4845f', '#f7b731', '#f5d547', '#2ecc71', '#27ae60', '#3b9dd6', '#2471a3', '#7d3c98']

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
    { label: 'World-Class', range: '(900+)', min: 900, max: Infinity },
    { label: 'Int\'l Elite', range: '(800-899)', min: 800, max: 900 },
    { label: 'High Perf', range: '(700-799)', min: 700, max: 800 },
    { label: 'Advanced', range: '(600-699)', min: 600, max: 700 },
    { label: 'Competitive', range: '(500-599)', min: 500, max: 600 },
    { label: 'Developing', range: '(400-499)', min: 400, max: 500 },
    { label: 'Foundation', range: '(300-399)', min: 300, max: 400 },
    { label: 'Novice', range: '(200-299)', min: 200, max: 300 },
    { label: 'Entry', range: '(100-199)', min: 100, max: 200 },
  ]
  const perfDist = perfTiers.map((t) => ({
    ...t, count: topSwimmers.filter((s) => s.best_fina >= t.min && s.best_fina < t.max).length,
  }))
  const maxPerf = Math.max(...perfDist.map((d) => d.count), 1)

  const partByClass = {}
  participated.forEach((c) => { partByClass[c.classification || 'Other'] = (partByClass[c.classification || 'Other'] || 0) + 1 })
  const participationList = Object.entries(partByClass).sort((a, b) => b[1] - a[1])
  const maxPart = Math.max(...participationList.map(([, n]) => n), 1)

  const maxHosted = Math.max(...hosted.map(() => 1), 1)

  const topPerfTable = (list) => (
    <>
      <STableHead cols={[['', 20], ['Swimmer'], ['Event', 130], ['Time', 65, 'right'], ['Pts', 40, 'right']]} />
      {list.map((s, i) => (
        <RankedRow key={s.id} rank={i + 1} idx={i}>
          <Flag code={s.nationality_code || country.code} style={{ width: 20, height: 14 }} />
          <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}><SwimmerLink id={s.id} name={s.name} /></span>
          <span style={{ width: 130, color: '#6b7d94', fontSize: 11.5 }}>{s.best_event}</span>
          <span className="asw-num" style={{ width: 65, textAlign: 'right', fontWeight: 800, color: '#0b2948', fontSize: 13 }}>{s.best_time}</span>
          <span className="asw-num" style={{ width: 40, textAlign: 'right', fontWeight: 900, color: '#1a56a0', fontSize: 14 }}>{s.best_fina}</span>
        </RankedRow>
      ))}
    </>
  )

  const decoratedTable = (list) => (
    <>
      <STableHead cols={[['Swimmer'], ['🥇', 30, 'center'], ['🥈', 30, 'center'], ['🥉', 30, 'center'], ['Total', 44, 'center']]} />
      {list.map((m, i) => (
        <RankedRow key={m.id ?? i} rank={i + 1} idx={i}>
          <span style={{ flex: 1, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Flag code={m.nationality_code || country.code} />
            <SwimmerLink id={m.id} name={m.name} />
          </span>
          <span style={S.medalCircle('#d4af37')}>{m.gold}</span>
          <span style={S.medalCircle('#a8a9ad')}>{m.silver}</span>
          <span style={S.medalCircle('#cd7f32')}>{m.bronze}</span>
          <span className="asw-num" style={{ width: 44, textAlign: 'center', fontWeight: 900, fontSize: 16, color: '#0b2948' }}>{m.total}</span>
        </RankedRow>
      ))}
    </>
  )

  const recordCard = (rec, label, sub) => (
    <SCard icon="🏅" title={label} subtitle={sub}>
      {rec ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0' }}>
          <div style={S.photo}>🏊</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#0b2948' }}><SwimmerLink id={rec.swimmer_id} name={rec.swimmer} /></div>
            <div style={{ fontSize: 11, color: '#7a8ca0', marginTop: 2 }}>{rec.event}</div>
            <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 32, color: '#1a56a0', marginTop: 6, letterSpacing: '-0.02em' }}>{rec.time || rec.count}</div>
            {rec.date && <div style={{ fontSize: 10, color: '#9baab8', marginTop: 2 }}>{formatDate(rec.date)}</div>}
          </div>
        </div>
      ) : <Empty label="—" />}
    </SCard>
  )

  return (
    <div style={{ background: S.bg, padding: '32px 28px' }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 28, textAlign: 'center', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff', marginBottom: 26, textShadow: '0 2px 8px rgba(0,0,0,.3)' }}>
        ★ Statistics
      </h2>

      {/* Row 1: Top Performance Male + Female */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <SCard icon="♂" title="Top Performance" subtitle={`Best Performances by ${country.name} Male Swimmers (FINA Points)`} viewAll>
          {maleTop.length ? topPerfTable(maleTop) : <Empty label="No data" />}
        </SCard>
        <SCard icon="♀" title="Top Performance" subtitle={`Best Performances by ${country.name} Female Swimmers (FINA Points)`} viewAll>
          {femaleTop.length ? topPerfTable(femaleTop) : <Empty label="No data" />}
        </SCard>
      </div>

      {/* Row 2: Participation | Championships Hosted | Most Participated */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <SCard icon="📋" title="Participation" subtitle="Total Participations by Competition" viewAll>
          {participationList.map(([cls, n]) => (
            <div key={cls} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px dotted #cbd5e1', fontSize: 13 }}>
              <span style={{ flex: 1 }}>{cls}</span>
              <span className="asw-num" style={{ fontWeight: 800, color: '#0a2d5c', fontSize: 14 }}>{n}</span>
            </div>
          ))}
        </SCard>
        <SCard icon="🏟" title="Championships Hosted" subtitle="Number of Championships Hosted" viewAll>
          {hosted.length === 0 ? <Empty label="None" /> : (() => {
            const counts = {}
            hosted.forEach((c) => { counts[c.name] = (counts[c.name] || 0) + 1 })
            const list = Object.entries(counts).sort((a, b) => b[1] - a[1])
            const mx = Math.max(...list.map(([, n]) => n), 1)
            return list.slice(0, 6).map(([name, n]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 }}>
                <span style={{ width: 140, fontSize: 11, flexShrink: 0 }}>{name}</span>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: `${(n / mx) * 100}%`, minWidth: 20, height: 20, background: 'linear-gradient(90deg, #1a56a0, #3b82f6)', borderRadius: 3 }} />
                  <span className="asw-num" style={{ fontWeight: 800, color: '#0a2d5c', fontSize: 13 }}>{n}</span>
                </div>
              </div>
            ))
          })()}
        </SCard>
        <SCard icon="🏊" title="Most Participated Swimmer" subtitle={`Top 5 ${country.name} Swimmers by Int'l Participations`} viewAll>
          <STableHead cols={[['', 20], ['Swimmer'], ['Participations', 90, 'right']]} />
          {topSwimmers.slice(0, 5).map((s, i) => (
            <RankedRow key={s.id} rank={i + 1} idx={i}>
              <Flag code={s.nationality_code || country.code} />
              <span style={{ flex: 1, fontWeight: 700 }}><SwimmerLink id={s.id} name={s.name} /></span>
              <span className="asw-num" style={{ width: 90, textAlign: 'right', fontWeight: 900, fontSize: 14, color: '#0b2948' }}>{s.championships_count || '—'}</span>
            </RankedRow>
          ))}
        </SCard>
      </div>

      {/* Row 3: Medals | Most Male Decorated | Most Female Decorated */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <SCard icon="🏅" title="Medals" subtitle="Total Medals by Competition" viewAll>
          <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 11 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={S.medalCircle('#d4af37')}>&#8203;</span> Gold</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={S.medalCircle('#a8a9ad')}>&#8203;</span> Silver</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={S.medalCircle('#cd7f32')}>&#8203;</span> Bronze</span>
          </div>
          {medalBoxes.map((m, i) => (
            <div key={m.name} style={S.row(i)}>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{m.name}</span>
              <span style={S.medalCircle('#d4af37')}>{m.gold}</span>
              <span style={S.medalCircle('#a8a9ad')}>{m.silver}</span>
              <span style={S.medalCircle('#cd7f32')}>{m.bronze}</span>
              <span className="asw-num" style={{ width: 36, textAlign: 'center', fontWeight: 900, fontSize: 15, color: '#0b2948' }}>{m.total}</span>
            </div>
          ))}
        </SCard>
        <SCard icon="♂" title="Most Male Decorated" subtitle={`Top 5 ${country.name} Male Swimmers by Total Medals`} viewAll>
          {maleMedalists.length ? decoratedTable(maleMedalists) : <Empty label="No data" />}
        </SCard>
        <SCard icon="♀" title="Most Female Decorated" subtitle={`Top 5 ${country.name} Female Swimmers by Total Medals`} viewAll>
          {femaleMedalists.length ? decoratedTable(femaleMedalists) : <Empty label="No data" />}
        </SCard>
      </div>

      {/* Row 4: Last Records + Most Recordmen */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        {recordCard(lastMR, 'Last Male Record', `Most Recent ${country.name} Male Record`)}
        {recordCard(lastFR, 'Last Female Record', `Most Recent ${country.name} Female Record`)}
        <SCard icon="🏅" title="Most Male Recordman" subtitle={`Top ${country.name} Male by Records`} viewAll>
          {topMaleRec ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0' }}>
              <div style={S.photo}>🏊</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#0b2948' }}><SwimmerLink id={topMaleRec.id} name={topMaleRec.name} /></div>
                <div style={{ fontSize: 11, color: '#7a8ca0', marginTop: 2 }}>Total Records</div>
                <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 36, color: '#1a56a0', marginTop: 4 }}>{topMaleRec.count}</div>
              </div>
            </div>
          ) : <Empty label="—" />}
        </SCard>
        <SCard icon="🏅" title="Most Female Recordman" subtitle={`Top ${country.name} Female by Records`} viewAll>
          {topFemaleRec ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0' }}>
              <div style={S.photo}>🏊</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#0b2948' }}><SwimmerLink id={topFemaleRec.id} name={topFemaleRec.name} /></div>
                <div style={{ fontSize: 11, color: '#7a8ca0', marginTop: 2 }}>Total Records</div>
                <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 36, color: '#1a56a0', marginTop: 4 }}>{topFemaleRec.count}</div>
              </div>
            </div>
          ) : <Empty label="—" />}
        </SCard>
      </div>

      {/* Row 5: Performance Index + Country Battle */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
        <SCard icon="📊" title="Performance Index" subtitle={`Distribution of ${country.name} Swimmers by Performance Level`} viewAll>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 200, padding: '0 4px' }}>
            {perfDist.map((d, i) => (
              <div key={d.label} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                {d.count > 0 && <div className="asw-num" style={{ fontSize: 13, fontWeight: 900, marginBottom: 4, color: '#0a2d5c' }}>{d.count}</div>}
                <div style={{ width: '80%', height: `${Math.max(6, (d.count / maxPerf) * 150)}px`, background: PERF_BAR_COLORS[i], borderRadius: '4px 4px 0 0' }} />
                <div style={{ fontSize: 8, marginTop: 6, lineHeight: 1.15, color: '#475569', fontWeight: 700 }}>{d.label}</div>
                <div style={{ fontSize: 7, color: '#94a3b8' }}>{d.range}</div>
              </div>
            ))}
          </div>
        </SCard>
        <SCard icon="⚔" title="Country Battle" subtitle="Number of Swimmers in the Top 100 Arab Ranking" viewAll>
          <Empty label="Coming soon" />
        </SCard>
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
