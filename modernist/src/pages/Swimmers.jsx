import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { GitMerge, Trash2, X } from 'lucide-react'
import { getSwimmers, deleteSwimmer, searchSwimmers } from '../api/swimmers'
import { getCountries } from '../api/core'
import { mergeSwimmers } from '../api/importer'
import Flag from '../components/Flag'
import { PageHead, notify, Empty, Pager, Seg, Modal, FilterBar, Skeleton, Stepper } from '../components/ui'
import { mediaUrl, nameInitials } from '../utils'
import { useAuth } from '../context/AuthContext'
import Pic from '../components/Pic'

const PAGE_SIZE = 50

const initials = (name) => nameInitials(name)

function Avatar({ photo, name, size = 34 }) {
  // portrait 4:5 box — the natural shape of a headshot, so faces are not
  // cropped into a tight square
  const h = Math.round(size * 1.25)
  if (photo) {
    return (
      <div className="grayscale" style={{ width: size, height: h, flex: 'none', overflow: 'hidden', border: '1px solid var(--color-divider)' }}>
        <Pic kind="person" w={160} src={photo} />
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
  const [searched, setSearched] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (query.trim().length < 2) { setResults([]); setSearched(false); return }
    debounceRef.current = setTimeout(() => {
      searchSwimmers(query.trim(), countryFilter ? { nationality: countryFilter } : {})
        .then((res) => setResults(Array.isArray(res.data) ? res.data : res.data?.results || []))
        .catch(() => setResults([]))
        .finally(() => setSearched(true))
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
      {/* Goal-Gradient: three visible steps to the end of the merge */}
      <Stepper steps={['Swimmer to keep', 'Duplicates', 'Confirm']} current={confirming ? 2 : primary ? 1 : 0} />
      <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
        Select the swimmer to <strong>keep</strong> (primary), then add one or more <strong>duplicates</strong> to
        merge into them. All results, records and medals from the duplicates will be transferred, and the
        duplicates deleted.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ border: '1px solid var(--color-divider)', padding: 12, flex: 1, minWidth: 220 }}>
          <div className="micro" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            {step === 1 ? 'Keep (primary)' : 'Keeping'}
          </div>
          {primary ? card(primary, (
            <button type="button" className="btn btn-secondary" style={{ fontSize: 11 }}
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
                    <button type="button" className="btn btn-secondary" style={{ fontSize: 11 }} aria-label={`Remove ${d.name}`}
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
          aria-label={step === 1 ? 'Search for the swimmer to keep' : 'Search for a duplicate swimmer to merge'}
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="select" aria-label="Filter search by country" style={{ width: 170 }} value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
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
                  type="button"
                  onClick={() => pick(s)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--color-divider)', cursor: 'pointer', font: 'inherit' }}
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
        {/* Paradox of the Active User: a search with no matches says so */}
        {searched && query.trim().length >= 2 && results.length === 0 && (
          <div className="text-muted" role="status" style={{ flexBasis: '100%', fontSize: 13 }}>
            No swimmers match “{query.trim()}”. Check the spelling or change the country.
          </div>
        )}
      </div>

      {error && (
        <div role="alert" style={{ marginTop: 12, border: '1px solid var(--asw-slow, var(--asw-slow))', color: 'var(--asw-slow, var(--asw-slow))', padding: '8px 12px', fontSize: 13 }}>{error}</div>
      )}

      {confirming ? (
        <div style={{ marginTop: 16, border: '2px solid var(--color-text)', padding: 16 }}>
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            Merge {dupNames} into “{primary?.name}”? All results, records and medals will be transferred,
            and {duplicates.length > 1 ? 'these profiles' : dupNames} will be deleted. This cannot be undone.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={merging}>Back</button>
            <button type="button" className="btn btn-primary" onClick={doMerge} disabled={merging}>
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

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function Swimmers() {
  // Working Memory + Flow: search, filters, letter and page live in the URL, so
  // Back from a profile returns to the same place in the list.
  const [searchParams, setSearchParams] = useSearchParams()
  const query = (searchParams.get('search') || '').trim()
  const country = searchParams.get('country') || ''
  const sex = searchParams.get('sex') || ''
  const letter = searchParams.get('letter') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const [search, setSearch] = useState(query)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(null)
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [showMerge, setShowMerge] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const debounceRef = useRef(null)
  const topRef = useRef(null)
  const { isAdmin } = useAuth()

  // change one or more URL params; any filter change goes back to page 1
  const setParams = (changes, { keepPage = false } = {}) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!keepPage) next.delete('page')
      Object.entries(changes).forEach(([k, v]) => {
        if (v === '' || v == null || (k === 'page' && Number(v) <= 1)) next.delete(k)
        else next.set(k, String(v))
      })
      return next
    }, { replace: true })
  }

  // header search box (or Back/Forward) changes ?search= from outside
  useEffect(() => {
    setSearch((cur) => (cur.trim() === query ? cur : query))
  }, [query])

  // countries once — Arab/GCC regions first
  useEffect(() => {
    let alive = true
    getCountries({ has_swimmers: true })
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
  const onSearch = (value) => {
    setSearch(value)
    clearTimeout(debounceRef.current)
    // Postel's Law: stray spaces never change the search
    debounceRef.current = setTimeout(() => setParams({ search: value.trim().replace(/\s+/g, ' ') }), 350)
  }
  useEffect(() => () => clearTimeout(debounceRef.current), [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setFailed(false)
    const params = { page, page_size: PAGE_SIZE }
    if (query) params.search = query
    if (country) params.nationality = country
    if (sex) params.sex = sex
    if (letter) params.letter = letter
    getSwimmers(params)
      .then((res) => {
        if (!alive) return
        setRows(res.data?.results || [])
        setCount(res.data?.count || 0)
      })
      .catch((err) => {
        if (!alive) return
        // a stale ?page= past the last page (filters changed, bookmark) goes back to page 1
        if (err?.response?.status === 404 && page > 1) { setParams({ page: 1 }, { keepPage: true }); return }
        setRows([]); setCount(null); setFailed(true)
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [query, country, sex, letter, page, reloadKey])

  const handleDelete = async (s) => {
    if (!window.confirm(`Delete "${s.name}"? This cannot be undone.`)) return
    try {
      await deleteSwimmer(s.id)
      setRows((prev) => prev.filter((r) => r.id !== s.id))
      setCount((c) => Math.max(0, (c || 0) - 1))
      notify(`Deleted ${s.name}`)
    } catch {
      notify('Failed to delete swimmer')
    }
  }

  const clearAll = () => {
    clearTimeout(debounceRef.current)
    setSearch('')
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  // Jakob's Law: a new page starts at the top of the list, not at the pager
  const goPage = (p) => {
    setParams({ page: p }, { keepPage: true })
    topRef.current?.scrollIntoView({ block: 'start' })
  }

  const visible = useMemo(() => rows.filter((s) => !s.is_relay_team), [rows])
  const arab = countries.filter((c) => c.region === 'ARAB' || c.region === 'GCC')
  const others = countries.filter((c) => c.region !== 'ARAB' && c.region !== 'GCC')
  const active = !!(query || country || sex || letter)
  const from = (page - 1) * PAGE_SIZE + 1

  return (
    <div ref={topRef}>
      <PageHead title="Swimmers" />

      {/* Common Region: every way to narrow the list sits in one bar with the count */}
      <FilterBar count={failed ? null : count} noun={count === 1 ? 'swimmer' : 'swimmers'} active={active} onClear={clearAll}>
        <input
          className="input"
          type="search"
          style={{ flex: '2 1 200px', width: 'auto', minWidth: 0, maxWidth: 320 }}
          placeholder="Search by name…"
          aria-label="Search swimmers by name"
          autoComplete="off"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <select
          className="select"
          aria-label="Filter by country"
          style={{ flex: '1 1 130px', width: 'auto', minWidth: 0, maxWidth: 220 }}
          value={country}
          onChange={(e) => setParams({ country: e.target.value })}
        >
          <option value="">All countries</option>
          {others.length > 0 ? (
            <>
              <optgroup label="Arab countries">
                {arab.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
              <optgroup label="Other countries">
                {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            </>
          ) : arab.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Seg
          options={[{ value: '', label: 'All' }, { value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }]}
          value={sex}
          onChange={(v) => setParams({ sex: v })}
        />
        {isAdmin && (
          <button type="button" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowMerge(true)}>
            <GitMerge size={14} /> Merge duplicates
          </button>
        )}
      </FilterBar>

      {/* Chunking: thousands of names are reachable by first letter instead of 150 pages */}
      <nav className="swimmers-az" aria-label="Jump to first letter of the name">
        <button type="button" className={!letter ? 'on' : ''} aria-pressed={!letter} onClick={() => setParams({ letter: '' })}>All</button>
        {LETTERS.map((l) => (
          <button key={l} type="button" className={letter === l ? 'on' : ''} aria-pressed={letter === l} aria-label={`Names starting with ${l}`} onClick={() => setParams({ letter: letter === l ? '' : l })}>{l}</button>
        ))}
      </nav>

      {loading && visible.length === 0 ? (
        <div className="pad"><Skeleton rows={8} height={56} /></div>
      ) : visible.length === 0 ? (
        failed ? (
          <Empty label="Swimmers could not be loaded" hint="Check your connection and try again.">
            <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
          </Empty>
        ) : (
          <Empty
            label="No swimmers found"
            hint={query
              ? `Nothing matches “${query}”${country || sex || letter ? ' with these filters' : ''}. Check the spelling or try part of the name.`
              : active ? 'No swimmer fits this combination of filters.' : undefined}
          >
            {active && <button type="button" className="btn btn-secondary" onClick={clearAll}>Clear filters</button>}
          </Empty>
        )
      ) : (
        <div className="pad" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s ease' }} aria-busy={loading}>
          {count > PAGE_SIZE && (
            <div className="swimmers-range asw-num">
              Showing {from.toLocaleString('en-US')}–{(from + rows.length - 1).toLocaleString('en-US')} of {count.toLocaleString('en-US')}, A to Z
            </div>
          )}
          <div className="swimmers-list">
            {visible.map((s) => {
              const words = (s.name || '').trim().split(/\s+/)
              const sexWord = s.sex === 'M' ? 'Men' : s.sex === 'F' ? 'Women' : ''
              return (
                <div key={s.id} className="swimmers-item">
                  <Link to={`/swimmers/${s.id}`} state={{ list: searchParams.toString() }} className="swimmers-item-link">
                    <span className="swimmers-item-photo">
                      {s.photo ? (
                        <Pic kind="person" w={64} className="grayscale" src={s.photo} />
                      ) : (
                        <span aria-hidden="true">{initials(s.name)}</span>
                      )}
                    </span>
                    <span className="swimmers-item-body">
                      <span className="swimmers-item-name">
                        {words.length < 2 ? s.name : <>{words[0]} <strong>{words.slice(1).join(' ')}</strong></>}
                        {s.is_retired && <span className="tag tag-neutral" style={{ marginLeft: 6 }}>Retired</span>}
                      </span>
                      <span className="swimmers-item-meta">
                        <Flag code={s.nationality_detail?.code} name={s.nationality_detail?.name} />
                        <span className="swimmers-item-country">{s.nationality_detail?.name || 'Country not set'}</span>
                        {s.club && <span className="swimmers-item-club">· {s.club}</span>}
                      </span>
                    </span>
                    {(s.birth_year || sexWord) && (
                      <span className="swimmers-item-side asw-num">
                        {s.birth_year && <span title="Year of birth">{s.birth_year}</span>}
                        {sexWord && <span className="micro">{sexWord}</span>}
                      </span>
                    )}
                  </Link>
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon swimmers-item-del"
                      title="Delete swimmer"
                      aria-label={`Delete ${s.name}`}
                      onClick={() => handleDelete(s)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={goPage} />
        </div>
      )}

      {isAdmin && showMerge && (
        <MergeSwimmersModal countries={countries} onClose={() => setShowMerge(false)} onMerged={() => setReloadKey((k) => k + 1)} />
      )}
    </div>
  )
}
