import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { trackPageView } from '../api/analytics'

function randomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, '')
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/* Anonymous page-view tracker: a random visitor id in localStorage and a
   session id in sessionStorage — no accounts, no cookies, no IPs.
   Admin visits are not tracked. Renders nothing. */
export default function PageTracker() {
  const { pathname } = useLocation()
  const { isAdmin, authLoading } = useAuth()
  const firstHit = useRef(true)

  useEffect(() => {
    if (authLoading || isAdmin) return
    try {
      let visitor = localStorage.getItem('asw_visitor')
      let isNew = false
      if (!visitor) {
        visitor = randomId()
        localStorage.setItem('asw_visitor', visitor)
        isNew = true
      }
      let session = sessionStorage.getItem('asw_session')
      if (!session) {
        session = randomId()
        sessionStorage.setItem('asw_session', session)
      }
      trackPageView({
        path: pathname,
        visitor,
        session,
        is_new: isNew,
        // referrer only matters on the first view of the visit
        referrer: firstHit.current ? document.referrer : '',
      }).catch(() => {})
      firstHit.current = false
    } catch { /* storage blocked — skip tracking */ }
  }, [pathname, isAdmin, authLoading])

  return null
}
