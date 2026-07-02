import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImagePlus, X } from 'lucide-react'
import {
  getListing, createListing, updateListing, uploadListingImages, deleteListingImage,
} from '../api/market'
import { getCountries } from '../api/core'
import { useToast } from '../context/ToastContext'

const CATEGORIES = [
  ['SUITS', 'Suits'], ['GOGGLES', 'Goggles'], ['TRAINING_GEAR', 'Training Gear'],
  ['APPAREL', 'Apparel'], ['ELECTRONICS', 'Electronics'], ['OTHER', 'Other'],
]

export default function MarketFormPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [countries, setCountries] = useState([])
  const [saving, setSaving] = useState(false)
  const [existingImages, setExistingImages] = useState([])
  const [newFiles, setNewFiles] = useState([])
  const [form, setForm] = useState({
    title: '', description: '', price: '', currency: 'USD', category: 'OTHER',
    condition: 'USED', seller_name: '', seller_contact: '', country: '', status: 'PENDING',
  })

  useEffect(() => {
    getCountries().then((res) => setCountries(res.data)).catch(() => {})
    if (isEdit) {
      getListing(id).then((res) => {
        const l = res.data
        setForm({
          title: l.title || '', description: l.description || '',
          price: l.price ?? '', currency: l.currency || 'USD',
          category: l.category || 'OTHER', condition: l.condition || 'USED',
          seller_name: l.seller_name || '', seller_contact: l.seller_contact || '',
          country: l.country || '', status: l.status || 'PENDING',
        })
        setExistingImages(l.images || [])
      }).catch(() => toast.error('Failed to load listing'))
    }
  }, [id])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const onFilesSelect = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length) setNewFiles((prev) => [...prev, ...files])
    e.target.value = ''
  }

  const removeExistingImage = async (img) => {
    try {
      await deleteListingImage(img.id)
      setExistingImages((prev) => prev.filter((i) => i.id !== img.id))
    } catch {
      toast.error('Failed to remove image')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const payload = { ...form, price: form.price === '' ? null : form.price, country: form.country || null }
      let listingId = id
      if (isEdit) {
        await updateListing(id, payload)
      } else {
        const res = await createListing(payload)
        listingId = res.data.id
      }
      if (newFiles.length) {
        const fd = new FormData()
        newFiles.forEach((f) => fd.append('images', f))
        await uploadListingImages(listingId, fd)
      }
      toast.success(isEdit ? 'Listing updated' : 'Listing created')
      navigate('/market')
    } catch {
      toast.error('Failed to save listing')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/market')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={15} /> Back to Market
      </button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Listing' : 'New Listing'}</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Title *</label>
          <input type="text" value={form.title} onChange={set('title')}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Arena Carbon Air 2 tech suit" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea value={form.description} onChange={set('description')} rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Price</label>
            <input type="number" step="0.01" min="0" value={form.price} onChange={set('price')}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Currency</label>
            <input type="text" value={form.currency} onChange={set('currency')}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select value={form.category} onChange={set('category')} className="w-full border rounded-lg px-3 py-2 text-sm">
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Condition</label>
            <select value={form.condition} onChange={set('condition')} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="NEW">New</option>
              <option value="USED">Used</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Seller Name</label>
            <input type="text" value={form.seller_name} onChange={set('seller_name')}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Seller Contact</label>
            <input type="text" value={form.seller_contact} onChange={set('seller_contact')}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Phone / WhatsApp / Instagram" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Country</label>
            <select value={form.country} onChange={set('country')} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">— None —</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <select value={form.status} onChange={set('status')} className="w-full sm:w-1/3 border rounded-lg px-3 py-2 text-sm">
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="SOLD">Sold</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Photos</label>
          <div className="flex flex-wrap gap-3">
            {existingImages.map((img) => (
              <div key={img.id} className="relative w-24 h-24 rounded-lg overflow-hidden border">
                <img src={img.image} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => removeExistingImage(img)}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black">
                  <X size={12} />
                </button>
              </div>
            ))}
            {newFiles.map((f, i) => (
              <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border">
                <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black">
                  <X size={12} />
                </button>
              </div>
            ))}
            <label className="w-24 h-24 rounded-lg bg-gray-50 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-blue-400 hover:text-blue-500">
              <ImagePlus size={20} />
              <span className="text-[10px] mt-1">Add photos</span>
              <input type="file" accept="image/*" multiple onChange={onFilesSelect} className="hidden" />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/market')} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Listing'}
          </button>
        </div>
      </form>
    </div>
  )
}
