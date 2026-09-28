import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Mail, Globe, AtSign, MapPin } from 'lucide-react'
import { getAcademies, createAcademy, updateAcademy, deleteAcademy } from '../api/academies'
import { getCountries } from '../api/core'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, Modal } from '../components/ui'
import { CropUpload } from '../components/ImageCropper'
import { useAuth } from '../context/AuthContext'
import { mediaUrl } from '../utils'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

function acronym(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
}

function AcademyLogo({ logo, name, size = 52 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: '#eef3f9', border: '1px solid #dbe4ef',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {logo ? (
        <img src={mediaUrl(logo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: '#1a56a0' }}>{acronym(name)}</span>
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
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--color-divider)', color: 'var(--color-text)' }}
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
      for (const [k, v] of Object.entries(form)) fd.append(k, k === 'name' ? v.trim() : v)
      if (logo) fd.append('logo', logo)
      if (academy) await updateAcademy(academy.id, fd)
      else await createAcademy(fd)
      onSaved()
    } catch (e) {
      setErr(e.response?.data ? JSON.stringify(e.response.data) : 'Save failed')
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
        <Fld label="Phone"><input className="input" style={{ width: '100%' }} value={form.phone} onChange={set('phone')} /></Fld>
        <Fld label="Email"><input className="input" style={{ width: '100%' }} value={form.email} onChange={set('email')} /></Fld>
        <Fld label="Website"><input className="input" style={{ width: '100%' }} value={form.website} onChange={set('website')} /></Fld>
        <Fld label="Instagram"><input className="input" style={{ width: '100%' }} placeholder="@handle" value={form.instagram} onChange={set('instagram')} /></Fld>
      </div>
      <Fld label="Address"><input className="input" style={{ width: '100%' }} value={form.address} onChange={set('address')} /></Fld>
      <Fld label="Description"><textarea className="input" rows={3} style={{ width: '100%', resize: 'vertical' }} value={form.description} onChange={set('description')} /></Fld>
      <Fld label="Logo (cropped square)"><CropUpload aspect={1} lockAspect onChange={setLogo} />{logo && <div style={{ fontSize: 12, color: 'var(--asw-fast)', marginTop: 4 }}>Logo ready ✓</div>}</Fld>
      {err && <div style={{ color: 'var(--asw-slow)', fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
        {academy ? (
          <button className="btn btn-secondary" disabled={busy} style={{ color: 'var(--asw-slow)' }}
            onClick={async () => { if (window.confirm(`Delete ${academy.name}?`)) { await deleteAcademy(academy.id); onSaved() } }}>Delete</button>
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

  useEffect(() => {
    let alive = true
    getAcademies({ page_size: 300 })
      .then((res) => { if (alive) setAcademies(list(res.data)) })
      .catch(() => {})
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
    const q = search.trim().toLowerCase()
    return academies.filter((a) => {
      if (a.is_active === false && !isAdmin) return false
      if (q && !String(a.name || '').toLowerCase().includes(q)) return false
      if (country && String(a.country) !== String(country)) return false
      return true
    })
  }, [academies, search, country])

  if (loading) return <Loading label="Loading academies" />

  return (
    <div>
      <PageHead title="Academies" />

      {/* filter bar: one line, scrolls sideways on phone */}
      <div className="rule-b records-filters" style={{ padding: '12px 32px', display: 'flex', gap: 10, flexWrap: 'nowrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ flex: '2 1 160px', width: 'auto', minWidth: 0, maxWidth: 320 }}
          placeholder="Search academies…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select"
          style={{ flex: '1 1 130px', width: 'auto', minWidth: 0, maxWidth: 220 }}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {isAdmin && (
          <button className="btn btn-primary" style={{ flex: 'none', fontSize: 12 }} onClick={() => setModal({ academy: null })}>+ Add academy</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty label="No academies found" />
      ) : (
        <div className="pad">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {filtered.map((a) => (
              <Link key={a.id} to={`/academies/${a.id}`} style={{
                background: '#fff', border: '1px solid #e2e9f2', borderRadius: 12,
                boxShadow: '0 1px 6px rgba(11,41,72,.06)', padding: '14px 16px',
                display: 'flex', flexDirection: 'column', gap: 12,
                color: 'inherit', textDecoration: 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <AcademyLogo logo={a.logo} name={a.name} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5, color: '#0b2948', lineHeight: 1.3 }}>
                      {a.name}{a.is_active === false && <span className="tag tag-neutral" style={{ marginLeft: 6 }}>Inactive</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 12, color: 'var(--color-neutral-800)' }}>
                      {a.country_detail && <Flag code={a.country_detail.code} name={a.country_detail.name} />}
                      <span>{a.country_detail?.name}{a.city ? ` · ${a.city}` : ''}</span>
                    </div>
                  </div>
                  {isAdmin && (
                    <button className="btn btn-secondary" style={{ flex: 'none', fontSize: 11 }}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setModal({ academy: a }) }}>Edit</button>
                  )}
                </div>
                {a.description && (
                  <div className="text-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{a.description}</div>
                )}
                {a.address && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12.5, color: 'var(--color-neutral-800)' }}>
                    <MapPin size={13} style={{ flex: 'none', marginTop: 2 }} /> {a.address}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                  <ContactLink href={a.phone ? `tel:${a.phone}` : ''} icon={Phone} label="Phone" />
                  <ContactLink href={a.email ? `mailto:${a.email}` : ''} icon={Mail} label="Email" />
                  <ContactLink href={a.website || ''} icon={Globe} label="Website" />
                  <ContactLink
                    href={a.instagram ? `https://instagram.com/${String(a.instagram).replace(/^@/, '')}` : ''}
                    icon={AtSign} label="Instagram"
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <AcademyModal academy={modal.academy} countries={countries} onClose={() => setModal(null)}
          onSaved={() => { setModal(null); setReloadKey((k) => k + 1) }} />
      )}
    </div>
  )
}
