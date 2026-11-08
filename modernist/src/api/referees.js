import api from './client'

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

export const getReferees = (params) => api.get('/referees/', { params })
export const getReferee = (id) => api.get(`/referees/${id}/`)
export const createReferee = (data) => api.post('/referees/', data, multipart)
export const updateReferee = (id, data) => api.patch(`/referees/${id}/`, data, multipart)
export const deleteReferee = (id) => api.delete(`/referees/${id}/`)
