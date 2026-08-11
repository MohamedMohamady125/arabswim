import { useState } from 'react'
import 'flag-icons/css/flag-icons.min.css'
import { flagAlpha2 } from '../utils'

// Bordered rectangular flag, per the Modernist theme (.asw-flag / .asw-flag-lg).
// Rendered from the bundled flag-icons SVG set — crisp at any pixel density,
// every flag drawn to the same 4:3 geometry so rows line up perfectly.
// With `placeholder`, swimmers without a nationality still reserve the flag's
// footprint (empty bordered box) so names line up across every row.
export default function Flag({ code, name, large = false, flagUrl, placeholder = false }) {
  const [failed, setFailed] = useState(false)
  const alpha2 = flagAlpha2(code)
  const cls = large ? 'asw-flag-lg' : 'asw-flag'
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
