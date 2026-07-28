import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Newspaper, Plus, Pencil, Trash2 } from 'lucide-react'
import { getArticles, deleteArticle } from '../api/news'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../utils/constants'
import { Button, Badge, SearchInput, SegmentedControl, EmptyState, ConfirmDialog, CardsSkeleton, PageHeader } from '../components/ui'

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'PUBLISHED', label: 'Published' },
  { key: 'DRAFT', label: 'Drafts' },
]

export default function NewsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { token } = useAuth()
  const isAdmin = !!token
  const [articles, setArticles] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState(null)

  useEffect(() => {
    const params = { search: search || undefined, status: statusFilter || undefined, page_size: 100 }
    getArticles(params).then((res) => {
      setArticles(Array.isArray(res.data) ? res.data : res.data.results || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [search, statusFilter])

  const handleDelete = async (article) => {
    try {
      await deleteArticle(article.id)
      setArticles((prev) => prev.filter((a) => a.id !== article.id))
      toast.success('Article deleted')
    } catch {
      toast.error('Failed to delete article')
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      <PageHeader
        title="News"
        subtitle={`${articles.length} article${articles.length === 1 ? '' : 's'}`}
        action={isAdmin && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => navigate('/news/new')}>
            New Article
          </Button>
        )}
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-5">
        <SearchInput placeholder="Search articles..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="flex-1 sm:max-w-md" />
        {isAdmin && (
          <SegmentedControl options={STATUS_TABS} value={statusFilter} onChange={setStatusFilter} />
        )}
      </div>

      {loading ? (
        <CardsSkeleton count={6} />
      ) : articles.length === 0 ? (
        <div className="bg-white rounded-md shadow-card border border-ink-100">
          <EmptyState icon={Newspaper} title="No articles yet" hint="News from around the Arab swimming world will appear here." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((a) => (
            <article key={a.id}
              className="bg-white rounded-md shadow-card border border-ink-100 overflow-hidden transition-colors hover:border-aqua-500/40 flex flex-col">
              <div className={`h-40 bg-ink-50 ${isAdmin ? 'cursor-pointer' : ''}`}
                onClick={() => isAdmin && navigate(`/news/${a.id}/edit`)}>
                {a.cover_image ? (
                  <img src={a.cover_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-ink-200">
                    <Newspaper size={36} />
                  </div>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {isAdmin && (
                    <Badge variant={a.status === 'PUBLISHED' ? 'pos' : 'medal'}>
                      {a.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                    </Badge>
                  )}
                  {a.published_at && <span className="text-body-sm text-ink-400 tnum">{formatDate(a.published_at)}</span>}
                  {a.country_detail && <span className="text-body-sm text-ink-400">· {a.country_detail.name}</span>}
                </div>
                <h3 className={`text-body font-semibold text-ink-900 leading-snug line-clamp-2 ${isAdmin ? 'cursor-pointer hover:text-aqua-600' : ''}`}
                  onClick={() => isAdmin && navigate(`/news/${a.id}/edit`)}>
                  {a.title}
                </h3>
                <p className="text-body-sm text-ink-500 mt-1.5 line-clamp-2 flex-1">{a.body}</p>
                {isAdmin && (
                  <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-ink-100">
                    <Button variant="ghost" size="sm" icon={Pencil}
                      onClick={() => navigate(`/news/${a.id}/edit`)}>Edit</Button>
                    <Button variant="ghost" size="sm" icon={Trash2} className="hover:text-neg"
                      onClick={() => setPendingDelete(a)}>Delete</Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete article"
        message={pendingDelete ? `Delete article "${pendingDelete.title}"? This cannot be undone.` : ''}
        destructive
        onConfirm={() => handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
