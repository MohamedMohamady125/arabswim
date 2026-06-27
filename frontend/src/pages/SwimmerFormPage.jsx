import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSwimmer, createSwimmer, updateSwimmer } from '../api/swimmers'
import { getCountries } from '../api/core'
import PhotoUpload from '../components/common/PhotoUpload'

export default function SwimmerFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(false)
  const [photoBlob, setPhotoBlob] = useState(null)
  const [form, setForm] = useState({
    name: '', date_of_birth: '', nationality: '', sex: 'M',
    club: '', email: '', phone: '', nicknames: [],
  })
  const [nicknameInput, setNicknameInput] = useState('')

  useEffect(() => {
    getCountries().then(res => setCountries(res.data))
    if (isEdit) {
      getSwimmer(id).then(res => {
        const s = res.data
        setForm({
          name: s.name, date_of_birth: s.date_of_birth, nationality: s.nationality,
          sex: s.sex, club: s.club || '', email: s.email || '', phone: s.phone || '',
          nicknames: s.nicknames?.map(n => n.nickname) || [],
          photo: s.photo,
        })
      })
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
      alert('Error saving swimmer: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/swimmers')} className="text-gray-500 hover:text-gray-700">← Back</button>
          <h1 className="text-xl font-bold text-blue-600">{isEdit ? 'Edit' : 'Add'} Swimmer</h1>
          {isEdit && <span className="text-gray-500">{form.name}</span>}
        </div>
        <button onClick={handleSubmit} disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
          💾 Save Changes
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-1">Swimmer Information</h2>
          <p className="text-sm text-gray-500 mb-4">Update swimmer details. Fields marked with * are required.</p>
        </div>

        <div className="border-t pt-4">
          <h3 className="font-medium mb-4">Basic Information</h3>
          <div className="grid grid-cols-[auto_1fr] gap-6">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Profile Photo</label>
              <PhotoUpload currentPhoto={form.photo} onPhotoChange={setPhotoBlob} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Date of Birth *</label>
                  <input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required />
                </div>
                <div className="w-16">
                  <label className="block text-sm font-medium mb-1">Age:</label>
                  <span className="text-lg font-semibold">{calcAge()}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nationality *</label>
                <select value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required>
                  <option value="">Select country</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Sex *</label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2"><input type="radio" name="sex" value="M" checked={form.sex === 'M'} onChange={(e) => setForm({ ...form, sex: e.target.value })} /> Male</label>
                  <label className="flex items-center gap-2"><input type="radio" name="sex" value="F" checked={form.sex === 'F'} onChange={(e) => setForm({ ...form, sex: e.target.value })} /> Female</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <label className="block text-sm font-medium mb-2">Nicknames</label>
          <div className="flex gap-2 mb-2">
            <input type="text" value={nicknameInput} onChange={(e) => setNicknameInput(e.target.value)} placeholder="Add a nickname..." className="border rounded-lg px-3 py-1.5 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNickname() } }} />
            <button type="button" onClick={addNickname} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm">+ Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.nicknames.map((nick, i) => (
              <span key={i} className="bg-gray-100 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                {nick}
                <button type="button" onClick={() => setForm({ ...form, nicknames: form.nicknames.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500">×</button>
              </span>
            ))}
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="font-medium mb-4">Club</h3>
          <div>
            <input type="text" value={form.club} onChange={(e) => setForm({ ...form, club: e.target.value })} placeholder="Enter club name" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="font-medium mb-4">Contact Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Enter email (optional)" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone Number</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Enter phone number (optional)" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

      </form>
    </div>
  )
}
