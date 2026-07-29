import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ImagePlus, X, Search, Save } from 'lucide-react'
import { getInductee, createInductee, updateInductee } from '../api/fame'
import { getSwimmers } from '../api/swimmers'
import { getCountries } from '../api/core'
import { useToast } from '../context/ToastContext'
import { Button, Card, PageHeader, Input, Select, Textarea, FieldLabel } from '../components/ui'

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
    <div className="max-w-2xl mx-auto pb-6">
      <PageHeader
        breadcrumb={[{ label: 'Hall of Fame', to: '/hall-of-fame' }, { label: isEdit ? 'Edit' : 'New' }]}
        title={isEdit ? 'Edit Inductee' : 'Add Inductee'}
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <div className="space-y-4 sm:space-y-5">
            <section>
              <FieldLabel>Link to Swimmer (optional)</FieldLabel>
              {linkedSwimmer ? (
                <div className="flex items-center justify-between border border-aqua-100 rounded-sm ps-3 pe-2 py-2 bg-aqua-50">
                  <span className="text-body-sm text-ink-900">{linkedSwimmer.name}</span>
                  <button type="button" aria-label="Unlink swimmer" onClick={() => setLinkedSwimmer(null)} className="p-2 text-ink-400 hover:text-neg rounded-sm">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                  <Input type="text" value={swimmerQuery} onChange={(e) => setSwimmerQuery(e.target.value)}
                    className="ps-9" placeholder="Search swimmers in the database..." />
                  {swimmerResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-ink-100 rounded-md shadow-pop max-h-56 overflow-y-auto">
                      {swimmerResults.map((s) => (
                        <button key={s.id} type="button" onClick={() => selectSwimmer(s)}
                          className="w-full text-start px-3 py-2.5 text-body-sm text-ink-900 hover:bg-aqua-50">
                          {s.name}
                          {s.nationality_detail && <span className="text-ink-400"> · {s.nationality_detail.name}</span>}
                          {s.birth_year && <span className="text-ink-400"> · {s.birth_year}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Inductee Details</h3>
              <div className="flex items-center gap-3 sm:gap-5 mb-4">
                <label className="w-24 h-24 rounded-full bg-ink-50 border-2 border-dashed border-ink-200 flex items-center justify-center overflow-hidden cursor-pointer relative shrink-0 hover:border-aqua-500/40">
                  {photoPreview ? (
                    <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center text-ink-400"><ImagePlus size={20} className="mx-auto" /><div className="text-body-sm mt-1">Photo</div></div>
                  )}
                  <input type="file" accept="image/*" onChange={onPhotoSelect} className="absolute inset-0 opacity-0 cursor-pointer" />
                </label>
                <div className="flex-1">
                  <FieldLabel required>Name</FieldLabel>
                  <Input type="text" value={form.name} onChange={set('name')} placeholder="Legend's name" />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <FieldLabel required>Country</FieldLabel>
                  <Select value={form.country} onChange={set('country')}>
                    <option value="">— Select —</option>
                    {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Era</FieldLabel>
                  <Input type="text" value={form.era} onChange={set('era')} placeholder="1990s–2000s" />
                </div>
                <div>
                  <FieldLabel>Inducted Year</FieldLabel>
                  <Input type="number" value={form.inducted_year} onChange={set('inducted_year')} />
                </div>
                <div>
                  <FieldLabel>Display Order</FieldLabel>
                  <Input type="number" value={form.display_order} onChange={set('display_order')} />
                </div>
              </div>
            </section>

            <section className="border-t border-ink-100 pt-5">
              <FieldLabel>Achievements</FieldLabel>
              <Textarea value={form.achievements} onChange={set('achievements')} rows={6} placeholder="Titles, records, career highlights..." />
            </section>
          </div>
        </Card>

        <div className="sticky bottom-0 z-10 mt-4 rounded-md border border-ink-100 bg-white/95 backdrop-blur-sm shadow-pop px-4 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/hall-of-fame')}>Cancel</Button>
          <Button type="submit" icon={Save} loading={saving}>{isEdit ? 'Save Changes' : 'Add Inductee'}</Button>
        </div>
      </form>
    </div>
  )
}
