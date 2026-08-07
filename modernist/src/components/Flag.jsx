import { useState } from 'react'
import { flagSrc } from '../utils'

// Bordered rectangular flag, per the Modernist theme (.asw-flag / .asw-flag-lg)
// With `placeholder`, swimmers without a nationality still reserve the flag's
// footprint (empty bordered box) so names line up across every row.
export default function Flag({ code, name, large = false, flagUrl, placeholder = false }) {
  const [failed, setFailed] = useState(false)
  const src = failed ? '' : flagSrc(code, large ? 'w80' : 'w40') || flagUrl || ''
  const cls = large ? 'asw-flag-lg' : 'asw-flag'
  if (!src) {
    if (!placeholder) return null
    return <span className={cls} style={{ background: 'var(--color-neutral-100)' }} aria-hidden="true" />
  }
  return (
    <img
      className={cls}
      src={src}
      alt={name || code || ''}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
