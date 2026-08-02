import api from './client'

export const getCalendarEvents = (params) => api.get('/calendar/events/', { params })
export const createCalendarEvent = (data) => api.post('/calendar/events/', data)
export const updateCalendarEvent = (id, data) => api.patch(`/calendar/events/${id}/`, data)
export const deleteCalendarEvent = (id) => api.delete(`/calendar/events/${id}/`)
export const getMonthSummary = (month, year) => api.get('/calendar/events/month-summary/', { params: { month, year } })
