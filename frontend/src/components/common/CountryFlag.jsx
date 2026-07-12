// IOC 3-letter code → ISO 3166-1 alpha-2 code for flagcdn.com
// Comprehensive map matching backend seed_countries.py FLAGS dict

export const CODE_TO_ALPHA2 = {
  // Arab / GCC
  KSA: 'sa', UAE: 'ae', QAT: 'qa', KWT: 'kw', BHR: 'bh', OMA: 'om',
  EGY: 'eg', JOR: 'jo', LBN: 'lb', SYR: 'sy', IRQ: 'iq', PLE: 'ps',
  YEM: 'ye', LBY: 'ly', TUN: 'tn', ALG: 'dz', MAR: 'ma', SUD: 'sd',
  SOM: 'so', MTN: 'mr', DJI: 'dj', COM: 'km',
  // Africa
  ANG: 'ao', BEN: 'bj', BOT: 'bw', BUR: 'bf', BDI: 'bi', CMR: 'cm',
  CPV: 'cv', CAF: 'cf', CHA: 'td', CGO: 'cg', COD: 'cd', CIV: 'ci',
  GEQ: 'gq', ERI: 'er', SWZ: 'sz', ETH: 'et', GAB: 'ga', GAM: 'gm',
  GHA: 'gh', GUI: 'gn', GBS: 'gw', KEN: 'ke', LES: 'ls', LBR: 'lr',
  MAD: 'mg', MAW: 'mw', MLI: 'ml', MRI: 'mu', MOZ: 'mz', NAM: 'na',
  NIG: 'ne', NGR: 'ng', RWA: 'rw', STP: 'st', SEN: 'sn', SEY: 'sc',
  SLE: 'sl', RSA: 'za', SSD: 'ss', TAN: 'tz', TOG: 'tg', UGA: 'ug',
  ZAM: 'zm', ZIM: 'zw',
  // Americas
  ANT: 'ag', ARG: 'ar', ARU: 'aw', BAH: 'bs', BAR: 'bb', BIZ: 'bz',
  BER: 'bm', BOL: 'bo', BRA: 'br', IVB: 'vg', CAN: 'ca', CAY: 'ky',
  CHI: 'cl', COL: 'co', CRC: 'cr', CUB: 'cu', DMA: 'dm', DOM: 'do',
  ECU: 'ec', ESA: 'sv', GRN: 'gd', GUA: 'gt', GUY: 'gy', HAI: 'ht',
  HON: 'hn', JAM: 'jm', MEX: 'mx', NCA: 'ni', PAN: 'pa', PAR: 'py',
  PER: 'pe', PUR: 'pr', SKN: 'kn', LCA: 'lc', VIN: 'vc', SUR: 'sr',
  TTO: 'tt', USA: 'us', URU: 'uy', VEN: 've', ISV: 'vi',
  // Asia
  AFG: 'af', BAN: 'bd', BHU: 'bt', BRU: 'bn', CAM: 'kh', CHN: 'cn',
  HKG: 'hk', IND: 'in', INA: 'id', IRI: 'ir', JPN: 'jp', KAZ: 'kz',
  PRK: 'kp', KOR: 'kr', KGZ: 'kg', LAO: 'la', MAC: 'mo', MAS: 'my',
  MDV: 'mv', MGL: 'mn', MYA: 'mm', NEP: 'np', PAK: 'pk', PHI: 'ph',
  SGP: 'sg', SRI: 'lk', TPE: 'tw', TJK: 'tj', THA: 'th', TLS: 'tl',
  TKM: 'tm', UZB: 'uz', VIE: 'vn',
  // Europe
  ALB: 'al', AND: 'ad', ARM: 'am', AUT: 'at', AZE: 'az', BLR: 'by',
  BEL: 'be', BIH: 'ba', BUL: 'bg', CRO: 'hr', CYP: 'cy', CZE: 'cz',
  DEN: 'dk', EST: 'ee', FIN: 'fi', FRA: 'fr', GEO: 'ge', GER: 'de',
  GBR: 'gb', GRE: 'gr', HUN: 'hu', ISL: 'is', IRL: 'ie', ISR: 'il',
  ITA: 'it', KOS: 'xk', LAT: 'lv', LIE: 'li', LTU: 'lt', LUX: 'lu',
  MLT: 'mt', MDA: 'md', MON: 'mc', MNE: 'me', NED: 'nl', MKD: 'mk',
  NOR: 'no', POL: 'pl', POR: 'pt', ROU: 'ro', RUS: 'ru', SMR: 'sm',
  SRB: 'rs', SVK: 'sk', SLO: 'si', ESP: 'es', SWE: 'se', SUI: 'ch',
  TUR: 'tr', UKR: 'ua',
  // Oceania
  AUS: 'au', COK: 'ck', FIJ: 'fj', GUM: 'gu', KIR: 'ki', MHL: 'mh',
  FSM: 'fm', NRU: 'nr', NZL: 'nz', PLW: 'pw', PNG: 'pg', SAM: 'ws',
  SOL: 'sb', TGA: 'to', TUV: 'tv', VAN: 'vu',
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
