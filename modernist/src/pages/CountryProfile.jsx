import { useEffect, useMemo, useState } from 'react'
import { Camera, Landmark, Medal, TrendingDown, TrendingUp, Trophy, User, Users, Waves } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getCountryProfile, getEvents, getCountries, updateCountry } from '../api/core'
import { getArticles } from '../api/news'
import { getRankings } from '../api/rankings'
import { getQualifyingStandards, getQualifyingStandard, getQualifiedSwimmers } from '../api/qualifyingTimes'
import { getPredictions } from '../api/predictions'
import { getAlbums } from '../api/media'
import { getBoardMembers, createBoardMember, updateBoardMember, deleteBoardMember, getTeams } from '../api/teams'
import { CropUpload } from '../components/ImageCropper'
import { useAuth } from '../context/AuthContext'
import { useFeatures } from '../context/FeaturesContext'
import { getCoaches } from '../api/coaches'
import { getAcademies } from '../api/academies'
import { getCalendarEvents } from '../api/calendar'
import { getMedals, getMedalSummary, getMedalSwimmerSummary } from '../api/medals'
import { getClassifications } from '../api/records'
import Flag, { flagImage } from '../components/Flag'
import FederationProgressionTab from '../components/FederationProgression'
import MedalStandings from '../components/MedalStandings'
import { Loading, notify, Empty, SectHead, Seg, Pager, Modal, FilterBar } from '../components/ui'
import { MiniBars, MiniHBars, CHART_COLORS } from '../components/MiniCharts'
import { formatDate, formatNumber, formatTime, mediaUrl, flagAlpha2 } from '../utils'
import { mulberry32, pickHighlights } from '../utils/highlightShuffle'
import Pic from '../components/Pic'

const CLASS_ORDER = ['Arab', 'GCC', 'African', 'Asian', 'Mediterranean', 'Islamic', 'World', 'Olympic']
const COACH_LEVELS = {
  HEAD: 'Head Coach', ASSISTANT: 'Assistant Coach', TECHNIQUE: 'Technique Coach',
  FITNESS: 'Fitness / S&C Coach', YOUTH: 'Youth Development Coach', PRIVATE: 'Private Coach',
}
const CLASS_COLORS = {
  Arab: 'var(--color-accent-800)', GCC: 'var(--asw-silver)', African: 'var(--asw-slow)', Asian: 'var(--asw-bronze)',
  Mediterranean: 'var(--color-accent-2)', Islamic: 'var(--asw-fast)', World: 'var(--asw-gold)', Olympic: 'var(--color-accent-800)',
  National: 'var(--asw-fast)', University: 'var(--color-neutral-700)', Other: 'var(--color-neutral-700)',
}

// Federation hero banner photo: probes every candidate swimmer photo's real
// resolution + aspect ratio and picks the best one for a wide banner —
// large landscape action shots score highest, tiny images that would blur
// when scaled up are rejected outright. objectPosition adapts to the shape
// so faces stay in frame (portrait → anchor high, wide → centre).
export function FedHeroPhoto({ candidates, extras }) {
  const [best, setBest] = useState(null)
  const key = [...(candidates || []), '::', ...(extras || [])].filter(Boolean).join('|')
  useEffect(() => {
    let alive = true
    const primary = [...new Set((candidates || []).filter(Boolean).map(mediaUrl))]
    const backup = [...new Set((extras || []).filter(Boolean).map(mediaUrl))]
      .filter((u) => !primary.includes(u))
    const urls = [...primary.map((src) => ({ src, primary: true })), ...backup.map((src) => ({ src, primary: false }))]
    if (!urls.length) { setBest(null); return undefined }
    Promise.all(urls.map(({ src, primary: isPrimary }) => new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ src, primary: isPrimary, w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve(null)
      img.src = src
    }))).then((loaded) => {
      if (!alive) return
      const all = loaded.filter(Boolean)
      // sharp tier: large enough to survive being blown up to banner size
      const ok = all.filter((p) => p.w >= 320 && p.h >= 300)
      const score = (p) => {
        const ar = p.w / p.h
        let s = Math.min(p.w, 1600)          // sharper = better (capped)
        if (ar >= 1.15) s += 900             // landscape action shots first
        else if (ar >= 0.85) s += 300        // square headshots acceptable
        if (p.w >= 700) s += 400             // truly banner-worthy resolution
        if (p.primary) s += 600              // the federation's own swimmers win ties
        return s
      }
      if (ok.length) {
        setBest({ ...[...ok].sort((a, b) => score(b) - score(a))[0], mode: 'sharp' })
      } else if (all.length) {
        // only tiny thumbnails exist — use the largest as a soft blurred
        // atmosphere layer rather than a pixelated blow-up
        setBest({ ...[...all].sort((a, b) => b.w * b.h - a.w * a.h)[0], mode: 'blur' })
      } else {
        setBest(null)
      }
    })
    return () => { alive = false }
  }, [key])
  if (!best) return null
  const ar = best.w / best.h
  const pos = ar < 0.85 ? '50% 8%' : ar < 1.15 ? '50% 16%' : '50% 30%'
  const mask = 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.55) 34%, #000 62%)'
  const blurred = best.mode === 'blur'
  return (
    <div className="fed-hero-photo" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '52%', pointerEvents: 'none' }}>
      <img src={best.src} alt="" style={{
        width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos,
        WebkitMaskImage: mask, maskImage: mask,
        ...(blurred ? { filter: 'blur(26px) saturate(1.1)', transform: 'scale(1.2)', opacity: 0.55 } : {}),
      }} />
    </div>
  )
}

const STROKES = [
  { value: 'Freestyle', label: 'Free' },
  { value: 'Backstroke', label: 'Back' },
  { value: 'Breaststroke', label: 'Breast' },
  { value: 'Butterfly', label: 'Fly' },
  { value: 'Individual Medley', label: 'IM' },
]

const LINE_HEX = ['var(--color-accent-800)', 'var(--color-accent-2)', 'var(--color-accent-800)', 'var(--color-accent-400)', 'var(--color-accent-800)', 'var(--color-accent-800)', 'var(--color-accent-300)', 'var(--color-accent-800)']

// A failed request is not "no data": say so and offer a retry (Paradox of
// the Active User). useRetry() gives a tab its failed flag and a retry key.
function LoadFailed({ what, onRetry }) {
  return (
    <Empty label={`Could not load ${what}`} hint="Check your connection and try again.">
      <button type="button" className="btn btn-secondary" onClick={onRetry}>Try again</button>
    </Empty>
  )
}
function useRetry() {
  const [failed, setFailed] = useState(false)
  const [tryKey, setTryKey] = useState(0)
  return { failed, tryKey, fail: () => setFailed(true), retry: () => { setFailed(false); setTryKey((k) => k + 1) } }
}

// Mental Model: swimmers say "50m pool", the database says LCM.
const POOL_OPTIONS = [{ value: 'LCM', label: '50m pool' }, { value: 'SCM', label: '25m pool' }]
const poolLabel = (p) => (p === 'SCM' ? '25m pool' : '50m pool')

// Medal counts as navy numbers with the metal as a marker: gold/silver text
// on white fails WCAG AA, so the square carries the colour instead.
function GSB({ gold, silver, bronze, size = 12 }) {
  const item = (n, token, label) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} aria-label={`${n || 0} ${label}`}>
      <span aria-hidden="true" style={{ width: 8, height: 8, background: `var(${token})`, display: 'inline-block', flex: 'none' }} />
      {n || 0}
    </span>
  )
  return (
    <span className="asw-num" style={{ display: 'inline-flex', gap: 12, fontSize: size, fontWeight: 800, whiteSpace: 'nowrap', color: 'var(--color-accent-800)', flex: 'none' }}>
      {item(gold, '--asw-gold', 'gold')}{item(silver, '--asw-silver', 'silver')}{item(bronze, '--asw-bronze', 'bronze')}
    </span>
  )
}

