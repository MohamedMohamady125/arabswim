import { useEffect, useState } from 'react'
import { getSponsors } from '../api/sponsors'
import Pic from './Pic'

// Shown until a real sponsor with a logo is configured in the admin. Only real
// partners belong here: the strip must never show a brand that does not exist.
const DEFAULT_PARTNERS = [
  // Real federation partner: Fédération Royale Marocaine de Natation —
  // official lockup bundled locally (local: true skips the API media prefix)
  { id: 'frmn', name: 'Fédération Royale Marocaine de Natation',
    logo: '/partners/frmn-crest.png', local: true, website: 'https://frmnatation.com' },
]

// Sponsor/partner logo strip, shown site-wide just above the footer
// (mirrors the "GLOBAL PARTNERS" band on worldaquatics.com). Shows the
// bundled real partner until a sponsor with a logo exists in the admin.
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
      p.local ? (
        // bundled with the site, not an upload
        <img src={p.logo} alt={dupe ? '' : p.name} title={p.name} loading="lazy" className="asw-partner-logo" />
      ) : (
        <Pic kind="sponsor" w={128} fill={false} src={p.logo} alt={dupe ? '' : p.name} title={p.name} className="asw-partner-logo" />
      )
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
