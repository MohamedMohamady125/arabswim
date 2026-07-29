import CountryFlag from '../common/CountryFlag'

/**
 * The standard identity cell for every table: flag + "Given SURNAME"
 * (surname carries the weight) + optional club/age meta line.
 */
export default function SwimmerCell({ name, countryCode, flagUrl, club, meta, onClick }) {
  const parts = (name || '').trim().split(' ')
  // Site convention "Given SURNAME": trailing all-caps tokens are the surname
  let split = parts.length
  while (split > 1 && parts[split - 1] === parts[split - 1].toUpperCase() && /[A-ZÀ-Þ]/.test(parts[split - 1])) {
    split--
  }
  const given = parts.slice(0, split).join(' ')
  const surname = parts.slice(split).join(' ')

  return (
    <div
      className={onClick ? 'flex items-center gap-2 sm:gap-2.5 min-w-0 cursor-pointer group' : 'flex items-center gap-2 sm:gap-2.5 min-w-0'}
      onClick={onClick}
    >
      {countryCode && <CountryFlag code={countryCode} flagUrl={flagUrl} />}
      <div className="flex-1 min-w-0">
        <div className={`text-body-sm text-ink-900 truncate ${onClick ? 'group-hover:text-aqua-600' : ''}`}>
          {given}{given && surname ? ' ' : ''}
          {surname && <span className="font-semibold">{surname}</span>}
        </div>
        {(club || meta) && (
          <div className="text-label normal-case tracking-normal font-normal text-ink-400 truncate">
            {[club, meta].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}
