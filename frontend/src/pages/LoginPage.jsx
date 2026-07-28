import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { login as loginApi } from '../api/core'
import Button from '../components/ui/Button'
import { Input, FieldLabel } from '../components/ui/Input'

export default function LoginPage() {
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
      const res = await loginApi(username, password)
      login(res.data.access, res.data.refresh)
      navigate('/')
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink-950 relative flex items-center justify-center px-4">
      {/* aqua accent glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(60% 40% at 50% 0%, rgba(8,145,178,0.25), transparent 70%)' }}
      />
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-aqua-600 via-aqua-400 to-aqua-600" />

      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-lg shadow-pop p-6 sm:p-8 animate-fade-up">
          <div className="flex justify-center mb-4">
            <img src="/logo.webp" alt="ArabSwiM" className="h-16 w-16 rounded-full object-cover" />
          </div>
          <h1 className="text-title text-center text-ink-900">ArabSwiM Admin</h1>
          <p className="text-body-sm text-ink-400 text-center mt-1 mb-6">Sign in to manage the platform</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-neg/5 text-neg border border-neg/20 px-3 py-2.5 rounded-sm text-body-sm">{error}</div>
            )}
            <div>
              <FieldLabel>Username</FieldLabel>
              <Input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </div>
            <div>
              <FieldLabel>Password</FieldLabel>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            <Button type="submit" loading={loading} className="w-full">
              Sign in
            </Button>
          </form>
        </div>
        <div className="text-center mt-4">
          <Link to="/" className="inline-flex items-center gap-1.5 text-body-sm text-ink-400 hover:text-white transition-colors">
            <ArrowLeft size={14} />
            Back to the site
          </Link>
        </div>
      </div>
    </div>
  )
}
