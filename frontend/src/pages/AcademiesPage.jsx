import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { School, Plus, Pencil, Trash2, Phone, Mail, Globe, AtSign, MapPin } from 'lucide-react'
import { getAcademies, deleteAcademy } from '../api/academies'
import { getCountries } from '../api/core'
import CountryFlag from '../components/common/CountryFlag'
import { useToast } from '../context/ToastContext'

export default function AcademiesPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [academies, setAcademies] = useState([])
  const [countries, setCountries] = useState([])
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('')

  useEffect(() => {
    getCountries().then((res) => setCountries(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const params = { search: search || undefined, country: countryFilter || undefined, page_size: 100 }
    getAcademies(params).then((res) => {
      setAcademies(Array.isArray(res.data) ? res.data : res.data.results || [])
    }).catch(() => {})
  }, [search, countryFilter])

  const handleDelete = async (a) => {
    if (!window.confirm(`Delete academy "${a.name}"?`)) return
    try {
      await deleteAcademy(a.id)
      setAcademies((prev) => prev.filter((x) => x.id !== a.id))
      toast.success('Academy deleted')
    } catch {
      toast.error('Failed to delete academy')
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <School size={24} className="text-blue-600" /> Academies
          <span className="text-gray-400 text-lg font-normal">({academies.length})</span>
        </h1>
        <button onClick={() => navigate('/academies/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={16} /> Add Academy
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <input type="text" placeholder="Search by name or city..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white" />
        <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All Countries</option>
          {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {academies.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          No academies yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {academies.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                  {a.logo ? (
                    <img src={a.logo} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <School size={22} className="text-gray-300" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm cursor-pointer hover:text-blue-600 truncate"
                    onClick={() => navigate(`/academies/${a.id}/edit`)}>{a.name}</h3>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    {a.country_detail && (
                      <CountryFlag code={a.country_detail.code} flagUrl={a.country_detail.flag_url}
                        name={a.city ? `${a.city}, ${a.country_detail.name}` : a.country_detail.name} />
                    )}
                  </div>
                  {!a.is_active && (
                    <span className="inline-block mt-1 bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[10px]">Inactive</span>
                  )}
                </div>
              </div>
              {a.description && <p className="text-xs text-gray-500 mt-3 line-clamp-2">{a.description}</p>}
              <div className="flex items-center gap-3 mt-3 text-gray-400">
                {a.phone && <a href={`tel:${a.phone}`} title={a.phone} className="hover:text-blue-600"><Phone size={14} /></a>}
                {a.email && <a href={`mailto:${a.email}`} title={a.email} className="hover:text-blue-600"><Mail size={14} /></a>}
                {a.website && <a href={a.website} target="_blank" rel="noreferrer" title={a.website} className="hover:text-blue-600"><Globe size={14} /></a>}
                {a.instagram && (
                  <a href={`https://instagram.com/${a.instagram.replace('@', '')}`} target="_blank" rel="noreferrer"
                    title={a.instagram} className="hover:text-blue-600"><AtSign size={14} /></a>
                )}
                {a.address && <span title={a.address}><MapPin size={14} /></span>}
              </div>
              <div className="flex justify-end gap-3 mt-3 pt-3 border-t border-gray-100">
                <button onClick={() => navigate(`/academies/${a.id}/edit`)}
                  className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1">
                  <Pencil size={13} /> Edit
                </button>
                <button onClick={() => handleDelete(a)}
                  className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1">
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
