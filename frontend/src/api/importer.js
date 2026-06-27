import api from './client'

export const uploadFile = (formData) => api.post('/import/upload/', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 120000,
})
export const matchSwimmers = (importId) => api.post('/import/match/', { import_id: importId })
export const confirmImport = (data) => api.post('/import/confirm/', data)
export const getDuplicates = () => api.get('/import/duplicates/')
export const mergeSwimmers = (keepId, removeId) => api.post('/import/merge/', { keep_id: keepId, remove_id: removeId })
export const getImportHistory = () => api.get('/import/history/')
