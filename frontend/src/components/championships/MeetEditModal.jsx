import React, { useState, useEffect, useMemo } from 'react'
import { ClipboardList, Waves, ChevronDown } from 'lucide-react'
import { updateChampionship, getAllResults, bulkDeleteResultIds, getClassifications, getSubClassifications } from '../../api/championships'
import { getCountries } from '../../api/core'
import CountryFlag from '../common/CountryFlag'
import { useToast } from '../../context/ToastContext'
import { Button, Modal, ConfirmDialog, Tabs, Badge, Input, Select, SearchInput, FieldLabel, EmptyState, TableSkeleton } from '../ui'

const POOL_TYPES = [
  { value: 'LCM', label: 'Long Course (50m)' },
  { value: 'SCM', label: 'Short Course (25m)' },
]

const FILE_INPUT =
  'w-full text-body-sm text-ink-500 file:me-3 file:py-2 file:px-4 file:rounded-sm file:border-0 ' +
  'file:text-body-sm file:font-medium file:bg-aqua-50 file:text-aqua-600 hover:file:bg-aqua-100'

export default function MeetEditModal({ meet, onClose, onSaved }) {
  const toast = useToast()
  const [activeSection, setActiveSection] = useState('info') // 'info' | 'results'

  // ── Meet Info state ──
  const [countries, setCountries] = useState([])
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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // Load reference data
  useEffect(() => {
    getCountries().then(r => setCountries(r.data)).catch(() => {})
    getClassifications().then(r => setClassifications(r.data)).catch(() => {})
  }, [])

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
        else if (k === 'end_date' || k === 'classification' || k === 'sub_classification') {
          // Allow clearing these nullable fields
          fd.append(k, '')
        }
      })
      if (policyPdf) fd.append('policy_pdf', policyPdf)
      if (meetGuidePdf) fd.append('meet_guide_pdf', meetGuidePdf)
      await updateChampionship(meet.id, fd)
      onSaved()
    } catch {
      toast.error('Failed to save meet info')
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
    setConfirmDeleteOpen(false)
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
      toast.error('Failed to delete results')
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
    <Modal open onClose={onClose} title={`Edit Meet — ${meet.name}`} size="xl">
      {/* Section Tabs */}
      <Tabs
        className="-mx-4 px-4 sm:-mx-5 sm:px-5 mb-5"
        tabs={[
          { key: 'info', label: 'Meet Info', icon: ClipboardList },
          { key: 'results', label: `Results (${totalResults})`, icon: Waves },
        ]}
        active={activeSection}
        onChange={setActiveSection}
      />

      {/* ── MEET INFO SECTION ── */}
      {activeSection === 'info' && (
        <div className="space-y-6">
          {/* Core fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <FieldLabel>Championship Name</FieldLabel>
              <Input value={form.name} onChange={e => handleFormChange('name', e.target.value)} />
            </div>
            <div>
              <FieldLabel>Start Date</FieldLabel>
              <Input type="date" value={form.date} onChange={e => handleFormChange('date', e.target.value)} />
            </div>
            <div>
              <FieldLabel>End Date</FieldLabel>
              <Input type="date" value={form.end_date} onChange={e => handleFormChange('end_date', e.target.value)} />
            </div>
            <div>
              <FieldLabel>Pool</FieldLabel>
              <Select value={form.pool} onChange={e => handleFormChange('pool', e.target.value)}>
                {POOL_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Country</FieldLabel>
              <Select value={form.country} onChange={e => handleFormChange('country', e.target.value)}>
                <option value="">Select country</option>
                {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="md:col-span-2">
              <FieldLabel>Location</FieldLabel>
              <Input value={form.location} onChange={e => handleFormChange('location', e.target.value)}
                placeholder="City or venue name" />
            </div>
          </div>

          {/* Classification */}
          <div>
            <h3 className="text-body font-semibold text-ink-900 mb-3">Classification</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Classification</FieldLabel>
                <Select value={form.classification} onChange={e => handleFormChange('classification', e.target.value)}
                  disabled={!classifications.length}>
                  <option value="">None</option>
                  {classifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel>Sub-Classification</FieldLabel>
                <Select value={form.sub_classification} onChange={e => handleFormChange('sub_classification', e.target.value)}
                  disabled={!form.classification}>
                  <option value="">None</option>
                  {subClassifications.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            </div>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-body font-semibold text-ink-900 mb-3">Links & Documents</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Website</FieldLabel>
                <Input type="url" value={form.website} onChange={e => handleFormChange('website', e.target.value)}
                  placeholder="https://..." />
              </div>
              <div>
                <FieldLabel>Live Results URL</FieldLabel>
                <Input type="url" value={form.live_results_url} onChange={e => handleFormChange('live_results_url', e.target.value)}
                  placeholder="https://..." />
              </div>
              <div>
                <FieldLabel>Registration URL</FieldLabel>
                <Input type="url" value={form.registration_url} onChange={e => handleFormChange('registration_url', e.target.value)}
                  placeholder="https://..." />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <FieldLabel>
                  Entry Pack PDF {meet.meet_guide_pdf && <span className="text-pos ms-1 normal-case">(uploaded)</span>}
                </FieldLabel>
                <input type="file" accept=".pdf" onChange={e => setMeetGuidePdf(e.target.files[0] || null)}
                  className={FILE_INPUT} />
              </div>
              <div>
                <FieldLabel>
                  Policy PDF {meet.policy_pdf && <span className="text-pos ms-1 normal-case">(uploaded)</span>}
                </FieldLabel>
                <input type="file" accept=".pdf" onChange={e => setPolicyPdf(e.target.files[0] || null)}
                  className={FILE_INPUT} />
              </div>
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveInfo} loading={saving} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}

      {/* ── RESULTS SECTION ── */}
      {activeSection === 'results' && (
        <div>
          {loadingResults ? (
            <TableSkeleton rows={6} />
          ) : groups.length === 0 ? (
            <EmptyState icon={Waves} title="No results in this meet" />
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <SearchInput
                  className="flex-1 min-w-[200px]"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search swimmers, clubs, countries..."
                />
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={selectAll}>Select All</Button>
                  {selected.size > 0 && (
                    <Button variant="ghost" size="sm" onClick={deselectAll}>
                      Deselect ({selected.size})
                    </Button>
                  )}
                  {selected.size > 0 && (
                    <Button variant="danger" size="sm" onClick={() => setConfirmDeleteOpen(true)}
                      loading={deleting} disabled={deleting}>
                      {deleting ? 'Deleting...' : `Delete ${selected.size} Selected`}
                    </Button>
                  )}
                </div>
              </div>

              {/* Selected count bar */}
              {selected.size > 0 && (
                <div className="bg-aqua-50 border border-aqua-100 rounded-md px-4 py-2 mb-4 text-body-sm text-ink-900 flex items-center justify-between">
                  <span className="tnum"><strong>{selected.size}</strong> result{selected.size > 1 ? 's' : ''} selected</span>
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

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete selected results"
        message={`Delete ${selected.size} selected result${selected.size > 1 ? 's' : ''}? This cannot be undone.`}
        destructive
        loading={deleting}
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </Modal>
  )
}

function EventGroup({ group, allSelected, someSelected, selectedSet, onToggleAll, onToggleResult }) {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div className="border border-ink-100 rounded-md overflow-hidden">
      {/* Group Header */}
      <div className="flex items-center bg-ink-50 px-4 py-2.5 gap-3 min-h-11">
        <label className="flex items-center shrink-0" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
            onChange={onToggleAll}
            aria-label={`Select all in ${group.label}`}
            className="w-4 h-4 rounded-sm border-ink-200 accent-aqua-600"
          />
        </label>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex-1 flex items-center justify-between min-w-0 text-start min-h-10"
        >
          <div className="min-w-0">
            <span className="text-body-sm font-semibold text-ink-900">{group.label}</span>
            <span className="text-body-sm text-ink-400 ms-2 tnum">{group.results.length} result{group.results.length !== 1 ? 's' : ''}</span>
          </div>
          <ChevronDown size={16} className={`text-ink-400 transition-transform shrink-0 ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* Results Table */}
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="bg-white border-t border-b border-ink-100">
                <th scope="col" className="w-10 px-4 py-1.5"></th>
                <th scope="col" className="px-3 py-1.5 text-start text-label text-ink-400">Swimmer</th>
                <th scope="col" className="px-3 py-1.5 text-start text-label text-ink-400">Nationality</th>
                <th scope="col" className="px-3 py-1.5 text-start text-label text-ink-400">Team</th>
                <th scope="col" className="px-3 py-1.5 text-start text-label text-ink-400">Time</th>
                <th scope="col" className="px-3 py-1.5 text-start text-label text-ink-400">FINA</th>
                <th scope="col" className="px-3 py-1.5 text-start text-label text-ink-400">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {group.results.map((r) => {
                const isChecked = selectedSet.has(r.id)
                return (
                  <tr
                    key={r.id}
                    className={`transition-colors ${isChecked ? 'bg-aqua-50' : 'hover:bg-ink-50'}`}
                  >
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleResult(r.id)}
                        aria-label={`Select ${r.swimmer_name}`}
                        className="w-4 h-4 rounded-sm border-ink-200 accent-aqua-600"
                      />
                    </td>
                    <td className="px-3 py-2 text-body-sm font-medium text-ink-900">
                      {r.swimmer_name}
                      {r.is_relay && <Badge variant="record" className="ms-1.5">Relay</Badge>}
                    </td>
                    <td className="px-3 py-2 text-body-sm">
                      {r.nationality_code ? (
                        <CountryFlag code={r.nationality_code} flagUrl={r.flag_url} name={r.nationality_name} />
                      ) : <span className="text-ink-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-body-sm text-ink-500">{r.team || '—'}</td>
                    <td className="px-3 py-2 text-time text-ink-900">{r.time}</td>
                    <td className="px-3 py-2 text-body-sm text-ink-400 tnum">{r.fina_points || '—'}</td>
                    <td className="px-3 py-2 text-body-sm text-ink-400">{r.category || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
