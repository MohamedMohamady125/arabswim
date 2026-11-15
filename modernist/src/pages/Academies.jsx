import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Mail, Globe, AtSign, MapPin } from 'lucide-react'
import { getAcademies, createAcademy, updateAcademy, deleteAcademy } from '../api/academies'
import { getTeams } from '../api/teams'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Modal, FilterBar } from '../components/ui'
import { CropUpload } from '../components/ImageCropper'
import { useAuth } from '../context/AuthContext'
import { mediaUrl, nameInitials } from '../utils'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])
// Postel's Law: search ignores case, accents and punctuation
const fold = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-_.'’]/g, ' ').replace(/\s+/g, ' ').trim()

function acronym(name) {
  if (/[\u0600-\u06FF]/.test(String(name || ''))) return nameInitials(name)
  const words = String(name || '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
}

function AcademyLogo({ logo, name, size = 52 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: 'var(--color-accent-100)', border: '1px solid var(--color-neutral-300)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {logo ? (
        <img src={mediaUrl(logo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: 'var(--color-box-top)' }}>{acronym(name)}</span>
      )}
    </span>
  )
}

function ContactLink({ href, icon: Icon, label }) {
  if (!href) return null
  return (
    <a
      href={href} target="_blank" rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={label} aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: '1px solid var(--color-divider)', color: 'var(--color-text)' }}
    >
      <Icon size={13} />
    </a>
  )
}

