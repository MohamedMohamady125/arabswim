import api from './client'

export const getReportOverview = (params) => api.get('/reports/overview/', { params })
export const getReportMedalTable = (params) => api.get('/reports/medal-table/', { params })
export const getReportTopTimes = (params) => api.get('/reports/top-times/', { params })
export const getReportParticipation = (params) => api.get('/reports/participation/', { params })
export const getReportRecords = (params) => api.get('/reports/records/', { params })
export const getReportSwimmer = (params) => api.get('/reports/swimmer/', { params })
export const getReportAge = (params) => api.get('/reports/age/', { params })
export const getReportImprovement = (params) => api.get('/reports/improvement/', { params })
export const getReportHighPerformance = (params) => api.get('/reports/high-performance/', { params })
export const askReport = (question) => api.post('/reports/ask/', { question })
