import axios from 'axios'

// Public reads for everyone; JWT attached when the admin is signed in.
const API_BASE =
  import.meta.env.VITE_API_URL ||
  'https://arabswim-backend-production.up.railway.app/api/v1'

const api = axios.create({ baseURL: API_BASE })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken && !error.config._retry) {
        error.config._retry = true
        try {
          const res = await axios.post(`${API_BASE}/auth/refresh/`, { refresh: refreshToken })
          localStorage.setItem('access_token', res.data.access)
          error.config.headers.Authorization = `Bearer ${res.data.access}`
          return api(error.config)
        } catch { /* fall through to the anonymous retry below */ }
      }
      // Refresh impossible (no/dead refresh token): the stored login is
      // dead. Without this, the stale Bearer header 401s EVERY request —
      // including public reads — and the whole site renders empty until
      // localStorage is cleared by hand. Drop the tokens and retry the
      // request anonymously; public pages work logged-out, and admin-only
      // calls surface their own errors.
      // Gate on the request's OWN header, not localStorage: a page load fires
      // many requests at once and the first anonymous retry clears the
      // tokens — the rest must still retry, not reject.
      if (error.config.headers?.Authorization && !error.config._retryAnon) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        error.config._retryAnon = true
        delete error.config.headers.Authorization
        return api(error.config)
      }
    }
    return Promise.reject(error)
  }
)

export default api
export { API_BASE }
