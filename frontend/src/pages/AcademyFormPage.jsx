import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImagePlus } from 'lucide-react'
import { getAcademy, createAcademy, updateAcademy } from '../api/academies'
import { getCountries } from '../api/core'
import { useToast } from '../context/ToastContext'

export default function AcademyFormPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [countries, setCountries] = useState([])
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [form, setForm] = useState({
    name: '', country: '', city: '', description: '', phone: '', email: '',
    website: '', instagram: '', address: '', is_active: true,
  })

  useEffect(() => {
    getCountries().then((res) => setCountries(res.data)).catch(() => {})
    if (isEdit) {
      getAcademy(id).then((res) => {
        const a = res.data
        setForm({
          name: a.name || '', country: a.country || '', city: a.city || '',
          description: a.description || '', phone: a.phone || '', email: a.email || '',
          website: a.website || '', instagram: a.instagram || '', address: a.address || '',
          is_active: a.is_active,
        })
        setLogoPreview(a.logo || null)
      }).catch(() => toast.error('Failed to load academy'))
    }
  }, [id])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const onLogoSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Name is required'); return }
    if (!form.country) { toast.error('Country is required'); return }
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      if (logoFile) fd.append('logo', logoFile)
      if (isEdit) await updateAcademy(id, fd)
      else await createAcademy(fd)
      toast.success(isEdit ? 'Academy updated' : 'Academy created')
      navigate('/academies')
    } catch {
      toast.error('Failed to save academy')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/academies')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={15} /> Back to Academies
      </button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Academy' : 'Add Academy'}</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-center gap-5">
          <label className="w-24 h-24 rounded-xl bg-gray-50 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden cursor-pointer relative shrink-0">
            {logoPreview ? (
              <img src={logoPreview} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center text-gray-400"><ImagePlus size={20} className="mx-auto" /><div className="text-[10px] mt-1">Logo</div></div>
            )}
            <input type="file" accept="image/*" onChange={onLogoSelect} className="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input type="text" value={form.name} onChange={set('name')}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Academy name" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Country *</label>
            <select value={form.country} onChange={set('country')} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">— Select —</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">City</label>
            <input type="text" value={form.city} onChange={set('city')}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Active</label>
            <select value={String(form.is_active)} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'true' }))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea value={form.description} onChange={set('description')} rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input type="text" value={form.phone} onChange={set('phone')}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={form.email} onChange={set('email')}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Website</label>
            <input type="url" value={form.website} onChange={set('website')}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Instagram</label>
            <input type="text" value={form.instagram} onChange={set('instagram')}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="@handle" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Address</label>
          <textarea value={form.address} onChange={set('address')} rows={2}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/academies')} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Academy'}
          </button>
        </div>
      </form>
    </div>
  )
}
