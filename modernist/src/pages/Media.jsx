import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAlbums } from '../api/media'
import { PageHead, Loading, Empty } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'

export default function Media() {
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getAlbums()
      .then((res) => {
        if (!alive) return
        const d = res.data
        setAlbums(Array.isArray(d) ? d : d?.results || [])
      })
      .catch(() => alive && setAlbums([]))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  return (
    <div>
      <PageHead kicker="Content" title="Media" sub="Photo albums from championships and events" />
      {loading ? (
        <Loading label="Loading albums" />
      ) : albums.length === 0 ? (
        <Empty label="No albums yet" />
      ) : (
        <div className="pad-lg">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '28px 20px' }}>
            {albums.map((al) => (
              <Link key={al.id} to={`/media/albums/${al.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
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
                  <span className="asw-num">{al.items_count ?? 0}</span> photos · {formatDate(al.created_at)}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
