import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ImagePlus, FileUp, Save, Trash2 } from 'lucide-react'
import { getCoach, createCoach, updateCoach } from '../api/coaches'
import { getCountries } from '../api/core'
import { useToast } from '../context/ToastContext'
import { Button, Card, PageHeader, Input, Select, Textarea, FieldLabel } from '../components/ui'

const LEVEL_CHOICES = [
  { value: '', label: '— Select —' },
  { value: 'HEAD', label: 'Head Coach' },
  { value: 'ASSISTANT', label: 'Assistant Coach' },
  { value: 'TECHNIQUE', label: 'Technique Coach' },
  { value: 'FITNESS', label: 'Fitness / S&C Coach' },
  { value: 'YOUTH', label: 'Youth Development Coach' },
  { value: 'PRIVATE', label: 'Private Coach' },
]

export default function CoachFormPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [countries, setCountries] = useState([])
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [cvFile, setCvFile] = useState(null)
  const [cvName, setCvName] = useState('')
  const [form, setForm] = useState({
    name: '', nationality: '', date_of_birth: '', city: '',
    level: '', years_experience: '', current_club: '',
    specializations: '', certifications: '', bio: '', achievements: '',
    email: '', phone: '', instagram: '', linkedin: '',
    is_available: true, is_active: true,
  })

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
    if (isEdit) {
      getCoach(id).then(res => {
        const c = res.data
        setForm({
          name: c.name || '', nationality: c.nationality || '',
          date_of_birth: c.date_of_birth || '', city: c.city || '',
          level: c.level || '', years_experience: c.years_experience ?? '',
          current_club: c.current_club || '', specializations: c.specializations || '',
          certifications: c.certifications || '', bio: c.bio || '',
          achievements: c.achievements || '', email: c.email || '',
          phone: c.phone || '', instagram: c.instagram || '',
          linkedin: c.linkedin || '', is_available: c.is_available,
          is_active: c.is_active,
        })
        setPhotoPreview(c.photo || null)
        if (c.cv_file) setCvName(c.cv_file.split('/').pop())
      }).catch(() => toast.error('Failed to load coach'))
    }
  }, [id])

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Name is required'); return }
    if (!form.nationality) { toast.error('Nationality is required'); return }
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) fd.append(k, v)
      })
      if (photoFile) fd.append('photo', photoFile)
      if (cvFile) fd.append('cv_file', cvFile)
      if (isEdit) await updateCoach(id, fd)
      else await createCoach(fd)
      toast.success(isEdit ? 'Coach updated' : 'Coach created')
      navigate('/coaches')
    } catch {
      toast.error('Failed to save coach')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-6">
      <PageHeader
        breadcrumb={[{ label: 'Coaches', to: '/coaches' }, { label: isEdit ? 'Edit' : 'New' }]}
        title={isEdit ? 'Edit Coach' : 'Add Coach'}
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <div className="space-y-6">
            {/* Personal Info */}
            <section>
              <h3 className="text-label text-ink-400 mb-4">Personal Information</h3>

              <div className="flex items-start gap-5 mb-4">
                <label className="w-24 h-24 rounded-md bg-ink-50 border-2 border-dashed border-ink-200 flex items-center justify-center overflow-hidden cursor-pointer relative shrink-0 hover:border-aqua-500/40">
                  {photoPreview ? (
                    <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center text-ink-400">
                      <ImagePlus size={20} className="mx-auto" />
                      <div className="text-body-sm mt-1">Photo</div>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)) }
                  }} className="absolute inset-0 opacity-0 cursor-pointer" />
                </label>
                <div className="flex-1 space-y-4">
                  <div>
                    <FieldLabel required>Full Name</FieldLabel>
                    <Input type="text" value={form.name} onChange={set('name')} placeholder="Coach full name" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel required>Nationality</FieldLabel>
                      <Select value={form.nationality} onChange={set('nationality')}>
                        <option value="">— Select —</option>
                        {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </div>
                    <div>
                      <FieldLabel>Date of Birth</FieldLabel>
                      <Input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <FieldLabel>City</FieldLabel>
                <Input type="text" value={form.city} onChange={set('city')} placeholder="Current city" />
              </div>
            </section>

            {/* Professional Info */}
            <section className="border-t border-ink-100 pt-5 space-y-4">
              <h3 className="text-label text-ink-400">Professional Details</h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <FieldLabel>Level</FieldLabel>
                  <Select value={form.level} onChange={set('level')}>
                    {LEVEL_CHOICES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Years of Experience</FieldLabel>
                  <Input type="number" value={form.years_experience} onChange={set('years_experience')} min="0" />
                </div>
                <div>
                  <FieldLabel>Current Club</FieldLabel>
                  <Input type="text" value={form.current_club} onChange={set('current_club')} />
                </div>
              </div>

              <div>
                <FieldLabel>Specializations</FieldLabel>
                <Input type="text" value={form.specializations} onChange={set('specializations')}
                  placeholder="Comma-separated, e.g. Sprint Freestyle, Open Water, Youth Development" />
                <p className="text-body-sm text-ink-400 mt-1.5">Separate with commas</p>
              </div>

              <div>
                <FieldLabel>Certifications</FieldLabel>
                <Textarea value={form.certifications} onChange={set('certifications')} rows={3}
                  placeholder="One per line, e.g.&#10;ASCA Level 3&#10;World Aquatics Coach Certificate&#10;CPR / First Aid" />
                <p className="text-body-sm text-ink-400 mt-1.5">One certification per line</p>
              </div>

              <div>
                <FieldLabel>Key Achievements</FieldLabel>
                <Textarea value={form.achievements} onChange={set('achievements')} rows={3}
                  placeholder="One per line, e.g.&#10;Coached 3 swimmers to Olympic qualification&#10;National team coach 2020-2024" />
                <p className="text-body-sm text-ink-400 mt-1.5">One achievement per line</p>
              </div>

              <div>
                <FieldLabel>Bio</FieldLabel>
                <Textarea value={form.bio} onChange={set('bio')} rows={4}
                  placeholder="Brief professional biography..." />
              </div>
            </section>

            {/* CV Upload */}
            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Resume / CV</h3>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 bg-ink-50 border-2 border-dashed border-ink-200 rounded-sm px-4 py-3 cursor-pointer hover:border-aqua-500/40 hover:bg-aqua-50 transition-colors min-h-10">
                  <FileUp size={18} className="text-ink-400" />
                  <span className="text-body-sm text-ink-500">{cvFile ? cvFile.name : cvName || 'Upload PDF'}</span>
                  <input type="file" accept=".pdf" onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) { setCvFile(f); setCvName(f.name) }
                  }} className="hidden" />
                </label>
                {(cvFile || cvName) && (
                  <Button type="button" variant="ghost" size="sm" icon={Trash2}
                    onClick={() => { setCvFile(null); setCvName('') }} className="text-neg hover:text-neg">
                    Remove
                  </Button>
                )}
              </div>
            </section>

            {/* Contact */}
            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Contact Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Email</FieldLabel>
                  <Input type="email" value={form.email} onChange={set('email')} />
                </div>
                <div>
                  <FieldLabel>Phone</FieldLabel>
                  <Input type="text" value={form.phone} onChange={set('phone')} />
                </div>
                <div>
                  <FieldLabel>Instagram</FieldLabel>
                  <Input type="text" value={form.instagram} onChange={set('instagram')} placeholder="@handle" />
                </div>
                <div>
                  <FieldLabel>LinkedIn</FieldLabel>
                  <Input type="url" value={form.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/..." />
                </div>
              </div>
            </section>

            {/* Status */}
            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Status</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Available for hire</FieldLabel>
                  <Select value={String(form.is_available)} onChange={e => setForm(f => ({ ...f, is_available: e.target.value === 'true' }))}>
                    <option value="true">Yes - Open to offers</option>
                    <option value="false">No - Not available</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Profile Active</FieldLabel>
                  <Select value={String(form.is_active)} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </Select>
                </div>
              </div>
            </section>
          </div>
        </Card>

        <div className="sticky bottom-0 z-10 mt-4 rounded-md border border-ink-100 bg-white/95 backdrop-blur-sm shadow-pop px-4 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/coaches')}>Cancel</Button>
          <Button type="submit" icon={Save} loading={saving}>{isEdit ? 'Save Changes' : 'Create Coach'}</Button>
        </div>
      </form>
    </div>
  )
}
