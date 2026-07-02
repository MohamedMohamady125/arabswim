import api from './client'

export const getCountries = (params) => api.get('/countries/', { params })
export const createCountry = (data) => api.post('/countries/', data)
export const updateCountry = (id, data) => api.patch(`/countries/${id}/`, data)
export const deleteCountry = (id) => api.delete(`/countries/${id}/`)
export const getEvents = () => api.get('/events/')
export const getMe = () => api.get('/auth/me/')
export const login = (username, password) => api.post('/auth/login/', { username, password })
