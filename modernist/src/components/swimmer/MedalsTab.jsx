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

export default function MedalsTab({ stats }) {
  const [cat, setCat] = useState('All')
  if (!stats) return null
  const { medals, medals_hierarchy, total_races } = stats
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

  // Flat donut
  const donutR = 44
  const donutC = 2 * Math.PI * donutR
  let acc = 0
  const donutSegs = [
    { key: 'gold', n: active.gold, color: GOLD_HEX },
    { key: 'silver', n: active.silver, color: SILVER_HEX },
    { key: 'bronze', n: active.bronze, color: BRONZE_HEX },
  ].map((s) => {
    const frac = active.total > 0 ? s.n / active.total : 0
    const seg = { ...s, dash: frac * donutC, offset: -acc * donutC }
    acc += frac
    return seg
  })
  const chartMax = Math.max(1, ...chartComps.flatMap((c) => {
    const cc = compCounts[c]
    return [cc.gold, cc.silver, cc.bronze]
  }))

  const statCards = [
    { title: 'Gold', img: '/medal_gold.png', n: active.gold, color: GOLD },
    { title: 'Silver', img: '/medal_silver.png', n: active.silver, color: SILVER },
    { title: 'Bronze', img: '/medal_bronze.png', n: active.bronze, color: BRONZE },
  ]

  const barRow = (label, n, color) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="micro" style={{ width: 52, flex: 'none' }}>{label}</span>
      <div className="bar" style={{ flex: 1 }}>
        <div style={{ width: `${(n / chartMax) * 100}%`, background: color }} />
      </div>
      <span className="asw-num" style={{ width: 26, textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{n}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Category filter — only competitions this athlete has medals in */}
      {chartComps.length > 0 && (
        <Seg options={catOptions} value={isAll || !compCounts[cat] ? 'All' : cat} onChange={setCat} />
      )}

      {/* Medal count cards */}
      <div className="cellgrid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {statCards.map((c) => (
          <div key={c.title} style={{ textAlign: 'center' }}>
            <div className="card-kicker" style={{ color: c.color }}>{c.title} medals</div>
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
          <div className="sect-head"><h4>Medal distribution</h4></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: 160, height: 160, flex: 'none' }}>
              <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                {donutSegs.map((s) => s.n > 0 && (
                  <circle key={s.key} cx="60" cy="60" r={donutR} fill="none" stroke={s.color} strokeWidth="22"
                    strokeDasharray={`${s.dash} ${donutC}`} strokeDashoffset={s.offset} />
                ))}
              </svg>
              <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32, lineHeight: 1 }}>{active.total}</span>
                <span className="micro">Total</span>
              </span>
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
          <div className="sect-head"><h4>By competition</h4></div>
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Competition</th>
                <th className="num" style={{ color: GOLD }}>G</th>
                <th className="num" style={{ color: SILVER }}>S</th>
                <th className="num" style={{ color: BRONZE }}>B</th>
              </tr>
            </thead>
            <tbody>
              {chartComps.map((cls) => {
                const cc = compCounts[cls]
                const isSel = cls === cat
                return (
                  <tr key={cls} style={{ background: isSel ? 'var(--color-accent-100)' : undefined }}>
                    <td style={{ fontWeight: isSel ? 800 : 600, textTransform: 'uppercase', fontSize: 12, letterSpacing: '0.04em' }}>{cls}</td>
                    <td className="num asw-num" style={{ fontWeight: cc.gold ? 700 : 400 }}>{cc.gold}</td>
                    <td className="num asw-num" style={{ fontWeight: cc.silver ? 700 : 400 }}>{cc.silver}</td>
                    <td className="num asw-num" style={{ fontWeight: cc.bronze ? 700 : 400 }}>{cc.bronze}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Horizontal bar summary per competition */}
      {isAll && chartComps.length > 0 && (
        <div>
          <div className="sect-head"><h4>Medal summary</h4></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '18px 32px' }}>
            {chartComps.map((cls) => {
              const cc = compCounts[cls]
              return (
                <div key={cls}>
                  <div className="kicker" style={{ marginBottom: 6 }}>{cls}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {barRow('Gold', cc.gold, GOLD)}
                    {barRow('Silver', cc.silver, SILVER)}
                    {barRow('Bronze', cc.bronze, BRONZE)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
