import { useSyncExternalStore } from 'react'
import type { Course, HoleData, RegistrationStatus, Tournament, TournamentStatus } from './types'
import { MOCK_COURSES, MOCK_TOURNAMENTS, fillSeedGaps } from './data'
import { withCourseDefaults, withTournamentDefaults } from './golf'

/**
 * Admin-editable data store (prototype — no backend).
 *
 * Tournaments and courses live in the MOCK_* arrays, which every screen already reads.
 * The admin area mutates those arrays in place, persists them to localStorage so edits
 * survive a reload on that device, and bumps a version number so React re-renders.
 *
 * This file is shared verbatim between the mobile and web projects.
 */

// v3: full course/tournament set-up (tee sets, hole maps, rounds, scoring, fees, tee sheet…)
// v4: role-based screens (organiser t1/t8, marshal and official slots) need the new seed
const STORAGE_KEY = 'gtp-admin-data-v5'

// Pristine copies for "Reset demo data"
const DEFAULT_TOURNAMENTS: Tournament[] = structuredClone(MOCK_TOURNAMENTS)
const DEFAULT_COURSES: Course[] = structuredClone(MOCK_COURSES)

let version = 0
const listeners = new Set<() => void>()

function replaceContents<T>(target: T[], next: T[]) {
  target.splice(0, target.length, ...next)
}

function emit() {
  version++
  listeners.forEach(l => l())
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tournaments: MOCK_TOURNAMENTS, courses: MOCK_COURSES }))
  } catch {
    /* storage unavailable (private mode etc.) — edits still work for this session */
  }
}

// Load saved edits once, at module init, before any screen renders
;(function load() {
  try {
    localStorage.removeItem('gtp-admin-data-v1') // older formats
    localStorage.removeItem('gtp-admin-data-v2')
    localStorage.removeItem('gtp-admin-data-v3')
    localStorage.removeItem('gtp-admin-data-v4')
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as { tournaments?: Tournament[]; courses?: Course[] }
    if (Array.isArray(saved.tournaments)) replaceContents(MOCK_TOURNAMENTS, saved.tournaments.map(withTournamentDefaults))
    if (Array.isArray(saved.courses)) replaceContents(MOCK_COURSES, saved.courses.map(withCourseDefaults))
    fillSeedGaps(MOCK_COURSES, MOCK_TOURNAMENTS)
  } catch {
    /* corrupt or unavailable storage — fall back to defaults */
  }
})()

/** Re-render the calling component whenever admin data changes */
export function useDataVersion() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb) },
    () => version,
  )
}

export function newId(prefix: 't' | 'c') {
  return `${prefix}${Date.now().toString(36)}`
}

/* ───────── Tournaments ───────── */

export function upsertTournament(t: Tournament) {
  const i = MOCK_TOURNAMENTS.findIndex(x => x.id === t.id)
  if (i >= 0) MOCK_TOURNAMENTS[i] = t
  else MOCK_TOURNAMENTS.unshift(t)
  persist()
  emit()
}

export function deleteTournament(id: string) {
  const i = MOCK_TOURNAMENTS.findIndex(x => x.id === id)
  if (i >= 0) MOCK_TOURNAMENTS.splice(i, 1)
  persist()
  emit()
}

export function setTournamentStatus(id: string, status: TournamentStatus) {
  const t = MOCK_TOURNAMENTS.find(x => x.id === id)
  if (!t) return
  upsertTournament({ ...t, status, registrationStatus: deriveRegistrationStatus(status, t.registrationStatus) })
}

/* ───────── Courses ───────── */

export function upsertCourse(c: Course) {
  const i = MOCK_COURSES.findIndex(x => x.id === c.id)
  if (i >= 0) MOCK_COURSES[i] = c
  else MOCK_COURSES.unshift(c)

  // Keep tournaments held at this course in sync with its name and location
  for (const t of MOCK_TOURNAMENTS) {
    if (t.courseId === c.id) Object.assign(t, venueFieldsFromCourse(c))
  }
  persist()
  emit()
}

/** Refuses to delete a course that tournaments still use */
export function deleteCourse(id: string): { ok: true } | { ok: false; reason: string } {
  const used = MOCK_TOURNAMENTS.filter(t => t.courseId === id)
  if (used.length) {
    return { ok: false, reason: `${used.length} tournament${used.length > 1 ? 's use' : ' uses'} this course. Move or delete ${used.length > 1 ? 'them' : 'it'} first.` }
  }
  const i = MOCK_COURSES.findIndex(x => x.id === id)
  if (i >= 0) MOCK_COURSES.splice(i, 1)
  persist()
  emit()
  return { ok: true }
}

export function resetDemoData() {
  replaceContents(MOCK_TOURNAMENTS, structuredClone(DEFAULT_TOURNAMENTS))
  replaceContents(MOCK_COURSES, structuredClone(DEFAULT_COURSES))
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  emit()
}

