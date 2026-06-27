import api from './client'

export const getCountries = () => api.get('/countries/')
export const getEvents = () => api.get('/events/')
export const getMe = () => api.get('/auth/me/')
export const login = (username, password) => api.post('/auth/login/', { username, password })
