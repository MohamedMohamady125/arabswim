import { IconInstagram, IconFacebook, IconYoutube, IconTiktok, IconX } from './SocialIcons'

// The five networks every profile (swimmer, club, academy, federation) can link.
// `key` is the short name; each owner stores it as `${prefix}${key}${suffix}`.
export const SOCIALS = [
  { key: 'instagram', label: 'Instagram', icon: IconInstagram },
  { key: 'facebook', label: 'Facebook', icon: IconFacebook },
  { key: 'youtube', label: 'YouTube', icon: IconYoutube },
  { key: 'tiktok', label: 'TikTok', icon: IconTiktok },
  { key: 'x', label: 'X', icon: IconX },
]

/**
 * Row of social icons, same look as the swimmer profile (Similarity).
 *   source  — the object holding the links
 *   prefix / suffix — field naming: club `instagram_url`, federation `federation_instagram`
 *   name    — who it is, for the accessible label
 * Renders nothing when no link is set.
 */
export default function SocialLinks({ source, prefix = '', suffix = '_url', name = '', style }) {
  const links = SOCIALS
    .map((s) => ({ ...s, href: source?.[`${prefix}${s.key}${suffix}`] }))
    .filter((s) => s.href)
  if (links.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', ...style }}>
      {links.map((s) => (
        <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer"
          title={s.label} aria-label={`${name} on ${s.label}`} className="asw-social asw-social-light">
          {s.icon}
        </a>
      ))}
    </div>
  )
}

/**
 * The five inputs for an edit form. `form` / `setForm` hold the values under
 * the same field names. Postel's Law: a handle, an @handle or a full link all work.
 */
export function SocialFields({ form, setForm, prefix = '', suffix = '_url', idBase = 'soc' }) {
  return (
    <div className="social-fields">
      {SOCIALS.map((s) => {
        const field = `${prefix}${s.key}${suffix}`
        return (
          <div className="field" key={s.key}>
            <label htmlFor={`${idBase}-${s.key}`}>{s.label}</label>
            <input id={`${idBase}-${s.key}`} className="input" style={{ width: '100%' }} autoCapitalize="none" spellCheck={false}
              placeholder="@handle or link" value={form[field] || ''}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} />
          </div>
        )
      })}
    </div>
  )
}
