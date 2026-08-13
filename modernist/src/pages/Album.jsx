import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ImagePlus, Video, Play, Trash2, X } from 'lucide-react'
import {
  getAlbum, getMediaItems, uploadPhotos, createMediaItem,
  updateMediaItem, deleteMediaItem,
} from '../api/media'
import { Loading, Empty } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'

// Instagram-style display crops, stored per item on the backend
export const SIZE_OPTIONS = [
  { value: 'SQUARE', label: 'Square 1:1' },
  { value: 'PORTRAIT', label: 'Portrait 4:5' },
  { value: 'LANDSCAPE', label: 'Landscape 16:9' },
  { value: 'ORIGINAL', label: 'Original' },
]
export const SIZE_RATIOS = { SQUARE: '1 / 1', PORTRAIT: '4 / 5', LANDSCAPE: '16 / 9' }

export default function Album() {
  const { id } = useParams()
  const { isAdmin } = useAuth()
  const [album, setAlbum] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [lightbox, setLightbox] = useState(null)

  const load = () => {
    return Promise.allSettled([getAlbum(id), getMediaItems({ album: id })])
      .then(([albumRes, itemsRes]) => {
        if (albumRes.status === 'fulfilled') {
          setAlbum(albumRes.value.data)
          if (Array.isArray(albumRes.value.data?.items)) setItems(albumRes.value.data.items)
        }
        if (itemsRes.status === 'fulfilled') {
          const d = itemsRes.value.data
          const list = Array.isArray(d) ? d : d?.results || []
          if (list.length) setItems(list)
        }
      })
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    load().finally(() => alive && setLoading(false))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const onFilesSelect = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('album', id)
      files.forEach((f) => fd.append('images', f))
      await uploadPhotos(fd)
      await load()
    } catch {
      window.alert('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const addVideo = async (e) => {
    e.preventDefault()
    if (!videoUrl.trim()) return
    try {
      await createMediaItem({ album: id, media_type: 'VIDEO', video_url: videoUrl.trim() })
      setVideoUrl('')
      await load()
    } catch {
      window.alert('Failed to add video (check the URL)')
    }
  }

  const handleDeleteItem = async (item) => {
    if (!window.confirm('Delete this item? This cannot be undone.')) return
    try {
      await deleteMediaItem(item.id)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch {
      window.alert('Failed to delete item')
    }
  }

  const saveCaption = async (item, caption) => {
    if (caption === (item.caption || '')) return
    try {
      await updateMediaItem(item.id, { caption })
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, caption } : i)))
    } catch {
      window.alert('Failed to save caption')
    }
  }

  const saveSize = async (item, display_size) => {
    try {
      await updateMediaItem(item.id, { display_size })
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, display_size } : i)))
    } catch {
      window.alert('Failed to save size')
    }
  }

  if (loading) return <Loading label="Loading album" />
  if (!album) return <Empty label="Album not found" />

  const isVideo = (it) => it.media_type === 'VIDEO' || (!!it.video_url && !it.image)
  const photoSrc = (it) => mediaUrl(it.image || it.url || it.file)

  return (
    <div>
      <div className="pad-lg rule-b">
        <Link to="/media" style={{ fontSize: 12, textDecoration: 'none' }}>← All albums</Link>
        <div className="kicker" style={{ margin: '16px 0 6px' }}>Album</div>
        <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>{album.title}</h1>
        <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 8 }}>
          <span className="asw-num">{items.length || album.items_count || 0}</span> item{(items.length || album.items_count || 0) === 1 ? '' : 's'} · {formatDate(album.created_at)}
          {album.description ? ` — ${album.description}` : ''}
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            <label
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: uploading ? 0.5 : 1, pointerEvents: uploading ? 'none' : 'auto' }}
            >
              <ImagePlus size={14} /> {uploading ? 'Uploading…' : 'Add photos'}
              <input type="file" accept="image/*" multiple onChange={onFilesSelect} style={{ display: 'none' }} />
            </label>
            <form onSubmit={addVideo} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                type="url"
                style={{ width: 260 }}
                placeholder="YouTube / video link…"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Video size={14} /> Add video
              </button>
            </form>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <Empty label="No photos or videos in this album" />
      ) : (
        <div className="pad-lg">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {items.map((it) => (
              <figure key={it.id} style={{ margin: 0 }}>
                <div
                  className="album-photo"
                  style={{
                    aspectRatio: isVideo(it) ? '16 / 9'
                      : (SIZE_RATIOS[it.display_size] || (it.display_size === 'ORIGINAL' ? undefined : '1 / 1')),
                    overflow: 'hidden', background: isVideo(it) ? 'var(--color-neutral-800)' : 'var(--color-surface)', position: 'relative', cursor: 'pointer',
                  }}
                  onClick={() =>
                    isVideo(it) && it.video_url
                      ? window.open(it.video_url, '_blank', 'noreferrer')
                      : setLightbox(it)
                  }
                >
                  {!isVideo(it) && it.image ? (
                    <img src={photoSrc(it)} alt={it.caption || ''} loading="lazy"
                      style={it.display_size === 'ORIGINAL'
                        ? { width: '100%', height: 'auto', display: 'block' }
                        : { width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : it.embed_thumbnail ? (
                    <>
                      <img src={mediaUrl(it.embed_thumbnail)} alt={it.caption || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ background: 'rgba(0,0,0,0.6)', padding: 12, display: 'inline-flex' }}>
                          <Play size={18} color="#fff" />
                        </span>
                      </div>
                    </>
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-neutral-200)' }}>
                      <Video size={26} />
                      <span className="micro" style={{ padding: '0 12px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {it.video_url}
                      </span>
                    </div>
                  )}
                </div>
                {isAdmin ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <input
                      className="input"
                      type="text"
                      defaultValue={it.caption || ''}
                      placeholder="Add a caption…"
                      style={{ flex: 1, fontSize: 12 }}
                      onBlur={(e) => saveCaption(it, e.target.value)}
                    />
                    {!isVideo(it) && (
                      <select
                        className="select"
                        value={it.display_size || 'SQUARE'}
                        onChange={(e) => saveSize(it, e.target.value)}
                        style={{ fontSize: 12, width: 'auto' }}
                        title="Display size"
                      >
                        {SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ display: 'inline-flex', alignItems: 'center' }}
                      onClick={() => handleDeleteItem(it)}
                      aria-label="Delete item"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : it.caption ? (
                  <figcaption style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 6 }}>{it.caption}</figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10, 15, 25, 0.92)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label="Close"
            style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', padding: 8 }}
          >
            <X size={24} />
          </button>
          <img
            src={photoSrc(lightbox)}
            alt={lightbox.caption || ''}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
          {lightbox.caption && (
            <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontSize: 14, padding: '0 16px' }}>
              {lightbox.caption}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
