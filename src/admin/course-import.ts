import type { Course, HoleData, TeeSet } from '../types'
import { MOCK_COURSES, MOCK_TOURNAMENTS } from '../data'
import { GOLF_PHOTOS, newId, upsertCourse } from '../store'
import { finalizeCourse, fromExistingCourse } from './course-setup'

/*
 * Sprint 4 · GC1–GC8: automatic golf course search and import.
 *
 * The real system calls the approved provider (S4-D03) through a backend adapter — the API key never reaches the
 * browser — at GET /api/v1/golf-courses/external/search, GET …/external/{providerCourseId} and
 * POST …/external/{providerCourseId}/import. This file plays that adapter with a small demo catalogue so every
 * screen and error state can be shown. Provider name, coverage and refresh rules are placeholders until D03.
 *
 * Demo queries that show the failure states: "timeout", "busy" (rate limited), "key" (provider credentials rejected),
 * "riverbend" (provider sends a malformed course).
 */

export const PROVIDER = { id: 'demo-provider', name: 'Course data provider (demo)', attribution: 'Course data © Demo Provider. Used under licence.' }

export interface ProviderTee {
  teeId: string
  name: string
  color: string
  menRating?: number
  menSlope?: number
  womenRating?: number
  womenSlope?: number
  yards: number[]
}

export interface ProviderHole { number: number; par?: number; si?: number; parWomen?: number; siWomen?: number }

export interface ProviderLayout {
  layoutId: string
  name: string
  holes: 9 | 18
  tees: ProviderTee[]
  scorecard: ProviderHole[]
}

export interface ProviderCourse {
  providerCourseId: string
  facility: string
  city: string
  region: string
  country: string
  postalCode?: string
  address?: string
  phone?: string
  website?: string
  geo?: { lat: number; lng: number }
  layouts: ProviderLayout[]
  /** Provider's last-updated stamp, compared on refresh */
  updatedAt: string
}

export interface SearchHit {
  providerCourseId: string
  facility: string
  city: string
  region: string
  country: string
  layouts: { layoutId: string; name: string; holes: number }[]
}

export class ProviderError extends Error {
  constructor(public code: 'timeout' | 'rate-limited' | 'credentials' | 'not-found' | 'malformed', message: string, public retryAfter?: number) { super(message) }
}

/* ───────── Demo catalogue ───────── */

const PARS_18 = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5]
const SI_18 = [7, 11, 15, 1, 9, 5, 17, 13, 3, 8, 16, 4, 2, 12, 10, 18, 6, 14]
const yardsFor = (pars: number[], base: number) => pars.map((p, i) => (p === 3 ? 150 : p === 4 ? 360 : 510) + ((i * 37) % 45) + base)

function layout18(id: string, name: string, tees: [string, string, number, number?, number?, number?, number?][], tweak?: (h: ProviderHole[]) => void): ProviderLayout {
  const scorecard = PARS_18.map((par, i) => ({ number: i + 1, par, si: SI_18[i] }))
  tweak?.(scorecard)
  return {
    layoutId: id, name, holes: 18, scorecard,
    tees: tees.map(([teeName, color, base, mr, ms, wr, ws]) => ({ teeId: `${id}-${teeName.toLowerCase()}`, name: teeName, color, yards: yardsFor(PARS_18, base), menRating: mr, menSlope: ms, womenRating: wr, womenSlope: ws })),
  }
}

