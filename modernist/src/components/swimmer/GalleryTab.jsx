import { useEffect, useState } from 'react'
import { Play, X } from 'lucide-react'
import { getMediaItems } from '../../api/media'
import { Loading, Empty } from '../ui'
import { mediaUrl } from '../../utils'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

export default function GalleryTab({ swimmerId }) {
  const [media, setMedia] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    let alive = true
    getMediaItems({ swimmer: swimmerId })
      .then((res) => { if (alive) setMedia(list(res.data)) })
      .catch(() => { if (alive) setMedia([]) })
    return () => { alive = false }
  }, [swimmerId])

  if (media === null) return <Loading label="Loading media" />

  const photos = media.filter((m) => m.media_type === 'PHOTO' && m.image)
  const videos = media.filter((m) => m.media_type === 'VIDEO' && m.video_url)

  if (!photos.length && !videos.length) return <Empty label="No media yet" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {photos.length > 0 && (
        <div>
          <div className="kicker" style={{ marginBottom: 12 }}>
            Photos <span className="asw-num" style={{ color: 'var(--color-neutral-600)' }}>({photos.length})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 2 }}>
            {photos.map((p) => (
              <button key={p.id} type="button" onClick={() => setLightbox(p)}
                style={{ border: 0, padding: 0, cursor: 'pointer', background: 'var(--color-neutral-200)', aspectRatio: '1', overflow: 'hidden', position: 'relative' }}>
                <img src={mediaUrl(p.image)} alt={p.caption || ''} loading="lazy" className="grayscale"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
            Videos <span className="asw-num" style={{ color: 'var(--color-neutral-600)' }}>({videos.length})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {videos.map((v) => (
              <a key={v.id} href={v.video_url} target="_blank" rel="noopener noreferrer"
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
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(18,37,61,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <button type="button" aria-label="Close" onClick={() => setLightbox(null)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 0, color: '#fff', cursor: 'pointer' }}>
            <X size={28} />
          </button>
          <figure style={{ margin: 0, maxWidth: '100%', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <img src={mediaUrl(lightbox.image)} alt={lightbox.caption || ''}
              style={{ maxWidth: '100%', maxHeight: '84vh', display: 'block' }} />
            {lightbox.caption && (
              <figcaption className="micro" style={{ color: '#fff', textAlign: 'center', marginTop: 10 }}>{lightbox.caption}</figcaption>
            )}
          </figure>
        </div>
      )}
    </div>
  )
}
