import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, Plus, Pencil } from 'lucide-react'
import { getInductees, createInductee, updateInductee, deleteInductee, getOpenPolls } from '../api/fame'
import { searchSwimmers } from '../api/swimmers'
import Flag from '../components/Flag'
import { PageHead, notify, Empty, Seg, FilterBar, Skeleton, Modal } from '../components/ui'
import { CropUpload } from '../components/ImageCropper'
import AwardVotes from '../components/admin/AwardVotes'
import { mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'
import Pic from '../components/Pic'

const GOLD = 'var(--asw-gold)'
// Postel's Law: search ignores case, accents and punctuation
const fold = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-_.'’]/g, ' ').replace(/\s+/g, ' ').trim()

const CATEGORIES = [
  { value: 'LEGEND', label: 'Legends' },
  { value: 'OLYMPIAN', label: 'Olympians' },
  { value: 'ARAB_WINNER', label: 'Arabswim Awards' },
]

export default function HallOfFame() {
  const { isAdmin } = useAuth()
  const [inductees, setInductees] = useState([])
  const [picked, setPicked] = useState(null) // null until the visitor chooses a tab
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [year, setYear] = useState('') // Arabswim Awards: one year at a time
  const [openPolls, setOpenPolls] = useState([])
  const [editing, setEditing] = useState(null)

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
  useEffect(() => { getOpenPolls().then((r) => setOpenPolls(Array.isArray(r.data) ? r.data : [])).catch(() => {}) }, [])

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

  const isAwards = category === 'ARAB_WINNER'
  const inCategory = useMemo(() => matches.filter((p) => (p.category || 'LEGEND') === category), [matches, category])
  // the years that have an award, newest first
  const years = useMemo(
    () => [...new Set(inCategory.map((p) => p.inducted_year).filter(Boolean))].sort((a, b) => b - a),
    [inCategory]
  )
  const activeYear = isAwards && years.includes(Number(year)) ? Number(year) : null
  const sorted = useMemo(
    () => inCategory
      .filter((p) => !activeYear || p.inducted_year === activeYear)
      // awards read newest year first; the other halls keep their set order
      .sort((a, b) => (isAwards ? (b.inducted_year || 0) - (a.inducted_year || 0) : 0)
        || (a.display_order ?? 999) - (b.display_order ?? 999) || String(a.name).localeCompare(String(b.name))),
    [inCategory, activeYear, isAwards]
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
        {isAwards && years.length > 1 && (
          <select className="select" aria-label="Year" value={activeYear || ''} onChange={(e) => setYear(e.target.value)} style={{ flex: '0 0 auto', width: 'auto' }}>
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
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

      {/* Von Restorff: an open vote is the one thing that asks for action here */}
      {isAwards && openPolls.map((p) => (
        <div key={p.slug} className="award-open">
          <span><strong>Voting is open:</strong> {p.title} {p.year}</span>
          <Link to={`/vote/${p.slug}`} className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 40 }}>Vote now →</Link>
        </div>
      ))}

      {isAdmin && <AddInductee category={category} onAdded={load} />}
      {isAdmin && isAwards && <AwardVotes onAnnounced={load} />}

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
              <article key={p.id} className="hair-b" style={{ paddingBottom: 28, borderLeft: `2px solid ${GOLD}`, paddingLeft: 18, display: 'flex', alignItems: 'flex-start', gap: 18 }}>
                {/* the portrait's own 4:5 shape, shown whole beside the text — never stretched into a wide banner */}
                {photo && (
                  <div style={{ width: 'clamp(96px, 28vw, 168px)', aspectRatio: '4 / 5', flex: 'none', overflow: 'hidden', background: 'var(--asw-portrait-bg)' }}>
                    <Pic kind="person" w={320} src={photo} alt={p.name} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
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
                    <button type="button" className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => setEditing(p)}>
                      <Pencil size={13} /> Edit
                    </button>
                  )}
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
                </div>
              </article>
            )
          })}
        </div>
      )}
      {editing && <EditInductee inductee={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

// Admin-only: change the year, the text and the photo of someone already in the hall.
function EditInductee({ inductee, onClose, onSaved }) {
  const [year, setYear] = useState(inductee.inducted_year || '')
  const [era, setEra] = useState(inductee.era || '')
  const [achievements, setAchievements] = useState(inductee.achievements || '')
  const [photo, setPhoto] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const save = async (e) => {
    e.preventDefault()
    if (saving) return
    setSaving(true); setError('')
    try {
      const fd = new FormData()
      fd.append('inducted_year', year || '')
      fd.append('era', era.trim())
      fd.append('achievements', achievements.trim())
      if (photo) fd.append('photo', photo)
      await updateInductee(inductee.id, fd)
      onSaved()
    } catch {
      setError('Could not save. Check the year and try again.')
    } finally { setSaving(false) }
  }
  const lbl = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--color-neutral-700)' }
  return (
    <Modal title={`Edit ${inductee.name}`} onClose={onClose} width={480}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={lbl}><span>Year</span>
            <input className="input" type="number" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></label>
          <label style={lbl}><span>Era (optional)</span>
            <input className="input" placeholder="e.g. 1990s" value={era} onChange={(e) => setEra(e.target.value)} /></label>
        </div>
        <label style={lbl}><span>Award or achievements</span>
          <textarea className="input" rows={3} style={{ height: 'auto', padding: '8px 12px' }} value={achievements} onChange={(e) => setAchievements(e.target.value)} /></label>
        <div style={lbl}><span>Photo</span>
          <CropUpload kind="person" current={inductee.photo || inductee.swimmer_detail?.photo} onChange={setPhoto} /></div>
        {error && <div role="alert" style={{ fontSize: 13, color: 'var(--asw-slow)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

// Admin-only: search a swimmer, pick a category, add them to the Hall of Fame.
function AddInductee({ category, onAdded }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [picked, setPicked] = useState(null)
  const [achievements, setAchievements] = useState('')
  const [year, setYear] = useState('')
  const [photo, setPhoto] = useState(null)
  const [photoKey, setPhotoKey] = useState(0)
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
        ...(photo ? { photo } : {}),
      })
      setAdded(`${picked.name} added to ${catLabel}`) // Peak-End Rule: confirm the save
      setPicked(null); setQuery(''); setAchievements(''); setYear(''); setPhoto(null); setPhotoKey((k) => k + 1)
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
          placeholder={category === 'ARAB_WINNER' ? 'Award name, e.g. Male Swimmer of the Year' : 'Achievements (optional)'} value={achievements}
          onChange={(e) => setAchievements(e.target.value)} />
        {/* the swimmer's profile photo is used unless another one is chosen here */}
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <CropUpload key={photoKey} kind="person" ariaLabel="Photo (optional)" onChange={setPhoto} />
        </div>
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
