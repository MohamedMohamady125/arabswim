import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAlbum, getMediaItems } from '../api/media'
import { Loading, Empty } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'

export default function Album() {
  const { id } = useParams()
  const [album, setAlbum] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.allSettled([getAlbum(id), getMediaItems({ album: id })])
      .then(([albumRes, itemsRes]) => {
        if (!alive) return
        if (albumRes.status === 'fulfilled') setAlbum(albumRes.value.data)
        if (itemsRes.status === 'fulfilled') {
          const d = itemsRes.value.data
          setItems(Array.isArray(d) ? d : d?.results || [])
        }
      })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [id])

  if (loading) return <Loading label="Loading album" />
  if (!album) return <Empty label="Album not found" />

  const photos = items.filter((it) => it.image || it.url || it.file)
  const src = (it) => mediaUrl(it.image || it.url || it.file)

  return (
    <div>
      <style>{`.album-photo { filter: grayscale(1) contrast(1.08); transition: filter 0.2s; } .album-photo:hover { filter: none; }`}</style>
      <div className="pad-lg rule-b">
        <Link to="/media" style={{ fontSize: 12, textDecoration: 'none' }}>← All albums</Link>
        <div className="kicker" style={{ margin: '16px 0 6px' }}>Album</div>
        <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>{album.title}</h1>
        <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 8 }}>
          <span className="asw-num">{album.items_count ?? photos.length}</span> photos · {formatDate(album.created_at)}
          {album.description ? ` — ${album.description}` : ''}
        </div>
      </div>

      {photos.length === 0 ? (
        <Empty label="No photos in this album" />
      ) : (
        <div className="pad-lg">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {photos.map((it) => (
              <a key={it.id} href={src(it)} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                <div className="album-photo" style={{ aspectRatio: '4/3', overflow: 'hidden', background: 'var(--color-surface)' }}>
                  <img src={src(it)} alt={it.caption || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                {it.caption && (
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 6 }}>{it.caption}</div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
