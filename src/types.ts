export type ScreenName =
  | 'signin'
  | 'home'
  | 'tournaments'
  | 'tournament-details'
  | 'course-details'
  | 'profile'
  | 'edit-profile'

export interface NavEntry {
  screen: ScreenName
  params?: Record<string, string>
  direction?: 'push' | 'pop'
}

export interface ToastData {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export interface DialogData {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel?: () => void
}

export type TournamentStatus =
  | 'draft'
  | 'published'
  | 'registration-open'
  | 'registration-closed'
  | 'upcoming'
  | 'in-progress'
  | 'completed'
  | 'cancelled'

export type RegistrationStatus = 'open' | 'closed' | 'coming-soon' | 'registered'

export type TournamentFormat = 'Stroke Play' | 'Stableford' | 'Four-Ball' | 'Scramble'

export interface Tournament {
  id: string
  name: string
  dateRange: string
  startDate: string
  endDate?: string
  time: string
  venue: string
  location: string
  city: string
  country: string
  status: TournamentStatus
  format: TournamentFormat
  category: string
  description: string
  courseId: string
  registrationStatus: RegistrationStatus
  /** Organisation that runs it; undefined = run by the platform itself */
  organizerId?: string
  players: number
  maxPlayers: number
  entryFee: string
  prize: string
  imageUrl: string

  /* ── Full tournament set-up (optional so older saved data still loads) ── */
  rounds?: TournamentRound[]
  scoring?: ScoringRules
  eligibility?: Eligibility
  divisions?: Division[]
  registration?: RegistrationWindow
  fees?: TournamentFees
  prizes?: Prize[]
  teeSheet?: TeeSheetSettings
  officials?: Official[]
  contactEmail?: string
  contactPhone?: string
  localRules?: string
  /** Final results are visible to golfers */
  resultsPublished?: boolean