function SwimmerLink({ id, name }) {
  return <Link to={`/swimmers/${id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>{name}</Link>
}

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'news', label: 'News' },
  { value: 'board', label: 'Board' },
  { value: 'team', label: 'Team' },
  { value: 'statistics', label: 'Statistics' },
  { value: 'progression', label: 'Progression' },
  { value: 'records', label: 'Records' },
  { value: 'ranking', label: 'Ranking' },
  { value: 'medals', label: 'Medals' },
  { value: 'qualifying', label: 'Qualifying' },
  { value: 'clubs', label: 'Clubs' },
  { value: 'academies', label: 'Academies' },
  { value: 'compare', label: 'Compare' },
  { value: 'prediction', label: 'Prediction' },
  { value: 'multimedia', label: 'Multimedia' },
]

// Hick's Law: the tabs most visitors open sit in the bar; the rest wait behind
// "More" (the open tab always shows, wherever it lives).
const PRIMARY_TABS = ['overview', 'records', 'ranking', 'medals', 'statistics', 'team', 'clubs']

export function SubTabs({ options, value, onChange }) {
  const base = { padding: '8px 22px', border: '2px solid var(--color-accent-800)', borderRadius: 0, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit', minHeight: 36 }
  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', margin: '18px 0 24px' }}>
      {options.map(([val, label]) => (
        <button key={val} type="button" onClick={() => onChange(val)} aria-pressed={value === val}
          style={value === val ? { ...base, background: 'var(--color-accent-800)', color: '#fff' } : { ...base, background: '#fff', color: 'var(--color-accent-800)' }}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function TabHeading({ title }) {
  // Jakob's Law: same left-aligned section heading as the rest of the site
  return <h2 className="prof-h">{title}</h2>
}

/* ===== NEWS TAB ===== */
function NewsTab({ countryId, countryName }) {
  const [articles, setArticles] = useState(null)
  const load = useRetry()
  useEffect(() => {
    let alive = true
    setArticles(null)
    const unwrap = (r) => (Array.isArray(r.data) ? r.data : r.data?.results || [])
    // Only articles linked to this federation (directly or via its clubs);
    // no countryId (pan-Arab page) → region-wide news
    getArticles({ ...(countryId ? { country: countryId } : {}), status: 'PUBLISHED', ordering: '-published_at' })
      .then((r) => alive && setArticles(unwrap(r)))
      .catch(() => { if (alive) { setArticles([]); load.fail() } })
    return () => { alive = false }
  }, [countryId, load.tryKey])
  if (load.failed) return <LoadFailed what="news" onRetry={load.retry} />
  if (articles === null) return <Loading label="Loading news" />
  return (
    <div className="pad-lg">
      <TabHeading title={`${countryName} News`} />
      {articles.length === 0 ? <Empty label="No news articles yet" hint="News about this federation will appear here once published." /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {articles.map((a) => (
            <Link key={a.id} className="fed-news-card" to={`/news/${a.id}`} style={{ background: '#fff', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', borderRadius: 0, overflow: 'hidden', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column',  }}>
              <div className="fed-news-img" style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', background: 'var(--color-accent-800)', flex: 'none' }}>
                {a.cover_image && (
                  <>
                    <Pic kind="cover" w={640} className="news-cover-img" src={a.cover_image} style={{ position: 'relative' }} />
                  </>
                )}
              </div>
              <div style={{ padding: '16px 16px 16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div className="micro" style={{ marginBottom: 6 }}>{formatDate(a.published_at || a.created_at)}</div>
                {(() => {
                  const rtl = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF]/.test(a.title || '')
                  return (
                    <div dir={rtl ? 'rtl' : 'ltr'} style={{
                      fontFamily: rtl ? "'Al-Jazeera', 'Helvetica Neue', Arial, sans-serif" : 'var(--font-heading)',
                      fontWeight: rtl ? 700 : 800,
                      fontSize: rtl ? 17 : 16,
                      lineHeight: rtl ? 1.6 : 1.25,
                      letterSpacing: rtl ? 0 : '-0.015em',
                      color: 'var(--color-accent-800)', marginBottom: 8,
                    }}>{a.title}</div>
                  )
                })()}
                <div dir={/[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF]/.test(a.body || '') ? 'rtl' : 'ltr'} style={{ fontSize: 13, color: 'var(--color-neutral-700)', lineHeight: 1.6, marginBottom: 12 }}>{(a.body || '').replace(/<[^>]+>/g, '').slice(0, 110)}{(a.body || '').length > 110 ? '…' : ''}</div>
                <span style={{ marginTop: 'auto', color: 'var(--color-accent-800)', fontWeight: 700, fontSize: 13 }}>Read more →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ===== RANKING TAB ===== */
function RankingTab({ countryId }) {
  const [events, setEvents] = useState([])
  const [event, setEvent] = useState('')
  const [gender, setGender] = useState('M')
  const [pool, setPool] = useState('LCM')
  const [ageGroup, setAgeGroup] = useState('OPEN')
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const load = useRetry()

  useEffect(() => {
    let alive = true
    getEvents({ has_results: true }).then((r) => {
      if (!alive) return
      const all = (Array.isArray(r.data) ? r.data : r.data?.results || []).filter((e) => e.stroke !== 'Open Water' && !/4\s*x/i.test(e.name))
      setEvents(all)
      const first = all.find((e) => /^50m Freestyle$/i.test(e.name)) || all[0]
      if (first) setEvent(String(first.id))
      // no events at all → nothing to rank; stop the spinner instead of loading forever
      else setLoading(false)
    }).catch(() => { if (alive) { setEvents([]); setLoading(false); load.fail() } })
    return () => { alive = false }
  }, [load.tryKey])

  useEffect(() => {
    if (!event) return
    let alive = true; setLoading(true)
    getRankings({
      // no countryId (pan-Arab page) → the Arab-wide ranking
      ...(countryId ? { scope: 'national', country: countryId } : { scope: 'arab' }),
      gender, pool, event, age_group: ageGroup, limit: 20, page,
    })
      .then((r) => {
        if (!alive) return
        setRows(r.data?.results || (Array.isArray(r.data) ? r.data : []))
        setCount(r.data?.count ?? 0)
      })
      .catch(() => { if (alive) { setRows([]); setCount(0); load.fail() } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [countryId, event, gender, pool, ageGroup, page, load.tryKey])

  // New filter selection restarts from page 1
  useEffect(() => { setPage(1) }, [event, gender, pool, ageGroup])

  const grouped = useMemo(() => {
    const g = {}
    events.forEach((e) => { (g[e.stroke] = g[e.stroke] || []).push(e) })
    return Object.entries(g)
  }, [events])

  return (
    <div className="pad-lg">
      <TabHeading title={countryId ? 'National Ranking' : 'Arab Ranking'} />
      {/* Common Region: the four filters share one bar with the result count */}
      <FilterBar
        count={loading || load.failed ? null : (count || rows.length)} noun={(count || rows.length) === 1 ? 'swimmer' : 'swimmers'}
        active={gender !== 'M' || pool !== 'LCM' || ageGroup !== 'OPEN'}
        onClear={() => { setGender('M'); setPool('LCM'); setAgeGroup('OPEN') }}
      >
        <select className="select" aria-label="Event" style={{ width: 'auto', minWidth: 180 }} value={event} onChange={(e) => setEvent(e.target.value)}>
          {grouped.map(([stroke, evs]) => (
            <optgroup key={stroke} label={stroke}>
              {evs.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </optgroup>
          ))}
        </select>
        <Seg options={[{ value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }]} value={gender} onChange={setGender} />
        <Seg options={POOL_OPTIONS} value={pool} onChange={setPool} />
        <select className="select" aria-label="Age group" style={{ width: 'auto' }} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
          <option value="OPEN">All ages (Open)</option>
          {['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17'].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </FilterBar>
      <div style={{ height: 16 }} />
      {load.failed ? <LoadFailed what="the ranking" onRetry={load.retry} /> : loading ? <Loading label="Loading ranking" /> : rows.length === 0 ? <Empty label="No results for this event" hint="Try another event, gender, pool length or age group." /> : (
        <>
        {/* phone: 8 columns can't share 390px — drop FINA/Championship/Location
            there (the essentials stay) instead of wrapping every cell to 3 lines */}
        <div className="table-scroll"><table className="table"><thead><tr><th style={{ width: 40 }}>#</th><th>Swimmer</th><th className="num">Age</th><th className="time">Time</th><th className="num hide-mobile">FINA</th><th className="hide-mobile">Championship</th><th className="hide-mobile">Location</th><th>Date</th></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.result_id ?? `rec-${r.record_id}`}>
              <td><span className="asw-num" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: 'var(--color-accent-800)', color: '#fff', fontWeight: 800, fontSize: 12 }}>{r.rank}</span></td>
              <td><SwimmerLink id={r.swimmer_id} name={r.swimmer_name} /></td>
              <td className="num asw-num">{r.age_at_competition || '—'}</td>
              <td className="time asw-time" style={{ fontWeight: 800 }}>{r.time}</td>
              <td className="num asw-num hide-mobile">{r.fina_points ?? '—'}</td>
              <td className="text-muted hide-mobile">{r.championship_name}</td>
              <td className="text-muted hide-mobile">{r.championship_country || (r.championship_location || '').split(',').pop().trim() || '—'}</td>
              <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
            </tr>
          ))}
        </tbody></table></div>
        <Pager page={page} pageSize={20} count={count} onPage={setPage} />
        </>
      )}
    </div>
  )
}

/* ===== ACADEMIES TAB ===== */
function AcademiesTab({ countryId }) {
  const [academies, setAcademies] = useState([])
  const [loading, setLoading] = useState(true)
  const load = useRetry()

  useEffect(() => {
    let alive = true
    setLoading(true)
    getAcademies()
      .then((r) => {
        if (!alive) return
        const all = Array.isArray(r.data) ? r.data : r.data?.results || []
        setAcademies(all.filter((a) => String(a.country) === String(countryId)))
      })
      .catch(() => { if (alive) { setAcademies([]); load.fail() } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [countryId, load.tryKey])

  if (loading) return <Loading label="Loading academies" />
  if (load.failed) return <LoadFailed what="academies" onRetry={load.retry} />
  return (
    <div className="pad-lg">
      <SectHead title={`Academies · ${academies.length}`} />
      {academies.length === 0 ? <Empty label="No academies registered" hint="Academies from this country will be listed here." /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
          {academies.map((a) => (
            <Link key={a.id} to={`/academies/${a.id}`} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px',
              background: '#fff', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', borderRadius: 0,
              border: '1px solid var(--color-divider)',
              color: 'inherit', textDecoration: 'none',
            }}>
              <span style={{
                width: 52, height: 52, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                background: 'var(--color-accent-100)', border: '1px solid var(--color-neutral-300)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {a.logo ? (
                  <Pic kind="logo" w={96} src={a.logo} />
                ) : (
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: 'var(--color-accent-800)' }}>
                    {a.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                  </span>
                )}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-accent-800)', display: 'block', lineHeight: 1.3 }}>{a.name}</span>
                {(a.city || a.phone) && (
                  <span className="text-muted" style={{ fontSize: 12 }}>{[a.city, a.phone].filter(Boolean).join(' · ')}</span>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ===== CLUBS TAB ===== */
function ClubsTab({ countryId }) {
  const [clubs, setClubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const load = useRetry()

  useEffect(() => {
    let alive = true
    setLoading(true)
    getTeams({ country: countryId })
      .then((r) => {
        if (!alive) return
        const all = Array.isArray(r.data) ? r.data : r.data?.results || []
        // clubs only — the national team lives in the Team tab, not here
        setClubs(all.filter((t) => !t.is_national_team)
          .sort((a, b) => (b.swimmers_count || 0) - (a.swimmers_count || 0) || a.name.localeCompare(b.name)))
      })
      .catch(() => { if (alive) { setClubs([]); load.fail() } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [countryId, load.tryKey])

  if (loading) return <Loading label="Loading clubs" />
  if (load.failed) return <LoadFailed what="clubs" onRetry={load.retry} />
  // Postel's Law: the club search ignores case, accents and extra spaces
  const fold = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  const q = fold(query)
  const shown = q ? clubs.filter((t) => fold(t.name).includes(q)) : clubs
  return (
    <div className="pad-lg">
      <SectHead title={`Clubs · ${clubs.length}`} />
      {/* Miller's Law: a long club list gets a way to find one, and says how it is ordered */}
      {clubs.length > 12 && (
        <>
          <FilterBar count={shown.length} noun={shown.length === 1 ? 'club' : 'clubs'} active={!!query} onClear={() => setQuery('')}>
            <input className="input" type="search" autoComplete="off" aria-label="Find a club" placeholder="Find a club"
              style={{ flex: '1 1 220px', width: 'auto', minWidth: 0, maxWidth: 320 }} value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="micro">Most swimmers first</span>
          </FilterBar>
          <div style={{ height: 16 }} />
        </>
      )}
      {clubs.length === 0 ? <Empty label="No clubs registered" hint="Clubs from this country will be listed here." /> : shown.length === 0 ? (
        <Empty label={`No club matches "${query.trim()}"`} hint="Check the spelling or try part of the name.">
          <button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>Clear search</button>
        </Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
          {shown.map((t) => (
            <Link key={t.id} to={`/teams/${t.id}`} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px',
              background: '#fff', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', borderRadius: 0,
              border: '1px solid var(--color-divider)', color: 'inherit', textDecoration: 'none',
            }}>
              <span style={{
                width: 52, height: 52, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                background: 'var(--color-accent-100)', border: '1px solid var(--color-neutral-300)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {t.logo ? (
                  <Pic kind="logo" w={96} src={t.logo} />
                ) : (
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: 'var(--color-accent-800)' }}>
                    {t.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                  </span>
                )}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-accent-800)', display: 'block', lineHeight: 1.3 }}>{t.name}</span>
                {t.swimmers_count > 0 && (
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {t.swimmers_count} swimmer{t.swimmers_count === 1 ? '' : 's'}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ===== QUALIFYING TAB ===== */
function QualifyingTab({ countryId, qualSub, setQualSub }) {
  const [standards, setStandards] = useState(null)
  const [standardId, setStandardId] = useState('')
  const [detail, setDetail] = useState(null)
  const [gender, setGender] = useState('M')
  const [pool, setPool] = useState('LCM')
  const [qualData, setQualData] = useState(null)
  const load = useRetry()

  useEffect(() => {
    let alive = true
    setStandards(null)
    getQualifyingStandards()
      .then((r) => {
        if (!alive) return
        const list = Array.isArray(r.data) ? r.data : r.data?.results || []
        setStandards(list)
        if (list.length > 0) setStandardId(String(list[0].id))
      })
      .catch(() => { if (alive) { setStandards([]); load.fail() } })
    return () => { alive = false }
  }, [load.tryKey])

  useEffect(() => {
    if (!standardId) return
    let alive = true; setDetail(null)
    getQualifyingStandard(standardId)
      .then((r) => alive && setDetail(r.data))
      .catch(() => { if (alive) { setDetail({ times: [] }); load.fail() } })
    return () => { alive = false }
  }, [standardId, load.tryKey])

  // Qualified swimmers — computed server-side so only swims inside the
  // official qualification window count (World Aquatics rule: ~16-month
  // window ending a few weeks before the meet).
  useEffect(() => {
    if (!standardId || qualSub !== 'qualified') return
    let alive = true; setQualData(null)
    getQualifiedSwimmers(standardId, countryId ? { country: countryId } : {})
      .then((r) => alive && setQualData(r.data))
      .catch(() => { if (alive) { setQualData({ window: null, qualified: [] }); load.fail() } })
    return () => { alive = false }
  }, [standardId, qualSub, countryId, load.tryKey])

  const times = detail?.times || []
  const filtered = times.filter((t) => t.gender === gender && t.pool === pool)
  // group by event → { event_name, A, B }
  const standardRows = useMemo(() => {
    const map = {}
    filtered.forEach((t) => {
      const key = t.event_name
      map[key] = map[key] || { event: key, distance: t.event_distance, stroke: t.event_stroke }
      map[key][t.cut] = t.formatted_time
    })
    return Object.values(map).sort((a, b) => (a.stroke || '').localeCompare(b.stroke || '') || a.distance - b.distance)
  }, [filtered])

  const qualifiedRows = qualData?.qualified || []
  const qualWindow = qualData?.window

  if (load.failed) return <LoadFailed what="qualifying times" onRetry={load.retry} />
  if (standards === null) return <Loading label="Loading qualifying standards" />
  return (
    <div className="pad-lg">
      <TabHeading title="Qualifying" />
      <SubTabs options={[['standards', 'Qualifying times'], ['qualified', 'Swimmers who qualified']]} value={qualSub} onChange={setQualSub} />
      {standards.length === 0 ? <Empty label="No qualifying standards published yet" /> : (<>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
          <select className="select" aria-label="Qualifying standard" style={{ width: 'auto', minWidth: 220 }} value={standardId} onChange={(e) => setStandardId(e.target.value)}>
            {standards.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.year})</option>)}
          </select>
          {qualSub === 'standards' && (<>
            <Seg options={[{ value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }]} value={gender} onChange={setGender} />
            <Seg options={POOL_OPTIONS} value={pool} onChange={setPool} />
          </>)}
        </div>
        {!detail ? <Loading label="Loading standard" /> : qualSub === 'standards' ? (
          standardRows.length === 0 ? <Empty label="No cuts for this selection" hint="Try the other gender or pool length." /> : (
            <div className="table-scroll" style={{ maxWidth: 620, margin: '0 auto' }}><table className="table"><thead><tr><th>Event</th><th className="time">A Cut</th><th className="time">B Cut</th></tr></thead><tbody>
              {standardRows.map((r) => (
                <tr key={r.event}><td style={{ fontWeight: 600 }}>{r.event}</td><td className="time asw-time" style={{ fontWeight: 800, color: 'var(--color-accent-800)' }}>{r.A || '—'}</td><td className="time asw-time">{r.B || '—'}</td></tr>
              ))}
            </tbody></table></div>
          )
        ) : qualData === null ? <Loading label="Checking qualifying swims" /> : (<>
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-neutral-700)', fontWeight: 600, margin: '0 0 16px' }}>
            {qualWindow
              ? <>Qualification period{qualWindow.derived ? ' (estimated)' : ''}: <span className="asw-num" style={{ color: 'var(--color-accent-800)', fontWeight: 800 }}>{formatDate(qualWindow.start)} – {formatDate(qualWindow.end)}</span> — only swims in this window count</>
              : 'Qualification period not published yet — showing all-time best times'}
          </div>
          {qualifiedRows.length === 0 ? <Empty label={qualWindow ? 'No swimmers have made a cut inside the qualification period yet' : 'No swimmers meet these cuts yet'} /> : (
            <div className="table-scroll"><table className="table"><thead><tr><th>Swimmer</th><th>Event</th><th>Sex</th><th>Pool</th><th className="time">Time</th><th className="time">Cut</th><th>Standard</th><th>Where Achieved</th></tr></thead><tbody>
              {qualifiedRows.map((r, i) => (
                <tr key={i}>
                  <td><SwimmerLink id={r.swimmer_id} name={r.swimmer} /></td>
                  <td style={{ fontWeight: 600 }}>{r.event}</td>
                  <td className="text-muted">{r.sex === 'F' ? "Women's" : "Men's"}</td>
                  <td className="text-muted">{r.pool === 'SCM' ? '25m' : r.pool === 'LCM' ? '50m' : r.pool}</td>
                  <td className="time asw-time" style={{ fontWeight: 800, color: 'var(--color-accent-800)' }}>{r.time}</td>
                  <td className="time asw-time">{r.cut_time}</td>
                  <td><span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 0, fontSize: 11, fontWeight: 800, background: r.cut === 'A' ? 'var(--asw-fast)' : 'var(--asw-gold)', color: '#fff' }}>{r.cut} Cut</span></td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{r.championship || '—'}{r.date ? ` · ${formatDate(r.date)}` : ''}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </>)}
      </>)}
    </div>
  )
}

/* ===== PREDICTION TAB ===== */
function PredictionTab({ countryName }) {
  const [preds, setPreds] = useState(null)
  const load = useRetry()
  useEffect(() => {
    let alive = true
    setPreds(null)
    getPredictions()
      .then((r) => alive && setPreds(Array.isArray(r.data) ? r.data : []))
      .catch(() => { if (alive) { setPreds([]); load.fail() } })
    return () => { alive = false }
  }, [load.tryKey])
  if (load.failed) return <LoadFailed what="predictions" onRetry={load.retry} />
  if (preds === null) return <Loading label="Loading predictions" />
  const mine = preds.filter((p) => p.country === countryName)
  const others = preds.filter((p) => p.country !== countryName)
  const card = (p, hosted) => (
    <Link key={p.id} to="/predictions" style={{ background: '#fff', border: hosted ? '2px solid var(--color-accent-800)' : '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', borderRadius: 0, padding: '16px 16px', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: 6,  }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', background: CLASS_COLORS[p.classification] || 'var(--color-accent-800)', color: '#fff', padding: '2px 8px', borderRadius: 0 }}>{p.classification || 'Meet'}</span>
        {hosted && <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'var(--color-accent-800)', color: '#fff', padding: '2px 8px', borderRadius: 0 }}>Hosted here</span>}
        {p.stage && <span className="micro" style={{ marginLeft: 'auto' }}>{p.stage === 'OFFICIAL' ? 'Official entries' : 'Early forecast'}</span>}
      </div>
      <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-accent-800)', lineHeight: 1.3 }}>{p.name}</div>
      <div className="text-muted" style={{ fontSize: 13 }}>{formatDate(p.date)}{p.end_date ? ` – ${formatDate(p.end_date)}` : ''} · {p.pool}{p.country ? ` · ${p.country}` : ''}</div>
      <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 12 }}>
        {p.event_count != null && <span className="asw-num text-muted">{p.event_count} events</span>}
        {p.confidence != null && <span className="asw-num" style={{ color: 'var(--color-accent-800)', fontWeight: 700 }}>{Math.round(p.confidence * 100)}% confidence</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--color-accent-800)', fontWeight: 700 }}>View predictions →</span>
      </div>
    </Link>
  )
  return (
    <div className="pad-lg">
      <TabHeading title="Medal Predictions" />
      {preds.length === 0 ? <Empty label="No upcoming championships with predictions" hint="Predictions open once the next championship is announced." /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {mine.map((p) => card(p, true))}
          {others.map((p) => card(p, false))}
        </div>
      )}
    </div>
  )
}

/* ===== MULTIMEDIA TAB ===== */
function MultimediaTab({ champIds, champNames, countryName }) {
  const [albums, setAlbums] = useState(null)
  const load = useRetry()
  useEffect(() => {
    let alive = true
    setAlbums(null)
    getAlbums()
      .then((r) => alive && setAlbums(Array.isArray(r.data) ? r.data : r.data?.results || []))
      .catch(() => { if (alive) { setAlbums([]); load.fail() } })
    return () => { alive = false }
  }, [load.tryKey])
  if (load.failed) return <LoadFailed what="albums" onRetry={load.retry} />
  if (albums === null) return <Loading label="Loading albums" />
  // Match by championship id, or fall back to title matching — album↔meet
  // links can be severed when a meet is deleted and re-imported (SET_NULL).
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const nameSet = new Set([...(champNames || [])].map(norm))
  const mine = albums.filter((a) =>
    (a.championship && champIds.has(a.championship)) ||
    (!a.championship && nameSet.has(norm(a.title))))
  return (
    <div className="pad-lg">
      <TabHeading title={`${countryName} Multimedia`} />
      {mine.length === 0 ? <Empty label="No photo or video albums yet" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {mine.map((a) => (
            <Link key={a.id} to={`/media/albums/${a.id}`} style={{ background: '#fff', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', borderRadius: 0, overflow: 'hidden', textDecoration: 'none', color: 'inherit',  }}>
              <div style={{ height: 160, background: a.cover ? `url(${a.cover}) center/cover` : 'var(--color-accent-800)', display: 'flex', alignItems: 'flex-end' }}>
                <span style={{ background: 'rgba(13,45,94,.85)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 0 }} className="asw-num">{a.items_count} items</span>
              </div>
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-accent-800)', lineHeight: 1.3 }}>{a.title}</div>
                <div className="micro" style={{ marginTop: 4 }}>{formatDate(a.created_at)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ===== POOLS TAB ===== */
function PoolsTab({ hosted, countryName }) {
  const venues = useMemo(() => {
    const map = {}
    hosted.forEach((c) => {
      const loc = (c.location || '').trim()
      if (!loc) return
      map[loc] = map[loc] || { location: loc, meets: 0, years: new Set(), pools: new Set() }
      map[loc].meets += 1
      if (c.date) map[loc].years.add(new Date(c.date).getFullYear())
      if (c.pool) map[loc].pools.add(c.pool)
    })
    return Object.values(map).sort((a, b) => b.meets - a.meets)
  }, [hosted])
  return (
    <div className="pad-lg">
      <TabHeading title={`${countryName} Venues`} />
      {venues.length === 0 ? <Empty label="No venue data yet" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {venues.map((v) => (
            <div key={v.location} style={{ background: '#fff', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', borderRadius: 0, padding: '16px 20px',  }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}><Waves size={20} aria-hidden="true" /></div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-accent-800)' }}>{v.location}</div>
              <div className="text-muted asw-num" style={{ fontSize: 13, marginTop: 6 }}>{v.meets} championship{v.meets > 1 ? 's' : ''} hosted</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {[...v.pools].map((p) => <span key={p} style={{ fontSize: 11, fontWeight: 800, background: 'var(--color-accent-800)', color: '#fff', padding: '2px 8px', borderRadius: 0 }}>{p}</span>)}
                <span className="micro asw-num" style={{ alignSelf: 'center' }}>{[...v.years].sort().join(' · ')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ===== ARCHIVES TAB ===== */
function ArchivesTab({ hosted, participated, countryName }) {
  const byYear = useMemo(() => {
    const all = [
      ...hosted.map((c) => ({ ...c, kind: 'Hosted' })),
      ...participated.map((c) => ({ ...c, kind: 'Participated' })),
    ].filter((c) => c.date)
    const seen = new Set()
    const dedup = all.filter((c) => {
      const k = `${c.id}`
      if (seen.has(k)) { return false }
      seen.add(k); return true
    })
    const map = {}
    dedup.forEach((c) => {
      const y = new Date(c.date).getFullYear()
      ;(map[y] = map[y] || []).push(c)
    })
    return Object.entries(map).sort((a, b) => b[0] - a[0]).map(([y, meets]) => [y, meets.sort((a, b) => new Date(b.date) - new Date(a.date))])
  }, [hosted, participated])
  return (
    <div className="pad-lg">
      <TabHeading title={`${countryName} Archives`} />
      {byYear.length === 0 ? <Empty label="No archived championships" /> : byYear.map(([year, meets]) => (
        <div key={year} style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: 'var(--color-accent-800)' }}>{year}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--color-neutral-300)' }} />
            <span className="micro asw-num">{meets.length} meet{meets.length > 1 ? 's' : ''}</span>
          </div>
          {meets.map((c) => (
            <Link key={`${c.kind}-${c.id}`} to={`/meets/${c.id}`} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', color: 'inherit', textDecoration: 'none', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 0, background: c.kind === 'Hosted' ? 'var(--color-accent-800)' : 'var(--color-accent-100)', color: c.kind === 'Hosted' ? '#fff' : 'var(--color-accent-800)', flex: 'none' }}>{c.kind}</span>
              <span style={{ flex: 1, minWidth: 200 }}>
                <span style={{ fontWeight: 600, display: 'block' }}>{c.name}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>{formatDate(c.date)} · {c.pool}{c.location ? ` · ${c.location}` : ''}{c.classification ? ` · ${c.classification}` : ''}</span>
              </span>
              {c.medals?.total > 0 && (
                <span className="asw-num" style={{ fontSize: 12, display: 'inline-flex', gap: 8, flex: 'none' }}>
                  <span style={{ color: 'var(--asw-gold)', fontWeight: 800 }}>{c.medals.gold}G</span>
                  <span style={{ color: 'var(--asw-silver)', fontWeight: 800 }}>{c.medals.silver}S</span>
                  <span style={{ color: 'var(--asw-bronze)', fontWeight: 800 }}>{c.medals.bronze}B</span>
                </span>
              )}
            </Link>
          ))}
        </div>
      ))}
    </div>
  )
}

function ProgressionChart({ lines }) {
  if (!lines || lines.length === 0) return <Empty label="No progression data" />
  const allPoints = lines.flatMap((l) => l.points || [])
  if (allPoints.length === 0) return <Empty label="No data for this stroke" />
  const csValues = allPoints.map((p) => p.cs).filter(Boolean)
  const minCs = Math.min(...csValues)
  const maxCs = Math.max(...csValues)
  const range = maxCs - minCs || 1
  const years = [...new Set(allPoints.map((p) => p.year))].sort()
  const W = 600; const H = 200; const pL = 70; const pR = 20; const pT = 10; const pB = 30
  const x = (yr) => pL + ((yr - years[0]) / (years[years.length - 1] - years[0] || 1)) * (W - pL - pR)
  const y = (cs) => pT + ((cs - minCs) / range) * (H - pT - pB)
  return (
    <div className="table-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 600, height: 'auto' }}
        role="img" aria-label={`Best time by year, ${years[0]} to ${years[years.length - 1]}: ${lines.map((l) => l.event).join(', ')}`}>
        {csValues.length > 1 && Array.from({ length: 4 }, (_, i) => {
          const cs = minCs + (range * i) / 3
          const yy = y(cs)
          const m = Math.floor(cs / 6000); const s = Math.floor((cs % 6000) / 100); const c = cs % 100
          return <g key={i}><line x1={pL} x2={W - pR} y1={yy} y2={yy} stroke="var(--color-neutral-300)" /><text x={pL - 8} y={yy + 4} textAnchor="end" fill="var(--color-neutral-700)" fontSize="11" style={{ fontVariantNumeric: 'tabular-nums' }}>{m ? `${m}:${String(s).padStart(2, '0')}` : `${s}.${String(c).padStart(2, '0')}`}</text></g>
        })}
        {years.filter((_, i) => i % Math.ceil(years.length / 8) === 0 || i === years.length - 1).map((yr) => (
          <text key={yr} x={x(yr)} y={H - 4} textAnchor="middle" fill="var(--color-neutral-700)" fontSize="11">{yr}</text>
        ))}
        {lines.map((line, li) => {
          const pts = (line.points || []).filter((p) => p.cs)
          if (pts.length < 2) return null
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.year)},${y(p.cs)}`).join(' ')
          return <path key={li} d={d} fill="none" stroke={LINE_HEX[li % LINE_HEX.length]} strokeWidth={2} />
        })}
        {lines.map((line, li) => (line.points || []).filter((p) => p.cs).map((p, pi) => (
          <circle key={`${li}-${pi}`} cx={x(p.year)} cy={y(p.cs)} r={3} fill={LINE_HEX[li % LINE_HEX.length]}><title>{line.event} {p.year}: {formatTime(p.cs)} ({p.swimmer})</title></circle>
        )))}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 8 }}>
        {lines.map((l, i) => <span key={i} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 3, background: LINE_HEX[i % LINE_HEX.length], display: 'inline-block' }} />{l.event}</span>)}
      </div>
    </div>
  )
}

