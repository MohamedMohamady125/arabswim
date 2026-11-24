import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { Menu, Search, X } from 'lucide-react'

import { IconInstagram, IconFacebook, IconYoutube, IconTiktok, IconX } from './SocialIcons'
import { useAuth } from '../context/AuthContext'
import { useFeatures } from '../context/FeaturesContext'
import Partners from './Partners'
import api from '../api/client'
import Flag from './Flag'
import { Loading } from './ui'
import { usePrelaunch, pathAllowed } from '../prelaunch'

// nav path → launch-toggle key (sections the admin can hide)
const FEATURE_PATHS = {
  '/coaches': 'coaches',
  '/referees': 'referees',
  '/hall-of-fame': 'hall_of_fame',
  '/news': 'news',
  '/media': 'media',
  '/market': 'marketplace',
  '/records': 'records',
  '/new-records': 'new_records',
  '/medals': 'medals',
  '/rankings': 'rankings',
  '/qualifying-times': 'qualifying_times',
  '/predictions': 'predictions',
  '/calendar': 'calendar',
  '/live': 'live',
  '/compare': 'compare',
  '/teams': 'teams',
  '/swimmers': 'swimmers',
  '/academies': 'academies',
  '/lab': 'lab',
}

// Admins always see every section (so they can preview before launch)
function useNav() {
  const { isAdmin } = useAuth()
  const { features } = useFeatures()
  if (isAdmin) return NAV
  const ADMIN_ONLY = new Set(['/reports'])
  return NAV
    .map((group) => ({
      ...group,
      links: group.links.filter(([, to]) => !ADMIN_ONLY.has(to) && features[FEATURE_PATHS[to]] !== false),
    }))
    .filter((group) => group.links.length > 0)
}

// Miller's Law / Hick's Law: no group is longer than 7. "Competition" used to
// hold 9 links; meets and the tables built from them are now two groups.
// Serial Position: the most used page opens each group.
const NAV = [
  {
    label: 'Competition',
    links: [
      ['Championships', '/championships'],
      ['Live Results', '/live'],
      ['Calendar', '/calendar'],
      ['Qualifying Times', '/qualifying-times'],
      ['Predictions', '/predictions'],
    ],
  },
  {
    label: 'Records & Rankings',
    links: [
      ['Records', '/records'],
      ['New Records', '/new-records'],
      ['Rankings', '/rankings'],
      ['Medals', '/medals'],
    ],
  },
  {
    label: 'People',
    links: [
      ['Swimmers', '/swimmers'],
      ['Clubs', '/teams'],
      ['Academies', '/academies'],
      ['Coaches', '/coaches'],
      ['Referees', '/referees'],
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
      ['Arab Aquatics Federation', '/arab-federation'],
      ['ArabSwim Lab', '/lab'],
      ['Reports', '/reports'],
    ],
  },
]

