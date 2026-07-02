import api from './client'

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

export const getAcademies = (params) => api.get('/academies/', { params })
export const getAcademy = (id) => api.get(`/academies/${id}/`)
export const createAcademy = (data) => api.post('/academies/', data, multipart)
export const updateAcademy = (id, data) => api.patch(`/academies/${id}/`, data, multipart)
export const deleteAcademy = (id) => api.delete(`/academies/${id}/`)
