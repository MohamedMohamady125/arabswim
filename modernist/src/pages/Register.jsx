import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { register as registerApi } from '../api/core'
import { Stepper, notify } from '../components/ui'

export default function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [fieldErr, setFieldErr] = useState({})
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setFieldErr({})
    try {
      // Postel's Law: tolerate stray spaces (never trim the password)
      const res = await registerApi({ username: username.trim(), email: email.trim(), password })
      login(res.data.access, res.data.refresh)
      // Working Memory: the next step is repeated on the page they land on
      notify('Account created. Step 2: search for your name, open your profile and press "This is me — claim profile".')
      navigate('/swimmers')
    } catch (err) {
      const data = err.response?.data
      // each problem is shown under the field it belongs to
      const fe = {}
      for (const k of ['username', 'email', 'password']) {
        const v = data?.[k]
        if (v) fe[k] = Array.isArray(v) ? v.join(' ') : String(v)
      }
      setFieldErr(fe)
      if (!Object.keys(fe).length) {
        setError(data?.error || data?.detail || (err.response ? 'The account could not be created. Check the details and try again.' : 'We could not reach the server. Check your connection and try again.'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="content-auth-wrap">
      {/* the header already carries the brand lockup; the page leads with its heading */}
      <h1 style={{ fontSize: 24, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Create account</h1>
      <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginBottom: 18 }}>
        For swimmers who want to manage their own profile. Three short steps, about a minute.
      </div>
      {/* Goal-Gradient Effect: the whole path is visible from the first screen */}
      <Stepper steps={['Create account', 'Find your profile', 'Claim it']} current={0} />
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div role="alert" style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '10px 12px', fontSize: 13 }}>
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="register-username">Username</label>
          <input id="register-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} className="input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus aria-invalid={!!fieldErr.username} />
          {fieldErr.username && <div role="alert" className="content-fielderr">{fieldErr.username}</div>}
        </div>
        <div className="field">
          <label htmlFor="register-email">Email</label>
          <input id="register-email" name="email" autoComplete="email" inputMode="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-invalid={!!fieldErr.email} />
          {fieldErr.email && <div role="alert" className="content-fielderr">{fieldErr.email}</div>}
        </div>
        <div className="field">
          <label htmlFor="register-password">Password</label>
          <div className="content-pw">
            <input id="register-password" name="password" autoComplete="new-password" className="input" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} aria-invalid={!!fieldErr.password} aria-describedby="register-password-hint" />
            <button type="button" className="btn btn-ghost" aria-pressed={show} onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
          </div>
          {/* the rule is checked while typing, not after submitting */}
          <div id="register-password-hint" className="content-fieldhint" style={password.length >= 8 ? { color: 'var(--asw-fast)' } : undefined}>
            {password.length >= 8 ? '✓ At least 8 characters' : `At least 8 characters${password.length ? ` — ${8 - password.length} more` : ''}`}
          </div>
          {fieldErr.password && <div role="alert" className="content-fielderr">{fieldErr.password}</div>}
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ height: 44 }}>
          {loading ? 'Creating…' : 'Create account and find my profile →'}
        </button>
      </form>
      <div className="content-authnote">
        Already have an account? <Link to="/login">Sign in</Link>
      </div>
    </div>
  )
}