/* ───────── Helpers ───────── */

export const STATUS_OPTIONS: { value: TournamentStatus; label: string }[] = [
  { value: 'draft',               label: 'Draft' },
  { value: 'published',           label: 'Coming soon' },
  { value: 'registration-open',   label: 'Registration open' },
  { value: 'registration-closed', label: 'Registration closed' },
  { value: 'upcoming',            label: 'Upcoming' },
  { value: 'in-progress',         label: 'Live — in progress' },
  { value: 'completed',           label: 'Completed' },
  { value: 'cancelled',           label: 'Cancelled' },
]

export const statusLabel = (s: TournamentStatus) => STATUS_OPTIONS.find(o => o.value === s)?.label ?? s

/** What golfers see for registration, given the admin-set tournament status */
export function deriveRegistrationStatus(status: TournamentStatus, previous?: RegistrationStatus): RegistrationStatus {
  if (status === 'registration-open') return previous === 'registered' ? 'registered' : 'open'
  if (status === 'published' || status === 'upcoming') return 'coming-soon'
  return 'closed'
}

/** "Oct 12–15, 2026", "Sep 30 – Oct 2, 2026", "Aug 2, 2026" */
export function formatDateRange(start: string, end?: string) {
  const s = new Date(`${start}T00:00:00`)
  if (isNaN(s.getTime())) return ''
  const e = end ? new Date(`${end}T00:00:00`) : s
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  if (isNaN(e.getTime()) || e.getTime() === s.getTime()) return `${month(s)} ${s.getDate()}, ${s.getFullYear()}`
  if (s.getFullYear() !== e.getFullYear()) {
    return `${month(s)} ${s.getDate()}, ${s.getFullYear()} – ${month(e)} ${e.getDate()}, ${e.getFullYear()}`
  }
  if (s.getMonth() === e.getMonth()) return `${month(s)} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
  return `${month(s)} ${s.getDate()} – ${month(e)} ${e.getDate()}, ${s.getFullYear()}`
}

export function venueFieldsFromCourse(c: Course): Pick<Tournament, 'venue' | 'location' | 'city' | 'country'> {
  const countryShort = c.country === 'United States' ? 'USA' : c.country
  return {
    venue: c.name,
    location: [c.city, c.region, countryShort].filter(Boolean).join(', '),
    city: [c.city, c.region].filter(Boolean).join(', '),
    country: c.country,
  }
}

/** A sensible default scorecard: par 72 over 18 (par 36 over 9) */
export function generateHoles(count: 9 | 18, existing: HoleData[] = []): HoleData[] {
  const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4]
  const yards = [410, 540, 180, 430, 400, 520, 170, 440, 420]
  const holes = Array.from({ length: count }, (_, i) => {
    const kept = existing.find(h => h.hole === i + 1)
    if (kept) return { ...kept }
    const k = i % 9
    return { hole: i + 1, par: pars[k], yards: yards[k], handicap: count === 18 ? ((i * 7) % 18) + 1 : ((i * 5) % 9) + 1 }
  })

  // Stroke indexes must be a 1..count permutation. If switching 18 → 9 (or mixing kept and
  // generated holes) broke that, re-rank them while keeping each hole's relative difficulty.
  const sis = holes.map(h => h.handicap)
  const valid = sis.every(n => n >= 1 && n <= count) && new Set(sis).size === count
  if (!valid) {
    holes
      .map((h, i) => ({ i, si: Number(h.handicap) || 99 }))
      .sort((a, b) => a.si - b.si || a.i - b.i)
      .forEach((x, rank) => { holes[x.i].handicap = rank + 1 })
  }
  return holes
}

export function scorecardTotals(holes: HoleData[]) {
  return {
    par: holes.reduce((s, h) => s + (Number(h.par) || 0), 0),
    yards: holes.reduce((s, h) => s + (Number(h.yards) || 0), 0),
  }
}

/** Verified golf photos admins can pick from */
export const GOLF_PHOTOS = [
  'photo-1535131749006-b7f58c99034b',
  'photo-1592919505780-303950717480',
  'photo-1587174486073-ae5e5cff23aa',
  'photo-1593111774240-d529f12cf4bb',
  'photo-1530028828-25e8270793c5',
  'photo-1611374243147-44a702c2d44c',
  'photo-1632946269126-0f8edbe8b068',
].map(id => `https://images.unsplash.com/${id}?w=800&h=500&fit=crop&auto=format`)

/* ───────── Admin credentials (prototype only) ───────── */

// Hard-coded as requested. Anyone can read these in the shipped JavaScript,
// so they must be replaced by a real server-side login before production.
export const ADMIN_EMAIL = 'admin@gmail.com'
export const ADMIN_PASSWORD = 'admin'

export function isAdminLogin(email: string, password: string) {
  return email.trim().toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASSWORD
}
