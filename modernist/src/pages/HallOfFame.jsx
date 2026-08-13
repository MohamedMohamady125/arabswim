import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, Plus } from 'lucide-react'
import { getInductees, createInductee, deleteInductee } from '../api/fame'
import { searchSwimmers } from '../api/swimmers'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Seg } from '../components/ui'
import { mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'

const GOLD = '#b8860b'

const CATEGORIES = [
  { value: 'LEGEND', label: 'Legends' },
  { value: 'OLYMPIAN', label: 'Olympians' },
  { value: 'ARAB_WINNER', label: 'Arab Swim Winners' },
]

export default function HallOfFame() {
  const { isAdmin } = useAuth()
  const [inductees, setInductees] = useState([])
  const [category, setCategory] = useState('LEGEND')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    getInductees({ search: search || undefined })
      .then((res) => {
        const d = res.data
        setInductees(Array.isArray(d) ? d : d?.results || [])
      })
      .catch(() => setInductees([]))
      .finally(() => setLoading(false))
  }

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
    () => inductees
      .filter((p) => (p.category || 'LEGEND') === category)
      .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999)),
    [inductees, category]
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

      <div className="rule-b" style={{ padding: '10px 32px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Seg options={CATEGORIES} value={category} onChange={setCategory} tabs />
      </div>

      {isAdmin && <AddInductee category={category} onAdded={load} />}

      {loading ? (
        <Loading label="Loading the Hall of Fame" />
      ) : sorted.length === 0 ? (
        <Empty label={`No ${CATEGORIES.find((c) => c.value === category)?.label.toLowerCase()} yet`} />
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

// Admin-only: search a swimmer, pick a category, add them to the Hall of Fame.
function AddInductee({ category, onAdded }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [picked, setPicked] = useState(null)
  const [achievements, setAchievements] = useState('')
  const [year, setYear] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    if (!query.trim() || picked) { setResults([]); return }
    const t = setTimeout(() => {
      searchSwimmers(query.trim())
        .then((res) => setResults(Array.isArray(res.data) ? res.data : []))
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [query, picked])

  const submit = async (e) => {
    e.preventDefault()
    if (!picked || saving) return
    setSaving(true); setError('')
    try {
      await createInductee({
        swimmer: picked.id,
        name: picked.name,
        country: picked.nationality,
        category,
        achievements: achievements.trim(),
        ...(year ? { inducted_year: year } : {}),
      })
      setPicked(null); setQuery(''); setAchievements(''); setYear('')
      onAdded()
    } catch {
      setError('Failed to add — is the swimmer already inducted?')
    } finally {
      setSaving(false)
    }
  }

  const catLabel = CATEGORIES.find((c) => c.value === category)?.label

  return (
    <div className="rule-b" style={{ padding: '12px 32px' }}>
      <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div ref={boxRef} style={{ position: 'relative', flex: '1 1 260px', minWidth: 0 }}>
          <input
            className="input"
            style={{ width: '100%' }}
            placeholder={`Search a swimmer to add to ${catLabel}…`}
            value={picked ? picked.name : query}
            onChange={(e) => { setPicked(null); setQuery(e.target.value) }}
          />
          {results.length > 0 && !picked && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
              background: 'var(--color-surface, #fff)', border: '1px solid var(--color-neutral-200)',
              borderRadius: 6, maxHeight: 260, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            }}>
              {results.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { setPicked(s); setResults([]) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 14 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-neutral-100, #f4f4f4)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <Flag code={s.nationality_detail?.code} name={s.nationality_detail?.name} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <input className="input" type="number" style={{ flex: '0 1 110px', minWidth: 0 }}
          placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)} />
        <input className="input" style={{ flex: '2 1 240px', minWidth: 0 }}
          placeholder="Achievements (optional)" value={achievements}
          onChange={(e) => setAchievements(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={!picked || saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {saving ? 'Adding…' : `Add to ${catLabel}`}
        </button>
      </form>
      {error && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-danger, #c0392b)' }}>{error}</div>}
    </div>
  )
}
