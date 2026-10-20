import type { Course, CourseVersion, HoleData, NineRating, TeeSet } from '../types'
import { MOCK_COURSES, MOCK_TOURNAMENTS } from '../data'
import { GOLF_PHOTOS, newId, generateHoles } from '../store'
import { generateHoleMap, isoDate, teeTotal, withCourseDefaults } from '../golf'
import { timeZoneForCourse } from './tournament-setup'
import { COUNTRIES, postalCodeError } from '../account-rules'

export { COUNTRIES }

/*
 * Create Course wizard: defaults, validation, WHS guidance and versioning.
 * Source of truth: Docs/CREATE COURSE.txt ([MVP] items only).
 */

/* ───────── Sections ───────── */

export const COURSE_SECTIONS = {
  details:   { step: 'course', title: 'Course details' },
  location:  { step: 'course', title: 'Location' },
  contact:   { step: 'course', title: 'Contact, facilities & status' },
  tees:      { step: 'tees',   title: 'Tee sets' },
  scorecard: { step: 'tees',   title: 'Scorecard' },
} as const
export type CourseSectionKey = keyof typeof COURSE_SECTIONS
export const COURSE_SECTION_KEYS = Object.keys(COURSE_SECTIONS) as CourseSectionKey[]
export const COURSE_STEPS = [
  { key: 'course', label: 'Course & location' },
  { key: 'tees', label: 'Tees & scorecard' },
  { key: 'review', label: 'Review & activate' },
] as const
export type CourseStepKey = (typeof COURSE_STEPS)[number]['key']

/* ───────── Options ───────── */


export const COURSE_TYPES = [
  { value: 'public', label: 'Public' },
  { value: 'semi-private', label: 'Semi-private' },
  { value: 'private', label: 'Private' },
  { value: 'resort', label: 'Resort' },
] as const

export const COURSE_FACILITIES = [
  'Driving range', 'Putting green', 'Chipping area', 'Pro shop', 'Restaurant', 'Bar',
  'Locker rooms', 'Golf carts', 'Club rental', 'Lessons', 'Parking',
]

/** Rough country bounding boxes: [minLat, maxLat, minLng, maxLng] */
const BOUNDS: Record<string, [number, number, number, number]> = {
  Canada: [41.6, 83.2, -141, -52.6],
  'United States': [18, 72, -180, -66],
  'United Kingdom': [49.8, 60.9, -8.7, 1.8],
  Ireland: [51.4, 55.5, -10.7, -5.9],
  Australia: [-44, -10, 112, 154],
}

/* ───────── Units ───────── */

export const unitShort = (c: Pick<Course, 'distanceUnit'>) => (c.distanceUnit === 'metres' ? 'm' : 'yds')
/** Yards → the course's unit (limits are defined in yards by WHS) */
const inUnit = (c: Pick<Course, 'distanceUnit'>, yards: number) => (c.distanceUnit === 'metres' ? Math.round(yards * 0.9144) : yards)

/* ───────── Defaults ───────── */

