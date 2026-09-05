import { API_BASE } from './api/client'

// IOC 3-letter code → ISO 3166-1 alpha-2 for flagcdn.com (authoritative map)
export const CODE_TO_ALPHA2 = {
  KSA: 'sa', UAE: 'ae', QAT: 'qa', KWT: 'kw', BHR: 'bh', OMA: 'om',
  EGY: 'eg', JOR: 'jo', LBN: 'lb', SYR: 'sy', IRQ: 'iq', PLE: 'ps',
  YEM: 'ye', LBY: 'ly', TUN: 'tn', ALG: 'dz', MAR: 'ma', SUD: 'sd',
  SOM: 'so', MTN: 'mr', DJI: 'dj', COM: 'km',
  ANG: 'ao', BEN: 'bj', BOT: 'bw', BUR: 'bf', BDI: 'bi', CMR: 'cm',
  CPV: 'cv', CAF: 'cf', CHA: 'td', CGO: 'cg', COD: 'cd', CIV: 'ci',
  GEQ: 'gq', ERI: 'er', SWZ: 'sz', ETH: 'et', GAB: 'ga', GAM: 'gm',
  GHA: 'gh', GUI: 'gn', GBS: 'gw', KEN: 'ke', LES: 'ls', LBR: 'lr',
  MAD: 'mg', MAW: 'mw', MLI: 'ml', MRI: 'mu', MOZ: 'mz', NAM: 'na',
  NIG: 'ne', NGR: 'ng', RWA: 'rw', STP: 'st', SEN: 'sn', SEY: 'sc',
  SLE: 'sl', RSA: 'za', SSD: 'ss', TAN: 'tz', TOG: 'tg', UGA: 'ug',
  ZAM: 'zm', ZIM: 'zw',
  ANT: 'ag', ARG: 'ar', ARU: 'aw', BAH: 'bs', BAR: 'bb', BIZ: 'bz',
  BER: 'bm', BOL: 'bo', BRA: 'br', IVB: 'vg', CAN: 'ca', CAY: 'ky',
  CHI: 'cl', COL: 'co', CRC: 'cr', CUB: 'cu', DMA: 'dm', DOM: 'do',
  ECU: 'ec', ESA: 'sv', GRN: 'gd', GUA: 'gt', GUY: 'gy', HAI: 'ht',
  HON: 'hn', JAM: 'jm', MEX: 'mx', NCA: 'ni', PAN: 'pa', PAR: 'py',
  PER: 'pe', PUR: 'pr', SKN: 'kn', LCA: 'lc', VIN: 'vc', SUR: 'sr',
  TTO: 'tt', USA: 'us', URU: 'uy', VEN: 've', ISV: 'vi',
  AFG: 'af', BAN: 'bd', BHU: 'bt', BRU: 'bn', CAM: 'kh', CHN: 'cn',
  HKG: 'hk', IND: 'in', INA: 'id', IRI: 'ir', JPN: 'jp', KAZ: 'kz',
  PRK: 'kp', KOR: 'kr', KGZ: 'kg', LAO: 'la', MAC: 'mo', MAS: 'my',
  MDV: 'mv', MGL: 'mn', MYA: 'mm', NEP: 'np', PAK: 'pk', PHI: 'ph',
  SGP: 'sg', SRI: 'lk', TPE: 'tw', TJK: 'tj', THA: 'th', TLS: 'tl',
  TKM: 'tm', UZB: 'uz', VIE: 'vn',
  ALB: 'al', AND: 'ad', ARM: 'am', AUT: 'at', AZE: 'az', BLR: 'by',
  BEL: 'be', BIH: 'ba', BUL: 'bg', CRO: 'hr', CYP: 'cy', CZE: 'cz',
  DEN: 'dk', EST: 'ee', FIN: 'fi', FRA: 'fr', GEO: 'ge', GER: 'de',
  GBR: 'gb', GRE: 'gr', HUN: 'hu', ISL: 'is', IRL: 'ie', ISR: 'il',
  ITA: 'it', KOS: 'xk', LAT: 'lv', LIE: 'li', LTU: 'lt', LUX: 'lu',
  MLT: 'mt', MDA: 'md', MON: 'mc', MNE: 'me', NED: 'nl', MKD: 'mk',
  NOR: 'no', POL: 'pl', POR: 'pt', ROU: 'ro', RUS: 'ru', SMR: 'sm',
  SRB: 'rs', SVK: 'sk', SLO: 'si', ESP: 'es', SWE: 'se', SUI: 'ch',
  TUR: 'tr', UKR: 'ua',
  AUS: 'au', COK: 'ck', FIJ: 'fj', GUM: 'gu', KIR: 'ki', MHL: 'mh',
  FSM: 'fm', NRU: 'nr', NZL: 'nz', PLW: 'pw', PNG: 'pg', SAM: 'ws',
  SOL: 'sb', TGA: 'to', TUV: 'tv', VAN: 'vu',
  KUW: 'kw', LBA: 'ly', LIB: 'lb', BRN: 'bh',
  // Territories that appear at World Aquatics meets under their own codes
  MAA: 'sx', NMA: 'mp',
  // British home nations → flag-icons GB subdivision flags
  ENG: 'gb-eng', WAL: 'gb-wls', SCO: 'gb-sct', NIR: 'gb-nir',
}

