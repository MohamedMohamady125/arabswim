import { useEffect, useState } from 'react'
import { Handshake, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { getSponsors, deleteSponsor, createSponsor, updateSponsor } from '../api/sponsors'
import { useToast } from '../context/ToastContext'

function SponsorModal({ sponsor, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = Boolean(sponsor?.id)
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(sponsor?.logo || null)
  const [form, setForm] = useState({
    name: sponsor?.name || '',
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
      toast.success(isEdit ? 'Partner updated' : 'Partner created')
      onSaved()
    } catch {
      toast.error('Failed to save partner')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold">{isEdit ? 'Edit Partner' : 'Add Partner'}</h2>
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
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Partner name" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select value={String(form.is_active)} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Website</label>
            <input type="url" value={form.website} onChange={set('website')}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://..." />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea value={form.description} onChange={set('description')} rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Brief description of the partner..." />
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
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Partner'}
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
  const [showSponsorModal, setShowSponsorModal] = useState(null)

  const load = () => {
    getSponsors({ page_size: 200 }).then(res => {
      setSponsors(Array.isArray(res.data) ? res.data : res.data.results || [])
    }).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (s) => {
    if (!window.confirm(`Delete partner "${s.name}"?`)) return
    try {
      await deleteSponsor(s.id)
      setSponsors(prev => prev.filter(x => x.id !== s.id))
      toast.success('Partner deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Handshake size={24} className="text-blue-600" /> Partnerships
          <span className="text-gray-400 text-lg font-normal">({sponsors.length})</span>
        </h1>
        <button onClick={() => setShowSponsorModal({})}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={16} /> Add Partner
        </button>
      </div>

      {/* Sponsors grid */}
      {sponsors.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <Handshake size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No partnerships yet</p>
          <p className="text-sm mt-1">Add your first partner above</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {sponsors.map(s => (
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
      )}

      {/* Modal */}
      {showSponsorModal !== null && (
        <SponsorModal
          sponsor={showSponsorModal.id ? showSponsorModal : null}
          onClose={() => setShowSponsorModal(null)}
          onSaved={() => { setShowSponsorModal(null); load() }}
        />
      )}
    </div>
  )
}
