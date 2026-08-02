import api from './client'

export const getRankings = (params) => api.get('/rankings/', { params })
