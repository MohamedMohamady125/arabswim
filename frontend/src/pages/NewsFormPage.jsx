import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ImagePlus, Save } from 'lucide-react'
import { getArticle, createArticle, updateArticle } from '../api/news'
import { getCountries } from '../api/core'
import { useToast } from '../context/ToastContext'
import { Button, Card, PageHeader, Input, Select, Textarea, FieldLabel } from '../components/ui'

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
    <div className="max-w-2xl mx-auto pb-6">
      <PageHeader
        breadcrumb={[{ label: 'News', to: '/news' }, { label: isEdit ? 'Edit' : 'New' }]}
        title={isEdit ? 'Edit Article' : 'New Article'}
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <div className="space-y-5">
            <div>
              <FieldLabel>Cover Image</FieldLabel>
              <label className="block h-44 rounded-md bg-ink-50 border-2 border-dashed border-ink-200 overflow-hidden cursor-pointer relative hover:border-aqua-500/40">
                {coverPreview ? (
                  <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-ink-400 text-body-sm gap-2">
                    <ImagePlus size={26} /> Click to upload a cover
                  </div>
                )}
                <input type="file" accept="image/*" onChange={onCoverSelect} className="absolute inset-0 opacity-0 cursor-pointer" />
              </label>
            </div>

            <div>
              <FieldLabel required>Title</FieldLabel>
              <Input type="text" value={form.title} onChange={set('title')} placeholder="Article headline" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <FieldLabel>Country</FieldLabel>
                <Select value={form.country} onChange={set('country')}>
                  <option value="">— None —</option>
                  {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel>Status</FieldLabel>
                <Select value={form.status} onChange={set('status')}>
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                </Select>
              </div>
              <div>
                <FieldLabel>Publish Date</FieldLabel>
                <Input type="date" value={form.published_at} onChange={set('published_at')} />
              </div>
            </div>

            <div>
              <FieldLabel>Body</FieldLabel>
              <Textarea value={form.body} onChange={set('body')} rows={12} placeholder="Write the article..." />
            </div>
          </div>
        </Card>

        <div className="sticky bottom-0 z-10 mt-4 rounded-md border border-ink-100 bg-white/95 backdrop-blur-sm shadow-pop px-4 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/news')}>Cancel</Button>
          <Button type="submit" icon={Save} loading={saving}>{isEdit ? 'Save Changes' : 'Create Article'}</Button>
        </div>
      </form>
    </div>
  )
}
