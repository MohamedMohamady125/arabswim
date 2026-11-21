import { useEffect, useState } from 'react'
import {
  getOrCreateAlbumForChampionship, uploadPhotos, createMediaItem,
  deleteMediaItem, updateMediaItem,
} from '../../api/media'
import { Loading, Empty } from '../ui'
import { CropQueue, EditPhotoButton } from '../ImageCropper'
import { SIZE_OPTIONS, SIZE_RATIOS } from '../../pages/Album'
import Pic from '../Pic'

// Gallery tab for a meet: public display always; admin can upload photos,
// add video links, edit captions and delete items.
export default function MeetGallery({ meetId, isAdmin }) {
  const [album, setAlbum] = useState(null)
  const [failed, setFailed] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [cropQueue, setCropQueue] = useState(null)
  const [error, setError] = useState('')
  const [addingVideo, setAddingVideo] = useState(false)

  // Jakob's Law: Escape closes the photo viewer
  useEffect(() => {
    if (!lightbox) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  const load = () => {
    setFailed(false)
    getOrCreateAlbumForChampionship(meetId)
      .then((res) => setAlbum(res.data))
      .catch(() => setFailed(true))
  }

  useEffect(() => {
    setAlbum(null)
    setFailed(false)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetId])

  const items = album?.items || []

  const handleUpload = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length && album) setCropQueue(files)
  }

  const uploadCropped = async (files) => {
    setCropQueue(null)
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('album', album.id)
      files.forEach((f) => fd.append('images', f))
      await uploadPhotos(fd)
      load()
    } catch { setError('The photos could not be uploaded. Please try again.') }
    finally { setUploading(false) }
  }

  const handleAddVideo = (e) => {
    e.preventDefault()
    if (!videoUrl.trim() || !album || addingVideo) return
    setAddingVideo(true)
    setError('')
    createMediaItem({ album: album.id, media_type: 'VIDEO', video_url: videoUrl.trim() })
      .then(() => { setVideoUrl(''); load() })
      .catch(() => setError('That video link could not be added. Check the link and try again.'))
      .finally(() => setAddingVideo(false))
  }

  const handleDelete = (item) => {
    if (!window.confirm('Delete this media item? This cannot be undone.')) return
    deleteMediaItem(item.id)
      .then(() => setAlbum((a) => ({ ...a, items: (a.items || []).filter((i) => i.id !== item.id) })))
      .catch(() => setError('That item could not be deleted. Please try again.'))
  }

  // a failed load is not an empty gallery: say so and offer a retry
  if (failed) {
    return (
      <Empty label="The gallery could not be loaded" hint="Check your connection and try again.">
        <button type="button" className="btn btn-secondary" onClick={load}>Try again</button>
      </Empty>
    )
  }
  if (!album) return <Loading label="Loading gallery" />

  return (
    <div className="pad">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="micro">
          <span className="asw-num" style={{ color: 'var(--color-text)' }}>{items.length}</span>
          {' '}item{items.length === 1 ? '' : 's'}
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <form onSubmit={handleAddVideo} style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                type="url"
                inputMode="url"
                aria-label="Video link (YouTube or Instagram)"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="YouTube / Instagram link…"
                style={{ width: 220 }}
              />
              <button type="submit" className="btn btn-secondary" disabled={addingVideo}>{addingVideo ? 'Adding…' : 'Add video'}</button>
            </form>
            <label className="btn btn-primary" style={{ opacity: uploading ? 0.5 : 1, pointerEvents: uploading ? 'none' : 'auto' }}>
              {uploading ? 'Uploading…' : 'Add photos'}
              <input type="file" accept="image/*" multiple onChange={handleUpload} className="sr-only" />
            </label>
          </div>
        )}
      </div>

      {error && <div role="alert" style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {items.length === 0 ? (
        <Empty
          label={isAdmin ? 'No photos or videos yet' : 'No photos or videos from this meet yet'}
          hint={isAdmin ? 'Use "Add photos" or paste a YouTube / Instagram link above.' : 'They appear here as soon as they are added.'}
        />
      ) : (
        <div className="gallery-grid" style={{ gap: 2, background: 'var(--color-divider)', border: '2px solid var(--color-divider)' }}>
          {items.map((item) => (
            <div key={item.id} style={{ background: 'var(--color-bg)', position: 'relative' }}>
              <div
                className="row-link"
                role="button"
                tabIndex={0}
                aria-label={item.media_type === 'VIDEO' ? `Open video${item.caption ? `: ${item.caption}` : ''}` : `View photo${item.caption ? `: ${item.caption}` : ''}`}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
                  e.preventDefault()
                  e.currentTarget.click()
                }}
                style={{
                  aspectRatio: item.media_type !== 'PHOTO' ? '16 / 9'
                    : (SIZE_RATIOS[item.display_size] || (item.display_size === 'ORIGINAL' ? undefined : '1 / 1')),
                  background: 'var(--color-neutral-900)', cursor: 'pointer', overflow: 'hidden',
                }}
                onClick={() => (item.media_type === 'VIDEO' && item.video_url
                  ? window.open(item.video_url, '_blank')
                  : setLightbox(item))}
              >
                {item.media_type === 'PHOTO' && item.image ? (
                  <Pic kind="gallery" w={480} src={item.image} alt={item.caption || ''}
                    style={item.display_size === 'ORIGINAL' ? { height: 'auto' } : undefined} />
                ) : item.embed_thumbnail ? (
                  <img src={item.embed_thumbnail} alt={item.caption || ''} className="grayscale" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
                ) : (
                  <div className="micro" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-neutral-500)' }}>Video</div>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(item) }}
                    aria-label="Delete item"
                    title="Delete item"
                    style={{
                      position: 'absolute', top: 6, right: 6, width: 32, height: 32,
                      background: 'var(--color-accent-900)', color: '#fff', border: 0,
                      cursor: 'pointer', fontSize: 13, lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
              {isAdmin && item.media_type === 'PHOTO' && item.image && (
                <EditPhotoButton src={item.image} kind="gallery" className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'center', minHeight: 36, fontSize: 12, borderTop: '1px solid var(--color-divider)' }}
                  onDone={async (f) => {
                    try {
                      const fd = new FormData()
                      fd.append('image', f)
                      const res = await updateMediaItem(item.id, fd)
                      setAlbum((a) => ({ ...a, items: (a.items || []).map((i) => (i.id === item.id ? { ...i, image: res.data.image } : i)) }))
                    } catch { notify('The photo could not be saved. Try again.', 'error') }
                  }} />
              )}
              {isAdmin && item.media_type === 'PHOTO' && (
                <select
                  className="select"
                  value={item.display_size || 'SQUARE'}
                  title="Display size"
                  aria-label="Display size"
                  onChange={(e) => {
                    const display_size = e.target.value
                    updateMediaItem(item.id, { display_size })
                      .then(() => setAlbum((a) => ({
                        ...a,
                        items: (a.items || []).map((i) => (i.id === item.id ? { ...i, display_size } : i)),
                      })))
                      .catch(() => {})
                  }}
                  style={{ width: '100%', fontSize: 11, border: 0, borderTop: '1px solid var(--color-divider)' }}
                >
                  {SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
              {isAdmin ? (
                <input
                  type="text"
                  defaultValue={item.caption || ''}
                  placeholder="Add a caption…"
                  aria-label="Caption"
                  onBlur={(e) => {
                    const caption = e.target.value.trim()
                    if (caption !== (item.caption || '')) {
                      updateMediaItem(item.id, { caption })
                        .then(() => setAlbum((a) => ({
                          ...a,
                          items: (a.items || []).map((i) => (i.id === item.id ? { ...i, caption } : i)),
                        })))
                        .catch(() => setError('The caption could not be saved. Please try again.'))
                    }
                  }}
                  style={{ width: '100%', border: 0, padding: '8px 10px', fontSize: 12, font: 'inherit', color: 'var(--color-neutral-700)', background: 'transparent' }}
                />
              ) : item.caption ? (
                <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--color-neutral-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.caption}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* lightbox */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(8, 24, 44, 0.92)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, cursor: 'zoom-out' }}
        >
          <Pic kind="gallery" w={1280} fill={false} eager src={lightbox.image} alt={lightbox.caption || ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          {lightbox.caption && (
            <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
              {lightbox.caption}
            </div>
          )}
        </div>
      )}

      {cropQueue && (
        <CropQueue kind="gallery" files={cropQueue} onDone={uploadCropped} onCancel={() => setCropQueue(null)} />
      )}
    </div>
  )
}
