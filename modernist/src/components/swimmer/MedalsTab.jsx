import { Empty } from '../ui'
import { CLASSIFICATIONS } from './MeetsTab'

const GOLD = 'var(--asw-gold)'
const SILVER = 'var(--asw-silver)'
const BRONZE = 'var(--asw-bronze)'
const NAVY = 'var(--color-accent-800)'
const TRACK = 'var(--color-neutral-200)'

/* Slim linear meter — one value, shown as a bar rather than a ring so the
   whole tab speaks a single visual language (Law of Uniform Connectedness). */
function Meter({ pct, color, title, desc }) {
  return (
    <div className="rule-t" style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span className="kicker">{title}</span>
        <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, lineHeight: 1 }}>
          {pct}<span style={{ fontSize: 13 }}>%</span>
        </span>
      </div>
      <div role="img" aria-label={`${title}: ${pct}%`}
        style={{ height: 10, background: TRACK, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .5s ease' }} />
      </div>
      <div className="micro">{desc}</div>
    </div>
  )
}

/* Uniform distribution widget: every classification (and the career total)
   gets the same card — a segmented stacked bar for the gold/silver/bronze
   split (replaces the old donut) plus a legend with exact counts and %. */
function DistCard({ title, counts, shareOfCareer }) {
  const tot = counts.total || counts.gold + counts.silver + counts.bronze
  const pct = (n) => (tot > 0 ? Math.round((n / tot) * 100) : 0)
  const rows = [
    { label: 'Gold', n: counts.gold, color: GOLD },
    { label: 'Silver', n: counts.silver, color: SILVER },
    { label: 'Bronze', n: counts.bronze, color: BRONZE },
  ]
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* title · big total · share-of-career (Von Restorff: the total stands out) */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span className="asw-num" style={{ marginLeft: 'auto', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, lineHeight: 1, flex: 'none' }}>{tot}</span>
        {shareOfCareer != null && (
          <span className="asw-num micro" title={`${shareOfCareer}% of all career medals`} style={{ flex: 'none' }}>
            {shareOfCareer}%
          </span>
        )}
      </div>

      {/* segmented proportion bar — the whole split at a glance. Thin gaps let
          the track show through as separators between tiers. */}
      <div role="img"
        aria-label={`${counts.gold} gold, ${counts.silver} silver, ${counts.bronze} bronze`}
        style={{ display: 'flex', gap: 2, height: 14, borderRadius: 999, overflow: 'hidden', background: TRACK }}>
        {rows.map((r) => r.n > 0 && (
          <div key={r.label} style={{ width: `${pct(r.n)}%`, background: r.color, transition: 'width .5s ease' }}
            title={`${r.label}: ${r.n}`} />
        ))}
      </div>

      {/* legend: dot · tier · count · share (Proximity keeps each figure with its tier) */}
      <div>
        {rows.map((r) => (
          <div key={r.label} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: r.color, flex: 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{r.label}</span>
            <span className="asw-num" style={{ fontWeight: 800, fontSize: 13 }}>{r.n}</span>
            <span className="asw-num micro" style={{ width: 38, textAlign: 'right' }}>{pct(r.n)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MedalsTab({ stats }) {
  if (!stats) return <Empty label="Medals unavailable" hint="They could not be loaded. Reload the page to try again." />
  const { medals, medals_hierarchy, total_races, intl_medals } = stats
  if (!medals || medals.total === 0) return <Empty label="No medals yet" hint="Medals appear here once this swimmer finishes on a podium." />

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

  // Second card: international-only medals, when they differ from the tally
  const intlDonut = intl_medals && intl_medals.total > 0
    && intl_medals.total !== medals.total

  const statCards = [
    { title: 'Gold', img: '/medal_gold.png', n: medals.gold, color: GOLD },
    { title: 'Silver', img: '/medal_silver.png', n: medals.silver, color: SILVER },
    { title: 'Bronze', img: '/medal_bronze.png', n: medals.bronze, color: BRONZE },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Medal count cards */}
      <div className="cellgrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {statCards.map((c) => (
          <div key={c.title} style={{ textAlign: 'center' }}>
            {/* single-line label so all three cards stay perfectly level on phones */}
            <div className="card-kicker" style={{ color: c.color, whiteSpace: 'nowrap' }}>{c.title}</div>
            {c.img && (
              <img src={c.img} alt="" width={44} height={44} style={{ margin: '8px auto 0' }} />
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
          display: 'grid', gap: 16,
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

      {/* Career-wide rates — linear meters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 24 }}>
        <Meter pct={medalRacePct} color={NAVY} title="Medal-winning races"
          desc="Races that earned at least one medal" />
        <Meter pct={goldRacePct} color={GOLD} title="Gold-winning races"
          desc="Races that resulted in a gold medal" />
        <Meter pct={goldSharePct} color={GOLD} title="Gold share"
          desc="Percentage of gold medals out of total medals" />
      </div>
    </div>
  )
}
