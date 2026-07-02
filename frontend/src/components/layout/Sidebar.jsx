import { NavLink } from 'react-router-dom'
import {
  Home, Trophy, CalendarDays, BarChart3, Medal, Award, Sparkles,
  Users, Shield, Crown, Newspaper, Image, ShoppingBag, School,
  Globe, Upload,
} from 'lucide-react'

const GROUPS = [
  {
    label: 'Competition',
    items: [
      { to: '/championships', label: 'Championships', icon: Trophy },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/rankings', label: 'Rankings', icon: BarChart3 },
      { to: '/records', label: 'Records', icon: Award },
      { to: '/new-records', label: 'New Records', icon: Sparkles },
      { to: '/medals', label: 'Medals', icon: Medal },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/swimmers', label: 'Swimmers', icon: Users },
      { to: '/teams', label: 'Teams', icon: Shield },
      { to: '/hall-of-fame', label: 'Hall of Fame', icon: Crown },
    ],
  },
  {
    label: 'Content',
    items: [
      { to: '/news', label: 'News', icon: Newspaper },
      { to: '/media', label: 'Media', icon: Image },
      { to: '/market', label: 'Market', icon: ShoppingBag },
      { to: '/academies', label: 'Academies', icon: School },
    ],
  },
  {
    label: 'Data',
    items: [
      { to: '/countries', label: 'Countries', icon: Globe },
      { to: '/import', label: 'Import', icon: Upload },
    ],
  },
]

function Item({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-blue-600 text-white font-medium'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <Icon size={17} className="shrink-0" />
      <span className="hidden lg:inline truncate">{label}</span>
    </NavLink>
  )
}

export default function Sidebar() {
  return (
    <aside className="w-14 lg:w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
      <NavLink to="/" className="flex items-center gap-2.5 px-3 lg:px-4 h-16 border-b border-gray-100">
        <img src="/logo.png" alt="ArabSwiM" className="h-8 w-8 object-contain shrink-0" />
        <div className="hidden lg:block">
          <div className="text-base font-bold text-blue-600 leading-tight">ArabSwiM</div>
          <div className="text-gray-400 text-[10px] leading-tight">Admin</div>
        </div>
      </NavLink>
      <nav className="flex-1 overflow-y-auto px-2 lg:px-3 py-3 space-y-4">
        <Item to="/" label="Home" icon={Home} end />
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="hidden lg:block px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {g.label}
            </div>
            <div className="space-y-0.5">
              {g.items.map((item) => (
                <Item key={item.to} {...item} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
