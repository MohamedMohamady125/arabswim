import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTeams, deleteTeam, mergeTeams, findDuplicateTeams } from '../api/teams'
import { getCountries } from '../api/core'
import DataTable from '../components/common/DataTable'
import CountryFlag from '../components/common/CountryFlag'

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
    if (!window.confirm(`Merge "${removeTeam?.name}" INTO "${keepTeam?.name}"?\n\nAll results, swimmers, and trophies from "${removeTeam?.name}" will be transferred to "${keepTeam?.name}", and "${removeTeam?.name}" will be deleted.\n\nThis cannot be undone.`)) return
    setMerging(true)
    setError('')
    try {
      const res = await mergeTeams({ keep_id: keepId, remove_id: removeId })
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Merge failed')
    } finally {
      setMerging(false)
    }
  }

  const handleSwap = () => {
    const tmpKeep = keepId
    setKeepId(removeId)
    setRemoveId(tmpKeep)
  }

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl p-8">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin mx-auto" />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Merge Teams</h2>
            <p className="text-xs text-gray-400 mt-0.5">Select two teams to merge — all data transfers to the kept team</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {result ? (
          <div className="p-6 space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="font-bold text-emerald-800 text-lg">{result.message}</p>
              <div className="flex justify-center gap-6 mt-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-black text-emerald-600">{result.results_updated}</div>
                  <div className="text-emerald-600/60 text-xs font-semibold">Results moved</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-emerald-600">{result.swimmers_updated}</div>
                  <div className="text-emerald-600/60 text-xs font-semibold">Swimmers updated</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-emerald-600">{result.trophies_transferred}</div>
                  <div className="text-emerald-600/60 text-xs font-semibold">Trophies moved</div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setResult(null); setKeepId(null); setRemoveId(null); setSearchKeep(''); setSearchRemove(''); findDuplicateTeams().then(res => { setAllTeams(res.data.teams || []); setOrphans(res.data.orphan_clubs || []) }) }}
                className="px-4 py-2 text-sm rounded-lg border text-gray-600 hover:bg-gray-50">Merge another</button>
              <button onClick={() => { onMerged(); onClose() }}
                className="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700">Done</button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Selection area */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
              {/* KEEP team */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2 block">Keep (primary)</label>
                {keepTeam ? (
                  <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 relative">
                    <button onClick={() => setKeepId(null)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-sm">&times;</button>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center overflow-hidden border">
                        {keepTeam.logo ? <img src={keepTeam.logo} alt="" className="w-full h-full object-cover" /> : <span className="text-gray-400">🏊</span>}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-800">{keepTeam.name}</div>
                        <div className="text-xs text-gray-400">{keepTeam.country_detail?.name} · {keepTeam.swimmers_count || 0} swimmers</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <input value={searchKeep} onChange={e => setSearchKeep(e.target.value)} placeholder="Search team to keep..."
                      className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
                    <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                      {filteredKeep.slice(0, 50).map(t => (
                        <button key={t.id} onClick={() => setKeepId(t.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50 text-left transition-colors">
                          <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                            {t.logo ? <img src={t.logo} alt="" className="w-full h-full object-cover" /> : <span className="text-gray-400 text-sm">🏊</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-800 truncate">{t.name}</div>
                            <div className="text-[10px] text-gray-400">{t.country_detail?.name} · {t.swimmers_count || 0} swimmers</div>
                          </div>
                        </button>
                      ))}
                      {filteredKeep.length === 0 && <div className="px-3 py-4 text-center text-gray-400 text-sm">No teams found</div>}
                    </div>
                  </div>
                )}
              </div>

              {/* Swap + arrow */}
              <div className="flex md:flex-col items-center justify-center gap-2 py-4">
                {keepId && removeId && (
                  <button onClick={handleSwap} className="p-2 rounded-lg border hover:bg-gray-50 transition-colors" title="Swap">
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                  </button>
                )}
                <svg className="w-6 h-6 text-gray-300 hidden md:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
              </div>

              {/* REMOVE team */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-2 block">Remove (merge into keep)</label>
                {removeTeam ? (
                  <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 relative">
                    <button onClick={() => setRemoveId(null)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-sm">&times;</button>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center overflow-hidden border">
                        {removeTeam.logo ? <img src={removeTeam.logo} alt="" className="w-full h-full object-cover" /> : <span className="text-gray-400">🏊</span>}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-800">{removeTeam.name}</div>
                        <div className="text-xs text-gray-400">{removeTeam.country_detail?.name} · {removeTeam.swimmers_count || 0} swimmers</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-red-500 font-semibold">This team will be deleted after merge</div>
                  </div>
                ) : (
                  <div>
                    <input value={searchRemove} onChange={e => setSearchRemove(e.target.value)} placeholder="Search team to remove..."
                      className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
                    <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                      {filteredRemove.slice(0, 50).map(t => (
                        <button key={t.id} onClick={() => setRemoveId(t.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-50 text-left transition-colors">
                          <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                            {t.logo ? <img src={t.logo} alt="" className="w-full h-full object-cover" /> : <span className="text-gray-400 text-sm">🏊</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-800 truncate">{t.name}</div>
                            <div className="text-[10px] text-gray-400">{t.country_detail?.name} · {t.swimmers_count || 0} swimmers</div>
                          </div>
                        </button>
                      ))}
                      {filteredRemove.length === 0 && <div className="px-3 py-4 text-center text-gray-400 text-sm">No teams found</div>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Orphan clubs — teams in results that don't match any Team record */}
            {orphans.length > 0 && (
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2">Unmatched clubs in results ({orphans.length})</div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 max-h-32 overflow-y-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {orphans.map(o => (
                      <span key={o.name} className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded-lg border text-xs">
                        <span className="font-semibold text-gray-700">{o.name}</span>
                        <span className="text-gray-400">({o.result_count})</span>
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-amber-600/60 mt-1">These club names appear in results but don't match any registered team</p>
              </div>
            )}

            {/* Error */}
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

            {/* Merge button */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button onClick={onClose} className="px-4 py-2.5 text-sm rounded-xl border text-gray-500 hover:bg-gray-50">Cancel</button>
              <button onClick={handleMerge} disabled={!keepId || !removeId || merging}
                className="px-6 py-2.5 text-sm rounded-xl bg-sky-600 text-white font-bold hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                {merging ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Merging...</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                    Merge Teams
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function TeamsPage() {
  const navigate = useNavigate()
  const [teams, setTeams] = useState([])
  const [countries, setCountries] = useState([])
  const [showMerge, setShowMerge] = useState(false)

  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('')

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

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete team "${name}"?`)) return
    await deleteTeam(id)
    setTeams(prev => prev.filter(t => t.id !== id))
  }

  const columns = [
    {
      key: 'logo', label: '',
      render: (row) => (
        <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
          {row.logo ? <img src={row.logo} alt="" className="w-full h-full object-cover" /> : <span className="text-gray-400 text-lg">🏊</span>}
        </div>
      )
    },
    { key: 'name', label: 'Team Name' },
    {
      key: 'country', label: 'Country',
      render: (row) => row.country_detail ? (
        <CountryFlag code={row.country_detail.code} flagUrl={row.country_detail.flag_url} name={row.country_detail.name} />
      ) : '-'
    },
    { key: 'founded_year', label: 'Founded', render: (row) => row.founded_year || '-' },
    { key: 'swimmers_count', label: 'Swimmers', render: (row) => row.swimmers_count || 0 },
    {
      key: 'is_national_team', label: 'Type',
      render: (row) => row.is_national_team ? (
        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">National</span>
      ) : (
        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">Club</span>
      )
    },
    {
      key: 'actions', label: '',
      render: (row) => (
        <div className="flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); navigate(`/teams/${row.id}/edit`) }}
            className="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id, row.name) }}
            className="text-red-600 hover:text-red-800 text-sm">Delete</button>
        </div>
      )
    },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Teams</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowMerge(true)}
            className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-600 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
            Merge
          </button>
          <button onClick={() => navigate('/teams/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            + Add Team
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          type="text" placeholder="Search teams..." value={search}
          onChange={(e) => { setSearch(e.target.value) }}
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <select value={countryFilter} onChange={(e) => { setCountryFilter(e.target.value) }}
          className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Countries</option>
          {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={teams}
        onRowClick={(t) => navigate(`/teams/${t.id}`)}
        emptyMessage="No teams found"
      />

      {showMerge && <MergeTeamsModal onClose={() => setShowMerge(false)} onMerged={refresh} />}
    </div>
  )
}
