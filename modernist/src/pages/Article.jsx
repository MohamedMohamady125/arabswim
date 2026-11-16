import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getArticle, getArticles, deleteArticle } from '../api/news'
import Flag from '../components/Flag'
import { Loading, notify, Empty, BackLink } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'
import { Edit3, Trash2 } from 'lucide-react'
import { ArticleModal } from './News'
import Pic from '../components/Pic'

/* ── Al Jazeera typography — the real aljazeera.net stack ─────────── */
const AJ_FONTS = "'Al-Jazeera', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif"
const AJ_HEADING_FONTS = AJ_FONTS

export default function Article() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [more, setMore] = useState([])

  // Peak-End Rule: the page ends with the next stories, not a dead end
  useEffect(() => {
    let alive = true
    getArticles({ status: 'PUBLISHED', page_size: 4 })
      .then((res) => {
        if (!alive) return
        const list = Array.isArray(res.data) ? res.data : res.data?.results || []
        setMore(list.filter((a) => String(a.id) !== String(id) && a.status === 'PUBLISHED').slice(0, 3))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    let alive = true
    setLoading(true)
    getArticle(id)
      .then((res) => alive && setArticle(res.data))
      .catch(() => alive && setArticle(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [id, reloadKey])

  if (loading) return <Loading label="Loading article" />
  if (!article || (article.status !== 'PUBLISHED' && !isAdmin)) return (
    <Empty label="Article not found" hint="It may have been removed, or the link is wrong.">
      <Link to="/news" className="btn btn-secondary">All news</Link>
    </Empty>
  )

  // Normalize CRLF from the editor, split paragraphs on blank lines; single
  // newlines inside a paragraph are preserved via white-space: pre-line.
  const paragraphs = String(article.body || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).filter((p) => p.trim())

  const isRTL = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF]/.test(
    (article.title || '') + (paragraphs[0] || '')
  )
  const textDir = isRTL ? 'rtl' : 'ltr'

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '80vh' }}>
      {/* Top accent bar */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, var(--asw-gold), var(--color-accent))' }} />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* Jakob's Law: one back link, top-left. Occam's Razor: the "News"
            kicker that repeated it is gone; the row below only exists for admins */}
        <div dir={textDir} style={{ marginBottom: 12 }}>
          <BackLink to="/news">{isRTL ? 'جميع الأخبار' : 'All news'}</BackLink>
        </div>

        {isAdmin && (
          <div className="content-article-admin">
            <span className={`tag ${article.status === 'PUBLISHED' ? 'tag-accent' : 'tag-outline'}`}>
              {article.status === 'PUBLISHED' ? 'Published' : 'Draft — only admins can see this'}
            </span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                <Edit3 size={13} /> Edit
              </button>
              <button type="button" className="btn btn-secondary"
                style={{ borderColor: 'var(--asw-slow)', color: 'var(--asw-slow)' }}
                onClick={async () => {
                  if (!window.confirm(`Delete article "${article.title}"? This cannot be undone.`)) return
                  try {
                    await deleteArticle(article.id)
                    notify('Article deleted.')
                    navigate('/news')
                  } catch {
                    notify('Failed to delete article')
                  }
                }}>
                <Trash2 size={13} /> Delete
              </button>
            </span>
          </div>
        )}
        {editing && (
          <ArticleModal article={article} onClose={() => setEditing(false)}
            onSaved={() => { setEditing(false); setReloadKey((k) => k + 1) }} />
        )}

        {/* ── Title ── */}
        <div dir={textDir}>
          <h1 style={{
            margin: '0 0 20px',
            fontFamily: isRTL ? AJ_HEADING_FONTS : 'var(--font-heading)',
            fontSize: isRTL ? 34 : 36,
            fontWeight: isRTL ? 700 : 800,
            lineHeight: isRTL ? 1.7 : 1.12,
            letterSpacing: isRTL ? 0 : '-0.03em',
            color: 'var(--color-accent-800)',
          }}>{article.title}</h1>
        </div>

        {/* ── Date + country ── */}
        <div dir={textDir} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          paddingBottom: 18, marginBottom: 24,
          borderBottom: '1px solid var(--color-divider)',
          fontSize: 14, color: 'var(--color-neutral-700)',
          fontFamily: isRTL ? AJ_FONTS : 'var(--font-body)',
        }}>
          {article.country_detail && (
            <>
              <Link to={`/countries/${article.country_detail.id}?tab=news`} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, minHeight: 32, color: 'inherit', textDecoration: 'none' }}>
                <Flag code={article.country_detail.code} name={article.country_detail.name} />
                <span style={{ fontWeight: 600 }}>{article.country_detail.name}</span>
              </Link>
              <span aria-hidden="true" style={{ color: 'var(--color-neutral-400)' }}>|</span>
            </>
          )}
          <bdi dir="ltr">{formatDate(article.published_at || article.created_at)}</bdi>
        </div>

        {/* ── Cover image ── */}
        {article.cover_image && (
          // The article's own page shows the whole picture in its own shape —
          // nothing cropped. Only a very tall image is scaled down to fit the screen.
          <div style={{ margin: '0 0 28px', background: 'var(--color-accent-800)', display: 'flex', justifyContent: 'center' }}>
            <Pic kind="cover" w={960} eager fill={false}
              src={article.cover_image}
              style={{ width: 'auto', maxWidth: '100%', height: 'auto', maxHeight: '85vh', objectFit: 'contain' }}
            />
          </div>
        )}

        {/* ── Article body ── */}
        <div dir={textDir} style={{ fontFamily: isRTL ? AJ_FONTS : 'var(--font-body)' }}>
          {paragraphs.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--color-neutral-700)' }}>{isAdmin ? 'This article has no text yet. Use Edit above to add it.' : 'This article has no text.'}</p>
          ) : (
            paragraphs.map((p, i) => (
              <p key={i} style={{
                fontSize: 18,
                lineHeight: isRTL ? 1.8 : 1.7,
                margin: '0 0 24px',
                textAlign: isRTL ? 'justify' : 'left',
                color: 'var(--color-accent-800)',
                fontWeight: 400,
                wordSpacing: isRTL ? '2px' : 'normal',
                whiteSpace: 'pre-line',
              }}>{p.trim()}</p>
            ))
          )}
        </div>

        {/* ── PDF attachment (after the article text) ── */}
        {article.attachment && (
          <div dir={textDir} style={{ margin: '4px 0 0' }}>
            <a
              href={mediaUrl(article.attachment)} target="_blank" rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', textDecoration: 'none',
                background: 'var(--color-neutral-100)', border: '1px solid var(--color-divider)', minHeight: 44,
                color: 'var(--color-accent-800)', fontWeight: 600, fontSize: 16,
                fontFamily: isRTL ? AJ_FONTS : 'var(--font-body)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              {isRTL ? 'اطّلع على الملف المرفق' : 'View attached file (PDF)'}
            </a>
          </div>
        )}

        {/* ── More news (end of the story) ── */}
        <div style={{ marginTop: 40, paddingTop: 20, borderTop: '2px solid var(--color-text)' }}>
          {more.length > 0 && (
            <>
              <div className="kicker" style={{ marginBottom: 6 }}>More news</div>
              {more.map((a) => {
                const rtl = /[\u0600-\u06FF\u0750-\u077F]/.test(a.title || '')
                return (
                  <Link key={a.id} to={`/news/${a.id}`} className="content-article-more">
                    {a.cover_image
                      ? <Pic kind="cover" w={128} fill={false} src={a.cover_image} />
                      : <span className="content-article-more-ph" aria-hidden="true" />}
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <strong dir={rtl ? 'rtl' : 'ltr'} style={rtl ? { fontFamily: AJ_FONTS, lineHeight: 1.6 } : undefined}>{a.title}</strong>
                      <span className="content-article-more-date">
                        {a.country_detail?.name ? `${a.country_detail.name} · ` : ''}{formatDate(a.published_at || a.created_at)}
                      </span>
                    </span>
                  </Link>
                )
              })}
            </>
          )}
          <div dir={textDir} style={{ marginTop: 12 }}>
            <BackLink to="/news">{isRTL ? 'العودة إلى الأخبار' : 'Back to all news'}</BackLink>
          </div>
        </div>
      </div>
    </div>
  )
}
