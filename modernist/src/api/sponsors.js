import api from './client'

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

export const getSponsors = (params) => api.get('/sponsors/', { params })
export const getSponsor = (id) => api.get(`/sponsors/${id}/`)
export const createSponsor = (data) => api.post('/sponsors/', data, multipart)
export const updateSponsor = (id, data) => api.patch(`/sponsors/${id}/`, data, multipart)
export const deleteSponsor = (id) => api.delete(`/sponsors/${id}/`)
