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
          <div className="rule-t" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, paddingTop: 14 }}>
            {newRecords.slice(0, 8).map((r) => {
              const sw = r.swimmer_detail || {}
              const code = sw.nationality_detail?.code || r.country_detail?.code
              // contrast (WCAG AA) + Similarity: three books, three distinct pills —
              // Arab navy, GCC mid blue (both white text), National pale blue with navy text
              const pill = r.record_type === 'ARAB' ? { background: 'var(--color-accent-800)', color: '#fff' }
                : r.record_type === 'GCC' ? { background: 'var(--color-accent-500)', color: '#fff' }
                : { background: 'var(--color-accent-2-200)', color: 'var(--color-accent-800)' }
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 13px', border: '1px solid var(--color-divider)', borderRadius: 0, background: '#fff' }}>
                  <span style={{ flex: 'none', minWidth: 42, textAlign: 'center', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', ...pill, borderRadius: 0, padding: '4px 4px' }}>{r.record_type}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
                      <Flag code={code} name={sw.nationality_detail?.name} />
                      {sw.id
                        ? <Link to={`/swimmers/${sw.id}`} style={{ padding: '6px 0', margin: '-6px 0' /* Fitts's Law: 32px hit area, card height unchanged */, color: 'inherit', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sw.name || '—'}</Link>
                        : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sw.name || '—'}</span>}
                    </div>
                    {/* wraps instead of cutting the date off on narrow cards */}
                    <div style={{ fontSize: 11, color: 'var(--color-neutral-700)', marginTop: 2, lineHeight: 1.35 }}>
                      {r.event_detail?.name}{r.swimmer_detail?.sex === 'F' ? ' · Women' : r.swimmer_detail?.sex === 'M' ? ' · Men' : ''}{r.pool ? ` · ${poolLabel(r.pool)}` : ''}{r.result_date ? ` · ${formatDate(r.result_date)}` : ''}
                    </div>
                  </div>
                  <div className="asw-time" style={{ flex: 'none', fontSize: 16, fontWeight: 800, color: 'var(--color-accent-800)' }}>{r.formatted_time}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
