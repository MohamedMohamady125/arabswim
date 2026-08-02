import api from './client'

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

export const getListings = (params) => api.get('/market/listings/', { params })
export const getListing = (id) => api.get(`/market/listings/${id}/`)
export const createListing = (data) => api.post('/market/listings/', data)
export const updateListing = (id, data) => api.patch(`/market/listings/${id}/`, data)
export const deleteListing = (id) => api.delete(`/market/listings/${id}/`)
export const uploadListingImages = (id, formData) =>
  api.post(`/market/listings/${id}/upload-image/`, formData, multipart)
export const deleteListingImage = (imageId) => api.delete(`/market/images/${imageId}/`)
