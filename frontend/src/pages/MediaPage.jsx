import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Image, Plus, Trash2 } from 'lucide-react'
import { getAlbums, createAlbum, deleteAlbum } from '../api/media'
import { getChampionships } from '../api/championships'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { Button, Modal, Input, Select, Textarea, FieldLabel, EmptyState, ConfirmDialog, CardsSkeleton, PageHeader } from '../components/ui'

export default function MediaPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const championshipFilter = searchParams.get('championship') || ''
  const toast = useToast()
  const { token } = useAuth()
  const isAdmin = !!token
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [championships, setChampionships] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', championship: '' })
  const [pendingDelete, setPendingDelete] = useState(null)

  const load = () => {
    const params = championshipFilter ? { championship: championshipFilter } : {}
    getAlbums(params).then((res) => {
      setAlbums(Array.isArray(res.data) ? res.data : res.data.results || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(load, [])

  useEffect(() => {
    if (showModal && championships.length === 0) {
      getChampionships({ page_size: 200 }).then((res) => {
        setChampionships(Array.isArray(res.data) ? res.data : res.data.results || [])
      }).catch(() => {})
    }
  }, [showModal])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const res = await createAlbum({ ...form, championship: form.championship || null })
      toast.success('Album created')
      setShowModal(false)
      setForm({ title: '', description: '', championship: '' })
      navigate(`/media/albums/${res.data.id}`)
    } catch {
      toast.error('Failed to create album')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (album) => {
    try {
      await deleteAlbum(album.id)
      setAlbums((prev) => prev.filter((a) => a.id !== album.id))
      toast.success('Album deleted')
    } catch {
      toast.error('Failed to delete album')
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      <PageHeader
        title="Media"
        subtitle={`${albums.length} album${albums.length === 1 ? '' : 's'}`}
        action={isAdmin && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setShowModal(true)}>
            New Album
          </Button>
        )}
      />

      {loading ? (
        <CardsSkeleton count={8} />
      ) : albums.length === 0 ? (
        <div className="bg-white rounded-md shadow-card border border-ink-100">
          <EmptyState icon={Image} title="No albums yet" hint="Photos and videos from championships will appear here." />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {albums.map((a) => (
            <div key={a.id}
              className="group bg-white rounded-md shadow-card border border-ink-100 overflow-hidden transition-colors hover:border-aqua-500/40">
              <div className="aspect-[4/3] bg-ink-50 cursor-pointer relative" onClick={() => navigate(`/media/albums/${a.id}`)}>
                {a.cover ? (
                  <img src={a.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-ink-200">
                    <Image size={32} />
                  </div>
                )}
                {isAdmin && (
                  <button onClick={(e) => { e.stopPropagation(); setPendingDelete(a) }}
                    aria-label="Delete album"
                    className="absolute top-2 end-2 bg-ink-950/60 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-neg transition-opacity">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="p-3 cursor-pointer min-h-14" onClick={() => navigate(`/media/albums/${a.id}`)}>
                <h3 className="text-body-sm font-semibold text-ink-900 truncate group-hover:text-aqua-600 transition-colors">{a.title}</h3>
                <div className="text-label text-ink-400 mt-1 tnum">{a.items_count} item{a.items_count === 1 ? '' : 's'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Album" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <FieldLabel required>Title</FieldLabel>
            <Input type="text" value={form.title} autoFocus
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>Description</FieldLabel>
            <Textarea value={form.description} rows={2}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>Championship (optional)</FieldLabel>
            <Select value={form.championship}
              onChange={(e) => setForm((f) => ({ ...f, championship: e.target.value }))}>
              <option value="">— None —</option>
              {championships.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Create Album</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete album"
        message={pendingDelete ? `Delete album "${pendingDelete.title}" and all its media?` : ''}
        destructive
        onConfirm={() => handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
