import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getClaims, approveClaim, declineClaim, getPhotoRequests, approvePhotoRequest, rejectPhotoRequest, bulkApprovePhotos, bulkRejectPhotos } from '../api/claims'
import { createOrgAccount, getCountries, updateFeatures } from '../api/core'
import { getSponsors, createSponsor, updateSponsor, deleteSponsor } from '../api/sponsors'
import { useFeatures } from '../context/FeaturesContext'
import { getTeams } from '../api/teams'
import { PageHead, SectHead, Loading, Empty, Seg } from '../components/ui'
import { mediaUrl } from '../utils'

function ClaimsQueue() {
  const [claims, setClaims] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [preview, setPreview] = useState(null)

  const load = () => {
    getClaims({ status: 'PENDING', page_size: 100 })
      .then((res) => setClaims(Array.isArray(res.data) ? res.data : res.data?.results || []))
      .catch(() => setClaims([]))
  }
  useEffect(load, [])

  const act = async (claim, action) => {
    setBusyId(claim.id)
    try {
      if (action === 'approve') {
        await approveClaim(claim.id)
      } else {
        const note = window.prompt('Reason for declining (optional):') || ''
        await declineClaim(claim.id, note)
      }
      load()
    } catch (err) {
      window.alert(err.response?.data?.error || 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  if (!claims) return <Loading label="Loading claims" />
  if (claims.length === 0) return <Empty label="No pending claims" />

  return (
    <div>
      {claims.map((c) => (
        <div key={c.id} className="hair-b" style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '14px 0', flexWrap: 'wrap' }}>
          <img
            src={mediaUrl(c.id_document)}
            alt="ID document"
            onClick={() => setPreview(preview === c.id ? null : c.id)}
            style={{ width: 90, height: 64, objectFit: 'cover', cursor: 'zoom-in', border: '1px solid var(--color-divider)' }}
          />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {c.username} <span className="micro" style={{ fontWeight: 400 }}>({c.user_email})</span>
            </div>
            <div style={{ fontSize: 13, marginTop: 3 }}>
              claims <Link to={`/swimmers/${c.swimmer}`}>{c.swimmer_name}</Link>
            </div>
            <div className="micro" style={{ marginTop: 3 }}>{new Date(c.created_at).toLocaleDateString('en-GB')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={busyId === c.id} onClick={() => act(c, 'approve')}>Approve</button>
            <button className="btn btn-secondary" disabled={busyId === c.id} onClick={() => act(c, 'decline')}>Decline</button>
          </div>
          {preview === c.id && (
            <div style={{ width: '100%' }}>
              <img src={mediaUrl(c.id_document)} alt="ID document large" style={{ maxWidth: '100%', maxHeight: 520, border: '1px solid var(--color-divider)' }} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function OrgAccountForm() {
  const [kind, setKind] = useState('CLUB')
  const [email, setEmail] = useState('')
  const [teamId, setTeamId] = useState('')
  const [countryId, setCountryId] = useState('')
  const [teamCountry, setTeamCountry] = useState('')
  const [teams, setTeams] = useState([])
  const [countries, setCountries] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getTeams({ ordering: 'name' }).then((res) => setTeams(Array.isArray(res.data) ? res.data : res.data?.results || [])).catch(() => {})
    getCountries().then((res) => setCountries(Array.isArray(res.data) ? res.data : res.data?.results || [])).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    setCopied(false)
    setLoading(true)
    try {
      const body = { kind, email }
      if (kind === 'CLUB') body.team = teamId
      else body.country = countryId
      const res = await createOrgAccount(body)
      setResult(res.data)
      setEmail('')
      setTeamId('')
      setCountryId('')
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create the account')
    } finally {
      setLoading(false)
    }
  }

  const arabCountries = countries.filter((c) => c.region === 'ARAB' || c.region === 'GCC')
  const visibleTeams = teamCountry
    ? teams.filter((t) => String(t.country) === String(teamCountry))
    : teams

  const copy = () => {
    navigator.clipboard.writeText(`Username: ${result.username}\nPassword: ${result.password}`)
    setCopied(true)
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Seg
          options={[{ value: 'CLUB', label: 'Club' }, { value: 'FEDERATION', label: 'Federation' }]}
          value={kind}
          onChange={setKind}
        />
        <div className="field">
          <label>Org email (they sent you)</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {kind === 'CLUB' ? (
          <>
            <div className="field">
              <label>Country</label>
              <select className="select" value={teamCountry} onChange={(e) => { setTeamCountry(e.target.value); setTeamId('') }}>
                <option value="">All countries</option>
                {arabCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Club</label>
              <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
                <option value="">Select club…</option>
                {visibleTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </>
        ) : (
          <div className="field">
            <label>Federation country</label>
            <select className="select" value={countryId} onChange={(e) => setCountryId(e.target.value)} required>
              <option value="">Select country…</option>
              {arabCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {error && (
          <div style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '10px 12px', fontSize: 13 }}>{error}</div>
        )}
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ height: 40 }}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: 18, border: '2px solid var(--asw-gold)', padding: '14px 16px' }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Account created — send these credentials</div>
          <div className="asw-num" style={{ fontSize: 14, lineHeight: 1.8 }}>
            Username: <strong>{result.username}</strong><br />
            Password: <strong>{result.password}</strong>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
            <button className="btn btn-secondary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy credentials'}</button>
            <span className="micro" style={{ color: 'var(--asw-slow)' }}>The password is shown only once.</span>
          </div>
        </div>
      )}
    </div>
  )
}

const FEATURE_LABELS = [
  ['records', 'Records'],
  ['new_records', 'New Records'],
  ['medals', 'Medals'],
  ['rankings', 'Rankings'],
  ['qualifying_times', 'Qualifying Times'],
  ['predictions', 'Predictions'],
  ['calendar', 'Calendar'],
  ['live', 'Live Results'],
  ['swimmers', 'Swimmers'],
  ['teams', 'Clubs'],
  ['compare', 'Compare'],
  ['coaches', 'Coaches'],
  ['hall_of_fame', 'Hall of Fame'],
  ['news', 'News'],
  ['media', 'Media'],
  ['marketplace', 'Marketplace'],
]

function SiteFeatures() {
  const { features, refreshFeatures } = useFeatures()
  const [busy, setBusy] = useState(null)

  const toggle = async (key) => {
    setBusy(key)
    try {
      await updateFeatures({ [key]: !(features[key] !== false) })
      refreshFeatures()
    } catch {
      window.alert('Failed to update — try again')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="micro" style={{ marginBottom: 14 }}>
        Hidden sections disappear from the menus and pages for visitors. You (admin) always see everything so you can prepare content before launch.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {FEATURE_LABELS.map(([key, label]) => {
          const on = features[key] !== false
          return (
            <div key={key} className="hair" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid var(--color-divider)', minWidth: 210 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
                <div className="micro" style={{ color: on ? 'var(--asw-fast, #0d7a52)' : 'var(--color-neutral-700)' }}>
                  {on ? 'Visible on the website' : 'Hidden from visitors'}
                </div>
              </div>
              <button
                className={`btn ${on ? 'btn-secondary' : 'btn-primary'}`}
                style={{ height: 30, fontSize: 12 }}
                disabled={busy === key}
                onClick={() => toggle(key)}
              >
                {busy === key ? '…' : on ? 'Hide' : 'Show'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PhotoQueue() {
  const [requests, setRequests] = useState(null)
  const [selected, setSelected] = useState(new Set())

  const load = () => {
    getPhotoRequests({ status: 'PENDING' })
      .then((res) => setRequests(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRequests([]))
  }
  useEffect(load, [])

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const approveOne = async (id) => {
    await approvePhotoRequest(id)
    setRequests((prev) => prev.filter((r) => r.id !== id))
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  const rejectOne = async (id) => {
    await rejectPhotoRequest(id)
    setRequests((prev) => prev.filter((r) => r.id !== id))
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  const bulkApprove = async () => {
    if (!selected.size) return
    await bulkApprovePhotos([...selected])
    setSelected(new Set())
    load()
  }

  const bulkReject = async () => {
    if (!selected.size) return
    await bulkRejectPhotos([...selected])
    setSelected(new Set())
    load()
  }

  if (!requests) return <Loading label="Loading photo requests" />
  if (requests.length === 0) return <Empty label="No pending photo requests" />

  return (
    <div>
      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{selected.size} selected</span>
          <button className="btn btn-primary" style={{ height: 30, fontSize: 12 }} onClick={bulkApprove}>Approve all</button>
          <button className="btn btn-secondary" style={{ height: 30, fontSize: 12 }} onClick={bulkReject}>Reject all</button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setSelected(new Set())}>Clear</button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setSelected(new Set(requests.map((r) => r.id)))}>Select all</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {requests.map((r) => (
          <div key={r.id} style={{
            border: selected.has(r.id) ? '2px solid var(--color-accent)' : '1px solid var(--color-divider)',
            background: 'var(--color-surface)', overflow: 'hidden', cursor: 'pointer',
          }}>
            <div onClick={() => toggle(r.id)} style={{ position: 'relative' }}>
              <img src={mediaUrl(r.photo)} alt="" style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', display: 'block' }} />
              {selected.has(r.id) && (
                <div style={{ position: 'absolute', top: 6, left: 6, width: 20, height: 20, background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>✓</div>
              )}
            </div>
            <div style={{ padding: '6px 8px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmer_name}</Link>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <button className="btn btn-primary" style={{ flex: 1, height: 24, fontSize: 10, padding: 0 }} onClick={() => approveOne(r.id)}>✓</button>
                <button className="btn btn-secondary" style={{ flex: 1, height: 24, fontSize: 10, padding: 0 }} onClick={() => rejectOne(r.id)}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PartnersManager() {
  const [partners, setPartners] = useState(null)
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = () => {
    getSponsors({ ordering: 'sort_order' })
      .then((res) => setPartners(Array.isArray(res.data) ? res.data : res.data?.results || []))
      .catch(() => setPartners([]))
  }
  useEffect(load, [])

  const add = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Name is required'); return }
    if (!file) { setError('A logo image is required'); return }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      if (website.trim()) fd.append('website', website.trim())
      fd.append('logo', file)
      fd.append('sort_order', String((partners?.length || 0) + 1))
      await createSponsor(fd)
      setName(''); setWebsite(''); setFile(null)
      // clear the file input
      const input = document.getElementById('partner-logo-input')
      if (input) input.value = ''
      load()
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.logo?.[0] || 'Could not add partner')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (p) => {
    setBusyId(p.id)
    try {
      await updateSponsor(p.id, { is_active: !p.is_active })
      load()
    } catch {
      window.alert('Failed to update — try again')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (p) => {
    if (!window.confirm(`Remove partner "${p.name}"?`)) return
    setBusyId(p.id)
    try {
      await deleteSponsor(p.id)
      load()
    } catch {
      window.alert('Failed to delete — try again')
    } finally {
      setBusyId(null)
    }
  }

  const move = async (p, dir) => {
    if (!partners) return
    const idx = partners.findIndex((x) => x.id === p.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= partners.length) return
    const other = partners[swapIdx]
    setBusyId(p.id)
    try {
      await Promise.all([
        updateSponsor(p.id, { sort_order: other.sort_order }),
        updateSponsor(other.id, { sort_order: p.sort_order }),
      ])
      load()
    } catch {
      window.alert('Failed to reorder — try again')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="micro" style={{ marginBottom: 14 }}>
        Logos shown in the “Partners” strip at the bottom of every page. Use a transparent PNG or SVG for the cleanest look. Hidden partners stay saved but drop off the site.
      </div>
      <form onSubmit={add} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 20, maxWidth: 720 }}>
        <div className="field" style={{ flex: '1 1 180px' }}>
          <label>Partner name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Speedo" />
        </div>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label>Website (optional)</label>
          <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label>Logo image</label>
          <input id="partner-logo-input" className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ height: 40 }}>
          {saving ? 'Adding…' : 'Add partner'}
        </button>
      </form>
      {error && <div className="error-box" style={{ marginBottom: 14, maxWidth: 720 }}>{error}</div>}

      {!partners ? (
        <Loading label="Loading partners" />
      ) : partners.length === 0 ? (
        <Empty label="No partners yet — add your first above" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {partners.map((p, i) => (
            <div key={p.id} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', flexWrap: 'wrap' }}>
              <div style={{ width: 120, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-divider)', background: '#fff', flex: 'none' }}>
                {p.logo ? <img src={mediaUrl(p.logo)} alt={p.name} style={{ maxHeight: 34, maxWidth: 104, objectFit: 'contain' }} /> : <span className="micro">no logo</span>}
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{p.website} ↗</a>}
                <div className="micro" style={{ color: p.is_active ? 'var(--asw-fast, #0d7a52)' : 'var(--color-neutral-700)' }}>
                  {p.is_active ? 'Visible on site' : 'Hidden'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="btn btn-secondary btn-icon" disabled={busyId === p.id || i === 0} onClick={() => move(p, -1)} title="Move up" aria-label="Move up">↑</button>
                <button className="btn btn-secondary btn-icon" disabled={busyId === p.id || i === partners.length - 1} onClick={() => move(p, 1)} title="Move down" aria-label="Move down">↓</button>
                <button className={`btn ${p.is_active ? 'btn-secondary' : 'btn-primary'}`} style={{ height: 30, fontSize: 12 }} disabled={busyId === p.id} onClick={() => toggleActive(p)}>
                  {p.is_active ? 'Hide' : 'Show'}
                </button>
                <button className="btn btn-secondary" style={{ height: 30, fontSize: 12 }} disabled={busyId === p.id} onClick={() => remove(p)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminDashboard() {
  return (
    <div>
      <PageHead kicker="Admin" title="Dashboard" />
      <div className="pad rule-b">
        <SectHead title="Website Analytics" />
        <div className="micro" style={{ marginBottom: 12 }}>
          Visitors, page views, traffic sources, devices and more — updated live.
        </div>
        <Link to="/admin/analytics" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', height: 38, padding: '0 18px', textDecoration: 'none' }}>
          Open Analytics →
        </Link>
      </div>
      <div className="pad rule-b">
        <SectHead title="Site Sections" />
        <SiteFeatures />
      </div>
      <div className="pad rule-b">
        <SectHead title="Partners" />
        <PartnersManager />
      </div>
      <div className="pad rule-b">
        <SectHead title="Pending Profile Claims" />
        <ClaimsQueue />
      </div>
      <div className="pad rule-b">
        <SectHead title="Photo Change Requests" />
        <PhotoQueue />
      </div>
      <div className="pad">
        <SectHead title="Create Club / Federation Account" />
        <OrgAccountForm />
      </div>
    </div>
  )
}
