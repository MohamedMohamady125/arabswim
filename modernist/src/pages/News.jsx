import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, Edit3 } from 'lucide-react'
import { getArticles, createArticle, updateArticle, deleteArticle } from '../api/news'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Pager, Seg, Modal } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'

const PAGE_SIZE = 13

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Drafts' },
]

const isRTLText = (text) => /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF]/.test(text || '')

function excerpt(body, n = 100) {
  const s = String(body || '')
  return s.length > n ? `${s.slice(0, n)}…` : s
}

function ArticleModal({ article, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: article?.title || '',
    body: article?.body || '',
    status: article?.status || 'DRAFT',
    country: article?.country || '',
  })
  const [cover, setCover] = useState(null)
  const [countries, setCountries] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getCountries().then((res) => setCountries(Array.isArray(res.data) ? res.data : res.data?.results || [])).catch(() => {})
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true); setError('')
    try {
      const fd = new FormData()
      fd.append('title', form.title)
      fd.append('body', form.body)
      fd.append('status', form.status)
      if (form.country) fd.append('country', form.country)
      if (cover) fd.append('cover_image', cover)
      if (article) {
        await updateArticle(article.id, fd)
      } else {
        await createArticle(fd)
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.title?.[0] || 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <Modal title={article ? 'Edit Article' : 'Create Article'} onClose={onClose} width={640}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div className="error-box">{error}</div>}
        <div className="field">
          <label>Title *</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div className="field">
          <label>Body</label>
          <textarea className="input" rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
            style={{ resize: 'vertical', minHeight: 160 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>Status</label>
            <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </div>
          <div className="field">
            <label>Country (optional)</label>
            <select className="select" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
              <option value="">None</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Cover image</label>
          <input className="input" type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] || null)} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : article ? 'Save changes' : 'Create article'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function News() {
  const { isAdmin } = useAuth()
  const [articles, setArticles] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [editArticle, setEditArticle] = useState(null) // null=closed, {}=create, article=edit
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const status = isAdmin ? statusFilter || undefined : 'PUBLISHED'
    getArticles({ status, search: search || undefined, page, page_size: PAGE_SIZE })
      .then((res) => {
        if (!alive) return
        const d = res.data
        let list = Array.isArray(d) ? d : d?.results || []
        if (!isAdmin) list = list.filter((a) => a.status === 'PUBLISHED')
        setArticles(list)
        setCount(Array.isArray(d) ? d.length : d?.count || list.length)
      })
      .catch(() => alive && setArticles([]))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [page, search, statusFilter, isAdmin, reloadKey])

  const handleDelete = async (a) => {
    if (!window.confirm(`Delete article "${a.title}"? This cannot be undone.`)) return
    try {
      await deleteArticle(a.id)
      setArticles((prev) => prev.filter((x) => x.id !== a.id))
      setCount((c) => Math.max(0, c - 1))
    } catch {
      window.alert('Failed to delete article')
    }
  }

  const statusTag = (a) =>
    isAdmin ? (
      <span className={`tag ${a.status === 'PUBLISHED' ? 'tag-accent' : 'tag-neutral'}`}>
        {a.status === 'PUBLISHED' ? 'Published' : 'Draft'}
      </span>
    ) : null

  const adminBtns = (a) =>
    isAdmin ? (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <button type="button" className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditArticle(a) }}>
          <Edit3 size={13} /> Edit
        </button>
        <button type="button" className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(a) }}>
          <Trash2 size={13} /> Delete
        </button>
      </span>
    ) : null

  const lead = articles[0]
  const rest = articles.slice(1)

  return (
    <div>
      <style>{`a:hover .news-cover.grayscale { filter: none; }`}</style>
      <PageHead kicker="Content" title="News" sub="Stories and reports from around Arab swimming">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
          <input
            className="input"
            style={{ maxWidth: 320 }}
            placeholder="Search articles…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
          {isAdmin && (
            <>
              <Seg options={STATUS_TABS} value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1) }} />
              <button className="btn btn-primary" onClick={() => setEditArticle({})}>Create article</button>
            </>
          )}
        </div>
      </PageHead>

      <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />
      {loading ? (
        <Loading label="Loading news" />
      ) : articles.length === 0 ? (
        <Empty label="No articles found" />
      ) : (
        <div className="pad-lg">
          {/* lead story */}
          <Link to={`/news/${lead.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: lead.cover_image ? '1.4fr 1fr' : '1fr', gap: 28, alignItems: 'start' }}>
              {lead.cover_image && (
                <div className="grayscale news-cover" style={{ width: '100%', height: 380, overflow: 'hidden' }}>
                  <img src={mediaUrl(lead.cover_image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="card-kicker">Lead story</div>
                  {statusTag(lead)}
                </div>
                <div dir={isRTLText(lead.title) ? 'rtl' : 'ltr'} style={{
                  fontFamily: isRTLText(lead.title) ? "'Noto Naskh Arabic', 'Amiri', serif" : 'var(--font-heading)',
                  fontWeight: isRTLText(lead.title) ? 700 : 800,
                  fontSize: isRTLText(lead.title) ? 32 : 34,
                  lineHeight: isRTLText(lead.title) ? 1.6 : 1.06,
                  letterSpacing: isRTLText(lead.title) ? 0 : '-0.025em',
                  margin: '8px 0 12px', color: '#1a1a2e',
                }}>
                  {lead.title}
                </div>
                <p dir={isRTLText(lead.body) ? 'rtl' : 'ltr'} style={{
                  fontSize: isRTLText(lead.body) ? 17 : 15,
                  lineHeight: isRTLText(lead.body) ? 1.9 : 1.55,
                  color: '#2c2c2c', margin: '0 0 14px',
                  fontFamily: isRTLText(lead.body) ? "'Noto Naskh Arabic', serif" : 'inherit',
                  textAlign: isRTLText(lead.body) ? 'justify' : 'left',
                }}>
                  {excerpt(lead.body, 300)}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, borderTop: '1px solid var(--color-divider)', fontSize: 13, color: 'var(--color-neutral-700)' }}>
                  {lead.country_detail && <Flag code={lead.country_detail.code} name={lead.country_detail.name} />}
                  {lead.country_detail && <span>{lead.country_detail.name}</span>}
                  <span>{formatDate(lead.published_at || lead.created_at)}</span>
                  <span style={{ flex: 1 }} />
                  {adminBtns(lead)}
                </div>
              </div>
            </div>
          </Link>

          {/* remaining articles */}
          {rest.length > 0 && (
            <div className="rule-t" style={{ marginTop: 28, paddingTop: 24 }}>
              <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '28px 24px' }}>
                {rest.map((a) => (
                  <Link key={a.id} to={`/news/${a.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {a.cover_image ? (
                      <div className="grayscale news-cover" style={{ width: '100%', height: 180, overflow: 'hidden' }}>
                        <img src={mediaUrl(a.cover_image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ) : (
                      <div style={{ width: '100%', height: 180, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="micro">ArabSwiM</span>
                      </div>
                    )}
                    {isAdmin && <div style={{ marginTop: 8 }}>{statusTag(a)}</div>}
                    <div dir={isRTLText(a.title) ? 'rtl' : 'ltr'} style={{
                      fontFamily: isRTLText(a.title) ? "'Noto Naskh Arabic', 'Amiri', serif" : 'var(--font-heading)',
                      fontWeight: isRTLText(a.title) ? 700 : 800,
                      fontSize: isRTLText(a.title) ? 20 : 18,
                      lineHeight: isRTLText(a.title) ? 1.6 : 1.18,
                      letterSpacing: isRTLText(a.title) ? 0 : '-0.015em',
                      margin: '10px 0 6px', color: '#1a1a2e',
                    }}>
                      {a.title}
                    </div>
                    {a.body && (
                      <p dir={isRTLText(a.body) ? 'rtl' : 'ltr'} style={{
                        fontSize: isRTLText(a.body) ? 15 : 13,
                        lineHeight: isRTLText(a.body) ? 1.8 : 1.5,
                        color: '#2c2c2c', margin: '0 0 8px',
                        fontFamily: isRTLText(a.body) ? "'Noto Naskh Arabic', serif" : 'inherit',
                      }}>
                        {excerpt(a.body)}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-neutral-700)' }}>
                      {a.country_detail && <Flag code={a.country_detail.code} name={a.country_detail.name} />}
                      {a.country_detail && <span>{a.country_detail.name}</span>}
                      <span>{formatDate(a.published_at || a.created_at)}</span>
                      <span style={{ flex: 1 }} />
                      {adminBtns(a)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
        </div>
      )}

      {editArticle !== null && (
        <ArticleModal
          article={editArticle.id ? editArticle : null}
          onClose={() => setEditArticle(null)}
          onSaved={() => { setEditArticle(null); setReloadKey((k) => k + 1) }}
        />
      )}
    </div>
  )
}
