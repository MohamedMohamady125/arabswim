import { useState } from 'react'
import { Empty, Seg } from '../ui'
import { CLASSIFICATIONS } from './MeetsTab'

const GOLD = 'var(--asw-gold)'
const SILVER = 'var(--asw-silver)'
const BRONZE = 'var(--asw-bronze)'
const GOLD_HEX = '#b98a1e'
const SILVER_HEX = '#7d8a99'
const BRONZE_HEX = '#a05f2c'
const NAVY = '#1c4e86'

function PercentRing({ pct, color, title, desc }) {
  const r = 46
  const C = 2 * Math.PI * r
  return (
    <div className="rule-t" style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div className="kicker" style={{ textAlign: 'center' }}>{title}</div>
      <div style={{ position: 'relative', width: 128, height: 128 }}>
        <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-neutral-300)" strokeWidth="12" />
          <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="12"
            strokeDasharray={`${(pct / 100) * C} ${C}`} />
        </svg>
        <span className="asw-num" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
          <span style={{ fontSize: 30 }}>{pct}</span><span style={{ fontSize: 15 }}>%</span>
        </span>
      </div>
      <div className="micro" style={{ textAlign: 'center', maxWidth: 200 }}>{desc}</div>
    </div>
  )
}

/* Flat medal donut with a centred total and a label underneath */
function MedalDonut({ counts, label, size = 160 }) {
  const r = 44
  const C = 2 * Math.PI * r
  let acc = 0
  const segs = [
    { key: 'gold', n: counts.gold, color: GOLD_HEX },
    { key: 'silver', n: counts.silver, color: SILVER_HEX },
    { key: 'bronze', n: counts.bronze, color: BRONZE_HEX },
  ].map((s) => {
    const frac = counts.total > 0 ? s.n / counts.total : 0
    const seg = { ...s, dash: frac * C, offset: -acc * C }
    acc += frac
    return seg
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 'none' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          {counts.total === 0 && (
            <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-neutral-300)" strokeWidth="22" />
          )}
          {segs.map((s) => s.n > 0 && (
            <circle key={s.key} cx="60" cy="60" r={r} fill="none" stroke={s.color} strokeWidth="22"
              strokeDasharray={`${s.dash} ${C}`} strokeDashoffset={s.offset} />
          ))}
        </svg>
        <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: size >= 160 ? 32 : 26, lineHeight: 1 }}>{counts.total}</span>
          <span className="micro">Total</span>
        </span>
      </div>
      <span className="micro" style={{ textAlign: 'center' }}>{label}</span>
    </div>
  )
}

