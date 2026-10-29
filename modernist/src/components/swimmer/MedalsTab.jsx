import { Empty } from '../ui'
import { CLASSIFICATIONS } from './MeetsTab'

const GOLD = 'var(--asw-gold)'
const SILVER = 'var(--asw-silver)'
const BRONZE = 'var(--asw-bronze)'
const GOLD_HEX = '#b98a1e'
const SILVER_HEX = '#7d8a99'
const BRONZE_HEX = '#a05f2c'
const NAVY = 'var(--color-accent-800)'

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
          {/* decimal values ("86.2") are wider than the ring's hole — shrink them */}
          <span style={{ fontSize: String(pct).length > 2 ? 22 : 30 }}>{pct}</span><span style={{ fontSize: String(pct).length > 2 ? 12 : 15 }}>%</span>
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
          <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: size >= 160 ? 32 : size >= 120 ? 26 : 21, lineHeight: 1 }}>{counts.total}</span>
          {size >= 120 && <span className="micro">Total</span>}
        </span>
      </div>
      {label ? <span className="micro" style={{ textAlign: 'center' }}>{label}</span> : null}
    </div>
  )
}

/* Uniform distribution widget: every classification (and the career total)
   gets the exact same card — donut chart + G/S/B legend with counts & %. */
function DistCard({ title, counts, shareOfCareer }) {
  const tot = counts.total
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {shareOfCareer != null && (
          <span className="asw-num" title={`${shareOfCareer}% of all career medals`}
            style={{ marginLeft: 'auto', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, flex: 'none' }}>
            {shareOfCareer}%
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <MedalDonut counts={counts} size={120} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {[
            { label: 'Gold', n: counts.gold, color: GOLD },
            { label: 'Silver', n: counts.silver, color: SILVER },
            { label: 'Bronze', n: counts.bronze, color: BRONZE },
          ].map((row) => (
            <div key={row.label} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <span style={{ width: 10, height: 10, background: row.color, flex: 'none' }} />
              <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{row.label}</span>
              <span className="asw-num" style={{ fontWeight: 800, fontSize: 13 }}>{row.n}</span>
              <span className="asw-num micro" style={{ width: 38, textAlign: 'right' }}>
                {tot > 0 ? Math.round((row.n / tot) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function MedalsTab({ stats }) {
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
  // Prestige order (Olympic → World → continental → National), unknowns after
  const chartComps = [
    ...CLASSIFICATIONS.filter(hasMedals),
    ...Object.keys(compCounts).filter((c) => !CLASSIFICATIONS.includes(c) && hasMedals(c)),
  ]

  const races = total_races || 0
  const medalRacePct = races > 0 ? Math.min(100, Math.round((medals.total / races) * 100)) : 0
  const goldRacePct = races > 0 ? Math.min(100, Math.round((medals.gold / races) * 100)) : 0
  const goldSharePct = medals.total > 0 ? Math.round((medals.gold / medals.total) * 1000) / 10 : 0

  // Second donut: international-only medals, when they differ from the tally
  const intlDonut = intl_medals && intl_medals.total > 0
    && intl_medals.total !== medals.total

  const statCards = [
    { title: 'Gold', img: '/medal_gold.png', n: medals.gold, color: GOLD },
    { title: 'Silver', img: '/medal_silver.png', n: medals.silver, color: SILVER },
    { title: 'Bronze', img: '/medal_bronze.png', n: medals.bronze, color: BRONZE },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
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

      {/* Medal distribution — one identical widget per classification,
          career total first, prestige order, single aligned grid */}
      <div>
        <div className="sect-head">
          <h4>Medal Distribution</h4>
          <span className="micro">by classification · {medals.total} career medal{medals.total !== 1 ? 's' : ''}</span>
        </div>
        <div style={{
          display: 'grid', gap: 14,
          // a lone classification card keeps a sensible width instead of a third of the row
          gridTemplateColumns: (chartComps.length + (intlDonut ? 1 : 0)) === 1
            ? 'minmax(300px, 460px)' : 'repeat(auto-fill, minmax(300px, 1fr))',
        }}>
          {/* career card only when there are 2+ widgets, else it duplicates the single classification */}
          {(chartComps.length + (intlDonut ? 1 : 0)) >= 2 && <DistCard title="All Medals" counts={medals} />}
          {intlDonut && <DistCard title="International" counts={intl_medals} />}
          {chartComps.map((cls) => {
            const cc = compCounts[cls]
            const tot = cc.gold + cc.silver + cc.bronze
            return (
              <DistCard key={cls} title={cls} counts={{ ...cc, total: tot }}
                shareOfCareer={Math.round((tot / medals.total) * 100)} />
            )
          })}
        </div>
      </div>

      {/* Percentage rings — career-wide */}
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        <PercentRing pct={medalRacePct} color={NAVY} title="Medal-winning races"
          desc="Races that earned at least one medal" />
        <PercentRing pct={goldRacePct} color={GOLD_HEX} title="Gold-winning races"
          desc="Races that resulted in a gold medal" />
        <PercentRing pct={goldSharePct} color={GOLD_HEX} title="Gold share"
          desc="Percentage of gold medals out of total medals" />
      </div>
    </div>
  )
}
