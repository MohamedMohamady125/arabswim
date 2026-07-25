import api from './client'

export const getQualifyingStandards = (params) => api.get('/qualifying-standards/', { params })
export const getQualifyingStandard = (id) => api.get(`/qualifying-standards/${id}/`)
export const createQualifyingStandard = (data) => api.post('/qualifying-standards/', data)
export const updateQualifyingStandard = (id, data) => api.patch(`/qualifying-standards/${id}/`, data)
export const deleteQualifyingStandard = (id) => api.delete(`/qualifying-standards/${id}/`)
export const uploadQualifyingPdf = (id, formData) => api.post(`/qualifying-standards/${id}/upload-pdf/`, formData, { timeout: 120000 })
export const addQualifyingTime = (id, data) => api.post(`/qualifying-standards/${id}/add-time/`, data)
export const deleteQualifyingTime = (standardId, timeId) => api.delete(`/qualifying-standards/${standardId}/times/${timeId}/`)
