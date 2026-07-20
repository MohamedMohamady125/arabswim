import React, { useState, useEffect, useMemo } from 'react'
import { updateChampionship, getAllResults, bulkDeleteResultIds, getClassificationCategories, getClassifications, getSubClassifications } from '../../api/championships'
import { getCountries } from '../../api/core'
import CountryFlag from '../common/CountryFlag'

const POOL_TYPES = [
  { value: 'LCM', label: 'Long Course (50m)' },
  { value: 'SCM', label: 'Short Course (25m)' },
]

export default function MeetEditModal({ meet, onClose, onSaved }) {
  const [activeSection, setActiveSection] = useState('info') // 'info' | 'results'

  // ── Meet Info state ──
  const [countries, setCountries] = useState([])
  const [categories, setCategories] = useState([])
  const [classifications, setClassifications] = useState([])
  const [subClassifications, setSubClassifications] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: meet.name || '',
    date: meet.date || '',
    end_date: meet.end_date || '',
    pool: meet.pool || 'LCM',
    country: meet.country || '',
    location: meet.location || '',
    classification_category: meet.classification_category || '',
    classification: meet.classification || '',
    sub_classification: meet.sub_classification || '',
    website: meet.website || '',
    live_results_url: meet.live_results_url || '',
    registration_url: meet.registration_url || '',
  })
  const [policyPdf, setPolicyPdf] = useState(null)
  const [meetGuidePdf, setMeetGuidePdf] = useState(null)

  // ── Results state ──
  const [groups, setGroups] = useState([])   // event groups from all-results
  const [loadingResults, setLoadingResults] = useState(false)
  const [selected, setSelected] = useState(new Set())  // set of result IDs
  const [deleting, setDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Load reference data
  useEffect(() => {
    getCountries().then(r => setCountries(r.data)).catch(() => {})
    getClassificationCategories().then(r => setCategories(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (form.classification_category) {
      getClassifications(form.classification_category).then(r => setClassifications(r.data)).catch(() => {})
    } else {
      setClassifications([])
    }
  }, [form.classification_category])

  useEffect(() => {
    if (form.classification) {
      getSubClassifications(form.classification).then(r => setSubClassifications(r.data)).catch(() => {})
    } else {
      setSubClassifications([])
    }
  }, [form.classification])

  // Load results when results section is activated
  useEffect(() => {
    if (activeSection === 'results' && groups.length === 0) {
      setLoadingResults(true)
      getAllResults(meet.id).then(r => setGroups(r.data)).catch(() => {}).finally(() => setLoadingResults(false))
    }
  }, [activeSection, meet.id])

  const handleFormChange = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'classification_category') {
        next.classification = ''
        next.sub_classification = ''
      }
      if (field === 'classification') {
        next.sub_classification = ''
      }
      return next
    })
  }

  const handleSaveInfo = async () => {
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) fd.append(k, v)
        else if (k === 'end_date' || k === 'classification_category' || k === 'classification' || k === 'sub_classification') {
          // Allow clearing these nullable fields
          fd.append(k, '')
        }
      })
      if (policyPdf) fd.append('policy_pdf', policyPdf)
      if (meetGuidePdf) fd.append('meet_guide_pdf', meetGuidePdf)
      await updateChampionship(meet.id, fd)
      onSaved()
    } catch {
      alert('Failed to save meet info')
    } finally {
      setSaving(false)
    }
  }

  // ── Selection helpers ──
  const toggleResult = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleGroupAll = (group) => {
    const ids = group.results.map(r => r.id)
    const allSelected = ids.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) {
        ids.forEach(id => next.delete(id))
      } else {
        ids.forEach(id => next.add(id))
      }
      return next
    })
  }

  const selectAll = () => {
    const allIds = filteredGroups.flatMap(g => g.results.map(r => r.id))
    setSelected(new Set(allIds))
  }

  const deselectAll = () => setSelected(new Set())

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    if (!window.confirm(`Delete ${selected.size} selected result${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await bulkDeleteResultIds(meet.id, [...selected])
      // Remove deleted results from local state
      setGroups(prev => prev.map(g => ({
        ...g,
        results: g.results.filter(r => !selected.has(r.id))
      })).filter(g => g.results.length > 0))
      setSelected(new Set())
      onSaved()
    } catch {
      alert('Failed to delete results')
    } finally {
      setDeleting(false)
    }
  }

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups
    const q = searchQuery.toLowerCase()
    return groups.map(g => {
      // Check if event name matches
      if (g.label.toLowerCase().includes(q)) return g
      // Otherwise filter results within the group
      const filtered = g.results.filter(r =>
        r.swimmer_name.toLowerCase().includes(q) ||
        r.team.toLowerCase().includes(q) ||
        r.nationality_name.toLowerCase().includes(q)
      )
      if (filtered.length === 0) return null
      return { ...g, results: filtered }
    }).filter(Boolean)
  }, [groups, searchQuery])

  const totalResults = groups.reduce((sum, g) => sum + g.results.length, 0)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Edit Meet</h2>
            <p className="text-sm text-gray-500 mt-0.5">{meet.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2">×</button>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-1 px-5 pt-4 shrink-0">
          {[
            { key: 'info', label: 'Meet Info', icon: '📋' },
            { key: 'results', label: `Results (${totalResults})`, icon: '🏊' },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
                activeSection === s.key
                  ? 'bg-white text-sky-700 border-gray-200'
                  : 'bg-gray-50 text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto border-t">
          {/* ── MEET INFO SECTION ── */}
          {activeSection === 'info' && (
            <div className="p-6 space-y-6">
              {/* Core fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Championship Name</label>
                  <input
                    value={form.name} onChange={e => handleFormChange('name', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input type="date" value={form.date} onChange={e => handleFormChange('date', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input type="date" value={form.end_date} onChange={e => handleFormChange('end_date', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pool</label>
                  <select value={form.pool} onChange={e => handleFormChange('pool', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500">
                    {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <select value={form.country} onChange={e => handleFormChange('country', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500">
                    <option value="">Select country</option>
                    {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input value={form.location} onChange={e => handleFormChange('location', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="City or venue name" />
                </div>
              </div>

              {/* Classification */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Classification</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select value={form.classification_category} onChange={e => handleFormChange('classification_category', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500">
                      <option value="">None</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Classification</label>
                    <select value={form.classification} onChange={e => handleFormChange('classification', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      disabled={!form.classification_category}>
                      <option value="">None</option>
                      {classifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sub-Classification</label>
                    <select value={form.sub_classification} onChange={e => handleFormChange('sub_classification', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      disabled={!form.classification}>
                      <option value="">None</option>
                      {subClassifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Links */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Links & Documents</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                    <input type="url" value={form.website} onChange={e => handleFormChange('website', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" placeholder="https://..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Live Results URL</label>
                    <input type="url" value={form.live_results_url} onChange={e => handleFormChange('live_results_url', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" placeholder="https://..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Registration URL</label>
                    <input type="url" value={form.registration_url} onChange={e => handleFormChange('registration_url', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" placeholder="https://..." />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Entry Pack PDF {meet.meet_guide_pdf && <span className="text-xs text-green-600 ml-1">(uploaded)</span>}
                    </label>
                    <input type="file" accept=".pdf" onChange={e => setMeetGuidePdf(e.target.files[0] || null)}
                      className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Policy PDF {meet.policy_pdf && <span className="text-xs text-green-600 ml-1">(uploaded)</span>}
                    </label>
                    <input type="file" accept=".pdf" onChange={e => setPolicyPdf(e.target.files[0] || null)}
                      className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100" />
                  </div>
                </div>
              </div>

              {/* Save */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveInfo}
                  disabled={saving}
                  className="bg-sky-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* ── RESULTS SECTION ── */}
          {activeSection === 'results' && (
            <div className="p-5">
              {loadingResults ? (
                <div className="py-16 text-center text-gray-400">Loading all results...</div>
              ) : groups.length === 0 ? (
                <div className="py-16 text-center text-gray-400">No results in this meet</div>
              ) : (
                <>
                  {/* Toolbar */}
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search swimmers, clubs, countries..."
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={selectAll}
                        className="text-xs px-3 py-2 rounded-lg border border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100 font-medium transition-colors">
                        Select All
                      </button>
                      {selected.size > 0 && (
                        <button onClick={deselectAll}
                          className="text-xs px-3 py-2 rounded-lg border text-gray-600 hover:bg-gray-50 font-medium transition-colors">
                          Deselect ({selected.size})
                        </button>
                      )}
                      {selected.size > 0 && (
                        <button
                          onClick={handleBulkDelete}
                          disabled={deleting}
                          className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium transition-colors disabled:opacity-50"
                        >
                          {deleting ? 'Deleting...' : `Delete ${selected.size} Selected`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Selected count bar */}
                  {selected.size > 0 && (
                    <div className="bg-sky-50 border border-sky-200 rounded-lg px-4 py-2 mb-4 text-sm text-sky-800 flex items-center justify-between">
                      <span><strong>{selected.size}</strong> result{selected.size > 1 ? 's' : ''} selected</span>
                    </div>
                  )}

                  {/* Event Groups */}
                  <div className="space-y-3">
                    {filteredGroups.map(group => {
                      const groupIds = group.results.map(r => r.id)
                      const allGroupSelected = groupIds.length > 0 && groupIds.every(id => selected.has(id))
                      const someGroupSelected = groupIds.some(id => selected.has(id))
                      return (
                        <EventGroup
                          key={`${group.event_id}-${group.gender}-${group.round_type}`}
                          group={group}
                          allSelected={allGroupSelected}
                          someSelected={someGroupSelected}
                          selectedSet={selected}
                          onToggleAll={() => toggleGroupAll(group)}
                          onToggleResult={toggleResult}
                        />
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EventGroup({ group, allSelected, someSelected, selectedSet, onToggleAll, onToggleResult }) {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Group Header */}
      <div className="flex items-center bg-gray-50 px-4 py-2.5 gap-3">
        <label className="flex items-center shrink-0" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
            onChange={onToggleAll}
            className="w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
          />
        </label>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex-1 flex items-center justify-between min-w-0 text-left"
        >
          <div className="min-w-0">
            <span className="text-sm font-semibold text-gray-800">{group.label}</span>
            <span className="text-xs text-gray-500 ml-2">{group.results.length} result{group.results.length !== 1 ? 's' : ''}</span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${collapsed ? '' : 'rotate-180'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Results Table */}
      {!collapsed && (
        <table className="w-full">
          <thead>
            <tr className="bg-white border-t border-b">
              <th className="w-10 px-4 py-1.5"></th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">Swimmer</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">Nationality</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">Team</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">Time</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">FINA</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {group.results.map((r, i) => {
              const isChecked = selectedSet.has(r.id)
              return (
                <tr
                  key={r.id}
                  className={`transition-colors ${isChecked ? 'bg-sky-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleResult(r.id)}
                      className="w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-sm font-medium text-gray-800">
                    {r.swimmer_name}
                    {r.is_relay && <span className="ml-1 text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-medium">Relay</span>}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {r.nationality_code ? (
                      <CountryFlag code={r.nationality_code} flagUrl={r.flag_url} name={r.nationality_name} />
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600">{r.team || '—'}</td>
                  <td className="px-3 py-2 text-sm font-mono font-semibold">{r.time}</td>
                  <td className="px-3 py-2 text-sm text-gray-500">{r.fina_points || '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-500">{r.category || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
