import api from './client'

export const getSwimmerDna = (id, params) => api.get(`/lab/swimmer/${id}/dna/`, { params })
export const getSwimmerChase = (id, params) => api.get(`/lab/swimmer/${id}/chase/`, { params })
export const getSwimmerRivals = (id, params) => api.get(`/lab/swimmer/${id}/rivals/`, { params })
export const getSwimmerConsistency = (id, params) => api.get(`/lab/swimmer/${id}/consistency/`, { params })
export const getResultXray = (id, params) => api.get(`/lab/result/${id}/xray/`, { params })
export const getWhatIf = (params) => api.get('/lab/whatif/', { params })
export const getOnePercentClub = (params) => api.get('/lab/one-percent-club/', { params })
export const getDepthRanking = (params) => api.get('/lab/depth-ranking/', { params })