  /* ── Create Tournament wizard (Docs/CREATE TOURNAMENT - REVISED.txt) ── */
  logoUrl?: string
  /** IANA time zone, e.g. "America/Toronto" */
  timeZone?: string
  contactPerson?: string
  participation?: 'individual' | 'team'
  team?: TeamSettings
  /** Target round time and how far behind a group can fall before it's flagged */
  pace?: { targetMinutes: number; flagMinutes: number }
  scoreVerification?: 'organizer' | 'none'
  visibility?: 'public'
}

export interface TeamSettings {
  size: 2 | 3 | 4
  /** Golfers register with partners, or the organiser builds the teams */
  formation: 'players' | 'organizer'
}

export interface TournamentRound {
  number: number
  date: string
  /** Which holes the round is played over */
  holes: 'all' | 'front' | 'back'
  name?: string
}

export type ScoringBasis = 'gross' | 'net' | 'gross-and-net'
export type TieBreak = 'countback' | 'playoff' | 'shared'

export interface ScoringRules {
  basis: ScoringBasis
  /** Handicap allowance applied to course handicap, e.g. 95 */
  allowancePct: number
  /** Highest handicap index accepted for net scoring */
  maxHandicap: number
  tieBreak: TieBreak
  /** Cut after this round (0 = no cut) */
  cutAfterRound: number
  /** Number of players (and ties) who make the cut */
  cutSize: number
  /** Handicap (net results) or scratch (gross only) */
  usage?: 'handicap' | 'scratch'
  /** Handicap Index is locked on this date; course handicaps are calculated once then */
  lockDate?: string
  /** Holes used for a playoff tie-break */
  playoffHoles?: number[]
}

export interface Eligibility {
  minHandicap?: number
  maxHandicap?: number
  minAge?: number
  maxAge?: number
  gender: 'open' | 'men' | 'women'
  membersOnly: boolean
  officialHandicapRequired: boolean
}

export interface Division {
  id: string
  name: string
  minHandicap: number
  maxHandicap: number
  /** Tee set (Course.teeSets[].id) this division plays from */
  teeSetId: string
  gender?: 'any' | 'men' | 'women'
  minAge?: number
  maxAge?: number
  maxPlayers?: number
}

export interface RegistrationWindow {
  /** ISO date-times (local) */
  opensAt: string
  closesAt: string
  waitlist: boolean
  withdrawBy: string
  refundPolicy: string
  minPlayers?: number
  /** Golfers register themselves, the organiser adds them, or both */
  method?: 'self' | 'organizer' | 'both'
  allowWithdrawal?: boolean
}

export interface TournamentFees {
  currency: string
  /** Standard entry */
  amount: number
  memberAmount?: number
  earlyBirdAmount?: number
  earlyBirdUntil?: string
  perTeam: boolean
  includes: string[]
  type?: 'free' | 'per-player' | 'per-team' | 'per-group'
  /** Tax / HST rate in percent; undefined = no tax */
  taxRate?: number
}

export interface Prize {
  id: string
  label: string
  /** Division id, or empty for overall */
  divisionId?: string
  value: string
  category?: string
  /** Hole for longest drive / closest to the pin */
  hole?: number
}

export interface TeeSheetSettings {
  startType: 'tee-times' | 'shotgun'
  /** "HH:MM" 24h */
  firstTeeTime: string
  intervalMinutes: number
  groupSize: 2 | 3 | 4
  /** Tee times off the 1st only, or the 1st and 10th */
  startingTees: 'first' | 'first-and-tenth'
  pairing?: 'automatic' | 'manual'
  /** When golfers can see the tee sheet (local date-time) */
  publishAt?: string
}

export interface Official {
  name: string
  role: string
  phone: string
  /** Marshals and officials with an email get a login for this tournament only (see ops.ts) */
  email?: string
  /** When the organiser sent the login invitation */
  invitedAt?: string
}

export interface HoleData {
  hole: number
  par: number
  yards: number
  handicap: number
  /** Women's par / stroke index when they differ from the men's */
  parWomen?: number
  handicapWomen?: number
  name?: string
  notes?: string
  map?: HoleMap
  /** The course's own picture of the hole (from its website or scorecard); the drawn layout is used without it */
  imageUrl?: string
}

/**
 * Hole geometry in yards on a local grid: the tee sits at (0, 0) and +y points down the hole.
 * The real backend stores latitude/longitude per point; the prototype uses yards so it can
 * draw holes without map tiles. Distances are straight-line yards.
 */
export interface Point { x: number; y: number }

export interface HoleHazard {
  id: string
  type: 'bunker' | 'water' | 'trees'
  at: Point
  /** Radius in yards */
  size: number
}

export interface HoleMap {
  tee: Point
  /** Centre line from tee to green (dogleg points in between) */
  path: Point[]
  greenFront: Point
  greenCentre: Point
  greenBack: Point
  hazards: HoleHazard[]
}

export interface TeeSet {
  id: string
  name: string
  /** Tee marker colour (data, shown as a swatch) */
  color: string
  menRating?: number
  menSlope?: number
  womenRating?: number
  womenSlope?: number
  /** Yards per hole from these tees, in hole order */
  yards: number[]
  /** Nine-hole ratings, needed for 9-hole rounds on an 18-hole course (WHS) */
  menFront?: NineRating
  menBack?: NineRating
  womenFront?: NineRating
  womenBack?: NineRating
}

export interface NineRating { rating: number; slope: number }

/** A past set of ratings / scorecard, kept so tournaments played on it don't change */
export interface CourseVersion {
  version: number
  effectiveFrom: string
  /** Last day it applied */
  until: string
  teeSets: TeeSet[]
  holeData: Pick<HoleData, 'hole' | 'par' | 'yards' | 'handicap' | 'parWomen' | 'handicapWomen'>[]
}

export type CourseStatus = 'open' | 'closed' | 'maintenance'

export interface Course {
  id: string
  name: string
  imageUrl: string
  location: string
  address: string
  city: string
  region: string
  country: string
  description: string
  holes: number
  par: number
  yardage: number
  rating: number
  slope: number
  established: string
  designer: string
  tournamentId?: string
  holeData: HoleData[]
  /** The club's own scorecard as an image */
  scorecardImageUrl?: string
  /** Where the hole pictures come from, e.g. "Augusta Pines Golf Club scorecard" */
  holeImageSource?: string
  /** Organisation that added it; undefined = platform-managed course */
  organizerId?: string

