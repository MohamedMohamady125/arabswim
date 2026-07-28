import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserCheck, Plus, MapPin, Briefcase, Award, Mail, Phone, FileText, AtSign, ExternalLink, ChevronDown } from 'lucide-react'
import { getCoaches, deleteCoach } from '../api/coaches'
import { getCountries } from '../api/core'
import CountryFlag from '../components/common/CountryFlag'
import { PageHeader, FilterBar, SearchInput, Select, Button, Badge, ConfirmDialog, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const LEVEL_LABELS = {
  HEAD: 'Head Coach',
  ASSISTANT: 'Assistant Coach',
  TECHNIQUE: 'Technique Coach',
  FITNESS: 'Fitness / S&C Coach',
  YOUTH: 'Youth Development',
  PRIVATE: 'Private Coach',
}

const LEVEL_STYLES = {
  HEAD: 'bg-aqua-100 text-aqua-600',
  ASSISTANT: 'bg-lcm/10 text-lcm',
  TECHNIQUE: 'bg-record/10 text-record',
  FITNESS: 'bg-pos/10 text-pos',
  YOUTH: 'bg-gold/15 text-gold',
  PRIVATE: 'bg-ink-100 text-ink-500',
}

export default function CoachesPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { token } = useAuth()
  const isAdmin = !!token
  const [coaches, setCoaches] = useState([])
  const [countries, setCountries] = useState([])
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

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
    try {
      await deleteCoach(c.id)
      setCoaches(prev => prev.filter(x => x.id !== c.id))
      toast.success('Coach deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  const chips = [
    search && { key: 'search', label: `"${search}"`, onRemove: () => setSearch('') },
    countryFilter && {
      key: 'country',
      label: countries.find(c => String(c.id) === String(countryFilter))?.name || 'Country',
      onRemove: () => setCountryFilter(''),
    },
    levelFilter && { key: 'level', label: LEVEL_LABELS[levelFilter] || levelFilter, onRemove: () => setLevelFilter('') },
  ].filter(Boolean)

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Coaches"
        subtitle={`${coaches.length} coaches in the directory`}
        action={isAdmin && (
          <Button icon={Plus} onClick={() => navigate('/coaches/new')}>Add Coach</Button>
        )}
      />

      {/* Filters */}
      <FilterBar chips={chips} onReset={() => { setSearch(''); setCountryFilter(''); setLevelFilter('') }}>
        <SearchInput placeholder="Search by name, club, specialty..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full md:w-72" aria-label="Search coaches" />
        <Select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
          className="w-full md:w-48" aria-label="Country">
          <option value="">All Countries</option>
          {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          className="w-full md:w-48" aria-label="Level">
          <option value="">All Levels</option>
          {Object.entries(LEVEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </FilterBar>

      {/* Coach Cards */}
      {coaches.length === 0 ? (
        <div className="bg-white rounded-md border border-ink-100 shadow-card">
          <EmptyState icon={UserCheck} title="No coaches yet"
            hint="Add coaches to build the coaching directory" />
        </div>
      ) : (
        <div className="space-y-4">
          {coaches.map(c => {
            const isExpanded = expandedId === c.id
            const specializations = c.specializations ? c.specializations.split(',').map(s => s.trim()).filter(Boolean) : []
            const certifications = c.certifications ? c.certifications.split('\n').map(s => s.trim()).filter(Boolean) : []
            const achievements = c.achievements ? c.achievements.split('\n').map(s => s.trim()).filter(Boolean) : []

            return (
              <div key={c.id} className={`bg-white rounded-md border border-ink-100 shadow-card overflow-hidden transition-colors hover:border-aqua-500/40 ${!c.is_active ? 'opacity-60' : ''}`}>
                {/* Main card row */}
                <div className="flex items-start gap-4 p-4 md:p-5 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                  {/* Photo */}
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-md bg-aqua-50 flex items-center justify-center overflow-hidden shrink-0">
                    {c.photo ? (
                      <img src={c.photo} alt={c.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-title text-aqua-600/50">
                        {c.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-body font-bold text-ink-900">{c.name}</h3>
                      {c.level && (
                        <span className={`text-label px-2 py-0.5 rounded-full ${LEVEL_STYLES[c.level] || 'bg-ink-100 text-ink-500'}`}>
                          {LEVEL_LABELS[c.level] || c.level}
                        </span>
                      )}
                      {c.is_available && <Badge variant="pos">Open to offers</Badge>}
                      {!c.is_active && <Badge variant="status">Inactive</Badge>}
                    </div>

                    <div className="flex items-center gap-4 mt-1.5 text-body-sm text-ink-500 flex-wrap">
                      {c.nationality_detail && (
                        <span className="flex items-center gap-1 min-w-0">
                          <CountryFlag code={c.nationality_detail.code} flagUrl={c.nationality_detail.flag_url} name={c.nationality_detail.name} className="max-w-full" />
                        </span>
                      )}
                      {c.city && (
                        <span className="flex items-center gap-1"><MapPin size={13} className="text-ink-400 shrink-0" /> {c.city}</span>
                      )}
                      {c.current_club && (
                        <span className="flex items-center gap-1 min-w-0"><Briefcase size={13} className="text-ink-400 shrink-0" /> <span className="truncate">{c.current_club}</span></span>
                      )}
                      {c.years_experience && (
                        <span className="flex items-center gap-1"><Award size={13} className="text-ink-400" /> {c.years_experience} yrs experience</span>
                      )}
                    </div>

                    {/* Specializations tags */}
                    {specializations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {specializations.map((s, i) => (
                          <span key={i} className="text-label normal-case tracking-normal px-2 py-0.5 rounded-sm bg-aqua-50 text-aqua-600 font-medium">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: actions + expand arrow */}
                  <div className="flex items-center gap-2 shrink-0 self-center">
                    {c.cv_file && (
                      <a href={c.cv_file} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 text-body-sm text-aqua-600 hover:text-aqua-500 bg-aqua-50 px-2.5 py-2.5 rounded-sm font-medium">
                        <FileText size={14} /> CV
                      </a>
                    )}
                    <ChevronDown size={16} className={`text-ink-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-ink-100 bg-ink-50/60 px-4 md:px-5 py-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Left: Bio + Achievements */}
                      <div className="space-y-4">
                        {c.bio && (
                          <div>
                            <h4 className="text-label text-ink-400 mb-1.5">About</h4>
                            <p className="text-body-sm text-ink-700 whitespace-pre-line">{c.bio}</p>
                          </div>
                        )}
                        {achievements.length > 0 && (
                          <div>
                            <h4 className="text-label text-ink-400 mb-1.5">Achievements</h4>
                            <ul className="space-y-1">
                              {achievements.map((a, i) => (
                                <li key={i} className="text-body-sm text-ink-700 flex items-start gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-aqua-500 mt-1.5 shrink-0" /> {a}
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
                            <h4 className="text-label text-ink-400 mb-1.5">Certifications</h4>
                            <div className="space-y-1">
                              {certifications.map((cert, i) => (
                                <div key={i} className="flex items-center gap-2 text-body-sm text-ink-700">
                                  <Award size={13} className="text-gold shrink-0" /> {cert}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Contact */}
                        {(c.email || c.phone || c.instagram || c.linkedin) && (
                          <div>
                            <h4 className="text-label text-ink-400 mb-1.5">Contact</h4>
                            <div className="space-y-1">
                              {c.email && (
                                <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-body-sm text-ink-700 hover:text-aqua-600 min-h-10 min-w-0">
                                  <Mail size={13} className="text-ink-400 shrink-0" /> <span className="break-all">{c.email}</span>
                                </a>
                              )}
                              {c.phone && (
                                <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-body-sm text-ink-700 hover:text-aqua-600 min-h-10">
                                  <Phone size={13} className="text-ink-400" /> {c.phone}
                                </a>
                              )}
                              {c.instagram && (
                                <a href={`https://instagram.com/${c.instagram.replace('@', '')}`} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-2 text-body-sm text-ink-700 hover:text-aqua-600 min-h-10">
                                  <AtSign size={13} className="text-ink-400" /> {c.instagram}
                                </a>
                              )}
                              {c.linkedin && (
                                <a href={c.linkedin} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-2 text-body-sm text-ink-700 hover:text-aqua-600 min-h-10">
                                  <ExternalLink size={13} className="text-ink-400 shrink-0" /> LinkedIn
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Admin actions bar */}
                    {isAdmin && (
                      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-ink-100">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/coaches/${c.id}/edit`)}>Edit</Button>
                        <Button variant="ghost" size="sm" className="!text-neg hover:!bg-neg/10"
                          onClick={() => setPendingDelete(c)}>Delete</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete coach "${pendingDelete?.name}"?`}
        message="This cannot be undone."
        destructive
        onConfirm={async () => { const c = pendingDelete; setPendingDelete(null); await handleDelete(c) }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
