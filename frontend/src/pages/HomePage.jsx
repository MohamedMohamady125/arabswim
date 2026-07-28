import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import {
  Trophy, CalendarDays, BarChart3, Medal, Award, Sparkles,
  Users, Shield, Crown, Newspaper, Image, ShoppingBag,
  Globe, Handshake, UserCheck, Target, ArrowRight, MapPin,
} from 'lucide-react'
import api from '../api/client'
import { getRecords } from '../api/records'
import { getChampionships } from '../api/championships'
import Hero from '../components/ui/Hero'
import Button from '../components/ui/Button'
import { RecordCard } from '../components/domain'
import { formatDate } from '../utils/constants'

dayjs.extend(customParseFormat)

const SECTIONS = [
  { to: '/championships', label: 'Championships', icon: Trophy, countKey: 'championships' },
  { to: '/records', label: 'Records', icon: Award },
  { to: '/rankings', label: 'Rankings', icon: BarChart3 },
  { to: '/medals', label: 'Medals', icon: Medal },
  { to: '/new-records', label: 'New Records', icon: Sparkles },
  { to: '/qualifying-times', label: 'Qualifying Times', icon: Target },
  { to: '/swimmers', label: 'Swimmers', icon: Users, countKey: 'swimmers' },
  { to: '/teams', label: 'Teams', icon: Shield, countKey: 'teams' },
  { to: '/hall-of-fame', label: 'Hall of Fame', icon: Crown, countKey: 'fame' },
  { to: '/countries', label: 'Federations', icon: Globe, countKey: 'countries' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/news', label: 'News', icon: Newspaper, countKey: 'news' },
  { to: '/media', label: 'Media', icon: Image, countKey: 'albums' },
  { to: '/market', label: 'Market', icon: ShoppingBag, countKey: 'listings' },
  { to: '/sponsors', label: 'Partnerships', icon: Handshake, countKey: 'sponsors' },
  { to: '/coaches', label: 'Coaches', icon: UserCheck, countKey: 'coaches' },
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
  sponsors: ['/sponsors/', 'paginated'],
  coaches: ['/coaches/', 'paginated'],
  countries: ['/countries/', 'array'],
}

const HERO_STATS = [
  { key: 'swimmers', label: 'Swimmers' },
  { key: 'championships', label: 'Championships' },
  { key: 'teams', label: 'Teams' },
  { key: 'countries', label: 'Federations' },
]

function parseMeetDate(d) {
  if (!d) return null
  const parsed = dayjs(d, 'DD/MM/YYYY', true)
  return parsed.isValid() ? parsed : (dayjs(d).isValid() ? dayjs(d) : null)
}

function Countdown({ target }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])
  const diff = target.valueOf() - now
  if (diff <= 0) return <span className="text-aqua-400 font-semibold">Live now</span>
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const cells = [
    { v: days, l: 'days' },
    { v: hours, l: 'hrs' },
    { v: mins, l: 'min' },
  ]
  return (
    <div className="flex gap-2">
      {cells.map(({ v, l }) => (
        <div key={l} className="bg-white/10 rounded-sm px-3 py-2 text-center min-w-14">
          <div className="text-time-lg text-white tnum">{v}</div>
          <div className="text-label text-ink-400">{l}</div>
        </div>
      ))}
    </div>
  )
}