const CATALOGUE: ProviderCourse[] = [
  {
    providerCourseId: 'dp:ca-on-0419', facility: 'Lakeview Golf & Country Club', city: 'Mississauga', region: 'Ontario', country: 'Canada', postalCode: 'L5H 2R6',
    address: '1190 Lakeshore Rd W', phone: '+1 (905) 555-0142', website: 'https://lakeview.example', geo: { lat: 43.53, lng: -79.61 }, updatedAt: '2026-08-14',
    layouts: [
      layout18('dp:ca-on-0419:champ', 'Championship', [['Black', 'Black', 40, 73.9, 138, 80.1, 146], ['Blue', 'Blue', 15, 71.6, 131, 77.4, 140], ['White', 'White', -10, 69.8, 126, 75.2, 134], ['Red', 'Red', -45, 67.1, 118, 71.9, 127]]),
      {
        layoutId: 'dp:ca-on-0419:exec', name: 'Executive Nine', holes: 9,
        scorecard: [3, 4, 3, 3, 4, 3, 4, 3, 3].map((par, i) => ({ number: i + 1, par, si: [5, 1, 7, 9, 3, 6, 2, 8, 4][i] })),
        tees: [{ teeId: 'dp:ca-on-0419:exec-white', name: 'White', color: 'White', menRating: 29.4, menSlope: 98, yards: [140, 310, 125, 160, 335, 150, 300, 115, 170] }],
      },
    ],
  },
  {
    providerCourseId: 'dp:ca-on-1022', facility: 'Cedar Ridge Golf Club', city: 'Ottawa', region: 'Ontario', country: 'Canada', postalCode: 'K2K 1X4', updatedAt: '2026-05-02',
    // Women's ratings missing on two tees — optional: shown as missing, can be filled in or left blank
    layouts: [layout18('dp:ca-on-1022:main', 'Cedar Ridge', [['Blue', 'Blue', 10, 71.2, 129], ['White', 'White', -15, 69.5, 124, 75.0, 131], ['Gold', 'Gold', -35, 68.0, 120]])],
  },
  {
    providerCourseId: 'dp:ca-ns-0077', facility: 'Harbourside Links', city: 'Halifax', region: 'Nova Scotia', country: 'Canada', updatedAt: '2025-11-20',
    // Provider data problems: hole 12 has no par, holes 5 and 14 share stroke index 9 — must be fixed before import
    layouts: [layout18('dp:ca-ns-0077:links', 'The Links', [['Blue', 'Blue', 5, 70.8, 127, 76.1, 133], ['Red', 'Red', -40, 66.9, 115, 71.5, 124]], h => { h[11].par = undefined; h[13].si = 9 })],
  },
  {
    providerCourseId: 'dp:us-ga-0310', facility: 'Augusta Pines Golf Club', city: 'Augusta', region: 'Georgia', country: 'United States', postalCode: '30907', updatedAt: '2026-07-01',
    layouts: [layout18('dp:us-ga-0310:main', 'Augusta Pines', [['Black', 'Black', 45, 74.1, 139, 80.5, 147], ['Blue', 'Blue', 20, 72.0, 133, 78.0, 141], ['Red', 'Red', -40, 67.4, 119, 72.2, 128]])],
  },
  {
    providerCourseId: 'dp:us-ca-0888', facility: 'Riverbend Municipal', city: 'Sacramento', region: 'California', country: 'United States', updatedAt: '2026-01-09',
    layouts: [{ layoutId: 'dp:us-ca-0888:main', name: 'Riverbend', holes: 18, scorecard: [], tees: [] }],
  },
]

const COUNTRIES = [...new Set(CATALOGUE.map(c => c.country))]
export const providerCountries = () => COUNTRIES

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** GC2: search by name (and country). Paged in the real API; the demo returns everything that matches. */
export async function searchProvider(q: string, country?: string): Promise<SearchHit[]> {
  await wait(650)
  const query = q.trim().toLowerCase()
  if (query === 'timeout') throw new ProviderError('timeout', 'The course provider didn’t answer in time.')
  if (query === 'busy') throw new ProviderError('rate-limited', 'Too many searches right now.', 30)
  if (query === 'key') throw new ProviderError('credentials', 'The course provider rejected our credentials.')
  if (query.length < 3) return []
  return CATALOGUE
    .filter(c => (!country || c.country === country) && [c.facility, c.city, ...c.layouts.map(l => l.name)].some(v => v.toLowerCase().includes(query)))
    .map(c => ({ providerCourseId: c.providerCourseId, facility: c.facility, city: c.city, region: c.region, country: c.country, layouts: c.layouts.map(l => ({ layoutId: l.layoutId, name: l.name, holes: l.holes })) }))
}

/** GC3: full detail for preview */
export async function getProviderCourse(id: string): Promise<ProviderCourse> {
  await wait(500)
  const c = CATALOGUE.find(x => x.providerCourseId === id)
  if (!c) throw new ProviderError('not-found', 'The provider no longer lists this course.')
  if (c.layouts.some(l => !l.scorecard.length || !l.tees.length)) throw new ProviderError('malformed', 'The provider sent this course without a scorecard or tees.')
  return structuredClone(c)
}

/* ───────── GC5: validation ───────── */

export interface ImportCheck {
  /** Block the import until fixed */
  errors: string[]
  /** Fine to import; shown so the organiser knows */
  warnings: string[]
  /** Optional data the provider didn't have, per tee */
  missing: string[]
}

