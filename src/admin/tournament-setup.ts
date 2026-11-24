import type { Course, Division, Tournament, TournamentStatus } from '../types'
import { staffRoleOf } from '../ops'
import { MOCK_COURSES } from '../data'
import { GOLF_PHOTOS, newId, formatDateRange, deriveRegistrationStatus, venueFieldsFromCourse } from '../store'
import {
  DEFAULT_SCORING, DEFAULT_TEE_SHEET, addMinutes, defaultRegistration, isoDate, isoLocalDateTime, summaryFields,
  withTournamentDefaults,
} from '../golf'

/*
 * Create Tournament wizard: data defaults, validation and saving.
 * Source of truth: Docs/CREATE TOURNAMENT - REVISED.txt ([MVP] items only).
 */

/* ───────── Sections ───────── */

export const SECTIONS = {
  basics:       { step: 'essentials', title: 'Basic information' },
  format:       { step: 'essentials', title: 'Format & participation' },
  rounds:       { step: 'essentials', title: 'Rounds & course' },
  divisions:    { step: 'essentials', title: 'Divisions & tees' },
  scoring:      { step: 'essentials', title: 'Handicap & scoring' },
  tiebreaks:    { step: 'essentials', title: 'Tie-breaks' },
  registration: { step: 'setup',      title: 'Registration & entry' },
  fees:         { step: 'setup',      title: 'Fees' },
  teesheet:     { step: 'setup',      title: 'Tee sheet & pairings' },
  rules:        { step: 'setup',      title: 'Rules & officials' },
  results:      { step: 'setup',      title: 'Scoring & results' },
  prizes:       { step: 'setup',      title: 'Prizes' },
  visibility:   { step: 'setup',      title: 'Communication & visibility' },
} as const

export type SectionKey = keyof typeof SECTIONS
export const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[]
export const STEPS = [
  { key: 'essentials', label: 'Essentials' },
  { key: 'setup', label: 'Setup' },
  { key: 'review', label: 'Review & publish' },
] as const
export type StepKey = (typeof STEPS)[number]['key']

/* ───────── Options ───────── */

export const CATEGORIES = ['Club', 'Corporate', 'Charity', 'Amateur', 'Junior', 'Professional', 'Other']

export const TIME_ZONES = [
  'America/St_Johns', 'America/Halifax', 'America/Toronto', 'America/New_York', 'America/Chicago', 'America/Winnipeg',
  'America/Denver', 'America/Edmonton', 'America/Phoenix', 'America/Los_Angeles', 'America/Vancouver',
  'Europe/London', 'Europe/Dublin', 'Europe/Madrid', 'Australia/Sydney', 'Asia/Kolkata',
]

export const PRIZE_CATEGORIES = [
  'Overall winner', 'Runner-up', 'Division winner', 'Best gross', 'Best net', 'Longest drive', 'Closest to the pin', 'Custom',
]
export const HOLE_PRIZES = ['Longest drive', 'Closest to the pin']

/** Marshals and starters get the marshal console; tournament officials (the committee) get scorecards and disputes; co-organisers are contacts only */
export const OFFICIAL_ROLES = ['Marshal', 'Tournament official', 'Starter', 'Co-organizer']

export const LOCAL_RULE_TEMPLATES: Record<string, string> = {
  'Preferred lies': 'Preferred lies: a ball lying in a closely mown area of the general area may be lifted, cleaned and placed within one club-length, no nearer the hole.',
  'Ground under repair': 'Ground under repair: areas marked with white lines or blue stakes; free relief under Rule 16.1.',
  'Temporary water': 'Temporary water: free relief under Rule 16.1 from any visible standing water.',
}

/** Recommended handicap allowance by format (WHS Appendix C) */
export const RECOMMENDED_ALLOWANCE: Record<string, number> = { 'Stroke Play': 95, Stableford: 95, 'Four-Ball': 85 }

const US_ZONES: Record<string, string> = {
  California: 'America/Los_Angeles', Oregon: 'America/Los_Angeles', Washington: 'America/Los_Angeles', Nevada: 'America/Los_Angeles',
  Arizona: 'America/Phoenix', Colorado: 'America/Denver', Utah: 'America/Denver', Texas: 'America/Chicago', Illinois: 'America/Chicago',
}
/** Time zone suggested from the course location */
export function timeZoneForCourse(c?: Course) {
  if (!c) return ''
  if (c.country === 'Canada') return c.region === 'British Columbia' ? 'America/Vancouver' : c.region === 'Alberta' ? 'America/Edmonton' : 'America/Toronto'
  if (c.country === 'United Kingdom') return 'Europe/London'
  if (c.country === 'Ireland') return 'Europe/Dublin'
  if (c.country === 'Australia') return 'Australia/Sydney'
  return US_ZONES[c.region] ?? 'America/New_York'
}

