import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GitMerge, Sparkles, Trash2, X, ArrowLeftRight } from 'lucide-react'
import { getTeams, deleteTeam, bulkDeleteTeams, mergeTeams, findDuplicateTeams, autoDedupeTeams } from '../api/teams'
import { PageHead, Loading, notify, Empty, Pager, Modal, FilterBar, Seg } from '../components/ui'
import { mediaUrl, nameInitials } from '../utils'
import { useAuth } from '../context/AuthContext'
import Pic from '../components/Pic'
import Flag from '../components/Flag'

const PAGE_SIZE = 24 // fills whole rows at 2, 3 and 4 columns

// Postel's Law: search ignores case, accents, hyphens and the "Al-" article,
// so "al ahli", "Al-Ahli" and "ahli" all find the same club
const fold = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-_.'’]/g, ' ').replace(/\s+/g, ' ').trim()
const foldName = (v) => fold(v).replace(/\bal /g, '')
const letterOf = (name) => {
  const c = foldName(name).replace(/\s/g, '')[0] || '#'
  return /[a-z]/.test(c) ? c.toUpperCase() : '#'
}

function acronym(name) {
  if (/[\u0600-\u06FF]/.test(String(name || ''))) return nameInitials(name)
  // drop the "Al-" article and treat hyphens as spaces, otherwise every
  // Saudi club badge reads "AL-" ("Al-Hilal" → HIL, "Al-Ahli Club" → AC)
  const cleaned = String(name || '').replace(/^al-?\s*/i, '').replace(/-/g, ' ')
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 0) return String(name || '').slice(0, 3).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
}

function TeamLogo({ logo, name, size = 42 }) {
  if (logo) {
    return (
      <div style={{ width: size, height: size, flex: 'none', overflow: 'hidden', border: '1px solid var(--color-divider)', background: '#fff', padding: 4 }}>
        <Pic kind="logo" w={96} src={logo} />
      </div>
    )
  }
  return (
    <div className="ap-initials" style={{ width: size, height: size, flex: 'none', fontSize: 12 }}>
      {acronym(name)}
    </div>
  )
}

// Flat Modernist modal — fixed overlay, white panel, 2px border, no radius
// Modal imported from ui.jsx

function ConfirmBox({ message, confirmLabel = 'Confirm', busy, onConfirm, onCancel }) {
  return (
    <div style={{ marginTop: 16, border: '2px solid var(--color-text)', padding: 16 }}>
      <div style={{ fontSize: 13, marginBottom: 12 }}>{message}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Back</button>
        <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </div>
  )
}

