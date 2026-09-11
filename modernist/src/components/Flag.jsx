import { useState } from 'react'
import 'flag-icons/css/flag-icons.min.css'
import { flagAlpha2 } from '../utils'
import worldAquaticsLogo from '../assets/world-aquatics.svg'

// Hand-picked flag images (src/assets/flags/{alpha2}.webp) — drop a new file
// in that folder and it is picked up automatically, overriding the SVG set.
const CUSTOM_FLAGS = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/flags/*.webp', { eager: true, import: 'default' }))
    .map(([path, url]) => [path.match(/([a-z]{2})\.webp$/)[1], url])
)

// Codes that have no national flag — athletes competing under a neutral
// banner (World Aquatics "Neutral Athletes" / "AIN" / the "NAA"/"NAB" relay
// codes, and "SMF" Suspended Member Federation).
// They get a dedicated neutral badge instead of a country flag.
// Codes that are NOT real countries — neutral athletes, refugee teams,
// suspended federations, etc. They all display the World Aquatics logo
// as their flag instead of a national flag.
const AQUATICS_LOGO_CODES = new Set([
  'AIN', 'NAA', 'NAB', 'NAC', 'NIA',  // neutral athlete codes
  'FRT', 'ART', 'EOR',                  // refugee team codes
  'SMF',                                 // suspended member federation
  'NEUTRAL',                             // generic neutral marker
  'AGU',                                 // Aguascalientes (non-country)
])

// Bordered rectangular flag, per the Modernist theme (.asw-flag / .asw-flag-lg).
// Custom curated images first; the bundled flag-icons SVG set as fallback —
// every flag cropped to the same 4:3 box so rows line up perfectly.
// With `placeholder`, swimmers without a nationality still reserve the flag's
// footprint (empty bordered box) so names line up across every row.
export default function Flag({ code, name, large = false, flagUrl, placeholder = false }) {
  const [failed, setFailed] = useState(false)
  const upper = code ? String(code).toUpperCase() : ''
  const alpha2 = flagAlpha2(code)
  const cls = large ? 'asw-flag-lg' : 'asw-flag'
  // Non-country codes (neutral athletes, refugee teams, suspended feds) —
  // show the World Aquatics logo instead of a national flag.
  if (AQUATICS_LOGO_CODES.has(upper)) {
    return (
      <img
        className={cls}
        src={worldAquaticsLogo}
        alt={name || upper || 'World Aquatics'}
        title={name || upper || 'World Aquatics'}
        loading="lazy"
        style={{ objectFit: 'contain', background: '#fff', padding: '2px' }}
      />
    )
  }
  if (alpha2 && CUSTOM_FLAGS[alpha2]) {
    return (
      <img className={cls} src={CUSTOM_FLAGS[alpha2]} alt={name || code || ''}
        title={name || undefined} loading="lazy" />
    )
  }
  if (alpha2) {
    return (
      <span
        className={`fi fi-${alpha2} ${cls}`}
        role="img"
        aria-label={name || code || ''}
        title={name || undefined}
      />
    )
  }
  if (flagUrl && !failed) {
    return (
      <img className={cls} src={flagUrl} alt={name || code || ''} loading="lazy"
        onError={() => setFailed(true)} />
    )
  }
  if (!placeholder) return null
  return <span className={cls} style={{ background: 'var(--color-neutral-100)' }} aria-hidden="true" />
}