export default function HomePage() {
  const [counts, setCounts] = useState({})
  const [nextMeet, setNextMeet] = useState(null)
  const [newRecords, setNewRecords] = useState([])

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
    getChampionships({ page_size: 200 })
      .then((res) => {
        if (cancelled) return
        const list = res.data?.results || res.data || []
        const today = dayjs().startOf('day')
        const upcoming = list
          .map((c) => ({ ...c, _d: parseMeetDate(c.date) }))
          .filter((c) => c._d && !c._d.isBefore(today))
          .sort((a, b) => a._d.valueOf() - b._d.valueOf())
        setNextMeet(upcoming[0] || null)
      })
      .catch(() => {})
    getRecords({ is_new: 'true' })
      .then((res) => {
        if (cancelled) return
        const list = res.data?.results || res.data || []
        setNewRecords(list.slice(0, 3))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const meetDate = useMemo(() => (nextMeet ? parseMeetDate(nextMeet.date) : null), [nextMeet])

  return (
    <div className="space-y-8 animate-fade-up">
      {/* ── Hero ── */}
      <Hero>
        <div className="max-w-2xl">
          <div className="text-label text-aqua-400 mb-2">The home of Arab swimming</div>
          <h1 className="text-display-xl text-white">
            Every result. Every record. Every swimmer.
          </h1>
          <p className="text-body text-ink-200 mt-3 max-w-xl">
            Championship results, continental records and live rankings for Arab swimming — all in one place.
          </p>
          <div className="flex flex-wrap gap-2.5 mt-5">
            <Link to="/championships"><Button icon={Trophy}>Championships</Button></Link>
            <Link to="/rankings">
              <Button variant="secondary" className="bg-white/10 border-white/20 text-white hover:bg-white/15 hover:border-white/30" icon={BarChart3}>
                Rankings
              </Button>
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-white/10">
          {HERO_STATS.map(({ key, label }) => (
            <div key={key}>
              <div className="text-time-lg text-white tnum animate-count-up">
                {counts[key] !== undefined ? counts[key].toLocaleString() : '—'}
              </div>
              <div className="text-label text-ink-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </Hero>

      {/* ── Next meet countdown ── */}
      {nextMeet && meetDate && (
        <div className="bg-ink-900 rounded-lg text-white p-5 md:p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="min-w-0">
            <div className="text-label text-aqua-400 mb-1">Next meet</div>
            <Link to={`/meets/${nextMeet.id}`} className="text-title text-white hover:text-aqua-400 transition-colors block truncate">
              {nextMeet.name}
            </Link>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-body-sm text-ink-200">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={14} />
                {formatDate(nextMeet.date)}
              </span>
              {nextMeet.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} />
                  {nextMeet.location}{nextMeet.country_detail ? `, ${nextMeet.country_detail.name}` : ''}
                </span>
              )}
            </div>
          </div>
          <Countdown target={meetDate} />
        </div>
      )}

      {/* ── Latest records ── */}
      {newRecords.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-title text-ink-900">Latest records</h2>
            <Link to="/new-records" className="inline-flex items-center gap-1 text-body-sm font-medium text-aqua-600 hover:text-aqua-500">
              All new records <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {newRecords.map((r) => (
              <RecordCard
                key={r.id}
                isNew
                scope={r.record_type}
                event={r.event_detail?.name}
                time={r.formatted_time}
                holder={r.swimmer_detail ? {
                  name: r.swimmer_detail.name,
                  countryCode: r.swimmer_detail.nationality_detail?.code,
                  flagUrl: r.swimmer_detail.nationality_detail?.flag_url,
                } : null}
                meet={r.location}
                date={r.result_date ? formatDate(r.result_date) : null}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Explore the site ── */}
      <section>
        <h2 className="text-title text-ink-900 mb-3">Explore</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {SECTIONS.map(({ to, label, icon: Icon, countKey }) => (
            <Link
              key={to}
              to={to}
              className="bg-white rounded-md shadow-card border border-ink-100 hover:border-aqua-500/40 transition-colors p-4 h-full flex items-center gap-3 min-h-11"
            >
              <span className="shrink-0 w-9 h-9 rounded-sm bg-aqua-50 text-aqua-600 flex items-center justify-center">
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-body-sm font-medium text-ink-900 truncate">{label}</div>
                <div className="text-label normal-case tracking-normal font-normal text-ink-400 tnum h-4">
                  {countKey && counts[countKey] !== undefined ? counts[countKey].toLocaleString() : '\u00A0'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
