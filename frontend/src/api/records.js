import api from './client'

export const getRecords = (params) => api.get('/records/', { params })
export const getNewRecords = () => api.get('/records/new/')
export const createRecord = (data) => api.post('/records/', data)
export const updateRecord = (id, data) => api.patch(`/records/${id}/`, data)
export const deleteRecord = (id) => api.delete(`/records/${id}/`)
export const getComputedRecords = (params) => api.get('/records/computed/', { params })
export const getClassifications = (params) => api.get('/classifications/', { params })
export const getSubClassifications = (params) => api.get('/sub-classifications/', { params })
