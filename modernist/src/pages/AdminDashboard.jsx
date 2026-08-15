import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getClaims, approveClaim, declineClaim } from '../api/claims'
import { createOrgAccount, getCountries, updateFeatures } from '../api/core'
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
        <SectHead title="Pending Profile Claims" />
        <ClaimsQueue />
      </div>
      <div className="pad">
        <SectHead title="Create Club / Federation Account" />
        <OrgAccountForm />
      </div>
    </div>
  )
}
