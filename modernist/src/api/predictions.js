import api from './client'

export const getPredictions = () => api.get('/predictions/')
export const getPrediction = (id) => api.get(`/predictions/${id}/`)
export const getPredictionEvent = (id, params) => api.get(`/predictions/${id}/event/`, { params })
export const recomputePrediction = (id) => api.post(`/predictions/${id}/recompute/`)
export const getPredictionEntries = (id) => api.get(`/predictions/${id}/entries/`)
export const addPredictionEntry = (id, data) => api.post(`/predictions/${id}/entries/`, data)
export const updatePredictionEntry = (id, entryId, data) => api.patch(`/predictions/${id}/entries/${entryId}/`, data)
export const deletePredictionEntry = (id, entryId) => api.delete(`/predictions/${id}/entries/${entryId}/`)
export const seedPredictionEntries = (id) => api.post(`/predictions/${id}/entries/seed/`)
