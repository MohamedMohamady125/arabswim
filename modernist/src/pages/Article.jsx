import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getArticle } from '../api/news'
import Flag from '../components/Flag'
import { Loading, Empty } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'

/* ── Al Jazeera–inspired Arabic typography ────────────────────────── */
const AJ_FONTS = "'Noto Naskh Arabic', 'Amiri', 'Traditional Arabic', Georgia, serif"
const AJ_HEADING_FONTS = "'Noto Naskh Arabic', 'Amiri', serif"

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

  const isRTL = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF]/.test(
    (article.title || '') + (paragraphs[0] || '')
  )
  const textDir = isRTL ? 'rtl' : 'ltr'

  return (
    <div style={{ background: '#fff', minHeight: '80vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Top accent bar */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, var(--asw-gold), var(--color-accent))' }} />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: 24 }}>
          <Link to="/news" style={{
            fontSize: 13, textDecoration: 'none', color: 'var(--color-accent)',
            fontWeight: 600, letterSpacing: '0.02em',
          }}>← {isRTL ? 'جميع الأخبار' : 'All news'}</Link>
        </div>

        {/* Category + status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
        }}>
          <span style={{
            fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: 'var(--color-accent)', fontFamily: 'var(--font-heading)',
          }}>{isRTL ? 'أخبار' : 'News'}</span>
          {isAdmin && article.status !== 'PUBLISHED' && <span className="tag tag-neutral">Draft</span>}
        </div>

        {/* ── Title ── */}
        <div dir={textDir}>
          <h1 style={{
            margin: '0 0 20px',
            fontFamily: isRTL ? AJ_HEADING_FONTS : 'var(--font-heading)',
            fontSize: isRTL ? 34 : 36,
            fontWeight: isRTL ? 700 : 800,
            lineHeight: isRTL ? 1.6 : 1.12,
            letterSpacing: isRTL ? 0 : '-0.03em',
            color: '#1a1a2e',
          }}>{article.title}</h1>
        </div>

        {/* ── Date + country ── */}
        <div dir={textDir} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          paddingBottom: 18, marginBottom: 24,
          borderBottom: '1px solid #e0e0e0',
          fontSize: 14, color: '#6b6b6b',
          fontFamily: isRTL ? AJ_FONTS : 'var(--font-body)',
        }}>
          {article.country_detail && (
            <>
              <Flag code={article.country_detail.code} name={article.country_detail.name} />
              <span style={{ fontWeight: 500 }}>{article.country_detail.name}</span>
              <span style={{ color: '#ccc' }}>|</span>
            </>
          )}
          <span>{formatDate(article.published_at || article.created_at)}</span>
        </div>

        {/* ── Cover image ── */}
        {article.cover_image && (
          <div style={{ margin: '0 0 28px' }}>
            <img
              src={mediaUrl(article.cover_image)} alt=""
              style={{ width: '100%', display: 'block', borderRadius: 2 }}
            />
          </div>
        )}

        {/* ── Article body ── */}
        <div dir={textDir} style={{ fontFamily: isRTL ? AJ_FONTS : 'var(--font-body)' }}>
          {paragraphs.length === 0 ? (
            <p style={{ fontSize: 14, color: '#999' }}>No article body.</p>
          ) : (
            paragraphs.map((p, i) => (
              <p key={i} style={{
                fontSize: isRTL ? 20 : 17,
                lineHeight: isRTL ? 2.0 : 1.7,
                margin: '0 0 24px',
                textAlign: isRTL ? 'justify' : 'left',
                color: '#2c2c2c',
                fontWeight: 400,
                wordSpacing: isRTL ? '2px' : 'normal',
              }}>{p}</p>
            ))
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          marginTop: 40, paddingTop: 20,
          borderTop: '1px solid #e0e0e0',
        }}>
          <Link to="/news" style={{
            fontSize: 13, textDecoration: 'none', color: 'var(--color-accent)',
            fontWeight: 600,
          }}>← {isRTL ? 'العودة إلى الأخبار' : 'Back to all news'}</Link>
        </div>
      </div>
    </div>
  )
}
