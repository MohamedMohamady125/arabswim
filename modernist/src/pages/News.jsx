import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, Edit3 } from 'lucide-react'
import { getArticles, createArticle, updateArticle, deleteArticle } from '../api/news'
import { getCountries } from '../api/core'
import { getTeams, getTeam } from '../api/teams'
import Flag from '../components/Flag'
import { PageHead, Loading, notify, Empty, Pager, Seg, Modal, FilterBar } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'
import { CropUpload } from '../components/ImageCropper'
import Pic from '../components/Pic'

const PAGE_SIZE = 13

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Drafts' },
]

const isRTLText = (text) => /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF]/.test(text || '')

// cut on a word boundary so Arabic and English excerpts never end mid-word
function excerpt(body, n = 100) {
  const s = String(body || '').replace(/\s+/g, ' ').trim()
  if (s.length <= n) return s
  const cut = s.slice(0, n)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).trim()}…`
}

const AR_FONT = "'Al-Jazeera', 'Helvetica Neue', Arial, sans-serif"
const monthOf = (a) => String(a.published_at || a.created_at || '').slice(0, 7)
const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return 'Undated'
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function ArticleModal({ article, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: article?.title || '',
    body: article?.body || '',
    // new articles default to Published — created news should show up on the
    // site (and its federation page) immediately unless Draft is chosen
    status: article?.status || 'PUBLISHED',
    published_at: article?.published_at || '',
    country: article?.country || '',
    team: article?.team || '',
  })
  const [cover, setCover] = useState(null)
  const [attachment, setAttachment] = useState(null)
  const [countries, setCountries] = useState([])
  const [clubQuery, setClubQuery] = useState('')
  const [clubOptions, setClubOptions] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getCountries().then((res) => setCountries(Array.isArray(res.data) ? res.data : res.data?.results || [])).catch(() => {})
  }, [])

  // Preload the linked club's name when editing
  useEffect(() => {
    if (article?.team) {
      getTeam(article.team)
        .then((res) => setClubOptions([{ id: res.data.id, name: res.data.name }]))
        .catch(() => {})
    }
  }, [article?.team])

  // Club search — narrowed by the selected federation when one is set
  useEffect(() => {
    if (!clubQuery.trim()) return
    const t = setTimeout(() => {
      getTeams({ search: clubQuery.trim(), country: form.country || undefined, page_size: 30, ordering: 'name' })
        .then((res) => {
          const list = Array.isArray(res.data) ? res.data : res.data?.results || []
          setClubOptions(list.map((c) => ({ id: c.id, name: c.name })))
        })
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [clubQuery, form.country])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true); setError('')
    try {
      const fd = new FormData()
      fd.append('title', form.title.trim())
      fd.append('body', form.body)
      fd.append('status', form.status)
      // only send a real date — an empty value would fail DRF date parsing;
      // left blank, the backend stamps today on publish
      if (form.published_at) fd.append('published_at', form.published_at)
      if (form.country) fd.append('country', form.country)
      else if (article) fd.append('country', '')
      if (form.team) fd.append('team', form.team)
      else if (article) fd.append('team', '')
      if (cover) fd.append('cover_image', cover)
      if (attachment) fd.append('attachment', attachment)
      if (article) {
        await updateArticle(article.id, fd)
      } else {
        await createArticle(fd)
      }
      // Peak-End Rule: the last step confirms what happened
      notify(form.status === 'PUBLISHED' ? (article ? 'Article saved. It is live on the site.' : 'Article published.') : 'Draft saved. Only admins can see it.')
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.title?.[0]
        || err.response?.data?.attachment?.[0] || err.response?.data?.cover_image?.[0] || 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <Modal title={article ? 'Edit Article' : 'Create Article'} onClose={onClose} width={640}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <div className="error-box" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="article-title">Title *</label>
          <input id="article-title" className="input" dir={isRTLText(form.title) ? 'rtl' : 'ltr'}
            style={isRTLText(form.title) ? { fontFamily: "'Al-Jazeera', 'Helvetica Neue', Arial, sans-serif", textAlign: 'right' } : undefined}
            value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="article-body">Body</label>
          <textarea id="article-body" className="input" rows={10} dir={isRTLText(form.body) ? 'rtl' : 'ltr'}
            value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
            style={{
              resize: 'vertical', minHeight: 160,
              ...(isRTLText(form.body) ? { fontFamily: "'Al-Jazeera', 'Helvetica Neue', Arial, sans-serif", textAlign: 'right', lineHeight: 1.8 } : {}),
            }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="article-status">Status</label>
            <select id="article-status" className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="article-date">Publish date (optional)</label>
            <input
              id="article-date" className="input" type="date" value={form.published_at}
              max="2100-12-31"
              onChange={(e) => setForm({ ...form, published_at: e.target.value })}
            />
            <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Pick a past date for old news — articles are shown and sorted by this date. Empty = today.
            </div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="article-federation">Federation (optional)</label>
          <select id="article-federation" className="select" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
            <option value="">None</option>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Club (optional)</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input className="input" inputMode="search" aria-label="Search clubs" placeholder="Search clubs…" value={clubQuery} onChange={(e) => setClubQuery(e.target.value)} />
            <select className="select" aria-label="Club" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })}>
              <option value="">None</option>
              {clubOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
            Linked articles show on the club and federation pages.
          </div>
        </div>
        <div className="field">
          <label>Cover image</label>
          <CropUpload kind="cover" onChange={setCover} />
          {cover && <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Adjusted cover ready</div>}
        </div>
        <div className="field">
          <label htmlFor="article-pdf">PDF attachment (optional)</label>
          <input id="article-pdf" className="input" type="file" accept=".pdf,application/pdf" onChange={(e) => setAttachment(e.target.files?.[0] || null)} />
          {article?.attachment && !attachment && (
            <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Current: <a href={mediaUrl(article.attachment)} target="_blank" rel="noreferrer">view PDF</a> — choose a file to replace it
            </div>
          )}
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
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('')
  const [countries, setCountries] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [editArticle, setEditArticle] = useState(null) // null=closed, {}=create, article=edit
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    getCountries().then((res) => {
      const all = Array.isArray(res.data) ? res.data : res.data?.results || []
      setCountries(all.filter((c) => c.region === 'ARAB' || c.region === 'GCC'))
    }).catch(() => {})
  }, [])

  // Doherty Threshold: wait for a pause in typing instead of reloading on every
  // letter. Postel's Law: surrounding and doubled spaces are ignored.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim().replace(/\s+/g, ' ')); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const status = isAdmin ? statusFilter || undefined : 'PUBLISHED'
    getArticles({ status, search: search || undefined, country: country || undefined, page, page_size: PAGE_SIZE })
      .then((res) => {
        if (!alive) return
        const d = res.data
        let list = Array.isArray(d) ? d : d?.results || []
        if (!isAdmin) list = list.filter((a) => a.status === 'PUBLISHED')
        setArticles(list)
        setCount(Array.isArray(d) ? d.length : d?.count || list.length)
        setFailed(false)
      })
      .catch(() => { if (alive) { setArticles([]); setCount(0); setFailed(true) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [page, search, country, statusFilter, isAdmin, reloadKey])

  const handleDelete = async (a) => {
    if (!window.confirm(`Delete article "${a.title}"? This cannot be undone.`)) return
    try {
      await deleteArticle(a.id)
      setArticles((prev) => prev.filter((x) => x.id !== a.id))
      setCount((c) => Math.max(0, c - 1))
      notify('Article deleted.')
    } catch {
      notify('Failed to delete article')
    }
  }

  const filtered = !!(search || country || statusFilter)
  const clearFilters = () => { setSearchInput(''); setSearch(''); setCountry(''); setStatusFilter(''); setPage(1) }
  const goPage = (p) => { setPage(p); window.scrollTo(0, 0) }

  // Von Restorff: one lead story, and only on the unfiltered front page. A
  // search result or page 2 is a plain list, so nothing is mislabelled "lead".
  const showLead = !filtered && page === 1 && articles.length > 0
  const lead = showLead ? articles[0] : null
  const rest = showLead ? articles.slice(1) : articles

  // Chunking: once the grid spans several months, each month gets a heading
  const groups = useMemo(() => {
    const months = [...new Set(rest.map(monthOf))]
    if (rest.length <= 6 || months.length < 2) return [{ key: 'all', label: null, items: rest }]
    return months.map((m) => ({ key: m, label: monthLabel(m), items: rest.filter((a) => monthOf(a) === m) }))
  }, [rest])

  // Admin tools sit in their own row under the card, outside the link, so a
  // click on Edit/Delete can never open the article (and the markup is valid).
  const meta = (a, size) => (
    <div className="content-news-meta" style={{ fontSize: size }}>
      {a.country_detail && <Flag code={a.country_detail.code} name={a.country_detail.name} />}
      {a.country_detail && <span>{a.country_detail.name}</span>}
      <span>{formatDate(a.published_at || a.created_at)}</span>
      {isAdmin && (
        <span className={`tag ${a.status === 'PUBLISHED' ? 'tag-accent' : 'tag-outline'}`}>
          {a.status === 'PUBLISHED' ? 'Published' : 'Draft — not public'}
        </span>
      )}
      {isAdmin && (
        <span className="content-news-admin">
          <button type="button" className="btn btn-ghost" aria-label={`Edit ${a.title}`} onClick={() => setEditArticle(a)}>
            <Edit3 size={13} /> Edit
          </button>
          <button type="button" className="btn btn-ghost" aria-label={`Delete ${a.title}`} onClick={() => handleDelete(a)}>
            <Trash2 size={13} /> Delete
          </button>
        </span>
      )}
    </div>
  )

  const card = (a) => {
    const rtlT = isRTLText(a.title)
    const rtlB = isRTLText(a.body)
    return (
      <article key={a.id} className="content-newscard">
        <Link to={`/news/${a.id}`}>
          {a.cover_image ? (
            <div className="news-cover" style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', background: 'var(--color-accent-800)' }}>
              <Pic kind="cover" w={640} className="news-cover-img" src={a.cover_image} style={{ position: 'relative' }} />
            </div>
          ) : (
            <div style={{ width: '100%', aspectRatio: '16 / 9', background: 'var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="micro">ArabSwiM</span>
            </div>
          )}
          <h2 className="content-news-title" dir={rtlT ? 'rtl' : 'ltr'} style={{
            fontFamily: rtlT ? AR_FONT : 'var(--font-heading)',
            fontWeight: rtlT ? 700 : 800,
            fontSize: rtlT ? 20 : 18,
            lineHeight: rtlT ? 1.6 : 1.18,
            letterSpacing: rtlT ? 0 : '-0.015em',
          }}>
            {a.title}
          </h2>
          {a.body && (
            <p dir={rtlB ? 'rtl' : 'ltr'} style={{
              fontSize: rtlB ? 16 : 13,
              lineHeight: rtlB ? 1.8 : 1.5,
              color: 'var(--color-accent-800)', margin: '0 0 8px',
              fontFamily: rtlB ? AR_FONT : 'inherit',
            }}>
              {excerpt(a.body)}
            </p>
          )}
        </Link>
        {meta(a, 12)}
      </article>
    )
  }

  const leadRtlT = lead && isRTLText(lead.title)
  const leadRtlB = lead && isRTLText(lead.body)

  return (
    <div>
      <PageHead title="News" sub="Stories and reports from around Arab swimming">
        {isAdmin && (
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-primary" onClick={() => setEditArticle({})}>Create article</button>
          </div>
        )}
      </PageHead>

      {/* Common Region + Working Memory: every way to narrow the list is in one
          bar, with the number of articles shown and one way back to everything */}
      <FilterBar count={loading || failed ? null : count} noun={count === 1 ? 'article' : 'articles'} active={filtered} onClear={clearFilters}>
        <input
          className="input"
          style={{ width: 260, maxWidth: '100%' }}
          type="search"
          placeholder="Search title or text…"
          aria-label="Search articles"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select className="select" style={{ width: 'auto', maxWidth: '100%' }} aria-label="Federation" value={country} onChange={(e) => { setCountry(e.target.value); setPage(1) }}>
          <option value="">All federations</option>
          {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {isAdmin && <Seg options={STATUS_TABS} value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1) }} />}
      </FilterBar>

      {loading && articles.length === 0 ? (
        <Loading label="Loading news" />
      ) : failed ? (
        <Empty label="News could not be loaded" hint="Check your connection and try again.">
          <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </Empty>
      ) : articles.length === 0 ? (
        <Empty label="No articles found" hint={filtered ? 'Nothing matches these filters. Try a shorter search or another federation.' : (isAdmin ? 'Use "Create article" above to publish the first story.' : 'New stories will appear here.')}>
          {filtered && <button type="button" className="btn btn-secondary" onClick={clearFilters}>Show all news</button>}
        </Empty>
      ) : (
        <div className="pad-lg" aria-busy={loading} style={{ opacity: loading ? 0.55 : 1 }}>
          {lead && (
            <article className="content-newscard content-newslead">
              <Link to={`/news/${lead.id}`} className="grid-2" style={{ display: 'grid', gridTemplateColumns: lead.cover_image ? '1.4fr 1fr' : '1fr', gap: 32, alignItems: 'start' }}>
                {lead.cover_image && (
                  <div className="news-cover" style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', background: 'var(--color-accent-800)' }}>
                    <Pic kind="cover" w={640} className="news-cover-img" src={lead.cover_image} style={{ position: 'relative' }} />
                  </div>
                )}
                <div>
                  <div className="card-kicker">Latest story</div>
                  <h2 className="content-news-title" dir={leadRtlT ? 'rtl' : 'ltr'} style={{
                    fontFamily: leadRtlT ? AR_FONT : 'var(--font-heading)',
                    fontWeight: leadRtlT ? 700 : 800,
                    fontSize: 28,
                    lineHeight: leadRtlT ? 1.7 : 1.06,
                    letterSpacing: leadRtlT ? 0 : '-0.025em',
                    margin: '8px 0 12px',
                  }}>
                    {lead.title}
                  </h2>
                  <p dir={leadRtlB ? 'rtl' : 'ltr'} style={{
                    fontSize: leadRtlB ? 18 : 15,
                    lineHeight: leadRtlB ? 1.8 : 1.55,
                    color: 'var(--color-accent-800)', margin: '0 0 14px',
                    fontFamily: leadRtlB ? AR_FONT : 'inherit',
                    textAlign: leadRtlB ? 'justify' : 'left',
                  }}>
                    {excerpt(lead.body, 300)}
                  </p>
                  <span className="content-news-more" dir={leadRtlT ? 'rtl' : 'ltr'} style={leadRtlT ? { fontFamily: AR_FONT } : undefined}>
                    {leadRtlT ? 'اقرأ الخبر كاملاً ←' : 'Read the full story →'}
                  </span>
                </div>
              </Link>
              {meta(lead, 13)}
            </article>
          )}

          {groups.map((g, gi) => g.items.length > 0 && (
            <section key={g.key} className={lead || gi > 0 ? 'rule-t' : undefined} style={lead || gi > 0 ? { marginTop: 28, paddingTop: 24 } : undefined}>
              {g.label && <div className="kicker" style={{ marginBottom: 14 }}>{g.label}</div>}
              <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '28px 24px' }}>
                {g.items.map(card)}
              </div>
            </section>
          ))}

          <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={goPage} />
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
