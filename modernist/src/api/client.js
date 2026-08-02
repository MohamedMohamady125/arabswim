import axios from 'axios'

// Public read-only site — no auth. Defaults to the production backend.
const API_BASE =
  import.meta.env.VITE_API_URL ||
  'https://arabswim-backend-production.up.railway.app/api/v1'

const api = axios.create({ baseURL: API_BASE })

export default api
export { API_BASE }
