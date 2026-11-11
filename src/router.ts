import { useEffect, useState, useCallback } from 'react'

/**
 * Minimal hash router. Hash URLs (#/tournaments/t4) work on any static host,
 * including GitHub Pages, without server rewrites.
 */

export type Route =
  | { name: 'signin' }
  | { name: 'signup' }
  | { name: 'setup' }
  | { name: 'home' }
  | { name: 'tournaments' }
  | { name: 'tournament'; id: string }
  | { name: 'leaderboard'; id: string }
  | { name: 'play'; id: string }
  | { name: 'course'; id: string; tournamentId?: string }
  | { name: 'profile' }
  | { name: 'edit-profile' }
  | { name: 'admin' }
  | { name: 'admin-tournaments' }
  | { name: 'admin-tournament-edit'; id: string | null }
  | { name: 'admin-tournament-live'; id: string }
  | { name: 'admin-courses' }
  | { name: 'admin-course-edit'; id: string | null }
  | { name: 'admin-course-import' }
  | { name: 'admin-roles' }
  | { name: 'admin-role-edit'; id: string | null }
  | { name: 'admin-users' }
  | { name: 'admin-organisation' }
  | { name: 'admin-organizers' }
  | { name: 'organizer-setup' }
  | { name: 'staff' }
  | { name: 'staff-event'; id: string; tab?: string }
  | { name: 'not-found' }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [a, b, c] = parts
  if (a === 'admin') {
    if (!b) return { name: 'admin' }
    // Old admin sign-in links land on the single sign-in page
    if (b === 'login') return { name: 'signin' }
    if (b === 'tournaments' && !c) return { name: 'admin-tournaments' }
    if (b === 'tournaments' && c && parts[3] === 'live') return { name: 'admin-tournament-live', id: c }
    if (b === 'tournaments' && c) return { name: 'admin-tournament-edit', id: c === 'new' ? null : c }
    if (b === 'courses' && !c) return { name: 'admin-courses' }
    if (b === 'courses' && c === 'import') return { name: 'admin-course-import' }
    if (b === 'courses' && c) return { name: 'admin-course-edit', id: c === 'new' ? null : c }
    if (b === 'roles' && !c) return { name: 'admin-roles' }
    if (b === 'roles' && c) return { name: 'admin-role-edit', id: c === 'new' ? null : c }
    if (b === 'users' && !c) return { name: 'admin-users' }
    if (b === 'organisation' && !c) return { name: 'admin-organisation' }
    if (b === 'organizers' && !c) return { name: 'admin-organizers' }
    return { name: 'not-found' }
  }
  if (a === 'staff') return b ? { name: 'staff-event', id: b, tab: c } : { name: 'staff' }
  if (!a || a === 'home') return { name: 'home' }
  if (a === 'signin') return { name: 'signin' }
  if (a === 'signup') return { name: 'signup' }
  if (a === 'setup') return { name: 'setup' }
  if (a === 'organizer-setup') return { name: 'organizer-setup' }
  if (a === 'tournaments' && !b) return { name: 'tournaments' }
  if (a === 'tournaments' && b && !c) return { name: 'tournament', id: b }
  if (a === 'tournaments' && b && c === 'leaderboard') return { name: 'leaderboard', id: b }
  if (a === 'tournaments' && b && c === 'play') return { name: 'play', id: b }
  if (a === 'courses' && b && !c) return { name: 'course', id: b }
  if (a === 'courses' && b && c) return { name: 'course', id: b, tournamentId: c }
  if (a === 'profile' && !b) return { name: 'profile' }
  if (a === 'profile' && b === 'edit') return { name: 'edit-profile' }
  return { name: 'not-found' }
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const hash = `#${path.startsWith('/') ? path : `/${path}`}`
  if (opts.replace) {
    history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = hash
  }
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const back = useCallback((fallback = '/home') => {
    // Go back in history when there is somewhere to go, otherwise to a sensible parent page
    if (window.history.length > 1) window.history.back()
    else navigate(fallback, { replace: true })
  }, [])

  return { route, back }
}

/** Props for an <a> that navigates via the hash router */
export function linkProps(path: string) {
  return {
    href: `#${path}`,
  }
}
