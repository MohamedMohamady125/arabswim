import api from './client'

// 15 min: giant multi-meet files (190 MB raw CSV dumps) upload + parse in one request
export const uploadFile = (formData) => api.post('/import/upload/', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 900000,
})
export const matchSwimmers = (importId, includeAll = false) => api.post('/import/match/', { import_id: importId, include_all: includeAll }, { timeout: 900000 })
export const matchSwimmersBatch = (importIds, includeAll = false) =>
  api.post('/import/match/', { import_ids: importIds, include_all: includeAll }, { timeout: 900000 })
export const confirmImport = (data) => api.post('/import/confirm/', data, { timeout: 120000 })
export const confirmImportBatch = (data) => api.post('/import/confirm-batch/', data, { timeout: 120000 })
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
export const getSaudiScrapeJobs = () => api.get('/import/saudi-scrape/')
export const startSaudiScrape = () => api.post('/import/saudi-scrape/')
export const downloadSaudiScrape = (jobId) =>
  api.get(`/import/saudi-scrape/${jobId}/download/`, { responseType: 'blob', timeout: 120000 })
export const deleteSaudiScrapeJob = (jobId) => api.delete(`/import/saudi-scrape/${jobId}/`)
