import { useEffect, useState } from 'react'
import { Globe, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { getCountries, createCountry, updateCountry, deleteCountry } from '../api/core'
import CountryFlag from '../components/common/CountryFlag'
import { useToast } from '../context/ToastContext'

const REGIONS = [['ARAB', 'Arab'], ['GCC', 'GCC'], ['OTHER', 'Other']]
const REGION_STYLES = {
  ARAB: 'bg-blue-100 text-blue-700',
  GCC: 'bg-emerald-100 text-emerald-700',
  OTHER: 'bg-gray-100 text-gray-600',
}

const EMPTY = { name: '', code: '', flag_url: '', region: 'ARAB' }

export default function CountriesPage() {
  const toast = useToast()
  const [countries, setCountries] = useState([])
  const [regionFilter, setRegionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null) // 'new' or country id
  const [draft, setDraft] = useState(EMPTY)

  const load = () => {
    getCountries({ with_stats: 1 }).then((res) => setCountries(res.data)).catch(() => {})
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
    if (!window.confirm(`Delete country "${c.name}"? This will fail if swimmers or data reference it.`)) return
    try {
      await deleteCountry(c.id)
      setCountries((prev) => prev.filter((x) => x.id !== c.id))
      toast.success('Country deleted')
    } catch {
      toast.error('Cannot delete: country is referenced by existing data')
    }
  }

  const filtered = countries.filter((c) =>
    (!regionFilter || c.region === regionFilter) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase()))
  )

  const editorRow = (isNew, key) => (
    <tr className="bg-blue-50" key={key}>
      <td className="px-4 py-2">
        <input type="text" value={draft.flag_url} placeholder="alpha-2 (e.g. eg)"
          onChange={(e) => setDraft((d) => ({ ...d, flag_url: e.target.value }))}
          className="border rounded px-2 py-1 text-sm w-24" />
      </td>
      <td className="px-4 py-2">
        <input type="text" value={draft.name} placeholder="Country name" autoFocus
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="border rounded px-2 py-1 text-sm w-full" />
      </td>
      <td className="px-4 py-2">
        <input type="text" value={draft.code} placeholder="EGY" maxLength={3}
          onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))}
          className="border rounded px-2 py-1 text-sm w-20" />
      </td>
      <td className="px-4 py-2">
        <select value={draft.region} onChange={(e) => setDraft((d) => ({ ...d, region: e.target.value }))}
          className="border rounded px-2 py-1 text-sm">
          {REGIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </td>
      <td className="px-4 py-2 text-gray-400 text-sm">{isNew ? '—' : ''}</td>
      <td className="px-4 py-2">
        <div className="flex gap-2 justify-end">
          <button onClick={saveEdit} className="text-emerald-600 hover:text-emerald-800"><Check size={16} /></button>
          <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
      </td>
    </tr>
  )

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Globe size={24} className="text-blue-600" /> Countries
          <span className="text-gray-400 text-lg font-normal">({filtered.length})</span>
        </h1>
        <button onClick={() => { setEditingId('new'); setDraft(EMPTY) }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={16} /> Add Country
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="Search countries..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white" />
        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All Regions</option>
          {REGIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Flag</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Region</th>
              <th className="px-4 py-3">Swimmers</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {editingId === 'new' && editorRow(true, 'new')}
            {filtered.map((c) => (
              editingId === c.id ? (
                editorRow(false, c.id)
              ) : (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <CountryFlag code={c.code} flagUrl={c.flag_url} name="" />
                  </td>
                  <td className="px-4 py-2.5 text-sm font-medium">{c.name}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500">{c.code}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REGION_STYLES[c.region]}`}>
                      {c.region}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-gray-500">{c.swimmers_count ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => startEdit(c)} className="text-blue-600 hover:text-blue-800"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(c)} className="text-red-600 hover:text-red-800"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            ))}
            {filtered.length === 0 && editingId !== 'new' && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No countries found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
