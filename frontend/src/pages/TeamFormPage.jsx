import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTeam, createTeam, updateTeam } from '../api/teams'
import { getCountries } from '../api/core'

export default function TeamFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [countries, setCountries] = useState([])
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '', country: '', founded_year: '', website: '', address: '',
    email: '', phone: '', is_national_team: false,
  })
  const [logo, setLogo] = useState(null)
  const [banner, setBanner] = useState(null)
  const [trophies, setTrophies] = useState([])

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
    if (isEdit) {
      getTeam(id).then(res => {
        const t = res.data
        setForm({
          name: t.name || '', country: t.country?.toString() || '',
          founded_year: t.founded_year?.toString() || '', website: t.website || '',
          address: t.address || '', email: t.email || '', phone: t.phone || '',
          is_national_team: t.is_national_team || false,
        }).catch(() => {})
        setTrophies(t.trophies || [])
      })
    }
  }, [id])

  const addTrophy = () => setTrophies(prev => [...prev, { name: '', year: '' }])
  const removeTrophy = (i) => setTrophies(prev => prev.filter((_, idx) => idx !== i))
  const updateTrophy = (i, field, value) => {
    setTrophies(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const formData = new FormData()
      formData.append('name', form.name)
      formData.append('country', form.country)
      if (form.founded_year) formData.append('founded_year', form.founded_year)
      formData.append('website', form.website)
      formData.append('address', form.address)
      formData.append('email', form.email)
      formData.append('phone', form.phone)
      formData.append('is_national_team', form.is_national_team)
      if (logo) formData.append('logo', logo)
      if (banner) formData.append('banner', banner)

      const validTrophies = trophies.filter(t => t.name && t.year)
      formData.append('trophies_data', JSON.stringify(validTrophies))

      if (isEdit) {
        await updateTeam(id, formData)
      } else {
        await createTeam(formData)
      }
      navigate('/teams')
    } catch (err) {
      const data = err.response?.data
      if (data) {
        if (data.detail) {
          setError(data.detail)
        } else if (typeof data === 'object') {
          const msgs = Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          setError(msgs.join('. '))
        } else {
          setError(err.message)
        }
      } else {
        setError(err.message)
      }
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/teams')} className="text-gray-500 hover:text-gray-700">&larr; Back</button>
        <h1 className="text-2xl font-bold">{isEdit ? 'Edit Team' : 'New Team'}</h1>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Team Name *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Country *</label>
            <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm" required>
              <option value="">Select country</option>
              {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Founded Year</label>
            <input type="number" value={form.founded_year} onChange={(e) => setForm({ ...form, founded_year: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. 1947" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Website</label>
            <input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://..." />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Address</label>
            <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Logo</label>
            <input type="file" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] || null)}
              className="w-full text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Banner</label>
            <input type="file" accept="image/*" onChange={(e) => setBanner(e.target.files?.[0] || null)}
              className="w-full text-sm" />
          </div>

          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_national_team}
                onChange={(e) => setForm({ ...form, is_national_team: e.target.checked })} />
              <span className="font-medium">National Team</span>
            </label>
          </div>
        </div>

        {/* Trophies */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Trophies</h3>
            <button type="button" onClick={addTrophy} className="text-blue-600 text-sm hover:text-blue-800">+ Add Trophy</button>
          </div>
          {trophies.map((t, i) => (
            <div key={i} className="flex gap-3 mb-2">
              <input type="text" value={t.name} onChange={(e) => updateTrophy(i, 'name', e.target.value)}
                placeholder="Trophy name" className="flex-1 border rounded-lg px-3 py-2 text-sm" />
              <input type="number" value={t.year} onChange={(e) => updateTrophy(i, 'year', e.target.value)}
                placeholder="Year" className="w-24 border rounded-lg px-3 py-2 text-sm" />
              <button type="button" onClick={() => removeTrophy(i)} className="text-red-500 hover:text-red-700 text-sm">Remove</button>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button type="button" onClick={() => navigate('/teams')} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            {isEdit ? 'Save Changes' : 'Create Team'}
          </button>
        </div>
      </form>
    </div>
  )
}
