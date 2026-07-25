import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserCheck, Plus, MapPin, Briefcase, Award, Mail, Phone, FileText, AtSign, ExternalLink } from 'lucide-react'
import { getCoaches, deleteCoach } from '../api/coaches'
import { getCountries } from '../api/core'
import CountryFlag from '../components/common/CountryFlag'
import { useToast } from '../context/ToastContext'

const LEVEL_LABELS = {
  HEAD: 'Head Coach',
  ASSISTANT: 'Assistant Coach',
  TECHNIQUE: 'Technique Coach',
  FITNESS: 'Fitness / S&C Coach',
  YOUTH: 'Youth Development',
  PRIVATE: 'Private Coach',
}

const LEVEL_COLORS = {
  HEAD: 'bg-blue-100 text-blue-700',
  ASSISTANT: 'bg-sky-100 text-sky-700',
  TECHNIQUE: 'bg-purple-100 text-purple-700',
  FITNESS: 'bg-emerald-100 text-emerald-700',
  YOUTH: 'bg-amber-100 text-amber-700',
  PRIVATE: 'bg-gray-100 text-gray-600',
}

export default function CoachesPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [coaches, setCoaches] = useState([])
  const [countries, setCountries] = useState([])
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    getCountries().then(res => setCountries(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const params = {
      search: search || undefined,
      country: countryFilter || undefined,
      level: levelFilter || undefined,
      page_size: 200,
    }
    getCoaches(params).then(res => {
      setCoaches(Array.isArray(res.data) ? res.data : res.data.results || [])
    }).catch(() => {})
  }, [search, countryFilter, levelFilter])

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete coach "${c.name}"?`)) return
    try {
      await deleteCoach(c.id)
      setCoaches(prev => prev.filter(x => x.id !== c.id))
      toast.success('Coach deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCheck size={24} className="text-blue-600" /> Coaches
          <span className="text-gray-400 text-lg font-normal">({coaches.length})</span>
        </h1>
        <button onClick={() => navigate('/coaches/new')}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={16} /> Add Coach
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input type="text" placeholder="Search by name, club, specialty..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border rounded-lg px-3 py-2 text-sm bg-white" />
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All Countries</option>
          {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All Levels</option>
          {Object.entries(LEVEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Coach Cards */}
      {coaches.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <UserCheck size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No coaches yet</p>
          <p className="text-sm mt-1">Add coaches to build the coaching directory</p>
        </div>
      ) : (
        <div className="space-y-4">
          {coaches.map(c => {
            const isExpanded = expandedId === c.id
            const specializations = c.specializations ? c.specializations.split(',').map(s => s.trim()).filter(Boolean) : []
            const certifications = c.certifications ? c.certifications.split('\n').map(s => s.trim()).filter(Boolean) : []
            const achievements = c.achievements ? c.achievements.split('\n').map(s => s.trim()).filter(Boolean) : []

            return (
              <div key={c.id} className={`bg-white rounded-xl border overflow-hidden transition-shadow hover:shadow-md ${!c.is_active ? 'opacity-60' : ''}`}>
                {/* Main card row */}
                <div className="flex items-start gap-4 p-5 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                  {/* Photo */}
                  <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center overflow-hidden shrink-0">
                    {c.photo ? (
                      <img src={c.photo} alt={c.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-blue-300">
                        {c.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base">{c.name}</h3>
                      {c.level && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${LEVEL_COLORS[c.level] || 'bg-gray-100 text-gray-600'}`}>
                          {LEVEL_LABELS[c.level] || c.level}
                        </span>
                      )}
                      {c.is_available && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          Open to offers
                        </span>
                      )}
                      {!c.is_active && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500 flex-wrap">
                      {c.nationality_detail && (
                        <span className="flex items-center gap-1">
                          <CountryFlag code={c.nationality_detail.code} flagUrl={c.nationality_detail.flag_url} name={c.nationality_detail.name} />
                        </span>
                      )}
                      {c.city && (
                        <span className="flex items-center gap-1"><MapPin size={12} /> {c.city}</span>
                      )}
                      {c.current_club && (
                        <span className="flex items-center gap-1"><Briefcase size={12} /> {c.current_club}</span>
                      )}
                      {c.years_experience && (
                        <span className="flex items-center gap-1"><Award size={12} /> {c.years_experience} yrs experience</span>
                      )}
                    </div>

                    {/* Specializations tags */}
                    {specializations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {specializations.map((s, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 font-medium">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: actions + expand arrow */}
                  <div className="flex items-center gap-3 shrink-0">
                    {c.cv_file && (
                      <a href={c.cv_file} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1.5 rounded-lg font-medium">
                        <FileText size={13} /> CV
                      </a>
                    )}
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t bg-gray-50/50 px-5 py-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Left: Bio + Achievements */}
                      <div className="space-y-4">
                        {c.bio && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-gray-400 mb-1.5">About</h4>
                            <p className="text-sm text-gray-700 whitespace-pre-line">{c.bio}</p>
                          </div>
                        )}
                        {achievements.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-gray-400 mb-1.5">Achievements</h4>
                            <ul className="space-y-1">
                              {achievements.map((a, i) => (
                                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                  <span className="text-blue-500 mt-1 shrink-0">&#9679;</span> {a}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Right: Certifications + Contact */}
                      <div className="space-y-4">
                        {certifications.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-gray-400 mb-1.5">Certifications</h4>
                            <div className="space-y-1">
                              {certifications.map((cert, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                                  <Award size={13} className="text-amber-500 shrink-0" /> {cert}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Contact */}
                        {(c.email || c.phone || c.instagram || c.linkedin) && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-gray-400 mb-1.5">Contact</h4>
                            <div className="space-y-1.5">
                              {c.email && (
                                <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600">
                                  <Mail size={13} className="text-gray-400" /> {c.email}
                                </a>
                              )}
                              {c.phone && (
                                <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600">
                                  <Phone size={13} className="text-gray-400" /> {c.phone}
                                </a>
                              )}
                              {c.instagram && (
                                <a href={`https://instagram.com/${c.instagram.replace('@', '')}`} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600">
                                  <AtSign size={13} className="text-gray-400" /> {c.instagram}
                                </a>
                              )}
                              {c.linkedin && (
                                <a href={c.linkedin} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600">
                                  <ExternalLink size={13} className="text-gray-400" /> LinkedIn
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions bar */}
                    <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-gray-200">
                      <button onClick={() => navigate(`/coaches/${c.id}/edit`)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                      <button onClick={() => handleDelete(c)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
