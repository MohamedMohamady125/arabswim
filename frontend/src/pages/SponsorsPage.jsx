import { useEffect, useState } from 'react'
import { Handshake, Plus, Pencil, Trash2, Globe, ExternalLink, GripVertical } from 'lucide-react'
import { getSponsors, deleteSponsor, getSponsorTiers, createSponsorTier, deleteSponsorTier, createSponsor, updateSponsor } from '../api/sponsors'
import { useToast } from '../context/ToastContext'

function SponsorModal({ sponsor, tiers, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = Boolean(sponsor?.id)
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(sponsor?.logo || null)
  const [form, setForm] = useState({
    name: sponsor?.name || '',
    tier: sponsor?.tier || '',
    description: sponsor?.description || '',
    website: sponsor?.website || '',
    is_active: sponsor?.is_active ?? true,
    sort_order: sponsor?.sort_order ?? 0,
  })

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => { if (v !== '' && v !== null) fd.append(k, v) })
      if (logoFile) fd.append('logo', logoFile)
      if (isEdit) await updateSponsor(sponsor.id, fd)
      else await createSponsor(fd)
      toast.success(isEdit ? 'Sponsor updated' : 'Sponsor created')
      onSaved()
    } catch {
      toast.error('Failed to save sponsor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold">{isEdit ? 'Edit Sponsor' : 'Add Sponsor'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <label className="w-20 h-20 rounded-xl bg-gray-50 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden cursor-pointer shrink-0 relative">
              {logoPreview ? (
                <img src={logoPreview} alt="" className="w-full h-full object-contain p-1" />
              ) : (
                <div className="text-center text-gray-400 text-[10px]">Logo</div>
              )}
              <input type="file" accept="image/*" onChange={e => {
                const f = e.target.files?.[0]
                if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)) }
              }} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input type="text" value={form.name} onChange={set('name')}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Sponsor name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tier</label>
              <select value={form.tier} onChange={set('tier')} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">— None —</option>
                {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select value={String(form.is_active)} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Website</label>
            <input type="url" value={form.website} onChange={set('website')}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://..." />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea value={form.description} onChange={set('description')} rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Brief description of the sponsor..." />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Sort Order</label>
            <input type="number" value={form.sort_order} onChange={set('sort_order')}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Sponsor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TierModal({ onClose, onSaved }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      await createSponsorTier({ name: name.trim(), sort_order: sortOrder })
      toast.success('Tier created')
      onSaved()
    } catch {
      toast.error('Failed to create tier')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold">Add Tier</h2>
          <p className="text-xs text-gray-500 mt-1">E.g. Main Partner, Official Partner, Official Supplier</p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Tier name" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Sort Order</label>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SponsorsPage() {
  const toast = useToast()
  const [sponsors, setSponsors] = useState([])
  const [tiers, setTiers] = useState([])
  const [showSponsorModal, setShowSponsorModal] = useState(null) // null=closed, {}=new, {id,...}=edit
  const [showTierModal, setShowTierModal] = useState(false)

  const load = () => {
    getSponsors({ page_size: 200 }).then(res => {
      setSponsors(Array.isArray(res.data) ? res.data : res.data.results || [])
    }).catch(() => {})
    getSponsorTiers().then(res => setTiers(res.data)).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (s) => {
    if (!window.confirm(`Delete sponsor "${s.name}"?`)) return
    try {
      await deleteSponsor(s.id)
      setSponsors(prev => prev.filter(x => x.id !== s.id))
      toast.success('Sponsor deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  const handleDeleteTier = async (t) => {
    if (!window.confirm(`Delete tier "${t.name}"? Sponsors in this tier will become uncategorized.`)) return
    try {
      await deleteSponsorTier(t.id)
      toast.success('Tier deleted')
      load()
    } catch {
      toast.error('Failed to delete tier')
    }
  }

  // Group sponsors by tier
  const grouped = []
  const tierMap = {}
  for (const t of tiers) tierMap[t.id] = { ...t, sponsors: [] }
  const uncategorized = []
  for (const s of sponsors) {
    if (s.tier && tierMap[s.tier]) tierMap[s.tier].sponsors.push(s)
    else uncategorized.push(s)
  }
  for (const t of tiers) {
    if (tierMap[t.id].sponsors.length > 0) grouped.push(tierMap[t.id])
  }
  if (uncategorized.length > 0) grouped.push({ id: null, name: 'Other Partners', sponsors: uncategorized })

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Handshake size={24} className="text-blue-600" /> Sponsors & Partners
          <span className="text-gray-400 text-lg font-normal">({sponsors.length})</span>
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTierModal(true)}
            className="flex items-center gap-1.5 border border-gray-300 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
            <GripVertical size={14} /> Manage Tiers
          </button>
          <button onClick={() => setShowSponsorModal({})}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            <Plus size={16} /> Add Sponsor
          </button>
        </div>
      </div>

      {/* Tiers list */}
      {tiers.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {tiers.map(t => (
            <span key={t.id} className="inline-flex items-center gap-1.5 bg-gray-100 px-3 py-1.5 rounded-full text-xs font-medium text-gray-700">
              {t.name}
              <button onClick={() => handleDeleteTier(t)} className="text-gray-400 hover:text-red-500 ml-0.5" title="Delete tier">&times;</button>
            </span>
          ))}
        </div>
      )}

      {/* Sponsors grouped by tier — World Aquatics style */}
      {sponsors.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <Handshake size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No sponsors yet</p>
          <p className="text-sm mt-1">Add your first sponsor or partner above</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(group => (
            <div key={group.id ?? 'other'}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">{group.name}</h2>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {group.sponsors.map(s => (
                  <div key={s.id} className={`group bg-white rounded-xl border overflow-hidden transition-shadow hover:shadow-lg ${!s.is_active ? 'opacity-50' : ''}`}>
                    {/* Logo area */}
                    <div className="h-32 bg-gray-50 flex items-center justify-center p-4 border-b">
                      {s.logo ? (
                        <img src={s.logo} alt={s.name} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <div className="text-gray-300 text-center">
                          <Handshake size={32} className="mx-auto" />
                          <div className="text-xs mt-1">No logo</div>
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <h3 className="font-semibold text-sm truncate">{s.name}</h3>
                      {s.tier_detail && (
                        <span className="text-[10px] text-blue-600 font-medium">{s.tier_detail.name}</span>
                      )}
                      {s.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>
                      )}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                          {s.website && (
                            <a href={s.website} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-blue-600" title="Visit website">
                              <ExternalLink size={13} />
                            </a>
                          )}
                          {!s.is_active && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Inactive</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setShowSponsorModal(s)} className="text-blue-600 hover:text-blue-800" title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDelete(s)} className="text-red-500 hover:text-red-700" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showSponsorModal !== null && (
        <SponsorModal
          sponsor={showSponsorModal.id ? showSponsorModal : null}
          tiers={tiers}
          onClose={() => setShowSponsorModal(null)}
          onSaved={() => { setShowSponsorModal(null); load() }}
        />
      )}
      {showTierModal && (
        <TierModal
          onClose={() => setShowTierModal(false)}
          onSaved={() => { setShowTierModal(false); load() }}
        />
      )}
    </div>
  )
}
