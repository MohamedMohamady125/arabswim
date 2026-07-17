import api from './client'

export const getSwimmers = (params) => api.get('/swimmers/', { params })
export const getSwimmer = (id) => api.get(`/swimmers/${id}/`)
export const createSwimmer = (data) => api.post('/swimmers/', data)
export const updateSwimmer = (id, data) => api.patch(`/swimmers/${id}/`, data)
export const deleteSwimmer = (id) => api.delete(`/swimmers/${id}/`)
export const searchSwimmers = (q) => api.get('/swimmers/search/', { params: { q } })
export const getSwimmerBirthdays = (month) => api.get('/swimmers/birthdays/', { params: { month } })
export const uploadSwimmerPhoto = (id, formData) => api.post(`/swimmers/${id}/upload_photo/`, formData)
export const getSwimmerEvents = (id) => api.get(`/swimmers/${id}/events/`)
export const getSwimmerEventHistory = (id, eventId, pool) => api.get(`/swimmers/${id}/events/${eventId}/history/`, { params: pool ? { pool } : {} })
export const getSwimmerProfileStats = (id) => api.get(`/swimmers/${id}/profile-stats/`)
