import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImagePlus } from 'lucide-react'
import { getArticle, createArticle, updateArticle } from '../api/news'
import { getCountries } from '../api/core'
import { useToast } from '../context/ToastContext'

export default function NewsFormPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [countries, setCountries] = useState([])
  const [saving, setSaving] = useState(false)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const [form, setForm] = useState({
    title: '', body: '', country: '', status: 'DRAFT', published_at: '',
  })

  useEffect(() => {
    getCountries().then((res) => setCountries(res.data)).catch(() => {})
    if (isEdit) {
      getArticle(id).then((res) => {
        const a = res.data
        setForm({
          title: a.title || '', body: a.body || '', country: a.country || '',
          status: a.status || 'DRAFT', published_at: a.published_at || '',
        })
        setCoverPreview(a.cover_image || null)
      }).catch(() => toast.error('Failed to load article'))
    }
  }, [id])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const onCoverSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setCoverFile(file)
      setCoverPreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('title', form.title)
      fd.append('body', form.body)
      fd.append('status', form.status)
      if (form.country) fd.append('country', form.country)
      if (form.published_at) fd.append('published_at', form.published_at)
      else if (form.status === 'PUBLISHED') fd.append('published_at', new Date().toISOString().slice(0, 10))
      if (coverFile) fd.append('cover_image', coverFile)
      if (isEdit) await updateArticle(id, fd)
      else await createArticle(fd)
      toast.success(isEdit ? 'Article updated' : 'Article created')
      navigate('/news')
    } catch {
      toast.error('Failed to save article')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/news')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={15} /> Back to News
      </button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Article' : 'New Article'}</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Cover Image</label>
          <label className="block h-44 rounded-lg bg-gray-50 border-2 border-dashed border-gray-300 overflow-hidden cursor-pointer relative">
            {coverPreview ? (
              <img src={coverPreview} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                <ImagePlus size={26} /> Click to upload a cover
              </div>
            )}
            <input type="file" accept="image/*" onChange={onCoverSelect} className="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Title *</label>
          <input type="text" value={form.title} onChange={set('title')}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Article headline" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Country</label>
            <select value={form.country} onChange={set('country')} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">— None —</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select value={form.status} onChange={set('status')} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Publish Date</label>
            <input type="date" value={form.published_at} onChange={set('published_at')}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Body</label>
          <textarea value={form.body} onChange={set('body')} rows={12}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Write the article..." />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/news')} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Article'}
          </button>
        </div>
      </form>
    </div>
  )
}
