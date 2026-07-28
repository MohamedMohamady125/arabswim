import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Plus, Pencil, Trash2, Check, X, ExternalLink } from 'lucide-react'
import { getListings, deleteListing, updateListing } from '../api/market'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { Button, Badge, SearchInput, SegmentedControl, EmptyState, ConfirmDialog, CardsSkeleton, PageHeader } from '../components/ui'

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'SOLD', label: 'Sold' },
  { key: 'REJECTED', label: 'Rejected' },
]

const STATUS_VARIANTS = {
  PENDING: 'medal',
  APPROVED: 'pos',
  REJECTED: 'neg',
  SOLD: 'status',
}

const CATEGORY_LABELS = {
  SUITS: 'Suits', GOGGLES: 'Goggles', TRAINING_GEAR: 'Training Gear',
  APPAREL: 'Apparel', ELECTRONICS: 'Electronics', OTHER: 'Other',
}

export default function MarketPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { token } = useAuth()
  const isAdmin = !!token
  const [listings, setListings] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState(null)

  const load = () => {
    const params = { status: statusFilter || undefined, search: search || undefined, page_size: 100 }
    getListings(params).then((res) => {
      setListings(Array.isArray(res.data) ? res.data : res.data.results || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(load, [statusFilter, search])

  const setStatus = async (listing, status) => {
    try {
      await updateListing(listing.id, { status })
      toast.success(`Listing ${status.toLowerCase()}`)
      load()
    } catch {
      toast.error('Failed to update listing')
    }
  }

  const handleDelete = async (listing) => {
    try {
      await deleteListing(listing.id)
      setListings((prev) => prev.filter((l) => l.id !== listing.id))
      toast.success('Listing deleted')
    } catch {
      toast.error('Failed to delete listing')
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      <PageHeader
        title="Market"
        subtitle={`${listings.length} listing${listings.length === 1 ? '' : 's'} of swim gear`}
        action={isAdmin && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => navigate('/market/new')}>
            New Listing
          </Button>
        )}
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-5">
        <SearchInput placeholder="Search listings..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="flex-1 sm:max-w-md" />
        {isAdmin && (
          <div className="overflow-x-auto scrollbar-hide">
            <SegmentedControl options={STATUS_TABS} value={statusFilter} onChange={setStatusFilter} />
          </div>
        )}
      </div>

      {loading ? (
        <CardsSkeleton count={6} />
      ) : listings.length === 0 ? (
        <div className="bg-white rounded-md shadow-card border border-ink-100">
          <EmptyState icon={ShoppingBag} title="No listings found" hint="Swim gear for sale will appear here." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map((l) => (
            <article key={l.id}
              className="bg-white rounded-md shadow-card border border-ink-100 overflow-hidden transition-colors hover:border-aqua-500/40 flex flex-col">
              <div className={`h-40 bg-ink-50 ${isAdmin ? 'cursor-pointer' : ''}`}
                onClick={() => isAdmin && navigate(`/market/${l.id}/edit`)}>
                {l.images?.[0] ? (
                  <img src={l.images[0].image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-ink-200">
                    <ShoppingBag size={36} />
                  </div>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {isAdmin && <Badge variant={STATUS_VARIANTS[l.status] || 'status'}>{l.status}</Badge>}
                  <Badge variant="aqua">{CATEGORY_LABELS[l.category] || l.category}</Badge>
                  <span className="text-body-sm text-ink-400">{l.condition === 'NEW' ? 'New' : 'Used'}</span>
                </div>
                <h3 className={`text-body font-semibold text-ink-900 line-clamp-1 ${isAdmin ? 'cursor-pointer hover:text-aqua-600' : ''}`}
                  onClick={() => isAdmin && navigate(`/market/${l.id}/edit`)}>{l.title}</h3>
                <div className="text-time-lg text-ink-900 mt-1 tnum">
                  {l.price != null
                    ? <>{Number(l.price).toLocaleString()} <span className="text-body-sm font-medium text-ink-400">{l.currency}</span></>
                    : <span className="text-body text-ink-500 font-medium">Price on request</span>}
                </div>
                {l.seller_name && (
                  <div className="text-body-sm text-ink-500 mt-1.5">
                    Seller: {l.seller_name}
                  </div>
                )}
                {l.seller_contact && (
                  <div className="mt-3">
                    {/^https?:\/\//i.test(l.seller_contact) ? (
                      <a href={l.seller_contact} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-sm text-body-sm font-medium bg-aqua-600 text-white hover:bg-aqua-500 transition-colors">
                        <ExternalLink size={15} /> Contact seller
                      </a>
                    ) : (
                      <span className="inline-flex items-center min-h-10 px-3 rounded-sm bg-ink-50 border border-ink-100 text-body-sm text-ink-700 font-medium">
                        Contact: {l.seller_contact}
                      </span>
                    )}
                  </div>
                )}
                {isAdmin && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-ink-100">
                    <div className="flex gap-2">
                      {l.status === 'PENDING' && (
                        <>
                          <Button variant="primary" size="sm" icon={Check} onClick={() => setStatus(l, 'APPROVED')}>
                            Approve
                          </Button>
                          <Button variant="danger" size="sm" icon={X} onClick={() => setStatus(l, 'REJECTED')}>
                            Reject
                          </Button>
                        </>
                      )}
                      {l.status === 'APPROVED' && (
                        <Button variant="secondary" size="sm" onClick={() => setStatus(l, 'SOLD')}>
                          Mark Sold
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" icon={Pencil} aria-label="Edit listing"
                        onClick={() => navigate(`/market/${l.id}/edit`)} />
                      <Button variant="ghost" size="sm" icon={Trash2} aria-label="Delete listing"
                        className="hover:text-neg" onClick={() => setPendingDelete(l)} />
                    </div>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete listing"
        message={pendingDelete ? `Delete listing "${pendingDelete.title}"? This cannot be undone.` : ''}
        destructive
        onConfirm={() => handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
