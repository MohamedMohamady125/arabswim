import { useEffect, useState } from 'react'
import { getCoaches } from '../api/coaches'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Pager } from '../components/ui'
import { mediaUrl } from '../utils'

const PAGE_SIZE = 25

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export default function Coaches() {
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getCoaches({ page, page_size: PAGE_SIZE })
      .then((res) => {
        if (!alive) return
        const d = res.data
        const list = Array.isArray(d) ? d : d?.results || []
        setRows(list)
        setCount(Array.isArray(d) ? d.length : d?.count || 0)
      })
      .catch(() => { if (alive) { setRows([]); setCount(0) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [page])

  return (
    <div>
      <PageHead kicker="People" title="Coaches" sub="Coaches across Arab swimming." />

      {loading ? (
        <Loading label="Loading coaches" />
      ) : rows.length === 0 ? (
        <Empty label="No coaches yet" />
      ) : (
        <div className="pad">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Coach</th>
                  <th>Country</th>
                  <th>Club</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {c.photo ? (
                          <div className="grayscale" style={{ width: 36, height: 36, flex: 'none', overflow: 'hidden' }}>
                            <img src={mediaUrl(c.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ) : (
                          <div style={{ width: 36, height: 36, flex: 'none', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 12 }}>
                            {initials(c.name)}
                          </div>
                        )}
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Flag code={c.nationality_detail?.code || c.country_detail?.code} name={c.nationality_detail?.name || c.country_detail?.name} />
                        <span className="text-muted">{c.nationality_detail?.name || c.country_detail?.name || '—'}</span>
                      </div>
                    </td>
                    <td className="text-muted">{c.club || c.team_detail?.name || c.team_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
        </div>
      )}
    </div>
  )
}
