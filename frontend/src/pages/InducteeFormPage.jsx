import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImagePlus, X, Search } from 'lucide-react'
import { getInductee, createInductee, updateInductee } from '../api/fame'
import { getSwimmers } from '../api/swimmers'
import { getCountries } from '../api/core'
import { useToast } from '../context/ToastContext'

export default function InducteeFormPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [countries, setCountries] = useState([])
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)

  const [swimmerQuery, setSwimmerQuery] = useState('')
  const [swimmerResults, setSwimmerResults] = useState([])
  const [linkedSwimmer, setLinkedSwimmer] = useState(null)
  const searchTimer = useRef(null)

  const [form, setForm] = useState({
    name: '', country: '', era: '', inducted_year: '', achievements: '', display_order: 0,
  })

  useEffect(() => {
    getCountries().then((res) => setCountries(res.data)).catch(() => {})
    if (isEdit) {
      getInductee(id).then((res) => {
        const i = res.data
        setForm({
          name: i.name || '', country: i.country || '', era: i.era || '',
          inducted_year: i.inducted_year ?? '', achievements: i.achievements || '',
          display_order: i.display_order ?? 0,
        })
        setPhotoPreview(i.photo || null)
        if (i.swimmer_detail) setLinkedSwimmer(i.swimmer_detail)
      }).catch(() => toast.error('Failed to load inductee'))
    }
  }, [id])

  useEffect(() => {
    if (!swimmerQuery.trim()) { setSwimmerResults([]); return }
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      getSwimmers({ search: swimmerQuery, page_size: 8 }).then((res) => {
        setSwimmerResults(Array.isArray(res.data) ? res.data : res.data.results || [])
      }).catch(() => {})
    }, 300)
    return () => clearTimeout(searchTimer.current)
  }, [swimmerQuery])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const selectSwimmer = (s) => {
    setLinkedSwimmer(s)
    setSwimmerQuery('')
    setSwimmerResults([])
    setForm((f) => ({
      ...f,
      name: f.name || s.name,
      country: f.country || s.nationality || '',
    }))
  }

  const onPhotoSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      setPhotoPreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Name is required'); return }
    if (!form.country) { toast.error('Country is required'); return }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('name', form.name)
      fd.append('country', form.country)
      fd.append('era', form.era)
      fd.append('achievements', form.achievements)
      fd.append('display_order', form.display_order || 0)
      if (form.inducted_year !== '') fd.append('inducted_year', form.inducted_year)
      fd.append('swimmer', linkedSwimmer ? linkedSwimmer.id : '')
      if (photoFile) fd.append('photo', photoFile)
      if (isEdit) await updateInductee(id, fd)
      else await createInductee(fd)
      toast.success(isEdit ? 'Inductee updated' : 'Inductee added')
      navigate('/hall-of-fame')
    } catch {
      toast.error('Failed to save inductee')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/hall-of-fame')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={15} /> Back to Hall of Fame
      </button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Inductee' : 'Add Inductee'}</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Link to Swimmer (optional)</label>
          {linkedSwimmer ? (
            <div className="flex items-center justify-between border rounded-lg px-3 py-2 bg-blue-50">
              <span className="text-sm text-blue-800">{linkedSwimmer.name}</span>
              <button type="button" onClick={() => setLinkedSwimmer(null)} className="text-gray-400 hover:text-red-600">
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
              <input type="text" value={swimmerQuery} onChange={(e) => setSwimmerQuery(e.target.value)}
                className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm" placeholder="Search swimmers in the database..." />
              {swimmerResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {swimmerResults.map((s) => (
                    <button key={s.id} type="button" onClick={() => selectSwimmer(s)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
                      {s.name}
                      {s.nationality_detail && <span className="text-gray-400"> · {s.nationality_detail.name}</span>}
                      {s.birth_year && <span className="text-gray-400"> · {s.birth_year}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-5">
          <label className="w-24 h-24 rounded-full bg-gray-50 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden cursor-pointer relative shrink-0">
            {photoPreview ? (
              <img src={photoPreview} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center text-gray-400"><ImagePlus size={20} className="mx-auto" /><div className="text-[10px] mt-1">Photo</div></div>
            )}
            <input type="file" accept="image/*" onChange={onPhotoSelect} className="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input type="text" value={form.name} onChange={set('name')}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Legend's name" />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Country *</label>
            <select value={form.country} onChange={set('country')} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">— Select —</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Era</label>
            <input type="text" value={form.era} onChange={set('era')}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="1990s–2000s" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Inducted Year</label>
            <input type="number" value={form.inducted_year} onChange={set('inducted_year')}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Display Order</label>
            <input type="number" value={form.display_order} onChange={set('display_order')}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Achievements</label>
          <textarea value={form.achievements} onChange={set('achievements')} rows={6}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Titles, records, career highlights..." />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/hall-of-fame')} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Inductee'}
          </button>
        </div>
      </form>
    </div>
  )
}
