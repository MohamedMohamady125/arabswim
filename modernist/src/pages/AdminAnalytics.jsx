import { useEffect, useState } from 'react'
import {
  Eye, Users, MousePointerClick, UserPlus, Repeat, Radio,
  TrendingUp, TrendingDown,
} from 'lucide-react'
import { getAnalyticsSummary } from '../api/analytics'
import { PageHead, Loading, Empty, Seg } from '../components/ui'
import { formatNumber } from '../utils'

const NAVY = 'var(--color-accent)'
const NAVY_DARK = 'var(--color-accent-800)'
const BLUE = 'var(--color-accent-2)'
const GOLD = 'var(--asw-gold)'

/* ── Chart primitives (same flat style as Home quick stats) ─────────── */

function LineChart({ points, color = NAVY, labelEvery = 1 }) {
  const W = 640; const H = 180; const padX = 30; const padT = 20; const padB = 26
  if (points.length === 0) return null
  const vals = points.map((p) => p.value)
  const min = 0; const max = Math.max(...vals, 1)
  const x = (i) => padX + (i * (W - 2 * padX)) / Math.max(points.length - 1, 1)
  const y = (v) => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB)
  const path = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
      <polyline points={`${x(0)},${H - padB + 4} ${path} ${x(points.length - 1)},${H - padB + 4}`}
        fill="color-mix(in srgb, var(--color-accent) 8%, transparent)" stroke="none" />
      <polyline points={path} fill="none" stroke={color} strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={i}>
          {points.length <= 40 && <circle cx={x(i)} cy={y(p.value)} r="2.6" fill={color} />}
          {i % labelEvery === 0 && (
            <text x={x(i)} y={H - 8} textAnchor="middle"
              style={{ fontWeight: 600, fontSize: 9, fill: 'var(--color-neutral-600)' }}>{p.label}</text>
          )}
        </g>
      ))}
    </svg>
  )
}

function HBars({ rows, color = NAVY, labelWidth = 170 }) {
  if (rows.length === 0) return <Empty label="No data yet" />
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: labelWidth, flex: 'none', fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>
          <div style={{ flex: 1, background: 'var(--color-neutral-100)' }}>
            <div style={{ width: `${Math.max((r.value / max) * 100, 2)}%`, height: 14, background: r.color || color }} />
          </div>
          <span className="asw-num" style={{ width: 48, flex: 'none', textAlign: 'right', fontSize: 11.5, fontWeight: 800, color: NAVY_DARK }}>{formatNumber(r.value)}</span>
        </div>
      ))}
    </div>
  )
}

function Donut({ segments, size = 150, thickness = 26, centerTop, centerBot }) {
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
        style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, fill: 'var(--color-accent-800)' }}>{centerTop}</text>
      {centerBot && (
        <text x="50%" y="61%" textAnchor="middle"
          style={{ fontWeight: 700, fontSize: 8.5, letterSpacing: '0.09em', fill: 'var(--color-neutral-600)' }}>{centerBot}</text>
      )}
    </svg>
  )
}

function Panel({ title, children, style }) {
  return (
    <div className="qs-panel" style={style}>
      {title && <div className="qs-panel-title">{title}</div>}
      {children}
    </div>
  )
}

function Growth({ pct }) {
  if (pct === null || pct === undefined) return null
  const up = pct >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className="asw-num" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 800, color: up ? 'var(--asw-fast, #0d7a52)' : 'var(--asw-slow, #b3261e)' }}>
      <Icon size={12} /> {up ? '+' : ''}{pct}%
    </span>
  )
}

