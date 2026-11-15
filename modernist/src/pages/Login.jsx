import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMe, login as loginApi } from '../api/core'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // Postel's Law: tolerate stray spaces around the username (never the password)
      const res = await loginApi(username.trim(), password)
      login(res.data.access, res.data.refresh)
      const user = (await getMe()).data
      if (user.role === 'ADMIN') navigate('/import')
      else if (user.role === 'CLUB' && user.team) navigate(`/teams/${user.team}`)
      else if (user.role === 'ATHLETE' && user.swimmer) navigate(`/swimmers/${user.swimmer}`)
      else navigate('/')
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '64px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <img src="/logo.png" alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>ARABSWIM</span>
      </div>
      {/* real page heading for assistive tech; the kicker below keeps the look */}
      <h1 className="sr-only">Sign in</h1>
      <div className="kicker" aria-hidden="true" style={{ marginBottom: 20 }}>Sign in</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div role="alert" style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '10px 12px', fontSize: 13 }}>
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="login-username">Username</label>
          <input id="login-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} className="input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input id="login-password" name="password" autoComplete="current-password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ height: 40 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div style={{ marginTop: 18, fontSize: 13, color: 'var(--color-neutral-700)' }}>
        Are you an athlete? <Link to="/register">Create an account</Link> to claim your profile.
      </div>
    </div>
  )
}