const newTeeId = () => `tee-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function newTee(name = '', color = '', yards: number[] = []): TeeSet {
  return { id: newTeeId(), name, color, yards }
}

export function newCourse(): Course {
  const holeData = generateHoles(18)
  const tee = newTee('Blue', 'Blue', holeData.map(h => h.yards))
  return {
    id: newId('c'), facilityName: '', name: '', imageUrl: GOLF_PHOTOS[1], description: '',
    address: '', city: '', region: '', postalCode: '', country: 'Canada', location: '',
    holes: 18, par: 72, yardage: 0, rating: 0, slope: 0, established: '', designer: '',
    holeData, teeSets: [tee], scorecardTeeId: tee.id,
    courseType: 'public', distanceUnit: 'yards', timeZone: '',
    phone: '', email: '', website: '', bookingUrl: '', facilities: [], dressCode: '', status: 'open', statusNote: '',
    lifecycle: 'draft', version: 1,
  }
}

export function fromExistingCourse(c: Course): Course {
  const d = withCourseDefaults(c)
  const tees = d.teeSets ?? []
  const scorecardTeeId = d.scorecardTeeId
    ?? tees.find(t => t.yards.every((y, i) => y === d.holeData[i]?.yards))?.id ?? tees[0]?.id
  return {
    ...d,
    facilityName: d.facilityName ?? d.name,
    established: d.established === '—' ? '' : d.established,
    designer: d.designer === 'Unknown' ? '' : d.designer,
    postalCode: d.postalCode ?? '',
    distanceUnit: d.distanceUnit ?? 'yards',
    timeZone: d.timeZone || timeZoneForCourse(d),
    lifecycle: d.lifecycle ?? 'active',
    scorecardTeeId,
    version: d.version ?? 1,
  }
}

/** Keep every tee's yards list the same length as the scorecard */
export const fitTees = (tees: TeeSet[], holes: HoleData[]) =>
  tees.map(t => ({ ...t, yards: holes.map((h, i) => t.yards[i] ?? h.yards) }))

export const womenDiffer = (c: Course) => c.holeData.some(h => h.parWomen !== undefined || h.handicapWomen !== undefined)
export const menPar = (c: Course) => c.holeData.reduce((s, h) => s + (Number(h.par) || 0), 0)
export const womenPar = (c: Course) => c.holeData.reduce((s, h) => s + (Number(h.parWomen ?? h.par) || 0), 0)
export const isUsed = (c: Course) => MOCK_TOURNAMENTS.some(t => t.courseId === c.id)

/* ───────── Validation ───────── */

export type Errors = Record<string, string>
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URLISH = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i
const filled = (v?: string) => !!v && v.trim().length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v)

function ratingRange(holes: number) {
  return holes === 9 ? { min: 27, max: 42.5 } : { min: 55, max: 85 }
}

/** "ok", or why a rating / slope pair is wrong */
function checkRating(rating: number | undefined, slope: number | undefined, range: { min: number; max: number }) {
  if (!isNum(rating) || !isNum(slope)) return 'Enter both course rating and slope'
  if (rating < range.min || rating > range.max) return `Course rating must be ${range.min}–${range.max}`
  if (!Number.isInteger(slope) || slope < 55 || slope > 155) return 'Slope must be a whole number from 55 to 155'
  return 'ok'
}

function checkNine(n: NineRating | undefined) {
  if (!n) return 'ok'
  return checkRating(n.rating, n.slope, ratingRange(9))
}

export function validateCourseSection(key: CourseSectionKey, c: Course, ctx: { scorecardLocked: boolean }): Errors {
  const e: Errors = {}
  const year = new Date().getFullYear()
  switch (key) {
    case 'details':
      if (!filled(c.facilityName)) e.facilityName = 'Enter the club or facility name'
      if (!filled(c.name)) e.name = 'Enter the course name'
      if (!filled(c.description)) e.description = 'Add a short description for golfers'
      if (filled(c.established) && (!/^\d{4}$/.test(c.established.trim()) || Number(c.established) > year)) e.established = 'Use a 4-digit year, not in the future'
      if (!filled(c.imageUrl)) e.imageUrl = 'Add a cover photo'
      break
    case 'location': {
      if (!filled(c.address)) e.address = 'Enter the street address'
      if (!filled(c.city)) e.city = 'Enter the city'
      if (!filled(c.region)) e.region = 'Enter the province or state'
      if (!filled(c.postalCode)) e.postalCode = 'Enter the postal / ZIP code'
      else { const p = postalCodeError(c.country, c.postalCode!); if (p) e.postalCode = p }
      if (!filled(c.country)) e.country = 'Choose a country'
      if (!c.geo) e.geo = 'Add the map pin (latitude and longitude)'
      else {
        const { lat, lng } = c.geo
        if (!isNum(lat) || lat < -90 || lat > 90 || !isNum(lng) || lng < -180 || lng > 180) e.geo = 'Latitude −90 to 90, longitude −180 to 180'
        else {
          const b = BOUNDS[c.country]
          if (b && (lat < b[0] || lat > b[1] || lng < b[2] || lng > b[3])) e.geo = `This pin isn't in ${c.country}`
        }
      }
      break
    }
    case 'contact':
      if (filled(c.email) && !EMAIL.test(c.email!.trim())) e.email = 'Enter a valid email'
      if (filled(c.phone) && c.phone!.replace(/\D/g, '').length < 7) e.phone = 'Enter a valid phone number'
      if (filled(c.website) && !URLISH.test(c.website!.trim())) e.website = 'Enter a website like yourclub.com'
      if (filled(c.bookingUrl) && !URLISH.test(c.bookingUrl!.trim())) e.bookingUrl = 'Enter a valid link'
      if (c.status !== 'open' && !filled(c.statusNote)) e.statusNote = 'Tell golfers what’s affected'
      break
    case 'tees': {
      if (ctx.scorecardLocked) break
      const tees = c.teeSets ?? []
      if (!tees.length) e.tees = 'Add at least one tee set'
      const range = ratingRange(c.holes)
      const minLength = inUnit(c, c.holes === 9 ? 750 : 1500)
      tees.forEach((t, i) => {
        const men = t.menRating !== undefined || t.menSlope !== undefined
        const women = t.womenRating !== undefined || t.womenSlope !== undefined
        let msg = ''
        if (!filled(t.name)) msg = 'Name the tee set'
        else if (!filled(t.color)) msg = 'Choose a marker colour'
        else if (!men && !women) msg = 'Rate the tees for at least one gender'
        else if (men && checkRating(t.menRating, t.menSlope, range) !== 'ok') msg = `Men: ${checkRating(t.menRating, t.menSlope, range)}`
        else if (women && checkRating(t.womenRating, t.womenSlope, range) !== 'ok') msg = `Women: ${checkRating(t.womenRating, t.womenSlope, range)}`
        else {
          const nine = ([['Men front 9', t.menFront], ['Men back 9', t.menBack], ['Women front 9', t.womenFront], ['Women back 9', t.womenBack]] as const)
            .find(([, n]) => checkNine(n) !== 'ok')
          if (nine) msg = `${nine[0]}: ${checkNine(nine[1])}`
          else if (teeTotal(t) < minLength) msg = `A rated tee must be at least ${minLength.toLocaleString()} ${unitShort(c)} in total (WHS)`
        }
        if (msg) e[`tee${i}`] = msg
      })
      break
    }
    case 'scorecard': {
      if (ctx.scorecardLocked) break
      const n = c.holes
      const [minY, maxY] = [inUnit(c, 50), inUnit(c, 800)]
      const bad = c.holeData.find(h => !(h.par >= 3 && h.par <= 6))
      if (bad) e.scorecard = `Hole ${bad.hole}: par must be 3–6`
      const si = c.holeData.map(h => h.handicap)
      if (!e.scorecard && (si.some(x => !(x >= 1 && x <= n)) || new Set(si).size !== n)) e.scorecard = `Stroke index: use every number from 1 to ${n} once`
      if (!e.scorecard && womenDiffer(c)) {
        const badW = c.holeData.find(h => !((h.parWomen ?? h.par) >= 3 && (h.parWomen ?? h.par) <= 6))
        const siW = c.holeData.map(h => h.handicapWomen ?? h.handicap)
        if (badW) e.scorecard = `Hole ${badW.hole}: women's par must be 3–6`
        else if (siW.some(x => !(x >= 1 && x <= n)) || new Set(siW).size !== n) e.scorecard = `Women's stroke index: use every number from 1 to ${n} once`
      }
      if (!e.scorecard) {
        for (const t of c.teeSets ?? []) {
          const k = t.yards.findIndex(y => !(y >= minY && y <= maxY))
          if (k >= 0) { e.scorecard = `${t.name || 'Unnamed'} tees, hole ${k + 1}: ${minY}–${maxY} ${unitShort(c)}`; break }
        }
      }
      break
    }
  }
  return e
}

