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

  return (
    <section className="rule-t asw-partners" aria-label="Partners">
      <span className="kicker asw-partners-label">Partners</span>
      <div className="asw-partners-row">
        {partners.map((p) => {
          const pill = (
            <img
              src={mediaUrl(p.logo)}
              alt={p.name}
              title={p.name}
              loading="lazy"
              className="asw-partner-logo"
            />
          )
          return p.website ? (
            <a
              key={p.id}
              href={p.website}
              target="_blank"
              rel="noreferrer"
              className="asw-partner-pill"
              aria-label={p.name}
            >
              {pill}
            </a>
          ) : (
            <span key={p.id} className="asw-partner-pill">{pill}</span>
          )
        })}
      </div>
    </section>
  )
}
