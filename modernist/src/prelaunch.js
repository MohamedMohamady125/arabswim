import { useAuth } from './context/AuthContext'
import { useFeatures } from './context/FeaturesContext'

/**
 * Pre-launch lock (Dashboard → Site sections). While it is on, only an admin
 * browses the site:
 *   - a visitor who is not signed in sees the "launching soon" page (plus
 *     sign-in and invite links);
 *   - an invited owner sees their own page and nothing else.
 * Fails closed: until the flags have loaded, and if they cannot be loaded,
 * the site counts as locked.
 */
export function ownPagePath(user) {
  if (!user) return null
  if (user.role === 'CLUB' && user.team) return `/teams/${user.team}`
  if (user.role === 'ACADEMY' && user.academy) return `/academies/${user.academy}`
  if (user.role === 'FEDERATION' && user.country) return `/countries/${user.country}`
  if (user.role === 'ATHLETE' && user.swimmer) return `/swimmers/${user.swimmer}`
  return null
}

export function usePrelaunch() {
  const { realAdmin, isAuthed, user, authLoading } = useAuth()
  const { features, loaded } = useFeatures()
  const on = features.prelaunch !== false
  // the lock reads the account's true role, so an admin previewing the
  // visitor view can still browse
  const locked = on && !realAdmin
  const ownPath = ownPagePath(user)
  return { locked, ownPath, isAuthed, ready: loaded && !authLoading && (!isAuthed || !!user) }
}

/**
 * May a locked (non-admin) viewer open this path?
 * Their own page and anything under it; their own articles and albums are
 * reached from it (those pages send an owner away when the item is not theirs).
 */
export function pathAllowed(pathname, ownPath, isAuthed) {
  // an Arabswim Awards vote link is shared publicly before launch
  if (pathname === '/login' || pathname.startsWith('/join/') || pathname.startsWith('/vote/')) return true
  if (!isAuthed || !ownPath) return false
  if (pathname === ownPath || pathname.startsWith(`${ownPath}/`)) return true
  return /^\/news\/\d+$/.test(pathname) || /^\/media\/albums\/\d+$/.test(pathname)
}