export function validateCourse(c: Course, ctx: { scorecardLocked: boolean }) {
  return Object.fromEntries(COURSE_SECTION_KEYS.map(k => [k, validateCourseSection(k, c, ctx)])) as Record<CourseSectionKey, Errors>
}

/* ───────── Warnings (WHS guidance and data checks) ───────── */

/** WHS Appendix E stroke index guidance for an 18-hole allocation */
export function strokeIndexAdvice(si: number[]): string[] {
  if (si.length !== 18) return []
  const out: string[] = []
  const front = si.slice(0, 9), back = si.slice(9)
  const oddFront = front.every(x => x % 2 === 1) && back.every(x => x % 2 === 0)
  const evenFront = front.every(x => x % 2 === 0) && back.every(x => x % 2 === 1)
  if (!oddFront && !evenFront) out.push('Put odd stroke indexes on one nine and even on the other')
  ;[front, back].forEach((nine, k) => {
    const hardest = nine.indexOf(Math.min(...nine))
    if (hardest < 3 || hardest > 5) out.push(`The hardest hole on the ${k ? 'back' : 'front'} nine is best in its middle three holes`)
  })
  for (let i = 1; i < 18; i++) {
    if (si[i] <= 6 && si[i - 1] <= 6) { out.push(`Holes ${i} and ${i + 1} both have stroke index 6 or lower`); break }
  }
  return out
}

