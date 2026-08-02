import { flagSrc } from '../utils'

// Bordered rectangular flag, per the Modernist theme (.asw-flag / .asw-flag-lg)
export default function Flag({ code, name, large = false, flagUrl }) {
  const src = flagSrc(code, large ? 'w80' : 'w40') || flagUrl || ''
  if (!src) return null
  return (
    <img
      className={large ? 'asw-flag-lg' : 'asw-flag'}
      src={src}
      alt={name || code || ''}
      loading="lazy"
      onError={(e) => { e.target.style.display = 'none' }}
    />
  )
}
