import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { getArticles, deleteArticle } from '../api/news'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Pager, Seg } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'

const PAGE_SIZE = 13

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Drafts' },
]

function excerpt(body, n = 100) {
  const s = String(body || '')
  return s.length > n ? `${s.slice(0, n)}…` : s
}

export default function News() {
  const { isAdmin } = useAuth()
  const [articles, setArticles] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

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
  }, [page, search, statusFilter, isAdmin])

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

  const deleteBtn = (a) =>
    isAdmin ? (
      <button
        type="button"
        className="btn btn-ghost"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(a) }}
      >
        <Trash2 size={13} /> Delete
      </button>
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
            <Seg options={STATUS_TABS} value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1) }} />
          )}
        </div>
      </PageHead>

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
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 34, lineHeight: 1.06, letterSpacing: '-0.025em', margin: '8px 0 12px' }}>
                  {lead.title}
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--color-neutral-800)', margin: '0 0 14px' }}>
                  {excerpt(lead.body, 300)}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, borderTop: '1px solid var(--color-divider)', fontSize: 13, color: 'var(--color-neutral-700)' }}>
                  {lead.country_detail && <Flag code={lead.country_detail.code} name={lead.country_detail.name} />}
                  {lead.country_detail && <span>{lead.country_detail.name}</span>}
                  <span>{formatDate(lead.published_at || lead.created_at)}</span>
                  <span style={{ flex: 1 }} />
                  {deleteBtn(lead)}
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
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, lineHeight: 1.18, letterSpacing: '-0.015em', margin: '10px 0 6px' }}>
                      {a.title}
                    </div>
                    {a.body && (
                      <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-neutral-800)', margin: '0 0 8px' }}>
                        {excerpt(a.body)}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-neutral-700)' }}>
                      {a.country_detail && <Flag code={a.country_detail.code} name={a.country_detail.name} />}
                      {a.country_detail && <span>{a.country_detail.name}</span>}
                      <span>{formatDate(a.published_at || a.created_at)}</span>
                      <span style={{ flex: 1 }} />
                      {deleteBtn(a)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
        </div>
      )}
    </div>
  )
}
