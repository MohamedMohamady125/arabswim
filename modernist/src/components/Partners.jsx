import { useEffect, useState } from 'react'
import { getSponsors } from '../api/sponsors'
import { mediaUrl } from '../utils'

// Built-in partner wordmarks shown while no real sponsor is configured in the
// admin. Fictional names on purpose — the strip must never claim a sponsorship
// that doesn't exist. Real sponsors from the DB replace these automatically.
const ic = (path, viewBox = '0 0 24 24') => (
  <svg width="18" height="18" viewBox={viewBox} fill="currentColor" aria-hidden="true">{path}</svg>
)
const DEFAULT_PARTNERS = [
  // Real federation partner: Fédération Royale Marocaine de Natation —
  // official lockup bundled locally (local: true skips the API media prefix)
  { id: 'frmn', name: 'Fédération Royale Marocaine de Natation',
    logo: '/partners/frmn.png', local: true, website: 'https://frmnatation.com' },
  { id: 'aquatech', name: 'AquaTech', bold: 'AQUA', light: 'TECH',
    icon: ic(<path d="M12 2.7s6.5 7.1 6.5 11.5a6.5 6.5 0 1 1-13 0C5.5 9.8 12 2.7 12 2.7z" />) },
  { id: 'marlin', name: 'Marlin Sports', bold: 'MARLIN', light: 'SPORTS',
    icon: ic(<path d="M2 12c4-5 10-7 20-7-2 2-3 4-3.3 6.2L22 18c-7 0-12-1-16.5-4L2 16.5 3.6 12 2 12z" />) },
  { id: 'bluelane', name: 'BlueLane', bold: 'BLUE', light: 'LANE',
    icon: ic(<><rect x="3" y="5" width="18" height="2.6" rx="1.3" /><rect x="3" y="10.7" width="18" height="2.6" rx="1.3" /><rect x="3" y="16.4" width="18" height="2.6" rx="1.3" /></>) },
  { id: 'hydrafuel', name: 'HydraFuel', bold: 'HYDRA', light: 'FUEL',
    icon: ic(<path d="M13 2 4.5 13.5H11L9.8 22l8.7-11.5H12L13 2z" />) },
  { id: 'orcagear', name: 'Orca Gear', bold: 'ORCA', light: 'GEAR',
    icon: ic(<path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2v3c-2.5 0-2.5-2-5-2s-2.5 2-5 2-2.5-2-5-2-2.5 2-5 2v-3zM2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2v3c-2.5 0-2.5-2-5-2s-2.5 2-5 2-2.5-2-5-2-2.5 2-5 2V8z" />) },
]

// Sponsor/partner logo strip, shown site-wide just above the footer
// (mirrors the "GLOBAL PARTNERS" band on worldaquatics.com). Shows the
// built-in wordmarks until a real partner with a logo exists in the admin.
export default function Partners() {
  const [partners, setPartners] = useState([])

  useEffect(() => {
    let alive = true
    getSponsors({ is_active: true })
      .then((res) => {
        if (!alive) return
        const list = Array.isArray(res.data) ? res.data : res.data?.results || []
        setPartners(list.filter((p) => p.logo))
      })
      .catch(() => { if (alive) setPartners([]) })
    return () => { alive = false }
  }, [])

  const shown = partners.length > 0 ? partners : DEFAULT_PARTNERS

  const pillFor = (p, dupe) => {
    const img = p.logo ? (
      <img
        src={p.local ? p.logo : mediaUrl(p.logo)}
        alt={dupe ? '' : p.name}
        title={p.name}
        loading="lazy"
        className="asw-partner-logo"
      />
    ) : (
      <span className="asw-partner-mark" title={p.name}>
        {p.icon}
        <span>{p.bold}<span className="asw-partner-mark-lt">{p.light}</span></span>
      </span>
    )
    return p.website ? (
      <a
        key={dupe ? `d-${p.id}` : p.id}
        href={p.website}
        target="_blank"
        rel="noreferrer"
        className="asw-partner-pill"
        aria-label={p.name}
        tabIndex={dupe ? -1 : undefined}
      >
        {img}
      </a>
    ) : (
      <span key={dupe ? `d-${p.id}` : p.id} className="asw-partner-pill">{img}</span>
    )
  }

  return (
    <section className="rule-t asw-partners" aria-label="Partners">
      <span className="asw-partners-label">Our Partners</span>
      <div className="asw-partners-row">
        {/* On phone the track auto-scrolls as an endless marquee (second copy
            makes the loop seamless); on desktop both wrappers flatten away
            (display:contents) and the duplicate set is hidden. */}
        <div className="asw-partners-track" style={{ '--partner-count': shown.length }}>
          <div className="asw-partners-half">{shown.map((p) => pillFor(p, false))}</div>
          <div className="asw-partners-half asw-partner-dupe" aria-hidden="true">
            {shown.map((p) => pillFor(p, true))}
          </div>
        </div>
      </div>
    </section>
  )
}
