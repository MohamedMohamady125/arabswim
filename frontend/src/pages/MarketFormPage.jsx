import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ImagePlus, X, Save } from 'lucide-react'
import {
  getListing, createListing, updateListing, uploadListingImages, deleteListingImage,
} from '../api/market'
import { getCountries } from '../api/core'
import { useToast } from '../context/ToastContext'
import { Button, Card, PageHeader, Input, Select, Textarea, FieldLabel } from '../components/ui'

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
    <div className="max-w-2xl mx-auto pb-6">
      <PageHeader
        breadcrumb={[{ label: 'Market', to: '/market' }, { label: isEdit ? 'Edit' : 'New' }]}
        title={isEdit ? 'Edit Listing' : 'New Listing'}
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <div className="space-y-4 sm:space-y-5">
            <section>
              <h3 className="text-label text-ink-400 mb-4">Listing</h3>
              <div className="space-y-4">
                <div>
                  <FieldLabel required>Title</FieldLabel>
                  <Input type="text" value={form.title} onChange={set('title')} placeholder="e.g. Arena Carbon Air 2 tech suit" />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <Textarea value={form.description} onChange={set('description')} rows={4} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  <div>
                    <FieldLabel>Price</FieldLabel>
                    <Input type="number" step="0.01" min="0" value={form.price} onChange={set('price')} className="tnum" />
                  </div>
                  <div>
                    <FieldLabel>Currency</FieldLabel>
                    <Input type="text" value={form.currency} onChange={set('currency')} />
                  </div>
                  <div>
                    <FieldLabel>Category</FieldLabel>
                    <Select value={form.category} onChange={set('category')}>
                      {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                  </div>
                  <div>
                    <FieldLabel>Condition</FieldLabel>
                    <Select value={form.condition} onChange={set('condition')}>
                      <option value="NEW">New</option>
                      <option value="USED">Used</option>
                    </Select>
                  </div>
                </div>
              </div>
            </section>

            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Seller</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <FieldLabel>Seller Name</FieldLabel>
                  <Input type="text" value={form.seller_name} onChange={set('seller_name')} />
                </div>
                <div>
                  <FieldLabel>Seller Contact</FieldLabel>
                  <Input type="text" value={form.seller_contact} onChange={set('seller_contact')} placeholder="Phone / WhatsApp / Instagram" />
                </div>
                <div>
                  <FieldLabel>Country</FieldLabel>
                  <Select value={form.country} onChange={set('country')}>
                    <option value="">— None —</option>
                    {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
              </div>
            </section>

            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Status &amp; Photos</h3>
              <div className="space-y-4">
                <div className="sm:max-w-xs">
                  <FieldLabel>Status</FieldLabel>
                  <Select value={form.status} onChange={set('status')}>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="SOLD">Sold</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Photos</FieldLabel>
                  <div className="flex flex-wrap gap-3">
                    {existingImages.map((img) => (
                      <div key={img.id} className="relative w-24 h-24 rounded-sm overflow-hidden border border-ink-100">
                        <img src={img.image} alt="" className="w-full h-full object-cover" />
                        <button type="button" aria-label="Remove image" onClick={() => removeExistingImage(img)}
                          className="absolute top-1 end-1 bg-ink-950/60 text-white rounded-full p-1.5 hover:bg-ink-950">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {newFiles.map((f, i) => (
                      <div key={i} className="relative w-24 h-24 rounded-sm overflow-hidden border border-ink-100">
                        <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                        <button type="button" aria-label="Remove image" onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute top-1 end-1 bg-ink-950/60 text-white rounded-full p-1.5 hover:bg-ink-950">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <label className="w-24 h-24 rounded-sm bg-ink-50 border-2 border-dashed border-ink-200 flex flex-col items-center justify-center text-ink-400 cursor-pointer hover:border-aqua-500/40 hover:text-aqua-600">
                      <ImagePlus size={20} />
                      <span className="text-body-sm mt-1">Add</span>
                      <input type="file" accept="image/*" multiple onChange={onFilesSelect} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </Card>

        <div className="sticky bottom-0 z-10 mt-4 rounded-md border border-ink-100 bg-white/95 backdrop-blur-sm shadow-pop px-4 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/market')}>Cancel</Button>
          <Button type="submit" icon={Save} loading={saving}>{isEdit ? 'Save Changes' : 'Create Listing'}</Button>
        </div>
      </form>
    </div>
  )
}
