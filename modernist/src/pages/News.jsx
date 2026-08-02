import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getArticles } from '../api/news'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Pager } from '../components/ui'
import { formatDate, mediaUrl } from '../utils'

const PAGE_SIZE = 13

export default function News() {
  const [articles, setArticles] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getArticles({ status: 'PUBLISHED', page, page_size: PAGE_SIZE })
      .then((res) => {
        if (!alive) return
        const d = res.data
        const list = Array.isArray(d) ? d : d?.results || []
        setArticles(list.filter((a) => a.status === 'PUBLISHED'))
        setCount(Array.isArray(d) ? d.length : d?.count || list.length)
      })
      .catch(() => alive && setArticles([]))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [page])

  const lead = articles[0]
  const rest = articles.slice(1)

  return (
    <div>
      <PageHead kicker="Content" title="News" sub="Stories and reports from around Arab swimming" />
      {loading ? (
        <Loading label="Loading news" />
      ) : articles.length === 0 ? (
        <Empty label="No published articles yet" />
      ) : (
        <div className="pad-lg">
          {/* lead story */}
          <Link to={`/news/${lead.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: lead.cover_image ? '1.4fr 1fr' : '1fr', gap: 28, alignItems: 'start' }}>
              {lead.cover_image && (
                <div className="grayscale" style={{ width: '100%', height: 380, overflow: 'hidden' }}>
                  <img src={mediaUrl(lead.cover_image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div>
                <div className="card-kicker">Lead story</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 34, lineHeight: 1.06, letterSpacing: '-0.025em', margin: '8px 0 12px' }}>
                  {lead.title}
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--color-neutral-800)', margin: '0 0 14px' }}>
                  {String(lead.body || '').slice(0, 300)}
                  {String(lead.body || '').length > 300 ? '…' : ''}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, borderTop: '1px solid var(--color-divider)', fontSize: 13, color: 'var(--color-neutral-700)' }}>
                  {lead.country_detail && <Flag code={lead.country_detail.code} name={lead.country_detail.name} />}
                  <span>{formatDate(lead.published_at || lead.created_at)}</span>
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
                      <div className="grayscale" style={{ width: '100%', height: 180, overflow: 'hidden' }}>
                        <img src={mediaUrl(a.cover_image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ) : (
                      <div style={{ width: '100%', height: 180, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="micro">ArabSwiM</span>
                      </div>
                    )}
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, lineHeight: 1.18, letterSpacing: '-0.015em', margin: '10px 0 6px' }}>
                      {a.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-neutral-700)' }}>
                      {a.country_detail && <Flag code={a.country_detail.code} name={a.country_detail.name} />}
                      <span>{formatDate(a.published_at || a.created_at)}</span>
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
