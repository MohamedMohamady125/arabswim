import { useEffect, useState } from 'react'
import { Check, X, Trash2 } from 'lucide-react'
import { getListings, updateListing, deleteListing } from '../api/market'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'REJECTED', label: 'Rejected' },
]

const STATUS_TAG = {
  PENDING: 'tag-neutral',
  APPROVED: 'tag-accent',
  SOLD: 'tag-dark',
  REJECTED: 'tag-outline',
}

const CATEGORY_LABELS = {
  SUITS: 'Suits',
  GOGGLES: 'Goggles',
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

function contactHref(contact) {
  const s = String(contact || '').trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s)) return s
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`
  return null
}

export default function Market() {
  const { isAdmin } = useAuth()
  const [listings, setListings] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = {
      search: search || undefined,
      status: isAdmin ? statusFilter || undefined : undefined,
      page_size: 100,
    }
    getListings(params)
      .then((res) => {
        if (!alive) return
        const d = res.data
        let list = Array.isArray(d) ? d : d?.results || []
        if (!isAdmin) list = list.filter((l) => !l.status || l.status === 'APPROVED')
        setListings(list)
      })
      .catch(() => alive && setListings([]))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [search, statusFilter, isAdmin, reloadKey])

  const setStatus = async (l, status) => {
    try {
      await updateListing(l.id, { status })
      setReloadKey((k) => k + 1)
    } catch {
      window.alert('Failed to update listing')
    }
  }

  const handleDelete = async (l) => {
    if (!window.confirm(`Delete listing "${l.title}"? This cannot be undone.`)) return
    try {
      await deleteListing(l.id)
      setListings((prev) => prev.filter((x) => x.id !== l.id))
    } catch {
      window.alert('Failed to delete listing')
    }
  }

  return (
    <div>
      <PageHead kicker="Community" title="Market" sub="Swim gear bought and sold across the region">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
          <input
            className="input"
            style={{ maxWidth: 320 }}
            placeholder="Search listings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {isAdmin && <Seg options={STATUS_TABS} value={statusFilter} onChange={setStatusFilter} />}
        </div>
      </PageHead>

      {loading ? (
        <Loading label="Loading listings" />
      ) : listings.length === 0 ? (
        <Empty label="No listings found" />
      ) : (
        <div className="pad-lg">
          <div className="cellgrid grid-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {listings.map((l) => {
              const img = l.images?.[0]?.image
              const href = contactHref(l.seller_contact)
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    {isAdmin && l.status && (
                      <span className={`tag ${STATUS_TAG[l.status] || 'tag-neutral'}`}>{l.status}</span>
                    )}
                    {l.category && <span className="tag tag-accent">{catLabel(l.category)}</span>}
                    {l.condition && (
                      <span className="tag tag-neutral">{l.condition === 'NEW' ? 'New' : 'Used'}</span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, lineHeight: 1.2, marginBottom: 4 }}>
                    {l.title}
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, margin: '2px 0 8px' }} className="asw-num">
                    {l.price != null ? (
                      <>
                        {Number(l.price).toLocaleString('en-US')}
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-neutral-700)', marginLeft: 6 }}>{l.currency}</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-neutral-700)' }}>Price on request</span>
                    )}
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
                    <div style={{ fontSize: 12, marginTop: 6 }}>
                      {href ? (
                        <a href={href} target={href.startsWith('mailto:') ? undefined : '_blank'} rel="noreferrer">
                          Contact seller →
                        </a>
                      ) : (
                        <span style={{ color: 'var(--color-neutral-700)', wordBreak: 'break-all' }}>
                          Contact: {l.seller_contact}
                        </span>
                      )}
                    </div>
                  )}
                  {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-divider)', flexWrap: 'wrap' }}>
                      {l.status === 'PENDING' && (
                        <>
                          <button type="button" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => setStatus(l, 'APPROVED')}>
                            <Check size={13} /> Approve
                          </button>
                          <button type="button" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => setStatus(l, 'REJECTED')}>
                            <X size={13} /> Reject
                          </button>
                        </>
                      )}
                      {l.status === 'APPROVED' && (
                        <button type="button" className="btn btn-secondary" onClick={() => setStatus(l, 'SOLD')}>
                          Mark Sold
                        </button>
                      )}
                      <span style={{ flex: 1 }} />
                      <button type="button" className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => handleDelete(l)}>
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
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
