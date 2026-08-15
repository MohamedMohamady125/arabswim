import api from './client'

export const createClaim = (formData) => api.post('/claims/', formData)
export const getMyClaims = () => api.get('/claims/mine/')
export const getClaims = (params) => api.get('/claims/', { params })
export const approveClaim = (id) => api.post(`/claims/${id}/approve/`)
export const declineClaim = (id, note) => api.post(`/claims/${id}/decline/`, { note })

// Photo change requests
export const submitPhotoRequest = (formData) => api.post('/photo-requests/', formData)
export const getPhotoRequests = (params) => api.get('/photo-requests/', { params })
export const approvePhotoRequest = (id) => api.post(`/photo-requests/${id}/approve/`)
export const rejectPhotoRequest = (id) => api.post(`/photo-requests/${id}/reject/`)
export const bulkApprovePhotos = (ids) => api.post('/photo-requests/bulk-approve/', { ids })
export const bulkRejectPhotos = (ids) => api.post('/photo-requests/bulk-reject/', { ids })
