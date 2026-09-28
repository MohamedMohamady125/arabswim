/* Standard medal-standings UI (Olympic-app style), used everywhere a
   gold/silver/bronze tally is shown: top-3 podium cards + a table whose
   G/S/B header cells are saturated and body columns palely banded.
   Rows only need {gold, silver, bronze, total}; the entity cell and the
   podium chip are injected by the caller so countries, clubs and
   swimmers can all share the exact same frame. */

const GOLD = 'var(--asw-gold)'
const SILVER = 'var(--asw-silver)'
const BRONZE = 'var(--asw-bronze)'

const th = {
  fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase',
  letterSpacing: '0.08em', padding: '10px 12px', color: 'var(--color-neutral-600)',
}
const td = { padding: '10px 12px', fontSize: 13.5, borderTop: '1px solid var(--color-neutral-200)' }
const band = (c) => `color-mix(in srgb, ${c} 14%, #fff)`

const medalTh = (c, label, short) => (
  <th style={{ ...th, textAlign: 'center', background: c, color: '#fff', width: 54 }}>
    <span className="hide-mobile">{label}</span>
    <span className="show-mobile-inline">{short}</span>
  </th>
)

const PODIUM_META = [
  { ring: GOLD, label: '1st' },
  { ring: SILVER, label: '2nd' },
  { ring: BRONZE, label: '3rd' },
]

export default function MedalStandings({
  rows,
  entityHeader = 'Country',
  renderEntity,           // (row, i) => node for the entity cell
  renderPodiumChip,       // (row) => compact node (flag + code / logo + name)
  showPodium = true,
  maxRows,                // optionally cap the table (e.g. compact embeds)
  rowKey,                 // (row, i) => key
  onRowClick,             // optional (row) => void — row becomes clickable
}) {
  if (!rows || rows.length === 0) return null
  const shown = maxRows ? rows.slice(0, maxRows) : rows
  const top3 = rows.slice(0, 3)
  const key = rowKey || ((r, i) => i)
  const chip = renderPodiumChip || renderEntity

  return (
    <div>
      {showPodium && top3.length === 3 && (
        <div className="live-podium" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
          {top3.map((r, i) => (
            <div key={key(r, i)} style={{
              border: '1px solid var(--color-neutral-200)', borderTop: `3px solid ${PODIUM_META[i].ring}`,
              borderRadius: 12, padding: '12px 14px', background: '#fff', minWidth: 0,
              boxShadow: '0 1px 4px rgba(12,35,64,.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, minWidth: 0, overflow: 'hidden' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-neutral-500)' }}>
                  {PODIUM_META[i].label}
                </span>
                {chip(r, i)}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, lineHeight: 1 }}>
                  {r.total ?? (r.gold || 0) + (r.silver || 0) + (r.bronze || 0)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-neutral-600)', fontWeight: 700, display: 'inline-flex', gap: 8 }}>
                  <span style={{ color: GOLD }}>{r.gold}G</span>
                  <span style={{ color: SILVER }}>{r.silver}S</span>
                  <span style={{ color: BRONZE }}>{r.bronze}B</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ border: '1px solid var(--color-neutral-200)', borderTop: '3px solid var(--color-box-top)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(12,35,64,.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead style={{ background: 'var(--color-surface)' }}>
            <tr>
              <th style={{ ...th, textAlign: 'left', width: 40 }}>Rk</th>
              <th style={{ ...th, textAlign: 'left' }}>{entityHeader}</th>
              {medalTh(GOLD, 'Gold', 'G')}
              {medalTh(SILVER, 'Silver', 'S')}
              {medalTh(BRONZE, 'Bronze', 'B')}
              <th style={{ ...th, textAlign: 'center' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr
                key={key(r, i)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={{
                  background: i < 3 ? 'color-mix(in srgb, var(--asw-gold) 6%, #fff)' : '#fff',
                  cursor: onRowClick ? 'pointer' : 'default',
                }}
              >
                <td className="asw-num" style={{ ...td, fontWeight: 800, color: i < 3 ? 'var(--color-accent-800)' : 'inherit' }}>{i + 1}</td>
                <td style={td}>{renderEntity(r, i)}</td>
                <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 800, background: band(GOLD) }}>{r.gold}</td>
                <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 700, background: band(SILVER) }}>{r.silver}</td>
                <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 700, background: band(BRONZE) }}>{r.bronze}</td>
                <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 800 }}>
                  {r.total ?? (r.gold || 0) + (r.silver || 0) + (r.bronze || 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
