export const POOL_TYPES = [
  { value: 'LCM', label: 'Long Course (50m)' },
  { value: 'SCM', label: 'Short Course (25m)' },
]

export const AGE_GROUPS = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'OPEN']

export const RECORD_TYPES = [
  { value: 'ARAB', label: 'Arab' },
  { value: 'NATIONAL', label: 'National' },
  { value: 'GCC', label: 'GCC' },
]

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
