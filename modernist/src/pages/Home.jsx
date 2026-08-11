import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, MapPin, Droplets } from 'lucide-react'
import { getQuickStats } from '../api/championships'
import QuickStatsView from '../components/QuickStatsView'
import { Loading, Empty } from '../components/ui'
import { formatDateRange } from '../utils'

const GOLD = 'var(--asw-gold)'

export default function Home() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getQuickStats()
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading label="Loading statistics" />
  if (!data?.championship) return <Empty label="No championship statistics available yet" />

  const champ = data.championship

  return (
    <div className="asw-fade-up">
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
    </div>
  )
}
