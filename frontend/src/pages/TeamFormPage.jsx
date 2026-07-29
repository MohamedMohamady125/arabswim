import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Save, Trash2 } from 'lucide-react'
import { getTeam, createTeam, updateTeam } from '../api/teams'
import { getCountries } from '../api/core'
import { Button, Card, PageHeader, Input, Select, Textarea, FieldLabel } from '../components/ui'

const FILE_INPUT =
  'block w-full text-body-sm text-ink-500 file:me-3 file:h-9 file:px-3 file:rounded-sm file:border-0 ' +
  'file:bg-ink-50 file:text-ink-900 file:text-body-sm file:font-medium file:cursor-pointer cursor-pointer ' +
  'rounded-sm border border-ink-200 bg-white'

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
    <div className="max-w-2xl mx-auto pb-6">
      <PageHeader
        breadcrumb={[{ label: 'Teams', to: '/teams' }, { label: isEdit ? 'Edit' : 'New' }]}
        title={isEdit ? 'Edit Team' : 'New Team'}
      />

      {error && (
        <div className="bg-neg/10 border border-neg/20 text-neg text-body-sm p-4 rounded-md mb-4">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <div className="space-y-5 sm:space-y-6">
            <section>
              <h3 className="text-label text-ink-400 mb-4">Team Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="sm:col-span-2">
                  <FieldLabel required>Team Name</FieldLabel>
                  <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <FieldLabel required>Country</FieldLabel>
                  <Select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} required>
                    <option value="">Select country</option>
                    {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Founded Year</FieldLabel>
                  <Input type="number" value={form.founded_year} onChange={(e) => setForm({ ...form, founded_year: e.target.value })} placeholder="e.g. 1947" />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-body-sm text-ink-900 py-1">
                    <input type="checkbox" checked={form.is_national_team}
                      onChange={(e) => setForm({ ...form, is_national_team: e.target.checked })}
                      className="accent-aqua-600 w-4 h-4" />
                    <span className="font-medium">National Team</span>
                  </label>
                </div>
              </div>
            </section>

            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Contact</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <FieldLabel>Website</FieldLabel>
                  <Input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
                </div>
                <div>
                  <FieldLabel>Email</FieldLabel>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>Phone</FieldLabel>
                  <Input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Address</FieldLabel>
                  <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
                </div>
              </div>
            </section>

            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Media</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <FieldLabel>Logo</FieldLabel>
                  <input type="file" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] || null)} className={FILE_INPUT} />
                </div>
                <div>
                  <FieldLabel>Banner</FieldLabel>
                  <input type="file" accept="image/*" onChange={(e) => setBanner(e.target.files?.[0] || null)} className={FILE_INPUT} />
                </div>
              </div>
            </section>

            <section className="border-t border-ink-100 pt-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-label text-ink-400">Trophies</h3>
                <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addTrophy}>Add Trophy</Button>
              </div>
              <div className="space-y-2">
                {trophies.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <Input type="text" value={t.name} onChange={(e) => updateTrophy(i, 'name', e.target.value)}
                      placeholder="Trophy name" className="flex-1" />
                    <Input type="number" value={t.year} onChange={(e) => updateTrophy(i, 'year', e.target.value)}
                      placeholder="Year" className="w-24" />
                    <Button type="button" variant="ghost" icon={Trash2} aria-label="Remove trophy"
                      onClick={() => removeTrophy(i)} className="text-neg hover:text-neg" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        </Card>

        <div className="sticky bottom-0 z-10 mt-4 rounded-md border border-ink-100 bg-white/95 backdrop-blur-sm shadow-pop px-4 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/teams')}>Cancel</Button>
          <Button type="submit" icon={Save}>{isEdit ? 'Save Changes' : 'Create Team'}</Button>
        </div>
      </form>
    </div>
  )
}
