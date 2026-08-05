import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Search, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const NAV = [
  {
    label: 'Competition',
    links: [
      ['Championships', '/championships'],
      ['Records', '/records'],
      ['Calendar', '/calendar'],
      ['New records', '/new-records'],
      ['Rankings', '/rankings'],
      ['Medals', '/medals'],
      ['Qualifying times', '/qualifying-times'],
      ['Predictions', '/predictions'],
    ],
  },
  {
    label: 'People',
    links: [
      ['Swimmers', '/swimmers'],
      ['Coaches', '/coaches'],
      ['Clubs / Teams', '/teams'],
      ['Compare', '/compare'],
      ['Hall of Fame', '/hall-of-fame'],
    ],
  },
  {
    label: 'Content',
    links: [
      ['News', '/news'],
      ['Media', '/media'],
      ['Marketplace', '/market'],
    ],
  },
  {
    label: 'Data',
    links: [
      ['Federations', '/countries'],
    ],
  },
]

function SearchBox({ compact = false, onDone }) {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const submit = (e) => {
    e.preventDefault()
    if (!q.trim()) return
    navigate(`/swimmers?search=${encodeURIComponent(q.trim())}`)
    onDone?.()
  }
  return (
    <form onSubmit={submit} style={{ display: 'flex', alignItems: 'center', gap: 8, width: compact ? '100%' : 320 }}>
      <input
        className="input"
        style={{ height: 34, minHeight: 34 }}
        placeholder="Search swimmers, meets, clubs"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <button className="btn btn-primary" style={{ height: 34 }} type="submit">
        {compact ? <Search size={15} /> : 'Search'}
      </button>
    </form>
  )
}

function Header() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { isAdmin, isAuthed, user, logout } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { setOpen(false) }, [location])

  return (
    <header>
      {isAuthed && (
        <div className="rule-b" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 32px', background: 'var(--color-surface)' }}>
          <span className="kicker">{isAdmin ? 'Admin' : user?.username || 'Account'}</span>
          {isAdmin && <Link to="/import" style={{ fontSize: 13, fontWeight: 600 }}>Import data</Link>}
          {isAdmin && <Link to="/admin" style={{ fontSize: 13, fontWeight: 600 }}>Dashboard</Link>}
          {user?.role === 'ATHLETE' && user?.swimmer && (
            <Link to={`/swimmers/${user.swimmer}`} style={{ fontSize: 13, fontWeight: 600 }}>My profile</Link>
          )}
          {(user?.role === 'CLUB' || user?.role === 'FEDERATION') && user?.team && (
            <Link to={`/teams/${user.team}`} style={{ fontSize: 13, fontWeight: 600 }}>My club</Link>
          )}
          <button
            className="btn btn-secondary"
            style={{ height: 28, marginLeft: 'auto', fontSize: 12 }}
            onClick={() => { logout(); navigate('/') }}
          >
            Sign out
          </button>
        </div>
      )}
      {/* brand bar */}
      <div className="rule-b" style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '14px 32px' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 'auto', textDecoration: 'none', color: 'inherit' }}>
          <img src="/logo.png" alt="ArabSwiM" style={{ width: 44, height: 44, objectFit: 'contain' }} />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>ARABSWIM</span>
          <span className="micro hide-mobile">Arab Swimming Database</span>
        </Link>
        <div className="hide-mobile"><SearchBox /></div>
        <button className="btn btn-icon btn-secondary show-mobile-flex" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* four-area nav grid (desktop) */}
      <div className="hide-mobile rule-b" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr 0.8fr' }}>
        {NAV.map((group, i) => (
          <div key={group.label} className="asw-navcol" style={{ padding: '16px 32px', borderRight: i < NAV.length - 1 ? '1px solid var(--color-divider)' : 'none' }}>
            <div className="kicker" style={{ marginBottom: 6 }}>{group.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              {group.links.map(([label, to]) => (
                <NavLink key={to} to={to}>{label}</NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* mobile drawer */}
      {open && (
        <div className="show-mobile rule-b" style={{ padding: '16px' }}>
          <div style={{ marginBottom: 14 }}><SearchBox compact onDone={() => setOpen(false)} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {NAV.map((group) => (
              <div key={group.label} className="asw-navcol">
                <div className="kicker" style={{ marginBottom: 6 }}>{group.label}</div>
                {group.links.map(([label, to]) => (
                  <NavLink key={to} to={to} style={{ fontSize: 14, lineHeight: 2.2 }}>{label}</NavLink>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}

function Footer() {
  const { isAdmin } = useAuth()
  return (
    <footer className="rule-t" style={{ background: 'var(--color-accent-800)', color: '#ffffff', padding: '32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <img src="/logo.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>ARABSWIM</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-accent-2-300)', maxWidth: 480 }}>
        Results, records and rankings for Arab swimming — every meet, every swimmer, one home.
      </p>
      <a
        href="https://instagram.com/arab.swim"
        target="_blank"
        rel="noreferrer"
        style={{ color: '#ffffff', fontSize: 13 }}
      >
        @arab.swim on Instagram ↗
      </a>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 24, marginTop: 24 }}>
        {NAV.map((group) => (
          <div key={group.label}>
            <div className="kicker" style={{ color: 'var(--color-accent-2-400)', marginBottom: 8 }}>{group.label}</div>
            {group.links.map(([label, to]) => (
              <Link key={to} to={to} style={{ display: 'block', color: '#ffffff', textDecoration: 'none', fontSize: 12, lineHeight: 2 }}>{label}</Link>
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid var(--color-accent-700)', fontSize: 12, color: 'var(--color-accent-2-400)' }}>
        <span>© {new Date().getFullYear()} ArabSwiM — Arab Swim</span>
        <Link to={isAdmin ? '/import' : '/login'} style={{ color: 'var(--color-accent-2-400)', marginLeft: 16, fontSize: 12 }}>
          {isAdmin ? 'Import data' : 'Sign in'}
        </Link>
      </div>
    </footer>
  )
}

export default function Layout() {
  const location = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])
  return (
    <div className="shell">
      <Header />
      <main className="shell-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
