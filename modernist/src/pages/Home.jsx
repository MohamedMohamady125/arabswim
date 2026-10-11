import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, MapPin, Droplets } from 'lucide-react'
import { getQuickStats, getLiveMeets } from '../api/championships'
import { getNewRecords } from '../api/records'
import QuickStatsView from '../components/QuickStatsView'
import Flag from '../components/Flag'
import { Loading, Empty } from '../components/ui'
import { formatDate, formatDateRange } from '../utils'

const GOLD = 'var(--asw-gold)'
const list = (d) => (Array.isArray(d) ? d : d?.results || [])

export default function Home() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [liveMeets, setLiveMeets] = useState([])
  const [newRecords, setNewRecords] = useState([])

  useEffect(() => {
    getQuickStats()
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
    getLiveMeets().then((res) => setLiveMeets(res.data || [])).catch(() => {})
    getNewRecords().then((res) => setNewRecords(list(res.data))).catch(() => {})
  }, [])

  if (loading) return <Loading label="Loading statistics" />
  if (!data?.championship) return <Empty label="No championship statistics available yet" />

  const champ = data.championship

  return (
    <div className="asw-fade-up">
      {/* ── LIVE strip ── */}
      {liveMeets.length > 0 && (
        <Link to={liveMeets.length === 1 ? `/meets/${liveMeets[0].id}` : '/live'} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: 'var(--asw-slow)', color: '#fff', textDecoration: 'none',
          padding: '10px 16px', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', animation: 'pulse 1.4s ease-in-out infinite', flex: 'none' }} />
          LIVE NOW: {liveMeets.length === 1
            ? liveMeets[0].name
            : `${liveMeets.length} meets in progress`}
          <span style={{ opacity: 0.85, fontWeight: 600 }}>— follow the results →</span>
        </Link>
      )}

      {/* ── Header band ── */}
      <header style={{ background: 'linear-gradient(135deg, var(--color-accent-800), var(--color-accent-900))', color: '#fff', padding: '34px 0 26px', textAlign: 'center' }}>
        <div className="container" style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: GOLD }}>Arab Swim</div>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px, 5vw, 42px)', letterSpacing: '0.02em', textTransform: 'uppercase', color: '#fff' }}>Quick Statistics</h1>
          <Link to={`/meets/${champ.id}`} style={{ color: GOLD, textDecoration: 'none', fontSize: 'clamp(13px, 2.5vw, 16px)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
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
              <Droplets size={13} /> {champ.pool === 'SCM' ? 'SCM (25m)' : 'LCM (50m)'}
            </span>
          </div>
        </div>
      </header>

      <QuickStatsView data={data} />

      {/* ── Latest records broken across the platform ── */}
      {newRecords.length > 0 && (
        <div className="container" style={{ padding: '4px 16px 44px' }}>
          <div className="sect-head"><h4>Latest Records Broken</h4><span className="micro">Most recent national &amp; regional records across Arab swimming</span></div>
          <div className="rule-t" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, paddingTop: 14 }}>
            {newRecords.slice(0, 8).map((r) => {
              const sw = r.swimmer_detail || {}
              const code = sw.nationality_detail?.code || r.country_detail?.code
              const rtColor = r.record_type === 'ARAB' ? 'var(--color-accent-800)' : r.record_type === 'GCC' ? 'var(--color-accent)' : 'var(--color-accent-2)'
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', border: '1px solid var(--color-divider)', borderRadius: 8, background: '#fff' }}>
                  <span style={{ flex: 'none', minWidth: 42, textAlign: 'center', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em', color: '#fff', background: rtColor, borderRadius: 4, padding: '3px 5px' }}>{r.record_type}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
                      <Flag code={code} name={sw.nationality_detail?.name} />
                      <Link to={`/swimmers/${sw.id}`} style={{ color: 'inherit', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sw.name || '—'}</Link>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.event_detail?.name}{r.pool ? ` · ${r.pool}` : ''}{r.result_date ? ` · ${formatDate(r.result_date)}` : ''}
                    </div>
                  </div>
                  <div className="asw-time" style={{ flex: 'none', fontSize: 15, fontWeight: 800, color: 'var(--color-accent-800)' }}>{r.formatted_time}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
