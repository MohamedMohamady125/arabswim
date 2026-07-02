import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crown, Plus, Pencil, Trash2, User, ExternalLink } from 'lucide-react'
import { getInductees, deleteInductee } from '../api/fame'
import CountryFlag from '../components/common/CountryFlag'
import { useToast } from '../context/ToastContext'

export default function HallOfFamePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [inductees, setInductees] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    getInductees({ search: search || undefined }).then((res) => {
      setInductees(Array.isArray(res.data) ? res.data : res.data.results || [])
    }).catch(() => {})
  }, [search])

  const handleDelete = async (i) => {
    if (!window.confirm(`Remove "${i.name}" from the Hall of Fame?`)) return
    try {
      await deleteInductee(i.id)
      setInductees((prev) => prev.filter((x) => x.id !== i.id))
      toast.success('Inductee removed')
    } catch {
      toast.error('Failed to remove inductee')
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Crown size={24} className="text-amber-500" /> Hall of Fame
          <span className="text-gray-400 text-lg font-normal">({inductees.length})</span>
        </h1>
        <button onClick={() => navigate('/hall-of-fame/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={16} /> Add Inductee
        </button>
      </div>

      <input type="text" placeholder="Search inductees..." value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm bg-white mb-5" />

      {inductees.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          No inductees yet. Honor the legends.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {inductees.map((i) => {
            const photo = i.photo || i.swimmer_detail?.photo
            return (
              <div key={i.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className="bg-gradient-to-br from-amber-50 to-white p-5 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gray-100 ring-2 ring-amber-300 overflow-hidden flex items-center justify-center shrink-0">
                    {photo ? (
                      <img src={photo} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User size={24} className="text-gray-300" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm cursor-pointer hover:text-blue-600 truncate"
                      onClick={() => navigate(`/hall-of-fame/${i.id}/edit`)}>{i.name}</h3>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {i.country_detail && (
                        <CountryFlag code={i.country_detail.code} flagUrl={i.country_detail.flag_url} name={i.country_detail.name} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {i.era && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-medium">{i.era}</span>}
                      {i.inducted_year && <span className="text-[10px] text-gray-400">Inducted {i.inducted_year}</span>}
                    </div>
                  </div>
                </div>
                <div className="px-5 pb-4">
                  {i.achievements && <p className="text-xs text-gray-500 line-clamp-3">{i.achievements}</p>}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    {i.swimmer ? (
                      <button onClick={() => navigate(`/swimmers/${i.swimmer}`)}
                        className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1">
                        <ExternalLink size={12} /> Swimmer profile
                      </button>
                    ) : <span className="text-[10px] text-gray-300">Standalone legend</span>}
                    <div className="flex gap-3">
                      <button onClick={() => navigate(`/hall-of-fame/${i.id}/edit`)}
                        className="text-blue-600 hover:text-blue-800"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(i)}
                        className="text-red-600 hover:text-red-800"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
