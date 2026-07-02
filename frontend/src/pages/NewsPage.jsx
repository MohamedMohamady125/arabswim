import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Newspaper, Plus, Pencil, Trash2 } from 'lucide-react'
import { getArticles, deleteArticle } from '../api/news'
import { useToast } from '../context/ToastContext'

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Drafts' },
]

export default function NewsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [articles, setArticles] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    const params = { search: search || undefined, status: statusFilter || undefined, page_size: 100 }
    getArticles(params).then((res) => {
      setArticles(Array.isArray(res.data) ? res.data : res.data.results || [])
    }).catch(() => {})
  }, [search, statusFilter])

  const handleDelete = async (article) => {
    if (!window.confirm(`Delete article "${article.title}"?`)) return
    try {
      await deleteArticle(article.id)
      setArticles((prev) => prev.filter((a) => a.id !== article.id))
      toast.success('Article deleted')
    } catch {
      toast.error('Failed to delete article')
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Newspaper size={24} className="text-blue-600" /> News
          <span className="text-gray-400 text-lg font-normal">({articles.length})</span>
        </h1>
        <button onClick={() => navigate('/news/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={16} /> New Article
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <input
          type="text" placeholder="Search articles..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"
        />
        <div className="flex rounded-lg border bg-white overflow-hidden">
          {STATUS_TABS.map((t) => (
            <button key={t.value} onClick={() => setStatusFilter(t.value)}
              className={`px-4 py-2 text-sm ${statusFilter === t.value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {articles.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          No articles yet. Write your first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
              <div className="h-40 bg-gray-100 cursor-pointer" onClick={() => navigate(`/news/${a.id}/edit`)}>
                {a.cover_image ? (
                  <img src={a.cover_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <Newspaper size={36} />
                  </div>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    a.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {a.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                  </span>
                  {a.published_at && <span className="text-xs text-gray-400">{a.published_at}</span>}
                  {a.country_detail && <span className="text-xs text-gray-400">· {a.country_detail.name}</span>}
                </div>
                <h3 className="font-semibold text-sm leading-snug cursor-pointer hover:text-blue-600 line-clamp-2"
                  onClick={() => navigate(`/news/${a.id}/edit`)}>
                  {a.title}
                </h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2 flex-1">{a.body}</p>
                <div className="flex justify-end gap-3 mt-3 pt-3 border-t border-gray-100">
                  <button onClick={() => navigate(`/news/${a.id}/edit`)}
                    className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1">
                    <Pencil size={13} /> Edit
                  </button>
                  <button onClick={() => handleDelete(a)}
                    className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1">
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
