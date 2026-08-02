import api from './client'

export const createClaim = (formData) => api.post('/claims/', formData)
export const getMyClaims = () => api.get('/claims/mine/')
export const getClaims = (params) => api.get('/claims/', { params })
export const approveClaim = (id) => api.post(`/claims/${id}/approve/`)
export const declineClaim = (id, note) => api.post(`/claims/${id}/decline/`, { note })
