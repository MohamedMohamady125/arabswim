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
  MAA: 'sx', NMA: 'mp', TCN: 'tc', CUR: 'cw', FAR: 'fo', FRO: 'fo',
  ASA: 'as', AGU: 'ai',
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
  { value: 'OLYMPIC', label: 'Olympic' },
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
  // Parse both dates
  const _p = (s) => { const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null }
  const a = _p(start), b = _p(end)
  if (!a || !b) return `${formatDate(start)} — ${formatDate(end)}`
  // Same year + same month: "23-25 May 2026"
  if (a.y === b.y && a.m === b.m) return `${a.d}-${b.d} ${MONTHS_SHORT[a.m - 1]} ${a.y}`
  // Same year, different month: "28 Jun - 3 Jul 2026"
  if (a.y === b.y) return `${a.d} ${MONTHS_SHORT[a.m - 1]} - ${b.d} ${MONTHS_SHORT[b.m - 1]} ${a.y}`
  // Different year: "29 Dec 2025 - 2 Jan 2026"
  return `${formatDate(start)} - ${formatDate(end)}`
}

// centiseconds → "H:MM:SS.hh" / "M:SS.hh" / "SS.hh"
// Hours appear for long open-water swims that run past an hour.
export function formatTime(centiseconds) {
  if (centiseconds == null || centiseconds === '') return '—'
  const cs = Number(centiseconds)
  if (Number.isNaN(cs)) return String(centiseconds)
  const hours = Math.floor(cs / 360000)
  const minutes = Math.floor((cs % 360000) / 6000)
  const seconds = Math.floor((cs % 6000) / 100)
  const centis = Math.round(cs % 100)
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  if (minutes) return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  return `${seconds}.${String(centis).padStart(2, '0')}`
}

// "H:MM:SS.hh", "M:SS.hh" or "SS.hh" → centiseconds
export function parseTime(timeStr) {
  if (!timeStr) return null
  const parts = String(timeStr).split(':')
  let hours = 0
  let minutes = 0
  let rest = parts[parts.length - 1]
  if (parts.length === 3) {
    hours = parseInt(parts[0]) || 0
    minutes = parseInt(parts[1]) || 0
  } else if (parts.length === 2) {
    minutes = parseInt(parts[0]) || 0
  }
  const [sec, cent = '0'] = rest.split('.')
  return hours * 360000 + minutes * 6000 + (parseInt(sec) || 0) * 100 + parseInt(cent.padEnd(2, '0').slice(0, 2))
}

const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, '')
export function mediaUrl(path) {
  if (!path) return ''
  if (String(path).startsWith('http')) return path
  return `${API_ORIGIN}${path}`
}