// Working Memory: detail pages keep their section highlighted in the nav
const ALSO_ACTIVE = { '/championships': /^\/meets\// }
function navClass(to, pathname) {
  return ({ isActive }) => (isActive || ALSO_ACTIVE[to]?.test(pathname) ? 'active' : undefined)
}

const asList = (d) => (Array.isArray(d) ? d : d?.results || [])

// Mental Model: the box promises "swimmers, meets, clubs", so it searches all
// three. Chunking: suggestions are grouped by kind. Doherty Threshold: results
// appear while typing. Enter still opens the full swimmer search.
function SearchBox({ compact = false, onDone }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState(null) // null = closed
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const boxRef = useRef(null)
  const term = q.trim().replace(/\s+/g, ' ') // Postel's Law: stray spaces are ignored

  useEffect(() => {
    if (term.length < 2) { setHits(null); setBusy(false); return undefined }
    let alive = true
    setBusy(true)
    const t = setTimeout(() => {
      Promise.allSettled([
        api.get('/swimmers/', { params: { search: term, page_size: 4 } }),
        api.get('/championships/', { params: { search: term, page_size: 4 } }),
        api.get('/teams/', { params: { search: term, page_size: 4 } }),
      ]).then(([sw, ch, tm]) => {
        if (!alive) return
        const val = (r) => (r.status === 'fulfilled' ? asList(r.value.data).slice(0, 4) : [])
        setHits({ swimmers: val(sw), meets: val(ch), clubs: val(tm) })
        setBusy(false)
      })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [term])

  // Jakob's Law: click outside or Escape closes the suggestions
  useEffect(() => {
    if (!hits) return undefined
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setHits(null) }
    const esc = (e) => { if (e.key === 'Escape') setHits(null) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [hits])

  const go = (to) => { setHits(null); setQ(''); navigate(to); onDone?.() }
  const submit = (e) => {
    e.preventDefault()
    if (!term) return
    go(`/swimmers?search=${encodeURIComponent(term)}`)
  }
  const groups = hits ? [
    ['Swimmers', hits.swimmers, (x) => `/swimmers/${x.id}`, (x) => x.nationality_detail],
    ['Meets', hits.meets, (x) => `/meets/${x.id}`, (x) => x.country_detail],
    ['Clubs', hits.clubs, (x) => `/teams/${x.id}`, (x) => x.country_detail],
  ].filter(([, rows]) => rows.length > 0) : []

  return (
    <form ref={boxRef} role="search" onSubmit={submit} className="content-search" style={{ width: compact ? '100%' : 320 }}>
      <input
        className="input"
        type="search"
        aria-label="Search swimmers, meets, clubs"
        style={{ height: 36, minHeight: 36 }}
        placeholder="Search swimmers, meets, clubs"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <button className="btn btn-primary" style={{ height: 36 }} type="submit" aria-label="Search">
        {compact ? <Search size={15} /> : 'Search'}
      </button>
      {term.length >= 2 && (hits || busy) && (
        <div className="content-search-panel" role="listbox" aria-label="Search suggestions">
          {!hits ? (
            <div className="content-search-note" role="status">Searching…</div>
          ) : groups.length === 0 ? (
            <div className="content-search-note" role="status">Nothing found for “{term}”. Check the spelling or try fewer letters.</div>
          ) : (
            <>
              {groups.map(([label, rows, to, country]) => (
                <div key={label} className="content-search-group">
                  <div className="kicker">{label}</div>
                  {rows.map((x) => (
                    <button key={x.id} type="button" role="option" aria-selected="false" className="content-search-hit" onClick={() => go(to(x))}>
                      {country(x)?.code && <Flag code={country(x).code} name={country(x).name} />}
                      <span>{x.name}</span>
                    </button>
                  ))}
                </div>
              ))}
              <button type="submit" className="content-search-all">All swimmers matching “{term}” →</button>
            </>
          )}
        </div>
      )}
    </form>
  )
}

function Header() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { isAdmin, isAuthed, user, logout } = useAuth()
  const nav = useNav()
  const navigate = useNavigate()
  useEffect(() => { setOpen(false) }, [location])

  return (
    <header>
      {isAuthed && (
        <div className="rule-b content-userbar">
          <span className="kicker">{isAdmin ? 'Admin' : user?.username || 'Account'}</span>
          {isAdmin && <NavLink to="/admin" end>Dashboard</NavLink>}
          {isAdmin && <NavLink to="/import">Import data</NavLink>}
          {isAdmin && <NavLink to="/admin/name-match">Name matching</NavLink>}
          {isAdmin && <NavLink to="/admin/analytics">Analytics</NavLink>}
          {isAdmin && <NavLink to="/reports">Reports</NavLink>}
          {user?.role === 'ATHLETE' && user?.swimmer && (
            <NavLink to={`/swimmers/${user.swimmer}`}>My profile</NavLink>
          )}
          {/* Jakob's Law: every owner account has one link to its own page */}
          {user?.role === 'CLUB' && user?.team && (
            <NavLink to={`/teams/${user.team}`}>{user.team_is_academy ? 'My academy' : 'My club'}</NavLink>
          )}
          {user?.role === 'ACADEMY' && user?.academy && (
            <NavLink to={`/academies/${user.academy}`}>My academy</NavLink>
          )}
          {user?.role === 'FEDERATION' && user?.country && (
            <NavLink to={`/countries/${user.country}`}>My federation</NavLink>
          )}
          <button
            className="btn btn-secondary"
            style={{ height: 32, minHeight: 32, marginLeft: 'auto', fontSize: 12 }}
            onClick={() => { logout(); navigate('/') }}
          >
            Sign out
          </button>
        </div>
      )}
      {/* brand bar — flat navy, same color as the footer */}
      <div className="rule-b asw-brandbar">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 'auto', textDecoration: 'none', color: 'inherit' }}>
          {/* the emblem is a navy roundel: a light tile behind it keeps it readable on the navy bar */}
          <img src="/logo.png" alt="ArabSwim" className="asw-emblem" style={{ width: 40, height: 40 }} />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, letterSpacing: '0.02em', color: '#ffffff' }}>ARABSWIM</span>
          <span className="micro hide-mobile" style={{ color: 'var(--color-accent-2-300)' }}>Arab Swimming Database</span>
        </Link>
        <div className="hide-mobile"><SearchBox /></div>
        {/* Jakob's Law: account entry sits top right; Serial Position: last item in the bar */}
        {!isAuthed && <Link to="/login" className="hide-mobile content-signin">Sign in</Link>}
        <button
          className="btn btn-icon show-mobile-flex asw-burger"
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.4)', color: '#fff' }}
          onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* nav areas (desktop), always open. Proximity: each group is one of
          five equal columns, the same grid as the footer; its links run in
          rows across the column, so the block is two or three lines tall
          instead of a seven-line list pushing every page down */}
      <nav aria-label="Sections" className="hide-mobile rule-b content-nav" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
        {nav.map((group) => (
          <div key={group.label} className="asw-navcol content-nav-group">
            <div className="kicker">{group.label}</div>
            <div className="content-nav-links">
              {group.links.map(([label, to]) => (
                <NavLink key={to} to={to} className={navClass(to, location.pathname)}>{label}</NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* mobile drawer */}
      {open && (
        <nav aria-label="Sections" className="show-mobile rule-b" style={{ padding: '16px' }}>
          <div style={{ marginBottom: 14 }}><SearchBox compact onDone={() => setOpen(false)} /></div>
          <div className="content-drawer">
            {nav.map((group) => (
              <div key={group.label} className="asw-navcol">
                <div className="kicker" style={{ marginBottom: 6 }}>{group.label}</div>
                {group.links.map(([label, to]) => (
                  <NavLink key={to} to={to} className={navClass(to, location.pathname)} style={{ fontSize: 14 }}>{label}</NavLink>
                ))}
              </div>
            ))}
          </div>
          {!isAuthed && (
            <Link to="/login" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 16, textDecoration: 'none' }}>Sign in</Link>
          )}
        </nav>
      )}
    </header>
  )
}

function Footer() {
  const { isAdmin, isAuthed } = useAuth()
  const nav = useNav()
  return (
    <footer className="rule-t asw-foot">
      {/* Common Region: brand left, social right, on one row across the full
          width (the brand block used to leave most of the row empty) */}
      <div className="asw-foot-top">
      <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <img src="/logo.png" alt="" className="asw-emblem" style={{ width: 36, height: 36 }} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>ARABSWIM</span>
      </div>
      <p className="asw-foot-tagline">
        Results, records and rankings for Arab swimming — every meet, every swimmer, one&nbsp;home.
      </p>
      </div>
      <div>
      {/* social row — one place to edit the handles */}
      <div className="kicker" style={{ color: 'var(--color-accent-2-400)', margin: '0 0 10px' }}>Follow ArabSwim</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          ['Instagram', 'https://instagram.com/arab.swim', IconInstagram],
          ['Facebook', 'https://facebook.com/arab.swim', IconFacebook],
          ['YouTube', 'https://youtube.com/@arabswim', IconYoutube],
          ['TikTok', 'https://tiktok.com/@arab.swim', IconTiktok],
          ['X', 'https://x.com/arabswim', IconX],
        ].map(([label, href, icon]) => (
          <a
            key={label}
            className="asw-social"
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={`ArabSwim on ${label}`}
            title={label}
          >
            {icon}
          </a>
        ))}
      </div>
      </div>
      </div>
      <div className="asw-foot-cols" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
        {nav.map((group) => (
          <div key={group.label}>
            <div className="kicker" style={{ color: 'var(--color-accent-2-400)', marginBottom: 8 }}>{group.label}</div>
            <div className="asw-foot-links">
              {group.links.map(([label, to]) => (
                <Link key={to} to={to} className="asw-footlink">{label}</Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="asw-foot-legal">
        <span>© {new Date().getFullYear()} ArabSwim</span>
        {/* "Import data" is for admins only; a signed-in non-admin gets no link here */}
        {isAdmin && <Link to="/import">Import data</Link>}
        {!isAuthed && <Link to="/login">Sign in</Link>}
      </div>
    </footer>
  )
}

export default function Layout() {
  const location = useLocation()
  const navigationType = useNavigationType()
  // Only scroll to top on forward navigation (PUSH), not back/forward (POP)
  useEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0)
  }, [location.pathname, navigationType])
  // Pre-launch lock: a non-admin gets no menu, no search, no footer links —
  // only their own page (or the "launching soon" page when not signed in).
  const { locked, ownPath, isAuthed, ready } = usePrelaunch()
  if (locked) {
    let body
    if (!ready) body = <Loading />
    else if (pathAllowed(location.pathname, ownPath, isAuthed)) body = <Outlet />
    else if (isAuthed && ownPath) body = <Navigate to={ownPath} replace />
    else body = <ComingSoon signedIn={isAuthed} />
    return (
      <div className="shell">
        <LockedHeader ownPath={ownPath} />
        <main id="main" className="shell-main">{body}</main>
        <footer className="prelaunch-foot">© {new Date().getFullYear()} ArabSwim</footer>
      </div>
    )
  }
  return (
    <div className="shell">
      <Header />
      <main id="main" className="shell-main">
        <Outlet />
      </main>
      <Partners />
      <Footer />
    </div>
  )
}

// The whole header a locked viewer gets: the brand, their one link, sign out.
function LockedHeader({ ownPath }) {
  const { isAuthed, user, logout } = useAuth()
  const navigate = useNavigate()
  return (
    <header className="prelaunch-head">
      <span className="prelaunch-brand">
        <img src="/logo.png" alt="" width="34" height="34" className="asw-emblem" />
        <span>ARABSWIM</span>
      </span>
      {isAuthed ? (
        <span className="prelaunch-actions">
          {ownPath && <Link to={ownPath}>My page</Link>}
          <span className="prelaunch-who">{user?.email || user?.username}</span>
          <button type="button" className="btn btn-secondary" onClick={() => { logout(); navigate('/login') }}>Sign out</button>
        </span>
      ) : (
        <Link to="/login" className="prelaunch-signin">Sign in</Link>
      )}
    </header>
  )
}

function ComingSoon({ signedIn }) {
  return (
    <div className="prelaunch-soon">
      <img src="/logo.png" alt="" width="72" height="72" />
      <h1>ArabSwim is launching soon</h1>
      <p>
        {signedIn
          ? 'Your account is not linked to a page yet. Contact ArabSwim to get your invitation link.'
          : 'The site is being prepared. If ArabSwim sent you an invitation link, open it to create your account.'}
      </p>
      {!signedIn && <Link to="/login" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: 44 }}>Sign in</Link>}
    </div>
  )
}