/* ───────── Defaults ───────── */

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}
export const lockDateFor = (firstRound: string) => (firstRound ? addDays(firstRound, -7) : '')

/** A blank tournament for the wizard */
export function newDraft(contact: { name?: string; email?: string; phone?: string } = {}): Tournament {
  return {
    id: newId('t'), name: '', status: 'draft', format: 'Stroke Play', category: '', description: '',
    courseId: '', imageUrl: GOLF_PHOTOS[0], registrationStatus: 'coming-soon',
    dateRange: '', startDate: '', endDate: '', time: '', venue: '', location: '', city: '', country: '',
    players: 0, maxPlayers: 0, entryFee: '', prize: '',
    participation: 'individual',
    team: { size: 2, formation: 'players' },
    timeZone: '', contactPerson: contact.name ?? '', contactEmail: contact.email ?? '', contactPhone: contact.phone ?? '',
    rounds: [{ number: 1, date: '', holes: 'all', name: 'Round 1' }],
    scoring: { ...DEFAULT_SCORING, usage: 'handicap', lockDate: '', playoffHoles: [] },
    eligibility: { gender: 'open', membersOnly: false, officialHandicapRequired: false },
    divisions: [{ id: 'div-open', name: 'Open', minHandicap: -10, maxHandicap: 54, teeSetId: '', gender: 'any' }],
    registration: { opensAt: '', closesAt: '', waitlist: false, withdrawBy: '', refundPolicy: '', method: 'self', allowWithdrawal: true },
    fees: { type: 'per-player', currency: 'USD', amount: 0, perTeam: false, includes: ['Green fee'] },
    teeSheet: { ...DEFAULT_TEE_SHEET, intervalMinutes: 9, pairing: 'automatic', publishAt: '' },
    pace: { targetMinutes: 255, flagMinutes: 10 },
    // Every tournament has a marshal slot; the organiser fills it if they want one (client, Oct 16)
    officials: [{ name: '', role: 'Marshal', phone: '' }], prizes: [], localRules: '',
    scoreVerification: 'organizer', visibility: 'public',
  }
}

/** An existing tournament with every wizard field filled in */
export function fromExisting(t: Tournament): Tournament {
  const d = withTournamentDefaults(t)
  const course = MOCK_COURSES.find(c => c.id === d.courseId)
  const team = d.format === 'Four-Ball' || d.format === 'Scramble'
  const firstRound = [...d.rounds!].sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? d.startDate
  return {
    ...d,
    participation: d.participation ?? (team ? 'team' : 'individual'),
    team: d.team ?? { size: d.format === 'Scramble' ? 4 : 2, formation: 'players' },
    timeZone: d.timeZone || timeZoneForCourse(course),
    contactPerson: d.contactPerson ?? d.officials?.[0]?.name ?? '',
    rounds: d.rounds!.map(r => ({ ...r, name: r.name ?? `Round ${r.number}` })),
    scoring: { ...d.scoring!, usage: d.scoring!.usage ?? 'handicap', lockDate: d.scoring!.lockDate ?? lockDateFor(firstRound), playoffHoles: d.scoring!.playoffHoles ?? [] },
    divisions: d.divisions!.map(x => ({ ...x, gender: x.gender ?? 'any' })),
    registration: {
      method: 'self', allowWithdrawal: !!d.registration!.withdrawBy, ...d.registration!,
      // Sprint 5 · D1: older team events stored only a golfer count; the team limit is derived from it
      maxTeams: d.registration!.maxTeams ?? (team && d.maxPlayers ? Math.floor(d.maxPlayers / (d.team?.size ?? (d.format === 'Scramble' ? 4 : 2))) : undefined),
    },
    fees: { ...d.fees!, type: d.fees!.type ?? (d.fees!.amount === 0 ? 'free' : d.fees!.perTeam ? 'per-team' : 'per-player') },
    teeSheet: { pairing: 'automatic', publishAt: '', ...d.teeSheet! },
    pace: d.pace ?? { targetMinutes: 255, flagMinutes: 10 },
    prizes: d.prizes!.map(p => ({ ...p, category: p.category ?? (PRIZE_CATEGORIES.includes(p.label) ? p.label : 'Custom') })),
    scoreVerification: d.scoreVerification ?? 'organizer',
    visibility: 'public',
  }
}

