import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { GitMerge, Trash2, X } from 'lucide-react'
import { getSwimmers, deleteSwimmer, searchSwimmers } from '../api/swimmers'
import { getCountries } from '../api/core'
import { mergeSwimmers } from '../api/importer'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Pager, Seg, Modal } from '../components/ui'
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

function Avatar({ photo, name, size = 34 }) {
  // portrait 4:5 box — the natural shape of a headshot, so faces are not
  // cropped into a tight square
  const h = Math.round(size * 1.25)
  if (photo) {
    return (
      <div className="grayscale" style={{ width: size, height: h, flex: 'none', overflow: 'hidden', border: '1px solid var(--color-divider)' }}>
        <img src={mediaUrl(photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
      </div>
    )
  }
  return (
    <div style={{ width: size, height: h, flex: 'none', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 11 }}>
      {initials(name)}
    </div>
  )
}

// Flat Modernist modal — fixed overlay, white panel, 2px border, no radius
// Modal imported from ui.jsx

// Merge wizard: pick primary (keep), then one or MORE duplicates, confirm
function MergeSwimmersModal({ onClose, onMerged, countries = [] }) {
  const [step, setStep] = useState(1)
  const [countryFilter, setCountryFilter] = useState('')
  const [primary, setPrimary] = useState(null)
  const [duplicates, setDuplicates] = useState([])
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
      searchSwimmers(query.trim(), countryFilter ? { nationality: countryFilter } : {})
        .then((res) => setResults(Array.isArray(res.data) ? res.data : res.data?.results || []))
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, countryFilter])

  const pick = (s) => {
    if (step === 1) {
      setPrimary(s)
      setStep(2)
    } else {
      if (primary && s.id === primary.id) return
      if (duplicates.some((d) => d.id === s.id)) return
      setDuplicates([...duplicates, s])
    }
    setQuery('')
    setResults([])
  }

  const doMerge = async () => {
    if (!primary || duplicates.length === 0) return
    setMerging(true)
    setError('')
    try {
      await mergeSwimmers(primary.id, duplicates.map((d) => d.id))
      onMerged()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Merge failed')
      setConfirming(false)
    } finally {
      setMerging(false)
    }
  }

  const card = (swimmer, extra) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Avatar photo={swimmer.photo} name={swimmer.name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{swimmer.name}</div>
        <div className="text-muted" style={{ fontSize: 12 }}>
          {swimmer.nationality_detail?.name}{swimmer.club ? ` · ${swimmer.club}` : ''}{swimmer.age ? ` · Age ${swimmer.age}` : ''}
        </div>
      </div>
      {extra}
    </div>
  )

  const dupNames = duplicates.map((d) => `“${d.name}”`).join(', ')

  return (
    <Modal title="Merge Swimmers" onClose={onClose}>
      <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
        Select the swimmer to <strong>keep</strong> (primary), then add one or more <strong>duplicates</strong> to
        merge into them. All results, records and medals from the duplicates will be transferred, and the
        duplicates deleted.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ border: '1px solid var(--color-divider)', padding: 12, flex: 1, minWidth: 220 }}>
          <div className="micro" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            {step === 1 ? 'Step 1 — Keep (primary)' : 'Keeping'}
          </div>
          {primary ? card(primary, (
            <button className="btn btn-secondary" style={{ fontSize: 11 }}
              onClick={() => { setPrimary(null); setDuplicates([]); setStep(1) }}>Change</button>
          )) : (
            <div className="text-muted" style={{ fontSize: 13, fontStyle: 'italic' }}>Search and select below…</div>
          )}
        </div>
        <div style={{ border: '1px solid var(--color-divider)', padding: 12, flex: 1, minWidth: 220 }}>
          <div className="micro" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Duplicates (will be deleted){duplicates.length > 0 ? ` — ${duplicates.length}` : ''}
          </div>
          {duplicates.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 13, fontStyle: 'italic' }}>
              {step === 1 ? 'Select primary first' : 'Search and add below…'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {duplicates.map((d) => (
                <div key={d.id}>
                  {card(d, (
                    <button className="btn btn-secondary" style={{ fontSize: 11 }}
                      onClick={() => setDuplicates(duplicates.filter((x) => x.id !== d.id))}>Remove</button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="input"
          autoFocus
          style={{ flex: 1, minWidth: 200 }}
          placeholder={step === 1 ? 'Search for the swimmer to KEEP…' : 'Search to add another DUPLICATE…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="select" style={{ width: 170 }} value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
          <option value="">All countries</option>
          {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {results.length > 0 && (
          <div style={{ marginTop: 8, flexBasis: '100%', border: '1px solid var(--color-divider)', maxHeight: 220, overflowY: 'auto' }}>
            {results
              .filter((s) => s.id !== primary?.id && !duplicates.some((d) => d.id === s.id))
              .map((s) => (
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

      {error && (
        <div style={{ marginTop: 12, border: '1px solid var(--asw-slow, #b3261e)', color: 'var(--asw-slow, #b3261e)', padding: '8px 12px', fontSize: 13 }}>{error}</div>
      )}

      {confirming ? (
        <div style={{ marginTop: 16, border: '2px solid var(--color-text)', padding: 14 }}>
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            Merge {dupNames} into “{primary?.name}”? All results, records and medals will be transferred,
            and {duplicates.length > 1 ? 'these profiles' : dupNames} will be deleted. This cannot be undone.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={merging}>Back</button>
            <button className="btn btn-primary" onClick={doMerge} disabled={merging}>
              {merging ? 'Merging…' : `Confirm merge (${duplicates.length})`}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {primary && duplicates.length > 0 && (
            <span className="text-muted" style={{ fontSize: 12, marginRight: 'auto' }}>
              This will delete {duplicates.length} profile{duplicates.length > 1 ? 's' : ''} and transfer all their data.
            </span>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!primary || duplicates.length === 0} onClick={() => setConfirming(true)}>
            Merge{duplicates.length > 1 ? ` ${duplicates.length}` : ''}
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
      <PageHead title="Swimmers" />

      {/* filter bar: everything on one line */}
      <div className="rule-b records-filters" style={{ padding: '14px 32px', display: 'flex', gap: 12, flexWrap: 'nowrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ flex: '2 1 160px', width: 'auto', minWidth: 0, maxWidth: 320 }}
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select"
          style={{ flex: '1 1 130px', width: 'auto', minWidth: 0, maxWidth: 220 }}
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
          <div className="swimmer-grid">
            {visible.map((s) => (
              <Link key={s.id} to={`/swimmers/${s.id}`} className="swimmer-card">
                <div className="swimmer-card-photo">
                  {s.photo ? (
                    <img className="grayscale" src={mediaUrl(s.photo)} alt={s.name} loading="lazy" />
                  ) : (
                    <span className="swimmer-card-initials">{initials(s.name)}</span>
                  )}
                  {s.is_retired && (
                    <span className="tag tag-neutral" style={{ position: 'absolute', left: 8, bottom: 8, background: 'var(--color-surface)' }}>Retired</span>
                  )}
                  {isAdmin && (
                    <button
                      className="btn btn-secondary btn-icon"
                      title="Delete swimmer"
                      aria-label="Delete swimmer"
                      style={{ position: 'absolute', top: 6, right: 6, background: 'var(--color-surface)' }}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(s) }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div className="swimmer-card-body">
                  <div className="swimmer-card-name">{(() => {
                    const words = (s.name || '').split(' ')
                    if (words.length < 2) return s.name
                    return <>{words[0]}<br />{words.slice(1).join(' ')}</>
                  })()}</div>
                  <div className="swimmer-card-meta">
                    <Flag code={s.nationality_detail?.code} name={s.nationality_detail?.name} />
                    <span>{s.nationality_detail?.name || '—'}</span>
                    {(s.birth_year || s.sex) && (
                      <span className="tag tag-accent-2" style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                        {s.birth_year || ''}{s.birth_year && s.sex ? ' · ' : ''}{s.sex === 'M' ? '♂' : s.sex === 'F' ? '♀' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
        </div>
      )}

      {isAdmin && showMerge && (
        <MergeSwimmersModal countries={countries} onClose={() => setShowMerge(false)} onMerged={() => setReloadKey((k) => k + 1)} />
      )}
    </div>
  )
}
