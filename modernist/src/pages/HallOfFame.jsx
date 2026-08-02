import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { getInductees, deleteInductee } from '../api/fame'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty } from '../components/ui'
import { mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'

const GOLD = '#b8860b'

export default function HallOfFame() {
  const { isAdmin } = useAuth()
  const [inductees, setInductees] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getInductees({ search: search || undefined })
      .then((res) => {
        if (!alive) return
        const d = res.data
        setInductees(Array.isArray(d) ? d : d?.results || [])
      })
      .catch(() => { if (alive) setInductees([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [search])

  const sorted = useMemo(
    () => [...inductees].sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999)),
    [inductees]
  )

  const handleDelete = async (p) => {
    if (!window.confirm(`Remove "${p.name}" from the Hall of Fame?`)) return
    try {
      await deleteInductee(p.id)
      setInductees((prev) => prev.filter((x) => x.id !== p.id))
    } catch {
      window.alert('Failed to remove inductee')
    }
  }

  return (
    <div>
      <PageHead
        kicker="Legacy"
        title="Hall of Fame"
        sub="The swimmers who defined Arab swimming."
      >
        <input
          className="input"
          style={{ maxWidth: 320, marginTop: 14 }}
          placeholder="Search inductees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </PageHead>

      {loading ? (
        <Loading label="Loading the Hall of Fame" />
      ) : sorted.length === 0 ? (
        <Empty label="No inductees found" />
      ) : (
        <div className="grid-2 pad" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          {sorted.map((p) => {
            const photo = p.photo || p.swimmer_detail?.photo
            return (
              <article key={p.id} className="hair-b" style={{ paddingBottom: 28, borderLeft: `2px solid ${GOLD}`, paddingLeft: 18 }}>
                {photo && (
                  <div className="grayscale" style={{ width: '100%', height: 320, overflow: 'hidden', marginBottom: 16 }}>
                    <img src={mediaUrl(photo)} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  {p.inducted_year && <span className="tag tag-dark">Class of {p.inducted_year}</span>}
                  {p.era && <span className="micro">{p.era}</span>}
                </div>
                <h2 style={{ margin: '0 0 8px', letterSpacing: '-0.02em' }}>{p.name}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 13, color: 'var(--color-neutral-700)' }}>
                  <Flag code={p.country_detail?.code} name={p.country_detail?.name} />
                  <span>{p.country_detail?.name}</span>
                </div>
                {p.achievements && (
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-neutral-800)', margin: 0 }}>
                    {p.achievements}
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--color-divider)' }}>
                  {p.swimmer ? (
                    <Link to={`/swimmers/${p.swimmer}`} style={{ fontSize: 12, textDecoration: 'none' }}>
                      View swimmer profile →
                    </Link>
                  ) : (
                    <span className="micro">Standalone legend</span>
                  )}
                  <span style={{ flex: 1 }} />
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      onClick={() => handleDelete(p)}
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
