import { useEffect, useState } from 'react'
import { Handshake, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { getSponsors, deleteSponsor, createSponsor, updateSponsor } from '../api/sponsors'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { Button, Badge, Modal, Input, Select, Textarea, FieldLabel, EmptyState, ConfirmDialog, CardsSkeleton, PageHeader } from '../components/ui'

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
    <Modal open onClose={onClose} title={isEdit ? 'Edit Partner' : 'Add Partner'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <label className="w-20 h-20 rounded-md bg-ink-50 border-2 border-dashed border-ink-200 flex items-center justify-center overflow-hidden cursor-pointer shrink-0 relative">
            {logoPreview ? (
              <img src={logoPreview} alt="" className="w-full h-full object-contain p-1" />
            ) : (
              <span className="text-label text-ink-400">Logo</span>
            )}
            <input type="file" accept="image/*" onChange={e => {
              const f = e.target.files?.[0]
              if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)) }
            }} className="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
          <div className="flex-1">
            <FieldLabel required>Name</FieldLabel>
            <Input type="text" value={form.name} onChange={set('name')} placeholder="Partner name" />
          </div>
        </div>

        <div>
          <FieldLabel>Status</FieldLabel>
          <Select value={String(form.is_active)} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </div>

        <div>
          <FieldLabel>Website</FieldLabel>
          <Input type="url" value={form.website} onChange={set('website')} placeholder="https://..." />
        </div>

        <div>
          <FieldLabel>Description</FieldLabel>
          <Textarea value={form.description} onChange={set('description')} rows={3}
            placeholder="Brief description of the partner..." />
        </div>

        <div>
          <FieldLabel>Sort Order</FieldLabel>
          <Input type="number" value={form.sort_order} onChange={set('sort_order')} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{isEdit ? 'Save Changes' : 'Add Partner'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function SponsorsPage() {
  const toast = useToast()
  const { token } = useAuth()
  const isAdmin = !!token
  const [sponsors, setSponsors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSponsorModal, setShowSponsorModal] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  const load = () => {
    getSponsors({ page_size: 200 }).then(res => {
      setSponsors(Array.isArray(res.data) ? res.data : res.data.results || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (s) => {
    try {
      await deleteSponsor(s.id)
      setSponsors(prev => prev.filter(x => x.id !== s.id))
      toast.success('Partner deleted')
    } catch {
      toast.error('Failed to delete')
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      <PageHeader
        title="Partnerships"
        subtitle={`${sponsors.length} partner${sponsors.length === 1 ? '' : 's'} supporting Arab swimming`}
        action={isAdmin && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setShowSponsorModal({})}>
            Add Partner
          </Button>
        )}
      />

      {loading ? (
        <CardsSkeleton count={8} />
      ) : sponsors.length === 0 ? (
        <div className="bg-white rounded-md shadow-card border border-ink-100">
          <EmptyState icon={Handshake} title="No partnerships yet" hint="Our partners will be featured here." />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
          {sponsors.map(s => (
            <article key={s.id}
              className={`group bg-white rounded-md shadow-card border border-ink-100 overflow-hidden transition-colors hover:border-aqua-500/40 ${!s.is_active ? 'opacity-50' : ''}`}>
              {/* Logo on white */}
              <div className="h-32 bg-white flex items-center justify-center p-5 border-b border-ink-100">
                {s.logo ? (
                  <img src={s.logo} alt={s.name} className="max-h-full max-w-full object-contain" />
                ) : (
                  <div className="text-ink-200 text-center">
                    <Handshake size={32} className="mx-auto" />
                    <div className="text-label mt-1">No logo</div>
                  </div>
                )}
              </div>
              {/* Info */}
              <div className="p-3">
                <h3 className="text-body-sm font-semibold text-ink-900 truncate">{s.name}</h3>
                {s.description && (
                  <p className="text-body-sm text-ink-500 mt-1 line-clamp-2">{s.description}</p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mt-2 pt-2 border-t border-ink-100 min-h-10">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    {s.website && (
                      <a href={s.website} target="_blank" rel="noreferrer" aria-label={`Visit ${s.name} website`}
                        className="inline-flex items-center gap-1 text-body-sm text-aqua-600 hover:text-ink-900 min-h-10">
                        <ExternalLink size={13} /> Website
                      </a>
                    )}
                    {!s.is_active && <Badge variant="status">Inactive</Badge>}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" icon={Pencil} aria-label="Edit partner"
                        onClick={() => setShowSponsorModal(s)} />
                      <Button variant="ghost" size="sm" icon={Trash2} aria-label="Delete partner"
                        className="hover:text-neg" onClick={() => setPendingDelete(s)} />
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {showSponsorModal !== null && (
        <SponsorModal
          sponsor={showSponsorModal.id ? showSponsorModal : null}
          onClose={() => setShowSponsorModal(null)}
          onSaved={() => { setShowSponsorModal(null); load() }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete partner"
        message={pendingDelete ? `Delete partner "${pendingDelete.name}"?` : ''}
        destructive
        onConfirm={() => handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