// A copy of an upload sized for the slot that shows it. The backend serves
// /img/<width>/<path> (core/images.py): resized, rotated upright, WebP when
// supported, cached. Anything that is not one of our own uploads is returned
// unchanged. `width` is the slot's CSS width; the server rounds it up.
export function imgUrl(path, width, { trim = false } = {}) {
  const url = mediaUrl(path)
  if (!url || !width) return url
  const i = url.indexOf('/media/')
  if (i === -1 || /\.(gif|svg)(\?|#|$)/i.test(url)) return url
  try {
    if (new URL(url).host !== new URL(API_ORIGIN).host) return url
  } catch {
    return url
  }
  return `${url.slice(0, i)}/img/${Math.max(1, Math.round(width))}/${url.slice(i + 7)}${trim ? '?trim=1' : ''}`
}

export function flagAlpha2(code) {
  return CODE_TO_ALPHA2[code?.toUpperCase()] || ''
}

// Display name convention: "Given SURNAME" — surnames already stored uppercase.
export function formatNumber(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US')
}

// Avatar letters for a person or club name. Arabic letters join into ligatures,
// so several initials read as a broken word: an Arabic name shows one letter
// (skipping the article "ال"). One word gives its first letters instead.
export function nameInitials(name, max = 2) {
  const words = String(name || '').replace(/[\u064B-\u065F\u0670]/g, '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (/[\u0600-\u06FF]/.test(words[0])) {
    const w = words.find((x) => !/^(نادي|اكاديمية|أكاديمية)$/.test(x)) || words[0]
    return w.replace(/^ال/, '')[0] || w[0]
  }
  if (words.length === 1 && max > 2) return words[0].slice(0, max).toUpperCase()
  return words.slice(0, max).map((w) => w[0]).join('').toUpperCase()
}

// Rule (2026-11-19): every record widget names its swim as "100 M Freestyle | LCM"
// — the event exactly as stored, a bar, the pool code. Open water has no pool code.
export const recordEventLabel = (eventName, pool) =>
  `${eventName || ''}${pool && pool !== 'OW' ? ` | ${pool}` : ''}`

// ---- age categories in a meet's results -----------------------------------
// A category is shown exactly as the meet's file names it ("19 and above",
// "19+", "Men's 18/Under"). To tell whether two names are the same group
// (a program line and its results, a filter and a row) compare their keys:
// every spelling of a group has one key, '' meaning open / no category.
// Mirrors backend core/age_categories.py `category_key` — keep them in step.
const CAT_GENDER = /\b(men|women|mens|womens|boys|girls|boy|girl|male|female|mixed|mixte|garcons|garçons|filles|messieurs|dames|hommes|femmes)(?:['‘’]s|s['‘’]|['‘’])?(?=[^\p{L}\p{N}_]|$)/giu
const CAT_OPEN = new Set(['', 'open', 'tc', 'toutes categories', 'toutes catégories', 'cat generale', 'cat générale',
  'generale', 'générale', 'categorie generale', 'catégorie générale', 'general', 'all ages', 'absolute'])
const CAT_UNDER = [/\b(?:u|under)\s*[-/]?\s*(\d{1,2})\b/, /\b(\d{1,2})\s*(?:[/&-]|and|et)?\s*(?:under|below|younger|u|moins)\b/]
const CAT_OVER = [/\b(\d{1,2})\s*(?:\+|plus\b)/, /\b(\d{1,2})\s*(?:[/&-]|and|et)?\s*(?:over|above|older|up|o)\b/, /\b(?:over|above)\s*(\d{1,2})\b/]
const CAT_RANGE = /\b(\d{1,2})\s*(?:-|–|—|to|a|à|\/)\s*(\d{1,2})\b/
export const normCategory = (s) => {
  let low = (s || '').toString().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  if (low.toLowerCase() === 'nan') return ''
  low = low.replace(CAT_GENDER, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–—/&,.]+|[\s\-–—/&,.]+$/g, '').toLowerCase()
  if (CAT_OPEN.has(low.replace(/[\s.-]+/g, ' ').trim())) return ''
  for (const rx of CAT_UNDER) { const m = low.match(rx); if (m) return `U${Number(m[1])}` }
  const r = low.match(CAT_RANGE)
  if (r && Number(r[1]) <= Number(r[2])) return `${Number(r[1])}-${Number(r[2])}`
  for (const rx of CAT_OVER) { const m = low.match(rx); if (m) return `${Number(m[1])}+` }
  return low.replace(/[\s_-]+/g, '')
}

// Split an event's results into one group per age category, in the order the
// categories first appear (the order of the results file). `only` keeps a
// single category (a program line that names one). Each category is its own
// race with its own podium, so they must never be listed as one ranking.
export function resultsByCategory(rows, only = '') {
  const want = normCategory(only)
  const hasCats = rows.some((r) => normCategory(r.category))
  if (!hasCats) return [{ category: '', rows }]
  const groups = []
  rows.forEach((r) => {
    const key = normCategory(r.category)
    if (want && key !== want) return
    let g = groups.find((x) => x.key === key)
    if (!g) { g = { key, category: r.category || '', rows: [] }; groups.push(g) }
    g.rows.push(r)
  })
  return groups
}


// Fully tied rows (same medals, points, time…) are listed alphabetically by name
export const nameOf = (x) => {
  const v = x?.name ?? x?.swimmer_name ?? x?.swimmer__name ?? x?.team_name ?? x?.result__team
    ?? x?.team ?? x?.nationality__name ?? x?.rec?.swimmer ?? x?.swimmer ?? ''
  return typeof v === 'string' ? v : ''
}
export const nameTie = (a, b) => nameOf(a).localeCompare(nameOf(b))
