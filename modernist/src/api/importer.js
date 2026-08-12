import api from './client'

export const uploadFile = (formData) => api.post('/import/upload/', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 120000,
})
export const matchSwimmers = (importId) => api.post('/import/match/', { import_id: importId })
export const confirmImport = (data) => api.post('/import/confirm/', data, { timeout: 120000 })
export const getConfirmJob = (jobId) => api.get(`/import/confirm/${jobId}/`)
export const getDuplicates = () => api.get('/import/duplicates/')
export const mergeSwimmers = (keepId, removeIds) =>
  api.post('/import/merge/', { keep_id: keepId, remove_ids: Array.isArray(removeIds) ? removeIds : [removeIds] })
export const getImportHistory = () => api.get('/import/history/')
export const getScrapeJobs = () => api.get('/import/scrape/')
export const startScrape = (url, pdfs = []) => {
  const fd = new FormData()
  fd.append('url', url)
  pdfs.forEach((f) => fd.append('name_pdfs', f))
  return api.post('/import/scrape/', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}
export const downloadScrape = (jobId) =>
  api.get(`/import/scrape/${jobId}/download/`, { responseType: 'blob', timeout: 120000 })
