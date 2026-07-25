import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImagePlus, FileUp } from 'lucide-react'
import { getCoach, createCoach, updateCoach } from '../api/coaches'
import { getCountries } from '../api/core'
import { useToast } from '../context/ToastContext'

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
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/coaches')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={15} /> Back to Coaches
      </button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Coach' : 'Add Coach'}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Info */}
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <h2 className="text-sm font-bold uppercase text-gray-400">Personal Information</h2>

          <div className="flex items-start gap-5">
            <label className="w-24 h-24 rounded-xl bg-gray-50 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden cursor-pointer relative shrink-0">
              {photoPreview ? (
                <img src={photoPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center text-gray-400">
                  <ImagePlus size={20} className="mx-auto" />
                  <div className="text-[10px] mt-1">Photo</div>
                </div>
              )}
              <input type="file" accept="image/*" onChange={e => {
                const f = e.target.files?.[0]
                if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)) }
              }} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <input type="text" value={form.name} onChange={set('name')}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Coach full name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nationality *</label>
                  <select value={form.nationality} onChange={set('nationality')} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">— Select —</option>
                    {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date of Birth</label>
                  <input type="date" value={form.date_of_birth} onChange={set('date_of_birth')}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">City</label>
            <input type="text" value={form.city} onChange={set('city')}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Current city" />
          </div>
        </div>

        {/* Professional Info */}
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <h2 className="text-sm font-bold uppercase text-gray-400">Professional Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Level</label>
              <select value={form.level} onChange={set('level')} className="w-full border rounded-lg px-3 py-2 text-sm">
                {LEVEL_CHOICES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Years of Experience</label>
              <input type="number" value={form.years_experience} onChange={set('years_experience')}
                className="w-full border rounded-lg px-3 py-2 text-sm" min="0" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Current Club</label>
              <input type="text" value={form.current_club} onChange={set('current_club')}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Specializations</label>
            <input type="text" value={form.specializations} onChange={set('specializations')}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Comma-separated, e.g. Sprint Freestyle, Open Water, Youth Development" />
            <p className="text-xs text-gray-400 mt-1">Separate with commas</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Certifications</label>
            <textarea value={form.certifications} onChange={set('certifications')} rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="One per line, e.g.&#10;ASCA Level 3&#10;World Aquatics Coach Certificate&#10;CPR / First Aid" />
            <p className="text-xs text-gray-400 mt-1">One certification per line</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Key Achievements</label>
            <textarea value={form.achievements} onChange={set('achievements')} rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="One per line, e.g.&#10;Coached 3 swimmers to Olympic qualification&#10;National team coach 2020-2024" />
            <p className="text-xs text-gray-400 mt-1">One achievement per line</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Bio</label>
            <textarea value={form.bio} onChange={set('bio')} rows={4}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Brief professional biography..." />
          </div>
        </div>

        {/* CV Upload */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase text-gray-400">Resume / CV</h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
              <FileUp size={18} className="text-gray-400" />
              <span className="text-sm text-gray-600">{cvFile ? cvFile.name : cvName || 'Upload PDF'}</span>
              <input type="file" accept=".pdf" onChange={e => {
                const f = e.target.files?.[0]
                if (f) { setCvFile(f); setCvName(f.name) }
              }} className="hidden" />
            </label>
            {(cvFile || cvName) && (
              <button type="button" onClick={() => { setCvFile(null); setCvName('') }}
                className="text-xs text-red-500 hover:text-red-700">Remove</button>
            )}
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <h2 className="text-sm font-bold uppercase text-gray-400">Contact Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input type="email" value={form.email} onChange={set('email')}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={set('phone')}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Instagram</label>
              <input type="text" value={form.instagram} onChange={set('instagram')}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="@handle" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">LinkedIn</label>
              <input type="url" value={form.linkedin} onChange={set('linkedin')}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://linkedin.com/in/..." />
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <h2 className="text-sm font-bold uppercase text-gray-400">Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Available for hire</label>
              <select value={String(form.is_available)} onChange={e => setForm(f => ({ ...f, is_available: e.target.value === 'true' }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="true">Yes - Open to offers</option>
                <option value="false">No - Not available</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Profile Active</label>
              <select value={String(form.is_active)} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/coaches')}
            className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Coach'}
          </button>
        </div>
      </form>
    </div>
  )
}