export function courseWarnings(c: Course): { section: CourseSectionKey; message: string }[] {
  const w: { section: CourseSectionKey; message: string }[] = []
  const tees = c.teeSets ?? []
  if (tees.length && !tees.some(t => t.womenRating !== undefined)) w.push({ section: 'tees', message: "No tee has a women's rating — women can't get a net score here" })
  for (const t of tees) {
    if (t.menRating !== undefined && Math.abs(t.menRating - menPar(c)) > 10) w.push({ section: 'tees', message: `${t.name}: men's rating is more than 10 from par — check for a typo` })
    if (t.womenRating !== undefined && Math.abs(t.womenRating - womenPar(c)) > 10) w.push({ section: 'tees', message: `${t.name}: women's rating is more than 10 from par — check for a typo` })
  }
  if (c.holes === 18 && tees.some(t => (t.menRating !== undefined && (!t.menFront || !t.menBack)) || (t.womenRating !== undefined && (!t.womenFront || !t.womenBack))))
    w.push({ section: 'tees', message: 'Some tees have no front / back 9 ratings — needed if tournaments play 9 holes here' })
  strokeIndexAdvice(c.holeData.map(h => h.handicap)).forEach(m => w.push({ section: 'scorecard', message: `Stroke index: ${m}` }))
  const dup = MOCK_COURSES.find(o => o.id !== c.id && o.name.trim().toLowerCase() === c.name.trim().toLowerCase()
    && (o.facilityName ?? o.name).trim().toLowerCase() === (c.facilityName ?? '').trim().toLowerCase() && o.city.trim().toLowerCase() === c.city.trim().toLowerCase())
  if (dup && c.name.trim()) w.push({ section: 'details', message: `A course with this name already exists in ${c.city} — check it isn't a duplicate` })
  return w
}

/* ───────── Saving ───────── */

const ratingFields = (c: Course) => JSON.stringify({
  tees: (c.teeSets ?? []).map(t => [t.menRating, t.menSlope, t.womenRating, t.womenSlope, t.menFront, t.menBack, t.womenFront, t.womenBack, t.yards]),
  holes: c.holeData.map(h => [h.par, h.handicap, h.parWomen, h.handicapWomen]),
})

/** True when saving this edit would create a new ratings version */
export const createsVersion = (previous: Course | undefined, next: Course) =>
  !!previous && previous.lifecycle !== 'draft' && ratingFields(previous) !== ratingFields(next)

export function finalizeCourse(c: Course, lifecycle: Course['lifecycle'], previous?: Course): Course {
  const tees = (c.teeSets ?? []).map(t => ({ ...t, name: t.name.trim(), yards: t.yards.map(Number) }))
  const scorecardTee = tees.find(t => t.id === c.scorecardTeeId) ?? tees[0]
  const countryShort = c.country === 'United States' ? 'USA' : c.country
  const different = womenDiffer(c)
  const holeData: HoleData[] = c.holeData.map((h, i) => {
    const hole = {
      ...h, par: Number(h.par), handicap: Number(h.handicap), yards: scorecardTee?.yards[i] ?? h.yards,
      parWomen: different ? Number(h.parWomen ?? h.par) : undefined,
      handicapWomen: different ? Number(h.handicapWomen ?? h.handicap) : undefined,
      name: h.name?.trim() || undefined, notes: h.notes?.trim() || undefined,
    }
    return { ...hole, map: h.map ?? generateHoleMap(hole) }
  })
  let version = c.version ?? 1
  let effectiveFrom = c.effectiveFrom ?? isoDate(new Date())
  let history = c.history ?? []
  if (createsVersion(previous, c)) {
    const today = isoDate(new Date())
    const y = new Date(); y.setDate(y.getDate() - 1)
    history = [...history, {
      version: previous!.version ?? 1, effectiveFrom: previous!.effectiveFrom ?? '', until: isoDate(y),
      teeSets: previous!.teeSets ?? [],
      holeData: previous!.holeData.map(({ hole, par, yards, handicap, parWomen, handicapWomen }) => ({ hole, par, yards, handicap, parWomen, handicapWomen })),
    } satisfies CourseVersion]
    version = (previous!.version ?? 1) + 1
    effectiveFrom = today
  }
  return {
    ...c,
    facilityName: c.facilityName?.trim(),
    name: c.name.trim(),
    description: c.description.trim(),
    designer: c.designer.trim() || 'Unknown',
    established: c.established.trim() || '—',
    address: c.address.trim(), city: c.city.trim(), region: c.region.trim(), postalCode: c.postalCode?.trim(),
    location: [c.city.trim(), c.region.trim(), countryShort].filter(Boolean).join(', '),
    teeSets: tees,
    holeData,
    par: holeData.reduce((s, h) => s + h.par, 0),
    yardage: scorecardTee ? teeTotal(scorecardTee) : 0,
    rating: scorecardTee?.menRating ?? scorecardTee?.womenRating ?? 0,
    slope: scorecardTee?.menSlope ?? scorecardTee?.womenSlope ?? 0,
    phone: c.phone?.trim(), email: c.email?.trim(), website: c.website?.trim(), bookingUrl: c.bookingUrl?.trim(),
    dressCode: c.dressCode?.trim(), statusNote: c.status === 'open' ? '' : c.statusNote?.trim(),
    holeImageSource: c.holeImageSource?.trim() || undefined,
    timeZone: c.timeZone || timeZoneForCourse(c),
    lifecycle, version, effectiveFrom, history,
  }
}

export const isSelectable = (c: Course) => (c.lifecycle ?? 'active') === 'active'
