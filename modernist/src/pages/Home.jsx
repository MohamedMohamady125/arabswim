import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, MapPin, Droplets } from 'lucide-react'
import { getQuickStats, getLiveMeets } from '../api/championships'
import { getNewRecords } from '../api/records'
import QuickStatsView from '../components/QuickStatsView'
import Flag from '../components/Flag'
import { Loading, Empty, SectHead } from '../components/ui'
import { useFeatures } from '../context/FeaturesContext'
import { formatDate, formatDateRange, poolLabel } from '../utils'

const GOLD = 'var(--asw-gold)'
const list = (d) => (Array.isArray(d) ? d : d?.results || [])

const RECORD_NAME = { ARAB: 'Arab record', GCC: 'GCC record', NATIONAL: 'National record' }

export default function Home() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [liveMeets, setLiveMeets] = useState([])
  const [newRecords, setNewRecords] = useState([])
  const { flag } = useFeatures()

  useEffect(() => {
    getQuickStats()
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
    getLiveMeets().then((res) => setLiveMeets(res.data || [])).catch(() => {})
    getNewRecords().then((res) => setNewRecords(list(res.data))).catch(() => {})
  }, [])

  if (loading) return <Loading label="Loading statistics" />
  if (!data?.championship) return (
    <Empty label="No championship statistics available yet" hint="Check back soon, or browse the meets already published.">
      <Link to="/championships" className="btn btn-secondary">Browse championships</Link>
    </Empty>
  )

  const champ = data.championship

  // newest first, one entry per swim, with every record level it set
  const latestSwims = (() => {
    const order = ['ARAB', 'GCC', 'NATIONAL']
    const groups = new Map()
    for (const r of newRecords) {
      const key = r.result ? `r${r.result}` : `${r.swimmer}-${r.event}-${r.pool}-${r.time_centiseconds}-${r.age_category}`
      const g = groups.get(key)
      if (g) { if (!g.types.includes(r.record_type)) g.types.push(r.record_type) } else groups.set(key, { key, rec: r, types: [r.record_type] })
    }
    return [...groups.values()].slice(0, 8).map((g) => ({ ...g, types: g.types.sort((x, y) => order.indexOf(x) - order.indexOf(y)) }))
  })()

  return (
    <div className="asw-fade-up">
      {/* ── LIVE strip ── */}
      {liveMeets.length > 0 && (
        /* on a phone the meet name and the call to action stack (link on its
           own line) instead of wrapping side by side in two narrow columns */
        <Link className="am-live-strip" to={liveMeets.length === 1 ? `/meets/${liveMeets[0].id}` : '/live'}>
          <span className="am-live-what">
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', animation: 'pulse 1.4s ease-in-out infinite', flex: 'none' }} />
            <span>LIVE NOW: {liveMeets.length === 1
              ? liveMeets[0].name
              : `${liveMeets.length} meets in progress`}</span>
          </span>
          <span className="am-live-cta"><span className="hide-mobile" aria-hidden="true">— </span>Follow the results →</span>
        </Link>
      )}

      {/* ── Header band ── */}
      {/* flat standard blue — user: no light-to-dark gradient, top and bottom identical */}
      <header style={{ background: 'var(--color-accent-800)', color: '#fff', padding: '34px 0 26px', textAlign: 'center' }}>
        <div className="container" style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: GOLD }}>ArabSwim</div>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px, 5vw, 40px)', letterSpacing: '0.02em', textTransform: 'uppercase', color: '#fff' }}>Quick Statistics</h1>
          <Link to={`/meets/${champ.id}`} style={{ padding: '8px 0', margin: '-7px 0' /* Fitts's Law: taller hit area, header height unchanged */, color: GOLD, textDecoration: 'none', fontSize: 'clamp(13px, 2.5vw, 16px)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {champ.name}
          </Link>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', justifyContent: 'center', alignItems: 'center', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={13} /> {formatDateRange(champ.date, champ.end_date)}
            </span>
            {(champ.location || champ.country_name) && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={13} /> {[champ.location, champ.country_name].filter(Boolean).join(', ')}
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Droplets size={13} /> {poolLabel(champ.pool)}
            </span>
          </div>
          {/* Von Restorff + Pareto: the one thing most visitors came for is the
              single standout action; the gold title above reads as a heading, not a link */}
          <Link to={`/meets/${champ.id}?tab=results`} className="btn" style={{ marginTop: 10, minHeight: 40, padding: '0 16px', background: '#fff', color: 'var(--color-accent-800)', fontWeight: 700, textDecoration: 'none' }}>
            View full results →
          </Link>
        </div>
      </header>

      <QuickStatsView data={data} pad headline />

      {/* ── Latest records broken across the platform ── */}
      {newRecords.length > 0 && (
        <div className="container pad" style={{ paddingTop: 4, paddingBottom: 44 }}>
          {/* Paradox of the Active User: the preview leads on to the full list */}
          <SectHead title="Latest Records Broken" to={flag('new_records') ? '/new-records' : undefined} linkLabel="All new records">
            <span className="micro hide-mobile" style={{ marginRight: 'auto' }}>Most recent national &amp; regional records across Arab swimming</span>
          </SectHead>
          {/* One card per swim. A swim that set two records (Arab and national)
              is one card with both tags, not two near-identical cards.
              Each card reads top to bottom: which record, the race, the time,
              then who and where (Chunking + Proximity). */}
          <div className="rule-t hr-grid">
            {latestSwims.map((g) => {
              const r = g.rec
              const sw = r.swimmer_detail || {}
              const code = sw.nationality_detail?.code || r.country_detail?.code
              const cName = sw.nationality_detail?.name || r.country_detail?.name
              const who = sw.sex === 'F' ? 'Women' : sw.sex === 'M' ? 'Men' : ''
              const age = r.age_category && r.age_category !== 'OPEN' ? r.age_category : ''
              return (
                <article key={g.key} className="hr-card">
                  <div className="hr-top">
                    <span className="hr-tags">
                      {g.types.map((t) => <span key={t} className={`hr-tag hr-tag-${t.toLowerCase()}`}>{RECORD_NAME[t] || t}</span>)}
                    </span>
                  </div>
                  <div className="hr-event">{r.event_detail?.name}</div>
                  <div className="hr-sub">{[who, age, r.pool ? poolLabel(r.pool) : ''].filter(Boolean).join(' · ')}</div>
                  <div className="hr-time asw-time">{r.formatted_time}</div>
                  <div className="hr-who">
                    <Flag code={code} name={cName} />
                    {sw.id && !sw.is_relay_team
                      ? <Link to={`/swimmers/${sw.id}`} className="hr-name">{sw.name}</Link>
                      : <span className="hr-name">{sw.name || cName || '—'}</span>}
                  </div>
                  {(r.meet_name || r.location) && (
                    <div className="hr-meet">{[r.meet_name, r.location].filter(Boolean).join(' · ')}</div>
                  )}
                  {r.result_date && <div className="hr-meet asw-num" style={{ marginTop: 2 }}>{formatDate(r.result_date)}</div>}
                </article>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
