import { Link } from 'react-router-dom'
import {
  Globe, Users, Shield, Waves, ClipboardList, Medal as MedalIcon, Trophy,
  TrendingUp, CheckCircle2, Flag as FlagIcon, Award, Timer,
} from 'lucide-react'
import Flag from './Flag'
import { Empty } from './ui'
import { formatNumber } from '../utils'

const NAVY = 'var(--color-accent)'
const NAVY_DARK = 'var(--color-accent-800)'
const BLUE = 'var(--color-accent-2)'
const GOLD = 'var(--asw-gold)'
const SILVER = 'var(--asw-silver)'
const BRONZE = 'var(--asw-bronze)'

/* ── Tiny chart primitives (flat SVG/CSS, site palette) ─────────────── */

function VBars({ data, color = NAVY, height = 140 }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span className="asw-num" style={{ fontSize: 11, fontWeight: 800, color: NAVY_DARK }}>{d.value}</span>
          <div style={{ width: '100%', maxWidth: 26, height: Math.max(3, Math.round((d.value / max) * height)), background: d.color || color }} />
          <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--color-neutral-600)', textAlign: 'center', lineHeight: 1.25, overflowWrap: 'anywhere' }}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

function Donut({ segments, size = 156, thickness = 27, centerTop, centerBot }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  const r = (size - thickness) / 2
  const C = 2 * Math.PI * r
  let acc = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-neutral-100)" strokeWidth={thickness} />
      {segments.map((s, i) => {
        const frac = s.value / total
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color}
            strokeWidth={thickness} strokeDasharray={`${frac * C} ${C}`}
            strokeDashoffset={-acc * C} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <title>{`${s.label}: ${s.value}`}</title>
          </circle>
        )
        acc += frac
        return el
      })}
      <text x="50%" y={centerBot ? '48%' : '54%'} textAnchor="middle"
        style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, fill: 'var(--color-accent-800)' }}>{centerTop}</text>
      {centerBot && (
        <text x="50%" y="61%" textAnchor="middle"
          style={{ fontWeight: 700, fontSize: 8.5, letterSpacing: '0.09em', fill: 'var(--color-neutral-600)' }}>{centerBot}</text>
      )}
    </svg>
  )
}

function LineChart({ points, color = NAVY }) {
  const W = 340; const H = 150; const padX = 26; const padT = 24; const padB = 26
  const vals = points.map((p) => p.value)
  const min = Math.min(...vals); const max = Math.max(...vals)
  const span = (max - min) || 1
  const x = (i) => padX + (i * (W - 2 * padX)) / Math.max(points.length - 1, 1)
  const y = (v) => padT + (1 - (v - min) / span) * (H - padT - padB)
  const path = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
      <polyline points={`${x(0)},${H - padB + 4} ${path} ${x(points.length - 1)},${H - padB + 4}`}
        fill="color-mix(in srgb, var(--color-accent) 8%, transparent)" stroke="none" />
      <polyline points={path} fill="none" stroke={color} strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="3.5" fill={color} />
          <text x={x(i)} y={y(p.value) - 8} textAnchor="middle"
            style={{ fontWeight: 800, fontSize: 11, fill: 'var(--color-accent-800)' }}>{p.value}</text>
          <text x={x(i)} y={H - 8} textAnchor="middle"
            style={{ fontWeight: 600, fontSize: 9.5, fill: 'var(--color-neutral-600)' }}>{p.label}</text>
        </g>
      ))}
    </svg>
  )
}

