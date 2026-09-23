import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getCountryProfile, getCountryProgression, getEvents, getCountries } from '../api/core'
import { getArticles } from '../api/news'
import { getRankings } from '../api/rankings'
import { getQualifyingStandards, getQualifyingStandard, getQualifiedSwimmers } from '../api/qualifyingTimes'
import { getPredictions } from '../api/predictions'
import { getAlbums } from '../api/media'
import { getBoardMembers } from '../api/teams'
import { getCoaches } from '../api/coaches'
import { getAcademies } from '../api/academies'
import { getCalendarEvents } from '../api/calendar'
import { getMedals, getMedalSummary, getMedalSwimmerSummary } from '../api/medals'
import { getClassifications } from '../api/records'
import Flag, { flagImage } from '../components/Flag'
import FederationProgressionTab from '../components/FederationProgression'
import { Loading, Empty, SectHead, Seg, Pager } from '../components/ui'
import { formatDate, formatNumber, formatTime, mediaUrl, flagAlpha2 } from '../utils'

const CLASS_ORDER = ['Arab', 'GCC', 'African', 'Asian', 'Mediterranean', 'Islamic', 'World', 'Olympic']
const COACH_LEVELS = {
  HEAD: 'Head Coach', ASSISTANT: 'Assistant Coach', TECHNIQUE: 'Technique Coach',
  FITNESS: 'Fitness / S&C Coach', YOUTH: 'Youth Development Coach', PRIVATE: 'Private Coach',
}
const CLASS_COLORS = {
  Arab: '#1c4e86', GCC: '#7d8a99', African: '#a8402f', Asian: '#a05f2c',
  Mediterranean: '#4a8fc0', Islamic: '#0d7a52', World: '#b98a1e', Olympic: '#0c2340',
  National: '#2e6b4f', University: '#6b4f8a', Other: '#5a6572',
}

// Federation hero banner photo: probes every candidate swimmer photo's real
// resolution + aspect ratio and picks the best one for a wide banner —
// large landscape action shots score highest, tiny images that would blur
// when scaled up are rejected outright. objectPosition adapts to the shape
// so faces stay in frame (portrait → anchor high, wide → centre).
function FedHeroPhoto({ candidates, extras }) {
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

const LINE_HEX = ['#1c4e86', '#4a8fc0', '#0c2340', '#72a4cf', '#2f6cae', '#12253d', '#aecae4', '#17416f']

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

function SubTabs({ options, value, onChange }) {
  const base = { padding: '8px 22px', border: '2px solid #1a56a0', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' }
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', margin: '18px 0 24px' }}>
      {options.map(([val, label]) => (
        <button key={val} type="button" onClick={() => onChange(val)}
          style={value === val ? { ...base, background: '#1a56a0', color: '#fff' } : { ...base, background: '#fff', color: '#1a56a0' }}>
          {label}
        </button>
      ))}
    </div>
  )
}

function TabHeading({ title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '4px 0 24px' }}>
      <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0b2948', margin: 0, textAlign: 'center' }}>{title}</h2>
      <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
    </div>
  )
}