export default function MedalsTab({ stats }) {
  const [cat, setCat] = useState('All')
  if (!stats) return null
  const { medals, medals_hierarchy, total_races, intl_medals } = stats
  if (!medals || medals.total === 0) return <Empty label="No medals yet" />

  // Aggregate per-competition counts from the classification hierarchy
  const compCounts = {}
  ;(medals_hierarchy || []).forEach((c) => {
    ;(c.classifications || []).forEach((cls) => {
      if (!compCounts[cls.name]) compCounts[cls.name] = { gold: 0, silver: 0, bronze: 0 }
      compCounts[cls.name].gold += cls.gold
      compCounts[cls.name].silver += cls.silver
      compCounts[cls.name].bronze += cls.bronze
    })
  })

  const hasMedals = (c) => {
    const cc = compCounts[c]
    return cc && cc.gold + cc.silver + cc.bronze > 0
  }
  const chartComps = [
    ...CLASSIFICATIONS.filter(hasMedals),
    // Classification names outside the known list still get a button
    ...Object.keys(compCounts).filter((c) => !CLASSIFICATIONS.includes(c) && hasMedals(c)),
  ]

  // Category tabs: only categories the athlete has medals in
  const isAll = cat === 'All'
  const active = isAll || !compCounts[cat]
    ? medals
    : { ...compCounts[cat], total: compCounts[cat].gold + compCounts[cat].silver + compCounts[cat].bronze }
  const catOptions = [{ value: 'All', label: 'All' }, ...chartComps.map((c) => ({ value: c, label: c }))]

  const pctOf = (n) => (active.total > 0 ? ((n / active.total) * 100).toFixed(1) : '0.0')
  const races = total_races || 0
  const medalRacePct = races > 0 ? Math.min(100, Math.round((medals.total / races) * 100)) : 0
  const goldRacePct = races > 0 ? Math.min(100, Math.round((medals.gold / races) * 100)) : 0
  const goldSharePct = active.total > 0 ? Math.round((active.gold / active.total) * 1000) / 10 : 0

  // Second donut: international-only medals (shown in the All view when
  // the athlete has any and they differ from the overall tally)
  const intlDonut = isAll && intl_medals && intl_medals.total > 0
    && intl_medals.total !== medals.total

  const statCards = [
    { title: 'Gold', img: '/medal_gold.png', n: active.gold, color: GOLD },
    { title: 'Silver', img: '/medal_silver.png', n: active.silver, color: SILVER },
    { title: 'Bronze', img: '/medal_bronze.png', n: active.bronze, color: BRONZE },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Category filter — only competitions this athlete has medals in */}
      {chartComps.length > 0 && (
        <Seg options={catOptions} value={isAll || !compCounts[cat] ? 'All' : cat} onChange={setCat} />
      )}

      {/* Medal count cards */}
      <div className="cellgrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {statCards.map((c) => (
          <div key={c.title} style={{ textAlign: 'center' }}>
            {/* single-line label so all three cards stay perfectly level on phones */}
            <div className="card-kicker" style={{ color: c.color, whiteSpace: 'nowrap' }}>{c.title}</div>
            {c.img && (
              <img src={c.img} alt={c.title} width={44} height={44} style={{ margin: '8px auto 0' }} />
            )}
            <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 40, lineHeight: 1.1, marginTop: c.img ? 4 : 24, color: c.color }}>
              {c.n}
            </div>
          </div>
        ))}
      </div>

      {/* Distribution donut + breakdown by competition */}
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'start' }}>
        <div>
          <div className="sect-head"><h4>Medal Distribution</h4></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 16, flex: 'none' }}>
              <MedalDonut counts={active} label={isAll ? 'All medals' : cat} size={intlDonut ? 140 : 160} />
              {intlDonut && (
                <MedalDonut counts={intl_medals} label="International" size={140} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              {[
                { label: 'Gold', n: active.gold, color: GOLD },
                { label: 'Silver', n: active.silver, color: SILVER },
                { label: 'Bronze', n: active.bronze, color: BRONZE },
              ].map((row) => (
                <div key={row.label} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                  <span style={{ width: 14, height: 14, background: row.color, flex: 'none' }} />
                  <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{row.label}</span>
                  <span className="asw-num" style={{ fontWeight: 700, fontSize: 15 }}>{row.n}</span>
                  <span className="asw-num" style={{ width: 60, textAlign: 'right', color: row.color, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17 }}>
                    {pctOf(row.n)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="sect-head">
            <h4>By Level</h4>
            <span className="micro">share of {medals.total} career medal{medals.total !== 1 ? 's' : ''}</span>
          </div>
          {/* One card per competition level this athlete has medals in —
              prestige order (Olympic → World → continental → National).
              Stacked G/S/B bar per level; click filters the whole tab. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chartComps.map((cls) => {
              const cc = compCounts[cls]
              const tot = cc.gold + cc.silver + cc.bronze
              const share = Math.round((tot / medals.total) * 100)
              const isSel = cls === cat
              const seg = (n, grad, title) => n > 0 && (
                <div key={title} title={`${title}: ${n}`} style={{ flex: n, background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, overflow: 'hidden' }}>
                  <span className="asw-num" style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--wa-ink)' }}>{n}</span>
                </div>
              )
              return (
                <div
                  key={cls}
                  onClick={() => setCat(isSel ? 'All' : cls)}
                  style={{
                    cursor: 'pointer', padding: '10px 12px',
                    border: '1px solid var(--color-divider)',
                    borderLeft: `3px solid ${isSel ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                    background: isSel ? 'var(--color-surface)' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7, minWidth: 0 }}>
                    <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{cls}</span>
                    <span className="asw-num micro" style={{ whiteSpace: 'nowrap' }}>{tot} medal{tot !== 1 ? 's' : ''}</span>
                    <span className="asw-num" style={{ marginLeft: 'auto', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15 }}>{share}%</span>
                  </div>
                  <div style={{ display: 'flex', height: 18, background: 'var(--color-neutral-200)' }}>
                    {seg(cc.gold, 'var(--wa-gold-head)', 'Gold')}
                    {seg(cc.silver, 'var(--wa-silver-head)', 'Silver')}
                    {seg(cc.bronze, 'var(--wa-bronze-head)', 'Bronze')}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Percentage rings — race-based rings only make sense across all meets */}
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: `repeat(${isAll ? 3 : 1}, 1fr)`, gap: 24 }}>
        {isAll && (
          <>
            <PercentRing pct={medalRacePct} color={NAVY} title="Medal-winning races"
              desc="Races that earned at least one medal" />
            <PercentRing pct={goldRacePct} color={GOLD_HEX} title="Gold-winning races"
              desc="Races that resulted in a gold medal" />
          </>
        )}
        <PercentRing pct={goldSharePct} color={GOLD_HEX} title="Gold share"
          desc="Percentage of gold medals out of total medals" />
      </div>
    </div>
  )
}