function HBars({ rows, color = NAVY }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 150, flex: 'none', fontSize: 11, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>
          <div style={{ flex: 1, background: 'var(--color-neutral-100)' }}>
            <div style={{ width: `${Math.max((r.value / max) * 100, 2)}%`, height: 14, background: r.color || color }} />
          </div>
          <span className="asw-num" style={{ width: 34, flex: 'none', textAlign: 'right', fontSize: 11.5, fontWeight: 800, color: NAVY_DARK }}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function MedalStack({ rows }) {
  const max = Math.max(...rows.map((r) => r.total), 1)
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {rows.map((r) => (
        <div key={r.code} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 34, flex: 'none', fontSize: 11, fontWeight: 800, color: NAVY_DARK }}>{r.code}</span>
          <div style={{ flex: 1, display: 'flex', height: 15 }}>
            <div style={{ display: 'flex', width: `${(r.total / max) * 100}%`, minWidth: 8 }}>
              {[['gold', GOLD, '#3a2e07'], ['silver', SILVER, '#fff'], ['bronze', BRONZE, '#fff']].map(([k, bg, fg]) => (
                r[k] > 0 ? (
                  <div key={k} title={`${k}: ${r[k]}`}
                    style={{ flex: r[k], background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: fg }}>{r[k]}</span>
                  </div>
                ) : null
              ))}
            </div>
          </div>
          <span className="asw-num" style={{ width: 30, flex: 'none', textAlign: 'right', fontSize: 11.5, fontWeight: 800, color: NAVY_DARK }}>{r.total}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Layout bits ────────────────────────────────────────────────────── */

function Panel({ title, children, style }) {
  return (
    <div className="qs-panel" style={style}>
      {title && <div className="qs-panel-title">{title}</div>}
      {children}
    </div>
  )
}

function SectionBar({ n, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 2px' }}>
      <span style={{ width: 24, height: 24, borderRadius: '50%', background: NAVY, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flex: 'none' }}>{n}</span>
      <h2 style={{ margin: 0, fontSize: 16, letterSpacing: '0.06em', textTransform: 'uppercase', color: NAVY_DARK }}>{title}</h2>
      <span style={{ flex: 1, height: 1, background: 'var(--color-divider)' }} />
    </div>
  )
}

function StatChip({ icon: Icon, value, label }) {
  return (
    <div style={{
      background: 'linear-gradient(150deg, var(--color-accent-600), var(--color-accent-900))',
      color: '#fff', padding: '14px 8px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }}>
      <Icon size={18} style={{ color: 'rgba(255,255,255,0.7)' }} />
      <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>{label}</span>
    </div>
  )
}

function LegendDot({ color, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600 }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flex: 'none' }} />
      {children}
    </span>
  )
}

function PerfCard({ title, value, unit, name, code, event, gold = false }) {
  return (
    <div style={{ background: 'linear-gradient(150deg, var(--color-accent-600), var(--color-accent-900))', color: '#fff', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 128 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', lineHeight: 1.35 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontSize: 30, fontWeight: 800, color: gold ? GOLD : '#fff', lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>{unit}</span>}
        {gold && <span style={{ fontSize: 20, marginLeft: 4 }}>🥇</span>}
      </div>
      <div style={{ marginTop: 'auto', fontSize: 11, fontWeight: 700, lineHeight: 1.3 }}>
        {name}{code ? ` (${code})` : ''}
        {event && <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{event}</div>}
      </div>
    </div>
  )
}

function ProgressRow({ icon: Icon, label, value }) {
  return (
    <div className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' }}>
      <Icon size={15} style={{ color: NAVY, flex: 'none' }} />
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
      <span className="asw-num" style={{ marginLeft: 'auto', fontSize: 13.5, fontWeight: 800, color: NAVY_DARK }}>{value}</span>
    </div>
  )
}

/* ── Shared Quick Statistics body (home page + meet Overview tab) ───── */

export default function QuickStatsView({ data, busiest }) {
  const { counts, participation, medals, performance: perf, records, progress } = data
  const mf = participation.male + participation.female || 1
  const malePct = Math.round((participation.male / mf) * 1000) / 10
  const femalePct = Math.round(1000 - malePct * 10) / 10

  // Medal share: top 4 countries + others
  const shareColors = [NAVY, BLUE, GOLD, 'var(--color-accent-400)']
  const shareTop = medals.table.slice(0, 4).map((r, i) => ({ label: r.code, value: r.total, color: shareColors[i] }))
  const othersTotal = medals.table.slice(4).reduce((s, r) => s + r.total, 0)
  const shareSegs = othersTotal > 0 ? [...shareTop, { label: 'Others', value: othersTotal, color: 'var(--color-neutral-300)' }] : shareTop

  const recCounters = [{ label: 'Total Records', count: records.total, color: NAVY_DARK }].concat(
    records.by_type.slice(0, 5).map((t, i) => ({
      label: `${t.label} Records`, count: t.count,
      color: [NAVY, BLUE, GOLD, 'var(--color-accent-500)', BRONZE][i % 5],
    })))

  const chips = [
    [Globe, counts.countries, 'Countries'],
    [Users, counts.swimmers, 'Swimmers'],
    [Shield, counts.clubs, 'Clubs / Teams'],
    [Waves, counts.events, 'Events'],
    [ClipboardList, formatNumber(counts.results), 'Results'],
    [MedalIcon, counts.medals, 'Medals'],
    [Trophy, counts.records, 'Records'],
    [TrendingUp, formatNumber(counts.personal_bests), 'Personal Bests'],
  ]

  return (
    <div className="container" style={{ display: 'grid', gap: 16, padding: '18px 16px 40px' }}>
      {/* ── Stat chips ── */}
      <div className="qs-cards-8">
        {chips.map(([Icon, value, label], i) => <StatChip key={label} icon={Icon} value={value} label={label} color={i % 2 ? GOLD : NAVY} />)}
      </div>

      {/* ── 1 · Participation ── */}
      <SectionBar n={1} title="Participation" />
      <div className="qs-cols-3">
        {(participation.by_club || []).length > 0 ? (
          /* National/Other meets: one shared flag — entries by CLUB instead */
          <Panel title="Swimmers by Club">
            <HBars rows={participation.by_club.map((c) => ({ label: c.name, value: c.count }))} />
          </Panel>
        ) : (
          <Panel title="Swimmers by Country (Top 8)">
            <VBars data={participation.by_country.map((c) => ({ label: c.code, value: c.count }))} />
          </Panel>
        )}
        <Panel title="Male vs Female">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'right' }}>
              <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 800, color: NAVY }}>{malePct}%</div>
              <div className="asw-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-neutral-600)' }}>{participation.male}</div>
            </div>
            <Donut segments={[
              { label: 'Male', value: participation.male, color: NAVY },
              { label: 'Female', value: participation.female, color: GOLD },
            ]} centerTop={counts.swimmers} centerBot="SWIMMERS" />
            <div>
              <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 800, color: GOLD }}>{femalePct}%</div>
              <div className="asw-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-neutral-600)' }}>{participation.female}</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 10 }}>
            <LegendDot color={NAVY}>Male ({participation.male})</LegendDot>
            <LegendDot color={GOLD}>Female ({participation.female})</LegendDot>
          </div>
        </Panel>
        <Panel title="Entries by Age Group">
          {participation.age_groups
            ? <VBars data={participation.age_groups.map((g) => ({ label: g.label, value: g.count }))} color={BLUE} />
            : <Empty label="Age data not available" />}
        </Panel>
      </div>

      {/* ── Busiest swimmers (meet Overview tab only) ── */}
      {(busiest || []).length > 0 && (
        <Panel title="Busiest Swimmers (Most Races)">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-neutral-600)' }}>
                  <th style={{ textAlign: 'left', paddingBottom: 6 }}>#</th>
                  <th style={{ textAlign: 'left', paddingBottom: 6 }}>Swimmer</th>
                  <th style={{ textAlign: 'center', paddingBottom: 6 }}>Swims</th>
                  <th style={{ textAlign: 'center', paddingBottom: 6 }}>Events</th>
                  <th style={{ textAlign: 'right', paddingBottom: 6 }}>Best FINA</th>
                </tr>
              </thead>
              <tbody>
                {busiest.map((s, i) => (
                  <tr key={s.swimmer_id} className="hair-t">
                    <td className="asw-num" style={{ padding: '7px 0', fontWeight: 700, color: 'var(--color-neutral-600)' }}>{i + 1}</td>
                    <td style={{ padding: '7px 0' }}>
                      <Link to={`/swimmers/${s.swimmer_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 700, color: 'inherit', textDecoration: 'none' }}>
                        <Flag code={s.nationality_code} name={s.nationality} /> {s.swimmer_name}
                      </Link>
                    </td>
                    <td className="asw-num" style={{ textAlign: 'center', fontWeight: 800, color: NAVY_DARK }}>{s.swims}</td>
                    <td className="asw-num" style={{ textAlign: 'center', fontWeight: 700 }}>{s.events_count}</td>
                    <td className="asw-num" style={{ textAlign: 'right', fontWeight: 700 }}>{s.best_fina ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ── 2 · Medals ── */}
      <SectionBar n={2} title="Medals" />
      <div className="qs-cols-3">
        <Panel title="Medal Table – Top 5">
          <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-neutral-600)' }}>
                <th style={{ textAlign: 'left', paddingBottom: 6 }}>#</th>
                <th style={{ textAlign: 'left', paddingBottom: 6 }}>Country</th>
                {[GOLD, SILVER, BRONZE].map((c, i) => (
                  <th key={i} style={{ paddingBottom: 6 }}><span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: '50%', background: c }} /></th>
                ))}
                <th style={{ textAlign: 'right', paddingBottom: 6 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {medals.table.slice(0, 5).map((r, i) => (
                <tr key={r.code} className="hair-t">
                  <td className="asw-num" style={{ padding: '7px 0', fontWeight: 700, color: 'var(--color-neutral-600)' }}>{i + 1}</td>
                  <td style={{ padding: '7px 0' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 800 }}>
                      <Flag code={r.code} name={r.name} /> {r.code}
                    </span>
                  </td>
                  <td className="asw-num" style={{ textAlign: 'center', fontWeight: 700 }}>{r.gold}</td>
                  <td className="asw-num" style={{ textAlign: 'center', fontWeight: 700 }}>{r.silver}</td>
                  <td className="asw-num" style={{ textAlign: 'center', fontWeight: 700 }}>{r.bronze}</td>
                  <td className="asw-num" style={{ textAlign: 'right', fontWeight: 800, color: NAVY_DARK }}>{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <Link to="/medals" style={{ fontSize: 12, fontWeight: 700 }}>View full medal table →</Link>
          </div>
        </Panel>
        <Panel title="Medals by Country (Top 10)">
          <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
            <LegendDot color={GOLD}>Gold</LegendDot>
            <LegendDot color={SILVER}>Silver</LegendDot>
            <LegendDot color={BRONZE}>Bronze</LegendDot>
          </div>
          <MedalStack rows={medals.table.slice(0, 10)} />
        </Panel>
        <Panel title="Medal Share by Country">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Donut segments={shareSegs} centerTop={medals.total} centerBot="TOTAL MEDALS" />
            <div style={{ display: 'grid', gap: 7 }}>
              {shareSegs.map((s) => (
                <LegendDot key={s.label} color={s.color}>
                  {s.label}
                  <span className="asw-num" style={{ marginLeft: 8, fontWeight: 800, color: NAVY_DARK }}>
                    {Math.round((s.value / (medals.total || 1)) * 100)}%
                  </span>
                </LegendDot>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* ── 3 · Performance ── */}
      <SectionBar n={3} title="Performance" />
      <div className="qs-perf-6">
        {perf.best_overall && (
          <PerfCard title="Best Performance of Championships" value={perf.best_overall.points} unit="Points"
            name={perf.best_overall.name} code={perf.best_overall.code} event={perf.best_overall.event} />
        )}
        {perf.best_male && (
          <PerfCard title="Best Male Performance" value={perf.best_male.points} unit="Points"
            name={perf.best_male.name} code={perf.best_male.code} event={perf.best_male.event} />
        )}
        {perf.best_female && (
          <PerfCard title="Best Female Performance" value={perf.best_female.points} unit="Points"
            name={perf.best_female.name} code={perf.best_female.code} event={perf.best_female.event} />
        )}
        {perf.most_golds && (
          <PerfCard title="Most Gold Medals" value={perf.most_golds.count} unit="Gold" gold
            name={perf.most_golds.name} code={perf.most_golds.code} />
        )}
        {perf.most_pbs && (
          <PerfCard title="Most Personal Bests" value={perf.most_pbs.count} unit="PBs"
            name={perf.most_pbs.name} code={perf.most_pbs.code} />
        )}
        {perf.biggest_improvement && (
          <PerfCard title="Biggest Improvement" value={`−${perf.biggest_improvement.seconds}`} unit="Seconds"
            name={perf.biggest_improvement.name} code={perf.biggest_improvement.code}
            event={perf.biggest_improvement.event} />
        )}
      </div>
      {(perf.top5.length > 0 || perf.points_by_day) && (
        <div className="qs-perf-2">
          {perf.top5.length > 0 && (
            <Panel title="Top 5 Performances (by Points)">
              <HBars color="var(--color-accent-500)" rows={perf.top5.map((t) => ({
                label: `${t.name} (${t.code}) – ${t.event}`, value: t.points,
              }))} />
            </Panel>
          )}
          {perf.points_by_day && (
            <Panel title="Average Points by Day">
              <LineChart points={perf.points_by_day.map((p) => ({ label: `Day ${p.day}`, value: p.avg }))} />
            </Panel>
          )}
        </div>
      )}

      {/* ── 4 · Records + 5 · Progress ── */}
      <div className="qs-main-2">
        <div style={{ display: 'grid', gap: 14 }}>
          <SectionBar n={4} title="Records" />
          <div className="qs-rec-counters">
            {recCounters.map((c) => (
              <div key={c.label} className="qs-panel" style={{ padding: '12px 8px', textAlign: 'center' }}>
                <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 800, color: c.color }}>{c.count}</div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-600)', marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>
          {(records.by_day || records.by_country.length > 0) && (
            <div className="qs-rec-charts">
              {records.by_day && (
                <Panel title="Records by Day (Cumulative)">
                  <LineChart points={records.by_day.map((p) => ({ label: `Day ${p.day}`, value: p.cumulative }))} />
                </Panel>
              )}
              {records.by_country.length > 0 && (
                <Panel title="Records by Country">
                  <HBars rows={records.by_country.map((r) => ({ label: r.code, value: r.count }))} color="var(--color-accent-500)" />
                </Panel>
              )}
            </div>
          )}
          {records.total === 0 && (
            <Panel><Empty label="No records were broken at this meet" /></Panel>
          )}
        </div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <SectionBar n={5} title="Championship Progress" />
          <Panel>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <Donut segments={[
                { label: 'Completed', value: progress.percent, color: BLUE },
                { label: 'Remaining', value: Math.max(100 - progress.percent, 0), color: 'var(--color-neutral-200)' },
              ]} centerTop={`${progress.percent}%`} centerBot="COMPLETED" />
            </div>
            <ProgressRow icon={CheckCircle2} label="Events Completed" value={`${progress.events_completed} / ${progress.events_total}`} />
            <ProgressRow icon={FlagIcon} label="Finals Completed" value={progress.finals_completed} />
            <ProgressRow icon={Timer} label="Heats Completed" value={progress.heats_completed} />
            <ProgressRow icon={Trophy} label="Records Broken" value={progress.records_broken} />
            <ProgressRow icon={Award} label="Medals Awarded" value={progress.medals_awarded} />
          </Panel>
        </div>
      </div>
    </div>
  )
}
