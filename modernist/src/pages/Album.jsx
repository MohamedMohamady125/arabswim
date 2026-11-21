import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ImagePlus, Video, Play, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  getAlbum, getMediaItems, uploadPhotos, createMediaItem,
  updateMediaItem, deleteMediaItem,
} from '../api/media'
import { Loading, notify, Empty, BackLink } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'
import Pic from '../components/Pic'
import { useAuth } from '../context/AuthContext'
import { usePrelaunch } from '../prelaunch'
import { CropQueue, EditPhotoButton } from '../components/ImageCropper'

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
  const { isAdmin: siteAdmin } = useAuth()
  const [album, setAlbum] = useState(null)
  // the club / academy / federation that owns the album manages it like an admin
  const isAdmin = siteAdmin || !!album?.can_edit
  // pre-launch: an owner may open their own albums only
  const { locked, ownPath } = usePrelaunch()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [cropQueue, setCropQueue] = useState(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [addingVideo, setAddingVideo] = useState(false)

  // Jakob's Law: the photo viewer behaves like every gallery — Escape closes,
  // the arrow keys (and on-screen arrows) move to the previous / next photo.
  const photos = items.filter((it) => !(it.media_type === 'VIDEO' || (!!it.video_url && !it.image)) && it.image)
  const lightIdx = lightbox ? photos.findIndex((p) => p.id === lightbox.id) : -1
  const step = (d) => {
    if (lightIdx < 0 || photos.length < 2) return
    setLightbox(photos[(lightIdx + d + photos.length) % photos.length])
  }
  useEffect(() => {
    if (!lightbox) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox, photos.length])

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

  const onFilesSelect = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length) setCropQueue(files)
  }

  const uploadCropped = async (files) => {
    setCropQueue(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('album', id)
      files.forEach((f) => fd.append('images', f))
      await uploadPhotos(fd)
      await load()
      // Peak-End Rule: confirm the upload landed
      notify(`${files.length} photo${files.length === 1 ? '' : 's'} added to the album.`)
    } catch (err) {
      notify(err.response?.data?.error ? `Upload failed — ${err.response.data.error}` : 'Upload failed. Check your connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  const addVideo = async (e) => {
    e.preventDefault()
    if (!videoUrl.trim() || addingVideo) return
    setAddingVideo(true)
    try {
      await createMediaItem({ album: id, media_type: 'VIDEO', video_url: videoUrl.trim() })
      setVideoUrl('')
      await load()
      notify('Video added to the album.')
    } catch {
      notify('Failed to add video (check the URL)')
    } finally {
      setAddingVideo(false)
    }
  }

  const handleDeleteItem = async (item) => {
    if (!window.confirm('Delete this item? This cannot be undone.')) return
    try {
      await deleteMediaItem(item.id)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch {
      notify('Failed to delete item')
    }
  }

  // "Crop and zoom" on a photo already in the album: the re-framed picture replaces it
  const reframe = async (item, file) => {
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await updateMediaItem(item.id, fd)
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, image: res.data.image } : i)))
      notify('Photo updated')
    } catch {
      notify('The photo could not be saved. Try again.', 'error')
    }
  }

  const saveCaption = async (item, caption) => {
    if (caption === (item.caption || '')) return
    try {
      await updateMediaItem(item.id, { caption })
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, caption } : i)))
    } catch {
      notify('Failed to save caption')
    }
  }

  const saveSize = async (item, display_size) => {
    try {
      await updateMediaItem(item.id, { display_size })
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, display_size } : i)))
    } catch {
      notify('Failed to save size')
    }
  }

  if (loading) return <Loading label="Loading album" />
  if (locked && !album?.can_edit) return <Navigate to={ownPath || '/'} replace />
  if (!album) return (
    <Empty label="Album not found" hint="It may have been deleted, or the link is wrong.">
      <Link to="/media" className="btn btn-secondary">All albums</Link>
    </Empty>
  )

  const isVideo = (it) => it.media_type === 'VIDEO' || (!!it.video_url && !it.image)

  return (
    <div>
      <div className="pad-lg rule-b">
        <BackLink to="/media">All albums</BackLink>
        <div className="kicker" style={{ margin: '8px 0 6px' }}>Album</div>
        <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>{album.title}</h1>
        <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 8 }}>
          <span className="asw-num">{items.length}</span> item{items.length === 1 ? '' : 's'} · {formatDate(album.created_at)}
          {album.description ? ` — ${album.description}` : ''}
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            {/* Von Restorff: adding photos is the main job here, so it is the one solid button */}
            <label
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: uploading ? 0.5 : 1, pointerEvents: uploading ? 'none' : 'auto' }}
            >
              <ImagePlus size={14} /> {uploading ? 'Uploading…' : 'Add photos'}
              <input type="file" accept="image/*" multiple onChange={onFilesSelect} className="sr-only" />
            </label>
            <form onSubmit={addVideo} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                type="url"
                style={{ width: 260 }}
                placeholder="YouTube / video link…"
                aria-label="YouTube or video link"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary" disabled={addingVideo} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Video size={14} /> {addingVideo ? 'Adding…' : 'Add video'}
              </button>
            </form>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <Empty label="No photos or videos in this album yet" hint={isAdmin ? 'Use "Add photos" or paste a video link above. Visitors cannot see the album until it has something in it.' : 'They will appear here once they are uploaded.'}>
          {!isAdmin && <Link to="/media" className="btn btn-secondary" style={{ textDecoration: 'none' }}>See other albums</Link>}
        </Empty>
      ) : (
        <div className="pad-lg">
          <div className="gallery-grid" style={{ gap: 8 }}>
            {items.map((it) => (
              <figure key={it.id} style={{ margin: 0 }}>
                <div
                  className="album-photo row-link"
                  role="button"
                  tabIndex={0}
                  aria-label={isVideo(it) && it.video_url ? `Open video${it.caption ? `: ${it.caption}` : ''}` : `View photo${it.caption ? `: ${it.caption}` : ''}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click() } }}
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
                    <Pic kind="gallery" w={480} src={it.image || it.url || it.file} alt={it.caption || ''}
                      style={it.display_size === 'ORIGINAL' ? { height: 'auto' } : undefined} />
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
                      aria-label="Caption"
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
                        aria-label="Display size"
                      >
                        {SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                    {!isVideo(it) && it.image && (
                      <EditPhotoButton src={it.image} kind="gallery" iconOnly className="btn btn-ghost" onDone={(f) => reframe(it, f)} />
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ display: 'inline-flex', alignItems: 'center' }}
                      onClick={() => handleDeleteItem(it)}
                      aria-label="Delete item"
                      title="Delete item"
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
          className="content-lightbox"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.caption || 'Photo'}
        >
          <button
            type="button"
            aria-label="Close"
            title="Close (Esc)"
            autoFocus
            className="content-lightbox-btn"
            style={{ top: 12, right: 12 }}
          >
            <X size={24} />
          </button>
          {photos.length > 1 && lightIdx >= 0 && (
            <>
              <button type="button" aria-label="Previous photo" className="content-lightbox-btn content-lightbox-prev"
                onClick={(e) => { e.stopPropagation(); step(-1) }}>
                <ChevronLeft size={28} />
              </button>
              <button type="button" aria-label="Next photo" className="content-lightbox-btn content-lightbox-next"
                onClick={(e) => { e.stopPropagation(); step(1) }}>
                <ChevronRight size={28} />
              </button>
            </>
          )}
          <Pic kind="gallery" w={1280} fill={false} eager
            src={lightbox.image || lightbox.url || lightbox.file}
            alt={lightbox.caption || ''}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
          {/* Working Memory: where you are in the album, with the caption */}
          <div className="content-lightbox-caption">
            {photos.length > 1 && lightIdx >= 0 && <span className="asw-num">{lightIdx + 1} / {photos.length}</span>}
            {lightbox.caption && <span>{lightbox.caption}</span>}
          </div>
        </div>
      )}

      {cropQueue && (
        <CropQueue kind="gallery" files={cropQueue} onDone={uploadCropped} onCancel={() => setCropQueue(null)} />
      )}
    </div>
  )
}
