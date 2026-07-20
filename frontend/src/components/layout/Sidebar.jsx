import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Home, Trophy, CalendarDays, BarChart3, Medal, Award, Sparkles,
  Users, Shield, Crown, Newspaper, Image, ShoppingBag, School,
  Globe, Upload, Menu, X,
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

function Item({ to, label, icon: Icon, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-blue-600 text-white font-medium'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <Icon size={17} className="shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

export default function Sidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 bg-white border border-gray-200 rounded-lg p-2 shadow-sm"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:sticky top-0 h-screen z-50 md:z-auto
        bg-white border-r border-gray-200 flex flex-col
        w-64 md:w-56 shrink-0
        transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100">
          <NavLink to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <img src="/logo.png" alt="ArabSwiM" className="h-8 w-8 object-contain shrink-0" />
            <div>
              <div className="text-base font-bold text-blue-600 leading-tight">ArabSwiM</div>
              <div className="text-gray-400 text-[10px] leading-tight">Admin</div>
            </div>
          </NavLink>
          <button onClick={() => setOpen(false)} className="md:hidden p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          <Item to="/" label="Home" icon={Home} end onClick={() => setOpen(false)} />
          {GROUPS.map((g) => (
            <div key={g.label}>
              <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {g.label}
              </div>
              <div className="space-y-0.5">
                {g.items.map((item) => (
                  <Item key={item.to} {...item} onClick={() => setOpen(false)} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
