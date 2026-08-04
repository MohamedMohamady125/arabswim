import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { GitMerge, Trash2, X } from 'lucide-react'
import { getSwimmers, deleteSwimmer, searchSwimmers } from '../api/swimmers'
import { getCountries } from '../api/core'
import { mergeSwimmers } from '../api/importer'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Pager, Seg } from '../components/ui'
import { mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'

const PAGE_SIZE = 50

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function Avatar({ photo, name, size = 32 }) {
  if (photo) {
    return (
      <div className="grayscale" style={{ width: size, height: size, flex: 'none', overflow: 'hidden', border: '1px solid var(--color-divider)' }}>
        <img src={mediaUrl(photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  return (
    <div style={{ width: size, height: size, flex: 'none', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 11 }}>
      {initials(name)}
    </div>
  )
}

// Flat Modernist modal — fixed overlay, white panel, 2px border, no radius
function Modal({ title, onClose, children, width = 640 }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,31,0.55)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--color-bg, #fff)', border: '2px solid var(--color-text)', width: '100%', maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rule-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
          <div className="kicker">{title}</div>
          <button className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

// Two-step merge wizard: pick primary (keep), pick duplicate, confirm
function MergeSwimmersModal({ onClose, onMerged }) {
  const [step, setStep] = useState(1)
  const [primary, setPrimary] = useState(null)
  const [duplicate, setDuplicate] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [confirming, setConfirming] = useState(false)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (query.trim().length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(() => {
      searchSwimmers(query.trim())
        .then((res) => setResults(Array.isArray(res.data) ? res.data : res.data?.results || []))
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const pick = (s) => {
    if (step === 1) {
      setPrimary(s)
      setStep(2)
    } else {
      if (primary && s.id === primary.id) return
      setDuplicate(s)
    }
    setQuery('')
    setResults([])
  }

  const doMerge = async () => {
    if (!primary || !duplicate) return
    setMerging(true)
    setError('')
    try {
      await mergeSwimmers(primary.id, duplicate.id)
      onMerged()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Merge failed')
      setConfirming(false)
    } finally {
      setMerging(false)
    }
  }

  const slot = (label, swimmer, onClear) => (
    <div style={{ border: '1px solid var(--color-divider)', padding: 12, flex: 1, minWidth: 220 }}>
      <div className="micro" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      {swimmer ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar photo={swimmer.photo} name={swimmer.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{swimmer.name}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              {swimmer.nationality_detail?.name}{swimmer.club ? ` · ${swimmer.club}` : ''}{swimmer.age ? ` · Age ${swimmer.age}` : ''}
            </div>
          </div>
          <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={onClear}>Change</button>
        </div>
      ) : (
        <div className="text-muted" style={{ fontSize: 13, fontStyle: 'italic' }}>
          {label.startsWith('Duplicate') && step === 1 ? 'Select primary first' : 'Search and select below…'}
        </div>
      )}
    </div>
  )

  return (
    <Modal title="Merge swimmers" onClose={onClose}>
      <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
        Select the swimmer to <strong>keep</strong> (primary), then the <strong>duplicate</strong> to merge into
        them. All results, records and medals from the duplicate will be transferred, and the duplicate deleted.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {slot(step === 1 ? 'Step 1 — Keep (primary)' : 'Keeping', primary, () => { setPrimary(null); setDuplicate(null); setStep(1) })}
        {slot(step === 2 && !duplicate ? 'Step 2 — Duplicate (deleted)' : 'Duplicate (will be deleted)', duplicate, () => setDuplicate(null))}
      </div>

      {(step === 1 || !duplicate) && (
        <div style={{ marginTop: 14 }}>
          <input
            className="input"
            autoFocus
            placeholder={step === 1 ? 'Search for the swimmer to KEEP…' : 'Search for the DUPLICATE swimmer…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <div style={{ marginTop: 8, border: '1px solid var(--color-divider)', maxHeight: 220, overflowY: 'auto' }}>
              {results.filter((s) => step === 1 || s.id !== primary?.id).map((s) => (
                <button
                  key={s.id}
                  onClick={() => pick(s)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--color-divider)', cursor: 'pointer', font: 'inherit' }}
                >
                  <Avatar photo={s.photo} name={s.name} size={28} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {s.nationality_detail?.name}{s.club ? ` · ${s.club}` : ''}{s.age ? ` · Age ${s.age}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, border: '1px solid var(--asw-slow, #b3261e)', color: 'var(--asw-slow, #b3261e)', padding: '8px 12px', fontSize: 13 }}>{error}</div>
      )}

      {confirming ? (
        <div style={{ marginTop: 16, border: '2px solid var(--color-text)', padding: 14 }}>
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            Merge “{duplicate?.name}” into “{primary?.name}”? All results, records and medals will be transferred,
            and “{duplicate?.name}” will be deleted. This cannot be undone.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={merging}>Back</button>
            <button className="btn btn-primary" onClick={doMerge} disabled={merging}>
              {merging ? 'Merging…' : 'Confirm merge'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {primary && duplicate && (
            <span className="text-muted" style={{ fontSize: 12, marginRight: 'auto' }}>
              This will delete “{duplicate.name}” and transfer all their data.
            </span>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!primary || !duplicate} onClick={() => setConfirming(true)}>
            Merge
          </button>
        </div>
      )}
    </Modal>
  )
}

export default function Swimmers() {
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [query, setQuery] = useState(searchParams.get('search') || '')
  const [country, setCountry] = useState('')
  const [sex, setSex] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showMerge, setShowMerge] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const debounceRef = useRef(null)
  const { isAdmin } = useAuth()

  // header search box navigates here with ?search=
  useEffect(() => {
    const s = searchParams.get('search') || ''
    setSearch(s)
    setQuery(s)
    setPage(1)
  }, [searchParams])

  // countries once — Arab/GCC regions first
  useEffect(() => {
    let alive = true
    getCountries()
      .then((res) => {
        if (!alive) return
        const list = Array.isArray(res.data) ? res.data : res.data?.results || []
        const arab = list.filter((c) => c.region === 'ARAB' || c.region === 'GCC')
        const rest = list.filter((c) => c.region !== 'ARAB' && c.region !== 'GCC')
        setCountries([...arab, ...rest])
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // debounce the search input
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setQuery(search)
      setPage(1)
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = { page, page_size: PAGE_SIZE }
    if (query) params.search = query
    if (country) params.nationality = country
    if (sex) params.sex = sex
    getSwimmers(params)
      .then((res) => {
        if (!alive) return
        setRows(res.data?.results || [])
        setCount(res.data?.count || 0)
      })
      .catch(() => { if (alive) { setRows([]); setCount(0) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [query, country, sex, page, reloadKey])

  const handleDelete = async (s) => {
    if (!window.confirm(`Delete "${s.name}"? This cannot be undone.`)) return
    try {
      await deleteSwimmer(s.id)
      setRows((prev) => prev.filter((r) => r.id !== s.id))
      setCount((c) => Math.max(0, c - 1))
    } catch {
      window.alert('Failed to delete swimmer')
    }
  }

  const visible = useMemo(() => rows.filter((s) => !s.is_relay_team), [rows])
  const arabCount = countries.filter((c) => c.region === 'ARAB' || c.region === 'GCC').length

  return (
    <div>
      <PageHead kicker="People" title="Swimmers" sub="Every swimmer in the ArabSwiM database." />

      {/* filter bar */}
      <div className="rule-b" style={{ padding: '16px 32px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select"
          style={{ maxWidth: 220 }}
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPage(1) }}
        >
          <option value="">All countries</option>
          {countries.map((c, i) => (
            <option key={c.id} value={c.id}>
              {i === arabCount && arabCount > 0 ? '— ' : ''}{c.name}
            </option>
          ))}
        </select>
        <Seg
          options={[{ value: '', label: 'All' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
          value={sex}
          onChange={(v) => { setSex(v); setPage(1) }}
        />
        {isAdmin && (
          <button className="btn btn-secondary" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowMerge(true)}>
            <GitMerge size={14} /> Merge
          </button>
        )}
      </div>

      {loading ? (
        <Loading label="Loading swimmers" />
      ) : visible.length === 0 ? (
        <Empty label="No swimmers found" />
      ) : (
        <div className="pad">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Swimmer</th>
                  <th className="num">Born</th>
                  <th className="num">Age</th>
                  <th className="hide-mobile">Club</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar photo={s.photo} name={s.name} />
                        <Flag code={s.nationality_detail?.code} name={s.nationality_detail?.name} />
                        <Link to={`/swimmers/${s.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                          {s.name}
                        </Link>
                        {s.is_retired && <span className="tag tag-neutral">Retired</span>}
                      </div>
                      {s.sex && (
                        <div className="show-mobile" style={{ margin: '5px 0 0 38px' }}>
                          <span style={{
                            display: 'inline-block', fontSize: 10, fontWeight: 700,
                            letterSpacing: '0.07em', textTransform: 'uppercase',
                            padding: '2px 8px', border: '1px solid #22a7c4',
                            color: '#0e7490', background: 'rgba(34, 167, 196, 0.08)',
                          }}>
                            {s.sex === 'M' ? 'Male' : 'Female'}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="num asw-num">{s.birth_year ?? '—'}</td>
                    <td className="num asw-num">{s.age ?? '—'}</td>
                    <td className="text-muted hide-mobile">{s.club || '—'}</td>
                    {isAdmin && (
                      <td className="num">
                        <button className="btn btn-secondary btn-icon" title="Delete swimmer" aria-label="Delete swimmer" onClick={() => handleDelete(s)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
        </div>
      )}

      {isAdmin && showMerge && (
        <MergeSwimmersModal onClose={() => setShowMerge(false)} onMerged={() => setReloadKey((k) => k + 1)} />
      )}
    </div>
  )
}
