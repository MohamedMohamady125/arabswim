import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getClaims, approveClaim, declineClaim, getPhotoRequests, approvePhotoRequest, rejectPhotoRequest, bulkApprovePhotos, bulkRejectPhotos } from '../api/claims'
import { createOrgAccount, getCountries, updateFeatures, getChangeLog, revertChange } from '../api/core'
import { getSponsors, createSponsor, updateSponsor, deleteSponsor } from '../api/sponsors'
import { useFeatures } from '../context/FeaturesContext'
import { FEATURE_GROUPS } from '../featureRegistry'
import { getTeams } from '../api/teams'
import { getAcademies } from '../api/academies'
import { PageHead, SectHead, Loading, notify, Empty, Seg, Done } from '../components/ui'
import { mediaUrl } from '../utils'
import { CropUpload } from '../components/ImageCropper'

function ClaimsQueue({ onCount }) {
  const [claims, setClaims] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [preview, setPreview] = useState(null)

  const load = () => {
    getClaims({ status: 'PENDING', page_size: 100 })
      .then((res) => setClaims(Array.isArray(res.data) ? res.data : res.data?.results || []))
      .catch(() => setClaims([]))
  }
  useEffect(load, [])
  useEffect(() => { if (claims) onCount?.(claims.length) }, [claims, onCount])

  const act = async (claim, action) => {
    setBusyId(claim.id)
    try {
      if (action === 'approve') {
        await approveClaim(claim.id)
        notify(`Claim approved. ${claim.username} now manages ${claim.swimmer_name}.`)
      } else {
        // Cancel in the prompt means "do not decline" (it used to decline anyway)
        const note = window.prompt('Reason for declining (optional):')
        if (note === null) return
        await declineClaim(claim.id, note.trim())
        notify('Claim declined.')
      }
      load()
    } catch (err) {
      notify(err.response?.data?.error || 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  if (!claims) return <Loading label="Loading claims" />
  if (claims.length === 0) return <Done title="No profile claims waiting">New claims from athletes will appear here.</Done>

  return (
    <div>
      {claims.map((c) => (
        <div key={c.id} className="hair-b" style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '16px 0', flexWrap: 'wrap' }}>
          <img
            src={mediaUrl(c.id_document)}
            alt={`ID document from ${c.username}`}
            role="button"
            tabIndex={0}
            className="row-link"
            aria-expanded={preview === c.id}
            title={preview === c.id ? 'Hide the large ID document' : 'Show the ID document larger'}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click() } }}
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
            <div className="micro" style={{ marginTop: 3 }}>{new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Von Restorff: one row per claim, so Approve is outlined instead of a solid primary on every row */}
            <button type="button" className="btn btn-secondary" style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }} disabled={busyId === c.id} onClick={() => act(c, 'approve')}>{busyId === c.id ? 'Working…' : 'Approve'}</button>
            <button type="button" className="btn btn-secondary" disabled={busyId === c.id} onClick={() => act(c, 'decline')}>Decline</button>
          </div>
          {preview === c.id && (
            <div style={{ width: '100%' }}>
              <img src={mediaUrl(c.id_document)} alt={`ID document from ${c.username}, large`} style={{ maxWidth: '100%', maxHeight: 520, border: '1px solid var(--color-divider)' }} />
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
  const [academyId, setAcademyId] = useState('')
  const [teamCountry, setTeamCountry] = useState('')
  const [teams, setTeams] = useState([])
  const [academies, setAcademies] = useState([])
  const [countries, setCountries] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getTeams({ ordering: 'name' }).then((res) => setTeams(Array.isArray(res.data) ? res.data : res.data?.results || [])).catch(() => {})
    getCountries().then((res) => setCountries(Array.isArray(res.data) ? res.data : res.data?.results || [])).catch(() => {})
    getAcademies().then((res) => setAcademies(Array.isArray(res.data) ? res.data : res.data?.results || [])).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    setCopied(false)
    setLoading(true)
    try {
      const body = { kind, email: email.trim() }
      if (kind === 'CLUB') body.team = teamId
      else if (kind === 'ACADEMY') body.academy = academyId
      else body.country = countryId
      const res = await createOrgAccount(body)
      setResult(res.data)
      setEmail('')
      setTeamId('')
      setCountryId('')
      setAcademyId('')
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
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Seg
          options={[{ value: 'CLUB', label: 'Club' }, { value: 'ACADEMY', label: 'Academy' }, { value: 'FEDERATION', label: 'Federation' }]}
          value={kind}
          onChange={setKind}
        />
        <div className="field">
          <label htmlFor="org-email">Org email (they sent you)</label>
          <input id="org-email" className="input" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {kind === 'CLUB' ? (
          <>
            <div className="field">
              <label htmlFor="org-club-country">Country</label>
              <select id="org-club-country" className="select" value={teamCountry} onChange={(e) => { setTeamCountry(e.target.value); setTeamId('') }}>
                <option value="">All countries</option>
                {arabCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="org-club">Club</label>
              <select id="org-club" className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
                <option value="">Select club…</option>
                {visibleTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </>
        ) : kind === 'ACADEMY' ? (
          <>
            <div className="field">
              <label htmlFor="org-academy-country">Country</label>
              <select id="org-academy-country" className="select" value={teamCountry} onChange={(e) => { setTeamCountry(e.target.value); setAcademyId('') }}>
                <option value="">All countries</option>
                {arabCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="org-academy">Academy</label>
              <select id="org-academy" className="select" value={academyId} onChange={(e) => setAcademyId(e.target.value)} required>
                <option value="">Select academy…</option>
                {(teamCountry ? academies.filter((a) => String(a.country) === String(teamCountry)) : academies)
                  .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </>
        ) : (
          <div className="field">
            <label htmlFor="org-federation">Federation country</label>
            <select id="org-federation" className="select" value={countryId} onChange={(e) => setCountryId(e.target.value)} required>
              <option value="">Select country…</option>
              {arabCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {error && (
          <div role="alert" style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '10px 12px', fontSize: 13 }}>{error}</div>
        )}
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ height: 40 }}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>

      {result && (
        <div role="status" style={{ marginTop: 18, border: '2px solid var(--asw-gold)', padding: '16px 16px' }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Account created — send these credentials</div>
          <div className="asw-num" style={{ fontSize: 14, lineHeight: 1.8 }}>
            Username: <strong>{result.username}</strong><br />
            Password: <strong>{result.password}</strong>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy credentials'}</button>
            <span className="micro" style={{ color: 'var(--asw-slow)' }}>The password is shown only once.</span>
          </div>
        </div>
      )}
    </div>
  )
}

function SiteFeatures() {
  const { features, refreshFeatures } = useFeatures()
  const [busy, setBusy] = useState(null) // key or group id being saved

  const save = async (patch, busyKey) => {
    setBusy(busyKey)
    try {
      await updateFeatures(patch)
      refreshFeatures()
    } catch {
      notify('Failed to update — try again')
    } finally {
      setBusy(null)
    }
  }
  const toggle = (key) => save({ [key]: !(features[key] !== false) }, key)
  const setGroup = (group, enabled) =>
    save(Object.fromEntries(group.items.map(([key]) => [key, enabled])), group.id)

  return (
    <div>
      <div className="micro" style={{ marginBottom: 14 }}>
        Hidden items disappear from menus, pages and tab bars for visitors. You (admin) always see everything — hidden tabs show dimmed — so you can prepare content before launch.
      </div>
      {FEATURE_GROUPS.map((group) => {
        const hiddenCount = group.items.filter(([key]) => features[key] === false).length
        return (
          <div key={group.id} style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
              <div className="kicker">{group.label}</div>
              <span className="micro" style={{ color: hiddenCount ? 'var(--asw-slow)' : 'var(--color-neutral-700)' }}>
                {hiddenCount ? `${hiddenCount} hidden` : 'all visible'}
              </span>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn btn-secondary" style={{ height: 26, fontSize: 11 }} disabled={busy === group.id}
                aria-label={`Show all in ${group.label}`} onClick={() => setGroup(group, true)}>Show all</button>
              <button type="button" className="btn btn-secondary" style={{ height: 26, fontSize: 11 }} disabled={busy === group.id}
                aria-label={`Hide all in ${group.label}`} onClick={() => setGroup(group, false)}>Hide all</button>
            </div>
            <div className="micro" style={{ marginBottom: 10, color: 'var(--color-neutral-700)' }}>{group.hint}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {group.items.map(([key, label]) => {
                const on = features[key] !== false
                return (
                  <div key={key} className="hair" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', border: '1px solid var(--color-divider)', minWidth: 190, opacity: on ? 1 : 0.75 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
                      <div className="micro" style={{ color: on ? 'var(--asw-fast, var(--asw-fast))' : 'var(--color-neutral-700)' }}>
                        {on ? 'Visible' : 'Hidden'}
                      </div>
                    </div>
                    {/* Von Restorff: several items can be hidden at once, so "Show" is outlined, not a solid primary each */}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ height: 28, fontSize: 12, ...(on ? {} : { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }) }}
                      aria-label={`${on ? 'Hide' : 'Show'} ${label}`}
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
      })}
    </div>
  )
}

function PhotoQueue({ onCount }) {
  const [requests, setRequests] = useState(null)
  const [selected, setSelected] = useState(new Set())

  const load = () => {
    getPhotoRequests({ status: 'PENDING' })
      .then((res) => setRequests(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRequests([]))
  }
  useEffect(load, [])
  useEffect(() => { if (requests) onCount?.(requests.length) }, [requests, onCount])

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const approveOne = async (id) => {
    try { await approvePhotoRequest(id) } catch { notify('The photo could not be approved. Please try again.'); return }
    setRequests((prev) => prev.filter((r) => r.id !== id))
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  const rejectOne = async (id) => {
    try { await rejectPhotoRequest(id) } catch { notify('The photo could not be rejected. Please try again.'); return }
    setRequests((prev) => prev.filter((r) => r.id !== id))
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  const bulkApprove = async () => {
    if (!selected.size) return
    try { await bulkApprovePhotos([...selected]) } catch { notify('The photos could not be approved. Please try again.'); return }
    setSelected(new Set())
    load()
  }

  const bulkReject = async () => {
    if (!selected.size) return
    // bulk reject cannot be undone from here, so ask first
    if (!window.confirm(`Reject ${selected.size} photo${selected.size === 1 ? '' : 's'}?`)) return
    try { await bulkRejectPhotos([...selected]) } catch { notify('The photos could not be rejected. Please try again.'); return }
    setSelected(new Set())
    load()
  }

  if (!requests) return <Loading label="Loading photo requests" />
  if (requests.length === 0) return <Done title="No photo requests waiting">New photos sent by swimmers and clubs will appear here.</Done>

  return (
    <div>
      {/* Working Memory + Fitts's Law: the bulk bar is always there, says how many
          are selected, and its buttons name the number they act on */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="asw-num" style={{ fontSize: 13, fontWeight: 700 }}>{selected.size} of {requests.length} selected</span>
        {selected.size < requests.length
          ? <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setSelected(new Set(requests.map((r) => r.id)))}>Select all</button>
          : <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setSelected(new Set())}>Clear selection</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} disabled={!selected.size} onClick={bulkReject}>Reject {selected.size || ''}</button>
        <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} disabled={!selected.size} onClick={bulkApprove}>Approve {selected.size || ''}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
        {requests.map((r) => (
          <div key={r.id} style={{
            border: selected.has(r.id) ? '2px solid var(--color-accent)' : '1px solid var(--color-divider)',
            background: 'var(--color-surface)', overflow: 'hidden',
          }}>
            {/* only the photo selects the card, so only the photo shows the pointer */}
            <div onClick={() => toggle(r.id)} style={{ position: 'relative' }} role="button" tabIndex={0} className="row-link"
              aria-pressed={selected.has(r.id)} aria-label={`Select the photo for ${r.swimmer_name}`}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click() } }}>
              <img src={mediaUrl(r.photo)} alt={`New photo for ${r.swimmer_name}`} style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', display: 'block' }} />
              {selected.has(r.id) && (
                <div style={{ position: 'absolute', top: 6, left: 6, width: 20, height: 20, background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>✓</div>
              )}
            </div>
            <div style={{ padding: '6px 8px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Link to={`/swimmers/${r.swimmer_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.swimmer_name}</Link>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {/* Von Restorff: outlined per card; the solid primary is "Approve all" above */}
                <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 32, fontSize: 12, padding: 0, borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }} aria-label={`Approve the photo for ${r.swimmer_name}`} title="Approve" onClick={() => approveOne(r.id)}>✓</button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 32, fontSize: 12, padding: 0 }} aria-label={`Reject the photo for ${r.swimmer_name}`} title="Reject" onClick={() => rejectOne(r.id)}>✕</button>
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
      notify(`${name.trim()} added to the partners strip.`)
      setName(''); setWebsite(''); setFile(null)
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
      notify('Failed to update — try again')
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
      notify('Failed to delete — try again')
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
      notify('Failed to reorder — try again')
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
          <label htmlFor="partner-name">Partner name</label>
          <input id="partner-name" className="input" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Speedo" />
        </div>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="partner-website">Website (optional)</label>
          <input id="partner-website" className="input" inputMode="url" autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label>Logo image</label>
          <CropUpload aspect="original" onChange={setFile} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ height: 40 }}>
          {saving ? 'Adding…' : 'Add partner'}
        </button>
      </form>
      {error && <div className="error-box" role="alert" style={{ marginBottom: 14, maxWidth: 720 }}>{error}</div>}

      {!partners ? (
        <Loading label="Loading partners" />
      ) : partners.length === 0 ? (
        <Empty label="No partners yet" hint="Fill in the name and logo above, then press Add partner." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {partners.map((p, i) => (
            <div key={p.id} className="hair-b" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', flexWrap: 'wrap' }}>
              <div style={{ width: 120, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-divider)', background: '#fff', flex: 'none' }}>
                {p.logo ? <img src={mediaUrl(p.logo)} alt={p.name} style={{ maxHeight: 34, maxWidth: 104, objectFit: 'contain' }} /> : <span className="micro">no logo</span>}
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{p.website} ↗</a>}
                <div className="micro" style={{ color: p.is_active ? 'var(--asw-fast, var(--asw-fast))' : 'var(--color-neutral-700)' }}>
                  {p.is_active ? 'Visible on site' : 'Hidden'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button type="button" className="btn btn-secondary btn-icon" disabled={busyId === p.id || i === 0} onClick={() => move(p, -1)} title="Move up" aria-label="Move up">↑</button>
                <button type="button" className="btn btn-secondary btn-icon" disabled={busyId === p.id || i === partners.length - 1} onClick={() => move(p, 1)} title="Move down" aria-label="Move down">↓</button>
                {/* Von Restorff: "Add partner" is this section's one solid primary */}
                <button type="button" className="btn btn-secondary" style={{ height: 30, fontSize: 12, ...(p.is_active ? {} : { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }) }} aria-label={`${p.is_active ? 'Hide' : 'Show'} ${p.name}`} disabled={busyId === p.id} onClick={() => toggleActive(p)}>
                  {p.is_active ? 'Hide' : 'Show'}
                </button>
                <button type="button" className="btn btn-secondary" style={{ height: 30, fontSize: 12 }} aria-label={`Delete ${p.name}`} disabled={busyId === p.id} onClick={() => remove(p)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const MODEL_LABELS = {
  'swimmers.swimmer': 'Swimmer',
  'championships.result': 'Result',
  'championships.championship': 'Meet',
  'records.record': 'Record',
  'core.country': 'Country',
}
const ACTION_LABELS = { create: 'Added', update: 'Edited', delete: 'Deleted' }

function fmtWhen(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}
const dayOf = (iso) => (iso ? new Date(iso).toDateString() : '')
function dayLabel(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Earlier'
  const today = new Date()
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function EditHistory() {
  const [log, setLog] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = () => {
    getChangeLog({ page_size: 40 })
      .then((res) => setLog(Array.isArray(res.data) ? res.data : res.data?.results || []))
      .catch(() => setLog([]))
  }
  useEffect(load, [])

  const undo = async (entry) => {
    const what = MODEL_LABELS[entry.model_label] || entry.model_label
    if (!window.confirm(`Undo this ${(ACTION_LABELS[entry.action] || entry.action).toLowerCase()} on ${what} “${entry.object_repr}”?`)) return
    setBusyId(entry.id)
    try {
      await revertChange(entry.id)
      notify('Edit undone. The previous values are back.')
      load()
    } catch (err) {
      notify(err.response?.data?.error || 'Undo failed — please try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="micro" style={{ marginBottom: 14 }}>
        Every manual edit you make (times, swimmers, meets, records) is logged here. Made a mistake? Hit Undo to restore the previous values — medals and rankings recompute automatically.
      </div>
      {!log ? (
        <Loading label="Loading edit history" />
      ) : log.length === 0 ? (
        <Empty label="No recent edits" hint="Manual edits to times, swimmers, meets and records will be listed here." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {log.map((e, i) => (
            <div key={e.id}>
            {/* Chunking: the 40 newest edits are split by day */}
            {dayOf(e.created_at) !== dayOf(log[i - 1]?.created_at) && (
              <div className="kicker" style={{ margin: i ? '18px 0 2px' : '0 0 2px' }}>{dayLabel(e.created_at)}</div>
            )}
            <div className="hair-b" style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '12px 0', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>{ACTION_LABELS[e.action] || e.action}</span>
                  {' '}
                  <span className="micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{MODEL_LABELS[e.model_label] || e.model_label}</span>
                  {' — '}
                  <span style={{ fontWeight: 600 }}>{e.object_repr}</span>
                </div>
                {e.action === 'update' && e.pretty_changes?.length > 0 && (
                  <div className="micro" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 4, lineHeight: 1.6 }}>
                    {e.pretty_changes.map((c) => (
                      <div key={c.field}>
                        <span style={{ opacity: 0.7 }}>{c.label}:</span>{' '}
                        <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{String(c.old)}</span>{' → '}
                        <span style={{ fontWeight: 600 }}>{String(c.new)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="micro" style={{ marginTop: 4 }}>
                  {fmtWhen(e.created_at)}{e.user_name ? ` · ${e.user_name}` : ''}
                </div>
              </div>
              <button type="button" className="btn btn-secondary" style={{ height: 30, fontSize: 12 }} disabled={busyId === e.id} onClick={() => undo(e)}>
                {busyId === e.id ? 'Undoing…' : 'Undo'}
              </button>
            </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const TOOLS = [
  ['Import results', '/import', 'Upload meet files, scrape federations, fix duplicates'],
  ['Name matching', '/admin/name-match', 'Link Arabic-named swimmers to English profiles'],
  ['Reports', '/reports', 'Medals, rankings, records and participation tables'],
  ['Website analytics', '/admin/analytics', 'Visitors, page views and traffic sources'],
]

export default function AdminDashboard() {
  // Hick's Law: the page used to be eight stacked sections with the two work
  // queues at the very bottom. It is now four tabs, opening on what is waiting.
  const [tab, setTab] = useState('inbox')
  const [claimCount, setClaimCount] = useState(null)
  const [photoCount, setPhotoCount] = useState(null)
  const waiting = (claimCount || 0) + (photoCount || 0)
  const counted = claimCount !== null && photoCount !== null

  return (
    <div>
      <PageHead kicker="Admin" title="Dashboard" sub="Requests waiting for you, site settings and admin tools." />

      {/* Common Region + Similarity: the other admin pages are one row of
          identical link tiles (no solid buttons competing with the tasks below) */}
      <nav aria-label="Admin tools" className="content-tools rule-b">
        {TOOLS.map(([label, to, hint]) => (
          <Link key={to} to={to}>
            <strong>{label} →</strong>
            <span>{hint}</span>
          </Link>
        ))}
      </nav>

      <div className="tabbar rule-b">
        <Seg
          tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'inbox', label: counted && waiting > 0 ? `To review (${waiting})` : 'To review' },
            { value: 'site', label: 'Site sections & partners' },
            { value: 'accounts', label: 'Accounts' },
            { value: 'history', label: 'Edit history' },
          ]}
        />
      </div>

      {tab === 'inbox' && (
        <>
          {/* Zeigarnik Effect / Peak-End Rule: unfinished work is counted; an empty inbox says so */}
          {counted && (
            <div className="pad" style={{ paddingBottom: 0 }}>
              {waiting > 0 ? (
                <div className="content-todo" role="status" style={{ marginBottom: 0 }}>
                  <strong>{waiting} request{waiting === 1 ? '' : 's'} waiting</strong> — {claimCount} profile claim{claimCount === 1 ? '' : 's'}, {photoCount} photo{photoCount === 1 ? '' : 's'}.
                </div>
              ) : (
                <Done title="All caught up">Nothing is waiting for review.</Done>
              )}
            </div>
          )}
          <div className="pad rule-b">
            <SectHead title={`Profile claims${claimCount ? ` · ${claimCount}` : ''}`} />
            <ClaimsQueue onCount={setClaimCount} />
          </div>
          <div className="pad">
            <SectHead title={`Photo change requests${photoCount ? ` · ${photoCount}` : ''}`} />
            <PhotoQueue onCount={setPhotoCount} />
          </div>
        </>
      )}

      {tab === 'site' && (
        <>
          <div className="pad rule-b">
            <SectHead title="Site Sections" />
            <SiteFeatures />
          </div>
          <div className="pad">
            <SectHead title="Partners" />
            <PartnersManager />
          </div>
        </>
      )}

      {tab === 'accounts' && (
        <div className="pad">
          <SectHead title="Create Club / Academy / Federation Account" />
          <OrgAccountForm />
        </div>
      )}

      {tab === 'history' && (
        <div className="pad">
          <SectHead title="Recent Edits · Undo" />
          <EditHistory />
        </div>
      )}
    </div>
  )
}