/* ===== NEWS TAB ===== */
function NewsTab({ countryId, countryName }) {
  const [articles, setArticles] = useState(null)
  const [regionWide, setRegionWide] = useState(false)
  useEffect(() => {
    let alive = true
    const unwrap = (r) => (Array.isArray(r.data) ? r.data : r.data?.results || [])
    getArticles({ country: countryId, status: 'PUBLISHED', ordering: '-published_at' })
      .then((r) => {
        const mine = unwrap(r)
        if (mine.length) { if (alive) { setArticles(mine); setRegionWide(false) }; return null }
        // No country-tagged articles — fall back to Arab swimming news
        return getArticles({ status: 'PUBLISHED', ordering: '-published_at' })
          .then((r2) => { if (alive) { setArticles(unwrap(r2)); setRegionWide(true) } })
      })
      .catch(() => alive && setArticles([]))
    return () => { alive = false }
  }, [countryId])
  if (articles === null) return <Loading label="Loading news" />
  return (
    <div className="pad-lg">
      <TabHeading title={regionWide ? 'Arab Swimming News' : `${countryName} News`} />
      {regionWide && articles.length > 0 && (
        <div style={{ textAlign: 'center', fontSize: 12.5, color: '#6b7d94', margin: '-8px 0 18px' }}>
          No {countryName}-specific articles yet — showing the latest news from around the Arab swimming world.
        </div>
      )}
      {articles.length === 0 ? <Empty label="No news articles yet" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {articles.map((a) => (
            <Link key={a.id} to={`/news/${a.id}`} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
              <div style={{ position: 'relative', height: 175, overflow: 'hidden', background: 'linear-gradient(135deg, #0b2948, #1a56a0)', flex: 'none' }}>
                {a.cover_image && (
                  <>
                    <img src={a.cover_image} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(20px)', transform: 'scale(1.15)', opacity: 0.5 }} />
                    <img src={a.cover_image} alt="" style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain' }} />
                  </>
                )}
              </div>
              <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div className="micro" style={{ marginBottom: 6 }}>{formatDate(a.published_at || a.created_at)}</div>
                <div style={{ fontWeight: 800, fontSize: 15.5, lineHeight: 1.3, color: '#0b2948', marginBottom: 8 }}>{a.title}</div>
                <div style={{ fontSize: 12.5, color: '#58687c', lineHeight: 1.5, marginBottom: 12 }}>{(a.body || '').replace(/<[^>]+>/g, '').slice(0, 110)}{(a.body || '').length > 110 ? '…' : ''}</div>
                <span style={{ marginTop: 'auto', color: '#1a56a0', fontWeight: 700, fontSize: 13 }}>Read more →</span>
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

  useEffect(() => {
    let alive = true
    getEvents({ has_results: true }).then((r) => {
      if (!alive) return
      const all = (Array.isArray(r.data) ? r.data : r.data?.results || []).filter((e) => e.stroke !== 'Open Water' && !/4\s*x/i.test(e.name))
      setEvents(all)
      const first = all.find((e) => /^50m Freestyle$/i.test(e.name)) || all[0]
      if (first) setEvent(String(first.id))
    }).catch(() => alive && setEvents([]))
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!event) return
    let alive = true; setLoading(true)
    getRankings({ scope: 'national', country: countryId, gender, pool, event, age_group: ageGroup, limit: 20, page })
      .then((r) => {
        if (!alive) return
        setRows(r.data?.results || (Array.isArray(r.data) ? r.data : []))
        setCount(r.data?.count ?? 0)
      })
      .catch(() => alive && setRows([]))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [countryId, event, gender, pool, ageGroup, page])

  // New filter selection restarts from page 1
  useEffect(() => { setPage(1) }, [event, gender, pool, ageGroup])

  const grouped = useMemo(() => {
    const g = {}
    events.forEach((e) => { (g[e.stroke] = g[e.stroke] || []).push(e) })
    return Object.entries(g)
  }, [events])

  return (
    <div className="pad-lg">
      <TabHeading title="National Ranking" />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
        <select className="select" style={{ width: 'auto', minWidth: 180 }} value={event} onChange={(e) => setEvent(e.target.value)}>
          {grouped.map(([stroke, evs]) => (
            <optgroup key={stroke} label={stroke}>
              {evs.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </optgroup>
          ))}
        </select>
        <Seg options={[{ value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }]} value={gender} onChange={setGender} />
        <Seg options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]} value={pool} onChange={setPool} />
        <select className="select" style={{ width: 'auto' }} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
          <option value="OPEN">Open</option>
          {['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17'].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {loading ? <Loading label="Loading ranking" /> : rows.length === 0 ? <Empty label="No results for this event" /> : (
        <>
        <div className="table-scroll"><table className="table"><thead><tr><th style={{ width: 40 }}>#</th><th>Swimmer</th><th className="num">Age</th><th className="time">Time</th><th className="num">FINA</th><th>Championship</th><th>Location</th><th>Date</th></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.result_id}>
              <td><span className="asw-num" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: '#0b2948', color: '#fff', fontWeight: 800, fontSize: 12 }}>{r.rank}</span></td>
              <td><SwimmerLink id={r.swimmer_id} name={r.swimmer_name} /></td>
              <td className="num asw-num">{r.age_at_competition || '—'}</td>
              <td className="time asw-time" style={{ fontWeight: 800 }}>{r.time}</td>
              <td className="num asw-num">{r.fina_points ?? '—'}</td>
              <td className="text-muted">{r.championship_name}</td>
              <td className="text-muted">{[r.championship_location, r.championship_country].filter(Boolean).join(', ') || '—'}</td>
              <td className="text-muted">{formatDate(r.date)}</td>
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

  useEffect(() => {
    let alive = true
    setLoading(true)
    getAcademies()
      .then((r) => {
        if (!alive) return
        const all = Array.isArray(r.data) ? r.data : r.data?.results || []
        setAcademies(all.filter((a) => String(a.country) === String(countryId)))
      })
      .catch(() => alive && setAcademies([]))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [countryId])

  if (loading) return <Loading label="Loading academies" />
  return (
    <div className="pad-lg">
      <SectHead title={`Academies · ${academies.length}`} />
      {academies.length === 0 ? <Empty label="No academies registered" /> : (
        <div>{academies.map((a) => (
          <div key={a.id} className="hair-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0' }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600, display: 'block' }}>{a.name}</span>
              {a.city && <span className="text-muted" style={{ fontSize: 12 }}>{a.city}</span>}
            </span>
            {a.phone && <span className="text-muted asw-num" style={{ fontSize: 12, flex: 'none' }}>{a.phone}</span>}
          </div>
        ))}</div>
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

  useEffect(() => {
    let alive = true
    getQualifyingStandards()
      .then((r) => {
        if (!alive) return
        const list = Array.isArray(r.data) ? r.data : r.data?.results || []
        setStandards(list)
        if (list.length > 0) setStandardId(String(list[0].id))
      })
      .catch(() => alive && setStandards([]))
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!standardId) return
    let alive = true; setDetail(null)
    getQualifyingStandard(standardId)
      .then((r) => alive && setDetail(r.data))
      .catch(() => alive && setDetail({ times: [] }))
    return () => { alive = false }
  }, [standardId])

  // Qualified swimmers — computed server-side so only swims inside the
  // official qualification window count (World Aquatics rule: ~16-month
  // window ending a few weeks before the meet).
  useEffect(() => {
    if (!standardId || qualSub !== 'qualified') return
    let alive = true; setQualData(null)
    getQualifiedSwimmers(standardId, { country: countryId })
      .then((r) => alive && setQualData(r.data))
      .catch(() => alive && setQualData({ window: null, qualified: [] }))
    return () => { alive = false }
  }, [standardId, qualSub, countryId])

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

  if (standards === null) return <Loading label="Loading qualifying standards" />
  return (
    <div className="pad-lg">
      <TabHeading title="Qualifying" />
      <SubTabs options={[['standards', 'Standards'], ['qualified', 'Qualified']]} value={qualSub} onChange={setQualSub} />
      {standards.length === 0 ? <Empty label="No qualifying standards published yet" /> : (<>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
          <select className="select" style={{ width: 'auto', minWidth: 220 }} value={standardId} onChange={(e) => setStandardId(e.target.value)}>
            {standards.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.year})</option>)}
          </select>
          {qualSub === 'standards' && (<>
            <Seg options={[{ value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }]} value={gender} onChange={setGender} />
            <Seg options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]} value={pool} onChange={setPool} />
          </>)}
        </div>
        {!detail ? <Loading label="Loading standard" /> : qualSub === 'standards' ? (
          standardRows.length === 0 ? <Empty label="No cuts for this selection" /> : (
            <div className="table-scroll" style={{ maxWidth: 620, margin: '0 auto' }}><table className="table"><thead><tr><th>Event</th><th className="time">A Cut</th><th className="time">B Cut</th></tr></thead><tbody>
              {standardRows.map((r) => (
                <tr key={r.event}><td style={{ fontWeight: 600 }}>{r.event}</td><td className="time asw-time" style={{ fontWeight: 800, color: '#1a56a0' }}>{r.A || '—'}</td><td className="time asw-time">{r.B || '—'}</td></tr>
              ))}
            </tbody></table></div>
          )
        ) : qualData === null ? <Loading label="Checking qualifying swims" /> : (<>
          <div style={{ textAlign: 'center', fontSize: 12.5, color: '#5a6b80', fontWeight: 600, margin: '0 0 16px' }}>
            {qualWindow
              ? <>Qualification period{qualWindow.derived ? ' (estimated)' : ''}: <span className="asw-num" style={{ color: '#0b2948', fontWeight: 800 }}>{formatDate(qualWindow.start)} – {formatDate(qualWindow.end)}</span> — only swims in this window count</>
              : 'Qualification period not published yet — showing all-time best times'}
          </div>
          {qualifiedRows.length === 0 ? <Empty label={qualWindow ? 'No swimmers have made a cut inside the qualification period yet' : 'No swimmers meet these cuts yet'} /> : (
            <div className="table-scroll"><table className="table"><thead><tr><th>Swimmer</th><th>Event</th><th>Sex</th><th>Pool</th><th className="time">Time</th><th className="time">Cut</th><th>Standard</th><th>Where Achieved</th></tr></thead><tbody>
              {qualifiedRows.map((r, i) => (
                <tr key={i}>
                  <td><SwimmerLink id={r.swimmer_id} name={r.swimmer} /></td>
                  <td style={{ fontWeight: 600 }}>{r.event}</td>
                  <td className="text-muted">{r.sex === 'F' ? "Women's" : "Men's"}</td>
                  <td className="text-muted">{r.pool}</td>
                  <td className="time asw-time" style={{ fontWeight: 800, color: '#1a56a0' }}>{r.time}</td>
                  <td className="time asw-time">{r.cut_time}</td>
                  <td><span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 800, background: r.cut === 'A' ? '#0d7a52' : '#b98a1e', color: '#fff' }}>{r.cut} Cut</span></td>
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
  useEffect(() => {
    let alive = true
    getPredictions()
      .then((r) => alive && setPreds(Array.isArray(r.data) ? r.data : []))
      .catch(() => alive && setPreds([]))
    return () => { alive = false }
  }, [])
  if (preds === null) return <Loading label="Loading predictions" />
  const mine = preds.filter((p) => p.country === countryName)
  const others = preds.filter((p) => p.country !== countryName)
  const card = (p, hosted) => (
    <Link key={p.id} to="/predictions" style={{ background: '#fff', border: hosted ? '2px solid #1a56a0' : '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', background: CLASS_COLORS[p.classification] || '#1a56a0', color: '#fff', padding: '2px 8px', borderRadius: 4 }}>{p.classification || 'Meet'}</span>
        {hosted && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', background: '#0d2d5e', color: '#fff', padding: '2px 8px', borderRadius: 4 }}>Hosted here</span>}
        {p.stage && <span className="micro" style={{ marginLeft: 'auto' }}>{p.stage === 'OFFICIAL' ? 'Official entries' : 'Early forecast'}</span>}
      </div>
      <div style={{ fontWeight: 800, fontSize: 15, color: '#0b2948', lineHeight: 1.3 }}>{p.name}</div>
      <div className="text-muted" style={{ fontSize: 12.5 }}>{formatDate(p.date)}{p.end_date ? ` – ${formatDate(p.end_date)}` : ''} · {p.pool}{p.country ? ` · ${p.country}` : ''}</div>
      <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 12 }}>
        {p.event_count != null && <span className="asw-num text-muted">{p.event_count} events</span>}
        {p.confidence != null && <span className="asw-num" style={{ color: '#1a56a0', fontWeight: 700 }}>{Math.round(p.confidence * 100)}% confidence</span>}
        <span style={{ marginLeft: 'auto', color: '#1a56a0', fontWeight: 700 }}>View predictions →</span>
      </div>
    </Link>
  )
  return (
    <div className="pad-lg">
      <TabHeading title="Medal Predictions" />
      {preds.length === 0 ? <Empty label="No upcoming championships with predictions" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
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
  useEffect(() => {
    let alive = true
    getAlbums()
      .then((r) => alive && setAlbums(Array.isArray(r.data) ? r.data : r.data?.results || []))
      .catch(() => alive && setAlbums([]))
    return () => { alive = false }
  }, [])
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
            <Link key={a.id} to={`/media/albums/${a.id}`} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', textDecoration: 'none', color: 'inherit', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
              <div style={{ height: 160, background: a.cover ? `url(${a.cover}) center/cover` : 'linear-gradient(135deg, #0b2948, #1a56a0)', display: 'flex', alignItems: 'flex-end' }}>
                <span style={{ background: 'rgba(13,45,94,.85)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: '0 8px 0 0' }} className="asw-num">{a.items_count} items</span>
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#0b2948', lineHeight: 1.3 }}>{a.title}</div>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {venues.map((v) => (
            <div key={v.location} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>🏊</div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#0b2948' }}>{v.location}</div>
              <div className="text-muted asw-num" style={{ fontSize: 12.5, marginTop: 6 }}>{v.meets} championship{v.meets > 1 ? 's' : ''} hosted</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {[...v.pools].map((p) => <span key={p} style={{ fontSize: 10.5, fontWeight: 800, background: '#0d2d5e', color: '#fff', padding: '2px 8px', borderRadius: 4 }}>{p}</span>)}
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
            <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 20, color: '#0b2948' }}>{year}</span>
            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            <span className="micro asw-num">{meets.length} meet{meets.length > 1 ? 's' : ''}</span>
          </div>
          {meets.map((c) => (
            <Link key={`${c.kind}-${c.id}`} to={`/meets/${c.id}`} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', color: 'inherit', textDecoration: 'none', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4, background: c.kind === 'Hosted' ? '#0d2d5e' : '#eef3f9', color: c.kind === 'Hosted' ? '#fff' : '#1a56a0', flex: 'none' }}>{c.kind}</span>
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
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 600, height: 'auto' }}>
        {csValues.length > 1 && Array.from({ length: 4 }, (_, i) => {
          const cs = minCs + (range * i) / 3
          const yy = y(cs)
          const m = Math.floor(cs / 6000); const s = Math.floor((cs % 6000) / 100); const c = cs % 100
          return <g key={i}><line x1={pL} x2={W - pR} y1={yy} y2={yy} stroke="#e5e9ed" /><text x={pL - 8} y={yy + 4} textAnchor="end" fill="#58687c" fontSize="11" style={{ fontVariantNumeric: 'tabular-nums' }}>{m ? `${m}:${String(s).padStart(2, '0')}` : `${s}.${String(c).padStart(2, '0')}`}</text></g>
        })}
        {years.filter((_, i) => i % Math.ceil(years.length / 8) === 0 || i === years.length - 1).map((yr) => (
          <text key={yr} x={x(yr)} y={H - 4} textAnchor="middle" fill="#58687c" fontSize="10">{yr}</text>
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
  card: { background: '#fff', borderRadius: 6, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', border: '1px solid #dde3ea', position: 'relative' },
  title: { fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 14, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#0b2948', display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.2 },
  sub: { fontSize: 10.5, color: '#7a8ca0', marginBottom: 14, marginTop: 3, lineHeight: 1.3 },
  viewAll: { fontSize: 10, color: '#4a90d9', fontWeight: 700, marginLeft: 'auto', cursor: 'pointer', textDecoration: 'none', textTransform: 'none', letterSpacing: '0.03em' },
  rankBadge: (i) => ({
    width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, color: '#fff',
    background: '#1a56a0',
    flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,.2)',
  }),
  medalCircle: (color) => ({
    width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, color: '#fff', background: color, flexShrink: 0,
    boxShadow: '0 1px 3px rgba(0,0,0,.15)',
  }),
  th: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a9bb5', padding: '8px 0', borderBottom: '2px solid #e2e8f0' },
  row: (i) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f0f3f7', fontSize: 13, background: i % 2 === 1 ? '#fafbfd' : 'transparent' }),
  photo: { width: 52, height: 52, borderRadius: '50%', background: '#e8ecf1', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#8a9bb5', border: '2px solid #d0d8e4', overflow: 'hidden' },
  photoSmall: { width: 28, height: 28, borderRadius: '50%', background: '#e8ecf1', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#8a9bb5', border: '1.5px solid #d0d8e4', overflow: 'hidden' },
}
const PERF_BAR_COLORS = ['#e63946', '#f4845f', '#f7b731', '#f5d547', '#52c78a', '#27ae60', '#3b9dd6', '#2471a3', '#7d3c98', '#b0bec5']

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
  NATIONAL: '#1a56a0', ARAB: '#b98a1e', GCC: '#0d7a52', AFRICAN: '#a8402f',
  ASIAN: '#a05f2c', MEDITERRANEAN: '#4a8fc0', ISLAMIC: '#0d7a52', WORLD: '#0c2340',
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
  const [gender, setGender] = useState('')
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
    if (gender && r.sex !== gender) return false
    if (pool && r.pool !== pool) return false
    const wanted = ageCat === 'Open' ? 'OPEN' : ageCat
    if (r.age_category && r.age_category !== wanted) return false
    if (!r.age_category && ageCat !== 'Open') return false
    return true
  })

  const selStyle = { padding: '10px 20px', border: '1px solid #c0cad8', borderRadius: 6, fontSize: 14, fontWeight: 600, color: '#0b2948', background: '#fff', cursor: 'pointer', minWidth: 180, appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%230b2948\' stroke-width=\'2\' fill=\'none\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }
  const pillBase = { padding: '8px 18px', border: '2px solid #1a56a0', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }
  const pillActive = { ...pillBase, background: '#1a56a0', color: '#fff' }
  const pillInactive = { ...pillBase, background: '#fff', color: '#1a56a0' }

  return (
    <div style={{ padding: '28px 28px', background: '#fff' }}>
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 28, marginBottom: 4 }}>🏅</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ width: 60, height: 2, background: '#1a56a0' }} />
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 26, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0b2948', margin: 0 }}>Records</h2>
          <div style={{ width: 60, height: 2, background: '#1a56a0' }} />
        </div>
      </div>

      {/* Record type sub-tabs */}
      {typesPresent.length > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
          {typesPresent.map((t) => (
            <button key={t} type="button" onClick={() => setRecType(t)}
              style={activeType === t
                ? { ...pillBase, border: `2px solid ${REC_TYPE_COLORS[t]}`, background: REC_TYPE_COLORS[t], color: '#fff' }
                : { ...pillBase, border: `2px solid ${REC_TYPE_COLORS[t]}`, background: '#fff', color: REC_TYPE_COLORS[t] }}>
              {REC_TYPE_LABELS[t]} Records
            </button>
          ))}
        </div>
      )}

      {/* Filters: Gender + Pool dropdowns */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 20 }}>
        <select style={selStyle} value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="">♂ Gender</option>
          <option value="M">♂ Men's</option>
          <option value="F">♀ Women's</option>
        </select>
        <select style={selStyle} value={pool} onChange={(e) => setPool(e.target.value)}>
          <option value="">🏊 Pool</option>
          <option value="LCM">LCM (50m)</option>
          <option value="SCM">SCM (25m)</option>
        </select>
      </div>

      {/* Age category pills */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
        {AGE_CATS.map((cat) => (
          <button key={cat} type="button" onClick={() => setAgeCat(cat)}
            style={ageCat === cat ? pillActive : pillInactive}>
            {cat}
          </button>
        ))}
      </div>

      {/* Record cards grid */}
      {filtered.length === 0 ? <Empty label="No records for this selection" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 18 }}>
          {filtered.map((r, i) => (
            <div key={i} style={{ borderRadius: 16, textAlign: 'center', background: '#fff', border: '1px solid #e2e9f2', boxShadow: '0 2px 12px rgba(11,41,72,.08)', padding: '14px 14px 20px', display: 'flex', flexDirection: 'column' }}>
              {/* Large rounded photo */}
              <div style={{ width: '100%', aspectRatio: '1 / 1.05', borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(180deg, #e9eef4, #d4dde8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: '#8a9bb5' }}>
                {r.swimmer_photo ? <img src={mediaUrl(r.swimmer_photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : '🏊'}
              </div>
              <div style={{ paddingTop: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 17, color: '#0b2948' }}>
                  <SwimmerLink id={r.swimmer_id} name={r.swimmer} />
                </div>
                <div style={{ fontSize: 13.5, color: '#1a56a0', fontWeight: 600, marginTop: 6 }}>{r.event}</div>
              </div>
              <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 30, color: '#0d2d5e', letterSpacing: '-0.02em' }}>{r.time}</div>
                <div style={{ fontSize: 12.5, color: REC_TYPE_COLORS[r.record_type] || '#0b2948', fontWeight: 700, marginTop: 6 }}>{REC_TYPE_LABELS[r.record_type] || r.record_type} Record</div>
                <div style={{ fontSize: 12, color: '#8a9bb5', marginTop: 2 }}>{r.pool} | {r.sex === 'F' ? "Women's" : "Men's"}</div>
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

  useEffect(() => {
    let alive = true
    setLoading(true)
    getClassifications()
      .then((r) => {
        const all = Array.isArray(r.data) ? r.data : r.data?.results || []
        const cls = all.find((c) => c.name === className)
        if (!cls) return Promise.reject(new Error('unknown classification'))
        return Promise.all([
          getMedals({ country: countryId, classification: cls.id, page_size: 5000 }),
          getMedalSwimmerSummary({ country: countryId, classification: cls.id, limit: 'all' }),
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
      .catch(() => { if (alive) { setRows([]); setMedalists([]); setStandings([]) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [countryId, className])

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

  const color = CLASS_COLORS[className] || '#1a56a0'
  const medalBadge = (type) => {
    const map = { GOLD: ['G', 'var(--asw-gold)'], SILVER: ['S', 'var(--asw-silver)'], BRONZE: ['B', '#c88a4d'] }
    const [letter, bg] = map[type] || ['?', '#999']
    return <span className="asw-num" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: bg, color: '#fff', fontWeight: 900, fontSize: 12 }}>{letter}</span>
  }
  const statBox = (label, value, accent) => (
    <div style={{ flex: '1 1 100px', maxWidth: 160, background: '#fff', border: '1px solid #dde6f0', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
      <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 26, color: accent }}>{formatNumber(value)}</div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5a6b80', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div className="pad-lg">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1a56a0', fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
        ← All competitions
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0 18px', flexWrap: 'wrap' }}>
        <span style={{ background: color, color: '#fff', padding: '8px 18px', borderRadius: 6, fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 20, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{className}</span>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0b2948' }}>Medal Details</span>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {statBox('Gold', box?.gold ?? 0, 'var(--asw-gold)')}
        {statBox('Silver', box?.silver ?? 0, '#8a94a3')}
        {statBox('Bronze', box?.bronze ?? 0, '#c88a4d')}
        {statBox('Total', box?.total ?? 0, '#0b2948')}
      </div>

      <SubTabs
        options={[['countries', 'Countries'], ['championships', 'By Championship'], ['medalists', 'Medalists'], ['medals', 'All Medals']]}
        value={sub} onChange={setSub}
      />

      {loading && <Loading label="Loading medals" />}

      {!loading && sub === 'countries' && (
        standings.length === 0 ? <Empty label="No medals" /> : (
          <div className="table-scroll"><table className="table"><thead><tr><th style={{ width: 30 }}>#</th><th>Country</th><th className="num">G</th><th className="num">S</th><th className="num">B</th><th className="num">Total</th></tr></thead><tbody>
            {standings.map((c, i) => (
              <tr key={c.swimmer__nationality__code || i}>
                <td className="asw-num">{i + 1}</td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                    <Flag code={c.swimmer__nationality__code} name={c.swimmer__nationality__name} flagUrl={c.swimmer__nationality__flag_url} />
                    {c.swimmer__nationality__name}
                  </span>
                </td>
                <td className="num asw-num" style={{ fontWeight: 800, color: 'var(--asw-gold)' }}>{c.gold}</td>
                <td className="num asw-num">{c.silver}</td>
                <td className="num asw-num">{c.bronze}</td>
                <td className="num asw-num" style={{ fontWeight: 800 }}>{c.total}</td>
              </tr>
            ))}
          </tbody></table></div>
        )
      )}

      {!loading && sub === 'championships' && (
        byChamp.length === 0 ? <Empty label="No medals" /> : (
          <div className="table-scroll"><table className="table"><thead><tr><th>Championship</th><th>Date</th><th>Location</th><th className="num">G</th><th className="num">S</th><th className="num">B</th><th className="num">Total</th></tr></thead><tbody>
            {byChamp.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/meets/${c.id}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>{c.name}</Link></td>
                <td className="text-muted">{formatDate(c.date)}</td>
                <td className="text-muted">{c.location || '—'}</td>
                <td className="num asw-num" style={{ fontWeight: 800, color: 'var(--asw-gold)' }}>{c.gold}</td>
                <td className="num asw-num">{c.silver}</td>
                <td className="num asw-num">{c.bronze}</td>
                <td className="num asw-num" style={{ fontWeight: 800 }}>{c.total}</td>
              </tr>
            ))}
          </tbody></table></div>
        )
      )}

      {!loading && sub === 'medalists' && (
        medalists.length === 0 ? <Empty label="No medalists" /> : (
          <div className="table-scroll"><table className="table"><thead><tr><th style={{ width: 30 }}>#</th><th>Swimmer</th><th className="num">G</th><th className="num">S</th><th className="num">B</th><th className="num">Total</th></tr></thead><tbody>
            {medalists.map((m, i) => (
              <tr key={m.swimmer__id ?? i}>
                <td className="asw-num">{i + 1}</td>
                <td><SwimmerLink id={m.swimmer__id} name={m.swimmer__name} /></td>
                <td className="num asw-num" style={{ fontWeight: 800, color: 'var(--asw-gold)' }}>{m.gold}</td>
                <td className="num asw-num">{m.silver}</td>
                <td className="num asw-num">{m.bronze}</td>
                <td className="num asw-num" style={{ fontWeight: 800 }}>{m.total}</td>
              </tr>
            ))}
          </tbody></table></div>
        )
      )}

      {!loading && sub === 'medals' && (
        sortedMedals.length === 0 ? <Empty label="No medals" /> : (
          <div className="table-scroll"><table className="table"><thead><tr><th style={{ width: 40 }}></th><th>Event</th><th>Swimmer</th><th>Championship</th><th>Date</th></tr></thead><tbody>
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
        if (alive) setCountries(rows.filter((c) => ['ARAB', 'GCC'].includes(c.region) && c.id !== country.id))
      })
      .catch(() => alive && setCountries([]))
    return () => { alive = false }
  }, [country.id])

  useEffect(() => {
    if (!otherId) { setOther(null); return }
    let alive = true; setLoadingOther(true)
    getCountryProfile(otherId)
      .then((r) => alive && setOther(r.data))
      .catch(() => alive && setOther(null))
      .finally(() => alive && setLoadingOther(false))
    return () => { alive = false }
  }, [otherId])

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
      <div style={{ textAlign: 'center', fontSize: 12.5, color: '#5a6b80', margin: '10px 0 0', fontWeight: 600 }}>
        International-level data only — domestic national championships are excluded
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, margin: '18px 0 26px', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#0b2948' }}><Flag code={country.code} /> {country.name}</span>
        <span style={{ fontWeight: 900, color: '#1a56a0', fontSize: 15 }}>VS</span>
        <select value={otherId} onChange={(e) => setOtherId(e.target.value)} style={{ padding: '9px 14px', border: '2px solid #1a56a0', borderRadius: 6, fontSize: 13.5, fontWeight: 700, color: '#0b2948', background: '#fff', fontFamily: 'inherit' }}>
          <option value="">Choose a federation…</option>
          {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {loadingOther && <Loading label="Loading federation" />}
      {!loadingOther && !other && <Empty label="Pick a federation to compare against" />}
      {!loadingOther && other && (
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#0b2948', color: '#fff', borderRadius: '8px 8px 0 0', fontWeight: 800, fontSize: 14 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Flag code={country.code} /> {country.name}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{other.country.name} <Flag code={other.country.code} /></span>
          </div>
          {rows.map(([label, a, b], i) => {
            const winA = a > b; const winB = b > a
            const numStyle = (win) => ({ width: 110, fontWeight: 900, fontSize: 16, color: win ? '#1a56a0' : '#6b7a90' })
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', background: i % 2 ? '#f4f8fc' : '#fff', borderBottom: '1px solid #e3ecf5' }}>
                <span className="asw-num" style={{ ...numStyle(winA), textAlign: 'left' }}>{formatNumber(a)}</span>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#374151' }}>{label}</span>
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
              <div style={{ flex: 1, textAlign: align, padding: '14px 18px', background: win ? '#eef6ef' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: align === 'right' ? 'flex-end' : 'flex-start', fontWeight: 800, fontSize: 13, color: '#0b2948' }}>
                  {align === 'left' && <Flag code={code} />}{cn}{align === 'right' && <Flag code={code} />}
                </div>
                <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 27, color: win ? '#0d7a52' : '#6b7a90', marginTop: 6, letterSpacing: '-0.01em' }}>
                  {t.time}{win && <span style={{ fontSize: 10.5, fontWeight: 800, background: '#0d7a52', color: '#fff', padding: '3px 9px', borderRadius: 12, letterSpacing: '0.05em', margin: '0 8px', verticalAlign: 'middle' }}>FASTER</span>}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0b2948', marginTop: 4 }}><SwimmerLink id={t.swimmer_id} name={t.swimmer} /></div>
                <div style={{ fontSize: 11.5, color: '#5a6b80', marginTop: 2 }}>{t.fina ? `${t.fina} FINA pts` : ''}{t.date ? ` · ${formatDate(t.date)}` : ''}</div>
              </div>
            )
            return (
              <div style={{ marginTop: 26, border: '1px solid #dde6f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 3px 12px rgba(11,41,72,.07)' }}>
                <div style={{ background: '#0b2948', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8fb3dd' }}>Event Battle · Fastest of Each Country</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 17, marginTop: 2 }}>
                      {ev} · {sex === 'F' ? "Women" : "Men"} · {pool === 'SCM' ? 'Short Course' : 'Long Course'}
                    </div>
                  </div>
                  <button
                    onClick={() => commonEvents.length > 1 && setBattleKey(commonEvents.filter((k) => k !== battleKey)[Math.floor(Math.random() * (commonEvents.length - 1))])}
                    style={{ background: '#1a56a0', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    🎲 Another event
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'stretch' }}>
                  {side(a, country.name, country.code, aWins, 'left')}
                  <div style={{ width: 1, background: '#dde6f0' }} />
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
    { label: 'World Class', range: '1000+', min: 1000, max: Infinity },
    { label: 'Super Elite', range: '900-999', min: 900, max: 1000 },
    { label: 'Elite', range: '700-799', min: 700, max: 900 },
    { label: 'Excellence', range: '600-699', min: 600, max: 700 },
    { label: 'Advanced', range: '500-599', min: 500, max: 600 },
    { label: 'Competitive', range: '400-499', min: 400, max: 500 },
    { label: 'Developing', range: '300-399', min: 300, max: 400 },
    { label: 'Fondation', range: '200-299', min: 200, max: 300 },
    { label: 'Novice', range: '100-199', min: 100, max: 200 },
    { label: 'Initiation', range: '0-99', min: 0, max: 100 },
  ]
  const perfDist = perfTiers.map((t) => ({
    ...t, count: topSwimmers.filter((s) => (s.best_fina || 0) >= t.min && (s.best_fina || 0) < t.max).length,
  }))
  const maxPerf = Math.max(...perfDist.map((d) => d.count), 1)

  const partByClass = {}
  participated.forEach((c) => { partByClass[c.classification || 'Other'] = (partByClass[c.classification || 'Other'] || 0) + 1 })
  const participationList = Object.entries(partByClass).sort((a, b) => b[1] - a[1])
  const maxPart = Math.max(...participationList.map(([, n]) => n), 1)

  // Helpers
  const cardHeader = (title, sub) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ width: 4, height: 17, background: 'linear-gradient(180deg, #1a56a0, #0b2948)', borderRadius: 2, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 14.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0b2948' }}>{title}</span>
        <span style={{ fontSize: 10, color: '#4a90d9', fontWeight: 700, marginLeft: 'auto', cursor: 'pointer' }}>View All</span>
      </div>
      <div style={{ fontSize: 10.5, color: '#7a8ca0', marginTop: 4, lineHeight: 1.3, paddingLeft: 13 }}>{sub}</div>
    </div>
  )
  const card = (children, extra = {}) => (
    <div style={{ background: '#fff', borderRadius: 6, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', border: '1px solid #dde3ea', ...extra }}>{children}</div>
  )
  const thStyle = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a9bb5', paddingBottom: 6, borderBottom: '2px solid #e2e8f0' }
  const rowStyle = (i) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f4f8', fontSize: 12.5, background: i % 2 === 1 ? '#fafbfd' : 'transparent' })
  const badge = { width: 24, height: 24, borderRadius: '50%', background: '#1a56a0', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }
  const mc = (color) => ({ width: 26, height: 26, borderRadius: '50%', background: color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 })
  const barRow = (label, n, max) => (
    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
      <span style={{ width: 130, fontSize: 11.5, fontWeight: 600, flexShrink: 0, color: '#374151' }}>{label}</span>
      <div style={{ flex: 1, height: 18, background: '#e8eef6', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${(n / max) * 100}%`, height: '100%', background: '#1a56a0', borderRadius: 3, minWidth: n > 0 ? 8 : 0 }} />
      </div>
      <span className="asw-num" style={{ width: 28, textAlign: 'right', fontWeight: 800, color: '#0b2948', fontSize: 13, flexShrink: 0 }}>{n}</span>
    </div>
  )

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
          <span style={{ flex: 1, fontWeight: 700, fontSize: 12.5, color: '#0b2948' }}><SwimmerLink id={s.id} name={s.name} /></span>
          <span style={{ width: 120, color: '#6b7d94', fontSize: 11 }}>{s.best_event}</span>
          <span className="asw-num" style={{ width: 60, textAlign: 'right', fontWeight: 800, color: '#0b2948', fontSize: 12.5 }}>{s.best_time}</span>
          <span className="asw-num" style={{ width: 36, textAlign: 'right', fontWeight: 900, color: '#1a56a0', fontSize: 13 }}>{s.best_fina}</span>
        </div>
      ))}
    </>
  )

  const decoratedTable = (list) => (
    <>
      <div style={{ display: 'flex', gap: 8, ...thStyle, padding: '0 0 6px' }}>
        <span style={{ width: 24 }}>#</span>
        <span style={{ flex: 1 }}>Swimmer</span>
        <span style={{ width: 28, textAlign: 'center', color: '#d4af37', fontWeight: 900 }}>G</span>
        <span style={{ width: 28, textAlign: 'center', color: '#a8a9ad', fontWeight: 900 }}>S</span>
        <span style={{ width: 28, textAlign: 'center', color: '#cd7f32', fontWeight: 900 }}>B</span>
        <span style={{ width: 40, textAlign: 'center' }}>Total</span>
      </div>
      {list.map((m, i) => (
        <div key={m.id ?? i} style={rowStyle(i)}>
          <span style={badge}>{i + 1}</span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 12.5, color: '#0b2948', display: 'flex', alignItems: 'center', gap: 6 }}><Flag code={m.nationality_code || country.code} /><SwimmerLink id={m.id} name={m.name} /></span>
          <span style={mc('#d4af37')}>{m.gold}</span>
          <span style={mc('#a8a9ad')}>{m.silver}</span>
          <span style={mc('#cd7f32')}>{m.bronze}</span>
          <span className="asw-num" style={{ width: 40, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0b2948' }}>{m.total}</span>
        </div>
      ))}
    </>
  )

  const recCard4 = (rec, label, sub, isRecordman = false) => (
    <div style={{ background: '#fff', border: '1px solid #dde3ea', borderRadius: 6, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
      <div style={{ padding: '10px 12px 7px', borderBottom: '1px solid #f0f3f7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 4, height: 14, background: 'linear-gradient(180deg, #1a56a0, #0b2948)', borderRadius: 2, flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 12, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#0b2948' }}>{label}</span>
          <span style={{ fontSize: 9, color: '#4a90d9', fontWeight: 700, marginLeft: 'auto' }}>View All</span>
        </div>
        <div style={{ fontSize: 9.5, color: '#7a8ca0', marginTop: 3, paddingLeft: 12 }}>{sub}</div>
      </div>
      {rec ? (
        <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 130 }}>
          {/* Photo panel */}
          <div style={{ width: 100, background: 'linear-gradient(170deg, #0d2d5e 0%, #1a56a0 60%, #3b82c4 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, color: 'rgba(255,255,255,0.35)', flexShrink: 0, overflow: 'hidden' }}>
            {(isRecordman ? rec.photo : rec.swimmer_photo)
              ? <img src={mediaUrl(isRecordman ? rec.photo : rec.swimmer_photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
              : '🏊'}
          </div>
          {/* Info */}
          <div style={{ padding: '12px 12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <Flag code={country.code} />
              <span style={{ fontWeight: 800, fontSize: 12.5, color: '#0b2948', lineHeight: 1.2 }}>
                <SwimmerLink id={isRecordman ? rec.id : rec.swimmer_id} name={isRecordman ? rec.name : rec.swimmer} />
              </span>
            </div>
            {!isRecordman && <div style={{ fontSize: 10.5, color: '#7a8ca0', marginBottom: 6 }}>{rec.event}</div>}
            {isRecordman && <div style={{ fontSize: 10.5, color: '#7a8ca0', marginBottom: 6 }}>Total Records</div>}
            <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: isRecordman ? 40 : 30, color: '#1a56a0', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {isRecordman ? rec.count : rec.time}
            </div>
            {!isRecordman && rec.date && <div style={{ fontSize: 10, color: '#9baab8', marginTop: 5 }}>{formatDate(rec.date)}</div>}
          </div>
        </div>
      ) : (
        <div style={{ padding: '30px', textAlign: 'center', color: '#bbb', fontSize: 13, minHeight: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>—</div>
      )}
    </div>
  )

  return (
    <div style={{ background: '#f8fafc', padding: '28px 24px' }}>
      {/* Page title */}
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 2, background: '#1a56a0' }} />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 26, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0b2948' }}>Statistics</span>
          <div style={{ width: 40, height: 2, background: '#1a56a0' }} />
        </div>
      </div>

      {/* Row 1: Top Performance Male | Female */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        {card(<>{cardHeader('Top Performance · Men', `Best Performances by ${country.name} Male Swimmers (FINA Points)`)}{maleTop.length ? topPerfTable(maleTop) : <Empty label="No data" />}</>)}
        {card(<>{cardHeader('Top Performance · Women', `Best Performances by ${country.name} Female Swimmers (FINA Points)`)}{femaleTop.length ? topPerfTable(femaleTop) : <Empty label="No data" />}</>)}
      </div>

      {/* Row 2: Participation | Championships Hosted | Most Participated */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        {card(<>
          {cardHeader('Participation', 'Total Participations by Competition')}
          {participationList.length === 0 ? <Empty label="No data" /> : participationList.map(([cls, n]) => barRow(cls, n, maxPart))}
        </>)}
        {card(<>
          {cardHeader('Championships Hosted', 'Number of Championships Hosted')}
          {hosted.length === 0 ? <Empty label="None" /> : (() => {
            const counts = {}
            hosted.forEach((c) => { const k = c.classification || 'Other'; counts[k] = (counts[k] || 0) + 1 })
            const list = Object.entries(counts).sort((a, b) => b[1] - a[1])
            const mx = Math.max(...list.map(([, n]) => n), 1)
            return list.map(([cls, n]) => barRow(cls, n, mx))
          })()}
        </>)}
        {card(<>
          {cardHeader('Most Participated Swimmer', `Top 5 ${country.name} Swimmers by International Participations`)}
          <div style={{ display: 'flex', gap: 8, ...thStyle, padding: '0 0 6px' }}>
            <span style={{ width: 24 }}>#</span>
            <span style={{ flex: 1 }}>Swimmer</span>
            <span style={{ width: 90, textAlign: 'right' }}>Participations</span>
          </div>
          {(profile.most_participated?.length ? profile.most_participated : topSwimmers).slice(0, 5).map((s, i) => (
            <div key={s.id} style={rowStyle(i)}>
              <span style={badge}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 12.5, color: '#0b2948', display: 'flex', alignItems: 'center', gap: 6 }}><Flag code={s.nationality_code || country.code} /><SwimmerLink id={s.id} name={s.name} /></span>
              <span className="asw-num" style={{ width: 90, textAlign: 'right', fontWeight: 900, fontSize: 14, color: '#0b2948' }}>{s.championships_count ?? '—'}</span>
            </div>
          ))}
        </>)}
      </div>

      {/* Row 3: Medals | Most Male Decorated | Most Female Decorated */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        {card(<>
          {cardHeader('Medals', 'Total Medals by Competition')}
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 11 }}>
            {[['Gold', '#d4af37'], ['Silver', '#a8a9ad'], ['Bronze', '#cd7f32']].map(([lbl, c]) => (
              <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: c, display: 'inline-block' }} />{lbl}
              </span>
            ))}
          </div>
          {(() => {
            const maxTotal = Math.max(...medalBoxes.map((m) => m.total), 1)
            return medalBoxes.map((m) => (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 }}>
                <span style={{ width: 88, fontSize: 11.5, fontWeight: 700, flexShrink: 0, color: '#374151' }}>{m.name}</span>
                <div style={{ flex: 1, height: 20, display: 'flex', background: '#e8eef6', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(m.total / maxTotal) * 100}%`, display: 'flex', minWidth: m.total > 0 ? 20 : 0 }}>
                    {[['gold', '#d4af37'], ['silver', '#a8a9ad'], ['bronze', '#cd7f32']].map(([key, color]) =>
                      m[key] > 0 && <div key={key} style={{ flex: m[key], background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 10, minWidth: 14 }} className="asw-num">{m[key]}</div>
                    )}
                  </div>
                </div>
                <span className="asw-num" style={{ width: 26, textAlign: 'right', fontWeight: 900, color: '#0b2948', fontSize: 13, flexShrink: 0 }}>{m.total}</span>
              </div>
            ))
          })()}
        </>)}
        {card(<>{cardHeader('Most Decorated · Men', `Top 5 ${country.name} Male Swimmers by Total Medals`)}{maleMedalists.length ? decoratedTable(maleMedalists) : <Empty label="No data" />}</>)}
        {card(<>{cardHeader('Most Decorated · Women', `Top 5 ${country.name} Female Swimmers by Total Medals`)}{femaleMedalists.length ? decoratedTable(femaleMedalists) : <Empty label="No data" />}</>)}
      </div>

      {/* Row 4: Last Male Record | Last Female Record | Most Male Recordan | Most Femal Recordan */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        {recCard4(lastMR, 'Last Male Record', `Most Recent ${country.name} Male Record`, false)}
        {recCard4(lastFR, 'Last Female Record', `Most Recent ${country.name} Female Record`, false)}
        {recCard4(topMaleRec, 'Most Male Recordman', `Top ${country.name} Male Swimmers by Records`, true)}
        {recCard4(topFemaleRec, 'Most Female Recordman', `Top ${country.name} Female Swimmers by Records`, true)}
      </div>

      {/* Row 5: Performance Index (dark bg) | Country Battle */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        {/* Performance Index */}
        <div style={{ background: '#fff', borderRadius: 6, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', border: '1px solid #dde3ea' }}>
          {cardHeader('Performance Index', `Distribution of ${country.name} Swimmers by Performance Level`)}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 180, marginTop: 10 }}>
            {perfDist.map((d, i) => (
              <div key={d.label} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                {d.count > 0 && <div className="asw-num" style={{ fontSize: 11, fontWeight: 900, marginBottom: 4, color: '#0b2948' }}>{d.count}</div>}
                <div style={{ width: '75%', height: `${Math.max(4, (d.count / maxPerf) * 140)}px`, background: PERF_BAR_COLORS[i], borderRadius: '3px 3px 0 0' }} />
                <div style={{ fontSize: 7.5, marginTop: 6, lineHeight: 1.2, color: '#5a6b80', fontWeight: 700, wordBreak: 'break-word' }}>{d.label}</div>
                <div style={{ fontSize: 6.5, color: '#9baab8', marginTop: 1 }}>({d.range})</div>
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
                  <span style={{ width: 96, fontSize: 11.5, fontWeight: mine ? 900 : 600, flexShrink: 0, color: mine ? '#1a56a0' : '#374151', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    <Flag code={b.code} />{b.name}
                  </span>
                  <div style={{ flex: 1, height: 18, background: '#e8eef6', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(b.count / mx) * 100}%`, height: '100%', background: mine ? '#1a56a0' : '#9db8d6', borderRadius: 3, minWidth: b.count > 0 ? 8 : 0 }} />
                  </div>
                  <span className="asw-num" style={{ width: 24, textAlign: 'right', fontWeight: 800, color: '#0b2948', fontSize: 13, flexShrink: 0 }}>{b.count}</span>
                </div>
              )
            })
          })()}
        </>)}
      </div>
    </div>
  )
}

export default function CountryProfile() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'overview'
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

  useEffect(() => {
    let alive = true
    getCoaches({ country: id })
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
  }, [profile])

  useEffect(() => {
    let alive = true
    const unwrap = (r) => (Array.isArray(r.data) ? r.data : r.data?.results || [])
    getArticles({ country: id, status: 'PUBLISHED', ordering: '-published_at' })
      .then((r) => {
        const mine = unwrap(r)
        if (mine.length) { if (alive) setOvNews(mine.slice(0, 4)); return null }
        return getArticles({ status: 'PUBLISHED', ordering: '-published_at' })
          .then((r2) => alive && setOvNews(unwrap(r2).slice(0, 4)))
      })
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
    getCountryProfile(id)
      .then((res) => alive && setProfile(res.data))
      .catch(() => alive && setProfile(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    if (!profile) return
    let alive = true; setProgLoading(true)
    getCountryProgression(id, { stroke: progStroke, pool: progPool })
      .then((res) => alive && setProgLines(Array.isArray(res.data) ? res.data : []))
      .catch(() => alive && setProgLines([]))
      .finally(() => alive && setProgLoading(false))
    return () => { alive = false }
  }, [id, profile, progStroke, progPool])

  if (loading) return <Loading label="Loading federation profile" />
  if (!profile?.country) return <Empty label="Federation not found" />

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
    return Object.values(byName).sort((a, b) => (b.total - a.total) || (orderOf(a.name) - orderOf(b.name)))
  })()

  return (
    <div>
      {/* ===== ISF-style federation header: circular flag logo + info left,
             swimmer action photo blended into the right half ===== */}
      {(() => {
        const photoCandidates = [
          ...topSwimmers.map((s) => s.photo),
          ...topMedalists.map((s) => s.photo),
          ...records.map((r) => r.swimmer_photo),
        ]
        const navy = '#0c2340'
        const customFlag = flagImage(country.code)
        const alpha2 = flagAlpha2(country.code)
        const icon = (d) => (
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a56a0', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
          </span>
        )
        const contactRow = (ic, content) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, fontWeight: 600, color: navy }}>
            {ic}{content}
          </div>
        )
        return (
          <div className="rule-b" style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(120deg, #eef5fc 0%, #f6fafe 45%, #dcecf9 100%)' }}>
            <style>{`
              @media (max-width: 760px) {
                .fed-hero-photo { display: none; }
                .fed-hero-flag { width: 108px !important; height: 108px !important; }
              }
            `}</style>
            {/* swimmer photo blended on the right — auto-picked by resolution/aspect;
                falls back to high-res news action shots when swimmer photos are tiny */}
            <FedHeroPhoto candidates={photoCandidates} extras={ovNews.map((a) => a?.cover_image)} />
            <div style={{ position: 'relative', padding: '20px 32px 30px' }}>
              <Link to="/countries" style={{ fontSize: 12, textDecoration: 'none', fontWeight: 700, color: '#1a56a0' }}>← All federations</Link>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 26, marginTop: 16, flexWrap: 'wrap' }}>
                {/* Circular federation logo = country flag */}
                <div className="fed-hero-flag" style={{
                  width: 148, height: 148, borderRadius: '50%', background: '#fff', flexShrink: 0,
                  border: `4px solid ${navy}`, boxShadow: '0 0 0 6px #fff, 0 6px 24px rgba(12,35,64,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {customFlag ? (
                    <img src={customFlag} alt={country.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : alpha2 ? (
                    <span className={`fi fi-${alpha2}`} role="img" aria-label={country.name}
                      style={{ width: '100%', height: '100%', display: 'block', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  ) : (
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 34, color: navy }}>{country.code}</span>
                  )}
                </div>
                <div style={{ minWidth: 260, maxWidth: 560 }}>
                  <h1 style={{
                    margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 900,
                    fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.04, letterSpacing: '-0.02em',
                    color: navy, textTransform: 'uppercase',
                  }}>
                    {country.name}<br />Swimming Federation
                  </h1>
                  <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: '#1a56a0' }}>
                    {country.federation_tagline || 'Excellence in Water, Unity in Sport'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
                    {country.federation_phone && contactRow(
                      icon(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />),
                      <span className="asw-num">{country.federation_phone}</span>)}
                    {country.federation_email && contactRow(
                      icon(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>),
                      <span>{country.federation_email}</span>)}
                    {country.federation_website && contactRow(
                      icon(<><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>),
                      <a href={/^https?:/.test(country.federation_website) ? country.federation_website : `https://${country.federation_website}`}
                        target="_blank" rel="noreferrer" style={{ color: navy, textDecoration: 'none' }}>
                        {country.federation_website.replace(/^https?:\/\//, '')}
                      </a>)}
                    {contactRow(
                      icon(<><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></>),
                      <span>{country.federation_address || country.name}</span>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Tab bar */}
      <div className="rule-b" style={{ padding: '0 32px', display: 'flex', gap: 0, overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t.value} type="button" onClick={() => setTab(t.value)}
            style={{
              padding: '12px 16px', background: 'none', border: 'none', borderBottom: tab === t.value ? '3px solid var(--color-accent)' : '3px solid transparent',
              cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: tab === t.value ? 800 : 600,
              fontSize: 13, color: tab === t.value ? 'var(--color-accent)' : 'var(--color-text)', whiteSpace: 'nowrap',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== OVERVIEW ===== */}
      {tab === 'overview' && (() => {
        const bestPerf = topSwimmers[0]
        const topMedalist = topMedalists[0]
        const newestRecord = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
        // 5 distinct holders (dedupe duplicate DB swimmers by normalized name),
        // varied events, Long Course first — like the ISF reference.
        const nameKey = (n) => (n || '').toLowerCase().replace(/\d+/g, '').trim().split(/\s+/).sort().join(' ')
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
        const usDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''
        const hCard = { background: '#fff', borderRadius: 14, display: 'flex', gap: 14, padding: 10, boxShadow: '0 3px 12px rgba(11,41,72,.08)', position: 'relative' }
        const hPhoto = { width: 150, height: 152, borderRadius: 10, background: 'linear-gradient(135deg, #d6e4f0, #e2eaf3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 46, color: '#8a9bb5', flexShrink: 0 }
        const hBody = { padding: '12px 8px 10px 2px', flex: 1, display: 'flex', flexDirection: 'column' }
        const hTitle = { fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 15, letterSpacing: '0.02em', textTransform: 'uppercase', color: '#0b2948', marginBottom: 7, lineHeight: 1.3 }
        const hBig = { fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 29, color: '#1a56a0', letterSpacing: '-0.02em', lineHeight: 1.1 }
        const hSub = { fontSize: 12.5, color: '#33415c', marginTop: 4 }
        // small blue bar-chart icon like the reference
        const barsIcon = (
          <span style={{ position: 'absolute', right: 16, bottom: 14, display: 'inline-flex', alignItems: 'flex-end', gap: 2.5 }}>
            {[7, 12, 17, 22].map((h, k) => <span key={k} style={{ width: 4.5, height: h, background: '#1a56a0', borderRadius: 1.5, display: 'inline-block' }} />)}
          </span>
        )
        const taperL = { width: 130, height: 3, background: 'linear-gradient(to left, #0d2d5e, rgba(13,45,94,0))', transform: 'skewX(-30deg)' }
        const taperR = { width: 130, height: 3, background: 'linear-gradient(to right, #0d2d5e, rgba(13,45,94,0))', transform: 'skewX(-30deg)' }
        const secTitle = (text) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, margin: '26px 0 22px' }}>
            <div style={taperL} />
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 25, letterSpacing: '0.02em', textTransform: 'uppercase', color: '#123a7d', margin: 0, whiteSpace: 'nowrap' }}>{text}</h3>
            <div style={taperR} />
          </div>
        )
        const newsItems = ovNews.length > 0 ? ovNews : [null, null, null, null]
        return (
          <div style={{ padding: '0 28px 32px', background: '#eaf1f9' }}>
            {/* Main layout: News left + Highlights right */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 352px', gap: 24, alignItems: 'start', paddingTop: 18 }}>
              {/* LEFT: Latest News */}
              <div>
                <div style={{ textAlign: 'center', marginBottom: 2 }}><span style={{ fontSize: 22, color: '#123a7d' }}>🏊</span></div>
                {secTitle('Latest News')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                  {newsItems.map((a, i) => {
                    const inner = (
                      <>
                        <div style={{ position: 'relative', margin: 10, height: 200, borderRadius: 8, overflow: 'hidden', background: a?.cover_image ? '#0b2948' : 'linear-gradient(135deg, #c8d8e8, #dde6f0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: '#8a9bb5', flex: 'none' }}>
                          {a?.cover_image ? (
                            <>
                              <img src={a.cover_image} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(20px)', transform: 'scale(1.15)', opacity: 0.5 }} />
                              <img src={a.cover_image} alt="" style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain' }} />
                            </>
                          ) : '📷'}
                        </div>
                        <div style={{ padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', flex: 1, textAlign: 'left' }}>
                          <div style={{ fontSize: 12, color: '#1a56a0', fontWeight: 600, marginBottom: 9 }}>{a ? usDate(a.published_at || a.created_at) : 'Coming soon'}</div>
                          <div style={{ fontSize: 14.5, color: '#0b2948', fontWeight: 700, lineHeight: 1.5 }}>{a ? a.title : 'Federation news will appear here'}</div>
                          <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12.5, color: '#0b2948', fontWeight: 700 }}>Read more</span>
                            <span style={{ color: '#1a56a0', fontWeight: 800 }}>→</span>
                          </div>
                        </div>
                      </>
                    )
                    const cardStyle = { borderRadius: 12, overflow: 'hidden', background: '#fdfeff', boxShadow: '0 3px 12px rgba(11,41,72,.07)', display: 'flex', flexDirection: 'column', minHeight: 425, textDecoration: 'none' }
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
                  const evCard = { borderRadius: 12, background: '#fdfeff', boxShadow: '0 3px 12px rgba(11,41,72,.07)', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 150, position: 'relative' }
                  const evKick = { fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#123a7d' }
                  const evTitle = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 19, color: '#0b2948', lineHeight: 1.3 }
                  const badge = (bg, text) => (
                    <span style={{ position: 'absolute', right: 18, top: 18, fontSize: 11, fontWeight: 800, background: bg, color: '#fff', padding: '4px 12px', borderRadius: 14, letterSpacing: '0.05em' }}>{text}</span>
                  )
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
                      <div style={evCard}>
                        <div style={evKick}>Current Event</div>
                        {current ? (
                          <>
                            {badge('#0d7a52', `LIVE · DAY ${dayNum}`)}
                            <div style={evTitle}>{current.championship ? <Link to={`/meets/${current.championship}`} style={{ color: 'inherit' }}>{current.title}</Link> : current.title}</div>
                            <div style={hSub}>{range(current)}</div>
                            {current.description && <div style={{ ...hSub, color: '#5a6b80' }}>{current.description}</div>}
                          </>
                        ) : (
                          <>
                            <div style={{ ...evTitle, color: '#8a9bb5', fontWeight: 700 }}>No event currently running</div>
                            <div style={hSub}>Live events will appear here during championships</div>
                          </>
                        )}
                      </div>
                      <div style={evCard}>
                        <div style={evKick}>Upcoming Event</div>
                        {upcoming ? (
                          <>
                            {badge('#123a7d', daysUntil === 1 ? 'TOMORROW' : `IN ${daysUntil} DAYS`)}
                            <div style={evTitle}>{upcoming.championship ? <Link to={`/meets/${upcoming.championship}`} style={{ color: 'inherit' }}>{upcoming.title}</Link> : upcoming.title}</div>
                            <div style={hSub}>{range(upcoming)}</div>
                            {upcoming.description && <div style={{ ...hSub, color: '#5a6b80' }}>{upcoming.description}</div>}
                          </>
                        ) : (
                          <>
                            <div style={{ ...evTitle, color: '#8a9bb5', fontWeight: 700 }}>No upcoming events scheduled</div>
                            <div style={hSub}>Check the calendar for future championships</div>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* RIGHT: Highlight cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Best Season Performance */}
                <div style={hCard}>
                  <div style={{ ...hPhoto, overflow: 'hidden' }}>
                    {bestPerf?.photo ? <img src={mediaUrl(bestPerf.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : '🏊'}
                  </div>
                  <div style={hBody}>
                    <div style={hTitle}>Best Season<br />Performance</div>
                    <div style={hBig}>{bestPerf?.best_time || '—'}</div>
                    <div style={hSub}>{bestPerf?.best_event || ''}</div>
                    <div style={{ ...hSub, fontWeight: 700, color: '#0b2948' }}>{bestPerf?.name || ''}</div>
                    {bestPerf?.championship && <div style={{ ...hSub, color: '#5a6b80' }}>{bestPerf.championship}</div>}
                  </div>
                  {barsIcon}
                </div>

                {/* Most Decorated Swimmer */}
                <div style={hCard}>
                  <div style={{ ...hPhoto, overflow: 'hidden' }}>
                    {topMedalist?.photo ? <img src={mediaUrl(topMedalist.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : '🏊'}
                  </div>
                  <div style={hBody}>
                    <div style={hTitle}>Most Decorated<br />Swimmer</div>
                    <div style={hBig}>{topMedalist?.total || 0}</div>
                    <div style={hSub}>Total Medals</div>
                    <div style={{ ...hSub, fontWeight: 700, color: '#0b2948' }}>{topMedalist?.name || '—'}</div>
                  </div>
                  <span style={{ position: 'absolute', right: 14, bottom: 12, fontSize: 24 }}>🏆</span>
                </div>

                {/* New Record */}
                <div style={hCard}>
                  <div style={{ ...hPhoto, overflow: 'hidden' }}>
                    {newestRecord?.swimmer_photo ? <img src={mediaUrl(newestRecord.swimmer_photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : '🏊'}
                  </div>
                  <div style={hBody}>
                    <div style={hTitle}>New Record</div>
                    <div style={hBig}>{newestRecord?.time || '—'}</div>
                    <div style={hSub}>{newestRecord?.event || ''}</div>
                    <div style={{ ...hSub, fontWeight: 700, color: '#0b2948' }}>{newestRecord?.swimmer || ''}</div>
                    {newestRecord?.date && <div style={hSub}>{usDate(newestRecord.date)}</div>}
                  </div>
                  {newestRecord && <span style={{ position: 'absolute', right: 14, bottom: 14, fontSize: 11, fontWeight: 800, background: '#0d2d5e', color: '#fff', padding: '4px 12px', borderRadius: 14, letterSpacing: '0.04em' }}>NEW</span>}
                </div>

                {/* Trending Swimmer — biggest Arab-ranking climber (last 6 months) */}
                {(() => {
                  const t = profile.trending
                  if (!t) {
                    return (
                      <div style={hCard}>
                        <div style={hPhoto}>🏊</div>
                        <div style={hBody}>
                          <div style={hTitle}>Quick Stats</div>
                          <div style={hBig}>{formatNumber(profile.stats?.swimmers)}</div>
                          <div style={hSub}>Total Swimmers</div>
                          <div style={{ ...hSub, marginTop: 6 }}>{formatNumber(profile.stats?.medals)} Medals · {formatNumber(profile.stats?.records)} Records</div>
                        </div>
                        {barsIcon}
                      </div>
                    )
                  }
                  const up = t.is_new || (t.delta ?? 0) > 0
                  const col = up ? '#0d7a52' : '#a8402f'
                  return (
                    <div style={hCard}>
                      <div style={{ ...hPhoto, overflow: 'hidden' }}>
                        {t.photo
                          ? <img src={mediaUrl(t.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                          : '🏊'}
                      </div>
                      <div style={hBody}>
                        <div style={hTitle}>Trending<br />Swimmer</div>
                        <div style={{ ...hBig, color: col, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {t.is_new ? 'NEW' : `${t.delta > 0 ? '+' : ''}${t.delta}`}
                          {!t.is_new && (
                            <span style={{ fontSize: 17, lineHeight: 1 }}>{up ? '▲' : '▼'}</span>
                          )}
                        </div>
                        <div style={hSub}>
                          Arab ranking #{t.rank}{t.is_new ? ' · new entry' : ` · was #${t.prev_rank}`}
                        </div>
                        <div style={{ ...hSub, fontWeight: 700, color: '#0b2948' }}>
                          <SwimmerLink id={t.id} name={t.name} />
                        </div>
                        {t.best_event && (
                          <div style={hSub}>{t.best_event} · {t.best_time}{t.fina ? ` · ${t.fina} pts` : ''}</div>
                        )}
                      </div>
                      <span style={{ position: 'absolute', right: 16, bottom: 14, fontSize: 20 }}>{up ? '📈' : '📉'}</span>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* National Record Holders */}
            {secTitle('National Record Holders')}
            {/* Auto-scrolling ticker — track duplicated for a seamless loop, pauses on hover */}
            <div className="asw-ticker" style={{ overflow: 'hidden', padding: '4px 0 10px' }}>
              <div className="asw-ticker-track" style={{ display: 'flex', width: 'max-content', animationDuration: `${Math.max(topRecords.length * 5, 25)}s` }}>
              {[...topRecords, ...topRecords].map((r, i) => (
                <div key={i} style={{ width: 235, marginRight: 18, flexShrink: 0, borderRadius: 12, overflow: 'hidden', textAlign: 'center', background: '#fdfeff', boxShadow: '0 3px 12px rgba(11,41,72,.07)', display: 'flex', flexDirection: 'column' }}>
                  {/* Circular photo with navy ring */}
                  <div style={{ padding: '24px 0 8px' }}>
                    <div style={{ width: 165, height: 165, borderRadius: '50%', background: 'linear-gradient(180deg, #dfe8f1, #c6d4e2)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, color: '#8a9bb5', border: '4px solid #0d2d5e', boxShadow: '0 3px 10px rgba(0,0,0,.12)', overflow: 'hidden' }}>
                      {r.swimmer_photo ? <img src={mediaUrl(r.swimmer_photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : '🏊'}
                    </div>
                  </div>
                  <div style={{ padding: '12px 12px 0' }}>
                    <div style={{ fontWeight: 800, fontSize: 17, color: '#0b2948' }}><SwimmerLink id={r.swimmer_id} name={r.swimmer} /></div>
                    <div style={{ fontSize: 13.5, color: '#33415c', marginTop: 8, lineHeight: 1.55 }}>{r.event}<br />{r.pool === 'SCM' ? 'Short Course' : 'Long Course'}</div>
                  </div>
                  {/* Navy footer with time */}
                  <div style={{ background: '#123a7d', color: '#fff', padding: '13px 10px 15px', margin: '18px 10px 10px', marginTop: 'auto', borderRadius: 8 }}>
                    <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 25, letterSpacing: '-0.01em' }}>{r.time}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3, opacity: 0.92 }}>National Record</div>
                  </div>
                </div>
              ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ===== BOARD ===== */}
      {tab === 'board' && (
        <div style={{ padding: '0 28px 28px', background: '#fff' }}>
          {/* Title */}
          <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 4 }}>
            <span style={{ fontSize: 24 }}>👥</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 10 }}>
            <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 24, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0b2948', margin: 0 }}>Board of Directors</h2>
            <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
          </div>
          <p style={{ textAlign: 'center', fontSize: 13, color: '#6b7d94', maxWidth: 500, margin: '0 auto 28px', lineHeight: 1.5 }}>
            The Board of Directors is responsible for the strategic direction, governance, and overall leadership of the {country.name} Swimming Federation.
          </p>

          {/* Board member cards — real data when the national team has board
              members registered, ISF-style placeholders otherwise */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
            {(boardMembers.length
              ? boardMembers.map((m) => ({ role: m.role || 'Member', name: m.name, photo: m.photo }))
              : ['President', 'Vice President', 'Treasurer', 'Secretary General', 'Technical Director',
                 'Member', 'Member', 'Member', 'Member', 'Member'].map((role) => ({ role, name: '—', photo: null }))
            ).map(({ role, name, photo }, i) => (
              <div key={i} style={{ borderRadius: 16, textAlign: 'center', background: '#fff', border: '1px solid #e2e9f2', boxShadow: '0 2px 12px rgba(11,41,72,.08)', padding: '14px 14px 20px', display: 'flex', flexDirection: 'column', minHeight: 370 }}>
                <div style={{ width: '100%', aspectRatio: '1 / 1.05', borderRadius: 12, background: photo ? `url(${photo}) center/cover` : 'linear-gradient(180deg, #e9eef4, #d4dde8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: '#8a9bb5' }}>{photo ? '' : '👤'}</div>
                <div style={{ paddingTop: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 17, color: '#0b2948' }}>{name}</div>
                  <div style={{ fontSize: 13.5, color: '#1a56a0', fontWeight: 600, marginTop: 6 }}>{role}</div>
                </div>
                <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0d2d5e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', boxShadow: '0 2px 6px rgba(11,41,72,.25)' }}>
                      <div style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '10px solid #fff', marginLeft: 3 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 20 }}>
                      {[7, 12, 5, 15, 9, 17, 6, 13, 8, 16, 5, 11, 14, 7, 18, 10, 5, 13, 7, 15, 9, 6, 12, 8].map((h, k) => (
                        <span key={k} style={{ width: 2, height: h, background: '#0d2d5e', borderRadius: 2, display: 'inline-block' }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#0b2948', fontWeight: 600, marginTop: 8 }}>Listen to message</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== TEAM (Swimmers) ===== */}
      {tab === 'team' && (() => {
        const secTitle = (icon, text) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '28px 0 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>{icon}</span>
              <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
            </div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0b2948', margin: 0 }}>{text}</h3>
            <div style={{ width: 50, height: 2, background: '#1a56a0' }} />
          </div>
        )
        const swimmerCard = (s) => (
          <div key={s.id} style={{ borderRadius: 12, overflow: 'hidden', textAlign: 'center', background: '#fff', border: '1px solid #e2e9f2', boxShadow: '0 2px 12px rgba(11,41,72,.08)', padding: '14px 10px 12px', display: 'flex', flexDirection: 'column' }}>
            {/* Circular photo with navy ring */}
            <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'linear-gradient(180deg, #dfe8f1, #c6d4e2)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 46, color: '#8a9bb5', border: '3px solid #0d2d5e', boxShadow: '0 3px 10px rgba(11,41,72,.14)', overflow: 'hidden' }}>
              {s.photo ? <img src={mediaUrl(s.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : '🏊'}
            </div>
            {/* Info */}
            <div style={{ padding: '10px 2px 0' }}>
              <div style={{ fontWeight: 800, fontSize: 14.5, color: '#0b2948', marginBottom: 5, lineHeight: 1.25 }}>
                <SwimmerLink id={s.id} name={s.name} />
              </div>
              <div style={{ fontSize: 11.5, color: '#33415c', fontWeight: 500, lineHeight: 1.5 }}>
                {s.sex === 'F' ? "Women's" : "Men's"}
              </div>
            </div>
            <div style={{ marginTop: 'auto', paddingTop: 9, borderTop: '1px solid #eef2f7' }}>
              <Link to={`/swimmers/${s.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: '#0b2948', fontWeight: 700, textDecoration: 'none', padding: '0 2px' }}>
                <span>View Profile</span><span style={{ color: '#1a56a0' }}>→</span>
              </Link>
            </div>
          </div>
        )
        const waveHeights = [7, 12, 5, 15, 9, 17, 6, 13, 8, 16, 5, 11, 14, 7, 18, 10, 5, 13, 7, 15, 9, 6, 12, 8]
        const coachCard = ({ role, name, photo }, i) => (
          <div key={i} style={{ borderRadius: 16, textAlign: 'center', background: '#fff', border: '1px solid #e2e9f2', boxShadow: '0 2px 12px rgba(11,41,72,.08)', padding: '14px 14px 20px', display: 'flex', flexDirection: 'column', minHeight: 370 }}>
            <div style={{ width: '100%', aspectRatio: '1 / 1.05', borderRadius: 12, background: photo ? `url(${photo}) center/cover` : 'linear-gradient(180deg, #e9eef4, #d4dde8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: '#8a9bb5' }}>{photo ? '' : '👤'}</div>
            <div style={{ paddingTop: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#0b2948' }}>{name}</div>
              <div style={{ fontSize: 13.5, color: '#1a56a0', fontWeight: 600, marginTop: 6 }}>{role}</div>
            </div>
            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0d2d5e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', boxShadow: '0 2px 6px rgba(11,41,72,.25)' }}>
                  <div style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '10px solid #fff', marginLeft: 3 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 20 }}>
                  {waveHeights.map((h, k) => (
                    <span key={k} style={{ width: 2, height: h, background: '#0d2d5e', borderRadius: 2, display: 'inline-block' }} />
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#0b2948', fontWeight: 600, marginTop: 8 }}>Listen to message</div>
            </div>
          </div>
        )
        return (
          <div style={{ padding: '0 28px 28px', background: '#eef3f9' }}>
            <SubTabs options={[['coaches', 'Coaches'], ['swimmers', 'Swimmers']]} value={teamSub} onChange={setTeamSub} />
            {teamSub === 'coaches' && (<>
              {secTitle('👤', 'Coaches')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
                {(countryCoaches.length
                  ? countryCoaches.map((c) => ({ role: COACH_LEVELS[c.level] || c.level || 'Coach', name: c.name, photo: c.photo }))
                  : ['Head Coach', 'Assistant Coach', 'Swimming Coach', 'Conditioning Coach'].map((role) => ({ role, name: '—', photo: null }))
                ).map(coachCard)}
              </div>
            </>)}
            {teamSub === 'swimmers' && (<>
              {secTitle('🏊', 'Swimmers')}
              {topSwimmers.length === 0 ? <Empty label="No swimmers" /> : (
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
                    <button type="button" onClick={() => setOpenChamp(isOpen ? null : c.id)}
                      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 0', background: 'none', border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', color: 'inherit' }}>
                      <span style={{ flex: 1, minWidth: 220 }}><span style={{ fontWeight: 600, display: 'block' }}>{c.name}</span><span className="text-muted" style={{ fontSize: 12 }}>{formatDate(c.date)} · {c.pool}{c.location ? ` · ${c.location}` : ''}</span></span>
                      <span className="asw-num text-muted" style={{ fontSize: 12 }}>{c.swimmers_count} swimmers · {c.results_count} results</span>
                      {c.medals?.total > 0 && <span className="asw-num" style={{ fontSize: 12, display: 'inline-flex', gap: 8 }}>{c.medals.gold > 0 && <span style={{ color: 'var(--asw-gold)', fontWeight: 800 }}>{c.medals.gold}G</span>}{c.medals.silver > 0 && <span style={{ color: 'var(--asw-silver)', fontWeight: 800 }}>{c.medals.silver}S</span>}{c.medals.bronze > 0 && <span style={{ color: 'var(--asw-bronze)', fontWeight: 800 }}>{c.medals.bronze}B</span>}</span>}
                      <span className="micro">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 0 16px' }}>
                        <Link to={`/meets/${c.id}`} style={{ fontSize: 12 }}>View full meet details →</Link>
                        {Array.isArray(c.swimmers) && c.swimmers.length > 0 && (
                          <><div className="micro" style={{ margin: '12px 0 6px' }}>Athletes · {c.swimmers.length}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '2px 16px' }}>
                            {c.swimmers.map((s) => (<Link key={s.id} to={`/swimmers/${s.id}`} style={{ color: 'inherit', textDecoration: 'none', fontSize: 13, padding: '2px 0' }}>{s.name} <span className="text-muted" style={{ fontSize: 11 }}>{s.sex === 'F' ? 'W' : 'M'}</span></Link>))}
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
          countryId={id}
          className={mclass}
          box={medalBoxes.find((m) => m.name === mclass)}
          onBack={() => setSearchParams({ tab: 'medals' }, { replace: true })}
        />
      )}
      {tab === 'medals' && !mclass && (
        <div className="pad-lg">
          <SectHead title="Medal Tally by Competition" />
          {(() => {
            // Every classification is always clickable — zero-medal ones
            // included — so each drill-down's country standings can be seen.
            const ALL_CLASSES = ['Olympic', 'World', 'Arab', 'National', 'Islamic',
              'GCC', 'Asian', 'African', 'Mediterranean', 'Other']
            const byName = {}
            medalBoxes.forEach((m) => { byName[m.name] = m })
            const boxes = [
              ...medalBoxes,
              ...ALL_CLASSES.filter((n) => !byName[n])
                .map((n) => ({ name: n, gold: 0, silver: 0, bronze: 0, total: 0 })),
            ]
            return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
              {boxes.map((m) => (
                <div
                  key={m.name}
                  onClick={() => setSearchParams({ tab: 'medals', mclass: m.name })}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSearchParams({ tab: 'medals', mclass: m.name }) }}
                  style={{ background: CLASS_COLORS[m.name] || 'var(--color-accent)', color: '#fff', padding: '12px 18px', minWidth: 150, flex: '1 1 150px', maxWidth: 240, cursor: 'pointer', position: 'relative' }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.75 }}>{m.name}</div>
                  <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, lineHeight: 1.1, marginTop: 2 }}>{formatNumber(m.total)}</div>
                  <div className="asw-num" style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12, fontWeight: 700 }}>
                    <span style={{ color: 'var(--asw-gold)' }}>{m.gold}G</span>
                    <span style={{ color: 'var(--asw-silver)' }}>{m.silver}S</span>
                    <span style={{ color: '#e3a869' }}>{m.bronze}B</span>
                  </div>
                  <span style={{ position: 'absolute', right: 12, bottom: 12, fontSize: 11, fontWeight: 700, opacity: 0.85 }}>Details →</span>
                </div>
              ))}
            </div>
            )
          })()}
          <SectHead title={`Top Medalists · ${topMedalists.length}`} />
          {topMedalists.length === 0 ? <Empty label="No medals" /> : (
            <div className="table-scroll"><table className="table"><thead><tr><th style={{ width: 30 }}>#</th><th>Swimmer</th><th className="num">G</th><th className="num">S</th><th className="num">B</th><th className="num">Total</th></tr></thead><tbody>
              {topMedalists.map((m, i) => (<tr key={m.id ?? i}><td className="asw-num">{i + 1}</td><td><SwimmerLink id={m.id} name={m.name} /></td><td className="num asw-num" style={{ fontWeight: 800, color: 'var(--asw-gold)' }}>{m.gold}</td><td className="num asw-num">{m.silver}</td><td className="num asw-num">{m.bronze}</td><td className="num asw-num" style={{ fontWeight: 800 }}>{m.total}</td></tr>))}
            </tbody></table></div>
          )}
        </div>
      )}

      {/* ===== CLUBS ===== */}
      {tab === 'clubs' && (
        <div className="pad-lg">
          <SectHead title={`Clubs & Teams · ${teams.length}`} />
          {teams.length === 0 ? <Empty label="No clubs registered" /> : (
            <div>{teams.map((t) => (
              <Link key={t.id} to={`/teams/${t.id}`} className="hair-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', color: 'inherit', textDecoration: 'none' }}>
                <span style={{ fontWeight: 600 }}>{t.name}</span>
                {t.is_national_team && <span className="tag tag-dark">National team</span>}
              </Link>
            ))}</div>
          )}
        </div>
      )}

      {/* ===== ACADEMIES ===== */}
      {tab === 'academies' && <AcademiesTab countryId={id} />}

      {/* ===== COMPARE ===== */}
      {tab === 'compare' && <CompareTab profile={profile} country={country} />}

      {/* ===== QUALIFYING ===== */}
      {tab === 'qualifying' && <QualifyingTab countryId={id} qualSub={qualSub} setQualSub={setQualSub} />}

      {/* ===== DATA TABS ===== */}
      {tab === 'news' && <NewsTab countryId={id} countryName={country.name} />}
      {tab === 'ranking' && <RankingTab countryId={id} />}
      {tab === 'pools' && <PoolsTab hosted={hosted} countryName={country.name} />}
      {tab === 'prediction' && <PredictionTab countryName={country.name} />}
      {tab === 'multimedia' && <MultimediaTab champIds={new Set([...hosted, ...participated].map((c) => c.id))} champNames={[...hosted, ...participated].map((c) => c.name)} countryName={country.name} />}
      {tab === 'archives' && <ArchivesTab hosted={hosted} participated={participated} countryName={country.name} />}
    </div>
  )
}
