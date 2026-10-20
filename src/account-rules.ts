import type { GolferProfile, NewAccount } from './types'

/*
 * Account rules shared by sign-up screens on web and mobile (this file is copied verbatim
 * into UX/Flutter/golf_flutter/src — keep both in step).
 * Specs: Docs/REGISTER GOLFER.txt, Docs/REGISTER ORGANIZER.txt.
 */

/* ───────── Shared ───────── */

export const COUNTRIES = ['Canada', 'United States', 'United Kingdom', 'Ireland', 'Australia', 'New Zealand', 'South Africa', 'Spain', 'Portugal', 'Japan']

const POSTAL: Record<string, { re: RegExp; example: string }> = {
  Canada: { re: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, example: 'A1A 1A1' },
  'United States': { re: /^\d{5}(-\d{4})?$/, example: '12345' },
  'United Kingdom': { re: /^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$/, example: 'SW1A 1AA' },
  Ireland: { re: /^[A-Za-z]\d{2} ?[A-Za-z\d]{4}$/, example: 'D02 X285' },
  Australia: { re: /^\d{4}$/, example: '2000' },
}

/** Error message when a postal code doesn't match the country's format, or null */
export function postalCodeError(country: string, code: string) {
  const f = POSTAL[country]
  return f && !f.re.test(code.trim()) ? `Use the ${country} format, e.g. ${f.example}` : null
}

/** Common and breached passwords are refused outright (NIST SP 800-63B); a real backend checks a full breach list */
const BLOCKED_PASSWORDS = ['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop', 'iloveyou', 'letmein1', 'welcome1', 'golfgolf', 'golfer123', 'admin123', 'abc12345']
export const isBlockedPassword = (pw: string) => BLOCKED_PASSWORDS.includes(pw.toLowerCase()) || /^(.)\1+$/.test(pw)