/** Fill in dates that follow from round 1 the first time it's set */
export function applyFirstRoundDefaults(t: Tournament, firstRound: string, previousFirst: string): Tournament {
  const scoring = t.scoring!.lockDate === '' || t.scoring!.lockDate === lockDateFor(previousFirst)
    ? { ...t.scoring!, lockDate: lockDateFor(firstRound) } : t.scoring!
  const reg = t.registration!
  const registration = !reg.opensAt && !reg.closesAt && firstRound
    ? { ...reg, ...pick(defaultRegistration(firstRound), ['opensAt', 'closesAt', 'withdrawBy']), refundPolicy: reg.refundPolicy || defaultRegistration(firstRound).refundPolicy }
    : reg
  return { ...t, scoring, registration }
}
function pick<T extends object, K extends keyof T>(o: T, keys: K[]) {
  return Object.fromEntries(keys.map(k => [k, o[k]])) as Pick<T, K>
}

/* ───────── Derived values ───────── */

export const courseOf = (t: Tournament) => MOCK_COURSES.find(c => c.id === t.courseId)
export const sortedRounds = (t: Tournament) => [...(t.rounds ?? [])].sort((a, b) => a.date.localeCompare(b.date))
export const firstRoundDate = (t: Tournament) => sortedRounds(t).find(r => r.date)?.date ?? ''
export const isTeam = (t: Tournament) => t.participation === 'team'

/** Total = fee + tax */
export function feeTotal(t: Tournament) {
  const f = t.fees!
  const tax = f.taxRate ? Math.round(f.amount * f.taxRate) / 100 : 0
  return { amount: f.amount, tax, total: f.amount + tax }
}

/** Tee sheet size: groups, last tee time and shotgun capacity */
export function teeSheetPreview(t: Tournament) {
  const sheet = t.teeSheet!
  const course = courseOf(t)
  const holes = course?.holes ?? 18
  const players = t.maxPlayers || 0
  const groups = Math.ceil(players / sheet.groupSize)
  if (sheet.startType === 'shotgun') {
    const capacity = holes * 2 * sheet.groupSize
    const rows = Array.from({ length: Math.min(groups, 5) }, (_, i) => ({ time: sheet.firstTeeTime, tee: `${Math.floor(i / 2) + 1}${i % 2 ? 'B' : 'A'}`, group: i + 1 }))
    return { groups, last: sheet.firstTeeTime, capacity, rows }
  }
  const twoTees = sheet.startingTees === 'first-and-tenth' && holes === 18
  const slot = (i: number) => (twoTees ? Math.floor(i / 2) : i)
  const rows = Array.from({ length: Math.min(groups, 5) }, (_, i) => ({ time: addMinutes(sheet.firstTeeTime, slot(i) * sheet.intervalMinutes), tee: twoTees && i % 2 ? '10' : '1', group: i + 1 }))
  return { groups, last: groups ? addMinutes(sheet.firstTeeTime, slot(groups - 1) * sheet.intervalMinutes) : sheet.firstTeeTime, capacity: Infinity, rows }
}

/* ───────── Validation ───────── */

export type Errors = Record<string, string>
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const filled = (v?: string) => !!v && v.trim().length > 0

interface Ctx {
  /** Golfers registered so far — some fields lock once anyone has registered */
  registered: number
  /** New tournaments and drafts get "not in the past" checks */
  isDraft: boolean
  today?: string
}

