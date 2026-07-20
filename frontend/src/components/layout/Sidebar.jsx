import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
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

function SidebarContent({ onClose }) {
  return (
    <>
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 shrink-0">
        <NavLink to="/" className="flex items-center gap-2.5" onClick={onClose}>
          <img src="/logo.png" alt="ArabSwiM" className="h-8 w-8 object-contain shrink-0" />
          <div>
            <div className="text-base font-bold text-blue-600 leading-tight">ArabSwiM</div>
            <div className="text-gray-400 text-[10px] leading-tight">Admin</div>
          </div>
        </NavLink>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        <Item to="/" label="Home" icon={Home} end onClick={onClose} />
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {g.label}
            </div>
            <div className="space-y-0.5">
              {g.items.map((item) => (
                <Item key={item.to} {...item} onClick={onClose} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </>
  )
}

export default function Sidebar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // Close drawer on navigation
  useState(() => {
    setOpen(false)
  }, [location.pathname])

  return (
    <>
      {/* ── Mobile: hamburger + drawer ── */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-2.5 left-2.5 z-50 bg-white border border-gray-200 rounded-lg p-1.5 shadow-md"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col shadow-xl">
            <SidebarContent onClose={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* ── Desktop: static sidebar ── */}
      <aside className="hidden md:flex w-56 shrink-0 bg-white border-r border-gray-200 flex-col h-screen sticky top-0">
        <SidebarContent />
      </aside>
    </>
  )
}
