// flag_url stores the ISO alpha-2 code (e.g. "lb" for Lebanon)
// Falls back to guessing from the 3-letter code if flag_url not set

const CODE_TO_ALPHA2 = {
  KSA: 'sa', UAE: 'ae', QAT: 'qa', KWT: 'kw', BHR: 'bh', OMA: 'om',
  EGY: 'eg', JOR: 'jo', LBN: 'lb', SYR: 'sy', IRQ: 'iq', PLE: 'ps',
  YEM: 'ye', LBY: 'ly', TUN: 'tn', ALG: 'dz', MAR: 'ma', SUD: 'sd',
  SOM: 'so', MTN: 'mr', DJI: 'dj', COM: 'km',
  // Legacy IOC codes still present in older data
  KUW: 'kw', LBA: 'ly', LIB: 'lb', BRN: 'bh',
}

export default function CountryFlag({ code, flagUrl, name, className = '' }) {
  const alpha2 = flagUrl || CODE_TO_ALPHA2[code?.toUpperCase()] || (code || '').toLowerCase().slice(0, 2)

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <img
        src={`https://flagcdn.com/w40/${alpha2}.png`}
        srcSet={`https://flagcdn.com/w80/${alpha2}.png 2x`}
        alt={name || code}
        className="w-5 h-3.5 object-cover rounded-sm"
        onError={(e) => { e.target.style.display = 'none' }}
      />
      <span>{name}</span>
    </span>
  )
}
