import api from './client'

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

export const getArticles = (params) => api.get('/news/', { params })
export const getArticle = (id) => api.get(`/news/${id}/`)
export const createArticle = (data) => api.post('/news/', data, multipart)
export const updateArticle = (id, data) => api.patch(`/news/${id}/`, data, multipart)
export const deleteArticle = (id) => api.delete(`/news/${id}/`)
