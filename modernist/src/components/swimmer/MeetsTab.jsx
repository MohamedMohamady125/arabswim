import { Link } from 'react-router-dom'
import Flag from '../Flag'
import { Empty } from '../ui'
import { formatDate } from '../../utils'

export const CLASSIFICATIONS = [
  'Olympic', 'World', 'Arab', 'Asian', 'African', 'GCC',
  'Mediterranean', 'Islamic', 'School', 'University', 'National', 'Other',
]

export default function MeetsTab({ stats }) {
  if (!stats) return null
  const championships = stats.championships || []
  if (championships.length === 0) return <Empty label="No championship history yet" />

  // Participation counts by classification
  const counts = {}
  championships.forEach((c) => {
    const key = c.classification || ''
    counts[key] = (counts[key] || 0) + 1
  })

  // Timeline grouped by year, newest first
  const byYear = {}
  championships.forEach((c) => {
    const year = new Date(c.date).getFullYear()
    if (!byYear[year]) byYear[year] = []
    byYear[year].push(c)
  })
  const years = Object.keys(byYear).sort((a, b) => b - a)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Participation grid */}
      <div>
        <div className="sect-head">
          <h4>Participation</h4>
          <span className="micro asw-num">{championships.length} meets</span>
        </div>
        {/* self-sized cards — no grid filler tracks behind them */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {CLASSIFICATIONS.filter((cls) => (counts[cls] || 0) > 0).map((cls) => (
            <div
              key={cls}
              style={{
                border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
                borderTop: '3px solid var(--asw-gold)', padding: '10px 18px 12px',
                minWidth: 108, flex: '0 1 auto',
              }}
            >
              <div className="card-kicker">{cls}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, lineHeight: 1.1 }}>
                  {counts[cls]}
                </span>
                <span className="micro">meet{counts[cls] !== 1 ? 's' : ''}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Year timeline */}
      <div>
        <div className="sect-head"><h4>Meet Timeline</h4></div>
        {years.map((year) => (
          <div key={year} style={{ marginBottom: 20 }}>
            <div className="rule-b" style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 6, marginBottom: 0 }}>
              <span className="tag tag-dark asw-num" style={{ fontWeight: 700 }}>{year}</span>
              <span className="micro asw-num">{byYear[year].length} meet{byYear[year].length !== 1 ? 's' : ''}</span>
            </div>
            {byYear[year].map((c) => (
              <Link key={c.id} to={`/meets/${c.id}`} className="hair-b"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', textDecoration: 'none', color: 'inherit' }}>
                <Flag code={c.country_code} name={c.country} flagUrl={c.flag_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div className="asw-num" style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 2 }}>
                    {c.country ? `${c.country} · ` : ''}{formatDate(c.date)}
                  </div>
                </div>
                <span className={`tag ${c.pool === 'SCM' ? 'tag-accent-2' : 'tag-accent'}`}>{c.pool}</span>
                <span style={{ color: 'var(--color-neutral-500)' }}>→</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
