import type {
  Course, Division, HoleData, HoleHazard, HoleMap, Point, ScoringRules, TeeSet, TeeSheetSettings, Tournament,
  TournamentFees, TournamentRound, Eligibility, RegistrationWindow,
} from './types'

/*
 * Golf rules and defaults for the prototype: course set-up (tee sets, hole maps), tournament
 * set-up (rounds, scoring, fees, tee sheet) and the maths the live screens need
 * (playing handicap, Stableford points, distances). No React, no storage.
 */

/* ───────── Options shared by forms and screens ───────── */

export const TEE_COLORS = [
  { value: 'Black', swatch: '#111827' },
  { value: 'Blue', swatch: '#2563eb' },
  { value: 'White', swatch: '#ffffff' },
  { value: 'Gold', swatch: '#c9a227' },
  { value: 'Red', swatch: '#dc2626' },
  { value: 'Green', swatch: '#16a34a' },
]

export const teeSwatch = (name: string) => TEE_COLORS.find(t => t.value === name)?.swatch ?? '#9ca3af'

export const FACILITIES = [
  'Driving range', 'Putting green', 'Chipping area', 'Pro shop', 'Restaurant', 'Bar',
  'Locker rooms', 'Golf carts', 'Caddies', 'Club hire', 'Lessons', 'Parking',
]

export const COURSE_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'maintenance', label: 'Partly open / maintenance' },
  { value: 'closed', label: 'Closed' },
]

export const CURRENCIES = ['USD', 'GBP', 'EUR', 'AUD', 'CAD', 'INR']

export const FEE_INCLUDES = ['Green fee', 'Cart', 'Range balls', 'Lunch', 'Dinner / prize giving', 'Player pack', 'Tee gift']

export const SCORING_BASIS_OPTIONS = [
  { value: 'gross', label: 'Gross only' },
  { value: 'net', label: 'Net only' },
  { value: 'gross-and-net', label: 'Gross and net' },
]

export const TIE_BREAK_OPTIONS = [
  { value: 'countback', label: 'Countback (last 9, 6, 3, 1)' },
  { value: 'playoff', label: 'Sudden-death playoff' },
  { value: 'shared', label: 'Shared position' },
]

export const ROUND_HOLE_OPTIONS = [
  { value: 'all', label: 'All holes' },
  { value: 'front', label: 'Front 9' },
  { value: 'back', label: 'Back 9' },
]

/* ───────── Small helpers ───────── */

export const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Local calendar date "YYYY-MM-DD" (toISOString would shift to UTC and change the day). */
export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Local "YYYY-MM-DDTHH:MM", comparable with datetime-local values. */
export const isoLocalDateTime = (d = new Date()) => `${isoDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export const dist = (a: Point, b: Point) => Math.round(Math.hypot(a.x - b.x, a.y - b.y))

export function formatMoney(amount: number | undefined, currency = 'USD') {
  if (amount === undefined || Number.isNaN(amount)) return '—'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

/** "07:30" → "7:30 AM" */
export function formatClock(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h)) return hhmm
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${suffix}`
}

