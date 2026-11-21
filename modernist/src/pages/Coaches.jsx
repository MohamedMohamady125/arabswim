import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, Briefcase, Award, Mail, Phone, AtSign, ExternalLink, FileText, ChevronDown } from 'lucide-react'
import { getCoaches, createCoach, updateCoach, deleteCoach } from '../api/coaches'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { Link } from 'react-router-dom'
import { PageHead, Empty, Modal, FilterBar, Skeleton } from '../components/ui'
import { CropUpload } from '../components/ImageCropper'
import { useAuth } from '../context/AuthContext'
import { mediaUrl, nameInitials } from '../utils'
import Pic from '../components/Pic'

const LEVEL_LABELS = {
  HEAD: 'Head Coach',
  ASSISTANT: 'Assistant Coach',
  TECHNIQUE: 'Technique Coach',
  FITNESS: 'Fitness / S&C Coach',
  YOUTH: 'Youth Development',
  PRIVATE: 'Private Coach',
}

const initials = (name) => nameInitials(name)

const splitLines = (v) => (v ? String(v).split('\n').map((s) => s.trim()).filter(Boolean) : [])
const splitComma = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : [])

function Fld({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div className="kicker" style={{ marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}

function CoachModal({ coach, countries, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: coach?.name || '',
    nationality: coach?.nationality || coach?.nationality_detail?.id || '',
    level: coach?.level || '',
    city: coach?.city || '',
    current_club: coach?.current_club || '',
    years_experience: coach?.years_experience || '',
    specializations: coach?.specializations || '',
    certifications: coach?.certifications || '',
    achievements: coach?.achievements || '',
    bio: coach?.bio || '',
    email: coach?.email || '',
    phone: coach?.phone || '',
    instagram: coach?.instagram || '',
    linkedin: coach?.linkedin || '',
  })
  const [flags, setFlags] = useState({
    is_available: coach ? !!coach.is_available : false,
    is_active: coach ? coach.is_active !== false : true,
  })
  const [photo, setPhoto] = useState(null)
  const [cvFile, setCvFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.name.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      for (const [k, v] of Object.entries(form)) {
        if (k === 'years_experience' && v === '') continue
        fd.append(k, typeof v === 'string' ? v.trim() : v) // Postel's Law: stray spaces never reach the server
      }
      fd.append('is_available', flags.is_available)
      fd.append('is_active', flags.is_active)
      if (photo) fd.append('photo', photo)
      if (cvFile) fd.append('cv_file', cvFile)
      if (coach) await updateCoach(coach.id, fd)
      else await createCoach(fd)
      onSaved(coach ? 'Coach saved' : 'Coach added')
    } catch (e) {
      const d = e.response?.data
      setErr(d && typeof d === 'object'
        ? Object.entries(d).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${[].concat(v).join(' ')}`).join(' · ')
        : 'Could not save. Check your connection and try again.')
      setBusy(false)
    }
  }

  return (
    <Modal title={coach ? 'Edit coach' : 'Add coach'} onClose={onClose} width={560}>
      <Fld label="Name"><input className="input" style={{ width: '100%' }} value={form.name} onChange={set('name')} /></Fld>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Fld label="Nationality">
          <select className="select" style={{ width: '100%' }} value={form.nationality} onChange={set('nationality')}>
            <option value="">Select country</option>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Fld>
        <Fld label="Level">
          <select className="select" style={{ width: '100%' }} value={form.level} onChange={set('level')}>
            <option value="">—</option>
            {Object.entries(LEVEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Fld>
        <Fld label="City"><input className="input" style={{ width: '100%' }} value={form.city} onChange={set('city')} /></Fld>
        <Fld label="Current club"><input className="input" style={{ width: '100%' }} value={form.current_club} onChange={set('current_club')} /></Fld>
        <Fld label="Years of experience"><input className="input" style={{ width: '100%' }} type="number" inputMode="numeric" min="0" value={form.years_experience} onChange={set('years_experience')} /></Fld>
        <Fld label="Photo"><CropUpload kind="person" current={coach?.photo} onChange={setPhoto} />{photo && <div style={{ fontSize: 12, color: 'var(--asw-fast)', marginTop: 4 }}>Photo ready ✓</div>}</Fld>
      </div>
      <Fld label="Specializations (comma-separated)"><input className="input" style={{ width: '100%' }} placeholder="Sprints, Freestyle, Starts & turns" value={form.specializations} onChange={set('specializations')} /></Fld>
      <Fld label="Certifications (one per line)"><textarea className="input" rows={2} style={{ width: '100%', resize: 'vertical' }} value={form.certifications} onChange={set('certifications')} /></Fld>
      <Fld label="Achievements (one per line)"><textarea className="input" rows={2} style={{ width: '100%', resize: 'vertical' }} value={form.achievements} onChange={set('achievements')} /></Fld>
      <Fld label="Bio"><textarea className="input" rows={3} style={{ width: '100%', resize: 'vertical' }} value={form.bio} onChange={set('bio')} /></Fld>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Fld label="Email"><input className="input" style={{ width: '100%' }} type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} /></Fld>
        <Fld label="Phone"><input className="input" style={{ width: '100%' }} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></Fld>
        <Fld label="Instagram"><input className="input" style={{ width: '100%' }} placeholder="@handle" value={form.instagram} onChange={set('instagram')} /></Fld>
        <Fld label="LinkedIn URL"><input className="input" style={{ width: '100%' }} type="url" inputMode="url" value={form.linkedin} onChange={set('linkedin')} /></Fld>
      </div>
      <Fld label="CV (PDF)"><input className="input" type="file" accept=".pdf,application/pdf" onChange={(e) => setCvFile(e.target.files?.[0] || null)} /></Fld>
      <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={flags.is_available} onChange={(e) => setFlags((f) => ({ ...f, is_available: e.target.checked }))} /> Open to offers
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={flags.is_active} onChange={(e) => setFlags((f) => ({ ...f, is_active: e.target.checked }))} /> Active
        </label>
      </div>
      {err && <div role="alert" style={{ color: 'var(--asw-slow)', fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
        {coach ? (
          <button className="btn btn-secondary" disabled={busy} style={{ color: 'var(--asw-slow)' }}
            onClick={async () => {
              if (!window.confirm(`Delete coach ${coach.name}?`)) return
              setBusy(true); setErr('')
              try { await deleteCoach(coach.id); onSaved('Coach deleted') }
              catch { setErr('Could not delete. Try again.'); setBusy(false) }
            }}>Delete</button>
        ) : <span />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Modal>
  )
}

export default function Coaches() {
  const { isAdmin } = useAuth()
  const [modal, setModal] = useState(null) // { coach } | null
  const [reloadKey, setReloadKey] = useState(0)
  const [rows, setRows] = useState([])
  const [countries, setCountries] = useState([])
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [country, setCountry] = useState('')
  const [level, setLevel] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [notice, setNotice] = useState('')
  const debounceRef = useRef(null)
  // The unfiltered directory, kept so the country list only offers countries
  // that have someone in them and an empty directory is told apart from an
  // empty search (Hick's Law, Paradox of the Active User)
  const [directory, setDirectory] = useState(null)
  const filtersOn = !!(search.trim() || country || level)
  const clearFilters = () => { setSearch(''); setQuery(''); setCountry(''); setLevel('') }

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
    debounceRef.current = setTimeout(() => setQuery(search.trim()), 400)
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
        const got = Array.isArray(d) ? d : d?.results || []
        setRows(got)
        if (!query && !country && !level) setDirectory(got)
        setFailed(false)
      })
      .catch(() => { if (alive) { setRows([]); setFailed(true) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [query, country, level, reloadKey])

  const directoryEmpty = !filtersOn && !loading && !failed && rows.length === 0
  // countries and levels that actually occur, Arab countries first
  const countryOptions = useMemo(() => {
    const have = new Set((directory || []).map((r) => r.nationality || r.nationality_detail?.id).filter(Boolean).map(String))
    return directory && have.size ? countries.filter((c) => have.has(String(c.id))) : countries
  }, [directory, countries])
  const levelOptions = useMemo(() => Object.entries(LEVEL_LABELS)
    .map(([k, v]) => [k, v, (directory || []).filter((r) => r.level === k).length])
    .filter(([, , n]) => n > 0 || !directory), [directory])

  return (
    <div>
      <PageHead title="Coaches" sub="Coaches working across Arab swimming." />

      {/* Common Region: search, country and level in one bar with the result
          count. Occam's Razor: no filters at all while the directory is empty. */}
      {(directoryEmpty && !isAdmin) ? null : (
      <FilterBar count={loading || directoryEmpty ? null : rows.length} noun={rows.length === 1 ? 'coach' : 'coaches'} active={filtersOn} onClear={clearFilters}>
        {!directoryEmpty && (<>
        <input
          className="input"
          type="search"
          aria-label="Search coaches"
          style={{ flex: '2 1 220px', width: 'auto', minWidth: 0, maxWidth: 320 }}
          placeholder="Search by name, club, specialty…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(countryOptions.length > 1 || country) && (
          <select
            className="select"
            aria-label="Filter by country"
            style={{ flex: '1 1 150px', width: 'auto', minWidth: 0, maxWidth: 220 }}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">All countries</option>
            {countryOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {(levelOptions.length > 1 || level) && (
          <select
            className="select"
            aria-label="Filter by level"
            style={{ flex: '1 1 150px', width: 'auto', minWidth: 0, maxWidth: 220 }}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="">All levels</option>
            {levelOptions.map(([k, v, n]) => (
              <option key={k} value={k}>{v} ({n})</option>
            ))}
          </select>
        )}
        </>)}
        {isAdmin && (
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setModal({ coach: null })}>+ Add coach</button>
        )}
        {/* Peak-End Rule: confirm the save once the dialog has closed */}
        {notice && <span role="status" style={{ fontSize: 12, color: 'var(--asw-fast)' }}>{notice} ✓</span>}
      </FilterBar>
      )}

      {loading ? (
        <div className="pad"><Skeleton rows={4} height={64} /></div>
      ) : rows.length === 0 ? (
        failed ? (
          <Empty label="Could not load coaches" hint="Check your connection and reload the page." />
        ) : filtersOn ? (
          <Empty label="No coaches match" hint="Check the spelling, or clear the filters to see everyone.">
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>Clear filters</button>
          </Empty>
        ) : (
          <Empty label="No coach profiles yet" hint={isAdmin ? 'Use “Add coach” above to create the first profile.' : 'Coaches are being added. In the meantime, clubs and academies list their own staff.'}>
            {!isAdmin && <Link to="/teams" className="btn btn-secondary">Browse clubs</Link>}
          </Empty>
        )
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
                  className="row-link"
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: 16, cursor: 'pointer' }}
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : c.id) }
                  }}
                >
                  {c.photo ? (
                    <div className="grayscale" style={{ width: 64, height: 64, flex: 'none', overflow: 'hidden', border: '1px solid var(--color-divider)' }}>
                      <Pic kind="person" w={160} src={c.photo} />
                    </div>
                  ) : (
                    <div style={{ width: 64, height: 64, flex: 'none', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>
                      {initials(c.name)}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>{c.name}</span>
                      {c.level && <span className="tag tag-dark">{LEVEL_LABELS[c.level] || c.level}</span>}
                      {c.is_available && <span className="tag tag-accent">Open to offers</span>}
                      {c.is_active === false && <span className="tag tag-neutral">Inactive</span>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, fontSize: 13, color: 'var(--color-neutral-700)', flexWrap: 'wrap' }}>
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none', alignSelf: 'center' }}>
                    {isAdmin && (
                      <button className="btn btn-secondary" style={{ fontSize: 11 }}
                        onClick={(e) => { e.stopPropagation(); setModal({ coach: c }) }}>Edit</button>
                    )}
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
                    <ChevronDown size={16} aria-hidden="true" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, fontSize: 13 }}>
                              {c.email && (
                                <a href={`mailto:${c.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', minHeight: 32 }}>
                                  <Mail size={13} /> {c.email}
                                </a>
                              )}
                              {c.phone && (
                                <a href={`tel:${c.phone}`} className="asw-num" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', minHeight: 32 }}>
                                  <Phone size={13} /> {c.phone}
                                </a>
                              )}
                              {c.instagram && (
                                <a href={`https://instagram.com/${String(c.instagram).replace('@', '')}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', minHeight: 32 }}>
                                  <AtSign size={13} /> {c.instagram}
                                </a>
                              )}
                              {c.linkedin && (
                                <a href={c.linkedin} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', minHeight: 32 }}>
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

      {modal && (
        <CoachModal coach={modal.coach} countries={countries} onClose={() => setModal(null)}
          onSaved={(msg) => { setModal(null); setReloadKey((k) => k + 1); setNotice(msg || ''); setTimeout(() => setNotice(''), 4000) }} />
      )}
    </div>
  )
}
