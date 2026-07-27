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

// Record scopes stored manually in the Record table (not computed from results)
export const MANUAL_RECORD_SCOPES = RECORD_TYPES.filter(
  t => !['ARAB', 'NATIONAL', 'GCC'].includes(t.value)
)

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Site-wide date format: day month year (e.g. "5 Jun 2026")
export function formatDate(value) {
  if (!value) return ''
  const s = String(value)
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) {
    return `${parseInt(match[3])} ${MONTHS_SHORT[parseInt(match[2]) - 1]} ${match[1]}`
  }
  match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) {
    return `${parseInt(match[1])} ${MONTHS_SHORT[parseInt(match[2]) - 1]} ${match[3]}`
  }
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return s
  return `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]} ${dt.getFullYear()}`
}

export function formatDateRange(start, end) {
  if (!start) return ''
  if (!end || end === start) return formatDate(start)
  return `${formatDate(start)} — ${formatDate(end)}`
}

export function formatTime(centiseconds) {
  const minutes = Math.floor(centiseconds / 6000)
  const seconds = Math.floor((centiseconds % 6000) / 100)
  const centis = centiseconds % 100
  if (minutes) {
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  }
  return `${seconds}.${String(centis).padStart(2, '0')}`
}

export const ARAB_COUNTRY_CODES = new Set([
  'ALG', 'DZA', 'BHR', 'BRN', 'BAH', 'COM', 'DJI', 'EGY', 'UAR',
  'IRQ', 'JOR', 'KWT', 'KUW', 'LBN', 'LIB', 'LBY', 'LBA',
  'MTN', 'MRT', 'MAR', 'MOR', 'OMA', 'OMN', 'PLE', 'PAL', 'PSE',
  'QAT', 'KSA', 'SAU', 'SOM', 'SUD', 'SDN', 'SYR', 'TUN',
  'UAE', 'ARE', 'YEM',
])

// Resolve a media URL (e.g. /media/...) to the full backend URL
const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/api\/v1\/?$/, '')
export function mediaUrl(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return API_ORIGIN ? `${API_ORIGIN}${path}` : path
}

export function parseTime(timeStr) {
  const parts = timeStr.split(':')
  let minutes = 0, rest
  if (parts.length === 2) {
    minutes = parseInt(parts[0])
    rest = parts[1]
  } else {
    rest = parts[0]
  }
  const [sec, centis] = rest.split('.')
  return minutes * 6000 + parseInt(sec) * 100 + parseInt(centis || '0')
}
