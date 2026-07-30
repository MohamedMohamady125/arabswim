import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save } from 'lucide-react'
import { getChampionship, createChampionship, updateChampionship, getClassifications, getSubClassifications } from '../api/championships'
import { getCountries } from '../api/core'
import { POOL_TYPES, mediaUrl } from '../utils/constants'
import { useToast } from '../context/ToastContext'
import { Button, Card, PageHeader, Input, Select, FieldLabel } from '../components/ui'

const FILE_INPUT =
  'block w-full text-body-sm text-ink-500 file:me-3 file:h-9 file:px-3 file:rounded-sm file:border-0 ' +
  'file:bg-ink-50 file:text-ink-900 file:text-body-sm file:font-medium file:cursor-pointer cursor-pointer ' +
  'rounded-sm border border-ink-200 bg-white'

export default function ChampionshipFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const isEdit = !!id
  const [countries, setCountries] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', date: '', end_date: '', pool: 'LCM', country: '', location: '', classification: '', sub_classification: '', website: '', live_results_url: '', registration_url: '' })
  const [policyPdf, setPolicyPdf] = useState(null)
  const [meetGuidePdf, setMeetGuidePdf] = useState(null)
  const [meetPhoto, setMeetPhoto] = useState(null)
  const [currentPhoto, setCurrentPhoto] = useState(null)

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
    getClassifications().then(res => setClassifications(res.data)).catch(() => {})
    if (isEdit) {
      getChampionship(id).then(res => {
        const c = res.data
        setForm({ name: c.name, date: c.date, end_date: c.end_date || '', pool: c.pool, country: c.country, location: c.location || '', classification: c.classification || '', sub_classification: c.sub_classification || '', website: c.website || '', live_results_url: c.live_results_url || '', registration_url: c.registration_url || '' })
        setCurrentPhoto(c.meet_photo || null)
      }).catch(() => {})
    }
  }, [id, isEdit])

  useEffect(() => {
    if (form.classification) {
      getSubClassifications(form.classification).then(res => setSubClassifications(res.data)).catch(() => {})
    } else {
      setSubClassifications([])
    }
  }, [form.classification])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const data = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '' && v !== null) data.append(k, v)
      })
      if (policyPdf) data.append('policy_pdf', policyPdf)
      if (meetGuidePdf) data.append('meet_guide_pdf', meetGuidePdf)
      if (meetPhoto) data.append('meet_photo', meetPhoto)
      if (isEdit) {
        await updateChampionship(id, data)
      } else {
        await createChampionship(data)
      }
      navigate('/championships')
    } catch (err) {
      toast.error('Error: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-6">
      <PageHeader
        breadcrumb={[{ label: 'Championships', to: '/championships' }, { label: isEdit ? 'Edit' : 'New' }]}
        title={`${isEdit ? 'Edit' : 'Add'} Championship`}
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <div className="space-y-4 sm:space-y-5">
            <section>
              <h3 className="text-label text-ink-400 mb-4">Meet Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="sm:col-span-2">
                  <FieldLabel required>Name</FieldLabel>
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
                  <FieldLabel required>Pool</FieldLabel>
                  <Select value={form.pool} onChange={(e) => setForm({ ...form, pool: e.target.value })}>
                    {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </Select>
                </div>
                <div>
                  <FieldLabel required>Start Date</FieldLabel>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                </div>
                <div>
                  <FieldLabel>End Date</FieldLabel>
                  <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Location</FieldLabel>
                  <Input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="City / Venue" />
                </div>
              </div>
            </section>

            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Links &amp; Documents</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <FieldLabel>Website</FieldLabel>
                  <Input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
                </div>
                <div>
                  <FieldLabel>Live Results URL</FieldLabel>
                  <Input type="url" value={form.live_results_url} onChange={(e) => setForm({ ...form, live_results_url: e.target.value })} placeholder="https://..." />
                </div>
                <div>
                  <FieldLabel>Registration URL</FieldLabel>
                  <Input type="url" value={form.registration_url} onChange={(e) => setForm({ ...form, registration_url: e.target.value })} placeholder="https://..." />
                </div>
                <div>
                  <FieldLabel>Policy PDF (Nashra)</FieldLabel>
                  <input type="file" accept=".pdf" onChange={(e) => setPolicyPdf(e.target.files[0])} className={FILE_INPUT} />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Meet Guide PDF</FieldLabel>
                  <input type="file" accept=".pdf" onChange={(e) => setMeetGuidePdf(e.target.files[0])} className={FILE_INPUT} />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Meet Photo</FieldLabel>
                  {currentPhoto && !meetPhoto && (
                    <img src={mediaUrl(currentPhoto)} alt="Current meet" className="w-32 h-20 rounded-sm object-cover border border-ink-100 mb-2" />
                  )}
                  {meetPhoto && (
                    <img src={URL.createObjectURL(meetPhoto)} alt="New meet" className="w-32 h-20 rounded-sm object-cover border border-ink-100 mb-2" />
                  )}
                  <input type="file" accept="image/*" onChange={(e) => setMeetPhoto(e.target.files[0])} className={FILE_INPUT} />
                </div>
              </div>
            </section>

            <section className="border-t border-ink-100 pt-5">
              <h3 className="text-label text-ink-400 mb-4">Classification</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <FieldLabel>Classification</FieldLabel>
                  <Select value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value, sub_classification: '' })} disabled={!classifications.length}>
                    <option value="">Select...</option>
                    {classifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Sub Classification</FieldLabel>
                  <Select value={form.sub_classification} onChange={(e) => setForm({ ...form, sub_classification: e.target.value })} disabled={!subClassifications.length}>
                    <option value="">Select...</option>
                    {subClassifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
              </div>
            </section>
          </div>
        </Card>

        <div className="sticky bottom-0 z-10 mt-4 rounded-md border border-ink-100 bg-white/95 backdrop-blur-sm shadow-pop px-4 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/championships')}>Cancel</Button>
          <Button type="submit" icon={Save} loading={loading}>{isEdit ? 'Save Changes' : 'Save Championship'}</Button>
        </div>
      </form>
    </div>
  )
}
