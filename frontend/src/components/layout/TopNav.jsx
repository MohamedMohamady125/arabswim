import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown, Menu, X, Upload, BarChart3, LogOut, Plus,
  Trophy, CalendarDays, Medal, Award, Sparkles, Users, Shield, Crown,
  Newspaper, Image, ShoppingBag, Globe, Target, Handshake, UserCheck, ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

/** Primary links shown directly in the bar on desktop. */
const PRIMARY = [
  { to: '/championships', label: 'Championships' },
  { to: '/records', label: 'Records' },
  { to: '/rankings', label: 'Rankings' },
  { to: '/medals', label: 'Medals' },
  { to: '/swimmers', label: 'Swimmers' },
  { to: '/calendar', label: 'Calendar' },
]

/** Everything else lives under "More". */
const MORE = [
  { to: '/new-records', label: 'New Records', icon: Sparkles },
  { to: '/qualifying-times', label: 'Qualifying Times', icon: Target },
  { to: '/teams', label: 'Teams', icon: Shield },
  { to: '/hall-of-fame', label: 'Hall of Fame', icon: Crown },
  { to: '/countries', label: 'Federations', icon: Globe },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/media', label: 'Media', icon: Image },
  { to: '/market', label: 'Market', icon: ShoppingBag },
  { to: '/sponsors', label: 'Partnerships', icon: Handshake },
  { to: '/coaches', label: 'Coaches', icon: UserCheck },
]

/** Grouped links for the mobile full-screen menu. */
const MOBILE_GROUPS = [
  {
    label: 'Competition',
    items: [
      { to: '/championships', label: 'Championships', icon: Trophy },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/rankings', label: 'Rankings', icon: BarChart3 },
      { to: '/records', label: 'Records', icon: Award },
      { to: '/new-records', label: 'New Records', icon: Sparkles },
      { to: '/medals', label: 'Medals', icon: Medal },
      { to: '/qualifying-times', label: 'Qualifying Times', icon: Target },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/swimmers', label: 'Swimmers', icon: Users },
      { to: '/teams', label: 'Teams', icon: Shield },
      { to: '/hall-of-fame', label: 'Hall of Fame', icon: Crown },
      { to: '/countries', label: 'Federations', icon: Globe },
    ],
  },
  {
    label: 'More',
    items: [
      { to: '/news', label: 'News', icon: Newspaper },
      { to: '/media', label: 'Media', icon: Image },
      { to: '/market', label: 'Market', icon: ShoppingBag },
      { to: '/sponsors', label: 'Partnerships', icon: Handshake },
      { to: '/coaches', label: 'Coaches', icon: UserCheck },
    ],
  },
]

const ADMIN_ITEMS = [
  { to: '/import', label: 'Import Results', icon: Upload },
  { to: '/rankings', label: 'Reports', icon: BarChart3 },
  { to: '/championships/new', label: 'New Meet', icon: Plus },
  { to: '/swimmers/new', label: 'New Swimmer', icon: Plus },
  { to: '/records/new', label: 'New Record', icon: Plus },
]

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onOutside])
}

function MoreDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const location = useLocation()
  useClickOutside(ref, () => setOpen(false))
  useEffect(() => setOpen(false), [location.pathname])
  const active = MORE.some((i) => location.pathname.startsWith(i.to))

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-1 h-14 px-3 text-body-sm font-medium transition-colors border-b-2 ${
          active ? 'text-white border-aqua-400' : 'text-ink-200 border-transparent hover:text-white'
        }`}
      >
        More
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute end-0 top-full mt-1 w-56 bg-white rounded-md shadow-pop border border-ink-100 py-1.5 z-50">
          {MORE.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3.5 py-2 text-body-sm transition-colors ${
                  isActive ? 'text-aqua-600 font-medium bg-aqua-50' : 'text-ink-700 hover:bg-ink-50'
                }`
              }
            >
              <Icon size={15} className="shrink-0 text-ink-400" />
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

function AdminMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()
  useClickOutside(ref, () => setOpen(false))
  useEffect(() => setOpen(false), [location.pathname])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/10 text-white text-body-sm font-medium hover:bg-white/15 transition-colors"
      >
        <ShieldCheck size={15} className="text-aqua-400" />
        Admin
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute end-0 top-full mt-1 w-52 bg-white rounded-md shadow-pop border border-ink-100 py-1.5 z-50">
          {ADMIN_ITEMS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to + label}
              to={to}
              className="flex items-center gap-2.5 px-3.5 py-2 text-body-sm text-ink-700 hover:bg-ink-50 transition-colors"
            >
              <Icon size={15} className="shrink-0 text-ink-400" />
              {label}
            </Link>
          ))}
          <div className="my-1 border-t border-ink-100" />
          <button
            onClick={() => { logout(); navigate('/') }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-body-sm text-neg hover:bg-ink-50 transition-colors"
          >
            <LogOut size={15} className="shrink-0" />
            Logout
          </button>
        </div>
      )}
    </div>
  )
}

function MobileMenu({ onClose, isAdmin }) {
  const navigate = useNavigate()
  const { logout } = useAuth()
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div className="fixed inset-0 z-[70] bg-ink-950 overflow-y-auto md:hidden">
      <div className="flex items-center justify-between h-14 px-4 border-b border-white/10">
        <Link to="/" onClick={onClose} className="flex items-center gap-2.5">
          <img src="/logo.webp" alt="" className="h-8 w-8 object-contain" />
          <span className="font-display font-bold text-white text-lg">ArabSwiM</span>
        </Link>
        <button onClick={onClose} aria-label="Close menu" className="p-2 -me-2 min-h-11 min-w-11 flex items-center justify-center text-ink-200 hover:text-white">
          <X size={22} />
        </button>
      </div>
      <nav className="px-4 py-5 space-y-6 pb-10">
        {MOBILE_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="text-label text-ink-400 mb-2">{g.label}</div>
            <div className="grid grid-cols-2 gap-1">
              {g.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2.5 min-h-11 rounded-sm text-sm transition-colors ${
                      isActive ? 'bg-white/10 text-white font-medium' : 'text-ink-200 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  <Icon size={17} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
        {isAdmin && (
          <div>
            <div className="text-label text-aqua-400 mb-2">Admin</div>
            <div className="grid grid-cols-2 gap-1">
              {ADMIN_ITEMS.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to + label}
                  to={to}
                  onClick={onClose}
                  className="flex items-center gap-2.5 px-3 py-2.5 min-h-11 rounded-sm text-sm text-ink-200 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <Icon size={17} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              ))}
              <button
                onClick={() => { onClose(); logout(); navigate('/') }}
                className="flex items-center gap-2.5 px-3 py-2.5 min-h-11 rounded-sm text-sm text-neg/90 hover:bg-white/5 transition-colors"
              >
                <LogOut size={17} className="shrink-0" />
                Logout
              </button>
            </div>
          </div>
        )}
      </nav>
    </div>
  )
}

export default function TopNav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { token } = useAuth()
  const isAdmin = !!token
  const location = useLocation()
  useEffect(() => setMenuOpen(false), [location.pathname])

  return (
    <header className="sticky top-0 z-40 bg-ink-950 text-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 flex items-center h-14 gap-2">
        <Link to="/" className="flex items-center gap-2.5 me-4 shrink-0">
          <img src="/logo.webp" alt="" className="h-8 w-8 object-contain" />
          <span className="font-display font-bold text-lg tracking-tight">ArabSwiM</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center flex-1 min-w-0">
          {PRIMARY.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center h-14 px-3 text-body-sm font-medium transition-colors border-b-2 ${
                  isActive ? 'text-white border-aqua-400' : 'text-ink-200 border-transparent hover:text-white'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
          <MoreDropdown />
        </nav>

        <div className="flex items-center gap-2 ms-auto">
          {isAdmin && <div className="hidden md:block"><AdminMenu /></div>}
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="md:hidden p-2 -me-2 min-h-11 min-w-11 flex items-center justify-center text-ink-200 hover:text-white"
          >
            <Menu size={22} />
          </button>
        </div>
      </div>
      {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} isAdmin={isAdmin} />}
    </header>
  )
}
