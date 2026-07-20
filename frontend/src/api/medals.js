import api from './client'

export const getMedals = (params) => api.get('/medals/', { params })
export const getMedalSummary = (params) => api.get('/medals/summary/', { params })
export const createMedal = (data) => api.post('/medals/', data)
export const deleteMedal = (id) => api.delete(`/medals/${id}/`)
export const getMedalClubSummary = (params) => api.get('/medals/club-summary/', { params })
