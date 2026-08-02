import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { getAlbums, createAlbum, deleteAlbum } from '../api/media'
import { getChampionships } from '../api/championships'
import { PageHead, Loading, Empty } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'

export default function Media() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const championshipFilter = searchParams.get('championship') || ''
  const { isAdmin } = useAuth()
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [championships, setChampionships] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', championship: '' })

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = championshipFilter ? { championship: championshipFilter } : {}
    getAlbums(params)
      .then((res) => {
        if (!alive) return
        const d = res.data
        setAlbums(Array.isArray(d) ? d : d?.results || [])
      })
      .catch(() => alive && setAlbums([]))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [championshipFilter])

  useEffect(() => {
    if (showForm && championships.length === 0) {
      getChampionships({ page_size: 200 })
        .then((res) => {
          const d = res.data
          setChampionships(Array.isArray(d) ? d : d?.results || [])
        })
        .catch(() => {})
    }
  }, [showForm, championships.length])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { window.alert('Title is required'); return }
    setSaving(true)
    try {
      const res = await createAlbum({ ...form, championship: form.championship || null })
      setShowForm(false)
      setForm({ title: '', description: '', championship: '' })
      navigate(`/media/albums/${res.data.id}`)
    } catch {
      window.alert('Failed to create album')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (al) => {
    if (!window.confirm(`Delete album "${al.title}" and all its media?`)) return
    try {
      await deleteAlbum(al.id)
      setAlbums((prev) => prev.filter((a) => a.id !== al.id))
    } catch {
      window.alert('Failed to delete album')
    }
  }

  return (
    <div>
      <PageHead kicker="Content" title="Media" sub="Photo albums from championships and events">
        {isAdmin && (
          <div style={{ marginTop: 14 }}>
            {!showForm ? (
              <button type="button" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowForm(true)}>
                <Plus size={14} /> New album
              </button>
            ) : (
              <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  style={{ maxWidth: 240 }}
                  placeholder="Album title *"
                  value={form.title}
                  autoFocus
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
                <input
                  className="input"
                  style={{ maxWidth: 280 }}
                  placeholder="Description (optional)"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
                <select
                  className="select"
                  style={{ maxWidth: 240 }}
                  value={form.championship}
                  onChange={(e) => setForm((f) => ({ ...f, championship: e.target.value }))}
                >
                  <option value="">— No championship —</option>
                  {championships.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Creating…' : 'Create album'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              </form>
            )}
          </div>
        )}
      </PageHead>

      {loading ? (
        <Loading label="Loading albums" />
      ) : albums.length === 0 ? (
        <Empty label="No albums yet" />
      ) : (
        <div className="pad-lg">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '28px 20px' }}>
            {albums.map((al) => (
              <div key={al.id} style={{ position: 'relative' }}>
                <Link to={`/media/albums/${al.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="grayscale" style={{ aspectRatio: '1/1', background: 'var(--color-surface)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {al.cover ? (
                      <img src={mediaUrl(al.cover)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span className="micro" style={{ padding: 8, textAlign: 'center' }}>{al.title}</span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, lineHeight: 1.2, margin: '10px 0 4px' }}>
                    {al.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
                    <span className="asw-num">{al.items_count ?? 0}</span> item{(al.items_count ?? 0) === 1 ? '' : 's'} · {formatDate(al.created_at)}
                  </div>
                </Link>
                {isAdmin && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4 }}
                    onClick={() => handleDelete(al)}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
