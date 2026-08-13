import { useEffect, useState } from 'react'
import {
  getOrCreateAlbumForChampionship, uploadPhotos, createMediaItem,
  deleteMediaItem, updateMediaItem,
} from '../../api/media'
import { Loading, Empty } from '../ui'
import { SIZE_OPTIONS, SIZE_RATIOS } from '../../pages/Album'

// Gallery tab for a meet: public display always; admin can upload photos,
// add video links, edit captions and delete items.
export default function MeetGallery({ meetId, isAdmin }) {
  const [album, setAlbum] = useState(null)
  const [failed, setFailed] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [lightbox, setLightbox] = useState(null)

  const load = () => {
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

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length || !album) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('album', album.id)
      files.forEach((f) => fd.append('images', f))
      await uploadPhotos(fd)
      load()
    } catch { /* ignore */ }
    finally { setUploading(false) }
  }

  const handleAddVideo = (e) => {
    e.preventDefault()
    if (!videoUrl.trim() || !album) return
    createMediaItem({ album: album.id, media_type: 'VIDEO', video_url: videoUrl.trim() })
      .then(() => { setVideoUrl(''); load() })
      .catch(() => {})
  }

  const handleDelete = (item) => {
    if (!window.confirm('Delete this media item? This cannot be undone.')) return
    deleteMediaItem(item.id)
      .then(() => setAlbum((a) => ({ ...a, items: (a.items || []).filter((i) => i.id !== item.id) })))
      .catch(() => {})
  }

  if (failed) return <Empty label="No gallery for this meet" />
  if (!album) return <Loading label="Loading gallery" />

  return (
    <div className="pad">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="micro">
          <span className="asw-num" style={{ color: 'var(--color-text)' }}>{items.length}</span>
          {' '}item{items.length === 1 ? '' : 's'}
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <form onSubmit={handleAddVideo} style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="YouTube / Instagram link…"
                style={{ width: 220 }}
              />
              <button type="submit" className="btn btn-secondary">Add video</button>
            </form>
            <label className="btn btn-primary" style={{ opacity: uploading ? 0.5 : 1, pointerEvents: uploading ? 'none' : 'auto' }}>
              {uploading ? 'Uploading…' : 'Add photos'}
              <input type="file" accept="image/*" multiple onChange={handleUpload} style={{ display: 'none' }} />
            </label>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <Empty label={isAdmin ? 'No media yet — add photos or video links' : 'Media from this meet will appear here'} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 2, background: 'var(--color-divider)', border: '2px solid var(--color-divider)' }}>
          {items.map((item) => (
            <div key={item.id} style={{ background: 'var(--color-bg)', position: 'relative' }}>
              <div
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
                  <img src={item.image} alt={item.caption || ''}
                    style={item.display_size === 'ORIGINAL'
                      ? { width: '100%', height: 'auto', display: 'block' }
                      : { width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : item.embed_thumbnail ? (
                  <img src={item.embed_thumbnail} alt={item.caption || ''} className="grayscale" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
                ) : (
                  <div className="micro" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-neutral-500)' }}>Video</div>
                )}
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(item) }}
                    aria-label="Delete item"
                    style={{
                      position: 'absolute', top: 6, right: 6, width: 26, height: 26,
                      background: 'var(--color-accent-900)', color: '#fff', border: 0,
                      cursor: 'pointer', fontSize: 13, lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
              {isAdmin && item.media_type === 'PHOTO' && (
                <select
                  className="select"
                  value={item.display_size || 'SQUARE'}
                  title="Display size"
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
                  onBlur={(e) => {
                    if (e.target.value !== (item.caption || '')) {
                      updateMediaItem(item.id, { caption: e.target.value })
                        .then(() => setAlbum((a) => ({
                          ...a,
                          items: (a.items || []).map((i) => (i.id === item.id ? { ...i, caption: e.target.value } : i)),
                        })))
                        .catch(() => {})
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
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(8, 24, 44, 0.92)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, cursor: 'zoom-out' }}
        >
          <img src={lightbox.image} alt={lightbox.caption || ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          {lightbox.caption && (
            <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
              {lightbox.caption}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
