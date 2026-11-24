import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
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
// Selective Attention: work screens (admin, import, reports) and sign-in /
// sign-up forms carry no sponsor wall. The 404 page is hidden in CSS
// (audit-chrome.css), because only the router knows that no route matched.
const HIDDEN_ON = /^\/(admin|import|reports|login|register|join)(\/|$)/
// below this a marquee has nothing to scroll: it only repeats the same logos
const MARQUEE_MIN = 6

export default function Partners() {
  const [partners, setPartners] = useState([])
  const { pathname } = useLocation()

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
  const marquee = shown.length >= MARQUEE_MIN

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

  if (HIDDEN_ON.test(pathname)) return null

  return (
    <section className="rule-t asw-partners" aria-label="Partners">
      <span className="asw-partners-label">Our Partners</span>
      {/* Proximity: a handful of partners sit together beside the label; only a full wall spreads across */}
      <div className={`asw-partners-row${shown.length < 5 ? ' few' : ''}${marquee ? '' : ' static'}`}>
        {/* With six or more partners the phone track auto-scrolls as an endless
            marquee (second copy makes the loop seamless); on desktop both
            wrappers flatten away (display:contents) and the duplicate set is
            hidden. Fewer partners sit in a still, centred row with no copy. */}
        <div className="asw-partners-track" style={{ '--partner-count': shown.length }}>
          <div className="asw-partners-half">{shown.map((p) => pillFor(p, false))}</div>
          {marquee && (
            <div className="asw-partners-half asw-partner-dupe" aria-hidden="true">
              {shown.map((p) => pillFor(p, true))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
