import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getChampionship, createChampionship, updateChampionship, getClassificationCategories, getClassifications, getSubClassifications } from '../api/championships'
import { getCountries } from '../api/core'
import { POOL_TYPES } from '../utils/constants'

export default function ChampionshipFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id
  const [countries, setCountries] = useState([])
  const [categories, setCategories] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', date: '', end_date: '', pool: 'LCM', country: '', location: '', classification_category: '', classification: '', sub_classification: '' })

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
    getClassificationCategories().then(res => setCategories(res.data)).catch(() => {})
    if (isEdit) {
      getChampionship(id).then(res => {
        const c = res.data
        setForm({ name: c.name, date: c.date, end_date: c.end_date || '', pool: c.pool, country: c.country, location: c.location || '', classification_category: c.classification_category || '', classification: c.classification || '', sub_classification: c.sub_classification || '' }).catch(() => {})
      })
    }
  }, [id, isEdit])

  useEffect(() => {
    if (form.classification_category) {
      getClassifications(form.classification_category).then(res => setClassifications(res.data)).catch(() => {})
    } else {
      setClassifications([])
    }
  }, [form.classification_category])

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
      const data = { ...form }
      if (!data.end_date) delete data.end_date
      if (!data.classification_category) delete data.classification_category
      if (!data.classification) delete data.classification
      if (!data.sub_classification) delete data.sub_classification
      if (isEdit) {
        await updateChampionship(id, data)
      } else {
        await createChampionship(data)
      }
      navigate('/championships')
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/championships')} className="text-gray-500">← Back</button>
          <h1 className="text-xl font-bold">{isEdit ? 'Edit' : 'Add'} Championship</h1>
        </div>
        <button onClick={handleSubmit} disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm">💾 Save Data</button>
      </div>
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Country *</label>
            <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required>
              <option value="">Select country</option>
              {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Pool *</label>
            <select value={form.pool} onChange={(e) => setForm({ ...form, pool: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
              {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start Date *</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Location</label>
            <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="City / Venue" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="border-t pt-4">
          <h3 className="font-medium mb-4">Classification</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select value={form.classification_category} onChange={(e) => setForm({ ...form, classification_category: e.target.value, classification: '', sub_classification: '' })} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Classification</label>
              <select value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value, sub_classification: '' })} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!classifications.length}>
                <option value="">Select...</option>
                {classifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sub Classification</label>
              <select value={form.sub_classification} onChange={(e) => setForm({ ...form, sub_classification: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!subClassifications.length}>
                <option value="">Select...</option>
                {subClassifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
