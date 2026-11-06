import { useEffect, useState } from 'react'
import { getSponsors } from '../api/sponsors'
import { mediaUrl } from '../utils'

// Sponsor/partner logo strip, shown site-wide just above the footer
// (mirrors the "GLOBAL PARTNERS" band on worldaquatics.com). Renders
// nothing until there is at least one active partner with a logo.
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

  if (partners.length === 0) return null

  const pillFor = (p, dupe) => {
    const img = (
      <img
        src={mediaUrl(p.logo)}
        alt={dupe ? '' : p.name}
        title={p.name}
        loading="lazy"
        className="asw-partner-logo"
      />
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
        <div className="asw-partners-track" style={{ '--partner-count': partners.length }}>
          <div className="asw-partners-half">{partners.map((p) => pillFor(p, false))}</div>
          <div className="asw-partners-half asw-partner-dupe" aria-hidden="true">
            {partners.map((p) => pillFor(p, true))}
          </div>
        </div>
      </div>
    </section>
  )
}
