import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Globe, Plus, Pencil, Trash2, Users } from 'lucide-react'
import { getCountries, createCountry, updateCountry, deleteCountry } from '../api/core'
import { CODE_TO_ALPHA2 } from '../components/common/CountryFlag'
import { PageHeader, FilterBar, SearchInput, Select, Button, Badge, Modal, ConfirmDialog, EmptyState, FieldLabel, Input, CardsSkeleton } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const REGIONS = [['ARAB', 'Arab'], ['GCC', 'GCC'], ['OTHER', 'Other']]

const EMPTY = { name: '', code: '', flag_url: '', region: 'ARAB' }

export default function CountriesPage() {
  const toast = useToast()
  const { token } = useAuth()
  const isAdmin = !!token
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [regionFilter, setRegionFilter] = useState('ARAB_ALL')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null) // 'new' or country id
  const [draft, setDraft] = useState(EMPTY)
  const [pendingDelete, setPendingDelete] = useState(null)

  const load = () => {
    getCountries({ with_stats: 1 })
      .then((res) => setCountries(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const startEdit = (c) => {
    setEditingId(c.id)
    setDraft({ name: c.name, code: c.code, flag_url: c.flag_url || '', region: c.region })
  }

  const cancelEdit = () => { setEditingId(null); setDraft(EMPTY) }

  const saveEdit = async () => {
    if (!draft.name.trim() || !draft.code.trim()) { toast.error('Name and code are required'); return }
    try {
      if (editingId === 'new') {
        await createCountry(draft)
        toast.success('Country added')
      } else {
        await updateCountry(editingId, draft)
        toast.success('Country updated')
      }
      cancelEdit()
      load()
    } catch (err) {
      const data = err.response?.data
      toast.error(data ? Object.values(data).flat().join(' ') : 'Failed to save country')
    }
  }

  const handleDelete = async (c) => {
    try {
      await deleteCountry(c.id)
      setCountries((prev) => prev.filter((x) => x.id !== c.id))
      toast.success('Country deleted')
    } catch {
      toast.error('Cannot delete: country is referenced by existing data')
    }
  }

  const filtered = countries.filter((c) => {
    const regionMatch = !regionFilter
      || (regionFilter === 'ARAB_ALL' && (c.region === 'ARAB' || c.region === 'GCC'))
      || c.region === regionFilter
    return regionMatch && (!search || c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase()))
  })

  const chips = [
    regionFilter && {
      key: 'region',
      label: regionFilter === 'ARAB_ALL' ? 'Arab' : 'Other',
      onRemove: () => setRegionFilter(''),
    },
    search && { key: 'search', label: `"${search}"`, onRemove: () => setSearch('') },
  ].filter(Boolean)

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Federations"
        subtitle={`${filtered.length} national swimming federations`}
        action={isAdmin && (
          <Button icon={Plus} onClick={() => { setEditingId('new'); setDraft(EMPTY) }}>
            Add Country
          </Button>
        )}
      />

      <FilterBar chips={chips} onReset={() => { setSearch(''); setRegionFilter('') }}>
        <SearchInput
          placeholder="Search countries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-64"
          aria-label="Search countries"
        />
        <Select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}
          className="w-full md:w-44" aria-label="Region">
          <option value="">All Regions</option>
          <option value="ARAB_ALL">Arab</option>
          <option value="OTHER">Other</option>
        </Select>
      </FilterBar>

      {loading ? (
        <CardsSkeleton count={8} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Globe} title="No countries found" hint="Try a different search or region filter" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4">
          {filtered.map((c) => {
            const alpha2 = c.flag_url || CODE_TO_ALPHA2[c.code?.toUpperCase()] || (c.code || '').toLowerCase().slice(0, 2)
            return (
              <div key={c.id}
                className="relative bg-white rounded-md shadow-card border border-ink-100 hover:border-aqua-500/40 hover:bg-aqua-50/40 transition-colors">
                <Link to={`/countries/${c.id}`} className="block p-3 sm:p-4">
                  <img
                    src={`https://flagcdn.com/80x60/${alpha2}.png`}
                    srcSet={`https://flagcdn.com/160x120/${alpha2}.png 2x`}
                    alt=""
                    className="w-20 h-[60px] object-contain rounded-sm border border-ink-100 mb-2.5 sm:mb-3"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                  <div className="text-body font-semibold text-ink-900 truncate">{c.name}</div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-label text-ink-400">{c.code}</span>
                    <Badge variant={c.region === 'OTHER' ? 'status' : 'aqua'}>
                      {c.region === 'OTHER' ? 'Other' : 'Arab'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 text-body-sm text-ink-500">
                    <Users size={14} className="text-ink-400" />
                    <span className="tnum">{c.swimmers_count ?? '—'}</span> swimmers
                  </div>
                </Link>
                {isAdmin && (
                  <div className="absolute top-2 end-2 flex gap-1">
                    <Button variant="ghost" size="sm" icon={Pencil} aria-label={`Edit ${c.name}`}
                      className="!min-w-0 !px-2" onClick={() => startEdit(c)} />
                    <Button variant="ghost" size="sm" icon={Trash2} aria-label={`Delete ${c.name}`}
                      className="!min-w-0 !px-2 hover:!text-neg" onClick={() => setPendingDelete(c)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Admin: add / edit country */}
      <Modal
        open={isAdmin && editingId !== null}
        onClose={cancelEdit}
        title={editingId === 'new' ? 'Add Country' : 'Edit Country'}
        size="md"
      >
        <div className="space-y-3">
          <div>
            <FieldLabel required>Country name</FieldLabel>
            <Input type="text" value={draft.name} placeholder="Country name" autoFocus
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Code</FieldLabel>
              <Input type="text" value={draft.code} placeholder="EGY" maxLength={3}
                onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <FieldLabel>Flag (alpha-2)</FieldLabel>
              <Input type="text" value={draft.flag_url} placeholder="e.g. eg"
                onChange={(e) => setDraft((d) => ({ ...d, flag_url: e.target.value }))} />
            </div>
          </div>
          <div>
            <FieldLabel>Region</FieldLabel>
            <Select value={draft.region} onChange={(e) => setDraft((d) => ({ ...d, region: e.target.value }))}>
              {REGIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={cancelEdit}>Cancel</Button>
            <Button onClick={saveEdit}>{editingId === 'new' ? 'Add Country' : 'Save Changes'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete "${pendingDelete?.name}"?`}
        message="This will fail if swimmers or data reference it."
        destructive
        onConfirm={async () => { const c = pendingDelete; setPendingDelete(null); await handleDelete(c) }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
