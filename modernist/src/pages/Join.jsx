import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { acceptInvite, openInvite } from '../api/core'
import Flag from '../components/Flag'
import Pic from '../components/Pic'
import { Loading } from '../components/ui'

// What each kind of account is for — said in the entity's own terms
const KIND_COPY = {
  ACADEMY: { noun: 'academy', can: 'Add your logo, description, contact details, coaches and training times.' },
  CLUB: { noun: 'club', can: 'Add your logo, board, coaches, news and photos, and keep your club page up to date.' },
  FEDERATION: { noun: 'federation', can: 'Add your contact details, board and national team information.' },
  ATHLETE: { noun: 'profile', can: 'Add your photo and keep your swimmer profile up to date.' },
}

/**
 * /join/:token — the page behind an invite link. ArabSwim makes the link for
 * one academy, club, federation or swimmer; whoever opens it creates the
 * account that owns that page. One screen, two fields (Hick's Law).
 */
export default function Join() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { login, logout, isAuthed, user } = useAuth()
  const [invite, setInvite] = useState(null)   // null = loading
  const [missing, setMissing] = useState('')   // link not found / server unreachable
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    setInvite(null); setMissing('')
    openInvite(token)
      .then((res) => { if (alive) setInvite(res.data) })
      .catch((err) => {
        if (!alive) return
        setMissing(err?.response?.status === 404
          ? 'This link is not valid. Check that you copied all of it, or ask ArabSwim for a new one.'
          : 'We could not reach the server. Check your connection and open the link again.')
      })
    return () => { alive = false }
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErrors({})
    try {
      const res = await acceptInvite(token, { email: email.trim(), password })
      setDone(true)
      login(res.data.access, res.data.refresh)
      // Peak-End: land on their own page, with the setup guide open
      navigate(`${res.data.target.path}?welcome=1`, { replace: true })
    } catch (err) {
      const d = err?.response?.data
      setErrors(d?.errors || { form: d?.error || 'We could not reach the server. Check your connection and try again.' })
    } finally {
      setBusy(false)
    }
  }

  const shell = (children) => (
    <div style={{ maxWidth: 460, margin: '0 auto', padding: '56px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <img src="/logo.png" alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em' }}>ARABSWIM</span>
      </div>
      {children}
    </div>
  )

  if (missing) {
    return shell(
      <div role="alert">
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>This link does not work</h1>
        <p style={{ fontSize: 14, color: 'var(--color-neutral-700)' }}>{missing}</p>
      </div>,
    )
  }
  if (!invite) return shell(<Loading label="Opening your invitation" />)

  const t = invite.target
  const copy = t.is_academy
    ? { noun: 'academy', can: 'Add your logo, cover photo, social media, board, coaches, news and photos. Your swimmers are already listed.' }
    : (KIND_COPY[invite.kind] || KIND_COPY.CLUB)
  const badge = (
    <div className="join-badge">
      {invite.kind === 'FEDERATION' || !t.image
        ? <Flag code={t.flag_code} name={t.name} large />
        : <Pic kind={invite.kind === 'ATHLETE' ? 'person' : 'logo'} w={128} eager src={t.image} alt="" />}
    </div>
  )
  const who = (
    <div className="join-who">
      {badge}
      <div style={{ minWidth: 0 }}>
        <div className="kicker" style={{ marginBottom: 4 }}>{invite.kind_label} account</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{t.name}</div>
      </div>
    </div>
  )

  if (!invite.usable && !done) {
    return shell(
      <>
        {who}
        <div role="alert" style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '10px 12px', fontSize: 13, margin: '16px 0' }}>
          {invite.message}
        </div>
        <Link to="/login" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', height: 44, textDecoration: 'none' }}>Sign in</Link>
      </>,
    )
  }

  // Someone already signed in would otherwise create a second account by accident
  if (isAuthed && user && !done && !busy) {
    return shell(
      <>
        {who}
        <p style={{ fontSize: 14, margin: '16px 0' }}>
          You are signed in as <strong>{user.email || user.username}</strong>. This link creates a new account for {t.name}.
          Sign out first to use it.
        </p>
        <button type="button" className="btn btn-primary" style={{ height: 44 }} onClick={logout}>Sign out and continue</button>
      </>,
    )
  }

  return shell(
    <>
      <h1 style={{ fontSize: 24, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Create your account</h1>
      <p style={{ fontSize: 14, color: 'var(--color-neutral-700)', margin: '0 0 18px' }}>
        ArabSwim invited you to manage this {copy.noun} page. {copy.can}
      </p>
      {who}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }} noValidate>
        {errors.form && (
          <div role="alert" style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '10px 12px', fontSize: 13 }}>{errors.form}</div>
        )}
        <div className="field">
          <label htmlFor="join-email">Email</label>
          <input id="join-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            className="input" value={email} onChange={(e) => setEmail(e.target.value)} required
            aria-invalid={!!errors.email} aria-describedby="join-email-note" />
          <div id="join-email-note" className="join-note" style={errors.email ? { color: 'var(--asw-slow)' } : undefined}>
            {errors.email || 'You will sign in with this email.'}
          </div>
        </div>
        <div className="field">
          <label htmlFor="join-password">Password</label>
          {/* Postel's Law: one field with Show instead of typing it twice */}
          <div className="content-pw">
            <input id="join-password" name="password" type={show ? 'text' : 'password'} autoComplete="new-password"
              className="input" value={password} onChange={(e) => setPassword(e.target.value)} required
              aria-invalid={!!errors.password} aria-describedby="join-password-note" />
            <button type="button" className="btn btn-ghost" aria-pressed={show} onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
          </div>
          <div id="join-password-note" className="join-note" style={errors.password ? { color: 'var(--asw-slow)' } : undefined}>
            {errors.password || 'At least 8 characters, not only numbers.'}
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !email || !password} style={{ height: 44 }}>
          {busy ? 'Creating your account…' : 'Create account'}
        </button>
      </form>
      <div className="content-authnote">
        Already created it? <Link to="/login">Sign in</Link>. This link works once and is only for {t.name}.
      </div>
    </>,
  )
}