function Fld({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div className="kicker" style={{ marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}

function AcademyModal({ academy, countries, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: academy?.name || '',
    country: academy?.country || academy?.country_detail?.id || '',
    city: academy?.city || '',
    description: academy?.description || '',
    phone: academy?.phone || '',
    email: academy?.email || '',
    website: academy?.website || '',
    instagram: academy?.instagram || '',
    address: academy?.address || '',
  })
  const [logo, setLogo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.name.trim() || !form.country) { setErr('Name and country are required'); return }
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      for (const [k, v] of Object.entries(form)) fd.append(k, typeof v === 'string' ? v.trim() : v) // Postel's Law: stray spaces never reach the server
      if (logo) fd.append('logo', logo)
      if (academy) await updateAcademy(academy.id, fd)
      else await createAcademy(fd)
      onSaved(academy ? 'Academy saved' : 'Academy added')
    } catch (e) {
      const d = e.response?.data
      setErr(d && typeof d === 'object'
        ? Object.entries(d).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${[].concat(v).join(' ')}`).join(' · ')
        : 'Could not save. Check your connection and try again.')
      setBusy(false)
    }
  }

  return (
    <Modal title={academy ? 'Edit academy' : 'Add academy'} onClose={onClose} width={520}>
      <Fld label="Name"><input className="input" style={{ width: '100%' }} value={form.name} onChange={set('name')} /></Fld>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Fld label="Country">
          <select className="select" style={{ width: '100%' }} value={form.country} onChange={set('country')}>
            <option value="">Select country</option>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Fld>
        <Fld label="City"><input className="input" style={{ width: '100%' }} value={form.city} onChange={set('city')} /></Fld>
        <Fld label="Phone"><input className="input" style={{ width: '100%' }} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></Fld>
        <Fld label="Email"><input className="input" style={{ width: '100%' }} type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} /></Fld>
        <Fld label="Website"><input className="input" style={{ width: '100%' }} inputMode="url" autoComplete="url" value={form.website} onChange={set('website')} /></Fld>
        <Fld label="Instagram"><input className="input" style={{ width: '100%' }} placeholder="@handle" value={form.instagram} onChange={set('instagram')} /></Fld>
      </div>
      <Fld label="Address"><input className="input" style={{ width: '100%' }} value={form.address} onChange={set('address')} /></Fld>
      <Fld label="Description"><textarea className="input" rows={3} style={{ width: '100%', resize: 'vertical' }} value={form.description} onChange={set('description')} /></Fld>
      <Fld label="Logo (cropped square)"><CropUpload aspect={1} lockAspect onChange={setLogo} />{logo && <div style={{ fontSize: 12, color: 'var(--asw-fast)', marginTop: 4 }}>Logo ready ✓</div>}</Fld>
      {err && <div role="alert" style={{ color: 'var(--asw-slow)', fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
        {academy ? (
          <button className="btn btn-secondary" disabled={busy} style={{ color: 'var(--asw-slow)' }}
            onClick={async () => {
              if (!window.confirm(`Delete ${academy.name}?`)) return
              setBusy(true); setErr('')
              try { await deleteAcademy(academy.id); onSaved('Academy deleted') }
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

export default function Academies() {
  const { isAdmin } = useAuth()
  const [academies, setAcademies] = useState([])
  const [countries, setCountries] = useState([])
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { academy } | null
  const [reloadKey, setReloadKey] = useState(0)
  const [failed, setFailed] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    // Two sources, one list: directory-only academies, plus clubs flagged as
    // academies — those carry a full profile (roster, results, records…)
    Promise.allSettled([getAcademies({ page_size: 300 }), getTeams({ is_academy: 'true' })])
      .then(([acad, teams]) => {
        if (!alive) return
        setFailed(acad.status !== 'fulfilled' && teams.status !== 'fulfilled')
        const plain = acad.status === 'fulfilled' ? list(acad.value.data) : []
        const full = (teams.status === 'fulfilled' ? list(teams.value.data) : [])
          .filter((t) => t.is_academy)
          .map((t) => ({ ...t, _team: true }))
        setAcademies([...full, ...plain].sort((a, b) => String(a.name).localeCompare(String(b.name))))
      })
      .finally(() => alive && setLoading(false))
    getCountries()
      .then((res) => {
        if (!alive) return
        const all = list(res.data)
        const arab = all.filter((c) => c.region === 'ARAB' || c.region === 'GCC')
        const rest = all.filter((c) => c.region !== 'ARAB' && c.region !== 'GCC')
        setCountries([...arab, ...rest])
      })
      .catch(() => {})
    return () => { alive = false }
  }, [reloadKey])

  const filtered = useMemo(() => {
    const q = fold(search)
    return academies.filter((a) => {
      if (a.is_active === false && !isAdmin) return false
      if (q && !fold([a.name, a.city, a.country_detail?.name].join(' ')).includes(q)) return false
      if (country && String(a.country) !== String(country)) return false
      return true
    })
  }, [academies, search, country, isAdmin])

  // Hick's Law: the country list holds only countries that have an academy,
  // so every option returns something (the full list is kept for the admin form)
  const listCountries = useMemo(() => {
    const m = new Map()
    academies.forEach((a) => { if (a.country_detail && (isAdmin || a.is_active !== false)) m.set(a.country_detail.id, a.country_detail) })
    const arab = (c) => (c.region === 'ARAB' || c.region === 'GCC' ? 0 : 1)
    return [...m.values()].sort((x, y) => arab(x) - arab(y) || x.name.localeCompare(y.name))
  }, [academies, isAdmin])
  const filtersOn = !!(search.trim() || country)
  const clearFilters = () => { setSearch(''); setCountry('') }

  if (loading) return <Loading label="Loading academies" />

  return (
    <div>
      <PageHead title="Academies" />

      <FilterBar count={filtered.length} noun={filtered.length === 1 ? 'academy' : 'academies'} active={filtersOn} onClear={clearFilters}>
        <input
          className="input"
          type="search"
          aria-label="Search academies"
          style={{ flex: '2 1 200px', width: 'auto', minWidth: 0, maxWidth: 320 }}
          placeholder="Search by academy, city or country…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {/* Occam's Razor: a country filter only when there is more than one country to choose */}
        {(listCountries.length > 1 || country) && (
          <select
            className="select"
            aria-label="Filter by country"
            style={{ flex: '1 1 150px', width: 'auto', minWidth: 0, maxWidth: 220 }}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">All countries</option>
            {listCountries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {isAdmin && (
          <button className="btn btn-primary" style={{ flex: 'none', fontSize: 12 }} onClick={() => setModal({ academy: null })}>+ Add academy</button>
        )}
        {/* Peak-End Rule: confirm the save once the dialog has closed */}
        {notice && <span role="status" style={{ flex: 'none', fontSize: 12, color: 'var(--asw-fast)' }}>{notice} ✓</span>}
      </FilterBar>

      {filtered.length === 0 ? (
        failed ? (
          <Empty label="Could not load academies" hint="Check your connection and reload the page." />
        ) : (
          <Empty label="No academies found" hint={filtersOn ? 'Check the spelling, or clear the filters to see every academy.' : 'Academies appear here once they are added. Clubs are listed separately.'}>
            {filtersOn
              ? <button type="button" className="btn btn-secondary" onClick={clearFilters}>Clear filters</button>
              : <Link to="/teams" className="btn btn-secondary">Browse clubs</Link>}
          </Empty>
        )
      ) : (
        <div className="pad">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filtered.map((a) => {
              const to = a._team ? `/teams/${a.id}` : `/academies/${a.id}`
              const contacts = !a._team && (a.phone || a.email || a.website || a.instagram)
              return (
              <div key={a._team ? `team-${a.id}` : a.id} style={{
                position: 'relative', background: '#fff', border: '1px solid var(--color-neutral-300)', borderRadius: 0,
                display: 'flex', flexDirection: 'column',
              }}>
                {/* one destination per card: the whole upper block opens the profile */}
                <Link to={to} style={{ padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, color: 'inherit', textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingRight: isAdmin && !a._team ? 52 : 0 }}>
                    <AcademyLogo logo={a.logo} name={a.name} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-accent-800)', lineHeight: 1.3 }}>
                        {a.name}{a.is_active === false && <span className="tag tag-neutral" style={{ marginLeft: 6 }}>Inactive</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 12, color: 'var(--color-neutral-800)' }}>
                        {a.country_detail && <Flag code={a.country_detail.code} name={a.country_detail.name} />}
                        <span>{[a.country_detail?.name, a.city, a._team && a.swimmers_count > 0 ? `${a.swimmers_count} swimmer${a.swimmers_count === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}</span>
                      </div>
                    </div>
                  </div>
                  {a.description && (
                    <div className="text-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{a.description}</div>
                  )}
                  {a.address && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: 'var(--color-neutral-800)' }}>
                      <MapPin size={13} style={{ flex: 'none', marginTop: 2 }} /> {a.address}
                    </div>
                  )}
                  <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--color-neutral-200)', fontSize: 13, fontWeight: 700, color: 'var(--color-accent-800)' }}>
                    {a._team ? 'Swimmers, results and records →' : 'View academy →'}
                  </div>
                </Link>
                {isAdmin && !a._team && (
                  <button className="btn btn-secondary" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11 }}
                    onClick={() => setModal({ academy: a })}>Edit</button>
                )}
                {contacts && (
                  <div style={{ display: 'flex', gap: 6, padding: '0 16px 16px' }}>
                    <ContactLink href={a.phone ? `tel:${a.phone}` : ''} icon={Phone} label="Phone" />
                    <ContactLink href={a.email ? `mailto:${a.email}` : ''} icon={Mail} label="Email" />
                    <ContactLink href={a.website ? (/^https?:\/\//i.test(a.website) ? a.website : `https://${a.website}`) : ''} icon={Globe} label="Website" />
                    <ContactLink
                      href={a.instagram ? `https://instagram.com/${String(a.instagram).replace(/^@/, '')}` : ''}
                      icon={AtSign} label="Instagram"
                    />
                  </div>
                )}
              </div>
              )
            })}
          </div>
        </div>
      )}

      {modal && (
        <AcademyModal academy={modal.academy} countries={countries} onClose={() => setModal(null)}
          onSaved={(msg) => { setModal(null); setReloadKey((k) => k + 1); setNotice(msg || ''); setTimeout(() => setNotice(''), 4000) }} />
      )}
    </div>
  )
}
