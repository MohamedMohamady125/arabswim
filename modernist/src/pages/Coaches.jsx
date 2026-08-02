import { useEffect, useRef, useState } from 'react'
import { MapPin, Briefcase, Award, Mail, Phone, AtSign, ExternalLink, FileText, ChevronDown } from 'lucide-react'
import { getCoaches } from '../api/coaches'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty } from '../components/ui'
import { mediaUrl } from '../utils'

const LEVEL_LABELS = {
  HEAD: 'Head Coach',
  ASSISTANT: 'Assistant Coach',
  TECHNIQUE: 'Technique Coach',
  FITNESS: 'Fitness / S&C Coach',
  YOUTH: 'Youth Development',
  PRIVATE: 'Private Coach',
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

const splitLines = (v) => (v ? String(v).split('\n').map((s) => s.trim()).filter(Boolean) : [])
const splitComma = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : [])

export default function Coaches() {
  const [rows, setRows] = useState([])
  const [countries, setCountries] = useState([])
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [country, setCountry] = useState('')
  const [level, setLevel] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef(null)

  useEffect(() => {
    let alive = true
    getCountries()
      .then((res) => {
        if (!alive) return
        const all = Array.isArray(res.data) ? res.data : res.data?.results || []
        const arab = all.filter((c) => c.region === 'ARAB' || c.region === 'GCC')
        const rest = all.filter((c) => c.region !== 'ARAB' && c.region !== 'GCC')
        setCountries([...arab, ...rest])
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(search), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = { page_size: 200 }
    if (query) params.search = query
    if (country) params.country = country
    if (level) params.level = level
    getCoaches(params)
      .then((res) => {
        if (!alive) return
        const d = res.data
        setRows(Array.isArray(d) ? d : d?.results || [])
      })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [query, country, level])

  return (
    <div>
      <PageHead kicker="People" title="Coaches" sub={`${rows.length} coaches across Arab swimming.`} />

      {/* filter bar */}
      <div className="rule-b" style={{ padding: '16px 32px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search by name, club, specialty…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select"
          style={{ maxWidth: 220 }}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* level filter chips */}
      <div className="rule-b" style={{ padding: '12px 32px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className={level === '' ? 'tag tag-dark' : 'tag tag-neutral'}
          style={{ cursor: 'pointer', border: 0, font: 'inherit' }}
          onClick={() => setLevel('')}
        >
          All levels
        </button>
        {Object.entries(LEVEL_LABELS).map(([k, v]) => (
          <button
            key={k}
            type="button"
            className={level === k ? 'tag tag-dark' : 'tag tag-neutral'}
            style={{ cursor: 'pointer', border: 0, font: 'inherit' }}
            onClick={() => setLevel(level === k ? '' : k)}
          >
            {v}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading label="Loading coaches" />
      ) : rows.length === 0 ? (
        <Empty label="No coaches found" />
      ) : (
        <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((c) => {
            const isExpanded = expandedId === c.id
            const specializations = splitComma(c.specializations)
            const certifications = splitLines(c.certifications)
            const achievements = splitLines(c.achievements)
            return (
              <div key={c.id} style={{ border: '1px solid var(--color-divider)', opacity: c.is_active === false ? 0.6 : 1 }}>
                {/* main row */}
                <div
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: 16, cursor: 'pointer' }}
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  {c.photo ? (
                    <div className="grayscale" style={{ width: 64, height: 64, flex: 'none', overflow: 'hidden', border: '1px solid var(--color-divider)' }}>
                      <img src={mediaUrl(c.photo)} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ) : (
                    <div style={{ width: 64, height: 64, flex: 'none', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>
                      {initials(c.name)}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</span>
                      {c.level && <span className="tag tag-dark">{LEVEL_LABELS[c.level] || c.level}</span>}
                      {c.is_available && <span className="tag tag-accent">Open to offers</span>}
                      {c.is_active === false && <span className="tag tag-neutral">Inactive</span>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6, fontSize: 13, color: 'var(--color-neutral-700)', flexWrap: 'wrap' }}>
                      {c.nationality_detail && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Flag code={c.nationality_detail.code} name={c.nationality_detail.name} />
                          {c.nationality_detail.name}
                        </span>
                      )}
                      {c.city && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> {c.city}</span>
                      )}
                      {c.current_club && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Briefcase size={13} /> {c.current_club}</span>
                      )}
                      {c.years_experience && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Award size={13} /> <span className="asw-num">{c.years_experience}</span> yrs experience</span>
                      )}
                    </div>

                    {specializations.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {specializations.map((s, i) => (
                          <span key={i} className="tag tag-neutral">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none', alignSelf: 'center' }}>
                    {c.cv_file && (
                      <a
                        href={mediaUrl(c.cv_file)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <FileText size={13} /> CV
                      </a>
                    )}
                    <ChevronDown size={16} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </div>
                </div>

                {/* expanded detail */}
                {isExpanded && (
                  <div className="rule-t" style={{ padding: 16, borderTopWidth: 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                      {/* Bio + achievements */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {c.bio && (
                          <div>
                            <div className="kicker" style={{ marginBottom: 6 }}>About</div>
                            <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-line' }}>{c.bio}</p>
                          </div>
                        )}
                        {achievements.length > 0 && (
                          <div>
                            <div className="kicker" style={{ marginBottom: 6 }}>Achievements</div>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {achievements.map((a, i) => <li key={i}>{a}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Certifications + contact */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {certifications.length > 0 && (
                          <div>
                            <div className="kicker" style={{ marginBottom: 6 }}>Certifications</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {certifications.map((cert, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                  <Award size={13} /> {cert}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {(c.email || c.phone || c.instagram || c.linkedin) && (
                          <div>
                            <div className="kicker" style={{ marginBottom: 6 }}>Contact</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                              {c.email && (
                                <a href={`mailto:${c.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit' }}>
                                  <Mail size={13} /> {c.email}
                                </a>
                              )}
                              {c.phone && (
                                <a href={`tel:${c.phone}`} className="asw-num" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit' }}>
                                  <Phone size={13} /> {c.phone}
                                </a>
                              )}
                              {c.instagram && (
                                <a href={`https://instagram.com/${String(c.instagram).replace('@', '')}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit' }}>
                                  <AtSign size={13} /> {c.instagram}
                                </a>
                              )}
                              {c.linkedin && (
                                <a href={c.linkedin} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit' }}>
                                  <ExternalLink size={13} /> LinkedIn
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                        {c.cv_file && (
                          <div>
                            <a href={mediaUrl(c.cv_file)} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <FileText size={13} /> Download CV
                            </a>
                          </div>
                        )}
                      </div>
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
