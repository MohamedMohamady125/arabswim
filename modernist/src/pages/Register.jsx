import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { register as registerApi } from '../api/core'

export default function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
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
      const res = await registerApi({ username, email, password })
      login(res.data.access, res.data.refresh)
      navigate('/swimmers')
    } catch (err) {
      const data = err.response?.data
      const msg =
        data?.username?.[0] || data?.email?.[0] || data?.password?.[0] || data?.error ||
        'Could not create the account'
      setError(msg)
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
      <div className="kicker" style={{ marginBottom: 8 }}>Create account</div>
      <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginBottom: 20 }}>
        Athletes: after signing up, find your profile in the swimmers section and claim it.
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div style={{ border: '1px solid var(--asw-slow)', color: 'var(--asw-slow)', padding: '10px 12px', fontSize: 13 }}>
            {error}
          </div>
        )}
        <div className="field">
          <label>Username</label>
          <input className="input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ height: 40 }}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <div style={{ marginTop: 18, fontSize: 13, color: 'var(--color-neutral-700)' }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </div>
    </div>
  )
}