/** 1–75 characters: letters (any language), spaces, hyphens and apostrophes */
export function nameError(v: string, which: 'first' | 'last') {
  const s = v.trim()
  if (!s) return `Enter your ${which} name`
  if (s.length > 75) return 'Use 75 characters or fewer'
  if (!/^[\p{L}][\p{L}\p{M} '’-]*$/u.test(s)) return 'Use letters, spaces, hyphens or apostrophes'
  return null
}

export const phoneError = (v: string) => (v.replace(/\D/g, '').length < 7 ? 'Enter a valid phone number' : null)

/* ───────── Phone country codes ───────── */

/** Calling codes for the phone pickers. Canada is the default (client decision); golfers elsewhere pick theirs. */
export const PHONE_CODES = [
  { country: 'Canada', flag: '🇨🇦', dial: '+1' },
  { country: 'United States', flag: '🇺🇸', dial: '+1' },
  { country: 'United Kingdom', flag: '🇬🇧', dial: '+44' },
  { country: 'Ireland', flag: '🇮🇪', dial: '+353' },
  { country: 'Australia', flag: '🇦🇺', dial: '+61' },
  { country: 'New Zealand', flag: '🇳🇿', dial: '+64' },
  { country: 'South Africa', flag: '🇿🇦', dial: '+27' },
  { country: 'Spain', flag: '🇪🇸', dial: '+34' },
  { country: 'Portugal', flag: '🇵🇹', dial: '+351' },
  { country: 'Japan', flag: '🇯🇵', dial: '+81' },
  { country: 'India', flag: '🇮🇳', dial: '+91' },
]
export const DEFAULT_PHONE_COUNTRY = 'Canada'

/**
 * "+1 (416) 555-0144" → { country: 'Canada', number: '(416) 555-0144' }.
 * +1 is shared by Canada and the US: [prefer] (e.g. the golfer's country) decides, otherwise Canada.
 */
export function splitPhone(full: string, prefer?: string): { country: string; number: string } {
  const s = full.trim()
  const known = (c?: string) => (c && PHONE_CODES.some(x => x.country === c) ? c : DEFAULT_PHONE_COUNTRY)
  if (!s.startsWith('+')) return { country: known(prefer), number: s }
  const digits = '+' + s.slice(1).replace(/\D/g, '')
  const matches = PHONE_CODES.filter(c => digits.startsWith(c.dial))
  if (!matches.length) return { country: known(prefer), number: s }
  const longest = Math.max(...matches.map(c => c.dial.length))
  const best = matches.filter(c => c.dial.length === longest)
  const pick = best.find(c => c.country === prefer) ?? best.find(c => c.country === DEFAULT_PHONE_COUNTRY) ?? best[0]
  // Drop the "+" and the code's digits, then any separator after them.
  let rest = s.slice(1)
  for (const ch of pick.dial.slice(1)) rest = rest.replace(/^[\s-]*/, '').replace(ch, '')
  return { country: pick.country, number: rest.replace(/^[\s.-]+/, '') }
}

/** The number with its country's code, e.g. "+1 416 555 0144" ('' when no number) */
export function joinPhone(country: string, number: string) {
  const n = number.trim()
  if (!n || n.startsWith('+')) return n
  const code = PHONE_CODES.find(c => c.country === country) ?? PHONE_CODES[0]
  return `${code.dial} ${n}`
}
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* ───────── Golfer profile ───────── */

export const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say']
export const ISSUING_BODIES = ['Golf Canada', 'USGA (GHIN)', 'England Golf', 'Golf Australia', 'Golf Ireland', 'Scottish Golf', 'Wales Golf', 'Other']
/** Golf Canada (WHS) is the official body (client T-08), so it is chosen by default */
export const DEFAULT_ISSUING_BODY = 'Golf Canada'
export const RELATIONSHIPS = ['Spouse / partner', 'Parent', 'Child', 'Sibling', 'Friend', 'Other']
export const CONTACT_METHODS = ['Email', 'SMS / Text', 'Phone call'] as const
export const DIETARY = ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Nut allergy', 'Halal', 'Kosher']
/* Player pack */
export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']
/** Golf glove sizes; ML is medium-large */
export const GLOVE_SIZES = ['S', 'M', 'ML', 'L', 'XL', 'XXL']
/** Which hand the glove is for. Right-handed golfers usually wear a left-hand glove. */
export const GLOVE_HANDS = [
  { value: 'LH', label: 'Left hand (LH)' },
  { value: 'RH', label: 'Right hand (RH)' },
]
export const gloveText = (size?: string, hand?: string) =>
  [size, GLOVE_HANDS.find(h => h.value === hand)?.label].filter(Boolean).join(' · ')
export const TEE_OPTIONS = [
  { value: 'Black', swatch: '#111827' },
  { value: 'Blue', swatch: '#2563eb' },
  { value: 'White', swatch: '#ffffff' },
  { value: 'Gold', swatch: '#c9a227' },
  { value: 'Red', swatch: '#dc2626' },
  { value: 'Green', swatch: '#16a34a' },
]
export const MIN_AGE = 13
export const JUNIOR_UNDER = 18

/** Everything the profile steps collect, as typed */
export interface GolferDraft {
  dob: string
  gender: string
  /** Only for Non-binary / Prefer not to say: which tee ratings to use */
  ratingsGender: '' | 'men' | 'women'
  street: string
  city: string
  region: string
  postalCode: string
  country: string
  ecName: string
  ecPhone: string
  ecRelationship: string
  hasHandicap: '' | 'yes' | 'not-yet'
  handicap: string
  body: string
  memberNo: string
  homeClub: string
  membership: 'Member' | 'Guest'
  tee: string
  contact: '' | (typeof CONTACT_METHODS)[number]
  dietary: string[]
  dietaryNote: string
  shirt: string
  glove: string
  gloveHand: '' | 'LH' | 'RH'
}

export const emptyGolferDraft = (): GolferDraft => ({
  dob: '', gender: '', ratingsGender: '', street: '', city: '', region: '', postalCode: '', country: 'Canada',
  ecName: '', ecPhone: '', ecRelationship: '',
  hasHandicap: '', handicap: '', body: DEFAULT_ISSUING_BODY, memberNo: '', homeClub: '', membership: 'Guest', tee: '',
  contact: 'Email', dietary: [], dietaryNote: '', shirt: '', glove: '', gloveHand: '',
})

export function ageOn(dob: string, today = new Date()) {
  const d = new Date(`${dob}T00:00:00`)
  if (Number.isNaN(d.getTime())) return undefined
  let age = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--
  return age
}

/** "+2.0" (a plus handicap) is stored as −2.0; returns null when it isn't a number */
export function parseHandicap(v: string): number | null {
  const s = v.trim().replace(',', '.')
  if (!s) return null
  const n = s.startsWith('+') ? -Number(s.slice(1)) : Number(s)
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null
}

/** −2.0 → "+2.0", 12.4 → "12.4" */
export const formatHandicap = (n: number) => (n < 0 ? `+${(-n).toFixed(1)}` : n.toFixed(1))

/** "Not yet", or the index with plus handicaps as "+2.0" */
export const handicapText = (p: Pick<GolferProfile, 'hasHandicap' | 'handicapIndex'>) =>
  p.hasHandicap === false ? 'Not yet' : formatHandicap(p.handicapIndex)

/** Show an achievement instead of "0 wins" (#41 §2); best score needs playing history, so a new golfer sees "—" */
export const headlineStat = (p: Pick<GolferProfile, 'wins'>) =>
  p.wins > 0 ? { value: String(p.wins), label: 'Wins' } : { value: '—', label: 'Best score' }

export const needsRatingsChoice = (gender: string) => gender === 'Non-binary' || gender === 'Prefer not to say'

/** Men's or women's tee ratings for a golfer's course handicap */
export function ratingsGenderOf(p: Pick<GolferProfile, 'gender' | 'ratingsGender'>): 'men' | 'women' {
  if (p.gender === 'Female') return 'women'
  if (p.gender === 'Male') return 'men'
  return p.ratingsGender ?? 'men'
}

export type GolferStep = 'about' | 'game' | 'prefs'
export type Errors = Partial<Record<string, string>>

export function validateGolferStep(step: GolferStep, d: GolferDraft): Errors {
  const e: Errors = {}
  if (step === 'about') {
    const age = ageOn(d.dob)
    if (!d.dob) e.dob = 'Enter your date of birth'
    else if (age === undefined || new Date(`${d.dob}T00:00:00`) > new Date()) e.dob = "Date of birth can't be in the future"
    else if (age < MIN_AGE) e.dob = `You must be ${MIN_AGE} or older to create an account. A parent or guardian can contact the organiser.`
    if (!d.gender) e.gender = 'Choose an option'
    if (needsRatingsChoice(d.gender) && !d.ratingsGender) e.ratingsGender = 'Choose which ratings to use'
    if (!d.country) e.country = 'Choose your country'
    if (d.postalCode.trim()) { const p = postalCodeError(d.country, d.postalCode); if (p) e.postalCode = p }
    if (!d.ecName.trim()) e.ecName = 'Enter a contact name'
    const ph = phoneError(d.ecPhone); if (ph) e.ecPhone = ph
  }
  if (step === 'game') {
    if (!d.hasHandicap) e.hasHandicap = 'Let us know if you have a Handicap Index'
    if (d.hasHandicap === 'yes') {
      const n = parseHandicap(d.handicap)
      if (n === null || n < -10 || n > 54) e.handicap = 'Enter a Handicap Index from +10.0 to 54.0'
      if (!d.body) e.body = 'Choose the issuing body'
    }
  }
  if (step === 'prefs') {
    if (!d.contact) e.contact = 'Choose how organisers should contact you'
    if (d.dietary.includes('None') && d.dietary.length > 1) e.dietary = '"None" can’t be combined with other options'
  }
  return e
}

/** "None" is exclusive: picking it clears the rest, picking anything else clears "None" */
export function toggleDietary(prev: string[], next: string[]) {
  const added = next.find(x => !prev.includes(x))
  if (added === 'None') return ['None']
  return next.filter(x => x !== 'None')
}

export function toNewAccount(
  basics: { fullName: string; firstName?: string; lastName?: string; email: string; phone: string; marketingOptIn?: boolean },
  d: GolferDraft,
  emailVerified: boolean,
): NewAccount {
  const n = d.hasHandicap === 'yes' ? parseHandicap(d.handicap) : null
  return {
    fullName: basics.fullName, firstName: basics.firstName, lastName: basics.lastName,
    email: basics.email, phone: basics.phone,
    dob: d.dob, gender: d.gender, ratingsGender: needsRatingsChoice(d.gender) ? (d.ratingsGender || undefined) : undefined,
    street: d.street.trim(), city: d.city.trim(), region: d.region.trim(), postalCode: d.postalCode.trim().toUpperCase(), country: d.country,
    emergencyContactName: d.ecName.trim(), emergencyContactPhone: d.ecPhone.trim(), emergencyContactRelationship: d.ecRelationship || undefined,
    hasHandicap: d.hasHandicap === 'yes',
    handicapIndex: n === null ? '' : String(n),
    handicapBody: d.hasHandicap === 'yes' ? d.body : '',
    handicapNumber: d.hasHandicap === 'yes' ? d.memberNo.trim() : '',
    homeClub: d.homeClub.trim(), preferredTee: d.tee, membership: d.membership,
    preferredContact: d.contact || 'Email',
    dietary: d.dietary, dietaryNote: d.dietaryNote.trim() || undefined,
    shirtSize: d.shirt || undefined, gloveSize: d.glove || undefined, gloveHand: d.gloveHand || undefined,
    marketingOptIn: !!basics.marketingOptIn, emailVerified,
  }
}

/* ───────── Edit profile ───────── */

/** The saved profile as editable draft values */
export function draftFromProfile(p: GolferProfile): GolferDraft {
  return {
    dob: p.dob, gender: p.gender, ratingsGender: p.ratingsGender ?? '',
    street: p.street ?? '', city: p.city ?? '', region: p.region ?? '', postalCode: p.postalCode ?? '',
    country: COUNTRIES.includes(p.country) ? p.country : 'Canada',
    ecName: p.emergencyContactName, ecPhone: p.emergencyContactPhone, ecRelationship: p.emergencyContactRelationship ?? '',
    hasHandicap: p.hasHandicap === false ? 'not-yet' : 'yes',
    handicap: p.hasHandicap === false ? '' : formatHandicap(p.handicapIndex),
    body: ISSUING_BODIES.includes(p.handicapBody) ? p.handicapBody : p.handicapBody ? 'Other' : DEFAULT_ISSUING_BODY,
    memberNo: p.handicapNumber, homeClub: p.homeClub, membership: p.membership, tee: p.preferredTee,
    contact: (CONTACT_METHODS as readonly string[]).includes(p.preferredContact ?? '') ? p.preferredContact as GolferDraft['contact'] : 'Email',
    dietary: p.dietary.filter(x => DIETARY.includes(x)), dietaryNote: p.dietaryNote ?? p.dietary.filter(x => !DIETARY.includes(x)).join(', '),
    shirt: p.shirtSize ?? '', glove: p.gloveSize ?? '', gloveHand: p.gloveHand ?? '',
  }
}

export interface Identity { firstName: string; lastName: string; email: string; phone: string }

/** Every rule from sign-up, for the one-page edit form */
export function validateProfileEdit(who: Identity, d: GolferDraft): Errors {
  const e: Errors = { ...validateGolferStep('about', d), ...validateGolferStep('game', d), ...validateGolferStep('prefs', d) }
  const fe = nameError(who.firstName, 'first'); if (fe) e.firstName = fe
  const le = nameError(who.lastName, 'last'); if (le) e.lastName = le
  if (!who.email.trim()) e.email = 'Email is required'
  else if (!EMAIL_RE.test(who.email.trim())) e.email = 'Enter a valid email address'
  const pe = phoneError(who.phone); if (pe) e.phone = pe
  return e
}

/** Changes to save. A new email must be verified again; a changed index gets today's date. */
export function profilePatch(who: Identity, d: GolferDraft, prev: GolferProfile): Partial<GolferProfile> {
  const a = toNewAccount({ fullName: `${who.firstName} ${who.lastName}`, ...who }, d, prev.emailVerified !== false)
  const index = parseFloat(a.handicapIndex) || 0
  const emailChanged = who.email.trim().toLowerCase() !== prev.email.trim().toLowerCase()
  const indexChanged = a.hasHandicap !== (prev.hasHandicap !== false) || index !== prev.handicapIndex
  return {
    firstName: who.firstName.trim(), lastName: who.lastName.trim(), email: who.email.trim(), phone: who.phone.trim(),
    avatarInitials: `${who.firstName.trim()[0] ?? ''}${who.lastName.trim()[0] ?? ''}`.toUpperCase(),
    dob: a.dob, gender: a.gender, ratingsGender: a.ratingsGender,
    street: a.street, city: a.city ?? '', region: a.region, postalCode: a.postalCode, country: a.country,
    emergencyContactName: a.emergencyContactName, emergencyContactPhone: a.emergencyContactPhone, emergencyContactRelationship: a.emergencyContactRelationship,
    hasHandicap: a.hasHandicap, handicapIndex: index, handicapBody: a.handicapBody, handicapNumber: a.handicapNumber,
    handicapUpdated: indexChanged ? new Date().toISOString().slice(0, 10) : prev.handicapUpdated,
    homeClub: a.homeClub, preferredTee: a.preferredTee, membership: a.membership,
    preferredContact: a.preferredContact, dietary: a.dietary, dietaryNote: a.dietaryNote,
    shirtSize: a.shirtSize ?? '', gloveSize: a.gloveSize, gloveHand: a.gloveHand,
    emailVerified: emailChanged ? false : prev.emailVerified,
  }
}
