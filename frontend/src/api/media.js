import api from './client'

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

export const getAlbums = (params) => api.get('/media/albums/', { params })
export const getAlbum = (id) => api.get(`/media/albums/${id}/`)
export const createAlbum = (data) => api.post('/media/albums/', data)
export const updateAlbum = (id, data) => api.patch(`/media/albums/${id}/`, data)
export const deleteAlbum = (id) => api.delete(`/media/albums/${id}/`)

export const createMediaItem = (data) => api.post('/media/items/', data)
export const updateMediaItem = (id, data) => api.patch(`/media/items/${id}/`, data)
export const deleteMediaItem = (id) => api.delete(`/media/items/${id}/`)
export const uploadPhotos = (formData) => api.post('/media/items/upload/', formData, multipart)
export const getOrCreateAlbumForChampionship = (championshipId) => api.post('/media/albums/for-championship/', { championship: championshipId })
