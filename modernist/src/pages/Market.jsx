import { useEffect, useMemo, useState } from 'react'
import { Check, X, Trash2 } from 'lucide-react'
import { getListings, updateListing, deleteListing } from '../api/market'
import Flag from '../components/Flag'
import { PageHead, Loading, notify, Empty, Seg, FilterBar } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'
import Pic from '../components/Pic'

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'REJECTED', label: 'Rejected' },
]

// swimmers' words instead of database codes
const STATUS_LABEL = { PENDING: 'Waiting for review', APPROVED: 'Live', SOLD: 'Sold', REJECTED: 'Rejected' }

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
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Doherty Threshold: search after a pause in typing; Postel's Law: spaces ignored
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim().replace(/\s+/g, ' ')), 300)
    return () => clearTimeout(t)
  }, [searchInput])

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
        setFailed(false)
      })
      .catch(() => { if (alive) { setListings([]); setFailed(true) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [search, statusFilter, isAdmin, reloadKey])

  const setStatus = async (l, status) => {
    setBusyId(l.id)
    try {
      await updateListing(l.id, { status })
      // Doherty Threshold: the card changes at once; the list is then re-read
      setListings((prev) => prev.map((x) => (x.id === l.id ? { ...x, status } : x)))
      notify({ APPROVED: 'Listing approved. It is now public.', REJECTED: 'Listing rejected. It stays hidden.', SOLD: 'Marked as sold. It is no longer public.' }[status] || 'Listing updated.')
      setReloadKey((k) => k + 1)
    } catch {
      notify('Failed to update listing')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (l) => {
    if (!window.confirm(`Delete listing "${l.title}"? This cannot be undone.`)) return
    try {
      await deleteListing(l.id)
      setListings((prev) => prev.filter((x) => x.id !== l.id))
      notify('Listing deleted.')
    } catch {
      notify('Failed to delete listing')
    }
  }

  // Hick's Law: only the categories that have listings are offered
  const categories = useMemo(() => [...new Set(listings.map((l) => l.category).filter(Boolean))], [listings])
  const shown = category ? listings.filter((l) => l.category === category) : listings
  const pendingCount = isAdmin ? listings.filter((l) => l.status === 'PENDING').length : 0
  const filtered = !!(search || statusFilter || category)
  const clearFilters = () => { setSearchInput(''); setSearch(''); setStatusFilter(''); setCategory('') }

  return (
    <div>
      {/* Mental Model: the page carries the same name and group as the menu link */}
      <PageHead title="Marketplace" sub="Swim gear bought and sold across the region" />

      <FilterBar count={loading || failed ? null : shown.length} noun={shown.length === 1 ? 'listing' : 'listings'} active={filtered} onClear={clearFilters}>
        <input
          className="input"
          style={{ width: 260, maxWidth: '100%' }}
          type="search"
          placeholder="Search listings…"
          aria-label="Search listings"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {categories.length > 1 && (
          <select className="select" style={{ width: 'auto', maxWidth: '100%' }} aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
          </select>
        )}
        {isAdmin && <Seg options={STATUS_TABS} value={statusFilter} onChange={setStatusFilter} />}
      </FilterBar>

      {/* Zeigarnik Effect: work waiting for the admin is stated up front */}
      {isAdmin && pendingCount > 0 && statusFilter !== 'PENDING' && (
        <div className="content-todo" role="status" style={{ margin: '16px 32px 0' }}>
          <strong>{pendingCount} listing{pendingCount === 1 ? '' : 's'} waiting for review.</strong>{' '}
          <button type="button" className="btn btn-ghost" style={{ minHeight: 32 }} onClick={() => setStatusFilter('PENDING')}>Review now →</button>
        </div>
      )}

      {loading && listings.length === 0 ? (
        <Loading label="Loading listings" />
      ) : failed ? (
        <Empty label="Listings could not be loaded" hint="Check your connection and try again.">
          <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </Empty>
      ) : shown.length === 0 ? (
        <Empty label={filtered ? 'No listings match' : 'No listings yet'} hint={filtered ? 'Nothing matches these filters. Try a shorter search or clear the filters.' : 'Swim gear for sale will appear here once a listing is approved.'}>
          {filtered && <button type="button" className="btn btn-secondary" onClick={clearFilters}>Show all listings</button>}
        </Empty>
      ) : (
        <div className="pad-lg" aria-busy={loading} style={{ opacity: loading ? 0.55 : 1 }}>
          <div className="cellgrid grid-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {shown.map((l) => {
              const img = l.images?.[0]?.image
              const href = contactHref(l.seller_contact)
              return (
                <div key={l.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  {img ? (
                    <div className="grayscale" style={{ height: 190, overflow: 'hidden', margin: '-14px -16px 12px' }}>
                      <Pic kind="gallery" w={480} src={img} alt={l.title || ''} />
                    </div>
                  ) : (
                    <div style={{ height: 190, background: 'var(--color-neutral-200)', margin: '-14px -16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="micro">No photo</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    {isAdmin && l.status && (
                      <span className={`tag ${STATUS_TAG[l.status] || 'tag-neutral'}`}>{STATUS_LABEL[l.status] || l.status}</span>
                    )}
                    {l.category && <span className="tag tag-accent">{catLabel(l.category)}</span>}
                    {l.condition && (
                      <span className="tag tag-neutral">{l.condition === 'NEW' ? 'New' : 'Used'}</span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, lineHeight: 1.2, marginBottom: 4 }}>
                    {l.title}
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, margin: '2px 0 8px' }} className="asw-num">
                    {l.price != null ? (
                      <>
                        {Number(l.price).toLocaleString('en-US')}
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-neutral-700)', marginLeft: 6 }}>{l.currency}</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-neutral-700)' }}>Price on request</span>
                    )}
                  </div>
                  <p title={l.description || undefined} style={{ fontSize: 13, color: 'var(--color-neutral-800)', margin: '0 0 12px', flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {l.description}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10, borderTop: '1px solid var(--color-divider)', fontSize: 12, color: 'var(--color-neutral-700)' }}>
                    {l.country_detail && <Flag code={l.country_detail.code} name={l.country_detail.name} />}
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{l.seller_name || 'Seller'}</span>
                    <span>{formatDate(l.created_at)}</span>
                  </div>
                  {l.seller_contact && (
                    <div style={{ fontSize: 12, marginTop: 10 }}>
                      {href ? (
                        <a className="btn btn-secondary" href={href} target={href.startsWith('mailto:') ? undefined : '_blank'} rel="noreferrer" style={{ width: '100%', textDecoration: 'none' }}>
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
                          {/* Von Restorff: many cards on screen, so Approve is not a solid primary on each one */}
                          <button type="button" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }} disabled={busyId === l.id} onClick={() => setStatus(l, 'APPROVED')}>
                            <Check size={13} /> Approve
                          </button>
                          <button type="button" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} disabled={busyId === l.id} onClick={() => setStatus(l, 'REJECTED')}>
                            <X size={13} /> Reject
                          </button>
                        </>
                      )}
                      {l.status === 'APPROVED' && (
                        <button type="button" className="btn btn-secondary" disabled={busyId === l.id} onClick={() => setStatus(l, 'SOLD')}>
                          Mark as sold
                        </button>
                      )}
                      <span style={{ flex: 1 }} />
                      <button type="button" className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} aria-label={`Delete listing ${l.title}`} onClick={() => handleDelete(l)}>
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
