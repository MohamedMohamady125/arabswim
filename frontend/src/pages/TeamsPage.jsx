import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Waves, Plus, Pencil, Trash2, GitMerge, Sparkles, CheckCircle2, X, ArrowLeftRight, ArrowRight, Shield, Loader2 } from 'lucide-react'
import { getTeams, deleteTeam, bulkDeleteTeams, mergeTeams, findDuplicateTeams, autoDedupeTeams } from '../api/teams'
import { getCountries } from '../api/core'
import DataTable from '../components/common/DataTable'
import CountryFlag from '../components/common/CountryFlag'
import { Button, Badge, PageHeader, FilterBar, Select, SearchInput, Modal, ConfirmDialog, EmptyState, Input } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

function TeamLogo({ logo, size = 'md' }) {
  const cls = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10'
  return (
    <div className={`${cls} rounded-sm bg-ink-50 border border-ink-100 flex items-center justify-center overflow-hidden shrink-0`}>
      {logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <Waves size={size === 'sm' ? 14 : 16} className="text-ink-400" />}
    </div>
  )
}

/* ───────── Auto-Clean Duplicates Modal ───────── */
function AutoCleanModal({ onClose, onCleaned }) {
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    autoDedupeTeams({ dry_run: true })
      .then(res => setPlan(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to scan for duplicates'))
      .finally(() => setLoading(false))
  }, [])

  const handleApply = async () => {
    setApplying(true)
    setError('')
    try {
      const res = await autoDedupeTeams({ dry_run: false })
      setResult(res.data)
      setConfirmOpen(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Auto-clean failed')
      setConfirmOpen(false)
    } finally {
      setApplying(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Auto-clean duplicate teams" size="lg">
      <p className="text-body-sm text-ink-400 -mt-1 mb-4">
        Finds name variants (case, dashes, squad letters, national teams) and merges them.
      </p>

      {loading ? (
        <div className="py-10 text-center">
          <Loader2 size={28} className="animate-spin mx-auto text-aqua-600" />
          <p className="text-body-sm text-ink-400 mt-3">Scanning all teams for duplicates...</p>
        </div>
      ) : result ? (
        <div className="space-y-4">
          <div className="bg-pos/5 border border-pos/20 rounded-md p-5 text-center">
            <CheckCircle2 size={40} className="mx-auto mb-3 text-pos" />
            <p className="text-title text-ink-900">Cleanup complete</p>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 mt-4">
              <div className="text-center"><div className="text-time-lg text-pos">{result.teams_merged}</div><div className="text-label text-ink-400">Teams merged</div></div>
              <div className="text-center"><div className="text-time-lg text-pos">{result.results_updated}</div><div className="text-label text-ink-400">Results moved</div></div>
              <div className="text-center"><div className="text-time-lg text-pos">{result.swimmers_updated}</div><div className="text-label text-ink-400">Swimmers updated</div></div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => { onCleaned(); onClose() }}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {plan?.groups?.length ? (
            <>
              <div className="text-label text-ink-500">{plan.groups.length} duplicate group(s) found — review before applying:</div>
              <div className="max-h-[45vh] overflow-y-auto space-y-2 border border-ink-100 rounded-md p-3">
                {plan.groups.map((g, i) => (
                  <div key={i} className="bg-ink-50 rounded-sm p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-body-sm font-semibold text-pos">{g.final_name}</span>
                      {g.national_team && <Badge variant="aqua">National team</Badge>}
                      {g.keep !== g.final_name && <span className="text-body-sm text-ink-400">(renamed from "{g.keep}")</span>}
                    </div>
                    {g.remove.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {g.remove.map(name => (
                          <span key={name} className="inline-flex items-center gap-1 text-body-sm bg-neg/5 text-neg border border-neg/20 px-2 py-0.5 rounded-sm">
                            <X size={12} />
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={Sparkles} title="No duplicate teams found" hint="Everything is clean." />
          )}

          {error && <div className="bg-neg/5 border border-neg/20 rounded-sm p-3 text-body-sm text-neg">{error}</div>}

          <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            {plan?.groups?.length > 0 && (
              <Button icon={Sparkles} loading={applying} onClick={() => setConfirmOpen(true)}>
                Apply {plan.groups.length} merge(s)
              </Button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Apply auto-clean"
        message={plan?.groups?.length ? `Merge ${plan.groups.length} duplicate group(s)? All results, swimmers and trophies will be transferred to the kept team in each group. This cannot be undone.` : ''}
        confirmLabel="Merge all"
        destructive
        loading={applying}
        onConfirm={handleApply}
        onCancel={() => setConfirmOpen(false)}
      />
    </Modal>
  )
}

/* ───────── Merge Teams Modal ───────── */
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
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    findDuplicateTeams()
      .then(res => {
        setAllTeams(res.data.teams || [])
        setOrphans(res.data.orphan_clubs || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const keepTeam = allTeams.find(t => t.id === keepId)
  const removeTeam = allTeams.find(t => t.id === removeId)

  const filteredKeep = allTeams.filter(t =>
    t.id !== removeId && t.name.toLowerCase().includes(searchKeep.toLowerCase())
  )
  const filteredRemove = allTeams.filter(t =>
    t.id !== keepId && t.name.toLowerCase().includes(searchRemove.toLowerCase())
  )

  const handleMerge = async () => {
    if (!keepId || !removeId) return
    setMerging(true)
    setError('')
    try {
      const res = await mergeTeams({ keep_id: keepId, remove_id: removeId })
      setResult(res.data)
      setConfirmOpen(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Merge failed')
      setConfirmOpen(false)
    } finally {
      setMerging(false)
    }
  }

  const handleSwap = () => {
    const tmpKeep = keepId
    setKeepId(removeId)
    setRemoveId(tmpKeep)
  }

  const teamList = (teams, onPick, hoverCls) => (
    <div className="max-h-40 sm:max-h-48 overflow-y-auto border border-ink-100 rounded-sm divide-y divide-ink-100">
      {teams.slice(0, 50).map(t => (
        <button key={t.id} onClick={() => onPick(t.id)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-11 ${hoverCls} text-start transition-colors`}>
          <TeamLogo logo={t.logo} size="sm" />
          <div className="min-w-0">
            <div className="text-body-sm font-semibold text-ink-900 truncate">{t.name}</div>
            <div className="text-body-sm text-ink-400">{t.country_detail?.name} · {t.swimmers_count || 0} swimmers</div>
          </div>
        </button>
      ))}
      {teams.length === 0 && <div className="px-3 py-4 text-center text-ink-400 text-body-sm">No teams found</div>}
    </div>
  )

  if (loading) return (
    <Modal open onClose={onClose} title="Merge teams" size="lg">
      <div className="py-10 text-center">
        <Loader2 size={28} className="animate-spin mx-auto text-aqua-600" />
      </div>
    </Modal>
  )

  return (
    <Modal open onClose={onClose} title="Merge teams" size="xl">
      <p className="text-body-sm text-ink-400 -mt-1 mb-4">
        Select two teams to merge — all data transfers to the kept team.
      </p>

      {result ? (
        <div className="space-y-4">
          <div className="bg-pos/5 border border-pos/20 rounded-md p-5 text-center">
            <CheckCircle2 size={40} className="mx-auto mb-3 text-pos" />
            <p className="text-title text-ink-900">{result.message}</p>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 mt-4">
              <div className="text-center">
                <div className="text-time-lg text-pos">{result.results_updated}</div>
                <div className="text-label text-ink-400">Results moved</div>
              </div>
              <div className="text-center">
                <div className="text-time-lg text-pos">{result.swimmers_updated}</div>
                <div className="text-label text-ink-400">Swimmers updated</div>
              </div>
              <div className="text-center">
                <div className="text-time-lg text-pos">{result.trophies_transferred}</div>
                <div className="text-label text-ink-400">Trophies moved</div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary"
              onClick={() => { setResult(null); setKeepId(null); setRemoveId(null); setSearchKeep(''); setSearchRemove(''); findDuplicateTeams().then(res => { setAllTeams(res.data.teams || []); setOrphans(res.data.orphan_clubs || []) }) }}>
              Merge another
            </Button>
            <Button onClick={() => { onMerged(); onClose() }}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          {/* Selection area */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
            {/* KEEP team */}
            <div>
              <div className="text-label text-pos mb-2">Keep (primary)</div>
              {keepTeam ? (
                <div className="bg-pos/5 border border-pos/30 rounded-md p-4 relative">
                  <button onClick={() => setKeepId(null)} aria-label="Clear kept team"
                    className="absolute top-1 end-1 p-2 text-ink-400 hover:text-neg rounded-sm">
                    <X size={16} />
                  </button>
                  <div className="flex items-center gap-3">
                    <TeamLogo logo={keepTeam.logo} />
                    <div className="min-w-0">
                      <div className="font-semibold text-body-sm text-ink-900 truncate">{keepTeam.name}</div>
                      <div className="text-body-sm text-ink-400">{keepTeam.country_detail?.name} · {keepTeam.swimmers_count || 0} swimmers</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <Input value={searchKeep} onChange={e => setSearchKeep(e.target.value)} placeholder="Search team to keep..." className="mb-2" />
                  {teamList(filteredKeep, setKeepId, 'hover:bg-pos/5')}
                </div>
              )}
            </div>

            {/* Swap + arrow */}
            <div className="flex md:flex-col items-center justify-center gap-2 py-0 md:py-4">
              {keepId && removeId && (
                <Button variant="secondary" size="sm" icon={ArrowLeftRight} onClick={handleSwap} aria-label="Swap teams" title="Swap" />
              )}
              <ArrowRight size={22} className="text-ink-200 hidden md:block rtl:rotate-180" />
            </div>

            {/* REMOVE team */}
            <div>
              <div className="text-label text-neg mb-2">Remove (merge into keep)</div>
              {removeTeam ? (
                <div className="bg-neg/5 border border-neg/30 rounded-md p-4 relative">
                  <button onClick={() => setRemoveId(null)} aria-label="Clear removed team"
                    className="absolute top-1 end-1 p-2 text-ink-400 hover:text-neg rounded-sm">
                    <X size={16} />
                  </button>
                  <div className="flex items-center gap-3">
                    <TeamLogo logo={removeTeam.logo} />
                    <div className="min-w-0">
                      <div className="font-semibold text-body-sm text-ink-900 truncate">{removeTeam.name}</div>
                      <div className="text-body-sm text-ink-400">{removeTeam.country_detail?.name} · {removeTeam.swimmers_count || 0} swimmers</div>
                    </div>
                  </div>
                  <div className="mt-2 text-body-sm text-neg font-medium">This team will be deleted after merge</div>
                </div>
              ) : (
                <div>
                  <Input value={searchRemove} onChange={e => setSearchRemove(e.target.value)} placeholder="Search team to remove..." className="mb-2" />
                  {teamList(filteredRemove, setRemoveId, 'hover:bg-neg/5')}
                </div>
              )}
            </div>
          </div>

          {/* Orphan clubs */}
          {orphans.length > 0 && (
            <div>
              <div className="text-label text-scm mb-2">Unmatched clubs in results ({orphans.length})</div>
              <div className="bg-scm/5 border border-scm/20 rounded-md p-3 max-h-32 overflow-y-auto">
                <div className="flex flex-wrap gap-1.5">
                  {orphans.map(o => (
                    <span key={o.name} className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded-sm border border-ink-100 text-body-sm">
                      <span className="font-semibold text-ink-700">{o.name}</span>
                      <span className="text-ink-400 tnum">({o.result_count})</span>
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-body-sm text-ink-400 mt-1">These club names appear in results but don't match any registered team</p>
            </div>
          )}

          {/* Error */}
          {error && <div className="bg-neg/5 border border-neg/20 rounded-sm p-3 text-body-sm text-neg">{error}</div>}

          {/* Merge button */}
          <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button icon={GitMerge} disabled={!keepId || !removeId} loading={merging} onClick={() => setConfirmOpen(true)}>
              Merge Teams
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Merge teams"
        message={keepTeam && removeTeam
          ? `Merge "${removeTeam.name}" INTO "${keepTeam.name}"? All results, swimmers, and trophies from "${removeTeam.name}" will be transferred to "${keepTeam.name}", and "${removeTeam.name}" will be deleted. This cannot be undone.`
          : ''}
        confirmLabel="Merge"
        destructive
        loading={merging}
        onConfirm={handleMerge}
        onCancel={() => setConfirmOpen(false)}
      />
    </Modal>
  )
}

export default function TeamsPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const isAdmin = !!token
  const toast = useToast()
  const [teams, setTeams] = useState([])
  const [countries, setCountries] = useState([])
  const [showMerge, setShowMerge] = useState(false)
  const [showAutoClean, setShowAutoClean] = useState(false)

  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmBulk, setConfirmBulk] = useState(false)

  const refresh = () => {
    const params = { search: search || undefined, country: countryFilter || undefined }
    getTeams(params).then(res => {
      const data = Array.isArray(res.data) ? res.data : (res.data.results || [])
      setTeams(data)
    }).catch(() => {})
  }

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
  }, [])

  useEffect(() => { refresh() }, [search, countryFilter])

  const handleDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deleteTeam(pendingDelete.id)
      setTeams(prev => prev.filter(t => t.id !== pendingDelete.id))
      setSelected(prev => { const next = new Set(prev); next.delete(pendingDelete.id); return next })
      toast.success(`Deleted "${pendingDelete.name}"`)
      setPendingDelete(null)
    } catch {
      toast.error('Failed to delete team')
    } finally {
      setDeleting(false)
    }
  }

  const allSelected = teams.length > 0 && teams.every(t => selected.has(t.id))
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(teams.map(t => t.id)))
  }
  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkDelete = async () => {
    const ids = [...selected]
    if (!ids.length) return
    setBulkDeleting(true)
    try {
      await bulkDeleteTeams(ids)
      setSelected(new Set())
      toast.success(`Deleted ${ids.length} team(s)`)
      setConfirmBulk(false)
      refresh()
    } catch {
      toast.error('Bulk delete failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  const checkboxCls = 'w-5 h-5 accent-aqua-600 cursor-pointer'

  const columns = [
    ...(isAdmin ? [{
      key: 'select',
      label: (
        <label className="flex items-center justify-center p-2 -m-2 cursor-pointer">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all teams"
            onClick={e => e.stopPropagation()} className={checkboxCls} />
        </label>
      ),
      render: (row) => (
        <label className="flex items-center justify-center p-2 -m-2 cursor-pointer" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} aria-label={`Select ${row.name}`}
            className={checkboxCls} />
        </label>
      )
    }] : []),
    { key: 'logo', label: '', render: (row) => <TeamLogo logo={row.logo} /> },
    { key: 'name', label: 'Team', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'country', label: 'Country',
      render: (row) => row.country_detail ? (
        <CountryFlag code={row.country_detail.code} flagUrl={row.country_detail.flag_url} name={row.country_detail.name} />
      ) : '-'
    },
    { key: 'founded_year', label: 'Founded', numeric: true, render: (row) => row.founded_year || '-' },
    { key: 'swimmers_count', label: 'Swimmers', numeric: true, render: (row) => row.swimmers_count || 0 },
    {
      key: 'is_national_team', label: 'Type',
      render: (row) => row.is_national_team
        ? <Badge variant="aqua">National</Badge>
        : <Badge variant="status">Club</Badge>
    },
    ...(isAdmin ? [{
      key: 'actions', label: '',
      render: (row) => (
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="sm" icon={Pencil} aria-label="Edit team"
            onClick={(e) => { e.stopPropagation(); navigate(`/teams/${row.id}/edit`) }} />
          <Button variant="ghost" size="sm" icon={Trash2} aria-label="Delete team" className="text-neg hover:text-neg"
            onClick={(e) => { e.stopPropagation(); setPendingDelete(row) }} />
        </div>
      )
    }] : []),
  ]

  const chips = [
    countryFilter && { key: 'country', label: countries.find(c => String(c.id) === String(countryFilter))?.name || 'Country', onRemove: () => setCountryFilter('') },
  ].filter(Boolean)

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Teams"
        subtitle="Clubs and national teams across the region"
        action={isAdmin && (
          <>
            {selected.size > 0 && (
              <Button variant="danger" size="sm" icon={Trash2} loading={bulkDeleting} onClick={() => setConfirmBulk(true)}>
                Delete ({selected.size})
              </Button>
            )}
            <Button variant="ghost" size="sm" icon={Sparkles} onClick={() => setShowAutoClean(true)}>
              Auto-Clean
            </Button>
            <Button variant="ghost" size="sm" icon={GitMerge} onClick={() => setShowMerge(true)}>
              Merge
            </Button>
            <Button variant="ghost" size="sm" icon={Plus} onClick={() => navigate('/teams/new')}>
              Add
            </Button>
          </>
        )}
      />

      <FilterBar chips={chips} onReset={() => setCountryFilter('')}>
        <SearchInput
          placeholder="Search teams..."
          value={search}
          onChange={(e) => { setSearch(e.target.value) }}
          className="w-full md:w-64"
        />
        <Select value={countryFilter} onChange={(e) => { setCountryFilter(e.target.value) }} className="md:w-44" aria-label="Country">
          <option value="">All countries</option>
          {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </FilterBar>

      {teams.length === 0 ? (
        <EmptyState icon={Shield} title="No teams found" hint="Try adjusting the search or filters." />
      ) : (
        <DataTable
          columns={columns}
          data={teams}
          onRowClick={(t) => navigate(`/teams/${t.id}`)}
          emptyMessage="No teams found"
          mobileRender={(row) => (
            <div className="flex items-center gap-3">
              {isAdmin && (
                <label className="flex items-center p-2 -ms-2 cursor-pointer shrink-0" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)}
                    aria-label={`Select ${row.name}`} className={checkboxCls} />
                </label>
              )}
              <TeamLogo logo={row.logo} />
              <div className="min-w-0 flex-1">
                <div className="text-body-sm font-medium text-ink-900 truncate">{row.name}</div>
                <div className="text-body-sm text-ink-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                  {row.country_detail && <CountryFlag code={row.country_detail.code} flagUrl={row.country_detail.flag_url} name={row.country_detail.name} />}
                  <span className="tnum">{row.swimmers_count || 0} swimmers</span>
                </div>
              </div>
              {row.is_national_team
                ? <Badge variant="aqua">National</Badge>
                : <Badge variant="status">Club</Badge>}
            </div>
          )}
        />
      )}

      {isAdmin && showMerge && <MergeTeamsModal onClose={() => setShowMerge(false)} onMerged={refresh} />}
      {isAdmin && showAutoClean && <AutoCleanModal onClose={() => setShowAutoClean(false)} onCleaned={refresh} />}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete team"
        message={pendingDelete ? `Delete team "${pendingDelete.name}"? This cannot be undone.` : ''}
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={confirmBulk}
        title="Delete selected teams"
        message={`Delete ${selected.size} team(s)? Results and swimmers keep their club names — only the team profiles (logos, info, trophies) are removed. This cannot be undone.`}
        destructive
        loading={bulkDeleting}
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulk(false)}
      />
    </div>
  )
}
