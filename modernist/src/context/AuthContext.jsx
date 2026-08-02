import { createContext, useContext, useEffect, useState } from 'react'
import { getMe } from '../api/core'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('access_token'))
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(!!localStorage.getItem('access_token'))

  useEffect(() => {
    if (!token) {
      setUser(null)
      setAuthLoading(false)
      return
    }
    let alive = true
    setAuthLoading(true)
    getMe()
      .then((res) => { if (alive) setUser(res.data) })
      .catch(() => { if (alive) setUser(null) })
      .finally(() => { if (alive) setAuthLoading(false) })
    return () => { alive = false }
  }, [token])

  const login = (accessToken, refreshToken) => {
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('refresh_token', refreshToken)
    setToken(accessToken)
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setToken(null)
    setUser(null)
  }

  const refreshUser = async () => {
    try {
      const res = await getMe()
      setUser(res.data)
      return res.data
    } catch {
      return null
    }
  }

  const isAdmin = user?.role === 'ADMIN'
  const managesTeam = (team) => {
    if (!user || !team) return false
    if (isAdmin) return true
    if (user.role === 'CLUB') return user.team === team.id
    if (user.role === 'FEDERATION') return !!team.is_national_team && team.country === user.country
    return false
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        authLoading,
        isAuthed: !!token,
        isAdmin,
        mySwimmerId: user?.swimmer ?? null,
        managesTeam,
        refreshUser,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
