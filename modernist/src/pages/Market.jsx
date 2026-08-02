import { useEffect, useState } from 'react'
import { getListings } from '../api/market'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'

const CATEGORY_LABELS = {
  TRAINING_GEAR: 'Training gear',
  ELECTRONICS: 'Electronics',
  APPAREL: 'Apparel',
  SWIMWEAR: 'Swimwear',
  ACCESSORIES: 'Accessories',
  OTHER: 'Other',
}

function catLabel(cat) {
  if (!cat) return ''
  return CATEGORY_LABELS[cat] || String(cat).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

export default function Market() {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getListings()
      .then((res) => {
        if (!alive) return
        const d = res.data
        const list = Array.isArray(d) ? d : d?.results || []
        setListings(list.filter((l) => !l.status || l.status === 'APPROVED'))
      })
      .catch(() => alive && setListings([]))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  return (
    <div>
      <PageHead kicker="Community" title="Market" sub="Swim gear bought and sold across the region" />
      {loading ? (
        <Loading label="Loading listings" />
      ) : listings.length === 0 ? (
        <Empty label="No listings available" />
      ) : (
        <div className="pad-lg">
          <div className="cellgrid grid-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {listings.map((l) => {
              const img = l.images?.[0]?.image
              return (
                <div key={l.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  {img ? (
                    <div className="grayscale" style={{ height: 190, overflow: 'hidden', margin: '-14px -16px 12px' }}>
                      <img src={mediaUrl(img)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ) : (
                    <div style={{ height: 190, background: 'var(--color-neutral-200)', margin: '-14px -16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="micro">No photo</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {l.category && <span className="tag tag-accent">{catLabel(l.category)}</span>}
                    {l.condition && <span className="tag tag-neutral">{catLabel(l.condition)}</span>}
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, lineHeight: 1.2, marginBottom: 4 }}>
                    {l.title}
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, margin: '2px 0 8px' }} className="asw-num">
                    {l.price}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-neutral-700)', marginLeft: 6 }}>{l.currency}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--color-neutral-800)', margin: '0 0 12px', flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {l.description}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10, borderTop: '1px solid var(--color-divider)', fontSize: 12, color: 'var(--color-neutral-700)' }}>
                    {l.country_detail && <Flag code={l.country_detail.code} name={l.country_detail.name} />}
                    <span style={{ flex: 1 }}>{l.seller_name}</span>
                    <span>{formatDate(l.created_at)}</span>
                  </div>
                  {l.seller_contact && (
                    <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 4 }}>{l.seller_contact}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