export function checkLayout(l: ProviderLayout, teeIds: string[]): ImportCheck {
  const errors: string[] = [], warnings: string[] = [], missing: string[] = []
  const holes = l.scorecard
  if (holes.length !== l.holes) errors.push(`The scorecard has ${holes.length} holes but the layout says ${l.holes}`)
  holes.forEach((h, i) => { if (h.number !== i + 1) errors.push(`Hole numbers are out of order at position ${i + 1}`) })
  const noPar = holes.filter(h => !h.par || h.par < 3 || h.par > 6).map(h => h.number)
  if (noPar.length) errors.push(`Par missing or invalid on hole ${noPar.join(', ')}`)
  const si = holes.map(h => h.si)
  const noSi = holes.filter(h => !h.si).map(h => h.number)
  if (noSi.length) errors.push(`Stroke index missing on hole ${noSi.join(', ')}`)
  const dup = [...new Set(si.filter((v, i) => v && si.indexOf(v) !== i))]
  if (dup.length) errors.push(`Stroke index ${dup.join(', ')} is used on more than one hole`)
  if (si.some(v => v && (v < 1 || v > l.holes))) errors.push(`Stroke indexes must be 1–${l.holes}`)
  if (!teeIds.length) errors.push('Choose at least one tee set')
  for (const tee of l.tees.filter(t => teeIds.includes(t.teeId))) {
    if (tee.yards.length !== l.holes || tee.yards.some(y => !y || y < 50 || y > 700)) errors.push(`${tee.name} tees: yardage missing or out of range on some holes`)
    if (tee.menRating === undefined || tee.menSlope === undefined) missing.push(`${tee.name}: men’s rating and slope`)
    if (tee.womenRating === undefined || tee.womenSlope === undefined) missing.push(`${tee.name}: women’s rating and slope`)
    if (tee.menRating === undefined && tee.womenRating === undefined) errors.push(`${tee.name} tees have no course rating at all — net scoring needs one`)
  }
  const total = holes.reduce((s, h) => s + (h.par ?? 0), 0)
  if (l.holes === 18 && !noPar.length && (total < 54 || total > 78)) warnings.push(`Par ${total} is unusual for 18 holes — check the scorecard`)
  return { errors, warnings, missing }
}

/* ───────── GC6: deduplication and provenance ───────── */

/** Already imported from this provider + layout */
export const importedCourse = (providerCourseId: string, layoutId: string) =>
  MOCK_COURSES.find(c => c.source?.providerCourseId === providerCourseId && c.source.layoutId === layoutId)

/** A course created by hand that looks like the same place (name + city) — offered, never merged automatically */
const norm = (s: string) => s.toLowerCase().replace(/\b(golf|club|country|links|the|and)\b|&|[^a-z ]/g, '').replace(/\s+/g, '')
export const lookalike = (p: ProviderCourse) => MOCK_COURSES.find(c => {
  if (c.source || c.city.toLowerCase() !== p.city.toLowerCase()) return false
  const a = norm(c.facilityName ?? c.name), b = norm(p.facility)
  return !!a && !!b && (a.includes(b) || b.includes(a))
})

/** Tournaments in progress on this course: their scorecards must not change underneath them (GC7) */
export const liveOn = (courseId: string) => MOCK_TOURNAMENTS.filter(t => t.courseId === courseId && t.status === 'in-progress')

/* ───────── GC4: import ───────── */

export interface ImportInput {
  course: ProviderCourse
  layoutId: string
  teeIds: string[]
  /** Organiser's fixes from the review step, by hole index */
  fixes?: { par?: Record<number, number>; si?: Record<number, number> }
  importedBy: string
  organizerId?: string
}

export function applyFixes(l: ProviderLayout, fixes: ImportInput['fixes']): ProviderLayout {
  const copy = structuredClone(l)
  copy.scorecard.forEach((h, i) => {
    if (fixes?.par?.[i] !== undefined) h.par = fixes.par[i]
    if (fixes?.si?.[i] !== undefined) h.si = fixes.si[i]
  })
  return copy
}

