import api from './client'

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

export const getInductees = (params) => api.get('/hall-of-fame/', { params })
export const getInductee = (id) => api.get(`/hall-of-fame/${id}/`)
export const createInductee = (data) => api.post('/hall-of-fame/', data, multipart)
export const updateInductee = (id, data) => api.patch(`/hall-of-fame/${id}/`, data, multipart)
export const deleteInductee = (id) => api.delete(`/hall-of-fame/${id}/`)