/** Field errors for one section, keyed by field name */
export function validateSection(key: SectionKey, t: Tournament, ctx: Ctx): Errors {
  const e: Errors = {}
  const course = courseOf(t)
  const today = ctx.today ?? isoDate(new Date())
  const first = firstRoundDate(t)
  const rounds = t.rounds ?? []
  switch (key) {
    case 'basics':
      if (!filled(t.name)) e.name = 'Enter a tournament name'
      else if (t.name.trim().length < 3 || t.name.trim().length > 100) e.name = 'Use 3–100 characters'
      if (!filled(t.category)) e.category = 'Choose a category'
      if (!filled(t.description)) e.description = 'Add a short description for golfers'
      if (!filled(t.imageUrl)) e.imageUrl = 'Add a cover image'
      if (!filled(t.timeZone)) e.timeZone = 'Choose a time zone'
      if (!filled(t.contactPerson)) e.contactPerson = 'Who should golfers contact?'
      if (!filled(t.contactEmail)) e.contactEmail = 'Enter a contact email'
      else if (!EMAIL.test(t.contactEmail!.trim())) e.contactEmail = 'Enter a valid email'
      if (filled(t.contactPhone) && t.contactPhone!.replace(/\D/g, '').length < 7) e.contactPhone = 'Enter a valid phone number'
      break
    case 'format':
      if (isTeam(t)) {
        if (!['Four-Ball', 'Scramble'].includes(t.format)) e.format = 'Choose a team format'
        if (t.format === 'Four-Ball' && t.team!.size !== 2) e.teamSize = 'Four-Ball teams are 2 players'
      } else if (!['Stroke Play', 'Stableford'].includes(t.format)) e.format = 'Choose an individual format'
      break
    case 'rounds':
      if (!course) e.courseId = 'Choose a course'
      if (!rounds.length) e.rounds = 'Add at least one round'
      rounds.forEach((r, i) => {
        if (!r.date) e[`round${i}`] = 'Choose a date'
        else if (ctx.isDraft && r.date < today) e[`round${i}`] = "Can't be in the past"
        else if (i > 0 && rounds[i - 1].date && r.date <= rounds[i - 1].date) e[`round${i}`] = 'Must be after the previous round'
        if (course?.holes === 9 && r.holes !== 'all') e[`round${i}`] = 'This course has 9 holes'
      })
      if (t.scoring!.cutAfterRound > 0) {
        if (t.scoring!.cutAfterRound >= rounds.length) e.cutAfterRound = 'The cut must come before the final round'
        if (!(t.scoring!.cutSize >= 1)) e.cutSize = 'How many players make the cut?'
      }
      break
    case 'divisions': {
      const ds = t.divisions ?? []
      if (!ds.length) e.divisions = 'Add at least one division'
      ds.forEach((d, i) => {
        if (!filled(d.name)) e[`div${i}`] = 'Name the division'
        else if (!(d.minHandicap >= -10 && d.maxHandicap <= 54 && d.minHandicap <= d.maxHandicap)) e[`div${i}`] = 'Handicap range must be −10 to 54, min ≤ max'
        else if (d.minAge !== undefined && d.maxAge !== undefined && d.minAge > d.maxAge) e[`div${i}`] = 'Age range: min must be ≤ max'
        else if (!d.teeSetId || !course?.teeSets?.some(x => x.id === d.teeSetId)) e[`div${i}`] = course ? 'Choose the tees this division plays' : 'Choose a course first (Rounds & course)'
        else if (t.scoring!.usage === 'handicap') {
          const tee = course.teeSets!.find(x => x.id === d.teeSetId)!
          if ((d.gender !== 'women' && tee.menRating === undefined) || (d.gender === 'women' && tee.womenRating === undefined))
            e[`div${i}`] = `${tee.name} tees have no ${d.gender === 'women' ? "women's" : "men's"} rating — needed for net scoring`
        }
        const clash = ds.findIndex((o, j) => j < i && overlaps(o, d))
        if (clash >= 0 && !e[`div${i}`]) e[`div${i}`] = `Handicap range overlaps with ${ds[clash].name || `division ${clash + 1}`}`
      })
      break
    }
    case 'scoring': {
      const s = t.scoring!
      if (s.usage === 'handicap') {
        if (!s.lockDate) e.lockDate = 'Choose when handicaps lock'
        else if (first && s.lockDate > first) e.lockDate = 'Must be on or before round 1'
      }
      if (!(s.allowancePct >= 0 && s.allowancePct <= 100)) e.allowancePct = 'Between 0% and 100%'
      if (Number.isNaN(s.maxHandicap) || s.maxHandicap < -10 || s.maxHandicap > 54) e.maxHandicap = 'Between −10 and 54'
      break
    }
    case 'tiebreaks':
      if (t.scoring!.tieBreak === 'playoff' && !t.scoring!.playoffHoles?.length) e.playoffHoles = 'Choose the playoff holes'
      break
    case 'registration': {
      const r = t.registration!
      if (!r.opensAt) e.opensAt = 'When does registration open?'
      if (!r.closesAt) e.closesAt = 'When does registration close?'
      else if (r.opensAt && r.closesAt <= r.opensAt) e.closesAt = 'Must be after registration opens'
      else if (first && r.closesAt.slice(0, 10) >= first) e.closesAt = 'Must close before round 1'
      // Sprint 5 · #189: team events limit teams; the golfer limit is teams × team size
      const max = isTeam(t) ? r.maxTeams ?? 0 : t.maxPlayers
      const unit = isTeam(t) ? 'teams' : 'players'
      const size = isTeam(t) ? t.team!.size : 1
      if (!Number.isInteger(max) || !(max >= 1)) e.maxPlayers = `Enter a whole number of 1 or more`
      else if (!isTeam(t) && max < t.teeSheet!.groupSize) e.maxPlayers = `At least one group (${t.teeSheet!.groupSize} players)`
      else if (max * size < ctx.registered) e.maxPlayers = isTeam(t) ? `${ctx.registered} golfers are already registered — that needs at least ${Math.ceil(ctx.registered / size)} teams` : `${ctx.registered} are already registered`
      if (r.minPlayers !== undefined && max && r.minPlayers > max) e.minPlayers = 'Must be ≤ the maximum'
      if (r.allowWithdrawal) {
        if (!r.withdrawBy) e.withdrawBy = 'Until when can golfers withdraw for free?'
        else if (r.closesAt && r.withdrawBy > r.closesAt) e.withdrawBy = 'Must be on or before registration closes'
      }
      break
    }
    case 'fees': {
      const f = t.fees!
      if (f.type !== 'free' && !(f.amount > 0)) e.amount = 'Enter the fee (or choose Free)'
      if (!f.currency) e.currency = 'Choose a currency'
      if (f.taxRate !== undefined && !(f.taxRate > 0 && f.taxRate <= 100)) e.taxRate = 'Between 0% and 100%'
      break
    }
    case 'teesheet': {
      const s = t.teeSheet!
      if (!s.firstTeeTime) e.firstTeeTime = s.startType === 'shotgun' ? 'Choose the shotgun start time' : 'Choose the first tee time'
      if (s.startType === 'tee-times' && !(s.intervalMinutes >= 5 && s.intervalMinutes <= 20)) e.intervalMinutes = '5–20 minutes'
      if (s.publishAt && first && s.publishAt.slice(0, 10) > first) e.publishAt = 'Publish the tee sheet before round 1'
      const pv = teeSheetPreview(t)
      if (s.startType === 'shotgun' && !isTeam(t) && t.maxPlayers > pv.capacity) e.startType = `A shotgun start fits ${pv.capacity} players on this course`
      break
    }
    case 'rules':
      if (!(t.pace!.targetMinutes >= 120 && t.pace!.targetMinutes <= 420)) e.pace = 'Target round time: 2h to 7h'
      if (!(t.pace!.flagMinutes >= 1 && t.pace!.flagMinutes <= 60)) e.flag = '1–60 minutes'
      ;(t.officials ?? []).forEach((o, i) => {
        const openSlot = !filled(o.name) && !filled(o.email) && staffRoleOf(o)
        if (openSlot) return
        if (!filled(o.name) || !filled(o.role)) e[`official${i}`] = 'Name and role are required'
        else if (filled(o.email) && !EMAIL.test(o.email!.trim())) e[`official${i}`] = 'Enter a valid email'
      })
      break
    case 'results':
      break
    case 'prizes':
      ;(t.prizes ?? []).forEach((p, i) => {
        if (!filled(p.category) || !filled(p.value)) e[`prize${i}`] = 'Choose a category and describe the prize'
        else if (HOLE_PRIZES.includes(p.category!) && !(p.hole && p.hole >= 1 && p.hole <= (course?.holes ?? 18))) e[`prize${i}`] = 'Choose the hole'
      })
      break
    case 'visibility':
      break
  }
  return e
}

