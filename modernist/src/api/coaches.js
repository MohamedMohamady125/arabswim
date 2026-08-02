import api from './client'

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

export const getCoaches = (params) => api.get('/coaches/', { params })
export const getCoach = (id) => api.get(`/coaches/${id}/`)
export const createCoach = (data) => api.post('/coaches/', data, multipart)
export const updateCoach = (id, data) => api.patch(`/coaches/${id}/`, data, multipart)
export const deleteCoach = (id) => api.delete(`/coaches/${id}/`)
