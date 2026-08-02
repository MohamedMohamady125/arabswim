import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GitMerge, Sparkles, Trash2, X, ArrowLeftRight } from 'lucide-react'
import { getTeams, deleteTeam, bulkDeleteTeams, mergeTeams, findDuplicateTeams, autoDedupeTeams } from '../api/teams'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Pager } from '../components/ui'
import { mediaUrl } from '../utils'
import { useAuth } from '../context/AuthContext'

const PAGE_SIZE = 25

function acronym(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
}

function TeamLogo({ logo, name, size = 36 }) {
  if (logo) {
    return (
      <div className="grayscale" style={{ width: size, height: size, flex: 'none', overflow: 'hidden', border: '1px solid var(--color-divider)' }}>
        <img src={mediaUrl(logo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
    )
  }
  return (
    <div style={{ width: size, height: size, flex: 'none', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 11 }}>
      {acronym(name)}
    </div>
  )
}

// Flat Modernist modal — fixed overlay, white panel, 2px border, no radius
function Modal({ title, onClose, children, width = 760 }) {
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

function ConfirmBox({ message, confirmLabel = 'Confirm', busy, onConfirm, onCancel }) {
  return (
    <div style={{ marginTop: 16, border: '2px solid var(--color-text)', padding: 14 }}>
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
    <Modal title="Auto-clean duplicate teams" onClose={onClose}>
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
              <div><div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26 }}>{result.teams_merged}</div><div className="micro">Teams merged</div></div>
              <div><div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26 }}>{result.results_updated}</div><div className="micro">Results moved</div></div>
              <div><div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26 }}>{result.swimmers_updated}</div><div className="micro">Swimmers updated</div></div>
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
            <div style={{ marginTop: 12, border: '1px solid var(--asw-slow, #b3261e)', color: 'var(--asw-slow, #b3261e)', padding: '8px 12px', fontSize: 13 }}>{error}</div>
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
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(loadTeams, [])

  const keepTeam = allTeams.find((t) => t.id === keepId)
  const removeTeam = allTeams.find((t) => t.id === removeId)
  const filteredKeep = allTeams.filter((t) => t.id !== removeId && t.name.toLowerCase().includes(searchKeep.toLowerCase()))
  const filteredRemove = allTeams.filter((t) => t.id !== keepId && t.name.toLowerCase().includes(searchRemove.toLowerCase()))

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
          onClick={() => onPick(t.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--color-divider)', cursor: 'pointer', font: 'inherit' }}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <TeamLogo logo={team.logo} name={team.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{team.name}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>{team.country_detail?.name} · {team.swimmers_count || 0} swimmers</div>
        </div>
        <button className="btn btn-secondary btn-icon" onClick={onClear} aria-label={`Clear ${label}`}><X size={13} /></button>
      </div>
      {note && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--asw-slow, #b3261e)' }}>{note}</div>}
    </div>
  )

  return (
    <Modal title="Merge teams" onClose={onClose} width={860}>
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
              <div><div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26 }}>{result.results_updated}</div><div className="micro">Results moved</div></div>
              <div><div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26 }}>{result.swimmers_updated}</div><div className="micro">Swimmers updated</div></div>
              <div><div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26 }}>{result.trophies_transferred}</div><div className="micro">Trophies moved</div></div>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14, alignItems: 'start' }}>
            {/* KEEP */}
            <div>
              <div className="micro" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Keep (primary)</div>
              {keepTeam ? slot(keepTeam, 'kept team', () => setKeepId(null)) : (
                <div>
                  <input className="input" value={searchKeep} onChange={(e) => setSearchKeep(e.target.value)} placeholder="Search team to keep…" style={{ marginBottom: 8 }} />
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
                  <input className="input" value={searchRemove} onChange={(e) => setSearchRemove(e.target.value)} placeholder="Search team to remove…" style={{ marginBottom: 8 }} />
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
            <div style={{ marginTop: 12, border: '1px solid var(--asw-slow, #b3261e)', color: 'var(--asw-slow, #b3261e)', padding: '8px 12px', fontSize: 13 }}>{error}</div>
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
  const [countries, setCountries] = useState([])
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [showMerge, setShowMerge] = useState(false)
  const [showAutoClean, setShowAutoClean] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const { isAdmin } = useAuth()

  const refresh = () => {
    getTeams()
      .then((res) => {
        const d = res.data
        setTeams(Array.isArray(d) ? d : d?.results || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let alive = true
    getCountries()
      .then((res) => {
        if (!alive) return
        const all = Array.isArray(res.data) ? res.data : res.data?.results || []
        const arab = all.filter((c) => c.region === 'ARAB' || c.region === 'GCC')
        const rest = all.filter((c) => c.region !== 'ARAB' && c.region !== 'GCC')
        setCountries([...arab, ...rest])
      })
      .catch(() => {})
    refresh()
    return () => { alive = false }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return teams.filter((t) => {
      if (q && !String(t.name || '').toLowerCase().includes(q)) return false
      if (country && String(t.country) !== String(country)) return false
      return true
    })
  }, [teams, search, country])

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
      window.alert('Failed to delete team')
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
      window.alert('Bulk delete failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  if (loading) return <Loading label="Loading clubs" />

  return (
    <div>
      <PageHead kicker="People" title="Clubs" sub={`${filtered.length} clubs and national teams.`} />

      {/* filter bar */}
      <div className="rule-b" style={{ padding: '16px 32px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search clubs…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <select
          className="select"
          style={{ maxWidth: 220 }}
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPage(1) }}
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {isAdmin && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {selected.size > 0 && (
              <button className="btn btn-primary" disabled={bulkDeleting} onClick={handleBulkDelete} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={14} /> Delete ({selected.size})
              </button>
            )}
            <button className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowAutoClean(true)}>
              <Sparkles size={14} /> Auto-clean
            </button>
            <button className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowMerge(true)}>
              <GitMerge size={14} /> Merge
            </button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty label="No clubs found" />
      ) : (
        <div className="pad">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  {isAdmin && (
                    <th style={{ width: 32 }}>
                      <input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all teams" style={{ cursor: 'pointer' }} />
                    </th>
                  )}
                  <th>Club</th>
                  <th className="hide-mobile">Country</th>
                  <th className="num hide-mobile">Founded</th>
                  <th className="num">Swimmers</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => (
                  <tr key={t.id}>
                    {isAdmin && (
                      <td>
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} aria-label={`Select ${t.name}`} style={{ cursor: 'pointer' }} />
                      </td>
                    )}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <TeamLogo logo={t.logo} name={t.name} />
                        <Link to={`/teams/${t.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                          {t.name}
                        </Link>
                        {t.is_national_team && <span className="tag tag-accent">National team</span>}
                      </div>
                      <div className="show-mobile micro" style={{ margin: '3px 0 0 40px', textTransform: 'none', letterSpacing: 0 }}>
                        {[t.country_detail?.name, t.founded_year ? `Est. ${t.founded_year}` : null].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="hide-mobile">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Flag code={t.country_detail?.code} name={t.country_detail?.name} />
                        <span className="text-muted">{t.country_detail?.name || '—'}</span>
                      </div>
                    </td>
                    <td className="num asw-num hide-mobile">{t.founded_year ?? '—'}</td>
                    <td className="num asw-num">{t.swimmers_count ?? '—'}</td>
                    {isAdmin && (
                      <td className="num">
                        <button className="btn btn-secondary btn-icon" title="Delete team" aria-label="Delete team" onClick={() => handleDelete(t)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} count={filtered.length} onPage={setPage} />
        </div>
      )}

      {isAdmin && showMerge && <MergeTeamsModal onClose={() => setShowMerge(false)} onMerged={refresh} />}
      {isAdmin && showAutoClean && <AutoCleanModal onClose={() => setShowAutoClean(false)} onCleaned={refresh} />}
    </div>
  )
}