function overlaps(a: Division, b: Division) {
  const genders = a.gender === 'any' || b.gender === 'any' || a.gender === b.gender
  const ages = (a.minAge ?? 0) <= (b.maxAge ?? 200) && (b.minAge ?? 0) <= (a.maxAge ?? 200)
  return genders && ages && a.minHandicap <= b.maxHandicap && b.minHandicap <= a.maxHandicap
}

export function validateAll(t: Tournament, ctx: Ctx) {
  return Object.fromEntries(SECTION_KEYS.map(k => [k, validateSection(k, t, ctx)])) as Record<SectionKey, Errors>
}

/** Non-blocking things worth a second look before publishing */
export function warningsFor(t: Tournament): { section: SectionKey; message: string }[] {
  const w: { section: SectionKey; message: string }[] = []
  const course = courseOf(t)
  if (!t.prizes?.length) w.push({ section: 'prizes', message: 'No prizes added' })
  if (!t.officials?.some(o => o.role === 'Co-organizer')) w.push({ section: 'rules', message: 'No co-organisers — only you can manage this tournament' })
  if (t.registration!.minPlayers === undefined) w.push({ section: 'registration', message: 'No minimum number of players set' })
  if (t.scoring!.usage === 'handicap' && course) {
    const anyNoWomen = t.divisions!.filter(d => d.gender === 'any').some(d => course.teeSets?.find(x => x.id === d.teeSetId)?.womenRating === undefined)
    if (anyNoWomen) w.push({ section: 'divisions', message: "A mixed division plays tees with no women's rating — women can't get a net score there" })
  }
  const rec = RECOMMENDED_ALLOWANCE[t.format]
  if (t.scoring!.usage === 'handicap' && rec && t.scoring!.allowancePct !== rec) w.push({ section: 'scoring', message: `Allowance is ${t.scoring!.allowancePct}% (recommended ${rec}% for ${t.format})` })
  if (t.registration!.opensAt && t.registration!.opensAt < isoLocalDateTime() && t.status === 'draft') w.push({ section: 'registration', message: 'Registration opens in the past — it will be open as soon as you publish' })
  return w
}