function toCourse(input: ImportInput, base?: Course): Course {
  const p = input.course
  const raw = p.layouts.find(l => l.layoutId === input.layoutId)!
  const l = applyFixes(raw, input.fixes)
  const tees: TeeSet[] = l.tees.filter(t => input.teeIds.includes(t.teeId)).map(t => ({
    id: base?.teeSets?.find(x => x.name === t.name)?.id ?? `tee-${t.teeId.split(':').pop()}`,
    name: t.name, color: t.color, yards: t.yards, menRating: t.menRating, menSlope: t.menSlope, womenRating: t.womenRating, womenSlope: t.womenSlope,
  }))
  const scorecardTee = tees[0]
  const holeData: HoleData[] = l.scorecard.map((h, i) => ({ hole: h.number, par: h.par!, handicap: h.si!, yards: scorecardTee.yards[i], parWomen: h.parWomen, handicapWomen: h.siWomen }))
  const filledByHand = [
    ...Object.keys(input.fixes?.par ?? {}).map(i => `Par hole ${Number(i) + 1}`),
    ...Object.keys(input.fixes?.si ?? {}).map(i => `Stroke index hole ${Number(i) + 1}`),
  ]
  const now = new Date().toISOString().slice(0, 19)
  const draft: Course = {
    ...(base ?? {}),
    id: base?.id ?? newId('c'),
    facilityName: p.facility,
    name: p.layouts.length > 1 ? `${p.facility} — ${l.name}` : p.facility,
    imageUrl: base?.imageUrl ?? GOLF_PHOTOS[(p.facility.length % (GOLF_PHOTOS.length - 1)) + 1],
    description: base?.description ?? `${l.holes}-hole layout imported from ${PROVIDER.name}.`,
    address: p.address ?? '', city: p.city, region: p.region, postalCode: p.postalCode ?? '', country: p.country, location: '',
    holes: l.holes, par: 0, yardage: 0, rating: 0, slope: 0, established: base?.established ?? '', designer: base?.designer ?? '',
    holeData, teeSets: tees, scorecardTeeId: scorecardTee.id,
    courseType: base?.courseType ?? 'public', distanceUnit: 'yards', timeZone: base?.timeZone ?? '',
    phone: p.phone ?? '', email: base?.email ?? '', website: p.website ?? '', bookingUrl: base?.bookingUrl ?? '',
    facilities: base?.facilities ?? [], dressCode: base?.dressCode ?? '', status: base?.status ?? 'open', statusNote: base?.statusNote ?? '',
    geo: p.geo ?? base?.geo,
    organizerId: base?.organizerId ?? input.organizerId,
    version: base?.version ?? 1, effectiveFrom: base?.effectiveFrom, history: base?.history,
    source: {
      provider: PROVIDER.name, providerCourseId: p.providerCourseId, layoutId: l.layoutId,
      importedAt: base?.source?.importedAt ?? now, importedBy: base?.source?.importedBy ?? input.importedBy,
      refreshedAt: base ? now : undefined, providerVersion: p.updatedAt, filledByHand: filledByHand.length ? filledByHand : undefined,
    },
  }
  return draft
}

export type ImportResult =
  | { ok: true; course: Course; updated: boolean }
  | { ok: false; error: string; existing?: Course }

/** GC4/GC6: creates the course, or refuses with the existing one so the organiser can open or update it instead */
export function importCourse(input: ImportInput): ImportResult {
  const l = input.course.layouts.find(x => x.layoutId === input.layoutId)
  if (!l) return { ok: false, error: 'That layout isn’t available any more.' }
  const check = checkLayout(applyFixes(l, input.fixes), input.teeIds)
  if (check.errors.length) return { ok: false, error: check.errors[0] }
  const existing = importedCourse(input.course.providerCourseId, input.layoutId)
  if (existing) return { ok: false, error: 'Already imported', existing }
  const course = finalizeCourse(toCourse(input), 'active')
  upsertCourse(course)
  return { ok: true, course, updated: false }
}

/**
 * GC6/GC7: pull the provider's data again into an imported course. Changed ratings or scorecard create a new course
 * version from today (old one kept in history). Refused while a tournament on it is in progress, so live scorecards
 * never change underneath players.
 */
export function refreshCourse(existing: Course, input: Omit<ImportInput, 'importedBy'> & { importedBy: string }): ImportResult {
  const live = liveOn(existing.id)
  if (live.length) return { ok: false, error: `${live[0].name} is being played on this course now. Refresh it after the tournament closes.` }
  const l = input.course.layouts.find(x => x.layoutId === input.layoutId)
  if (!l) return { ok: false, error: 'That layout isn’t available any more.' }
  const check = checkLayout(applyFixes(l, input.fixes), input.teeIds)
  if (check.errors.length) return { ok: false, error: check.errors[0] }
  const previous = fromExistingCourse(existing)
  const course = finalizeCourse(toCourse(input, previous), previous.lifecycle ?? 'active', previous)
  upsertCourse(course)
  return { ok: true, course, updated: true }
}
