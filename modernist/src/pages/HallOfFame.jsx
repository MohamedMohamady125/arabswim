import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, Plus } from 'lucide-react'
import { getInductees, createInductee, deleteInductee } from '../api/fame'
import { searchSwimmers } from '../api/swimmers'
import Flag from '../components/Flag'
import { PageHead, notify, Empty, Seg, FilterBar, Skeleton } from '../components/ui'
import { mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'

const GOLD = 'var(--asw-gold)'
// Postel's Law: search ignores case, accents and punctuation
const fold = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-_.'’]/g, ' ').replace(/\s+/g, ' ').trim()

const CATEGORIES = [
  { value: 'LEGEND', label: 'Legends' },
  { value: 'OLYMPIAN', label: 'Olympians' },
  { value: 'ARAB_WINNER', label: 'Arab Swim Winners' },
]

export default function HallOfFame() {
  const { isAdmin } = useAuth()
  const [inductees, setInductees] = useState([])
  const [picked, setPicked] = useState(null) // null until the visitor chooses a tab
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  // The whole hall loads once; search then filters in the browser, so results
  // follow every keystroke (Doherty Threshold) with no request per letter
  const load = () => {
    getInductees()
      .then((res) => {
        const d = res.data
        setInductees(Array.isArray(d) ? d : d?.results || [])
        setFailed(false)
      })
      .catch(() => { setInductees([]); setFailed(true) })
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const q = fold(search)
  const matches = useMemo(
    () => (q ? inductees.filter((p) => fold([p.name, p.country_detail?.name, p.achievements, p.era, p.inducted_year].join(' ')).includes(q)) : inductees),
    [inductees, q]
  )
  const countOf = (cat) => matches.filter((p) => (p.category || 'LEGEND') === cat).length
  // Tesler's Law: open on the first category that has someone in it, and
  // follow the search to wherever the match is, unless the visitor chose a tab
  const firstFilled = CATEGORIES.find((c) => countOf(c.value) > 0)?.value || 'LEGEND'
  const category = picked && (!q || countOf(picked) > 0) ? picked : firstFilled
  const setCategory = setPicked

  const sorted = useMemo(
    () => matches
      .filter((p) => (p.category || 'LEGEND') === category)
      .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999)),
    [matches, category]
  )

  const handleDelete = async (p) => {
    if (!window.confirm(`Remove "${p.name}" from the Hall of Fame?`)) return
    try {
      await deleteInductee(p.id)
      setInductees((prev) => prev.filter((x) => x.id !== p.id))
    } catch {
      notify('Failed to remove inductee')
    }
  }

  return (
    <div>
      <PageHead
        title="Hall of Fame"
        sub="The swimmers who defined Arab swimming."
      />

      {/* Common Region: category and search narrow the same list, so they
          share one bar. Each category shows how many it holds, so nobody
          opens an empty one to find out. */}
      <FilterBar count={loading ? null : sorted.length} noun={sorted.length === 1 ? 'inductee' : 'inductees'} active={!!q} onClear={() => setSearch('')}>
        <Seg options={CATEGORIES.map((c) => ({ value: c.value, label: loading ? c.label : `${c.label} (${countOf(c.value)})` }))} value={category} onChange={setCategory} tabs />
        {(inductees.length > 6 || q) && (
          <input
            className="input"
            type="search"
            aria-label="Search inductees"
            style={{ flex: '1 1 200px', width: 'auto', minWidth: 0, maxWidth: 280 }}
            placeholder="Search by name or country…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </FilterBar>

      {isAdmin && <AddInductee category={category} onAdded={load} />}

      {loading ? (
        <div className="pad"><Skeleton rows={3} height={90} /></div>
      ) : sorted.length === 0 ? (
        failed ? (
          <Empty label="Could not load the Hall of Fame" hint="Check your connection and reload the page." />
        ) : (
          <Empty
            label={q ? 'No inductee matches your search' : `No ${CATEGORIES.find((c) => c.value === category)?.label.toLowerCase()} yet`}
            hint={q ? 'Check the spelling or clear the search.' : 'Inductees are added by the Arab Swim team. The other categories show who is already in.'}
          >
            {q && <button type="button" className="btn btn-secondary" onClick={() => setSearch('')}>Clear search</button>}
          </Empty>
        )
      ) : (
        <div className="grid-2 pad" style={{ display: 'grid', gridTemplateColumns: sorted.length === 1 ? 'minmax(0, 640px)' : '1fr 1fr', gap: 32 }}>
          {sorted.map((p) => {
            const photo = p.photo || p.swimmer_detail?.photo
            return (
              <article key={p.id} className="hair-b" style={{ paddingBottom: 28, borderLeft: `2px solid ${GOLD}`, paddingLeft: 18 }}>
                {photo && (
                  <div className="grayscale" style={{ width: '100%', height: 320, overflow: 'hidden', marginBottom: 16 }}>
                    <img src={mediaUrl(photo)} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                  {p.inducted_year && <span className="tag tag-dark">Class of {p.inducted_year}</span>}
                  {p.era && <span className="micro">{p.era}</span>}
                </div>
                <h2 style={{ margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                  {p.swimmer ? <Link to={`/swimmers/${p.swimmer}`} style={{ color: 'inherit', textDecoration: 'none' }}>{p.name}</Link> : p.name}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, fontSize: 13, color: 'var(--color-neutral-700)' }}>
                  <Flag code={p.country_detail?.code} name={p.country_detail?.name} />
                  <span>{p.country_detail?.name}</span>
                </div>
                {p.achievements && (
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-neutral-800)', margin: 0 }}>
                    {p.achievements}
                  </p>
                )}
                {(p.swimmer || isAdmin) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--color-divider)' }}>
                  {p.swimmer && (
                    <Link to={`/swimmers/${p.swimmer}`} style={{ fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 40 }}>
                      Results, records and medals →
                    </Link>
                  )}
                  <span style={{ flex: 1 }} />
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => handleDelete(p)}
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>
                )}
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
  const [added, setAdded] = useState('')
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
    setSaving(true); setError(''); setAdded('')
    try {
      await createInductee({
        swimmer: picked.id,
        name: picked.name,
        country: picked.nationality,
        category,
        achievements: achievements.trim(),
        ...(year ? { inducted_year: year } : {}),
      })
      setAdded(`${picked.name} added to ${catLabel}`) // Peak-End Rule: confirm the save
      setPicked(null); setQuery(''); setAchievements(''); setYear('')
      onAdded()
    } catch {
      setError('Could not add this swimmer. They may already be in the Hall of Fame.')
    } finally {
      setSaving(false)
    }
  }

  const catLabel = CATEGORIES.find((c) => c.value === category)?.label

  return (
    <div className="rule-b" style={{ padding: '12px 32px' }}>
      <form onSubmit={submit} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div ref={boxRef} style={{ position: 'relative', flex: '1 1 260px', minWidth: 0 }}>
          <input
            className="input"
            type="search"
            aria-label={`Search a swimmer to add to ${catLabel}`}
            style={{ width: '100%' }}
            placeholder={`Search a swimmer to add to ${catLabel}…`}
            value={picked ? picked.name : query}
            onChange={(e) => { setPicked(null); setQuery(e.target.value) }}
          />
          {results.length > 0 && !picked && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
              background: 'var(--color-surface, #fff)', border: '1px solid var(--color-neutral-200)',
              borderRadius: 0, maxHeight: 260, overflowY: 'auto', border: '1px solid var(--color-divider)',
            }}>
              {results.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => { setPicked(s); setResults([]) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 14, width: '100%', minHeight: 36, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-neutral-100, var(--color-neutral-200))' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <Flag code={s.nationality_detail?.code} name={s.nationality_detail?.name} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input className="input" type="number" inputMode="numeric" aria-label="Year inducted" style={{ flex: '0 1 110px', minWidth: 0 }}
          placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)} />
        <input className="input" aria-label="Achievements (optional)" style={{ flex: '2 1 240px', minWidth: 0 }}
          placeholder="Achievements (optional)" value={achievements}
          onChange={(e) => setAchievements(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={!picked || saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {saving ? 'Adding…' : `Add to ${catLabel}`}
        </button>
      </form>
      {error && <div role="alert" style={{ marginTop: 6, fontSize: 13, color: 'var(--color-danger, var(--asw-slow))' }}>{error}</div>}
      {added && !error && <div role="status" style={{ marginTop: 6, fontSize: 13, color: 'var(--asw-fast)' }}>{added} ✓</div>}
    </div>
  )
}
