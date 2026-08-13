import api from './client'

export const getReportOverview = (params) => api.get('/reports/overview/', { params })
export const getReportMedalTable = (params) => api.get('/reports/medal-table/', { params })
export const getReportTopTimes = (params) => api.get('/reports/top-times/', { params })
export const getReportParticipation = (params) => api.get('/reports/participation/', { params })
export const getReportRecords = (params) => api.get('/reports/records/', { params })
export const askReport = (question) => api.post('/reports/ask/', { question })