function RecordsTable({ records }) {
  return (
    <div className="table-scroll">
      <table className="table">
        <thead><tr><th>Event</th><th>Pool</th><th>Sex</th><th className="time">Time</th><th>Swimmer</th><th>Meet</th><th>Date</th></tr></thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600 }}>{r.event}</td>
              <td className="text-muted">{r.pool}</td>
              <td className="text-muted">{r.sex === 'F' ? "Women's" : "Men's"}</td>
              <td className="time asw-time">{r.time}</td>
              <td><SwimmerLink id={r.swimmer_id} name={r.swimmer} /></td>
              <td className="text-muted">{r.championship || '—'}</td>
              <td className="text-muted">{formatDate(r.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Statistics dashboard (blue-themed cards matching ISF design) ───
const S = {
  bg: '#ffffff',
  card: { background: '#fff', borderRadius: 0, padding: '16px 16px', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', position: 'relative' },
  title: { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-800)', display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.2 },
  sub: { fontSize: 11, color: 'var(--color-neutral-700)', marginBottom: 14, marginTop: 3, lineHeight: 1.3 },
  viewAll: { fontSize: 11, color: 'var(--color-accent-500)', fontWeight: 700, marginLeft: 'auto', textDecoration: 'none', textTransform: 'none', letterSpacing: '0.03em' },
  rankBadge: (i) => ({
    width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, color: '#fff',
    background: 'var(--color-accent-800)',
    flexShrink: 0, border: '1px solid var(--color-divider)',
  }),
  medalCircle: (color) => ({
    width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, color: '#fff', background: color, flexShrink: 0,
    border: '1px solid var(--color-divider)',
  }),
  th: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-neutral-700)', padding: '8px 0', borderBottom: '2px solid var(--color-neutral-300)' },
  row: (i) => ({ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--color-neutral-200)', fontSize: 13, background: i % 2 === 1 ? 'var(--color-neutral-100)' : 'transparent' }),
  photo: { width: 52, height: 52, borderRadius: '50%', background: 'var(--color-neutral-200)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--color-neutral-700)', border: '2px solid var(--color-accent-200)', overflow: 'hidden' },
  photoSmall: { width: 28, height: 28, borderRadius: '50%', background: 'var(--color-neutral-200)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--color-neutral-700)', border: '1.5px solid var(--color-accent-200)', overflow: 'hidden' },
}
const PERF_BAR_COLORS = ['var(--color-accent-900)', 'var(--color-accent-800)', 'var(--color-accent-700)', 'var(--color-accent-600)', 'var(--color-accent-500)', 'var(--color-accent-400)', 'var(--color-accent-300)', 'var(--color-accent-2-300)', 'var(--color-accent-200)', 'var(--color-neutral-400)']

const DEMONYMS = {
  Algeria: 'Algerian', Bahrain: 'Bahraini', Comoros: 'Comorian', Djibouti: 'Djiboutian',
  Egypt: 'Egyptian', Iraq: 'Iraqi', Jordan: 'Jordanian', Kuwait: 'Kuwaiti',
  Lebanon: 'Lebanese', Libya: 'Libyan', Mauritania: 'Mauritanian', Morocco: 'Moroccan',
  Oman: 'Omani', Palestine: 'Palestinian', Qatar: 'Qatari', 'Saudi Arabia': 'Saudi',
  Somalia: 'Somali', Sudan: 'Sudanese', Syria: 'Syrian', Tunisia: 'Tunisian',
  'United Arab Emirates': 'Emirati', UAE: 'Emirati', Yemen: 'Yemeni',
}
const demonym = (name) => DEMONYMS[name] || name

function SCard({ icon, title, subtitle, viewAll, children, style: extra }) {
  return (
    <div style={{ ...S.card, ...extra }}>
      <div style={S.title}>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
        {title}
        {viewAll && <span style={S.viewAll}>View All</span>}
      </div>
      {subtitle && <div style={S.sub}>{subtitle}</div>}
      {children}
    </div>
  )
}

function STableHead({ cols }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 6px', marginBottom: 4 }}>
      <span style={{ ...S.th, width: 24 }}>#</span>
      {cols.map(([label, w, align]) => (
        <span key={label} style={{ ...S.th, width: w || undefined, flex: w ? 'none' : 1, textAlign: align || 'left' }}>{label}</span>
      ))}
    </div>
  )
}

function RankedRow({ rank, idx, children }) {
  return (
    <div style={S.row(idx ?? rank - 1)}>
      <span style={S.rankBadge(rank - 1)}>{rank}</span>
      {children}
    </div>
  )
}

const AGE_CATS = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'Open']
const REC_TYPE_LABELS = {
  NATIONAL: 'National', ARAB: 'Arab', GCC: 'GCC', AFRICAN: 'African',
  ASIAN: 'Asian', MEDITERRANEAN: 'Mediterranean', ISLAMIC: 'Islamic', WORLD: 'World',
}
const REC_TYPE_ORDER = ['NATIONAL', 'ARAB', 'GCC', 'AFRICAN', 'ASIAN', 'MEDITERRANEAN', 'ISLAMIC', 'WORLD']
const REC_TYPE_COLORS = {
  NATIONAL: 'var(--color-accent-800)', ARAB: 'var(--asw-gold)', GCC: 'var(--asw-fast)', AFRICAN: 'var(--asw-slow)',
  ASIAN: 'var(--asw-bronze)', MEDITERRANEAN: 'var(--color-accent-2)', ISLAMIC: 'var(--asw-fast)', WORLD: 'var(--color-accent-800)',
}

// Time parser for defensive client-side dedupe ("1:49.26" -> centiseconds)
function timeToCs(t) {
  const parts = String(t || '').split(':').map(Number)
  if (parts.some(Number.isNaN)) return Infinity
  let s = 0
  for (const p of parts) s = s * 60 + p
  return Math.round(s * 100)
}

function RecordsTab({ records, country }) {
  const [gender, setGender] = useState('M')
  const [pool, setPool] = useState('')
  const [ageCat, setAgeCat] = useState('Open')

  // Defensive dedupe: keep only the fastest row per scope group even if the
  // API ever returns history rows again.
  const currentRecords = useMemo(() => {
    const best = new Map()
    records.forEach((r) => {
      const key = [r.record_type, r.event, r.sex, r.pool, r.age_category].join('|')
      const held = best.get(key)
      if (!held || timeToCs(r.time) < timeToCs(held.time)) best.set(key, r)
    })
    return records.filter((r) => best.get([r.record_type, r.event, r.sex, r.pool, r.age_category].join('|')) === r)
  }, [records])

  const typesPresent = REC_TYPE_ORDER.filter((t) => currentRecords.some((r) => r.record_type === t))
  const [recType, setRecType] = useState('NATIONAL')
  const activeType = typesPresent.includes(recType) ? recType : (typesPresent[0] || 'NATIONAL')

  const filtered = currentRecords.filter((r) => {
    if (r.record_type !== activeType) return false
    if (r.sex !== gender) return false
    if (pool && r.pool !== pool) return false
    const wanted = ageCat === 'Open' ? 'OPEN' : ageCat
    if (r.age_category && r.age_category !== wanted) return false
    if (!r.age_category && ageCat !== 'Open') return false
    return true
  })

  const selStyle = { padding: '10px 20px', border: '1px solid var(--color-neutral-400)', borderRadius: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-accent-800)', background: '#fff', cursor: 'pointer', minWidth: 180, appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%230b2948\' stroke-width=\'2\' fill=\'none\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }
  const pillBase = { padding: '8px 16px', border: '2px solid var(--color-accent-800)', borderRadius: 0, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', minHeight: 36 }
  const pillActive = { ...pillBase, background: 'var(--color-accent-800)', color: '#fff' }
  const pillInactive = { ...pillBase, background: '#fff', color: 'var(--color-accent-800)' }

  return (
    <div className="m-pad" style={{ padding: '24px 32px' }}>
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 28, marginBottom: 4 }}><Medal size={20} aria-hidden="true" /></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ width: 60, height: 2, background: 'var(--color-accent-800)' }} />
          <h2 className="prof-h" style={{ margin: 0 }}>Records</h2>
          <div style={{ width: 60, height: 2, background: 'var(--color-accent-800)' }} />
        </div>
      </div>

      {/* Record type sub-tabs */}
      {typesPresent.length > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
          {typesPresent.map((t) => (
            <button key={t} type="button" onClick={() => setRecType(t)} aria-pressed={activeType === t}
              style={activeType === t
                ? { ...pillBase, border: `2px solid ${REC_TYPE_COLORS[t]}`, background: 'var(--color-accent-800)', color: '#fff', boxShadow: `inset 0 -4px 0 ${REC_TYPE_COLORS[t]}` }
                : { ...pillBase, border: `2px solid ${REC_TYPE_COLORS[t]}`, background: '#fff', color: 'var(--color-accent-800)' }}>
              {REC_TYPE_LABELS[t]} Records
            </button>
          ))}
        </div>
      )}

      {/* Filters: Men's/Women's pills (Men's default) + Pool dropdown */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setGender('M')} aria-pressed={gender === 'M'} style={gender === 'M' ? pillActive : pillInactive}>Men's</button>
          <button type="button" onClick={() => setGender('F')} aria-pressed={gender === 'F'} style={gender === 'F' ? pillActive : pillInactive}>Women's</button>
        </div>
        <select aria-label="Pool length" style={selStyle} value={pool} onChange={(e) => setPool(e.target.value)}>
          <option value="">All pools</option>
          <option value="LCM">50m pool (LCM)</option>
          <option value="SCM">25m pool (SCM)</option>
        </select>
      </div>

      {/* Age category pills */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
        {AGE_CATS.map((cat) => (
          <button key={cat} type="button" onClick={() => setAgeCat(cat)} aria-pressed={ageCat === cat}
            style={ageCat === cat ? pillActive : pillInactive}>
            {cat}
          </button>
        ))}
      </div>

      {/* Working Memory: what the current selection is and how many records it holds */}
      {filtered.length > 0 && (
        <div className="micro asw-num" style={{ textAlign: 'center', margin: '-12px 0 18px' }} aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'record' : 'records'} · {gender === 'F' ? "Women's" : "Men's"} · {pool ? poolLabel(pool) : 'all pools'} · {ageCat}
        </div>
      )}
      {/* Record cards grid */}
      {filtered.length === 0 ? <Empty label="No records for this selection" hint="Try another gender, pool length or age category." /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 16 }}>
          {filtered.map((r, i) => (
            <div key={i} style={{ borderRadius: 0, textAlign: 'center', background: '#fff', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', padding: '16px 16px 20px', display: 'flex', flexDirection: 'column' }}>
              {/* Large rounded photo */}
              <div style={{ width: '100%', aspectRatio: '1 / 1.05', borderRadius: 0, overflow: 'hidden', background: 'var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: 'var(--color-neutral-700)' }}>
                {r.swimmer_photo ? <Pic kind="person" w={160} src={r.swimmer_photo} /> : <Waves size={22} aria-hidden="true" />}
              </div>
              <div style={{ paddingTop: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-accent-800)' }}>
                  <SwimmerLink id={r.swimmer_id} name={r.swimmer} />
                </div>
                <div style={{ fontSize: 14, color: 'var(--color-accent-800)', fontWeight: 600, marginTop: 6 }}>{r.event} | {poolLabel(r.pool)}</div>
                <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32, color: 'var(--color-accent-800)', letterSpacing: '-0.02em', marginTop: 6 }}>{r.time}</div>
              </div>
              <div style={{ paddingTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-neutral-700)' }}>{r.sex === 'F' ? "Women's" : "Men's"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Drill-down page for one classification's medals (opened from the tally widgets)
// Which countries belong to each regional classification (FINA codes).
// Non-regional classifications (Olympic, World, Arab, National, Islamic,
// Other…) show every country.
const GCC_CODES = ['KSA', 'KWT', 'QAT', 'BHR', 'UAE', 'OMA']
const CLASS_COUNTRY_CODES = {
  GCC: GCC_CODES,
  Asian: [...GCC_CODES, 'IRQ', 'YEM', 'LBN', 'PLE', 'JOR', 'SYR'],
  African: ['EGY', 'SUD', 'COM', 'SOM', 'DJI', 'LBY', 'TUN', 'ALG', 'MAR', 'MTN'],
  Mediterranean: ['MAR', 'ALG', 'TUN', 'LBY', 'EGY', 'LBN', 'SYR'],
}

function MedalClassDetail({ countryId, className, box, onBack }) {
  const [rows, setRows] = useState([])
  const [medalists, setMedalists] = useState([])
  const [standings, setStandings] = useState([])
  const [loading, setLoading] = useState(true)
  const [sub, setSub] = useState('countries')
  const load = useRetry()

  useEffect(() => {
    let alive = true
    setLoading(true)
    getClassifications()
      .then((r) => {
        const all = Array.isArray(r.data) ? r.data : r.data?.results || []
        const cls = all.find((c) => c.name === className)
        if (!cls) return Promise.reject(new Error('unknown classification'))
        return Promise.all([
          getMedals({ ...(countryId ? { country: countryId } : {}), classification: cls.id, page_size: 5000 }),
          getMedalSwimmerSummary({ ...(countryId ? { country: countryId } : {}), classification: cls.id, limit: 'all' }),
          getMedalSummary({ classification: cls.id }),
          getCountries(),
        ])
      })
      .then(([m, s, t, c]) => {
        if (!alive) return
        setRows(Array.isArray(m.data) ? m.data : m.data?.results || [])
        setMedalists(Array.isArray(s.data) ? s.data : s.data?.results || [])
        const tally = Array.isArray(t.data) ? t.data : t.data?.results || []
        const countries = Array.isArray(c.data) ? c.data : c.data?.results || []
        const byCode = {}
        tally.forEach((r) => { byCode[r.swimmer__nationality__code] = r })
        const allowed = CLASS_COUNTRY_CODES[className]
        // Show the classification's full country list — zero-medal
        // countries included — not just those that have medalled.
        const pool = allowed
          ? allowed.map((code) => ({ code, meta: countries.find((x) => x.code === code) }))
          : countries.filter((x) => x.region === 'ARAB' || x.region === 'GCC')
              .map((x) => ({ code: x.code, meta: x }))
        const merged = pool.map(({ code, meta }) => byCode[code] || {
          swimmer__nationality__code: code,
          swimmer__nationality__name: meta?.name || code,
          swimmer__nationality__flag_url: meta?.flag_url || null,
          gold: 0, silver: 0, bronze: 0, total: 0,
        })
        merged.sort((a, b) => b.gold - a.gold || b.silver - a.silver
          || b.bronze - a.bronze
          || String(a.swimmer__nationality__name).localeCompare(String(b.swimmer__nationality__name)))
        setStandings(merged)
      })
      .catch(() => { if (alive) { setRows([]); setMedalists([]); setStandings([]); load.fail() } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [countryId, className, load.tryKey])

  const byChamp = useMemo(() => {
    const map = {}
    rows.forEach((m) => {
      const c = m.championship_detail
      if (!c) return
      if (!map[c.id]) map[c.id] = { id: c.id, name: c.name, date: c.date, location: c.location, gold: 0, silver: 0, bronze: 0, total: 0 }
      const k = m.medal_type === 'GOLD' ? 'gold' : m.medal_type === 'SILVER' ? 'silver' : 'bronze'
      map[c.id][k]++; map[c.id].total++
    })
    return Object.values(map).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [rows])

  const sortedMedals = useMemo(() => {
    const order = { GOLD: 0, SILVER: 1, BRONZE: 2 }
    return [...rows].sort((a, b) =>
      (b.championship_detail?.date || '').localeCompare(a.championship_detail?.date || '') ||
      (order[a.medal_type] ?? 3) - (order[b.medal_type] ?? 3))
  }, [rows])

  const color = CLASS_COLORS[className] || 'var(--color-accent-800)'
  const medalBadge = (type) => {
    // navy letter on gold/silver, white on bronze: each pair passes WCAG AA
    const map = { GOLD: ['G', 'var(--asw-gold)', 'var(--wa-ink)'], SILVER: ['S', 'var(--asw-silver)', 'var(--wa-ink)'], BRONZE: ['B', 'var(--asw-bronze)', '#fff'] }
    const [letter, bg, fg] = map[type] || ['?', 'var(--color-neutral-700)', '#fff']
    return <span className="asw-num" title={type ? type.charAt(0) + type.slice(1).toLowerCase() : undefined} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: bg, color: fg, fontWeight: 800, fontSize: 12 }}>{letter}</span>
  }
  const statBox = (label, value, accent) => (
    <div style={{ flex: '1 1 100px', maxWidth: 160, background: '#fff', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', borderRadius: 0, padding: '12px 16px', textAlign: 'center' }}>
      <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: accent }}>{formatNumber(value)}</div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-neutral-700)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div className="pad-lg">
      <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--color-accent-800)', fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', minHeight: 40 }}>
        ← All competitions
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '14px 0 18px', flexWrap: 'wrap' }}>
        <span style={{ background: color, color: '#fff', padding: '8px 16px', borderRadius: 0, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{className}</span>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: 'var(--color-accent-800)' }}>Medal Details</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {statBox('Gold', box?.gold ?? 0, 'var(--asw-gold)')}
        {statBox('Silver', box?.silver ?? 0, 'var(--color-neutral-700)')}
        {statBox('Bronze', box?.bronze ?? 0, 'var(--asw-gold)')}
        {statBox('Total', box?.total ?? 0, 'var(--color-accent-800)')}
      </div>

      <SubTabs
        options={[['countries', 'Countries'], ['championships', 'By Championship'], ['medalists', 'Medalists'], ['medals', 'All Medals']]}
        value={sub} onChange={setSub}
      />

      {loading && <Loading label="Loading medals" />}
      {!loading && load.failed && <LoadFailed what={`${className} medals`} onRetry={load.retry} />}

      {!loading && !load.failed && sub === 'countries' && (
        standings.length === 0 ? <Empty label="No medals" hint="No medals recorded at this level of competition yet." /> : (
          <MedalStandings
            rows={standings}
            entityHeader="Country"
            rowKey={(c, i) => c.swimmer__nationality__code || i}
            renderPodiumChip={(c) => (
              <>
                <Flag code={c.swimmer__nationality__code} name={c.swimmer__nationality__name} flagUrl={c.swimmer__nationality__flag_url} />
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.swimmer__nationality__code}</span>
              </>
            )}
            renderEntity={(c) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                <Flag code={c.swimmer__nationality__code} name={c.swimmer__nationality__name} flagUrl={c.swimmer__nationality__flag_url} />
                {c.swimmer__nationality__name}
              </span>
            )}
          />
        )
      )}

      {!loading && !load.failed && sub === 'championships' && (
        byChamp.length === 0 ? <Empty label="No medals" hint="No medals won at this level of competition yet." /> : (
          <div className="table-scroll"><table className="table"><thead><tr><th>Championship</th><th>Date</th><th>Location</th><th className="num">G</th><th className="num">S</th><th className="num">B</th><th className="num">Total</th></tr></thead><tbody>
            {byChamp.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/meets/${c.id}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>{c.name}</Link></td>
                <td className="text-muted">{formatDate(c.date)}</td>
                <td className="text-muted">{c.location || '—'}</td>
                <td className="num asw-num" style={{ fontWeight: 800 }}>{c.gold}</td>
                <td className="num asw-num">{c.silver}</td>
                <td className="num asw-num">{c.bronze}</td>
                <td className="num asw-num" style={{ fontWeight: 800 }}>{c.total}</td>
              </tr>
            ))}
          </tbody></table></div>
        )
      )}

      {!loading && !load.failed && sub === 'medalists' && (
        medalists.length === 0 ? <Empty label="No medalists" hint="No swimmer has won a medal at this level of competition yet." /> : (
          <MedalStandings
            rows={medalists}
            entityHeader="Swimmer"
            rowKey={(m, i) => m.swimmer__id ?? i}
            renderPodiumChip={(m) => (
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.swimmer__name}</span>
            )}
            renderEntity={(m) => <SwimmerLink id={m.swimmer__id} name={m.swimmer__name} />}
          />
        )
      )}

      {!loading && !load.failed && sub === 'medals' && (
        sortedMedals.length === 0 ? <Empty label="No medals" hint="No medals won at this level of competition yet." /> : (
          <div className="table-scroll"><table className="table"><thead><tr><th style={{ width: 40 }}><span className="sr-only">Medal</span></th><th>Event</th><th>Swimmer</th><th>Championship</th><th>Date</th></tr></thead><tbody>
            {sortedMedals.map((m) => (
              <tr key={m.id}>
                <td>{medalBadge(m.medal_type)}</td>
                <td style={{ fontWeight: 600 }}>{m.event_detail?.name || '—'}</td>
                <td>{m.swimmer_detail?.is_relay_team
                  ? <span style={{ fontWeight: 600 }}>{m.swimmer_detail?.name}</span>
                  : <SwimmerLink id={m.swimmer_detail?.id} name={m.swimmer_detail?.name} />}</td>
                <td>{m.championship_detail
                  ? <Link to={`/meets/${m.championship_detail.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{m.championship_detail.name}</Link>
                  : '—'}</td>
                <td className="text-muted">{formatDate(m.championship_detail?.date)}</td>
              </tr>
            ))}
          </tbody></table></div>
        )
      )}
    </div>
  )
}

function CompareTab({ profile, country }) {
  const [countries, setCountries] = useState([])
  const [otherId, setOtherId] = useState('')
  const [other, setOther] = useState(null)
  const [loadingOther, setLoadingOther] = useState(false)
  const [battleKey, setBattleKey] = useState(null)
  const load = useRetry()

  // Events where BOTH federations have a national best time — one is picked at random per compare
  const commonEvents = useMemo(() => {
    if (!other) return []
    const keyOf = (t) => `${t.event}|${t.sex}|${t.pool}`
    const mine = new Set((profile.best_times || []).map(keyOf))
    return [...new Set((other.best_times || []).map(keyOf))].filter((k) => mine.has(k))
  }, [other, profile])

  useEffect(() => {
    setBattleKey(commonEvents.length ? commonEvents[Math.floor(Math.random() * commonEvents.length)] : null)
  }, [commonEvents])

  useEffect(() => {
    let alive = true
    getCountries({ page_size: 100 })
      .then((r) => {
        const rows = Array.isArray(r.data) ? r.data : r.data?.results || []
        if (!alive) return
        const list = rows.filter((c) => ['ARAB', 'GCC'].includes(c.region) && c.id !== country.id)
        setCountries(list)
        // Tesler's Law: open on a comparison instead of an empty page. The
        // default opponent is the federation with the most swimmers in the
        // Arab top 100 (other than this one); the picker changes it.
        const rival = [...(profile.country_battle || [])]
          .filter((b) => b.country_id !== country.id && list.some((c) => c.id === b.country_id))
          .sort((a, b) => (b.count || 0) - (a.count || 0))[0]
        if (rival) setOtherId((cur) => cur || String(rival.country_id))
      })
      .catch(() => alive && setCountries([]))
    return () => { alive = false }
  }, [country.id])

  useEffect(() => {
    if (!otherId) { setOther(null); return }
    let alive = true; setLoadingOther(true)
    getCountryProfile(otherId, { lite: 1 })
      .then((r) => alive && setOther(r.data))
      .catch(() => { if (alive) { setOther(null); load.fail() } })
      .finally(() => alive && setLoadingOther(false))
    return () => { alive = false }
  }, [otherId, load.tryKey])

  const battleCount = (p, cid) => (p?.country_battle || []).find((b) => b.country_id === cid)?.count || 0
  const bestFina = (p, sex) => {
    const pts = (p?.top_swimmers || []).filter((s) => s.sex === sex).map((s) => s.best_fina || 0)
    return pts.length ? Math.max(...pts) : null
  }

  // International-level comparison only — domestic national championship
  // data (medals, participations) is excluded so federations are measured
  // on the same playing field.
  const intlMedals = (p, key) => (p?.medals_by_classification || [])
    .filter((m) => m.name !== 'National')
    .reduce((sum, m) => sum + (m[key] || 0), 0)
  const intlParticipations = (p) => (p?.championships_participated || [])
    .filter((c) => c.classification && c.classification !== 'National').length

  const rows = other ? [
    ['Swimmers in Top 100 Arab Ranking', battleCount(profile, country.id), battleCount(profile, other.country.id)],
    ['Arab Records Held', profile.stats.arab_records, other.stats.arab_records],
    ['International Gold Medals', intlMedals(profile, 'gold'), intlMedals(other, 'gold')],
    ['International Silver Medals', intlMedals(profile, 'silver'), intlMedals(other, 'silver')],
    ['International Bronze Medals', intlMedals(profile, 'bronze'), intlMedals(other, 'bronze')],
    ['International Medals Total', intlMedals(profile, 'total'), intlMedals(other, 'total')],
    ['Best Male FINA Points', bestFina(profile, 'M'), bestFina(other, 'M')],
    ['Best Female FINA Points', bestFina(profile, 'F'), bestFina(other, 'F')],
    ['International Meets Participated', intlParticipations(profile), intlParticipations(other)],
    ['Swimmers with International Experience', profile.stats.intl_swimmers, other.stats.intl_swimmers],
  ] : []

  return (
    <div className="pad-lg">
      <TabHeading title="Federation Comparison" />
      <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-neutral-700)', margin: '10px 0 0', fontWeight: 600 }}>
        International-level data only — domestic national championships are excluded
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, margin: '18px 0 26px', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: 'var(--color-accent-800)' }}><Flag code={country.code} /> {country.name}</span>
        <span style={{ fontWeight: 800, color: 'var(--color-accent-800)', fontSize: 16 }}>VS</span>
        <select aria-label="Federation to compare against" value={otherId} onChange={(e) => { load.retry(); setOtherId(e.target.value) }} style={{ minHeight: 36, padding: '8px 16px', border: '2px solid var(--color-accent-800)', borderRadius: 0, fontSize: 14, fontWeight: 700, color: 'var(--color-accent-800)', background: '#fff', fontFamily: 'inherit' }}>
          <option value="">Choose a federation…</option>
          {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {loadingOther && <Loading label="Loading federation" />}
      {!loadingOther && !other && load.failed && <LoadFailed what="that federation" onRetry={load.retry} />}
      {!loadingOther && !other && !load.failed && <Empty label="Pick a federation to compare against" hint="Choose one from the list above to see both side by side." />}
      {!loadingOther && other && (
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'var(--color-accent-800)', color: '#fff', borderRadius: 0, fontWeight: 800, fontSize: 14 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Flag code={country.code} /> {country.name}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{other.country.name} <Flag code={other.country.code} /></span>
          </div>
          {rows.map(([label, a, b], i) => {
            const winA = a > b; const winB = b > a
            const numStyle = (win) => ({ width: 110, fontWeight: 800, fontSize: 16, color: win ? 'var(--color-accent-800)' : 'var(--color-neutral-700)' })
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', background: i % 2 ? 'var(--color-neutral-100)' : '#fff', borderBottom: '1px solid var(--color-accent-2-200)' }}>
                <span className="asw-num" style={{ ...numStyle(winA), textAlign: 'left' }}>{formatNumber(a)}</span>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-neutral-800)' }}>{label}</span>
                <span className="asw-num" style={{ ...numStyle(winB), textAlign: 'right' }}>{formatNumber(b)}</span>
              </div>
            )
          })}

          {/* Event Battle — random event, fastest swimmer of each country */}
          {battleKey && (() => {
            const [ev, sex, pool] = battleKey.split('|')
            const pick = (p) => (p.best_times || []).find((t) => t.event === ev && t.sex === sex && t.pool === pool)
            const a = pick(profile); const b = pick(other)
            if (!a || !b) return null
            const secs = (t) => String(t || '').split(':').reduce((acc, x) => acc * 60 + (parseFloat(x) || 0), 0)
            const aWins = secs(a.time) <= secs(b.time)
            const side = (t, cn, code, win, align) => (
              <div style={{ flex: 1, textAlign: align, padding: '16px 16px', background: win ? 'var(--color-neutral-200)' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: align === 'right' ? 'flex-end' : 'flex-start', fontWeight: 800, fontSize: 13, color: 'var(--color-accent-800)' }}>
                  {align === 'left' && <Flag code={code} />}{cn}{align === 'right' && <Flag code={code} />}
                </div>
                <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: win ? 'var(--asw-fast)' : 'var(--color-neutral-700)', marginTop: 6, letterSpacing: '-0.01em' }}>
                  {t.time}{win && <span style={{ fontSize: 11, fontWeight: 800, background: 'var(--asw-fast)', color: '#fff', padding: '4px 8px', borderRadius: 0, letterSpacing: '0.08em', margin: '0 8px', verticalAlign: 'middle' }}>FASTER</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-accent-800)', marginTop: 4 }}><SwimmerLink id={t.swimmer_id} name={t.swimmer} /></div>
                <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 2 }}>{t.fina ? `${t.fina} FINA pts` : ''}{t.date ? ` · ${formatDate(t.date)}` : ''}</div>
              </div>
            )
            return (
              <div style={{ marginTop: 26, border: '1px solid var(--color-neutral-300)', borderRadius: 0, overflow: 'hidden',  }}>
                <div style={{ background: 'var(--color-accent-800)', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-2-400)' }}>Event Battle · Fastest of Each Country</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, marginTop: 2 }}>
                      {ev} · {sex === 'F' ? "Women" : "Men"} · {pool === 'SCM' ? 'Short Course' : 'Long Course'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => commonEvents.length > 1 && setBattleKey(commonEvents.filter((k) => k !== battleKey)[Math.floor(Math.random() * (commonEvents.length - 1))])}
                    style={{ background: 'var(--color-accent-800)', color: '#fff', border: 'none', borderRadius: 0, padding: '8px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', minHeight: 36 }}
                  >
                    Another event
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'stretch' }}>
                  {side(a, country.name, country.code, aWins, 'left')}
                  <div style={{ width: 1, background: 'var(--color-neutral-300)' }} />
                  {side(b, other.country.name, other.country.code, !aWins, 'right')}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

function StatisticsTab({ profile, country, topSwimmers, topMedalists, records, medalBoxes, hosted, participated }) {
  const maleTop = topSwimmers.filter((s) => s.sex === 'M').slice(0, 5)
  const femaleTop = topSwimmers.filter((s) => s.sex === 'F').slice(0, 5)
  const maleMedalists = topMedalists.filter((m) => m.sex === 'M').slice(0, 5)
  const femaleMedalists = topMedalists.filter((m) => m.sex === 'F').slice(0, 5)

  const maleRecords = records.filter((r) => r.sex === 'M').sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const femaleRecords = records.filter((r) => r.sex === 'F').sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const lastMR = maleRecords[0]
  const lastFR = femaleRecords[0]

  const recBySwimmer = {}
  records.forEach((r) => {
    const k = `${r.swimmer_id}_${r.sex}`
    if (!recBySwimmer[k]) recBySwimmer[k] = { id: r.swimmer_id, name: r.swimmer, sex: r.sex, count: 0 }
    recBySwimmer[k].count++
  })
  const topMaleRec = Object.values(recBySwimmer).filter((r) => r.sex === 'M').sort((a, b) => b.count - a.count)[0]
  const topFemaleRec = Object.values(recBySwimmer).filter((r) => r.sex === 'F').sort((a, b) => b.count - a.count)[0]

  const perfTiers = [
    { label: 'World-Class', range: '900+', min: 900, max: Infinity },
    { label: 'International Elite', range: '800-899', min: 800, max: 900 },
    { label: 'High Performance', range: '700-799', min: 700, max: 800 },
    { label: 'Advanced', range: '600-699', min: 600, max: 700 },
    { label: 'Competitive', range: '500-599', min: 500, max: 600 },
    { label: 'Developing', range: '400-499', min: 400, max: 500 },
    { label: 'Foundation', range: '300-399', min: 300, max: 400 },
    { label: 'Novice', range: '200-299', min: 200, max: 300 },
    { label: 'Entry Level', range: '100-199', min: 100, max: 200 },
  ]
  const perfDist = perfTiers.map((t) => ({
    ...t, count: topSwimmers.filter((s) => (s.best_fina || 0) >= t.min && (s.best_fina || 0) < t.max).length,
  }))
  const maxPerf = Math.max(...perfDist.map((d) => d.count), 1)

  const partByClass = {}
  participated.forEach((c) => {
    const cls = c.classification || 'Other'
    if (/^(national|other)$/i.test(cls)) return
    partByClass[cls] = (partByClass[cls] || 0) + 1
  })
  const participationList = Object.entries(partByClass).sort((a, b) => b[1] - a[1])
  const maxPart = Math.max(...participationList.map(([, n]) => n), 1)

  // Helpers
  const cardHeader = (title, sub) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 4, height: 17, background: 'var(--color-accent-800)', borderRadius: 0, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-800)' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--color-accent-500)', fontWeight: 700, marginLeft: 'auto' }}>View All</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-neutral-700)', marginTop: 4, lineHeight: 1.3, paddingLeft: 13 }}>{sub}</div>
    </div>
  )
  const card = (children, extra = {}) => (
    <div style={{ background: '#fff', borderRadius: 0, padding: '16px 16px', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', ...extra }}>{children}</div>
  )
  const thStyle = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-neutral-700)', paddingBottom: 6, borderBottom: '2px solid var(--color-neutral-300)' }
  const rowStyle = (i) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--color-accent-2-100)', fontSize: 13, background: i % 2 === 1 ? 'var(--color-neutral-100)' : 'transparent' })
  const badge = { width: 24, height: 24, borderRadius: '50%', background: 'var(--color-accent-800)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }
  const mc = (color) => ({ width: 26, height: 26, borderRadius: '50%', background: color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 })
  const barRow = (label, n, max) => (
    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
      <span style={{ width: 130, fontSize: 12, fontWeight: 600, flexShrink: 0, color: 'var(--color-neutral-800)' }}>{label}</span>
      <div style={{ flex: 1, height: 18, background: 'var(--color-neutral-200)', borderRadius: 0, overflow: 'hidden' }}>
        <div style={{ width: `${(n / max) * 100}%`, height: '100%', background: 'var(--color-accent-800)', borderRadius: 0, minWidth: n > 0 ? 8 : 0 }} />
      </div>
      <span className="asw-num" style={{ width: 28, textAlign: 'right', fontWeight: 800, color: 'var(--color-accent-800)', fontSize: 13, flexShrink: 0 }}>{n}</span>
    </div>
  )

  // Donut pie with centred total + legend (same style as meet analysis)
  const donut = (segments, centerLabel) => {
    const total = segments.reduce((s, x) => s + x.count, 0)
    if (!total) return <Empty label="No data" />
    const r = 44
    const C = 2 * Math.PI * r
    let acc = 0
    const segs = segments.map((s) => {
      const frac = s.count / total
      const seg = { ...s, dash: frac * C, offset: -acc * C, pct: Math.round(frac * 100) }
      acc += frac
      return seg
    })
    return (
      <div className="m-donut" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        <div className="m-donut-pie" style={{ position: 'relative', width: 150, height: 150, flexShrink: 0 }}>
          <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}
            role="img" aria-label={`${total} ${centerLabel}: ${segs.map((s) => `${s.label} ${s.count} (${s.pct}%)`).join(', ')}`}>
            {segs.map((s) => s.count > 0 && (
              <circle key={s.label} cx="60" cy="60" r={r} fill="none" stroke={s.color} strokeWidth="22"
                strokeDasharray={`${s.dash} ${C}`} strokeDashoffset={s.offset} />
            ))}
          </svg>
          <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, lineHeight: 1, color: 'var(--color-accent-800)' }}>{total}</span>
            <span style={{ fontSize: 11, color: 'var(--color-neutral-700)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{centerLabel}</span>
          </span>
        </div>
        <div className="m-donut-legend" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
          {segs.map((s) => (
            <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span className="m-donut-dot" style={{ width: 11, height: 11, borderRadius: 0, background: s.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: 'var(--color-neutral-800)', flex: 1, whiteSpace: 'nowrap' }}>{s.label}</span>
              <span className="asw-num" style={{ fontWeight: 800, color: 'var(--color-accent-800)' }}>{s.count}</span>
              <span className="asw-num m-donut-pct" style={{ color: 'var(--color-neutral-700)', width: 34, textAlign: 'right' }}>{s.pct}%</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  const AGE_COLORS = ['var(--color-accent-800)', 'var(--color-accent-800)', 'var(--color-accent-800)', 'var(--color-accent-400)', 'var(--color-accent-300)', 'var(--color-accent-200)']
  const STROKE_COLORS = { Freestyle: 'var(--color-accent-800)', Backstroke: 'var(--color-accent-2)', Breaststroke: 'var(--color-accent-800)', Butterfly: 'var(--color-accent-400)', Medley: 'var(--asw-gold)', 'Open Water': 'var(--asw-silver)' }
  const demo = profile.demographics || {}
  const genderSegs = [
    { label: 'Men', count: profile.stats?.swimmers_male || 0, color: 'var(--color-accent-800)' },
    { label: 'Women', count: profile.stats?.swimmers_female || 0, color: 'var(--color-accent-2)' },
  ]
  const ageSegs = (demo.ages || []).map((a, i) => ({ label: a.label, count: a.count, color: AGE_COLORS[i % AGE_COLORS.length] }))
  const strokeSegs = (demo.strokes || []).map((s, i) => ({ label: s.label, count: s.count, color: STROKE_COLORS[s.label] || AGE_COLORS[i % AGE_COLORS.length] }))

  const topPerfTable = (list) => (
    <>
      <div style={{ display: 'flex', gap: 8, ...thStyle, padding: '0 0 6px' }}>
        <span style={{ width: 24 }}>#</span>
        <span style={{ flex: 1 }}>Swimmer</span>
        <span style={{ width: 120 }}>Event</span>
        <span style={{ width: 60, textAlign: 'right' }}>Time</span>
        <span style={{ width: 36, textAlign: 'right' }}>Pts</span>
      </div>
      {list.map((s, i) => (
        <div key={s.id} style={rowStyle(i)}>
          <span style={badge}>{i + 1}</span>
          <Flag code={s.nationality_code || country.code} />
          <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: 'var(--color-accent-800)' }}><SwimmerLink id={s.id} name={s.name} /></span>
          <span style={{ width: 120, color: 'var(--color-neutral-700)', fontSize: 11 }}>{s.best_event}</span>
          <span className="asw-num" style={{ width: 60, textAlign: 'right', fontWeight: 800, color: 'var(--color-accent-800)', fontSize: 13 }}>{s.best_time}</span>
          <span className="asw-num" style={{ width: 36, textAlign: 'right', fontWeight: 800, color: 'var(--color-accent-800)', fontSize: 13 }}>{s.best_fina}</span>
        </div>
      ))}
    </>
  )

  const decoratedTable = (list) => (
    <>
      <div style={{ display: 'flex', gap: 8, ...thStyle, padding: '0 0 6px' }}>
        <span style={{ width: 24 }}>#</span>
        <span style={{ flex: 1 }}>Swimmer</span>
        <span style={{ width: 28, textAlign: 'center', color: 'var(--asw-gold)', fontWeight: 800 }}>G</span>
        <span style={{ width: 28, textAlign: 'center', color: 'var(--asw-silver)', fontWeight: 800 }}>S</span>
        <span style={{ width: 28, textAlign: 'center', color: 'var(--asw-bronze)', fontWeight: 800 }}>B</span>
        <span style={{ width: 40, textAlign: 'center' }}>Total</span>
      </div>
      {list.map((m, i) => (
        <div key={m.id ?? i} style={rowStyle(i)}>
          <span style={badge}>{i + 1}</span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: 'var(--color-accent-800)', display: 'flex', alignItems: 'center', gap: 6 }}><Flag code={m.nationality_code || country.code} /><SwimmerLink id={m.id} name={m.name} /></span>
          <span style={mc('var(--asw-gold)')}>{m.gold}</span>
          <span style={mc('var(--asw-silver)')}>{m.silver}</span>
          <span style={mc('var(--asw-bronze)')}>{m.bronze}</span>
          <span className="asw-num" style={{ width: 40, textAlign: 'center', fontWeight: 800, fontSize: 14, color: 'var(--color-accent-800)' }}>{m.total}</span>
        </div>
      ))}
    </>
  )

  const recCard4 = ({ label, sub, photo, id, name, line, big, date, bigSize = 30 }) => (
    <div style={{ background: '#fff', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', borderRadius: 0, overflow: 'hidden',  }}>
      <div className="m-hl4-head" style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--color-neutral-200)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 4, height: 14, background: 'var(--color-accent-800)', borderRadius: 0, flexShrink: 0 }} />
          <span className="m-hl4-label" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-800)' }}>{label}</span>
          <span className="m-hl4-va" style={{ fontSize: 9, color: 'var(--color-accent-500)', fontWeight: 700, marginLeft: 'auto', whiteSpace: 'nowrap' }}>View All</span>
        </div>
        <div className="m-hl4-sub" style={{ fontSize: 9.5, color: 'var(--color-neutral-700)', marginTop: 3, paddingLeft: 12 }}>{sub}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 130 }}>
        {/* Photo panel */}
        <div className="m-hl4-photo" style={{ width: 100, background: 'var(--color-accent-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: 'rgba(255,255,255,0.35)', flexShrink: 0, overflow: 'hidden' }}>
          {photo
            ? <Pic kind="person" w={160} src={photo} />
            : <Waves size={22} aria-hidden="true" />}
        </div>
        {/* Info */}
        <div className="m-hl4-info" style={{ padding: '12px 12px', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <Flag code={country.code} />
            <span className="m-hl4-name" style={{ fontWeight: 800, fontSize: 13, color: 'var(--color-accent-800)', lineHeight: 1.2, overflowWrap: 'anywhere', minWidth: 0 }}>
              <SwimmerLink id={id} name={name} />
            </span>
          </div>
          {line && <div className="m-hl4-line" style={{ fontSize: 11, color: 'var(--color-neutral-700)', marginBottom: 6 }}>{line}</div>}
          <div className="asw-num m-hl4-big" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: bigSize, color: 'var(--color-accent-800)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {big}
          </div>
          {date && <div className="m-hl4-date" style={{ fontSize: 11, color: 'var(--color-neutral-500)', marginTop: 5 }}>{formatDate(date)}</div>}
        </div>
      </div>
    </div>
  )

  return (
    <div className="m-pad" style={{ padding: '24px 32px' }}>
      {/* Page title */}
      <h2 className="prof-h">Statistics</h2>

      {/* Row 1: Top Performance Male | Female */}
      <div className="m-col1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
        {card(<>{cardHeader('Top Performance · Men', `Best Performances by ${country.name} Male Swimmers (FINA Points)`)}{maleTop.length ? topPerfTable(maleTop) : <Empty label="No data" />}</>)}
        {card(<>{cardHeader('Top Performance · Women', `Best Performances by ${country.name} Female Swimmers (FINA Points)`)}{femaleTop.length ? topPerfTable(femaleTop) : <Empty label="No data" />}</>)}
      </div>

      {/* Row 1b: Demographics pies — gender, ages, strokes */}
      <div className="m-col1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 10 }}>
        {card(<>{cardHeader('Swimmers by Gender', `Proportion of ${country.name} Swimmers by Sex`)}{donut(genderSegs, 'Swimmers')}</>)}
        {card(<>{cardHeader('Swimmers by Age', `Distribution of ${country.name} Swimmers by Age`)}{donut(ageSegs, 'Swimmers')}</>)}
        {card(<>{cardHeader('Swimmers by Stroke', `Share of ${country.name} Swims by Stroke`)}{donut(strokeSegs, 'Swims')}</>)}
      </div>

      {/* Row 2: Participation | Championships Hosted | Most Participated */}
      <div className="m-col1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 10 }}>
        {card(<>
          {cardHeader('Participation', 'Total Participation by International Competition')}
          {participationList.length === 0 ? <Empty label="No data" /> : participationList.map(([cls, n]) => barRow(cls, n, maxPart))}
        </>)}
        {card(<>
          {cardHeader('International Championships Hosted', 'Number of International Championships Hosted')}
          {hosted.length === 0 ? <Empty label="None" /> : (() => {
            const counts = {}
            hosted.forEach((c) => {
              const k = c.classification || 'Other'
              if (/^(national|other)$/i.test(k)) return
              counts[k] = (counts[k] || 0) + 1
            })
            const list = Object.entries(counts).sort((a, b) => b[1] - a[1])
            if (!list.length) return <Empty label="None" />
            const mx = Math.max(...list.map(([, n]) => n), 1)
            return list.map(([cls, n]) => barRow(cls, n, mx))
          })()}
        </>)}
        {card(<>
          {cardHeader('Most Participating Swimmer', `Top 5 ${demonym(country.name)} Swimmers by International Participations`)}
          {!profile.most_participated?.length ? <Empty label="No international participations yet" /> : (<>
          <div style={{ display: 'flex', gap: 8, ...thStyle, padding: '0 0 6px' }}>
            <span style={{ width: 24 }}>#</span>
            <span style={{ flex: 1 }}>Swimmer</span>
            <span style={{ width: 90, textAlign: 'right' }}>Participations</span>
          </div>
          {profile.most_participated.slice(0, 5).map((s, i) => (
            <div key={s.id} style={rowStyle(i)}>
              <span style={badge}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: 'var(--color-accent-800)', display: 'flex', alignItems: 'center', gap: 6 }}><Flag code={s.nationality_code || country.code} /><SwimmerLink id={s.id} name={s.name} /></span>
              <span className="asw-num" style={{ width: 90, textAlign: 'right', fontWeight: 800, fontSize: 14, color: 'var(--color-accent-800)' }}>{s.championships_count ?? '—'}</span>
            </div>
          ))}
          </>)}
        </>)}
      </div>

      {/* Row 3: Medals | Most Male Decorated | Most Female Decorated */}
      <div className="m-col1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 10 }}>
        {card(<>
          {cardHeader('Medals', 'Total Medals by International Competition')}
          {(() => {
            // International tallies only — National and Other are noise here
            const intl = medalBoxes.filter((m) => m.name !== 'National' && m.name !== 'Other')
            if (!intl.length) return <Empty label="No international medals yet" />
            const maxTotal = Math.max(...intl.map((m) => m.total), 1)
            return (<>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 11 }}>
              {[['Gold', 'var(--asw-gold)'], ['Silver', 'var(--asw-silver)'], ['Bronze', 'var(--asw-bronze)']].map(([lbl, c]) => (
                <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: c, display: 'inline-block' }} />{lbl}
                </span>
              ))}
            </div>
            {intl.map((m) => (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                <span style={{ width: 88, fontSize: 12, fontWeight: 700, flexShrink: 0, color: 'var(--color-neutral-800)' }}>{m.name}</span>
                <div style={{ flex: 1, height: 20, display: 'flex', background: 'var(--color-neutral-200)', borderRadius: 0, overflow: 'hidden' }}>
                  <div style={{ width: `${(m.total / maxTotal) * 100}%`, display: 'flex', minWidth: m.total > 0 ? 20 : 0 }}>
                    {[['gold', 'var(--asw-gold)'], ['silver', 'var(--asw-silver)'], ['bronze', 'var(--asw-bronze)']].map(([key, color]) =>
                      m[key] > 0 && <div key={key} style={{ flex: m[key], background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 11, minWidth: 14 }} className="asw-num">{m[key]}</div>
                    )}
                  </div>
                </div>
                <span className="asw-num" style={{ width: 26, textAlign: 'right', fontWeight: 800, color: 'var(--color-accent-800)', fontSize: 13, flexShrink: 0 }}>{m.total}</span>
              </div>
            ))}
            </>)
          })()}
        </>)}
        {(() => {
          const intlMed = (profile.top_medalists_international || []).slice(0, 5)
          const natMed = (profile.top_medalists_national || []).slice(0, 5)
          return (<>
            {card(<>{cardHeader('Most Decorated · International', `Top 5 ${demonym(country.name)} Swimmers by International Medals`)}{intlMed.length ? decoratedTable(intlMed) : <Empty label="No data" />}</>)}
            {card(<>{cardHeader('Most Decorated · National', `Top 5 ${demonym(country.name)} Swimmers by National Medals`)}{natMed.length ? decoratedTable(natMed) : <Empty label="No data" />}</>)}
          </>)
        })()}
      </div>

      {/* Row 4: fixed record highlight boxes — columns match the cards that
          actually exist, so a missing card never leaves a dead column */}
      {(() => {
        const photoFor = (sid) => records.find((r) => r.swimmer_id === sid && r.swimmer_photo)?.swimmer_photo
        const cards = [
            { key: 'last-m-rec', valid: !!lastMR, render: () => recCard4({ label: 'Last Record Broken · Men', sub: `Most Recent ${demonym(country.name)} Male Record`, photo: lastMR.swimmer_photo, id: lastMR.swimmer_id, name: lastMR.swimmer, line: lastMR.event, big: lastMR.time, date: lastMR.date }) },
            { key: 'last-f-rec', valid: !!lastFR, render: () => recCard4({ label: 'Last Record Broken · Women', sub: `Most Recent ${demonym(country.name)} Female Record`, photo: lastFR.swimmer_photo, id: lastFR.swimmer_id, name: lastFR.swimmer, line: lastFR.event, big: lastFR.time, date: lastFR.date }) },
            { key: 'top-m-rec', valid: !!topMaleRec, render: () => recCard4({ label: 'Most Male Record Holder', sub: `Top ${demonym(country.name)} Male Swimmer by National Records`, photo: photoFor(topMaleRec.id), id: topMaleRec.id, name: topMaleRec.name, line: 'Total Records', big: topMaleRec.count, bigSize: 40 }) },
            { key: 'top-f-rec', valid: !!topFemaleRec, render: () => recCard4({ label: 'Most Female Record Holder', sub: `Top ${demonym(country.name)} Female Swimmer by National Records`, photo: photoFor(topFemaleRec.id), id: topFemaleRec.id, name: topFemaleRec.name, line: 'Total Records', big: topFemaleRec.count, bigSize: 40 }) },
        ]
        const show = cards.filter((c) => c.valid)
        if (!show.length) return null
        return (
          <div className="m-col2 m-hl4" style={{ display: 'grid', gridTemplateColumns: `repeat(${show.length}, 1fr)`, gap: 12, marginBottom: 10 }}>
            {show.map((c) => <div key={c.key}>{c.render()}</div>)}
          </div>
        )
      })()}

      {/* Row 5: Performance Index (dark bg) | Country Battle */}
      <div className="m-col1" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        {/* Performance Index */}
        <div style={{ background: '#fff', borderRadius: 0, padding: '16px 16px', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)' }}>
          {cardHeader('Performance Index', `Distribution of ${country.name} Swimmers by Performance Level`)}
          <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
            {perfDist.map((d, i) => (
              <div key={d.label} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* bar area: fixed height so every bar sits on the same baseline */}
                <div style={{ height: 165, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}>
                  {d.count > 0 && <div className="asw-num" style={{ fontSize: 11, fontWeight: 800, marginBottom: 4, color: 'var(--color-accent-800)' }}>{d.count}</div>}
                  <div style={{ width: '75%', height: `${Math.max(4, (d.count / maxPerf) * 140)}px`, background: PERF_BAR_COLORS[i], borderRadius: 0 }} />
                </div>
                {/* label area: fixed height so two-line labels don't push bars up */}
                {/* legibility: 11px on desktop; scales down only where nine columns leave no room (phone) */}
                <div style={{ fontSize: 'clamp(7.5px, 1.25vw, 11px)', marginTop: 6, lineHeight: 1.2, minHeight: 19, color: 'var(--color-neutral-700)', fontWeight: 700, wordBreak: 'break-word' }}>{d.label}</div>
                <div style={{ fontSize: 'clamp(6.5px, 1.15vw, 10.5px)', color: 'var(--color-neutral-500)', marginTop: 1 }}>({d.range})</div>
              </div>
            ))}
          </div>
        </div>
        {/* Country Battle */}
        {card(<>
          {cardHeader('Country Battle', 'Number of Swimmers in the Top 100 Arab Ranking')}
          {!(profile.country_battle || []).length ? <Empty label="No data" /> : (() => {
            const battle = profile.country_battle.slice(0, 10)
            const mx = Math.max(...battle.map((b) => b.count), 1)
            return battle.map((b) => {
              const mine = b.country_id === country.id
              return (
                <div key={b.country_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                  <span style={{ width: 96, fontSize: 12, fontWeight: mine ? 900 : 600, flexShrink: 0, color: mine ? 'var(--color-accent-800)' : 'var(--color-neutral-800)', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    <Flag code={b.code} />{b.name}
                  </span>
                  <div style={{ flex: 1, height: 18, background: 'var(--color-neutral-200)', borderRadius: 0, overflow: 'hidden' }}>
                    <div style={{ width: `${(b.count / mx) * 100}%`, height: '100%', background: mine ? 'var(--color-accent-800)' : 'var(--color-accent-2-400)', borderRadius: 0, minWidth: b.count > 0 ? 8 : 0 }} />
                  </div>
                  <span className="asw-num" style={{ width: 24, textAlign: 'right', fontWeight: 800, color: 'var(--color-accent-800)', fontSize: 13, flexShrink: 0 }}>{b.count}</span>
                </div>
              )
            })
          })()}
        </>)}
      </div>

      {/* Row 6: National best times by event (men & women) */}
      {(profile.best_times || []).length > 0 && (() => {
        const byEvent = {}
        profile.best_times.forEach((t) => {
          const e = byEvent[t.event] || (byEvent[t.event] = { event: t.event })
          const slot = t.sex === 'F' ? 'f' : 'm'
          if (!e[slot] || (t.fina || 0) > (e[slot].fina || 0)) e[slot] = t
        })
        const rows = Object.values(byEvent)
        const cell = (t) => t ? (
          <div style={{ minWidth: 0 }}>
            <div className="asw-time" style={{ fontWeight: 800, fontSize: 13, color: 'var(--color-accent-800)' }}>{t.time}</div>
            <div style={{ fontSize: 11, color: 'var(--color-neutral-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <SwimmerLink id={t.swimmer_id} name={t.swimmer} />{t.fina ? ` · ${t.fina}` : ''}
            </div>
          </div>
        ) : <span style={{ color: 'var(--color-neutral-400)', fontSize: 12 }}>—</span>
        return (
          <div style={{ marginTop: 10 }}>
            {card(<>
              {cardHeader('National Best Times by Event', `Fastest ${demonym(country.name)} Performance in Each Event (Men & Women)`)}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8, ...thStyle, padding: '0 0 6px' }}>
                <span>Event</span><span>Men</span><span>Women</span>
              </div>
              <div style={{ maxHeight: 440, overflowY: 'auto' }}>
                {rows.map((r, i) => (
                  <div key={r.event} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-accent-2-100)', background: i % 2 === 1 ? 'var(--color-neutral-100)' : 'transparent' }}>
                    <span style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', color: 'var(--color-neutral-800)' }}>{r.event}</span>
                    {cell(r.m)}
                    {cell(r.f)}
                  </div>
                ))}
              </div>
            </>)}
          </div>
        )
      })()}

      {/* Row 7: International medal trend + biggest international campaigns */}
      {(() => {
        const intl = participated.filter((c) => c.classification && c.classification !== 'National')
        const byYear = {}
        intl.forEach((c) => {
          const y = (c.date || '').slice(0, 4)
          if (!y) return
          byYear[y] = (byYear[y] || 0) + (c.medals?.total || 0)
        })
        const years = Object.keys(byYear).sort()
        const trend = years.map((y) => ({ label: `'${y.slice(2)}`, value: byYear[y] }))
        const campaigns = intl
          .filter((c) => (c.swimmers_count || 0) > 0)
          .sort((a, b) => (b.swimmers_count || 0) - (a.swimmers_count || 0))
          .slice(0, 6)
          .map((c) => ({ label: c.name, value: c.swimmers_count, sub: `${c.swimmers_count}` }))
        if (!trend.length && !campaigns.length) return null
        return (
          <div className="m-col1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
            {card(<>
              {cardHeader('International Medal Trend', `${demonym(country.name)} Medals Won at International Meets by Year`)}
              {trend.length ? <MiniBars data={trend} color={CHART_COLORS.NAVY} /> : <Empty label="No international medals yet" />}
            </>)}
            {card(<>
              {cardHeader('Biggest International Campaigns', `Meets Where ${country.name} Sent the Most Swimmers`)}
              {campaigns.length ? <MiniHBars rows={campaigns} color={CHART_COLORS.BLUE} labelWidth={150} /> : <Empty label="No data" />}
            </>)}
          </div>
        )
      })()}
    </div>
  )
}

// Plain-words save error shown next to the form (never raw server JSON)
function saveErrorText(e) {
  const d = e?.response?.data
  const first = d && typeof d === 'object' ? Object.values(d).flat()[0] : d
  return `Could not save. ${typeof first === 'string' && first.length < 200 ? first : 'Check the fields and try again.'}`
}

function Fld({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div className="kicker" style={{ marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}

/* Admin: edit the curated federation contact card (hero). Statistics and other
   computed sections stay read-only by design. */
function FedInfoModal({ country, onClose, onSaved }) {
  const [form, setForm] = useState({
    federation_tagline: country.federation_tagline || '',
    federation_phone: country.federation_phone || '',
    federation_email: country.federation_email || '',
    federation_website: country.federation_website || '',
    federation_address: country.federation_address || '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = async () => {
    setBusy(true); setErr('')
    try {
      // Postel's Law: stray spaces around typed text are dropped before saving
      await updateCountry(country.id, Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])))
      onSaved()
    } catch (e) {
      setErr(saveErrorText(e))
      setBusy(false)
    }
  }
  return (
    <Modal title="Edit federation info" onClose={onClose} width={480}>
      {/* Jakob's Law: Enter in any field saves, like every other form */}
      <form onSubmit={(e) => { e.preventDefault(); if (!busy) save() }}>
      <Fld label="Tagline"><input className="input" style={{ width: '100%' }} value={form.federation_tagline} onChange={set('federation_tagline')} autoComplete="off" placeholder="Excellence in Water, Unity in Sport" /></Fld>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Fld label="Phone"><input className="input" type="tel" inputMode="tel" autoComplete="tel" style={{ width: '100%' }} value={form.federation_phone} onChange={set('federation_phone')} /></Fld>
        <Fld label="Email"><input className="input" type="email" inputMode="email" autoComplete="email" style={{ width: '100%' }} value={form.federation_email} onChange={set('federation_email')} /></Fld>
      </div>
      <Fld label="Website"><input className="input" inputMode="url" autoComplete="url" autoCapitalize="none" style={{ width: '100%' }} value={form.federation_website} onChange={set('federation_website')} placeholder="federation.example.com" /></Fld>
      <Fld label="Address"><input className="input" autoComplete="street-address" style={{ width: '100%' }} value={form.federation_address} onChange={set('federation_address')} /></Fld>
      {err && <div role="alert" style={{ color: 'var(--asw-slow)', fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      </form>
    </Modal>
  )
}

/* Admin: add/edit federation board members (stored on the national team). */
function FedBoardModal({ member, teamId, onClose, onSaved }) {
  const [form, setForm] = useState({ name: member?.name || '', role: member?.role || '' })
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = async () => {
    if (!form.name.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('name', form.name.trim())
      fd.append('role', form.role.trim())
      fd.append('team', teamId)
      if (photo) fd.append('photo', photo)
      if (member) await updateBoardMember(member.id, fd)
      else await createBoardMember(fd)
      onSaved()
    } catch (e) {
      setErr(saveErrorText(e))
      setBusy(false)
    }
  }
  return (
    <Modal title={member ? 'Edit board member' : 'Add board member'} onClose={onClose} width={440}>
      <Fld label="Name"><input className="input" autoComplete="off" required style={{ width: '100%' }} value={form.name} onChange={set('name')} /></Fld>
      <Fld label="Role"><input className="input" autoComplete="off" style={{ width: '100%' }} placeholder="e.g. President, Secretary General" value={form.role} onChange={set('role')} /></Fld>
      <Fld label="Photo"><CropUpload kind="person" onChange={setPhoto} />{photo && <div style={{ fontSize: 12, color: 'var(--asw-fast)', marginTop: 4 }}>Photo ready ✓</div>}</Fld>
      {err && <div role="alert" style={{ color: 'var(--asw-slow)', fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  )
}

// Tabs that make no sense on the virtual pan-Arab federation page
const ARAB_FED_EXCLUDED = new Set(['team', 'prediction', 'compare', 'clubs', 'academies'])

export default function CountryProfile({ arabFed = false }) {
  const { id: paramId } = useParams()
  // arabFed → the virtual pan-Arab federation (backend pk 'arab')
  const id = arabFed ? 'arab' : paramId
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAdmin } = useAuth()
  const { flag } = useFeatures()
  // Admin visibility toggles: hidden tabs vanish for visitors, stay (dimmed)
  // for admins. Overview is always available and is the fallback.
  const tabHidden = (v) => v !== 'overview' && !flag(`fed.tab.${v}`)
  const visibleTabs = TABS.filter((t) =>
    (!arabFed || !ARAB_FED_EXCLUDED.has(t.value)) && (isAdmin || !tabHidden(t.value)))
  const rawTab = searchParams.get('tab') || 'overview'
  const tab = visibleTabs.some((t) => t.value === rawTab) ? rawTab : 'overview'
  const mclass = searchParams.get('mclass') || ''
  const setTab = (t) => setSearchParams({ tab: t }, { replace: true })

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [progStroke, setProgStroke] = useState('Freestyle')
  const [progPool, setProgPool] = useState('LCM')
  const [progLines, setProgLines] = useState([])
  const [progLoading, setProgLoading] = useState(false)
  const [openChamp, setOpenChamp] = useState(null)
  const [teamSub, setTeamSub] = useState('coaches')
  const [champSub, setChampSub] = useState('hosted')
  const [qualSub, setQualSub] = useState('standards')
  const [ovNews, setOvNews] = useState([])
  const [calEvents, setCalEvents] = useState([])
  const [boardMembers, setBoardMembers] = useState([])
  const [countryCoaches, setCountryCoaches] = useState([])
  const [fedModal, setFedModal] = useState(null) // 'info' | {type:'board', member}
  const [reloadKey, setReloadKey] = useState(0)
  const [boardKey, setBoardKey] = useState(0)
  const [moreTabs, setMoreTabs] = useState(false) // Hick's Law: secondary tabs stay folded until asked for
  const [loadFailed, setLoadFailed] = useState(false) // the profile request failed (≠ federation not found)
  const [fedNotice, setFedNotice] = useState(null) // Peak-End Rule: { where: 'info' | 'board', text } shown after a save
  // New seed each page open → highlight cards shuffle per visit
  const [hlSeed] = useState(() => Math.floor(Math.random() * 2 ** 31))

  useEffect(() => {
    let alive = true
    getCoaches(arabFed ? {} : { country: id })
      .then((r) => alive && setCountryCoaches((Array.isArray(r.data) ? r.data : r.data?.results || []).slice(0, 8)))
      .catch(() => alive && setCountryCoaches([]))
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    if (!profile) return
    const nat = (profile.teams || []).find((t) => t.is_national_team) || null
    if (!nat) { setBoardMembers([]); return }
    let alive = true
    getBoardMembers({ team: nat.id })
      .then((r) => alive && setBoardMembers(Array.isArray(r.data) ? r.data : r.data?.results || []))
      .catch(() => alive && setBoardMembers([]))
    return () => { alive = false }
  }, [profile, boardKey])

  useEffect(() => {
    let alive = true
    const unwrap = (r) => (Array.isArray(r.data) ? r.data : r.data?.results || [])
    // Only articles linked to this federation (directly or via its clubs);
    // the pan-Arab page shows news from the whole region
    getArticles({ ...(arabFed ? {} : { country: id }), status: 'PUBLISHED', ordering: '-published_at' })
      .then((r) => alive && setOvNews(unwrap(r).slice(0, 4)))
      .catch(() => alive && setOvNews([]))
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    let alive = true
    getCalendarEvents({ page_size: 200 })
      .then((r) => alive && setCalEvents(Array.isArray(r.data) ? r.data : r.data?.results || []))
      .catch(() => alive && setCalEvents([]))
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true; setLoading(true)
    // lite: counts only for each championship taken part in — the athlete
    // lists nobody sees here made the pan-Arab profile a 2.6 MB download
    getCountryProfile(id, { lite: 1 })
      .then((res) => { if (alive) { setProfile(res.data); setLoadFailed(false) } })
      .catch((e) => { if (alive) { setProfile(null); setLoadFailed(e?.response?.status !== 404) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [id, reloadKey])

  // (the old per-stroke progression request that ran on every profile open
  //  fed nothing on screen — the Progression tab loads its own data)

  if (loading) return <Loading label="Loading federation profile" />
  if (!profile?.country) return loadFailed ? (
    <Empty label="Could not load this federation" hint="Check your connection and try again.">
      <button type="button" className="btn btn-primary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
      {' '}
      <Link to="/countries" className="btn btn-secondary">← All federations</Link>
    </Empty>
  ) : (
    <Empty label="Federation not found" hint="It may have been removed or the link is out of date.">
      <Link to="/countries" className="btn btn-secondary">← All federations</Link>
    </Empty>
  )

  const { country, medals } = profile
  const topSwimmers = profile.top_swimmers || []
  const topMedalists = profile.top_medalists || []
  const records = profile.records || []
  const hosted = profile.championships_hosted || []
  const participated = profile.championships_participated || []
  const teams = profile.teams || []
  const newRecords = records.filter((r) => r.is_new)
  const currentRecords = records.filter((r) => !r.is_new)
  // Medal tally per competition type: real counts from the profile payload,
  // plus a zero box for every classification this country competed in.
  const medalBoxes = (() => {
    const byName = {}
    for (const m of profile.medals_by_classification || []) byName[m.name] = { ...m }
    for (const c of [...hosted, ...participated]) {
      const k = c.classification || 'Other'
      if (!byName[k]) byName[k] = { name: k, gold: 0, silver: 0, bronze: 0, total: 0 }
    }
    const orderOf = (n) => { const i = CLASS_ORDER.indexOf(n); return i === -1 ? 99 : i }
    // Regional classifications (GCC/Asian/African/Mediterranean) only apply to
    // their member countries — hide zero boxes for everyone else (e.g. no GCC
    // box on Algeria). Real medals are never hidden.
    const applies = (n) => {
      const list = CLASS_COUNTRY_CODES[n]
      return !list || !country?.code || list.includes(country.code)
    }
    return Object.values(byName)
      .filter((m) => m.total > 0 || applies(m.name))
      .sort((a, b) => (b.total - a.total) || (orderOf(a.name) - orderOf(b.name)))
  })()

  return (
    <div className="m-zoom">
      {/* ===== ISF-style federation header: circular flag logo + info left,
             swimmer action photo blended into the right half ===== */}
      {(() => {
        const photoCandidates = [
          ...topSwimmers.map((s) => s.photo),
          ...topMedalists.map((s) => s.photo),
          ...records.map((r) => r.swimmer_photo),
        ]
        const navy = 'var(--color-accent-800)'
        const customFlag = flagImage(country.code)
        const alpha2 = flagAlpha2(country.code)
        const icon = (d) => (
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-accent-800)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
          </span>
        )
        const contactRow = (ic, content) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, fontWeight: 600, color: navy }}>
            {ic}{content}
          </div>
        )
        return (
          <div className="rule-b" style={{ position: 'relative', overflow: 'hidden', background: 'var(--color-bg)' }}>
            <style>{`
              @media (max-width: 760px) {
                .fed-hero-photo { display: none; }
                .fed-hero-flag { width: 108px !important; height: 108px !important; }
              }
            `}</style>
            {/* swimmer photo blended on the right — auto-picked by resolution/aspect;
                falls back to high-res news action shots when swimmer photos are tiny */}
            <FedHeroPhoto candidates={photoCandidates} extras={ovNews.map((a) => a?.cover_image)} />
            <div className="m-pad" style={{ position: 'relative', padding: '20px 32px 30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                {/* Fitts's Law: back link is a 40px target (30px after the phone zoom) */}
                <Link to="/countries" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, paddingRight: 12, fontSize: 12, textDecoration: 'none', fontWeight: 700, color: 'var(--color-accent-800)' }}>← All federations</Link>
                {isAdmin && !arabFed && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                    {fedNotice?.where === 'info' && <span role="status" style={{ fontSize: 12, fontWeight: 700, color: 'var(--asw-fast)' }}>{fedNotice.text}</span>}
                    {/* Zeigarnik Effect: an unfinished contact card says what is still missing (admins only) */}
                    {(() => {
                      const missing = [['federation_phone', 'phone'], ['federation_email', 'email'], ['federation_website', 'website'], ['federation_address', 'address']]
                        .filter(([k]) => !country[k]).map(([, l]) => l)
                      return missing.length > 0 && fedNotice?.where !== 'info'
                        ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--asw-slow)' }}>Missing: {missing.join(', ')}</span>
                        : null
                    })()}
                    <button type="button" className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => setFedModal('info')}>Edit info</button>
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
                {/* Circular federation logo = country flag */}
                <div className="fed-hero-flag" style={{
                  width: 148, height: 148, borderRadius: '50%', background: '#fff', flexShrink: 0,
                  border: `4px solid ${navy}`, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {customFlag ? (
                    <img src={customFlag} alt={country.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : alpha2 ? (
                    <span className={`fi fi-${alpha2}`} role="img" aria-label={country.name}
                      style={{ width: '100%', height: '100%', display: 'block', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  ) : country.flag_url?.startsWith('http') ? (
                    <img src={country.flag_url} alt={country.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32, color: navy }}>{country.code}</span>
                  )}
                </div>
                <div style={{ minWidth: 260, maxWidth: 560 }}>
                  <h1 style={{
                    margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 800,
                    fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.04, letterSpacing: '-0.02em',
                    color: navy,
                  }}>
                    {arabFed ? <>Arab Swimming<br />Federation</> : <>{country.name}<br />Swimming Federation</>}
                  </h1>
                  <div style={{ marginTop: 6, fontSize: 16, fontWeight: 700, color: 'var(--color-accent-800)' }}>
                    {country.federation_tagline}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                    {country.federation_phone && contactRow(
                      icon(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />),
                      <span className="asw-num">{country.federation_phone}</span>)}
                    {country.federation_email && contactRow(
                      icon(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>),
                      <span>{country.federation_email}</span>)}
                    {country.federation_website && contactRow(
                      icon(<><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>),
                      <a href={/^https?:/.test(country.federation_website) ? country.federation_website : `https://${country.federation_website}`}
                        target="_blank" rel="noreferrer" style={{ color: navy, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 32, margin: '-2px 0' }}>
                        {country.federation_website.replace(/^https?:\/\//, '')}
                      </a>)}
                    {/* Prägnanz: no address on file → no row (it used to repeat the federation's own name) */}
                    {country.federation_address && contactRow(
                      icon(<><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></>),
                      <span>{country.federation_address}</span>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Tab bar. Hick's Law: the most-used tabs first, the rest behind "More".
          The open tab is always in the bar, so deep links keep working. */}
      {(() => {
        const primary = PRIMARY_TABS.map((v) => visibleTabs.find((t) => t.value === v)).filter(Boolean)
        const rest = visibleTabs.filter((t) => !PRIMARY_TABS.includes(t.value))
        const shownTabs = moreTabs ? [...primary, ...rest] : [...primary, ...rest.filter((t) => t.value === tab)]
        const hidden = visibleTabs.length - shownTabs.length
        const tabBtn = { minHeight: 48, padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontSize: 13, whiteSpace: 'nowrap', flex: 'none' }
        return (
          <div className="rule-b prof-tabs">
            <div className="seg seg-tabs" role="tablist" aria-label="Federation sections">
            {shownTabs.map((t) => (
              <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)}
                aria-current={tab === t.value ? 'page' : undefined}
                title={tabHidden(t.value) ? 'Hidden from visitors (admin visibility settings)' : undefined}
                className={`seg-opt${tab === t.value ? ' on' : ''}`} style={{ opacity: tabHidden(t.value) ? 0.4 : 1 }}>
                {t.label}
              </button>
            ))}
            </div>
            {rest.length > 0 && (moreTabs || hidden > 0) && (
              <button type="button" aria-expanded={moreTabs} onClick={() => setMoreTabs((o) => !o)}
                className="btn btn-ghost" style={{ flex: 'none' }}>
                {moreTabs ? 'Less ↑' : `More (${hidden}) ↓`}
              </button>
            )}
          </div>
        )
      })()}

      {/* ===== OVERVIEW ===== */}
      {tab === 'overview' && (() => {
        const nameKey = (n) => (n || '').toLowerCase().replace(/\d+/g, '').trim().split(/\s+/).sort().join(' ')
        // Highlight cards: a big pool of ideas, 4 random ones per visit,
        // never the same swimmer twice in one set (a federation dominated by
        // one star shouldn't show him in every card).
        // Season best comes from the dedicated current-season payload field,
        // NOT topSwimmers (those are all-time bests — showing a 2023 swim as
        // "season best" was the bug).
        const seasonBest = profile.season_best
        // "Most decorated" = most medals in total (the API list is ordered by
        // gold first, so its first row is not always the biggest collector)
        const topMedalist = [...topMedalists].sort((a, b) => (b.total || 0) - (a.total || 0))[0]
        const recsByDate = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        const newestRecord = recsByDate[0]
        // 5 distinct holders (dedupe duplicate DB swimmers by normalized name),
        // varied events, Long Course first — like the ISF reference.
        const seenHolders = new Set(); const seenEvents = new Set()
        const pickHolders = (requireNewEvent) => {
          const out = []
          const ordered = [...records].sort((a, b) => (a.pool === 'LCM' ? 0 : 1) - (b.pool === 'LCM' ? 0 : 1))
          for (const r of ordered) {
            if (!r.swimmer_id) continue
            const nk = nameKey(r.swimmer)
            if (seenHolders.has(nk)) continue
            if (requireNewEvent && seenEvents.has(r.event)) continue
            seenHolders.add(nk); seenEvents.add(r.event); out.push(r)
          }
          return out
        }
        const topRecords = [...pickHolders(true), ...pickHolders(false)].slice(0, 12)
        const usDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
        // compact sidebar cards: small square photo, tight text — no stretching
        const hCard = { background: '#fff', borderRadius: 0, display: 'flex', gap: 12, padding: 10, alignItems: 'center', position: 'relative', borderTop: '3px solid var(--color-box-top)' }
        const hPhoto = { width: 96, height: 96, borderRadius: 0, background: 'var(--color-accent-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'var(--color-neutral-700)', flexShrink: 0 }
        const hBody = { padding: '4px 6px 4px 0', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }
        const hTitle = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--color-accent-800)', marginBottom: 4, lineHeight: 1.25 }
        const hBig = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: 'var(--color-accent-800)', letterSpacing: '-0.02em', lineHeight: 1.1 }
        const hSub = { fontSize: 12, color: 'var(--color-neutral-800)', marginTop: 3 }
        // small blue bar-chart icon like the reference
        const barsIcon = (
          <span style={{ position: 'absolute', right: 16, bottom: 14, display: 'inline-flex', alignItems: 'flex-end', gap: 2.5 }}>
            {[7, 12, 17, 22].map((h, k) => <span key={k} style={{ width: 4.5, height: h, background: 'var(--color-accent-800)', borderRadius: 0, display: 'inline-block' }} />)}
          </span>
        )
        const secTitle = (text) => (
          <h3 className="m-sectitle prof-h">{text}</h3>
        )
        // Cognitive Load: no news → one quiet placeholder row, not four
        const newsItems = ovNews.length > 0 ? ovNews : [null]
        return (
          <div className="m-pad" style={{ padding: '0 32px 32px' }}>
            {/* News + events left, compact highlights sidebar right. Natural
                heights, fixed gaps — no stretching or cross-column matching. */}
            <div className="m-col1" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start', paddingTop: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {secTitle('Latest News')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {newsItems.map((a, i) => {
                    const inner = (
                      <>
                        <div style={{ width: 128, aspectRatio: '16 / 9', borderRadius: 0, overflow: 'hidden', flex: 'none', background: a?.cover_image ? 'var(--color-accent-800)' : 'var(--color-neutral-400)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: 'var(--color-neutral-700)' }}>
                          {a?.cover_image
                            ? <Pic kind="cover" w={128} className="news-cover-img" src={a.cover_image} />
                            : <Camera size={22} aria-hidden="true" />}
                        </div>
                        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, textAlign: 'left' }}>
                          <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{a ? usDate(a.published_at || a.created_at) : 'No news yet'}</div>
                          {(() => {
                            const rtl = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF]/.test(a?.title || '')
                            return (
                              <div dir={rtl ? 'rtl' : 'ltr'} style={{
                                fontFamily: rtl ? "'Al-Jazeera', 'Helvetica Neue', Arial, sans-serif" : 'var(--font-heading)',
                                fontWeight: rtl ? 700 : 800,
                                fontSize: rtl ? 16 : 15,
                                lineHeight: rtl ? 1.55 : 1.3,
                                letterSpacing: rtl ? 0 : '-0.01em',
                                color: 'var(--color-accent-800)',
                                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                              }}>{a ? a.title : 'Federation news will appear here'}</div>
                            )
                          })()}
                          {/* dead affordance on "Coming soon" placeholders — only real articles get it */}
                          {a && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, color: 'var(--color-accent-800)', fontWeight: 700 }}>Read more</span>
                              <span style={{ color: 'var(--color-accent-800)', fontWeight: 800 }}>→</span>
                            </div>
                          )}
                        </div>
                      </>
                    )
                    // compact horizontal news row: thumbnail + headline
                    const cardStyle = { display: 'flex', gap: 16, alignItems: 'center', padding: 10, borderRadius: 0, background: 'var(--color-neutral-100)', border: '1px solid var(--color-divider)', textDecoration: 'none' }
                    return a
                      ? <Link key={a.id} to={`/news/${a.id}`} style={cardStyle}>{inner}</Link>
                      : <div key={`ph-${i}`} style={cardStyle}>{inner}</div>
                  })}
                </div>

                {/* Current + Upcoming Events — fills the gap below the news cards */}
                {(() => {
                  const todayISO = new Date().toISOString().slice(0, 10)
                  const evs = [...calEvents].filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date))
                  const current = evs.find((e) => e.date <= todayISO && todayISO <= (e.end_date || e.date)) || null
                  const upcoming = evs.find((e) => e.date > todayISO) || null
                  const daysUntil = upcoming ? Math.round((new Date(upcoming.date) - new Date(todayISO)) / 86400000) : 0
                  const dayNum = current ? Math.round((new Date(todayISO) - new Date(current.date)) / 86400000) + 1 : 0
                  const range = (e) => e.end_date && e.end_date !== e.date ? `${usDate(e.date)} – ${usDate(e.end_date)}` : usDate(e.date)
                  const evCard = { borderRadius: 0, background: 'var(--color-neutral-100)', border: '1px solid var(--color-divider)', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 120, position: 'relative' }
                  const evKick = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-800)' }
                  const evTitle = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: 'var(--color-accent-800)', lineHeight: 1.3 }
                  const badge = (bg, text) => (
                    <span style={{ position: 'absolute', right: 18, top: 18, fontSize: 11, fontWeight: 800, background: bg, color: '#fff', padding: '4px 12px', borderRadius: 0, letterSpacing: '0.08em' }}>{text}</span>
                  )
                  // Occam's Razor: only events that exist get a card. Nothing live
                  // and nothing scheduled → one line that points to the calendar.
                  if (!current && !upcoming) return (
                    <div style={{ borderRadius: 0, background: 'var(--color-neutral-100)', border: '1px solid var(--color-divider)', padding: '16px 20px', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ ...hSub, marginTop: 0, fontWeight: 600 }}>No event is running or scheduled right now.</span>
                      <Link to="/calendar" style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-accent-800)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 40 }}>See the calendar →</Link>
                    </div>
                  )
                  return (
                    <div className="m-col1" style={{ display: 'grid', gridTemplateColumns: current && upcoming ? '1fr 1fr' : '1fr', gap: 16, marginTop: 14 }}>
                      {current && (
                        <div style={evCard}>
                          <div style={evKick}>Current Event</div>
                          {badge('var(--asw-fast)', `LIVE · DAY ${dayNum}`)}
                          <div style={evTitle}>{current.championship ? <Link to={`/meets/${current.championship}`} style={{ color: 'inherit' }}>{current.title}</Link> : current.title}</div>
                          <div style={hSub}>{range(current)}</div>
                          {current.description && <div style={{ ...hSub, color: 'var(--color-neutral-700)' }}>{current.description}</div>}
                        </div>
                      )}
                      {upcoming && (
                        <div style={evCard}>
                          <div style={evKick}>Upcoming Event</div>
                          {badge('var(--color-accent-800)', daysUntil === 1 ? 'TOMORROW' : `IN ${daysUntil} DAYS`)}
                          <div style={evTitle}>{upcoming.championship ? <Link to={`/meets/${upcoming.championship}`} style={{ color: 'inherit' }}>{upcoming.title}</Link> : upcoming.title}</div>
                          <div style={hSub}>{range(upcoming)}</div>
                          {upcoming.description && <div style={{ ...hSub, color: 'var(--color-neutral-700)' }}>{upcoming.description}</div>}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Compact data widgets under the events */}
                {(() => {
                  const panel = { borderRadius: 0, background: 'var(--color-neutral-100)', border: '1px solid var(--color-divider)', padding: '16px 20px', display: 'flex', flexDirection: 'column' }
                  const kick = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-800)', marginBottom: 8 }
                  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', fontSize: 14, borderBottom: '1px solid var(--color-accent-100)' }
                  const tally = (medalBoxes || []).filter((m) => (m.total || 0) > 0).slice(0, 6)
                  const deco = [...(topMedalists || [])]
                    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0)).slice(0, 6)
                  return (
                    <div className="m-col1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
                      <div style={panel}>
                        <div style={{ ...kick, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span>Medal Tally by Competition</span>
                          {/* Law of Similarity: the summary leads to its detail, like every other card */}
                          {tally.length > 0 && visibleTabs.some((t) => t.value === 'medals') && (
                            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, minHeight: 32, textTransform: 'none', letterSpacing: 0 }} onClick={() => setTab('medals')}>All medals →</button>
                          )}
                        </div>
                        {tally.length === 0 ? <div style={hSub}>Medals will appear here</div> : tally.map((m) => (
                          <div key={m.name} style={row}>
                            <span style={{ fontWeight: 700, color: 'var(--color-accent-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                            <GSB gold={m.gold} silver={m.silver} bronze={m.bronze} size={13} />
                          </div>
                        ))}
                      </div>
                      <div style={panel}>
                        <div style={kick}>Most Decorated Swimmers</div>
                        {deco.length === 0 ? <div style={hSub}>Swimmers will appear here</div> : deco.map((s, i) => (
                          <div key={`${s.name}-${i}`} style={row}>
                            <span style={{ fontWeight: 700, color: 'var(--color-accent-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{s.id ? <SwimmerLink id={s.id} name={s.name} /> : s.name}</span>
                            <span className="asw-num" style={{ fontWeight: 800, flex: 'none' }}>{s.total ?? ((s.gold || 0) + (s.silver || 0) + (s.bronze || 0))} {(s.total ?? 0) === 1 ? 'medal' : 'medals'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* RIGHT: Highlight cards — random 4 from a pool of ~11 ideas,
                  reshuffled every visit, distinct swimmers within a set */}
              {(() => {
                const hl = ({ photo, emoji = <Waves size={22} aria-hidden="true" />, title, big, sub, name, extra, icon, badgeEl }) => (
                  <div style={hCard}>
                    <div style={{ ...hPhoto, overflow: 'hidden' }}>
                      {photo ? <Pic kind="person" w={160} src={photo} /> : emoji}
                    </div>
                    <div style={hBody}>
                      <div style={hTitle}>{title}</div>
                      <div style={hBig}>{big}</div>
                      {sub ? <div style={hSub}>{sub}</div> : null}
                      {name ? <div style={{ ...hSub, fontWeight: 700, color: 'var(--color-accent-800)' }}>{name}</div> : null}
                      {extra ? <div style={{ ...hSub, color: 'var(--color-neutral-700)' }}>{extra}</div> : null}
                    </div>
                    {icon === undefined ? barsIcon : icon}
                    {badgeEl}
                  </div>
                )
                const t = profile.trending
                const trendUp = t && (t.is_new || t.is_hot || (t.delta ?? 0) > 0)
                const goldKing = [...topMedalists].sort((a, b) => (b.gold || 0) - (a.gold || 0))[0]
                const leadingWoman = topSwimmers.find((s) => s.sex === 'F')
                const recCount = {}
                for (const r of records) {
                  const k = nameKey(r.swimmer)
                  if (k) recCount[k] = recCount[k] ? { n: recCount[k].n + 1, rec: recCount[k].rec } : { n: 1, rec: r }
                }
                const collector = Object.values(recCount).sort((a, b) => b.n - a.n)[0]
                const oldestRecord = records.filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date))[0]
                const gsb = medalBoxes.reduce((acc, m) => ({ g: acc.g + (m.gold || 0), s: acc.s + (m.silver || 0), b: acc.b + (m.bronze || 0) }), { g: 0, s: 0, b: 0 })
                const lastHosted = [...hosted].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
                const pool = [
                  { key: 'best-perf', person: seasonBest && nameKey(seasonBest.name), valid: !!seasonBest, render: () => hl({ photo: seasonBest.photo, title: <>Best Season<br />Performance</>, big: seasonBest.best_time || '—', sub: seasonBest.best_event ? `${seasonBest.best_event} · ${seasonBest.season}` : '', name: seasonBest.name, extra: seasonBest.championship }) },
                  { key: 'decorated', person: topMedalist && nameKey(topMedalist.name), valid: !!topMedalist, render: () => hl({ photo: topMedalist.photo, title: <>Most Decorated<br />Swimmer</>, big: topMedalist.total || 0, sub: 'Total Medals', name: topMedalist.name, icon: <span style={{ position: 'absolute', right: 14, bottom: 12, fontSize: 24 }}><Trophy size={20} aria-hidden="true" /></span> }) },
                  { key: 'new-record', person: newestRecord && nameKey(newestRecord.swimmer), valid: !!newestRecord, render: () => hl({ photo: newestRecord.swimmer_photo, title: 'New Record', big: newestRecord.time || '—', sub: newestRecord.event || '', name: newestRecord.swimmer, extra: newestRecord.date ? usDate(newestRecord.date) : null, icon: null, badgeEl: <span style={{ position: 'absolute', right: 14, bottom: 14, fontSize: 11, fontWeight: 800, background: 'var(--color-accent-800)', color: '#fff', padding: '4px 12px', borderRadius: 0, letterSpacing: '0.08em' }}>NEW</span> }) },
                  { key: 'trending', person: t && nameKey(t.name), valid: !!t, render: () => hl({ photo: t.photo, title: <>Trending<br />Swimmer</>, big: (<span style={{ color: trendUp ? 'var(--asw-fast)' : 'var(--asw-slow)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>{t.is_new ? 'NEW' : t.is_hot ? 'HOT' : `${t.delta > 0 ? '+' : ''}${t.delta}`}{!t.is_new && !t.is_hot && <span style={{ fontSize: 16, lineHeight: 1 }}>{trendUp ? '▲' : '▼'}</span>}</span>), sub: `Arab ranking #${t.rank}${t.is_new ? ' · new entry' : t.is_hot ? ' · top recent performer' : ` · was #${t.prev_rank}`}`, name: <SwimmerLink id={t.id} name={t.name} />, extra: t.best_event ? `${t.best_event} · ${t.best_time}${t.fina ? ` · ${t.fina} pts` : ''}` : null, icon: <span style={{ position: 'absolute', right: 16, bottom: 14, fontSize: 20 }}>{trendUp ? <TrendingUp size={22} aria-hidden="true" /> : <TrendingDown size={22} aria-hidden="true" />}</span> }) },
                  { key: 'golden', person: goldKing && nameKey(goldKing.name), valid: !!(goldKing && goldKing.gold > 0), render: () => hl({ photo: goldKing.photo, title: <>Most Gold<br />Medals</>, big: goldKing.gold, sub: 'Gold Medals', name: goldKing.name, icon: <span style={{ position: 'absolute', right: 14, bottom: 12, fontSize: 24 }}><Medal size={20} aria-hidden="true" /></span> }) },
                  { key: 'leading-woman', person: leadingWoman && nameKey(leadingWoman.name), valid: !!leadingWoman, render: () => hl({ photo: leadingWoman.photo, title: <>Leading<br />Woman</>, big: leadingWoman.best_time || '—', sub: leadingWoman.best_event || '', name: leadingWoman.name, extra: leadingWoman.championship }) },
                  { key: 'collector', person: collector && nameKey(collector.rec.swimmer), valid: !!(collector && collector.n > 1), render: () => hl({ photo: collector.rec.swimmer_photo, title: <>Most<br />Records</>, big: collector.n, sub: 'Records Held', name: collector.rec.swimmer, icon: <span style={{ position: 'absolute', right: 14, bottom: 12, fontSize: 24 }}>⏱</span> }) },
                  { key: 'oldest-record', person: oldestRecord && nameKey(oldestRecord.swimmer), valid: !!oldestRecord, render: () => hl({ photo: oldestRecord.swimmer_photo, title: <>Longest-Standing<br />Record</>, big: oldestRecord.time || '—', sub: `${oldestRecord.event || ''} · unbroken since ${oldestRecord.date.slice(0, 4)}`, name: oldestRecord.swimmer, icon: <span style={{ position: 'absolute', right: 14, bottom: 12, fontSize: 24 }}><Landmark size={20} aria-hidden="true" /></span> }) },
                  { key: 'podium', valid: gsb.g + gsb.s + gsb.b > 0, render: () => hl({ emoji: <Medal size={22} aria-hidden="true" />, title: <>Total<br />Medals</>, big: formatNumber(gsb.g + gsb.s + gsb.b), sub: 'Medals Across All Competitions', name: <GSB gold={gsb.g} silver={gsb.s} bronze={gsb.b} /> }) },
                  { key: 'host', valid: hosted.length > 0, render: () => hl({ emoji: <Landmark size={22} aria-hidden="true" />, title: <>Championship<br />Host</>, big: hosted.length, sub: `Championship${hosted.length === 1 ? '' : 's'} Hosted`, name: lastHosted?.name, extra: lastHosted?.date ? `Most recent · ${lastHosted.date.slice(0, 4)}` : null }) },
                  { key: 'quick-stats', valid: !!profile.stats, render: () => hl({ title: 'Quick Stats', big: formatNumber(profile.stats?.swimmers), sub: 'Total Swimmers', name: `${formatNumber(profile.stats?.medals)} Medals · ${formatNumber(profile.stats?.records)} Records` }) },
                ]
                const picked = pickHighlights(pool, mulberry32(hlSeed), 5)
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                    {picked.map((c) => <div key={c.key} style={{ minWidth: 0 }}>{c.render()}</div>)}
                  </div>
                )
              })()}
            </div>

            {/* National Record Holders — section only exists when there are records */}
            {topRecords.length > 0 && (<>
            {secTitle(arabFed ? 'Arab Record Holders' : 'Record Holders')}
            {/* Auto-scrolling ticker — track duplicated for a seamless loop, pauses on hover.
                1-3 records render as a static centred row (a loop just shows duplicates). */}
            <div className="asw-ticker" style={{ overflow: 'hidden', padding: '4px 0 10px' }}>
              <div className={topRecords.length >= 4 ? 'asw-ticker-track' : undefined}
                style={topRecords.length >= 4
                  ? { display: 'flex', width: 'max-content', animationDuration: `${Math.max(topRecords.length * 5, 25)}s` }
                  : { display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
              {(topRecords.length >= 4 ? [...topRecords, ...topRecords] : topRecords).map((r, i) => (
                <div key={i} style={{ width: 235, marginRight: 18, flexShrink: 0, borderRadius: 0, overflow: 'hidden', textAlign: 'center', background: 'var(--color-neutral-100)', border: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column' }}>
                  {/* Circular photo with navy ring */}
                  <div style={{ padding: '24px 0 8px' }}>
                    <div style={{ width: 165, height: 165, borderRadius: '50%', background: 'var(--color-neutral-300)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, color: 'var(--color-neutral-700)', border: '4px solid var(--color-accent-800)', overflow: 'hidden' }}>
                      {r.swimmer_photo ? <Pic kind="person" w={160} src={r.swimmer_photo} /> : <Waves size={22} aria-hidden="true" />}
                    </div>
                  </div>
                  <div style={{ padding: '12px 12px 0' }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-accent-800)' }}><SwimmerLink id={r.swimmer_id} name={r.swimmer} /></div>
                    <div style={{ fontSize: 14, color: 'var(--color-neutral-800)', marginTop: 8, lineHeight: 1.55, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <span>{String(r.event || '').replace(/^(\d+)\s*M\b/i, '$1m')}</span>
                      <span style={{ color: 'var(--color-neutral-400)' }}>|</span>
                      <span>{poolLabel(r.pool)}</span>
                    </div>
                  </div>
                  {/* Navy footer with time */}
                  <div style={{ background: 'var(--color-accent-800)', color: '#fff', padding: '13px 10px 15px', margin: '18px 10px 10px', marginTop: 'auto', borderRadius: 0 }}>
                    <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.01em' }}>{r.time}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3, opacity: 0.92 }}>{REC_TYPE_LABELS[r.record_type] || 'National'} Record</div>
                  </div>
                </div>
              ))}
              </div>
            </div>
            </>)}
          </div>
        )
      })()}

      {/* ===== BOARD ===== */}
      {tab === 'board' && (
        <div className="m-pad" style={{ padding: '0 32px 32px' }}>
          {/* Title */}
          <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 4 }}>
            <span style={{ fontSize: 24 }}><Users size={20} aria-hidden="true" /></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
            <h2 className="prof-h" style={{ margin: 0 }}>Board of Directors</h2>
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-neutral-700)', maxWidth: 500, margin: '0 0 28px', lineHeight: 1.5 }}>
            The Board of Directors is responsible for the strategic direction, governance, and overall leadership of the {arabFed ? 'Arab Swimming Federation' : `${country.name} Swimming Federation`}.
          </p>

          {isAdmin && (() => {
            const nat = teams.find((t) => t.is_national_team)
            return nat ? (
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setFedModal({ type: 'board', member: null, teamId: nat.id })}>+ Add board member</button>
                {fedNotice?.where === 'board' && <div role="status" style={{ fontSize: 12, fontWeight: 700, color: 'var(--asw-fast)', marginTop: 8 }}>{fedNotice.text}</div>}
              </div>
            ) : null
          })()}

          {/* Board member cards — real data when the national team has board
              members registered, ISF-style placeholders otherwise */}
          <div className="m-col2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {(boardMembers.length
              ? boardMembers.map((m) => ({ role: m.role || 'Member', name: m.name, photo: m.photo, member: m }))
              : ['President', 'Vice President', 'Treasurer', 'Secretary General', 'Technical Director',
                 'Member', 'Member', 'Member', 'Member', 'Member'].map((role) => ({ role, name: '—', photo: null }))
            ).map(({ role, name, photo, member }, i) => (
              <div key={i} style={{ borderRadius: 0, textAlign: 'center', background: '#fff', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', padding: '16px 16px 20px', display: 'flex', flexDirection: 'column', minHeight: 370 }}>
                <div style={{ width: '100%', aspectRatio: '1 / 1.05', borderRadius: 0, background: photo ? `url(${photo}) center/cover` : 'var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: 'var(--color-neutral-700)' }}>{photo ? '' : <User size={22} aria-hidden="true" />}</div>
                <div style={{ paddingTop: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-accent-800)' }}>{name}</div>
                  <div style={{ fontSize: 14, color: 'var(--color-accent-800)', fontWeight: 600, marginTop: 6 }}>{role}</div>
                </div>
                <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-accent-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,  }}>
                      <div style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '10px solid #fff', marginLeft: 3 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 20 }}>
                      {[7, 12, 5, 15, 9, 17, 6, 13, 8, 16, 5, 11, 14, 7, 18, 10, 5, 13, 7, 15, 9, 6, 12, 8].map((h, k) => (
                        <span key={k} style={{ width: 2, height: h, background: 'var(--color-accent-800)', borderRadius: 0, display: 'inline-block' }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-accent-800)', fontWeight: 600, marginTop: 8 }}>Listen to message</div>
                  {isAdmin && member && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                      <button type="button" className="btn btn-secondary" style={{ fontSize: 11 }} aria-label={`Edit ${member.name}`}
                        onClick={() => setFedModal({ type: 'board', member, teamId: member.team })}>Edit</button>
                      <button type="button" className="btn btn-secondary" style={{ fontSize: 11 }} aria-label={`Remove ${member.name}`}
                        onClick={async () => {
                          if (!window.confirm(`Remove ${member.name} from the board?`)) return
                          try { await deleteBoardMember(member.id); setBoardKey((k) => k + 1); setFedNotice({ where: 'board', text: `${member.name} removed` }) }
                          catch { notify('Could not remove this board member. Please try again.') }
                        }}>Remove</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== TEAM (Swimmers) ===== */}
      {tab === 'team' && (() => {
        const secTitle = (icon, text) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '28px 0 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 24 }}>{icon}</span>
            </div>
            <h3 className="prof-h" style={{ margin: 0 }}>{text}</h3>
          </div>
        )
        const swimmerCard = (s) => (
          <div key={s.id} style={{ borderRadius: 0, overflow: 'hidden', textAlign: 'center', background: '#fff', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', padding: '16px 10px 12px', display: 'flex', flexDirection: 'column' }}>
            {/* Circular photo with navy ring */}
            <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'var(--color-neutral-300)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, color: 'var(--color-neutral-700)', border: '3px solid var(--color-accent-800)', overflow: 'hidden' }}>
              {s.photo ? <Pic kind="person" w={160} src={s.photo} /> : <Waves size={22} aria-hidden="true" />}
            </div>
            {/* Info */}
            <div style={{ padding: '10px 2px 0' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-accent-800)', marginBottom: 5, lineHeight: 1.25 }}>
                <SwimmerLink id={s.id} name={s.name} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-neutral-800)', fontWeight: 600, lineHeight: 1.5 }}>
                {s.sex === 'F' ? "Women's" : "Men's"}
              </div>
            </div>
            <div style={{ marginTop: 'auto', paddingTop: 9, borderTop: '1px solid var(--color-neutral-200)' }}>
              <Link to={`/swimmers/${s.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, fontSize: 12, color: 'var(--color-accent-800)', fontWeight: 700, textDecoration: 'none', padding: '0 2px' }}>
                <span>View Profile</span><span style={{ color: 'var(--color-accent-800)' }}>→</span>
              </Link>
              {isAdmin && (
                <Link to={`/swimmers/${s.id}?edit=1`} className="btn btn-secondary" style={{ fontSize: 11, marginTop: 8, display: 'inline-block', textDecoration: 'none' }}>Edit</Link>
              )}
            </div>
          </div>
        )
        const waveHeights = [7, 12, 5, 15, 9, 17, 6, 13, 8, 16, 5, 11, 14, 7, 18, 10, 5, 13, 7, 15, 9, 6, 12, 8]
        const coachCard = ({ role, name, photo }, i) => (
          <div key={i} style={{ borderRadius: 0, textAlign: 'center', background: '#fff', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', padding: '16px 16px 20px', display: 'flex', flexDirection: 'column', minHeight: 370 }}>
            <div style={{ width: '100%', aspectRatio: '1 / 1.05', borderRadius: 0, background: photo ? `url(${photo}) center/cover` : 'var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: 'var(--color-neutral-700)' }}>{photo ? '' : <User size={22} aria-hidden="true" />}</div>
            <div style={{ paddingTop: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-accent-800)' }}>{name}</div>
              <div style={{ fontSize: 14, color: 'var(--color-accent-800)', fontWeight: 600, marginTop: 6 }}>{role}</div>
            </div>
            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-accent-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,  }}>
                  <div style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '10px solid #fff', marginLeft: 3 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 20 }}>
                  {waveHeights.map((h, k) => (
                    <span key={k} style={{ width: 2, height: h, background: 'var(--color-accent-800)', borderRadius: 0, display: 'inline-block' }} />
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-accent-800)', fontWeight: 600, marginTop: 8 }}>Listen to message</div>
            </div>
          </div>
        )
        return (
          <div className="m-pad" style={{ padding: '0 32px 32px' }}>
            <SubTabs options={[['coaches', 'Coaches'], ['swimmers', 'Swimmers']]} value={teamSub} onChange={setTeamSub} />
            {teamSub === 'coaches' && (<>
              {secTitle(<User size={22} aria-hidden="true" />, 'Coaches')}
              <div className="m-col2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                {(countryCoaches.length
                  ? countryCoaches.map((c) => ({ role: COACH_LEVELS[c.level] || c.level || 'Coach', name: c.name, photo: c.photo }))
                  : ['Head Coach', 'Assistant Coach', 'Swimming Coach', 'Conditioning Coach'].map((role) => ({ role, name: '—', photo: null }))
                ).map(coachCard)}
              </div>
            </>)}
            {teamSub === 'swimmers' && (<>
              {secTitle(<Waves size={22} aria-hidden="true" />, 'Swimmers')}
              {topSwimmers.length === 0 ? <Empty label="No swimmers" hint="Swimmers appear here once this federation has results in the database." /> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  {topSwimmers.map(swimmerCard)}
                </div>
              )}
            </>)}
          </div>
        )
      })()}

      {/* ===== CHAMPIONSHIPS ===== */}
      {tab === 'championships' && (
        <div>
          <div style={{ paddingTop: 6 }}>
            <SubTabs options={[['hosted', 'Hosted'], ['participation', 'Participation']]} value={champSub} onChange={setChampSub} />
          </div>
          {/* Hosted */}
          {champSub === 'hosted' && (
          <div className="pad-lg">
            <SectHead title={`Hosted · ${hosted.length}`} />
            {hosted.length === 0 ? <Empty label="No championships hosted" /> : (
              <div>{hosted.map((c) => (
                <Link key={c.id} to={`/meets/${c.id}`} className="hair-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', color: 'inherit', textDecoration: 'none' }}>
                  <span style={{ minWidth: 0 }}><span style={{ fontWeight: 600, display: 'block' }}>{c.name}</span><span className="text-muted" style={{ fontSize: 12 }}>{c.location}</span></span>
                  <span className="text-muted asw-num" style={{ fontSize: 12, textAlign: 'right', flex: 'none' }}>{formatDate(c.date)}<br />{c.pool}</span>
                </Link>
              ))}</div>
            )}
          </div>
          )}
          {/* Participated */}
          {champSub === 'participation' && (
          <div className="pad-lg">
            <SectHead title={`Participated · ${participated.length}`} />
            {participated.length === 0 ? <Empty label="No participations" /> : (
              <div>{participated.map((c) => {
                const isOpen = openChamp === c.id
                return (
                  <div key={c.id} className="hair-b">
                    <button type="button" onClick={() => setOpenChamp(isOpen ? null : c.id)} aria-expanded={isOpen}
                      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 0', background: 'none', border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', color: 'inherit' }}>
                      <span style={{ flex: 1, minWidth: 220 }}><span style={{ fontWeight: 600, display: 'block' }}>{c.name}</span><span className="text-muted" style={{ fontSize: 12 }}>{formatDate(c.date)} · {c.pool}{c.location ? ` · ${c.location}` : ''}</span></span>
                      <span className="asw-num text-muted" style={{ fontSize: 12 }}>{c.swimmers_count} swimmers · {c.results_count} results</span>
                      {c.medals?.total > 0 && <span className="asw-num" style={{ fontSize: 12, display: 'inline-flex', gap: 8 }}>{c.medals.gold > 0 && <span style={{ color: 'var(--asw-gold)', fontWeight: 800 }}>{c.medals.gold}G</span>}{c.medals.silver > 0 && <span style={{ color: 'var(--asw-silver)', fontWeight: 800 }}>{c.medals.silver}S</span>}{c.medals.bronze > 0 && <span style={{ color: 'var(--asw-bronze)', fontWeight: 800 }}>{c.medals.bronze}B</span>}</span>}
                      <span className="micro">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 0 16px' }}>
                        <Link to={`/meets/${c.id}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 32, fontSize: 12 }}>View full meet details →</Link>
                        {Array.isArray(c.swimmers) && c.swimmers.length > 0 && (
                          <><div className="micro" style={{ margin: '12px 0 6px' }}>Athletes · {c.swimmers.length}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '2px 16px' }}>
                            {c.swimmers.map((s) => (<Link key={s.id} to={`/swimmers/${s.id}`} style={{ color: 'inherit', textDecoration: 'none', fontSize: 13, padding: '6px 0' }}>{s.name} <span className="text-muted" style={{ fontSize: 11 }}>{s.sex === 'F' ? 'W' : 'M'}</span></Link>))}
                          </div></>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}</div>
            )}
          </div>
          )}
        </div>
      )}

      {/* ===== STATISTICS ===== */}
      {tab === 'statistics' && <StatisticsTab
        profile={profile} country={country} topSwimmers={topSwimmers}
        topMedalists={topMedalists} records={records} medalBoxes={medalBoxes}
        hosted={hosted} participated={participated}
        progStroke={progStroke} setProgStroke={setProgStroke}
        progPool={progPool} setProgPool={setProgPool}
        progLines={progLines} progLoading={progLoading}
      />}

      {/* ===== PROGRESSION ===== */}
      {tab === 'progression' && <FederationProgressionTab countryId={id} />}

      {/* ===== RECORDS ===== */}
      {tab === 'records' && <RecordsTab records={records} country={country} />}

      {/* ===== MEDALS ===== */}
      {tab === 'medals' && mclass && (
        <MedalClassDetail
          countryId={arabFed ? null : id}
          className={mclass}
          box={medalBoxes.find((m) => m.name === mclass)}
          onBack={() => setSearchParams({ tab: 'medals' }, { replace: true })}
        />
      )}
      {tab === 'medals' && !mclass && (
        <div className="pad-lg">
          <SectHead title="Medal Tally by Competition" />
          {(() => {
            // Every applicable classification is always clickable — zero-medal
            // ones included — so each drill-down's country standings can be
            // seen. Regional classes (GCC/Asian/African/Mediterranean) only
            // show on their member countries.
            const ALL_CLASSES = ['Olympic', 'World', 'Arab', 'Islamic',
              'GCC', 'Asian', 'African', 'Mediterranean']
            const applies = (n) => {
              const list = CLASS_COUNTRY_CODES[n]
              return !list || !country?.code || list.includes(country.code)
            }
            const byName = {}
            medalBoxes.forEach((m) => { byName[m.name] = m })
            const boxes = [
              ...medalBoxes.filter((m) => m.name !== 'National' && m.name !== 'Other' && (m.total > 0 || applies(m.name))),
              ...ALL_CLASSES.filter((n) => !byName[n] && applies(n))
                .map((n) => ({ name: n, gold: 0, silver: 0, bronze: 0, total: 0 })),
            ]
            return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
              {boxes.map((m) => (
                <div
                  key={m.name}
                  onClick={() => setSearchParams({ tab: 'medals', mclass: m.name })}
                  role="button" tabIndex={0} className="row-link"
                  aria-label={`${m.name}: ${m.total} medals, open details`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSearchParams({ tab: 'medals', mclass: m.name }) } }}
                  style={{ background: '#fff', border: '1px solid var(--color-neutral-300)', borderTop: '3px solid var(--color-box-top)', borderRadius: 0, color: 'var(--color-accent-800)', padding: '12px 16px', minWidth: 150, flex: '1 1 150px', maxWidth: 240, cursor: 'pointer', position: 'relative' }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-neutral-700)' }}>{m.name}</div>
                  <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, lineHeight: 1.1, marginTop: 2, color: 'var(--color-accent-800)' }}>{formatNumber(m.total)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <GSB gold={m.gold} silver={m.silver} bronze={m.bronze} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent-800)', whiteSpace: 'nowrap' }}>Details →</span>
                  </div>
                </div>
              ))}
            </div>
            )
          })()}
          <SectHead title={`Top Medalists · ${topMedalists.length}`} />
          {topMedalists.length === 0 ? <Empty label="No medals" hint="Medalists appear here once this federation wins a medal." /> : (
            <div className="table-scroll" style={{ maxWidth: 880 }}><table className="table"><thead><tr><th style={{ width: 30 }}>#</th><th>Swimmer</th><th className="num">G</th><th className="num">S</th><th className="num">B</th><th className="num">Total</th></tr></thead><tbody>
              {topMedalists.map((m, i) => (<tr key={m.id ?? i}><td className="asw-num">{i + 1}</td><td><SwimmerLink id={m.id} name={m.name} /></td><td className="num asw-num" style={{ fontWeight: 800 }}>{m.gold}</td><td className="num asw-num">{m.silver}</td><td className="num asw-num">{m.bronze}</td><td className="num asw-num" style={{ fontWeight: 800 }}>{m.total}</td></tr>))}
            </tbody></table></div>
          )}
        </div>
      )}

      {/* ===== CLUBS ===== */}
      {tab === 'clubs' && <ClubsTab countryId={id} />}

      {/* ===== ACADEMIES ===== */}
      {tab === 'academies' && <AcademiesTab countryId={id} />}

      {/* ===== COMPARE ===== */}
      {tab === 'compare' && <CompareTab profile={profile} country={country} />}

      {/* ===== QUALIFYING ===== */}
      {tab === 'qualifying' && <QualifyingTab countryId={arabFed ? null : id} qualSub={qualSub} setQualSub={setQualSub} />}

      {/* ===== DATA TABS ===== */}
      {tab === 'news' && <NewsTab countryId={arabFed ? null : id} countryName={country.name} />}
      {tab === 'ranking' && <RankingTab countryId={arabFed ? null : id} />}
      {tab === 'pools' && <PoolsTab hosted={hosted} countryName={country.name} />}
      {tab === 'prediction' && <PredictionTab countryName={country.name} />}
      {tab === 'multimedia' && <MultimediaTab champIds={new Set([...hosted, ...participated].map((c) => c.id))} champNames={[...hosted, ...participated].map((c) => c.name)} countryName={country.name} />}
      {tab === 'archives' && <ArchivesTab hosted={hosted} participated={participated} countryName={country.name} />}

      {/* ===== ADMIN MODALS ===== */}
      {fedModal === 'info' && (
        <FedInfoModal country={country} onClose={() => setFedModal(null)}
          onSaved={() => { setFedModal(null); setReloadKey((k) => k + 1); setFedNotice({ where: 'info', text: 'Federation info saved' }) }} />
      )}
      {fedModal?.type === 'board' && (
        <FedBoardModal member={fedModal.member} teamId={fedModal.teamId} onClose={() => setFedModal(null)}
          onSaved={() => { setFedModal(null); setBoardKey((k) => k + 1); setFedNotice({ where: 'board', text: 'Board member saved' }) }} />
      )}
    </div>
  )
}