export function addMinutes(hhmm: string, minutes: number) {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export const formatDay = (iso: string) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'

export const formatDateTime = (iso: string) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

/* ───────── Course set-up ───────── */

/**
 * Generates a plausible hole layout from par and yards: straight par 3s, gentle doglegs on
 * longer holes, a green with front/centre/back points and a couple of hazards.
 */
export function generateHoleMap(hole: HoleData): HoleMap {
  const length = Math.max(80, hole.yards)
  const side = hole.hole % 2 === 0 ? 1 : -1
  const bend = hole.par >= 4 ? side * Math.min(45, length * 0.09) : 0
  const elbow: Point = { x: bend, y: Math.round(length * (hole.par === 5 ? 0.55 : 0.62)) }
  const centre: Point = { x: Math.round(bend * 0.4), y: length }
  const greenDepth = hole.par === 3 ? 12 : 15
  const hazards: HoleHazard[] = [
    { id: `h${hole.hole}b1`, type: 'bunker', at: { x: centre.x - side * 14, y: centre.y - 4 }, size: 6 },
  ]
  if (hole.par >= 4) hazards.push({ id: `h${hole.hole}b2`, type: 'bunker', at: { x: elbow.x + side * 22, y: elbow.y + 10 }, size: 8 })
  if (hole.handicap <= 4) hazards.push({ id: `h${hole.hole}w1`, type: 'water', at: { x: -side * 30, y: Math.round(length * 0.35) }, size: 18 })

  return {
    tee: { x: 0, y: 0 },
    path: hole.par === 3 ? [{ x: 0, y: 0 }, centre] : [{ x: 0, y: 0 }, elbow, centre],
    greenFront: { x: centre.x, y: centre.y - greenDepth },
    greenCentre: centre,
    greenBack: { x: centre.x, y: centre.y + greenDepth },
    hazards,
  }
}

/** Default tee sets from the scorecard: championship (+4%), the scorecard tees, forward (-12%). */
export function defaultTeeSets(holes: HoleData[], rating: number, slope: number): TeeSet[] {
  const scale = (f: number) => holes.map(h => Math.round(h.yards * f))
  return [
    { id: 'tee-black', name: 'Black', color: 'Black', menRating: +(rating + 1.2).toFixed(1), menSlope: Math.min(155, slope + 4), yards: scale(1.04) },
    { id: 'tee-blue', name: 'Blue', color: 'Blue', menRating: rating, menSlope: slope, womenRating: +(rating + 5.8).toFixed(1), womenSlope: Math.min(155, slope + 8), yards: scale(1) },
    { id: 'tee-red', name: 'Red', color: 'Red', menRating: +(rating - 4.5).toFixed(1), menSlope: Math.max(55, slope - 12), womenRating: +(rating + 1.1).toFixed(1), womenSlope: Math.max(55, slope - 2), yards: scale(0.88) },
  ]
}

export const teeTotal = (tee: TeeSet) => tee.yards.reduce((s, y) => s + (Number(y) || 0), 0)

/** Fills every optional course field so screens can rely on it. */
export function withCourseDefaults(c: Course): Course {
  const holeData = c.holeData.map(h => ({ ...h, map: h.map ?? generateHoleMap(h) }))
  return {
    ...c,
    holeData,
    teeSets: c.teeSets?.length ? c.teeSets : defaultTeeSets(holeData, c.rating, c.slope),
    facilities: c.facilities ?? ['Driving range', 'Putting green', 'Pro shop', 'Restaurant', 'Golf carts'],
    status: c.status ?? 'open',
  }
}

/* ───────── Tournament set-up ───────── */

export const defaultRounds = (startDate: string, endDate?: string): TournamentRound[] => {
  if (!startDate) return [{ number: 1, date: '', holes: 'all' }]
  const days = Math.max(1, Math.round((new Date(`${endDate || startDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86_400_000) + 1)
  return Array.from({ length: Math.min(days, 4) }, (_, i) => {
    const d = new Date(`${startDate}T00:00:00`)
    d.setDate(d.getDate() + i)
    return { number: i + 1, date: isoDate(d), holes: 'all' as const }
  })
}

export const DEFAULT_SCORING: ScoringRules = { basis: 'gross-and-net', allowancePct: 95, maxHandicap: 36, tieBreak: 'countback', cutAfterRound: 0, cutSize: 0 }

export const DEFAULT_ELIGIBILITY: Eligibility = { gender: 'open', membersOnly: false, officialHandicapRequired: true, maxHandicap: 36 }

export const DEFAULT_TEE_SHEET: TeeSheetSettings = { startType: 'tee-times', firstTeeTime: '08:00', intervalMinutes: 10, groupSize: 4, startingTees: 'first' }

export function defaultDivisions(teeSetId = 'tee-blue'): Division[] {
  return [{ id: 'div-open', name: 'Open', minHandicap: -10, maxHandicap: 36, teeSetId }]
}

/** Parses legacy free-text fees like "$250" or "$180/team". */
export function feesFromText(text: string): TournamentFees {
  const amount = Number(String(text).replace(/[^0-9.]/g, '')) || 0
  return { currency: 'USD', amount, perTeam: /team/i.test(text), includes: ['Green fee', 'Cart'] }
}

export function defaultRegistration(startDate: string): RegistrationWindow {
  const start = startDate ? new Date(`${startDate}T00:00:00`) : new Date()
  const opens = new Date(start); opens.setDate(opens.getDate() - 45)
  const closes = new Date(start); closes.setDate(closes.getDate() - 3)
  const withdraw = new Date(start); withdraw.setDate(withdraw.getDate() - 7)
  const local = (d: Date, time: string) => `${isoDate(d)}T${time}`
  return {
    opensAt: local(opens, '09:00'),
    closesAt: local(closes, '18:00'),
    waitlist: true,
    withdrawBy: local(withdraw, '18:00'),
    refundPolicy: 'Full refund until the withdrawal deadline, then 50% until registration closes.',
  }
}

/** Fills every optional tournament field so screens can rely on it. */
export function withTournamentDefaults(t: Tournament): Tournament {
  const fees = t.fees ?? feesFromText(t.entryFee)
  const divisions = t.divisions?.length ? t.divisions : defaultDivisions()
  return {
    ...t,
    rounds: t.rounds?.length ? t.rounds : defaultRounds(t.startDate, t.endDate),
    scoring: { ...DEFAULT_SCORING, ...(t.format === 'Stableford' ? { basis: 'net' as const } : {}), ...(t.format === 'Four-Ball' ? { allowancePct: 85 } : {}), ...t.scoring },
    eligibility: t.eligibility ?? DEFAULT_ELIGIBILITY,
    divisions,
    registration: t.registration ?? defaultRegistration(t.startDate),
    fees,
    prizes: t.prizes?.length ? t.prizes : t.prize ? [{ id: 'prz-1', label: 'Winner', value: t.prize }] : [],
    teeSheet: t.teeSheet ?? { ...DEFAULT_TEE_SHEET, startType: /shotgun/i.test(t.time) ? 'shotgun' : 'tee-times', firstTeeTime: timeFromText(t.time) },
    officials: t.officials ?? [],
    localRules: t.localRules ?? '',
  }
}

function timeFromText(text: string) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(text ?? '')
  if (!m) return '08:00'
  let h = Number(m[1]) % 12
  if (/pm/i.test(m[3] ?? '')) h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

/** The short strings older list screens show, derived from the structured set-up. */
export function summaryFields(t: Tournament) {
  const fees = t.fees!
  const sheet = t.teeSheet!
  return {
    entryFee: `${formatMoney(fees.amount, fees.currency)}${fees.perTeam ? '/team' : ''}`,
    prize: t.prizes?.[0]?.value ?? '',
    time: `${formatClock(sheet.firstTeeTime)} ${sheet.startType === 'shotgun' ? 'shotgun start' : 'tee times'}`,
  }
}

/** "per team" / "per group" / "" for fees */
export const feeUnit = (f: TournamentFees) =>
  f.type === 'per-group' ? 'per group' : f.type === 'per-team' || f.perTeam ? 'per team' : ''

/** Fee plus tax / HST, rounded to cents */
export const withTax = (amount: number, f: TournamentFees) => (f.taxRate ? Math.round(amount * (100 + f.taxRate)) / 100 : amount)

/** The division a golfer is placed in: handicap range, then gender and age when the division sets them */
export function divisionForGolfer(divisions: Division[] = [], golfer: { index: number; gender?: 'men' | 'women'; age?: number }) {
  return divisions.find(d =>
    golfer.index >= d.minHandicap && golfer.index <= d.maxHandicap &&
    (!d.gender || d.gender === 'any' || !golfer.gender || d.gender === golfer.gender) &&
    (golfer.age === undefined || ((d.minAge ?? 0) <= golfer.age && golfer.age <= (d.maxAge ?? 200))))
}

/* ───────── Handicaps and scoring ───────── */

/** WHS course handicap × allowance, rounded. */
export function playingHandicap(index: number, tee: TeeSet | undefined, coursePar: number, allowancePct: number, gender: 'men' | 'women' = 'men') {
  const rating = (gender === 'women' ? tee?.womenRating : tee?.menRating) ?? coursePar
  const slope = (gender === 'women' ? tee?.womenSlope : tee?.menSlope) ?? 113
  const courseHandicap = index * (slope / 113) + (rating - coursePar)
  return Math.round(courseHandicap * (allowancePct / 100))
}

/**
 * Handicap allowances the client confirmed (WHS Appendix C). Individual and four-ball formats use one
 * percentage; a scramble takes a different share of each player's course handicap, lowest first.
 */
export const FORMAT_ALLOWANCES: { format: string; allowance: string }[] = [
  { format: 'Individual stroke play', allowance: '95%' },
  { format: 'Individual Stableford', allowance: '95%' },
  { format: 'Individual match play', allowance: '100%' },
  { format: 'Four-Ball (better ball) stroke play', allowance: '85%' },
  { format: 'Four-Ball match play', allowance: '90%' },
  { format: 'Foursomes (alternate shot)', allowance: '50% of the combined team handicap' },
]

export const SCRAMBLE_ALLOWANCES: Record<2 | 3 | 4, number[]> = { 2: [35, 15], 3: [30, 20, 10], 4: [25, 20, 15, 10] }

/** Team playing handicap for a scramble: each player's course handicap × their share, added together. */
export function scrambleTeamHandicap(courseHandicaps: number[]) {
  const size = Math.min(4, Math.max(2, courseHandicaps.length)) as 2 | 3 | 4
  const shares = SCRAMBLE_ALLOWANCES[size]
  return Math.round([...courseHandicaps].sort((a, b) => a - b).reduce((sum, h, i) => sum + (h * (shares[i] ?? 0)) / 100, 0))
}

/** Strokes received on a hole for a playing handicap (stroke index allocation). */
export function strokesOnHole(playing: number, strokeIndex: number, holeCount = 18) {
  if (playing <= 0) return 0
  return Math.floor(playing / holeCount) + (strokeIndex <= playing % holeCount ? 1 : 0)
}

export function stablefordPoints(strokes: number, par: number, received: number) {
  return Math.max(0, 2 + par + received - strokes)
}

export const scoreLabel = (strokes: number, par: number) => {
  const d = strokes - par
  if (strokes === 1) return 'Ace'
  return d <= -3 ? 'Albatross' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double' : `+${d}`
}

export const toPar = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`)

/** Tee times for groups in order, honouring 1st/10th tee starts and shotgun starts. */
export function teeTimeFor(sheet: TeeSheetSettings, groupIndex: number, holeCount: number) {
  if (sheet.startType === 'shotgun') {
    return { time: sheet.firstTeeTime, startHole: (groupIndex % holeCount) + 1 }
  }
  if (sheet.startingTees === 'first-and-tenth' && holeCount === 18) {
    return { time: addMinutes(sheet.firstTeeTime, Math.floor(groupIndex / 2) * sheet.intervalMinutes), startHole: groupIndex % 2 === 0 ? 1 : 10 }
  }
  return { time: addMinutes(sheet.firstTeeTime, groupIndex * sheet.intervalMinutes), startHole: 1 }
}
