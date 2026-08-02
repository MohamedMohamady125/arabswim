import { useEffect, useMemo, useState } from 'react'
import { getInductees } from '../api/fame'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty } from '../components/ui'
import { mediaUrl } from '../utils'

export default function HallOfFame() {
  const [inductees, setInductees] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getInductees()
      .then((res) => {
        if (!alive) return
        const d = res.data
        setInductees(Array.isArray(d) ? d : d?.results || [])
      })
      .catch(() => { if (alive) setInductees([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const sorted = useMemo(
    () => [...inductees].sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999)),
    [inductees]
  )

  if (loading) return <Loading label="Loading the Hall of Fame" />

  return (
    <div>
      <PageHead
        kicker="Legacy"
        title="Hall of Fame"
        sub="The swimmers who defined Arab swimming."
      />

      {sorted.length === 0 ? (
        <Empty label="No inductees yet" />
      ) : (
        <div className="grid-2 pad" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          {sorted.map((p) => (
            <article key={p.id} className="hair-b" style={{ paddingBottom: 28 }}>
              {p.photo && (
                <div className="grayscale" style={{ width: '100%', height: 320, overflow: 'hidden', marginBottom: 16 }}>
                  <img src={mediaUrl(p.photo)} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span className="tag tag-dark">Class of {p.inducted_year}</span>
                {p.era && <span className="micro">{p.era}</span>}
              </div>
              <h2 style={{ margin: '0 0 8px', letterSpacing: '-0.02em' }}>{p.name}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 13, color: 'var(--color-neutral-700)' }}>
                <Flag code={p.country_detail?.code} name={p.country_detail?.name} />
                <span>{p.country_detail?.name}</span>
              </div>
              {p.achievements && (
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-neutral-800)', margin: 0 }}>
                  {p.achievements}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
