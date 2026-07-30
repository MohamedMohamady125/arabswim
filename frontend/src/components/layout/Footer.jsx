import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'

const COLUMNS = [
  {
    label: 'Competition',
    links: [
      { to: '/championships', label: 'Championships' },
      { to: '/records', label: 'Records' },
      { to: '/rankings', label: 'Rankings' },
      { to: '/medals', label: 'Medals' },
      { to: '/qualifying-times', label: 'Qualifying Times' },
    ],
  },
  {
    label: 'People',
    links: [
      { to: '/swimmers', label: 'Swimmers' },
      { to: '/teams', label: 'Teams' },
      { to: '/hall-of-fame', label: 'Hall of Fame' },
      { to: '/countries', label: 'Federations' },
      { to: '/coaches', label: 'Coaches' },
    ],
  },
  {
    label: 'Community',
    links: [
      { to: '/news', label: 'News' },
      { to: '/media', label: 'Media' },
      { to: '/market', label: 'Market' },
      { to: '/sponsors', label: 'Partnerships' },
      { to: '/calendar', label: 'Calendar' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="bg-ink-950 text-ink-200 mt-10 md:mt-12">
      {/* Aqua accent line */}
      <div className="h-px bg-gradient-to-r from-transparent via-aqua-600 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8 md:gap-10">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5">
              <img src="/logo.webp" alt="" className="h-9 w-9 object-contain" />
              <span className="font-display font-bold text-white text-lg">ArabSwiM</span>
            </Link>
            <p className="text-body-sm text-ink-400 mt-3 max-w-xs">
              Results, records and rankings for Arab swimming — every meet, every swimmer, one home.
            </p>
            <a
              href="https://www.instagram.com/arab.swim/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-4 text-body-sm text-ink-200 hover:text-white transition-colors"
            >
              @arab.swim on Instagram
              <ExternalLink size={14} />
            </a>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.label}>
              <div className="text-label text-ink-400 mb-3">{col.label}</div>
              <ul className="space-y-2">
                {col.links.map(({ to, label }) => (
                  <li key={to}>
                    <Link to={to} className="text-body-sm text-ink-200 hover:text-white transition-colors">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 pt-5 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="text-body-sm text-ink-400">
            © {new Date().getFullYear()} ArabSwiM — Arab Swim
          </span>
          <Link to="/login" className="text-body-sm text-ink-400 hover:text-ink-200 transition-colors">
            Admin sign in
          </Link>
        </div>
      </div>
    </footer>
  )
}
