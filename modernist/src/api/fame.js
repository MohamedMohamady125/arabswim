import api from './client'

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

export const getInductees = (params) => api.get('/hall-of-fame/', { params })
export const getInductee = (id) => api.get(`/hall-of-fame/${id}/`)
export const createInductee = (data) => api.post('/hall-of-fame/', data, multipart)
export const updateInductee = (id, data) => api.patch(`/hall-of-fame/${id}/`, data, multipart)
export const deleteInductee = (id) => api.delete(`/hall-of-fame/${id}/`)

// Arabswim Awards voting
export const getOpenPolls = () => api.get('/awards/vote/')
export const getVote = (slug, voter) => api.get(`/awards/vote/${slug}/`, { params: { voter } })
export const castVote = (slug, nominee, voter) => api.post(`/awards/vote/${slug}/`, { nominee, voter })
export const getPolls = () => api.get('/awards/polls/')
export const createPoll = (data) => api.post('/awards/polls/', data)
export const updatePoll = (id, data) => api.patch(`/awards/polls/${id}/`, data)
export const deletePoll = (id) => api.delete(`/awards/polls/${id}/`)
export const announcePoll = (id, nominee) => api.post(`/awards/polls/${id}/announce/`, nominee ? { nominee } : {})
export const createNominee = (data) => api.post('/awards/nominees/', data, multipart)
export const updateNominee = (id, data) => api.patch(`/awards/nominees/${id}/`, data, multipart)
export const deleteNominee = (id) => api.delete(`/awards/nominees/${id}/`)