  /* ── Full course details (optional so older saved data still loads) ── */
  geo?: { lat: number; lng: number }
  teeSets?: TeeSet[]
  phone?: string
  email?: string
  website?: string
  bookingUrl?: string
  facilities?: string[]
  dressCode?: string
  status?: CourseStatus
  statusNote?: string

  /* ── Create Course wizard (Docs/CREATE COURSE.txt) ── */
  /** Club / facility; `name` is the course, e.g. "North Course" */
  facilityName?: string
  courseType?: 'public' | 'semi-private' | 'private' | 'resort'
  distanceUnit?: 'yards' | 'metres'
  postalCode?: string
  timeZone?: string
  /** Draft = admins only · Active = usable in tournaments · Archived = hidden from new tournaments */
  lifecycle?: 'draft' | 'active' | 'archived'
  /** Tee set shown on the scorecard (its yards are holeData.yards, its men's rating is `rating`) */
  scorecardTeeId?: string
  /** Ratings / scorecard version and the date it applies from */
  version?: number
  effectiveFrom?: string
  history?: CourseVersion[]
}

export interface GolferProfile {
  firstName: string
  lastName: string
  email: string
  phone: string
  country: string
  city: string
  dob: string
  gender: string
  handicapIndex: number
  memberSince: string
  tournamentsPlayed: number
  wins: number
  avatarInitials: string
  emergencyContactName: string
  emergencyContactPhone: string
  handicapBody: string
  handicapNumber: string
  homeClub: string
  preferredTee: string
  dietary: string[]
  shirtSize: string
  gloveSize?: string
  /** Which hand the glove is for */
  gloveHand?: 'LH' | 'RH'
  /** Profile picture (a data URL in the prototype; an uploaded image URL in the real app) */
  photoUrl?: string
  membership: 'Member' | 'Guest'
  /* ── Registration (Docs/REGISTER GOLFER.txt) ── */
  /** Non-binary / prefer not to say: which tee ratings to use for course handicap */
  ratingsGender?: 'men' | 'women'
  street?: string
  region?: string
  postalCode?: string
  emergencyContactRelationship?: string
  /** false = "Not yet" (no Handicap Index) */
  hasHandicap?: boolean
  /** When the golfer last changed their Handicap Index */
  handicapUpdated?: string
  preferredContact?: string
  dietaryNote?: string
  marketingOptIn?: boolean
  /** Must be true before registering for tournaments */
  emailVerified?: boolean
}

/** What the sign-up + profile-setup flow collects before the account is created */
export interface NewAccount {
  fullName: string
  firstName?: string
  lastName?: string
  email: string
  phone: string
  dob: string
  gender: string
  ratingsGender?: 'men' | 'women'
  street?: string
  city?: string
  region?: string
  postalCode?: string
  country: string
  emergencyContactName: string
  emergencyContactPhone: string
  emergencyContactRelationship?: string
  hasHandicap: boolean
  /** Parsed Handicap Index as text ('' when "not yet"); plus handicaps are negative */
  handicapIndex: string
  handicapBody: string
  handicapNumber: string
  homeClub: string
  preferredTee: string
  membership: 'Member' | 'Guest'
  preferredContact: string
  dietary: string[]
  dietaryNote?: string
  shirtSize?: string
  gloveSize?: string
  gloveHand?: 'LH' | 'RH'
  marketingOptIn?: boolean
  emailVerified: boolean
}

export interface SharedNavProps {
  push: (screen: ScreenName, params?: Record<string, string>) => void
  pop: () => void
  showToast: (message: string, type?: ToastData['type']) => void
  showDialog: (dialog: DialogData) => void
  canGoBack: boolean
}