/* ── Auto-clean duplicates modal: dry-run preview → apply ── */
function AutoCleanModal({ onClose, onCleaned }) {
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    autoDedupeTeams({ dry_run: true })
      .then((res) => setPlan(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to scan for duplicates'))
      .finally(() => setLoading(false))
  }, [])

  const handleApply = async () => {
    setApplying(true)
    setError('')
    try {
      const res = await autoDedupeTeams({ dry_run: false })
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Auto-clean failed')
    } finally {
      setApplying(false)
      setConfirming(false)
    }
  }

  return (
    <Modal title="Auto-Clean Duplicate Teams" onClose={onClose}>
      <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
        Finds name variants (case, dashes, squad letters, national teams) and merges them.
      </p>

      {loading ? (
        <Loading label="Scanning all teams for duplicates" />
      ) : result ? (
        <div>
          <div style={{ border: '1px solid var(--color-divider)', padding: 16, textAlign: 'center' }}>
            <div className="kicker" style={{ marginBottom: 12 }}>Cleanup complete</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap' }}>
              <div><div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>{result.teams_merged}</div><div className="micro">Teams merged</div></div>
              <div><div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>{result.results_updated}</div><div className="micro">Results moved</div></div>
              <div><div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>{result.swimmers_updated}</div><div className="micro">Swimmers updated</div></div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => { onCleaned(); onClose() }}>Done</button>
          </div>
        </div>
      ) : (
        <div>
          {plan?.groups?.length ? (
            <>
              <div className="micro" style={{ marginBottom: 8 }}>{plan.groups.length} duplicate group(s) found — review before applying:</div>
              <div style={{ maxHeight: '45vh', overflowY: 'auto', border: '1px solid var(--color-divider)' }}>
                {plan.groups.map((g, i) => (
                  <div key={i} style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-divider)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{g.final_name}</span>
                      {g.national_team && <span className="tag tag-accent">National team</span>}
                      {g.keep !== g.final_name && <span className="text-muted" style={{ fontSize: 12 }}>(renamed from “{g.keep}”)</span>}
                    </div>
                    {g.remove?.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {g.remove.map((name) => (
                          <span key={name} className="tag tag-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <X size={11} /> {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty label="No duplicate teams found — everything is clean" />
          )}

          {error && (
            <div role="alert" style={{ marginTop: 12, border: '1px solid var(--asw-slow, var(--asw-slow))', color: 'var(--asw-slow, var(--asw-slow))', padding: '8px 12px', fontSize: 13 }}>{error}</div>
          )}

          {confirming ? (
            <ConfirmBox
              message={`Merge ${plan?.groups?.length || 0} duplicate group(s)? All results, swimmers and trophies will be transferred to the kept team in each group. This cannot be undone.`}
              confirmLabel="Merge all"
              busy={applying}
              onConfirm={handleApply}
              onCancel={() => setConfirming(false)}
            />
          ) : (
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              {plan?.groups?.length > 0 && (
                <button className="btn btn-primary" onClick={() => setConfirming(true)} disabled={applying}>
                  Apply {plan.groups.length} merge(s)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ── Merge teams modal: keep + remove pickers, swap, orphan clubs ── */
function MergeTeamsModal({ onClose, onMerged }) {
  const [allTeams, setAllTeams] = useState([])
  const [orphans, setOrphans] = useState([])
  const [loading, setLoading] = useState(true)
  const [keepId, setKeepId] = useState(null)
  const [removeId, setRemoveId] = useState(null)
  const [searchKeep, setSearchKeep] = useState('')
  const [searchRemove, setSearchRemove] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [merging, setMerging] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  const loadTeams = () => {
    findDuplicateTeams()
      .then((res) => {
        setAllTeams(res.data.teams || [])
        setOrphans(res.data.orphan_clubs || [])
      })
      .catch(() => setError('Could not load the team list. Close this window and try again.'))
      .finally(() => setLoading(false))
  }
  useEffect(loadTeams, [])

  const keepTeam = allTeams.find((t) => t.id === keepId)
  const removeTeam = allTeams.find((t) => t.id === removeId)
  const countryOptions = [...new Map(allTeams
    .filter((t) => t.country_detail)
    .map((t) => [t.country_detail.id, t.country_detail])).values()]
    .sort((a, b) => a.name.localeCompare(b.name))
  const byCountry = countryFilter
    ? allTeams.filter((t) => String(t.country_detail?.id) === String(countryFilter))
    : allTeams
  const filteredKeep = byCountry.filter((t) => t.id !== removeId && t.name.toLowerCase().includes(searchKeep.trim().toLowerCase()))
  const filteredRemove = byCountry.filter((t) => t.id !== keepId && t.name.toLowerCase().includes(searchRemove.trim().toLowerCase()))

  const handleMerge = async () => {
    if (!keepId || !removeId) return
    setMerging(true)
    setError('')
    try {
      const res = await mergeTeams({ keep_id: keepId, remove_id: removeId })
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Merge failed')
    } finally {
      setMerging(false)
      setConfirming(false)
    }
  }

  const teamList = (teams, onPick) => (
    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--color-divider)' }}>
      {teams.slice(0, 50).map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--color-divider)', cursor: 'pointer', font: 'inherit' }}
        >
          <TeamLogo logo={t.logo} name={t.name} size={28} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{t.name}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>{t.country_detail?.name} · {t.swimmers_count || 0} swimmers</span>
          </span>
        </button>
      ))}
      {teams.length === 0 && <div className="text-muted" style={{ padding: 12, fontSize: 13, textAlign: 'center' }}>No teams found</div>}
    </div>
  )

  const slot = (team, label, onClear, note) => (
    <div style={{ border: '1px solid var(--color-divider)', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TeamLogo logo={team.logo} name={team.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{team.name}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>{team.country_detail?.name} · {team.swimmers_count || 0} swimmers</div>
        </div>
        <button className="btn btn-secondary btn-icon" onClick={onClear} aria-label={`Clear ${label}`}><X size={13} /></button>
      </div>
      {note && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--asw-slow, var(--asw-slow))' }}>{note}</div>}
    </div>
  )

  return (
    <Modal title="Merge Teams" onClose={onClose} width={860}>
      <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
        Select two teams to merge — all data transfers to the kept team.
      </p>

      {loading ? (
        <Loading label="Loading teams" />
      ) : result ? (
        <div>
          <div style={{ border: '1px solid var(--color-divider)', padding: 16, textAlign: 'center' }}>
            <div className="kicker" style={{ marginBottom: 12 }}>{result.message || 'Merge complete'}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap' }}>
              <div><div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>{result.results_updated}</div><div className="micro">Results moved</div></div>
              <div><div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>{result.swimmers_updated}</div><div className="micro">Swimmers updated</div></div>
              <div><div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>{result.trophies_transferred}</div><div className="micro">Trophies moved</div></div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button
              className="btn btn-secondary"
              onClick={() => { setResult(null); setKeepId(null); setRemoveId(null); setSearchKeep(''); setSearchRemove(''); loadTeams() }}
            >
              Merge another
            </button>
            <button className="btn btn-primary" onClick={() => { onMerged(); onClose() }}>Done</button>
          </div>
        </div>
      ) : (
        <div>
          <select
            className="select"
            aria-label="Filter teams by country"
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            style={{ marginBottom: 12, maxWidth: 240 }}
          >
            <option value="">All countries</option>
            {countryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start' }}>
            {/* KEEP */}
            <div>
              <div className="micro" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Keep (primary)</div>
              {keepTeam ? slot(keepTeam, 'kept team', () => setKeepId(null)) : (
                <div>
                  <input className="input" value={searchKeep} onChange={(e) => setSearchKeep(e.target.value)} type="search" aria-label="Search team to keep" placeholder="Search team to keep…" style={{ marginBottom: 8 }} />
                  {teamList(filteredKeep, setKeepId)}
                </div>
              )}
            </div>

            {/* Swap */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 26 }}>
              {keepId && removeId && (
                <button className="btn btn-secondary btn-icon" title="Swap" aria-label="Swap teams" onClick={() => { const k = keepId; setKeepId(removeId); setRemoveId(k) }}>
                  <ArrowLeftRight size={14} />
                </button>
              )}
            </div>

            {/* REMOVE */}
            <div>
              <div className="micro" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Remove (merge into keep)</div>
              {removeTeam ? slot(removeTeam, 'removed team', () => setRemoveId(null), 'This team will be deleted after merge') : (
                <div>
                  <input className="input" value={searchRemove} onChange={(e) => setSearchRemove(e.target.value)} type="search" aria-label="Search team to remove" placeholder="Search team to remove…" style={{ marginBottom: 8 }} />
                  {teamList(filteredRemove, setRemoveId)}
                </div>
              )}
            </div>
          </div>

          {/* Orphan clubs */}
          {orphans.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="micro" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Unmatched clubs in results ({orphans.length})
              </div>
              <div style={{ border: '1px solid var(--color-divider)', padding: 10, maxHeight: 130, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {orphans.map((o) => (
                  <span key={o.name} className="tag tag-neutral">
                    {o.name} <span className="asw-num">({o.result_count})</span>
                  </span>
                ))}
              </div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                These club names appear in results but don't match any registered team.
              </div>
            </div>
          )}

          {error && (
            <div role="alert" style={{ marginTop: 12, border: '1px solid var(--asw-slow, var(--asw-slow))', color: 'var(--asw-slow, var(--asw-slow))', padding: '8px 12px', fontSize: 13 }}>{error}</div>
          )}

          {confirming ? (
            <ConfirmBox
              message={`Merge “${removeTeam?.name}” INTO “${keepTeam?.name}”? All results, swimmers, and trophies from “${removeTeam?.name}” will be transferred to “${keepTeam?.name}”, and “${removeTeam?.name}” will be deleted. This cannot be undone.`}
              confirmLabel="Merge"
              busy={merging}
              onConfirm={handleMerge}
              onCancel={() => setConfirming(false)}
            />
          ) : (
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={!keepId || !removeId || merging} onClick={() => setConfirming(true)}>
                Merge teams
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export default function Teams() {
  const [teams, setTeams] = useState([])
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('')
  const [sort, setSort] = useState('size') // Pareto: the clubs most people look for are the big ones
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [showMerge, setShowMerge] = useState(false)
  const [showAutoClean, setShowAutoClean] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [failed, setFailed] = useState(false)
  const { isAdmin } = useAuth()

  const refresh = () => {
    getTeams()
      .then((res) => {
        const d = res.data
        setTeams(Array.isArray(d) ? d : d?.results || [])
        setFailed(false)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  // Dropdown lists only countries that actually have clubs (derived from the
  // loaded teams), so every option returns results. Arab/GCC countries first.
  const countries = useMemo(() => {
    const uniq = [...new Map(teams
      .filter((t) => t.country_detail)
      .map((t) => [t.country_detail.id, t.country_detail])).values()]
    const arab = uniq.filter((c) => c.region === 'ARAB' || c.region === 'GCC')
    const rest = uniq.filter((c) => c.region !== 'ARAB' && c.region !== 'GCC')
    const byName = (a, b) => a.name.localeCompare(b.name)
    return [...arab.sort(byName), ...rest.sort(byName)]
  }, [teams])

  const filtered = useMemo(() => {
    const q = foldName(search)
    const rows = teams.filter((t) => {
      if (q && !foldName(t.name).includes(q) && !fold(t.country_detail?.name).includes(q)) return false
      if (country && String(t.country) !== String(country)) return false
      return true
    })
    const byName = (a, b) => foldName(a.name).localeCompare(foldName(b.name))
    return rows.sort(sort === 'size' ? (a, b) => (b.swimmers_count || 0) - (a.swimmers_count || 0) || byName(a, b) : byName)
  }, [teams, search, country, sort])
  const filtersOn = !!(search.trim() || country)
  const clearFilters = () => { setSearch(''); setCountry(''); setPage(1) }

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const groups = useMemo(() => {
    if (sort !== 'name') return [['', pageRows]]
    const m = new Map()
    pageRows.forEach((t) => { const l = letterOf(t.name); if (!m.has(l)) m.set(l, []); m.get(l).push(t) })
    return [...m.entries()]
  }, [pageRows, sort])

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const allOnPage = pageRows.length > 0 && pageRows.every((t) => selected.has(t.id))
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPage) pageRows.forEach((t) => next.delete(t.id))
      else pageRows.forEach((t) => next.add(t.id))
      return next
    })
  }

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete team "${t.name}"? This cannot be undone.`)) return
    try {
      await deleteTeam(t.id)
      setTeams((prev) => prev.filter((x) => x.id !== t.id))
      setSelected((prev) => { const next = new Set(prev); next.delete(t.id); return next })
    } catch {
      notify('Failed to delete team')
    }
  }

  const handleBulkDelete = async () => {
    const ids = [...selected]
    if (!ids.length) return
    if (!window.confirm(`Delete ${ids.length} team(s)? Results and swimmers keep their club names — only the team profiles (logos, info, trophies) are removed. This cannot be undone.`)) return
    setBulkDeleting(true)
    try {
      await bulkDeleteTeams(ids)
      setSelected(new Set())
      refresh()
    } catch {
      notify('Bulk delete failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  if (loading) return <Loading label="Loading clubs" />

  return (
    <div className="ap-list">
      <PageHead title="Clubs" />

      {/* Common Region: everything that narrows or orders the list sits in one
          bar with the result count; admin tools get a bar of their own */}
      <FilterBar count={filtered.length} noun={filtered.length === 1 ? 'club' : 'clubs'} active={filtersOn} onClear={clearFilters}>
        <input
          className="input"
          type="search"
          aria-label="Search clubs"
          style={{ flex: '2 1 200px', width: 'auto', minWidth: 0, maxWidth: 320 }}
          placeholder="Search by club or country…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <select
          className="select"
          aria-label="Filter by country"
          style={{ flex: '1 1 150px', width: 'auto', minWidth: 0, maxWidth: 220 }}
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPage(1) }}
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Seg options={[{ value: 'size', label: 'Largest first' }, { value: 'name', label: 'A–Z' }]} value={sort} onChange={(v) => { setSort(v); setPage(1) }} />
      </FilterBar>
      {isAdmin && (
        <div className="rule-b" style={{ padding: '10px 32px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="kicker" style={{ marginRight: 4 }}>Admin</span>
          <button className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowAutoClean(true)}>
            <Sparkles size={14} /> Auto-clean duplicates
          </button>
          <button className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowMerge(true)}>
            <GitMerge size={14} /> Merge two clubs
          </button>
          <label className="micro" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, marginLeft: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all clubs on this page" style={{ cursor: 'pointer' }} />
            Select page
          </label>
          {selected.size > 0 && (<>
            <button className="btn btn-secondary" disabled={bulkDeleting} onClick={handleBulkDelete} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--asw-slow)' }}>
              <Trash2 size={14} /> {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} selected`}
            </button>
            <button className="btn btn-ghost" onClick={() => setSelected(new Set())}>Clear selection</button>
          </>)}
        </div>
      )}

      {filtered.length === 0 ? (
        failed && teams.length === 0 ? (
          <Empty label="Could not load clubs" hint="Check your connection and reload the page." />
        ) : (
          <Empty label="No clubs found" hint={filtersOn ? 'Check the spelling, or clear the filters to see every club.' : undefined}>
            {filtersOn && <button type="button" className="btn btn-secondary" onClick={clearFilters}>Clear filters</button>}
          </Empty>
        )
      ) : (
        <div className="pad">
          {/* Chunking: A–Z order is broken into letter groups; "largest first"
              is one ranked run and needs no headings */}
          {groups.map(([letter, rows]) => (
          <div key={letter} style={{ marginBottom: 18 }}>
          {letter && <div className="kicker rule-b" style={{ paddingBottom: 6, marginBottom: 12 }}>{letter}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
            {rows.map((t) => (
              <Link
                key={t.id}
                to={`/teams/${t.id}`}
                style={{
                  position: 'relative', display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px',
                  background: '#fff', border: '1px solid var(--color-neutral-300)', borderRadius: 0,
                  border: '1px solid var(--color-divider)', color: 'inherit', textDecoration: 'none',
                }}
              >
                {isAdmin && (
                  <span style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, alignItems: 'center' }}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} aria-label={`Select ${t.name}`} style={{ cursor: 'pointer' }} />
                    <button className="btn btn-secondary btn-icon" title="Delete team" aria-label={`Delete ${t.name}`} onClick={() => handleDelete(t)}>
                      <Trash2 size={12} />
                    </button>
                  </span>
                )}
                <span style={{
                  width: 52, height: 52, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                  background: 'var(--color-accent-100)', border: '1px solid var(--color-neutral-300)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {t.logo ? (
                    <Pic kind="logo" w={96} src={t.logo} fallback={<span className="ap-initials-fill" style={{ fontSize: 16 }}>{acronym(t.name)}</span>} />
                  ) : (
                    <span className="ap-initials-fill" style={{ fontSize: 16 }}>{acronym(t.name)}</span>
                  )}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-accent-800)', display: 'block', lineHeight: 1.3 }}>{t.name}</span>
                  {/* Similarity: flag + country like swimmer and academy cards; the line never wraps
                      (the country gives way first), and "Academy" is a chip, not a third phrase */}
                  {/* two fixed lines on every card — country, then size — so rows stay even and nothing wraps mid-phrase */}
                  <span className="ap-card-meta">
                    {t.country_detail?.code && <Flag code={t.country_detail.code} name={t.country_detail.name} />}
                    {t.country_detail?.name && <span className="ap-card-meta-grow">{t.country_detail.name}</span>}
                  </span>
                  <span className="ap-card-meta" style={{ marginTop: 2 }}>
                    <span className="asw-num ap-card-meta-fixed">{t.swimmers_count > 0 ? `${t.swimmers_count} swimmer${t.swimmers_count === 1 ? '' : 's'}` : 'No swimmers yet'}</span>
                    {t.is_academy && <span className="tag tag-accent ap-chip">Academy</span>}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          </div>
          ))}
          <Pager page={page} pageSize={PAGE_SIZE} count={filtered.length} onPage={setPage} />
        </div>
      )}

      {isAdmin && showMerge && <MergeTeamsModal onClose={() => setShowMerge(false)} onMerged={refresh} />}
      {isAdmin && showAutoClean && <AutoCleanModal onClose={() => setShowAutoClean(false)} onCleaned={refresh} />}
    </div>
  )
}
