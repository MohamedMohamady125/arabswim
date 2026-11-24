/* Standard medal-standings UI (Olympic-app style), used everywhere a
   gold/silver/bronze tally is shown: top-3 podium cards + a table whose
   G/S/B header cells are saturated and body columns palely banded.
   Rows only need {gold, silver, bronze, total}; the entity cell and the
   podium chip are injected by the caller so countries, clubs and
   swimmers can all share the exact same frame. */

import { Fragment, useState } from 'react'
import { MedalIcon } from './ui'

const GOLD = 'var(--asw-gold)'
const SILVER = 'var(--asw-silver)'
const BRONZE = 'var(--asw-bronze)'

/* Table frame mirrors the World Aquatics medals page: navy ink on white,
   4px hairline under the header, G/S/B columns as pale 113° gradient bands
   with saturated band tops, thin row dividers, roomy rows. */
const th = {
  fontSize: 12, fontWeight: 700, padding: '12px 12px',
  color: 'var(--wa-ink)', borderBottom: '4px solid var(--wa-line)',
}
const td = { padding: '15px 12px', fontSize: 14, borderTop: '1px solid var(--wa-line)', color: 'var(--wa-ink)' }

const medalTh = (headGrad, label, type) => (
  <th className="medal-col" aria-label={label} style={{ ...th, textAlign: 'center', background: headGrad, width: 54 }}>
    <span className="hide-mobile">{label}</span>
    {/* phone: the medal itself instead of a G/S/B letter */}
    <span className="show-mobile-inline" style={{ lineHeight: 0 }}><MedalIcon type={type} size={15} style={{ verticalAlign: 'middle' }} /></span>
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
  podiumLabels = true,    // false hides the 1st / 2nd / 3rd label in the podium cards
  stackPodiumOnPhone = false, // true: the three cards sit under each other on phone
  maxRows,                // optionally cap the table (e.g. compact embeds)
  rowKey,                 // (row, i) => key
  onRowClick,             // optional (row) => void — row becomes clickable
  expandContent,          // optional (row) => node — rows toggle a dropdown panel
  rankOf,                 // optional (row, i) => rank shown in the first column (default i + 1),
                          // for filtered lists that must keep each row's real position
}) {
  const [openKey, setOpenKey] = useState(null)
  if (!rows || rows.length === 0) return null
  const shown = maxRows ? rows.slice(0, maxRows) : rows
  const top3 = rows.slice(0, 3)
  const key = rowKey || ((r, i) => i)
  const chip = renderPodiumChip || renderEntity

  return (
    <div>
      {showPodium && top3.length === 3 && (
        <div className={`live-podium mp-grid${stackPodiumOnPhone ? ' live-podium-stack' : ''}`}>
          {top3.map((r, i) => {
            const total = r.total ?? (r.gold || 0) + (r.silver || 0) + (r.bronze || 0)
            return (
              <div key={key(r, i)} className={`mp-card mp-${i + 1}`}>
                {podiumLabels && (
                  <span className="mp-badge" aria-label={`${PODIUM_META[i].label} place`}>
                    <b aria-hidden="true">{i + 1}</b><sup aria-hidden="true">{PODIUM_META[i].label.slice(1)}</sup>
                  </span>
                )}
                <div className="mp-main">
                  <div className="mp-who">{chip(r, i)}</div>
                  <div className="mp-counts asw-num" aria-label={`${r.gold || 0} gold, ${r.silver || 0} silver, ${r.bronze || 0} bronze, ${total} in total`}>
                    <span className="mp-c mp-c-g" aria-hidden="true"><i />{r.gold || 0}</span>
                    <span className="mp-c mp-c-s" aria-hidden="true"><i />{r.silver || 0}</span>
                    <span className="mp-c mp-c-b" aria-hidden="true"><i />{r.bronze || 0}</span>
                    <span className="mp-total" aria-hidden="true"><b>{total}</b> total</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* overflowX keeps Bronze/Total reachable on narrow screens instead of clipping them */}
      <div style={{ border: '1px solid var(--wa-line)', borderRadius: 0, overflowX: 'auto', background: '#fff',  }}>
        <table className="medals-table" style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead style={{ background: '#fff' }}>
            <tr>
              <th aria-label="Rank" style={{ ...th, textAlign: 'left', width: 32, paddingRight: 4 }}><span className="hide-mobile">Rank</span><span className="show-mobile-inline">#</span></th>
              <th style={{ ...th, textAlign: 'left' }}>{entityHeader}</th>
              {medalTh('var(--wa-gold-head)', 'Gold', 'GOLD')}
              {medalTh('var(--wa-silver-head)', 'Silver', 'SILVER')}
              {medalTh('var(--wa-bronze-head)', 'Bronze', 'BRONZE')}
              <th aria-label="Total" className="medal-total-col" style={{ ...th, textAlign: 'center', width: 64 }}><span className="hide-mobile">Total</span><span className="show-mobile-inline">T</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const k = key(r, i)
              const isOpen = !!expandContent && openKey === k
              const activate = expandContent
                ? () => setOpenKey(isOpen ? null : k)
                : onRowClick ? () => onRowClick(r) : undefined
              return (
                <Fragment key={k}>
                  {/* Jakob's Law: a clickable row is reachable by keyboard; it stays a table row so cells keep their headers */}
                  <tr
                    onClick={activate}
                    className={activate ? 'row-link' : undefined}
                    tabIndex={activate ? 0 : undefined}
                    aria-expanded={expandContent ? isOpen : undefined}
                    onKeyDown={activate ? (e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() }
                    } : undefined}
                    style={{ background: '#fff', cursor: (onRowClick || expandContent) ? 'pointer' : 'default' }}
                  >
                    <td className="asw-num" style={{ ...td, fontWeight: 600, paddingRight: 4 }}>{rankOf ? rankOf(r, i) : i + 1}</td>
                    {/* entity absorbs the leftover width; long names ellipsize
                        instead of forcing a horizontal scroll (same trick as
                        the results table's swimmer cell) */}
                    <td style={{ ...td, width: '100%', maxWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', padding: '8px 0', margin: '-7px 0' }}>
                          {renderEntity(r, i)}
                        </span>
                        {expandContent && (
                          <span className="medal-expand-btn" aria-hidden="true" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 600, background: 'var(--wa-gold-band)' }}>{r.gold}</td>
                    <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 600, background: 'var(--wa-silver-band)' }}>{r.silver}</td>
                    <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 600, background: 'var(--wa-bronze-band)' }}>{r.bronze}</td>
                    <td className="asw-num" style={{ ...td, textAlign: 'center', fontWeight: 800 }}>
                      {r.total ?? (r.gold || 0) + (r.silver || 0) + (r.bronze || 0)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} style={{ padding: 0, borderTop: '1px solid var(--wa-line)', background: 'var(--color-bg)' }}>
                        {expandContent(r)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