/* ───────── Saving ───────── */

/** Status a tournament gets when it's published, from its registration window */
export function publishedStatus(t: Tournament, now = isoLocalDateTime()): TournamentStatus {
  const r = t.registration!
  if (now < r.opensAt) return 'published'
  if (now < r.closesAt) return 'registration-open'
  return 'registration-closed'
}

/** The tournament as stored, with fields older screens read filled in */
export function finalize(t: Tournament, status: TournamentStatus, registered: number): Tournament {
  const course = courseOf(t)
  const rounds = sortedRounds(t).map((r, i) => ({ ...r, number: i + 1, name: r.name?.trim() || `Round ${i + 1}` }))
  const start = rounds[0]?.date ?? ''
  const end = rounds[rounds.length - 1]?.date ?? start
  const fees = { ...t.fees!, amount: t.fees!.type === 'free' ? 0 : t.fees!.amount, perTeam: t.fees!.type === 'per-team' }
  const team = isTeam(t)
  const out: Tournament = {
    ...t,
    name: t.name.trim(),
    description: t.description.trim(),
    status,
    registrationStatus: deriveRegistrationStatus(status, t.registrationStatus),
    ...(course ? venueFieldsFromCourse(course) : {}),
    startDate: start, endDate: end,
    dateRange: start ? formatDateRange(start, end) : '',
    players: registered,
    rounds,
    fees,
    team: team ? t.team : undefined,
    // Sprint 5 · #189: the golfer limit always follows the team limit (teams × team size)
    maxPlayers: team ? (t.registration!.maxTeams ?? 0) * t.team!.size : t.maxPlayers,
    registration: { ...t.registration!, maxTeams: team ? t.registration!.maxTeams : undefined },
    scoring: {
      ...t.scoring!,
      basis: t.scoring!.usage === 'scratch' ? 'gross' : t.scoring!.basis,
      // No cuts in amateur / social tournaments (client answer T-12)
      cutAfterRound: 0, cutSize: 0,
    },
    eligibility: { ...t.eligibility!, gender: 'open', maxHandicap: t.scoring!.maxHandicap },
    prizes: (t.prizes ?? []).map(p => ({ ...p, label: p.category === 'Custom' || !p.category ? p.label || 'Prize' : p.category })),
    localRules: (t.localRules ?? '').trim(),
  }
  return start ? { ...out, ...summaryFields(out) } : out
}

export const isLocked = (status: TournamentStatus) => status === 'in-progress' || status === 'completed' || status === 'cancelled'
export const newDivision = (teeSetId = ''): Division => ({ id: `div-${Date.now().toString(36)}`, name: '', minHandicap: 0, maxHandicap: 54, teeSetId, gender: 'any' })