export const ARAB_COUNTRY_CODES = new Set([
  'ALG', 'DZA', 'BHR', 'BRN', 'BAH', 'COM', 'DJI', 'EGY', 'UAR',
  'IRQ', 'JOR', 'KWT', 'KUW', 'LBN', 'LIB', 'LBY', 'LBA',
  'MTN', 'MRT', 'MAR', 'MOR', 'OMA', 'OMN', 'PLE', 'PAL', 'PSE',
  'QAT', 'KSA', 'SAU', 'SOM', 'SUD', 'SDN', 'SYR', 'TUN',
  'UAE', 'ARE', 'YEM',
])

export const POOL_TYPES = [
  { value: 'LCM', label: 'Long Course (50m)' },
  { value: 'SCM', label: 'Short Course (25m)' },
]

export const AGE_GROUPS = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'OPEN']

export const RECORD_TYPES = [
  { value: 'ARAB', label: 'Arab' },
  { value: 'NATIONAL', label: 'National' },
  { value: 'GCC', label: 'GCC' },
  { value: 'AFRICAN', label: 'African' },
  { value: 'ASIAN', label: 'Asian' },
  { value: 'MEDITERRANEAN', label: 'Mediterranean' },
  { value: 'ISLAMIC', label: 'Islamic' },
  { value: 'WORLD', label: 'World' },
]

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function formatDate(value) {
  if (!value) return ''
  const s = String(value)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${parseInt(m[3])} ${MONTHS_SHORT[parseInt(m[2]) - 1]} ${m[1]}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${parseInt(m[1])} ${MONTHS_SHORT[parseInt(m[2]) - 1]} ${m[3]}`
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return s
  return `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]} ${dt.getFullYear()}`
}

export function formatDateRange(start, end) {
  if (!start) return ''
  if (!end || end === start) return formatDate(start)
  return `${formatDate(start)} — ${formatDate(end)}`
}

// centiseconds → "M:SS.hh" / "SS.hh"
export function formatTime(centiseconds) {
  if (centiseconds == null || centiseconds === '') return '—'
  const cs = Number(centiseconds)
  if (Number.isNaN(cs)) return String(centiseconds)
  const minutes = Math.floor(cs / 6000)
  const seconds = Math.floor((cs % 6000) / 100)
  const centis = Math.round(cs % 100)
  if (minutes) return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  return `${seconds}.${String(centis).padStart(2, '0')}`
}

// "M:SS.hh" or "SS.hh" → centiseconds
export function parseTime(timeStr) {
  if (!timeStr) return null
  const parts = String(timeStr).split(':')
  let minutes = 0
  let rest = parts[0]
  if (parts.length === 2) { minutes = parseInt(parts[0]) || 0; rest = parts[1] }
  const [sec, cent = '0'] = rest.split('.')
  return minutes * 6000 + (parseInt(sec) || 0) * 100 + parseInt(cent.padEnd(2, '0').slice(0, 2))
}

const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, '')
export function mediaUrl(path) {
  if (!path) return ''
  if (String(path).startsWith('http')) return path
  return `${API_ORIGIN}${path}`
}

export function flagAlpha2(code) {
  return CODE_TO_ALPHA2[code?.toUpperCase()] || ''
}

// Display name convention: "Given SURNAME" — surnames already stored uppercase.
export function formatNumber(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US')
}
