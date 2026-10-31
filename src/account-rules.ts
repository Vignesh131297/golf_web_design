import type { GolferProfile, NewAccount } from './types'

/*
 * Account rules shared by sign-up screens on web and mobile (this file is copied verbatim
 * into UX/Flutter/golf_flutter/src — keep both in step).
 * Specs: Docs/REGISTER GOLFER.txt, Docs/REGISTER ORGANIZER.txt.
 */

/* ───────── Shared ───────── */

/*
 * Every country picker (address and phone) lists Canada first, then the United States, then the rest
 * A–Z (client, 21 Oct call). Name · ISO code · calling code; NANP islands carry their area code.
 */
const COUNTRY_TABLE = `Canada CA 1|United States US 1|Afghanistan AF 93|Albania AL 355|Algeria DZ 213|Andorra AD 376|Angola AO 244|Argentina AR 54|Armenia AM 374|Australia AU 61|Austria AT 43|Azerbaijan AZ 994|Bahamas BS 1242|Bahrain BH 973|Bangladesh BD 880|Barbados BB 1246|Belarus BY 375|Belgium BE 32|Belize BZ 501|Benin BJ 229|Bermuda BM 1441|Bhutan BT 975|Bolivia BO 591|Bosnia and Herzegovina BA 387|Botswana BW 267|Brazil BR 55|Brunei BN 673|Bulgaria BG 359|Burkina Faso BF 226|Burundi BI 257|Cambodia KH 855|Cameroon CM 237|Cape Verde CV 238|Central African Republic CF 236|Chad TD 235|Chile CL 56|China CN 86|Colombia CO 57|Comoros KM 269|Congo CG 242|Costa Rica CR 506|Côte d’Ivoire CI 225|Croatia HR 385|Cuba CU 53|Cyprus CY 357|Czechia CZ 420|DR Congo CD 243|Denmark DK 45|Djibouti DJ 253|Dominican Republic DO 1809|Ecuador EC 593|Egypt EG 20|El Salvador SV 503|Equatorial Guinea GQ 240|Eritrea ER 291|Estonia EE 372|Eswatini SZ 268|Ethiopia ET 251|Fiji FJ 679|Finland FI 358|France FR 33|Gabon GA 241|Gambia GM 220|Georgia GE 995|Germany DE 49|Ghana GH 233|Greece GR 30|Guatemala GT 502|Guinea GN 224|Guinea-Bissau GW 245|Guyana GY 592|Haiti HT 509|Honduras HN 504|Hong Kong HK 852|Hungary HU 36|Iceland IS 354|India IN 91|Indonesia ID 62|Iran IR 98|Iraq IQ 964|Ireland IE 353|Israel IL 972|Italy IT 39|Jamaica JM 1876|Japan JP 81|Jordan JO 962|Kazakhstan KZ 7|Kenya KE 254|Kiribati KI 686|Kuwait KW 965|Kyrgyzstan KG 996|Laos LA 856|Latvia LV 371|Lebanon LB 961|Lesotho LS 266|Liberia LR 231|Libya LY 218|Liechtenstein LI 423|Lithuania LT 370|Luxembourg LU 352|Macau MO 853|Madagascar MG 261|Malawi MW 265|Malaysia MY 60|Maldives MV 960|Mali ML 223|Malta MT 356|Marshall Islands MH 692|Mauritania MR 222|Mauritius MU 230|Mexico MX 52|Micronesia FM 691|Moldova MD 373|Monaco MC 377|Mongolia MN 976|Montenegro ME 382|Morocco MA 212|Mozambique MZ 258|Myanmar MM 95|Namibia NA 264|Nauru NR 674|Nepal NP 977|Netherlands NL 31|New Zealand NZ 64|Nicaragua NI 505|Niger NE 227|Nigeria NG 234|North Macedonia MK 389|Norway NO 47|Oman OM 968|Pakistan PK 92|Palau PW 680|Palestine PS 970|Panama PA 507|Papua New Guinea PG 675|Paraguay PY 595|Peru PE 51|Philippines PH 63|Poland PL 48|Portugal PT 351|Puerto Rico PR 1787|Qatar QA 974|Romania RO 40|Russia RU 7|Rwanda RW 250|Samoa WS 685|San Marino SM 378|Saudi Arabia SA 966|Senegal SN 221|Serbia RS 381|Seychelles SC 248|Sierra Leone SL 232|Singapore SG 65|Slovakia SK 421|Slovenia SI 386|Solomon Islands SB 677|Somalia SO 252|South Africa ZA 27|South Korea KR 82|South Sudan SS 211|Spain ES 34|Sri Lanka LK 94|Sudan SD 249|Suriname SR 597|Sweden SE 46|Switzerland CH 41|Syria SY 963|Taiwan TW 886|Tajikistan TJ 992|Tanzania TZ 255|Thailand TH 66|Timor-Leste TL 670|Togo TG 228|Tonga TO 676|Trinidad and Tobago TT 1868|Tunisia TN 216|Turkey TR 90|Turkmenistan TM 993|Tuvalu TV 688|Uganda UG 256|Ukraine UA 380|United Arab Emirates AE 971|United Kingdom GB 44|Uruguay UY 598|Uzbekistan UZ 998|Vanuatu VU 678|Venezuela VE 58|Vietnam VN 84|Yemen YE 967|Zambia ZM 260|Zimbabwe ZW 263`
  .split('|').map(row => {
    const [, name, iso, dial] = row.match(/^(.+) ([A-Z]{2}) (\d+)$/)!
    return { name, iso, dial: `+${dial}` }
  })

const flagOf = (iso: string) => String.fromCodePoint(...[...iso].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))

export const COUNTRIES = COUNTRY_TABLE.map(c => c.name)

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

/** Calling codes for the phone pickers, in the same order as COUNTRIES. Canada is pre-filled (client decision). */
export const PHONE_CODES = COUNTRY_TABLE.map(c => ({
  country: c.name, flag: flagOf(c.iso), dial: c.dial,
  /** How the code is written: "+1 242" for the Bahamas, "+44" for the UK */
  shown: c.dial.startsWith('+1') && c.dial.length > 2 ? `+1 ${c.dial.slice(2)}` : c.dial,
}))
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
  return `${code.shown} ${n}`
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
    // Postal code is required; the rest of the address is optional (client, 21 Oct call)
    if (!d.postalCode.trim()) e.postalCode = 'Enter your postal / ZIP code'
    else { const p = postalCodeError(d.country, d.postalCode); if (p) e.postalCode = p }
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
    // A new index or body has to be confirmed with the handicap body again
    handicapVerified: indexChanged || a.handicapBody !== prev.handicapBody || a.handicapNumber !== prev.handicapNumber ? false : prev.handicapVerified,
  }
}
