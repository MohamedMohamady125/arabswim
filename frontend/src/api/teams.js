import api from './client'

export const getTeams = (params) => api.get('/teams/', { params })
export const getTeam = (id) => api.get(`/teams/${id}/`)
export const createTeam = (data) => api.post('/teams/', data, { headers: { 'Content-Type': 'multipart/form-data' } })
export const updateTeam = (id, data) => api.patch(`/teams/${id}/`, data, { headers: { 'Content-Type': 'multipart/form-data' } })
export const deleteTeam = (id) => api.delete(`/teams/${id}/`)
export const getTeamProfile = (id) => api.get(`/teams/${id}/profile/`)
export const getTeamTimes = (id, params) => api.get(`/teams/${id}/times/`, { params })
export const getTeamMedals = (id) => api.get(`/teams/${id}/medals/`)
export const uploadTeamLogo = (id, formData) => api.post(`/teams/${id}/upload_logo/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const uploadTeamBanner = (id, formData) => api.post(`/teams/${id}/upload_banner/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const getTeamProgression = (id, params) => api.get(`/teams/${id}/progression/`, { params })
