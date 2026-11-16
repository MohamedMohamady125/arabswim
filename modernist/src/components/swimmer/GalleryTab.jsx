import { useEffect, useState } from 'react'
import { Play, X } from 'lucide-react'
import { getMediaItems } from '../../api/media'
import { Loading, Empty } from '../ui'
import { mediaUrl } from '../../utils'
import LoadFailed from './LoadFailed'
import Pic from '../Pic'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

export default function GalleryTab({ swimmerId }) {
  const [media, setMedia] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setFailed(false)
    setMedia(null)
    getMediaItems({ swimmer: swimmerId })
      .then((res) => { if (alive) setMedia(list(res.data)) })
      .catch(() => { if (alive) { setMedia([]); setFailed(true) } })
    return () => { alive = false }
  }, [swimmerId, reloadKey])

  // Jakob's Law: Escape closes the photo viewer
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e) => { if (e.key === 'Escape') setLightbox(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightbox])

  if (media === null) return <Loading label="Loading media" />
  if (failed) return <LoadFailed what="Photos and videos" onRetry={() => setReloadKey((k) => k + 1)} />

  const photos = media.filter((m) => m.media_type === 'PHOTO' && m.image)
  const videos = media.filter((m) => m.media_type === 'VIDEO' && m.video_url)

  if (!photos.length && !videos.length) return <Empty label="No media yet" hint="Photos and videos of this swimmer will appear here once they are added." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {photos.length > 0 && (
        <div>
          <div className="kicker" style={{ marginBottom: 12 }}>
            Photos <span className="asw-num" style={{ color: 'var(--color-neutral-700)' }}>({photos.length})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 2 }}>
            {photos.map((p) => (
              <button key={p.id} type="button" onClick={() => setLightbox(p)}
                aria-label={p.caption ? `Open photo: ${p.caption}` : 'Open photo'}
                style={{ border: 0, padding: 0, cursor: 'pointer', background: 'var(--color-neutral-200)', aspectRatio: '1', overflow: 'hidden', position: 'relative' }}>
                <Pic kind="gallery" w={480} src={p.image} alt={p.caption || ''} className="grayscale" />
                {p.caption && (
                  <span className="micro" style={{ position: 'absolute', insetInline: 0, bottom: 0, background: 'var(--color-accent-800)', color: '#fff', padding: '4px 8px', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {p.caption}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {videos.length > 0 && (
        <div>
          <div className="kicker" style={{ marginBottom: 12 }}>
            Videos <span className="asw-num" style={{ color: 'var(--color-neutral-700)' }}>({videos.length})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {videos.map((v) => (
              <a key={v.id} href={v.video_url} target="_blank" rel="noopener noreferrer"
                aria-label={`${v.caption ? `Play video: ${v.caption}` : 'Play video'} (opens in a new tab)`}
                style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--color-divider)' }}>
                <div style={{ position: 'relative', aspectRatio: '16/9', background: 'var(--color-accent-800)', overflow: 'hidden' }}>
                  {v.embed_thumbnail && (
                    <img src={v.embed_thumbnail} alt="" loading="lazy" className="grayscale"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: 48, height: 48, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--color-accent)' }}>
                      <Play size={22} fill="var(--color-accent)" color="var(--color-accent)" />
                    </span>
                  </span>
                </div>
                {v.caption && <div style={{ fontSize: 13, padding: '8px 10px' }}>{v.caption}</div>}
              </a>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label={lightbox.caption || 'Photo'}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(18,37,61,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <button type="button" aria-label="Close" title="Close" onClick={() => setLightbox(null)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 0, color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 40, minHeight: 40, padding: 0 }}>
            <X size={28} />
          </button>
          <figure style={{ margin: 0, maxWidth: '100%', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <Pic kind="gallery" w={1280} fill={false} eager src={lightbox.image} alt={lightbox.caption || ''}
              style={{ maxWidth: '100%', maxHeight: '84vh', objectFit: 'contain' }} />
            {lightbox.caption && (
              <figcaption className="micro" style={{ color: '#fff', textAlign: 'center', marginTop: 10 }}>{lightbox.caption}</figcaption>
            )}
          </figure>
        </div>
      )}
    </div>
  )
}
