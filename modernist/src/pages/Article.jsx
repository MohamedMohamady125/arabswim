import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getArticle } from '../api/news'
import Flag from '../components/Flag'
import { Loading, Empty } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'

export default function Article() {
  const { id } = useParams()
  const { isAdmin } = useAuth()
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
  if (!article || (article.status !== 'PUBLISHED' && !isAdmin)) return <Empty label="Article not found" />

  const paragraphs = String(article.body || '').split(/\n\n+/).filter((p) => p.trim())

  // Auto-detect RTL: check if the title or first paragraph starts with Arabic/Hebrew chars
  const isRTL = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF]/.test(
    (article.title || '') + (paragraphs[0] || '')
  )
  const textDir = isRTL ? 'rtl' : 'ltr'
  const articleFont = isRTL
    ? "'Noto Naskh Arabic', 'Amiri', 'Scheherazade New', serif"
    : 'var(--font-body)'

  return (
    <div className="pad-lg">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link to="/news" style={{ fontSize: 12, textDecoration: 'none' }}>← All news</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 8px' }}>
          <div className="kicker">News</div>
          {isAdmin && article.status !== 'PUBLISHED' && <span className="tag tag-neutral">Draft</span>}
        </div>

        <div dir={textDir}>
          <h1 style={{
            margin: '0 0 16px', letterSpacing: isRTL ? 0 : '-0.03em',
            fontFamily: articleFont, fontSize: isRTL ? 32 : undefined,
            lineHeight: isRTL ? 1.5 : 1.12,
          }}>{article.title}</h1>
        </div>

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
          <div style={{ width: '100%', margin: '20px 0' }}>
            <img src={mediaUrl(article.cover_image)} alt="" style={{ width: '100%', display: 'block' }} />
          </div>
        )}

        <div dir={textDir} style={{ marginTop: article.cover_image ? 0 : 20, fontFamily: articleFont }}>
          {paragraphs.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 14 }}>No article body.</p>
          ) : (
            paragraphs.map((p, i) => (
              <p key={i} style={{
                fontSize: isRTL ? 18 : 16, lineHeight: isRTL ? 1.9 : 1.65,
                margin: '0 0 20px', textAlign: isRTL ? 'justify' : 'left',
              }}>{p}</p>
            ))
          )}
        </div>

        <div className="rule-t" style={{ marginTop: 28, paddingTop: 16 }}>
          <Link to="/news" style={{ fontSize: 12, textDecoration: 'none' }}>← Back to all news</Link>
        </div>
      </div>
    </div>
  )
}
