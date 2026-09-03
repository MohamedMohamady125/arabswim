import { useState } from 'react'
import 'flag-icons/css/flag-icons.min.css'
import { flagAlpha2 } from '../utils'

// Hand-picked flag images (src/assets/flags/{alpha2}.webp) — drop a new file
// in that folder and it is picked up automatically, overriding the SVG set.
const CUSTOM_FLAGS = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/flags/*.webp', { eager: true, import: 'default' }))
    .map(([path, url]) => [path.match(/([a-z]{2})\.webp$/)[1], url])
)

// Codes that have no national flag — athletes competing under a neutral
// banner (World Aquatics "Neutral Athletes" / "AIN" / the "NAB" relay code).
// They get a dedicated neutral badge instead of a country flag.
const NEUTRAL_CODES = new Set(['AIN', 'NAB', 'NEUTRAL'])

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
  // Neutral athletes: no national flag — render a neutral badge.
  if (NEUTRAL_CODES.has(upper)) {
    return (
      <span
        className={cls}
        role="img"
        aria-label={name || 'Neutral Athletes'}
        title={name || 'Neutral Athletes'}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: large ? '0.6rem' : '0.5rem', fontWeight: 700, letterSpacing: '0.02em',
          background: 'var(--color-neutral-100)', color: 'var(--color-neutral-500)',
        }}
      >AIN</span>
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