function StatChip({ icon: Icon, value, label, growth, color = NAVY }) {
  return (
    <div className="qs-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '14px 8px', textAlign: 'center' }}>
      <Icon size={20} style={{ color }} />
      <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, color: NAVY_DARK, lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>{label}</span>
      {growth !== undefined && <Growth pct={growth} />}
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────────────── */

const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
]

export default function AdminAnalytics() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getAnalyticsSummary(days)
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [days])

  if (loading && !data) return <Loading label="Loading analytics" />
  if (!data) return <Empty label="Could not load analytics" />

  const t = data.totals
  const deviceColors = { desktop: NAVY, mobile: GOLD, tablet: BLUE }
  const labelEvery = data.daily.length > 45 ? 30 : data.daily.length > 14 ? 7 : 1
  const shortDate = (iso) => {
    const d = new Date(iso + 'T00:00:00')
    return `${d.getDate()}/${d.getMonth() + 1}`
  }
  const totalRefViews = data.direct_views + data.referrers.reduce((s, r) => s + r.views, 0)

  return (
    <div className="asw-fade-up">
      <PageHead kicker="Admin" title="Website Analytics" />

      <div className="pad" style={{ display: 'grid', gap: 16 }}>
        {/* Range picker + live */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Seg options={RANGES} value={days} onChange={(v) => setDays(Number(v))} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginLeft: 'auto', fontSize: 12.5, fontWeight: 700 }}>
            <Radio size={14} style={{ color: 'var(--asw-fast, #0d7a52)' }} />
            <span className="asw-num" style={{ fontWeight: 800, color: NAVY_DARK }}>{t.live_visitors}</span>
            online now (last 5 min)
          </span>
        </div>

        {/* Totals */}
        <div className="qs-cards-8">
          <StatChip icon={Eye} value={formatNumber(t.views)} label="Page Views" growth={t.views_growth} />
          <StatChip icon={Users} value={formatNumber(t.visitors)} label="Unique Visitors" growth={t.visitors_growth} color={GOLD} />
          <StatChip icon={MousePointerClick} value={formatNumber(t.sessions)} label="Visits (Sessions)" />
          <StatChip icon={UserPlus} value={formatNumber(t.new_visitors)} label="New Visitors" color={GOLD} />
          <StatChip icon={Repeat} value={formatNumber(t.returning_visitors)} label="Returning" />
          <StatChip icon={TrendingUp} value={t.views_per_visitor} label="Views / Visitor" color={GOLD} />
          <StatChip icon={Eye} value={formatNumber(t.views_today)} label="Views Today" />
          <StatChip icon={Users} value={formatNumber(t.visitors_today)} label="Visitors Today" color={GOLD} />
        </div>

        {/* Daily traffic */}
        <Panel title={`Daily Traffic — Last ${data.days} Days`}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 6, fontSize: 11.5, fontWeight: 600 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: NAVY }} /> Views</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: GOLD }} /> Visitors</span>
          </div>
          <LineChart labelEvery={labelEvery}
            points={data.daily.map((d) => ({ label: shortDate(d.date), value: d.views }))} />
          <LineChart color={GOLD} labelEvery={labelEvery}
            points={data.daily.map((d) => ({ label: shortDate(d.date), value: d.visitors }))} />
        </Panel>

        {/* Pages + sources */}
        <div className="qs-perf-2">
          <Panel title="Most Visited Pages">
            <HBars rows={data.top_pages.map((p) => ({ label: p.path, value: p.views }))} />
          </Panel>
          <Panel title="Traffic Sources">
            <HBars color={BLUE} rows={[
              { label: 'Direct / typed in', value: data.direct_views, color: NAVY },
              ...data.referrers.map((r) => ({ label: r.referrer, value: r.views })),
            ].filter((r) => r.value > 0)} />
            {totalRefViews === 0 && <Empty label="No traffic yet" />}
          </Panel>
        </div>

        {/* Devices / browsers / countries */}
        <div className="qs-cols-3">
          <Panel title="Devices">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Donut
                segments={data.devices.map((d) => ({ label: d.device, value: d.views, color: deviceColors[d.device] || BLUE }))}
                centerTop={formatNumber(t.views)} centerBot="VIEWS" />
              <div style={{ display: 'grid', gap: 7 }}>
                {data.devices.map((d) => (
                  <span key={d.device} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, textTransform: 'capitalize' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: deviceColors[d.device] || BLUE }} />
                    {d.device}
                    <span className="asw-num" style={{ marginLeft: 6, fontWeight: 800, color: NAVY_DARK }}>
                      {Math.round((d.views / (t.views || 1)) * 100)}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </Panel>
          <Panel title="Browsers">
            <HBars labelWidth={110} rows={data.browsers.map((b) => ({ label: b.browser, value: b.views }))} />
          </Panel>
          <Panel title="Countries">
            {data.countries.length > 0
              ? <HBars labelWidth={110} color={GOLD} rows={data.countries.map((c) => ({ label: c.country, value: c.views }))} />
              : <Empty label="Country data appears once the site runs behind the CDN" />}
          </Panel>
        </div>

        {/* Hourly */}
        <Panel title="Traffic by Hour of Day">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3 }}>
            {(() => {
              const max = Math.max(...data.hourly.map((h) => h.views), 1)
              return data.hourly.map((h) => (
                <div key={h.hour} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <div title={`${h.hour}:00 — ${h.views} views`}
                    style={{ width: '100%', maxWidth: 20, height: Math.max(3, Math.round((h.views / max) * 110)), background: h.views ? NAVY : 'var(--color-neutral-200)' }} />
                  <span style={{ fontSize: 8, fontWeight: 600, color: 'var(--color-neutral-600)' }}>{h.hour % 3 === 0 ? h.hour : ''}</span>
                </div>
              ))
            })()}
          </div>
          <div className="micro" style={{ marginTop: 6, textAlign: 'center' }}>Hours are in UTC</div>
        </Panel>
      </div>
    </div>
  )
}
