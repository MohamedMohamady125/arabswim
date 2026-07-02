import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { getListings, deleteListing, updateListing } from '../api/market'
import { useToast } from '../context/ToastContext'

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'REJECTED', label: 'Rejected' },
]

const STATUS_STYLES = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  SOLD: 'bg-gray-200 text-gray-600',
}

const CATEGORY_LABELS = {
  SUITS: 'Suits', GOGGLES: 'Goggles', TRAINING_GEAR: 'Training Gear',
  APPAREL: 'Apparel', ELECTRONICS: 'Electronics', OTHER: 'Other',
}

export default function MarketPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [listings, setListings] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const load = () => {
    const params = { status: statusFilter || undefined, search: search || undefined, page_size: 100 }
    getListings(params).then((res) => {
      setListings(Array.isArray(res.data) ? res.data : res.data.results || [])
    }).catch(() => {})
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
    if (!window.confirm(`Delete listing "${listing.title}"?`)) return
    try {
      await deleteListing(listing.id)
      setListings((prev) => prev.filter((l) => l.id !== listing.id))
      toast.success('Listing deleted')
    } catch {
      toast.error('Failed to delete listing')
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShoppingBag size={24} className="text-blue-600" /> Market
          <span className="text-gray-400 text-lg font-normal">({listings.length})</span>
        </h1>
        <button onClick={() => navigate('/market/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={16} /> New Listing
        </button>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <input type="text" placeholder="Search listings..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 border rounded-lg px-3 py-2 text-sm bg-white" />
        <div className="flex rounded-lg border bg-white overflow-hidden">
          {STATUS_TABS.map((t) => (
            <button key={t.value} onClick={() => setStatusFilter(t.value)}
              className={`px-3 py-2 text-sm ${statusFilter === t.value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {listings.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          No listings found.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map((l) => (
            <div key={l.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
              <div className="h-40 bg-gray-100 cursor-pointer" onClick={() => navigate(`/market/${l.id}/edit`)}>
                {l.images?.[0] ? (
                  <img src={l.images[0].image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <ShoppingBag size={36} />
                  </div>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[l.status]}`}>{l.status}</span>
                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs">{CATEGORY_LABELS[l.category] || l.category}</span>
                  <span className="text-xs text-gray-400">{l.condition === 'NEW' ? 'New' : 'Used'}</span>
                </div>
                <h3 className="font-semibold text-sm cursor-pointer hover:text-blue-600 line-clamp-1"
                  onClick={() => navigate(`/market/${l.id}/edit`)}>{l.title}</h3>
                <div className="text-blue-600 font-bold text-sm mt-1">
                  {l.price != null ? `${Number(l.price).toLocaleString()} ${l.currency}` : 'Price on request'}
                </div>
                {l.seller_name && (
                  <div className="text-xs text-gray-500 mt-1">
                    {l.seller_name}{l.seller_contact ? ` · ${l.seller_contact}` : ''}
                  </div>
                )}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <div className="flex gap-2">
                    {l.status === 'PENDING' && (
                      <>
                        <button onClick={() => setStatus(l, 'APPROVED')}
                          className="flex items-center gap-1 bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-xs hover:bg-emerald-700">
                          <Check size={12} /> Approve
                        </button>
                        <button onClick={() => setStatus(l, 'REJECTED')}
                          className="flex items-center gap-1 bg-red-600 text-white px-2.5 py-1 rounded-lg text-xs hover:bg-red-700">
                          <X size={12} /> Reject
                        </button>
                      </>
                    )}
                    {l.status === 'APPROVED' && (
                      <button onClick={() => setStatus(l, 'SOLD')}
                        className="flex items-center gap-1 border border-gray-300 px-2.5 py-1 rounded-lg text-xs hover:bg-gray-50">
                        Mark Sold
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => navigate(`/market/${l.id}/edit`)}
                      className="text-blue-600 hover:text-blue-800"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(l)}
                      className="text-red-600 hover:text-red-800"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
