import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Save, X } from 'lucide-react'
import { getSwimmer, createSwimmer, updateSwimmer } from '../api/swimmers'
import { getCountries } from '../api/core'
import PhotoUpload from '../components/common/PhotoUpload'
import { useToast } from '../context/ToastContext'
import { Button, Card, PageHeader, Input, Select, FieldLabel } from '../components/ui'

export default function SwimmerFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const isEdit = !!id
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(false)
  const [photoBlob, setPhotoBlob] = useState(null)
  const [form, setForm] = useState({
    name: '', date_of_birth: '', nationality: '', sex: 'M',
    club: '', email: '', phone: '', instagram_url: '', facebook_url: '', nicknames: [],
  })
  const [nicknameInput, setNicknameInput] = useState('')

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
    if (isEdit) {
      getSwimmer(id).then(res => {
        const s = res.data
        setForm({
          name: s.name, date_of_birth: s.date_of_birth, nationality: s.nationality,
          sex: s.sex, club: s.club || '', email: s.email || '', phone: s.phone || '',
          instagram_url: s.instagram_url || '', facebook_url: s.facebook_url || '',
          nicknames: s.nicknames?.map(n => n.nickname) || [],
          photo: s.photo,
        })
      }).catch(() => {})
    }
  }, [id, isEdit])

  const calcAge = () => {
    if (!form.date_of_birth) return ''
    const dob = new Date(form.date_of_birth)
    const today = new Date()
    let age = today.getFullYear() - dob.getFullYear()
    if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--
    return age
  }

  const addNickname = () => {
    if (nicknameInput.trim() && !form.nicknames.includes(nicknameInput.trim())) {
      setForm(prev => ({ ...prev, nicknames: [...prev.nicknames, nicknameInput.trim()] }))
      setNicknameInput('')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('name', form.name)
      formData.append('date_of_birth', form.date_of_birth)
      formData.append('nationality', form.nationality)
      formData.append('sex', form.sex)
      formData.append('email', form.email)
      formData.append('phone', form.phone)
      if (photoBlob) formData.append('photo', photoBlob, 'photo.jpg')

      const data = { ...form }
      delete data.photo

      if (isEdit) {
        await updateSwimmer(id, data)
      } else {
        await createSwimmer(data)
      }
      navigate('/swimmers')
    } catch (err) {
      toast.error('Error saving swimmer: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-6">
      <PageHeader
        breadcrumb={[{ label: 'Swimmers', to: '/swimmers' }, { label: isEdit ? 'Edit' : 'New' }]}
        title={`${isEdit ? 'Edit' : 'Add'} Swimmer`}
        subtitle={isEdit ? form.name : undefined}
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <div className="space-y-6">
            <section>
              <h3 className="text-label text-ink-400 mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:gap-6">
                <div>
                  <FieldLabel>Profile Photo</FieldLabel>
                  <PhotoUpload currentPhoto={form.photo} onPhotoChange={setPhotoBlob} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>Name</FieldLabel>
                    <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <FieldLabel required>Date of Birth</FieldLabel>
                      <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} required />
                    </div>
                    <div className="w-16">
                      <FieldLabel>Age</FieldLabel>
                      <span className="text-time-lg text-ink-900">{calcAge()}</span>
                    </div>
                  </div>
                  <div>
                    <FieldLabel required>Nationality</FieldLabel>
                    <Select value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} required>
                      <option value="">Select country</option>
                      {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </div>
                  <div>
                    <FieldLabel required>Sex</FieldLabel>
                    <div className="flex gap-5 h-10 items-center">
                      <label className="flex items-center gap-2 text-body-sm text-ink-900">
                        <input type="radio" name="sex" value="M" checked={form.sex === 'M'} onChange={(e) => setForm({ ...form, sex: e.target.value })} className="accent-aqua-600 w-4 h-4" /> Male
                      </label>
                      <label className="flex items-center gap-2 text-body-sm text-ink-900">
                        <input type="radio" name="sex" value="F" checked={form.sex === 'F'} onChange={(e) => setForm({ ...form, sex: e.target.value })} className="accent-aqua-600 w-4 h-4" /> Female
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Nicknames</h3>
              <div className="flex gap-2 mb-3">
                <Input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder="Add a nickname..."
                  className="flex-1"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNickname() } }}
                />
                <Button type="button" variant="secondary" icon={Plus} onClick={addNickname}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {form.nicknames.map((nick, i) => (
                  <span key={i} className="bg-ink-50 border border-ink-100 text-ink-900 px-3 py-1.5 rounded-full text-body-sm flex items-center gap-1.5">
                    {nick}
                    <button
                      type="button"
                      aria-label={`Remove ${nick}`}
                      onClick={() => setForm({ ...form, nicknames: form.nicknames.filter((_, j) => j !== i) })}
                      className="text-ink-400 hover:text-neg p-0.5"
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            </section>

            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Club</h3>
              <Input type="text" value={form.club} onChange={(e) => setForm({ ...form, club: e.target.value })} placeholder="Enter club name" />
            </section>

            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Contact Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Email</FieldLabel>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Enter email (optional)" />
                </div>
                <div>
                  <FieldLabel>Phone Number</FieldLabel>
                  <Input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Enter phone number (optional)" />
                </div>
              </div>
            </section>

            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Social Media</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Instagram Link</FieldLabel>
                  <Input type="url" value={form.instagram_url} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} placeholder="https://instagram.com/... (optional)" />
                </div>
                <div>
                  <FieldLabel>Facebook Link</FieldLabel>
                  <Input type="url" value={form.facebook_url} onChange={(e) => setForm({ ...form, facebook_url: e.target.value })} placeholder="https://facebook.com/... (optional)" />
                </div>
              </div>
            </section>
          </div>
        </Card>

        <div className="sticky bottom-0 z-10 mt-4 rounded-md border border-ink-100 bg-white/95 backdrop-blur-sm shadow-pop px-4 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/swimmers')}>Cancel</Button>
          <Button type="submit" icon={Save} loading={loading}>Save Changes</Button>
        </div>
      </form>
    </div>
  )
}
