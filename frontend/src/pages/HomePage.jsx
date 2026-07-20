import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Trophy, CalendarDays, BarChart3, Medal, Award, Sparkles,
  Users, Shield, Crown, Newspaper, Image, ShoppingBag, School,
  Globe, Upload,
} from 'lucide-react'
import api from '../api/client'

const SECTIONS = [
  { to: '/swimmers', label: 'Swimmers', icon: Users, countKey: 'swimmers' },
  { to: '/championships', label: 'Championships', icon: Trophy, countKey: 'championships' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/rankings', label: 'Rankings', icon: BarChart3 },
  { to: '/records', label: 'Records', icon: Award },
  { to: '/new-records', label: 'New Records', icon: Sparkles },
  { to: '/medals', label: 'Medals', icon: Medal },
  { to: '/teams', label: 'Teams', icon: Shield, countKey: 'teams' },
  { to: '/hall-of-fame', label: 'Hall of Fame', icon: Crown, countKey: 'fame' },
  { to: '/news', label: 'News', icon: Newspaper, countKey: 'news' },
  { to: '/media', label: 'Media', icon: Image, countKey: 'albums' },
  { to: '/market', label: 'Market', icon: ShoppingBag, countKey: 'listings' },
  { to: '/academies', label: 'Academies', icon: School, countKey: 'academies' },
  { to: '/countries', label: 'Countries', icon: Globe, countKey: 'countries' },
  { to: '/import', label: 'Import', icon: Upload },
]

// endpoint -> how to read a count out of the response
const COUNT_SOURCES = {
  swimmers: ['/swimmers/', 'paginated'],
  championships: ['/championships/', 'paginated'],
  teams: ['/teams/', 'array'],
  fame: ['/hall-of-fame/', 'array'],
  news: ['/news/', 'paginated'],
  albums: ['/media/albums/', 'array'],
  listings: ['/market/listings/', 'paginated'],
  academies: ['/academies/', 'paginated'],
  countries: ['/countries/', 'array'],
}

export default function HomePage() {
  const [counts, setCounts] = useState({})

  useEffect(() => {
    let cancelled = false
    Object.entries(COUNT_SOURCES).forEach(([key, [url, kind]]) => {
      api.get(url, { params: kind === 'paginated' ? { page_size: 1 } : {} })
        .then((res) => {
          if (cancelled) return
          const n = kind === 'array'
            ? (Array.isArray(res.data) ? res.data.length : res.data?.count ?? 0)
            : res.data?.count ?? (Array.isArray(res.data) ? res.data.length : 0)
          setCounts((c) => ({ ...c, [key]: n }))
        })
        .catch(() => {})
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-5 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Welcome to ArabSwiM</h1>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">Manage every section of the Arab Swim platform from one place.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4">
        {SECTIONS.map(({ to, label, icon: Icon, countKey }) => (
          <Link
            key={to}
            to={to}
            className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 text-white p-3.5 sm:p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            <Icon size={22} className="opacity-90 sm:w-[26px] sm:h-[26px]" />
            <div className="mt-2.5 sm:mt-4 font-semibold text-xs sm:text-sm">{label}</div>
            <div className="text-blue-200 text-xs mt-0.5 h-4">
              {countKey && counts[countKey] !== undefined
                ? `${counts[countKey].toLocaleString()} items`
                : '\u00A0'}
            </div>
            <Icon size={90} className="absolute -right-4 -bottom-5 opacity-10 group-hover:opacity-20 transition-opacity" />
          </Link>
        ))}
      </div>
    </div>
  )
}
