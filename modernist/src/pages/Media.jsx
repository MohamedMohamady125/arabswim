import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, Images } from 'lucide-react'
import { getAlbums, createAlbum, deleteAlbum } from '../api/media'
import { getChampionships, getChampionship } from '../api/championships'
import { PageHead, Loading, notify, Empty, Modal, FilterBar } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'

export default function Media() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const championshipFilter = searchParams.get('championship') || ''
  const { isAdmin } = useAuth()
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [championships, setChampionships] = useState([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ title: '', description: '', championship: '' })
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState('')
  const [champName, setChampName] = useState('')

  // Working Memory: when the list is narrowed to one meet, say which one
  useEffect(() => {
    setChampName('')
    if (!championshipFilter) return
    getChampionship(championshipFilter).then((res) => setChampName(res.data?.name || '')).catch(() => {})
  }, [championshipFilter])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = championshipFilter ? { championship: championshipFilter } : {}
    getAlbums(params)
      .then((res) => {
        if (!alive) return
        const d = res.data
        setAlbums(Array.isArray(d) ? d : d?.results || [])
        setFailed(false)
      })
      .catch(() => { if (alive) { setAlbums([]); setFailed(true) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [championshipFilter, reloadKey])

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
    if (!form.title.trim()) { setFormError('Give the album a title first.'); return }
    setSaving(true); setFormError('')
    try {
      const res = await createAlbum({ ...form, title: form.title.trim(), description: form.description.trim(), championship: form.championship || null })
      setShowForm(false)
      setForm({ title: '', description: '', championship: '' })
      navigate(`/media/albums/${res.data.id}`)
    } catch {
      setFormError('The album could not be created. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (al) => {
    const n = al.items_count ?? 0
    if (!window.confirm(`Delete album "${al.title}"${n ? ` and its ${n} photo${n === 1 ? '' : 's'} / video${n === 1 ? '' : 's'}` : ''}? This cannot be undone.`)) return
    try {
      await deleteAlbum(al.id)
      setAlbums((prev) => prev.filter((a) => a.id !== al.id))
      notify('Album deleted.')
    } catch {
      notify('Failed to delete album')
    }
  }

  // Visitors never see an album with nothing in it (it used to show as a blank
  // tile). Admins still see it, marked as unfinished (Zeigarnik Effect).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return albums
      .filter((al) => isAdmin || (al.items_count ?? 0) > 0)
      .filter((al) => !q || String(al.title || '').toLowerCase().includes(q))
  }, [albums, isAdmin, query])
  const emptyCount = isAdmin ? albums.filter((al) => (al.items_count ?? 0) === 0).length : 0

  // Chunking / Miller's Law: more than nine albums are grouped by year
  const groups = useMemo(() => {
    const yearOf = (al) => String(al.created_at || '').slice(0, 4) || 'Undated'
    const years = [...new Set(visible.map(yearOf))]
    if (visible.length <= 9 || years.length < 2) return [{ label: null, items: visible }]
    return years.map((y) => ({ label: y, items: visible.filter((al) => yearOf(al) === y) }))
  }, [visible])

  const filtered = !!(query.trim() || championshipFilter)
  const clearFilters = () => { setQuery(''); if (championshipFilter) setSearchParams({}) }
  const closeForm = () => { setShowForm(false); setFormError('') }

  return (
    <div>
      <PageHead kicker="Content" title="Media" sub="Photo and video albums from championships and events">
        {isAdmin && (
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={14} /> New album
            </button>
          </div>
        )}
      </PageHead>

      {/* Flow: the three-field form opens in a dialog instead of pushing the page down */}
      {showForm && (
        <Modal title="New album" onClose={closeForm} width={480}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {formError && <div role="alert" className="error-box">{formError}</div>}
            <div className="field">
              <label htmlFor="album-title">Title *</label>
              <input id="album-title" className="input" value={form.title} autoFocus
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="album-champ">Championship (optional)</label>
              <select id="album-champ" className="select" value={form.championship}
                onChange={(e) => {
                  const c = championships.find((x) => String(x.id) === e.target.value)
                  // Tesler's Law: picking the meet fills in the title when it is still empty
                  setForm((f) => ({ ...f, championship: e.target.value, title: f.title.trim() || !c ? f.title : c.name }))
                }}>
                <option value="">— No championship —</option>
                {championships.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="album-desc">Description (optional)</label>
              <input id="album-desc" className="input" value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="text-muted" style={{ fontSize: 12 }}>Next step: the album opens so you can add photos and videos.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create album'}</button>
            </div>
          </form>
        </Modal>
      )}

      {!loading && !failed && (albums.length > 6 || filtered) && (
        <FilterBar count={visible.length} noun={visible.length === 1 ? 'album' : 'albums'} active={filtered} onClear={clearFilters}>
          <input className="input" type="search" style={{ width: 260, maxWidth: '100%' }} placeholder="Search albums…" aria-label="Search albums"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          {championshipFilter && <span className="tag tag-accent">Meet: {champName || '…'}</span>}
        </FilterBar>
      )}

      {loading ? (
        <Loading label="Loading albums" />
      ) : failed ? (
        <Empty label="Albums could not be loaded" hint="Check your connection and try again.">
          <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </Empty>
      ) : visible.length === 0 ? (
        <Empty
          label={filtered ? 'No albums match' : 'No albums yet'}
          hint={filtered ? 'Try a different search, or show every album.' : isAdmin ? 'Use "New album" above to create the first one.' : 'Photos and videos appear here after championships. Meet results are already available.'}
        >
          {filtered
            ? <button type="button" className="btn btn-secondary" onClick={clearFilters}>Show all albums</button>
            : !isAdmin && <Link to="/championships" className="btn btn-secondary" style={{ textDecoration: 'none' }}>Browse championships</Link>}
        </Empty>
      ) : (
        <div className="pad-lg">
          {emptyCount > 0 && (
            <div className="content-todo" role="status">
              <strong>{emptyCount} empty album{emptyCount === 1 ? '' : 's'}</strong> — visitors cannot see {emptyCount === 1 ? 'it' : 'them'} until photos or videos are added.
            </div>
          )}
          {groups.map((g) => (
            <section key={g.label || 'all'} style={{ marginBottom: g.label ? 32 : 0 }}>
              {g.label && <div className="kicker" style={{ marginBottom: 12 }}>{g.label}</div>}
              <div className="content-albums">
                {g.items.map((al) => {
                  const n = al.items_count ?? 0
                  return (
                    <div key={al.id} className="content-album">
                      <Link to={`/media/albums/${al.id}`}>
                        <div className="content-album-cover">
                          {al.cover ? (
                            <img src={mediaUrl(al.cover)} alt="" loading="lazy" />
                          ) : (
                            <span className="content-album-ph"><Images size={28} aria-hidden="true" />{n === 0 ? 'Empty — add photos' : 'No preview'}</span>
                          )}
                        </div>
                        <div className="content-album-title">{al.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
                          <span className="asw-num">{n}</span> item{n === 1 ? '' : 's'} · {formatDate(al.created_at)}
                        </div>
                      </Link>
                      {isAdmin && (
                        <button type="button" className="btn btn-ghost" style={{ marginTop: 4 }} onClick={() => handleDelete(al)} aria-label={`Delete album ${al.title}`}>
                          <Trash2 size={13} /> Delete
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
