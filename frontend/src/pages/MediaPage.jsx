import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Image, Plus, Trash2 } from 'lucide-react'
import { getAlbums, createAlbum, deleteAlbum } from '../api/media'
import { getChampionships } from '../api/championships'
import { useToast } from '../context/ToastContext'

export default function MediaPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [albums, setAlbums] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [championships, setChampionships] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', championship: '' })

  const load = () => {
    getAlbums().then((res) => {
      setAlbums(Array.isArray(res.data) ? res.data : res.data.results || [])
    }).catch(() => {})
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
    if (!window.confirm(`Delete album "${album.title}" and all its media?`)) return
    try {
      await deleteAlbum(album.id)
      setAlbums((prev) => prev.filter((a) => a.id !== album.id))
      toast.success('Album deleted')
    } catch {
      toast.error('Failed to delete album')
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Image size={24} className="text-blue-600" /> Media
          <span className="text-gray-400 text-lg font-normal">({albums.length} albums)</span>
        </h1>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={16} /> New Album
        </button>
      </div>

      {albums.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          No albums yet. Create one to start uploading photos and videos.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {albums.map((a) => (
            <div key={a.id} className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-36 bg-gray-100 cursor-pointer relative" onClick={() => navigate(`/media/albums/${a.id}`)}>
                {a.cover ? (
                  <img src={a.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <Image size={32} />
                  </div>
                )}
                <button onClick={(e) => { e.stopPropagation(); handleDelete(a) }}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity">
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="p-3 cursor-pointer" onClick={() => navigate(`/media/albums/${a.id}`)}>
                <h3 className="font-semibold text-sm truncate hover:text-blue-600">{a.title}</h3>
                <div className="text-xs text-gray-400 mt-0.5">{a.items_count} item{a.items_count === 1 ? '' : 's'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-[440px] max-w-[90vw] space-y-4">
            <h3 className="text-lg font-semibold">New Album</h3>
            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input type="text" value={form.title} autoFocus
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea value={form.description} rows={2}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Championship (optional)</label>
              <select value={form.championship}
                onChange={(e) => setForm((f) => ({ ...f, championship: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">— None —</option>
                {championships.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={saving}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Creating...' : 'Create Album'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
