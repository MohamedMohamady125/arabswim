import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getArticle } from '../api/news'
import Flag from '../components/Flag'
import { Loading, Empty } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'

export default function Article() {
  const { id } = useParams()
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getArticle(id)
      .then((res) => alive && setArticle(res.data))
      .catch(() => alive && setArticle(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [id])

  if (loading) return <Loading label="Loading article" />
  if (!article || article.status !== 'PUBLISHED') return <Empty label="Article not found" />

  const paragraphs = String(article.body || '').split(/\n\n+/).filter((p) => p.trim())

  return (
    <div className="pad-lg">
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link to="/news" style={{ fontSize: 12, textDecoration: 'none' }}>← All news</Link>
        <div className="kicker" style={{ margin: '18px 0 8px' }}>News</div>
        <h1 style={{ margin: '0 0 14px', letterSpacing: '-0.03em' }}>{article.title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 16, borderBottom: '2px solid var(--color-divider)', fontSize: 13, color: 'var(--color-neutral-700)' }}>
          {article.country_detail && (
            <>
              <Flag code={article.country_detail.code} name={article.country_detail.name} />
              <span>{article.country_detail.name}</span>
              <span>·</span>
            </>
          )}
          <span>{formatDate(article.published_at || article.created_at)}</span>
        </div>

        {article.cover_image && (
          <div className="grayscale" style={{ width: '100%', margin: '20px 0' }}>
            <img src={mediaUrl(article.cover_image)} alt="" style={{ width: '100%', display: 'block' }} />
          </div>
        )}

        <div style={{ marginTop: article.cover_image ? 0 : 20 }}>
          {paragraphs.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 14 }}>No article body.</p>
          ) : (
            paragraphs.map((p, i) => (
              <p key={i} style={{ fontSize: 16, lineHeight: 1.65, margin: '0 0 18px' }}>{p}</p>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
