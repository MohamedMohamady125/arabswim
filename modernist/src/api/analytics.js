import api from './client'

export const trackPageView = (payload) => api.post('/analytics/track/', payload)
export const getAnalyticsSummary = (days) => api.get('/analytics/summary/', { params: { days } })
