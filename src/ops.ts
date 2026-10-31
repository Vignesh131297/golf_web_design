import { useSyncExternalStore } from 'react'
import type { Course, HoleData, Official, Prize, TieBreak, Tournament } from './types'
import { MOCK_PROFILE, MOCK_TOURNAMENTS, getCourse } from './data'
import {
  ROUND_STATUS_CODE, ROUND_STATUS_LABEL, cardFor, cardState, entriesFor, groupsFor, leaderboard, roundHoles, roundStatus, setCardState, setRoundStatus, setStrokes,
  setSuspension, suspensionFor, teamSizeOf, teeSetIdFor, type CardState, type Entry, type LeaderboardRow, type RoundStatus, type TeeGroup,
} from './live'
import { addMinutes, playingHandicap, scrambleTeamHandicap, stablefordPoints, strokesOnHole, toPar, uid } from './golf'

/*
 * Tournament-day operations shared by every role (identical copy in the web and mobile prototypes):
 *  - who works a tournament: marshal and official slots with a login for that tournament only
 *  - the incident log: slow play, carts, rules questions, score disputes
 *  - marker scores: playing partners mark each other's cards; mismatches are settled on the spot
 *  - the audit trail of every score changed after entry
 *  - pace of play per group, worked out from the scores entered (GPS cart tags come later)
 *  - the official's day: player status, suspending play, countback and signing off the results
 * Kept in localStorage like the live store. A real backend owns all of this.
 */

/* ───────── People and roles ───────── */

export type StaffRole = 'marshal' | 'official'
export type ActorRole = StaffRole | 'golfer' | 'organiser' | 'admin'
export interface Actor { name: string; role: ActorRole }

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = { marshal: 'Marshal', official: 'Tournament official' }
export const ACTOR_LABEL: Record<ActorRole, string> = {
  marshal: 'Marshal', official: 'Tournament official', golfer: 'Golfer', organiser: 'Organiser', admin: 'Platform admin',
}

/** What an official's role lets them do: marshals and starters look after the course, officials and rules people are the committee */
export function staffRoleOf(o: Pick<Official, 'role'>): StaffRole | null {
  if (/marshal|starter/i.test(o.role)) return 'marshal'
  if (/official|committee|rules|referee/i.test(o.role)) return 'official'
  return null
}

/** Demo logins that already have a password. Anyone else the organiser invites sets their own with the invite code. */
const DEMO_PASSWORDS: Record<string, string> = { 'marshal@gmail.com': 'marshal', 'official@gmail.com': 'official', 'official2@gmail.com': 'official' }

/**
 * open = no login yet · invited = invite sent, password not set · active = can sign in · locked = too many wrong
 * passwords · removed = taken off this tournament · ended = tournament over, access gone
 */
export type SlotStatus = 'open' | 'invited' | 'active' | 'locked' | 'removed' | 'ended'

const isEnded = (t: Tournament) => t.status === 'completed' || t.status === 'cancelled'
const emailKey = (email?: string) => email?.trim().toLowerCase() ?? ''

export function slotStatus(t: Tournament, o: Official): SlotStatus {
  const key = emailKey(o.email)
  if (!key || !o.name.trim()) return 'open'
  if (isEnded(t)) return 'ended'
  if (removalFor(t.id, key)) return 'removed'
  if (key === emailKey(MOCK_PROFILE.email)) return 'active'
  const login = loginFor(key)
  if (!login?.password && accounts.password(key) === undefined) return 'invited'
  return login && isLocked(login) ? 'locked' : 'active'
}

/* ───────── Logins: invite code, own password, lock-out, reset, removal ───────── */

/**
 * Same account rules as the marshal (Oct 10): the organiser's invite carries a one-time code valid 24 h; the
 * person sets their own password; 5 wrong passwords in a row lock the login for 15 min; a reset code lasts
 * 5 min with 3 tries. Taking someone off a tournament, or resetting their password, ends their session at once.
 */
export const LOGIN_RULES = { inviteHours: 24, lockAfter: 5, lockMinutes: 15, resetMinutes: 5, resetTries: 3 }

/**
 * The other accounts on the same sign-in page: golfers, organisers and platform staff. Each app keeps those in its own
 * store and tells this file how to reach them, so forgot password and the lock-out work the same for everyone.
 */
export interface AccountBook {
  password: (email: string) => string | undefined
  setPassword: (email: string, password: string) => void
}

let accounts: AccountBook = { password: () => undefined, setPassword: () => {} }

export const registerAccounts = (book: AccountBook) => { accounts = book }

export interface StaffLogin {
  email: string
  password?: string
  invite?: { code: string; expiresAt: string }
  reset?: { code: string; expiresAt: string; tries: number }
  failed: number
  lockedUntil?: string
  lastSignIn?: string
  /** Sessions that started before this moment are over, for endedReason */
  sessionsEndedAt?: string
  endedReason?: string
}

/** Taken off a tournament: their login stops opening it; what they did stays in the change log */
export interface Removal { at: string; by: Actor; reason: string }

const nowIso = () => new Date().toISOString()
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
const code6 = () => String(Math.floor(100000 + Math.random() * 900000))
const isLocked = (l: StaffLogin) => !!l.lockedUntil && l.lockedUntil > nowIso()
export const passwordOk = (p: string) => p.length >= 8 && /[a-z]/i.test(p) && /\d/.test(p)

export function loginFor(email?: string): StaffLogin | undefined {
  const key = emailKey(email)
  if (!key) return undefined
  if (!data.logins[key] && DEMO_PASSWORDS[key]) data.logins[key] = { email: key, password: DEMO_PASSWORDS[key], failed: 0 }
  return data.logins[key]
}

const ensureLogin = (key: string) => loginFor(key) ?? (data.logins[key] = { email: key, failed: 0 })

export const removalFor = (tournamentId: string, email?: string): Removal | undefined => data.removed[tournamentId]?.[emailKey(email)]

/** True if this email has ever had a marshal or official slot */
const isStaffEmail = (key: string) => MOCK_TOURNAMENTS.some(t => (t.officials ?? []).some(o => emailKey(o.email) === key && staffRoleOf(o)))

/** Sign-up refuses an email that already has a login of any kind */
export const accountExists = (email: string) => accounts.password(emailKey(email)) !== undefined || isStaffEmail(emailKey(email))

/** The organiser sends (or resends) the invite: a new code, and any older one stops working. Returns the code (shown in the prototype). */
export function sendInvite(email: string) {
  const login = ensureLogin(emailKey(email))
  if (login.password) return undefined
  login.invite = { code: code6(), expiresAt: inMinutes(LOGIN_RULES.inviteHours * 60) }
  save()
  return login.invite.code
}

/** The marshal or official sets their own password with the invite code */
export function activateLogin(email: string, code: string, password: string): { ok: true } | { ok: false; field: 'email' | 'code' | 'password'; error: string } {
  const login = loginFor(email)
  if (!login || !isStaffEmail(emailKey(email))) return { ok: false, field: 'email', error: 'No invite for this email. Check with the organiser.' }
  if (login.password) return { ok: false, field: 'email', error: 'This login is already set up. Sign in, or reset your password.' }
  if (!login.invite || login.invite.code !== code.trim()) return { ok: false, field: 'code', error: 'That code doesn’t match. Use the latest code from your invite.' }
  if (login.invite.expiresAt < nowIso()) return { ok: false, field: 'code', error: 'This code has expired. Ask the organiser to resend your invite.' }
  if (!passwordOk(password)) return { ok: false, field: 'password', error: 'At least 8 characters, with letters and numbers' }
  Object.assign(login, { password, invite: undefined, failed: 0, lockedUntil: undefined })
  save()
  return { ok: true }
}

/** Forgot password (or the organiser's reset): a code by email and text. Same answer whether the login exists or not. */
export function startReset(email: string) {
  const key = emailKey(email)
  if (!loginFor(key)?.password && accounts.password(key) === undefined) return undefined
  const login = ensureLogin(key)
  login.reset = { code: code6(), expiresAt: inMinutes(LOGIN_RULES.resetMinutes), tries: LOGIN_RULES.resetTries }
  save()
  return login.reset.code
}

export function finishReset(email: string, code: string, password: string): { ok: true } | { ok: false; field: 'code' | 'password'; error: string } {
  const login = loginFor(email)
  const r = login?.reset
  if (!login || !r || r.expiresAt < nowIso()) return { ok: false, field: 'code', error: 'This code has expired. Ask for a new one.' }
  if (r.code !== code.trim()) {
    r.tries--
    if (r.tries <= 0) login.reset = undefined
    save()
    return { ok: false, field: 'code', error: r.tries > 0 ? `Wrong code. ${r.tries} ${r.tries === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.' }
  }
  if (!passwordOk(password)) return { ok: false, field: 'password', error: 'At least 8 characters, with letters and numbers' }
  if (accounts.password(emailKey(email)) !== undefined) accounts.setPassword(emailKey(email), password)
  else login.password = password
  Object.assign(login, { reset: undefined, failed: 0, lockedUntil: undefined, sessionsEndedAt: nowIso(), endedReason: 'Your password was changed. Sign in with the new one.' })
  save()
  return { ok: true }
}

/** Organiser: send a reset code, unlock the login and sign them out everywhere */
export function resetByOrganiser(email: string) {
  const login = loginFor(email)
  if (!login?.password) return undefined
  Object.assign(login, { failed: 0, lockedUntil: undefined, sessionsEndedAt: nowIso(), endedReason: 'The organiser reset your password. Use the code you were sent to set a new one.' })
  return startReset(email)
}

/** Organiser takes someone off a tournament: they're signed out at once; their decisions and changes stay */
export function removeFromTournament(t: Tournament, o: Official, by: Actor, reason: string) {
  const key = emailKey(o.email)
  if (!key || !reason.trim()) return
  ;(data.removed[t.id] ??= {})[key] = { at: nowIso(), by, reason: reason.trim() }
  const login = ensureLogin(key)
  Object.assign(login, { sessionsEndedAt: nowIso(), endedReason: `${by.name} took you off ${t.name}: ${reason.trim()}` })
  data.audit.push({ id: uid('aud'), tournamentId: t.id, round: 1, kind: 'staff', text: `${o.name} taken off as ${o.role.toLowerCase()}`, reason: reason.trim(), by, at: stamp(t.id) })
  save()
}

export function restoreToTournament(t: Tournament, o: Official, by: Actor) {
  const key = emailKey(o.email)
  if (!data.removed[t.id]?.[key]) return
  delete data.removed[t.id][key]
  data.audit.push({ id: uid('aud'), tournamentId: t.id, round: 1, kind: 'staff', text: `${o.name} put back as ${o.role.toLowerCase()}`, by, at: stamp(t.id) })
  save()
}

/** Checked by the consoles every few seconds: a reason here means this session has to end */
export function sessionEnded(email: string, signedInAt: string): string | undefined {
  const l = loginFor(email)
  return l?.sessionsEndedAt && l.sessionsEndedAt > signedInAt ? l.endedReason : undefined
}

/** upcoming = before tournament day (read-only tee sheet and contacts) · live = full access · ended = no access */
export type AccessWindow = 'upcoming' | 'live' | 'ended'
export const accessWindow = (t: Tournament): AccessWindow => (t.status === 'in-progress' ? 'live' : isEnded(t) ? 'ended' : 'upcoming')

export interface Assignment { tournament: Tournament; official: Official; role: StaffRole; window: AccessWindow }

const WINDOW_ORDER: Record<AccessWindow, number> = { live: 0, upcoming: 1, ended: 2 }

/** Every tournament this person is a marshal or official for. Roles come with the tournament, never platform-wide. */
export function assignmentsFor(email?: string): Assignment[] {
  const key = emailKey(email)
  if (!key) return []
  return MOCK_TOURNAMENTS
    .filter(t => t.status !== 'draft')
    .flatMap(t => (t.officials ?? [])
      .filter(o => emailKey(o.email) === key && staffRoleOf(o) && !removalFor(t.id, key))
      .map(o => ({ tournament: t, official: o, role: staffRoleOf(o)!, window: accessWindow(t) })))
    .sort((a, b) => WINDOW_ORDER[a.window] - WINDOW_ORDER[b.window] || a.tournament.startDate.localeCompare(b.tournament.startDate))
}

export const assignmentFor = (email: string | undefined, tournamentId: string) =>
  assignmentsFor(email).find(a => a.tournament.id === tournamentId)

/** The person filling a role on a tournament (first one with a login), e.g. the marshal on duty */
export const staffOn = (t: Tournament, role: StaffRole) =>
  (t.officials ?? []).find(o => staffRoleOf(o) === role && o.email && o.name)

export type StaffSignIn =
  | { ok: true; email: string; name: string }
  | { ok: false; reason: 'unknown' | 'invalid' | 'invited' | 'locked' | 'removed'; message?: string }

/** The same lock-out for every login. Undefined = the password is right. */
function refusePassword(login: StaffLogin, tried: string, actual: string): StaffSignIn | undefined {
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (isLocked(login)) return { ok: false, reason: 'locked', message: `Too many wrong passwords. Try again after ${time(login.lockedUntil!)}, or reset your password.` }
  if (tried === actual) return undefined
  login.failed++
  if (login.failed >= LOGIN_RULES.lockAfter) Object.assign(login, { failed: 0, lockedUntil: inMinutes(LOGIN_RULES.lockMinutes) })
  save()
  return isLocked(login)
    ? { ok: false, reason: 'locked', message: `Too many wrong passwords. Your login is locked until ${time(login.lockedUntil!)}. Reset your password to get in now.` }
    : { ok: false, reason: 'invalid', message: login.failed >= LOGIN_RULES.lockAfter - 2 ? `Wrong password. ${LOGIN_RULES.lockAfter - login.failed} more and your login locks for ${LOGIN_RULES.lockMinutes} minutes.` : undefined }
}

/** Golfers, organisers and platform staff. 'unknown' = no such account. */
export function authenticateAccount(email: string, password: string): StaffSignIn {
  const key = emailKey(email)
  const actual = accounts.password(key)
  if (actual === undefined) return { ok: false, reason: 'unknown' }
  const login = ensureLogin(key)
  const refused = refusePassword(login, password, actual)
  if (refused) return refused
  Object.assign(login, { failed: 0, lockedUntil: undefined, lastSignIn: nowIso() })
  save()
  return { ok: true, email: key, name: '' }
}

/** Marshal and official sign-in, on the same page as everyone else. 'unknown' = not a staff login. */
export function authenticateStaff(email: string, password: string): StaffSignIn {
  const key = emailKey(email)
  // Someone who also has a golfer or organiser account signs in as that; their marshal duties are offered from there
  if (accounts.password(key) !== undefined || !isStaffEmail(key)) return { ok: false, reason: 'unknown' }
  const login = ensureLogin(key)
  if (!login.password) return { ok: false, reason: 'invited', message: 'Finish setting up your login first: use “Set up your login” with the code from your invite.' }
  const refused = refusePassword(login, password, login.password)
  if (refused) return refused
  const list = assignmentsFor(key)
  if (!list.length) return { ok: false, reason: 'removed', message: 'Your login isn’t on any tournament right now. Contact the organiser.' }
  Object.assign(login, { failed: 0, lockedUntil: undefined, lastSignIn: nowIso() })
  save()
  return { ok: true, email: key, name: list[0].official.name }
}

/* ───────── Clock ───────── */

/**
 * Time stamps on tournament day use the course clock (see paceFor), so the log reads like the day it
 * describes. Seconds come from the real clock to keep entries in order.
 */
function stamp(tournamentId: string) {
  const t = MOCK_TOURNAMENTS.find(x => x.id === tournamentId)
  if (!t || t.status !== 'in-progress') return new Date().toISOString().slice(0, 19)
  return `${t.startDate}T${paceFor(t, 1).clock}:${String(new Date().getSeconds()).padStart(2, '0')}`
}

/* ───────── Incidents ───────── */

export type IncidentKind = 'slow-play' | 'cart' | 'rules' | 'score-dispute' | 'safety' | 'other'

export const INCIDENT_KINDS: { value: IncidentKind; label: string; hint: string }[] = [
  { value: 'slow-play', label: 'Slow play', hint: 'Out of position or holding up the groups behind' },
  { value: 'cart', label: 'Cart rule', hint: 'Cart near a green, in a no-cart area, or too many riders' },
  { value: 'rules', label: 'Rules question', hint: 'Drop, penalty area, out of bounds, free relief' },
  { value: 'score-dispute', label: 'Score dispute', hint: 'Players don’t agree on a score' },
  { value: 'safety', label: 'Safety / conduct', hint: 'Hitting into the group ahead, behaviour' },
  { value: 'other', label: 'Other', hint: 'Anything else worth recording' },
]
export const incidentKindLabel = (k: IncidentKind) => INCIDENT_KINDS.find(x => x.value === k)?.label ?? k

/** open = on the course · committee = waiting for an organiser or official to decide · resolved */
export type IncidentStatus = 'open' | 'committee' | 'resolved'

export interface IncidentUpdate { at: string; by: Actor; text: string }

export interface Incident {
  id: string
  tournamentId: string
  round: number
  kind: IncidentKind
  hole?: number
  /** Players involved */
  entryIds: string[]
  note: string
  raisedBy: Actor
  at: string
  status: IncidentStatus
  updates: IncidentUpdate[]
  decision?: string
  decidedBy?: Actor
  decidedAt?: string
  /** Score changes made because of this decision */
  scoreChangeIds?: string[]
  /** The official handling it, so two officials don't decide the same thing */
  claimedBy?: Actor
}

export const incidentsFor = (tournamentId: string) =>
  data.incidents.filter(i => i.tournamentId === tournamentId).sort((a, b) => b.at.localeCompare(a.at))

export const openIncidentCount = (tournamentId: string) =>
  data.incidents.filter(i => i.tournamentId === tournamentId && i.status !== 'resolved').length

export function logIncident(input: Pick<Incident, 'tournamentId' | 'round' | 'kind' | 'hole' | 'entryIds' | 'note' | 'raisedBy'> & { status?: IncidentStatus }) {
  const incident: Incident = { ...input, id: uid('inc'), at: stamp(input.tournamentId), status: input.status ?? 'open', updates: [] }
  data.incidents.push(incident)
  save()
  return incident
}

export function addIncidentNote(id: string, by: Actor, text: string) {
  const i = data.incidents.find(x => x.id === id)
  if (!i || !text.trim()) return
  i.updates.push({ at: stamp(i.tournamentId), by, text: text.trim() })
  save()
}

/** Marshal can't settle it on the course: the committee (organisers and officials) decides */
export function sendToCommittee(id: string, by: Actor, text?: string) {
  const i = data.incidents.find(x => x.id === id)
  if (!i) return
  i.status = 'committee'
  i.updates.push({ at: stamp(i.tournamentId), by, text: text?.trim() || 'Sent to the committee' })
  save()
}

/**
 * Closes an incident with a decision. A committee decision can change a score; the change goes
 * through correctScore so it lands in the audit trail with the incident attached.
 */
export function resolveIncident(id: string, by: Actor, decision: string, change?: { t: Tournament; entryId: string; holeIndex: number; strokes: number }) {
  const i = data.incidents.find(x => x.id === id)
  // Someone else already decided it (two officials on the same dispute): the first decision stands
  if (!i || i.status === 'resolved') return false
  if (change) {
    const c = correctScore(change.t, change.entryId, i.round, change.holeIndex, change.strokes, `Committee decision: ${decision}`, by, i.id)
    if (c) i.scoreChangeIds = [...(i.scoreChangeIds ?? []), c.id]
  }
  Object.assign(i, { status: 'resolved', decision: decision.trim(), decidedBy: by, decidedAt: stamp(i.tournamentId), claimedBy: i.claimedBy ?? by })
  save()
  return true
}

/** An official takes a dispute so the others know it's handled; taking over from someone else is noted */
export function claimIncident(id: string, by: Actor) {
  const i = data.incidents.find(x => x.id === id)
  if (!i || i.status === 'resolved' || i.claimedBy?.name === by.name) return
  i.updates.push({ at: stamp(i.tournamentId), by, text: i.claimedBy ? `Took this over from ${i.claimedBy.name}` : 'Handling this' })
  i.claimedBy = by
  save()
}

/**
 * What a golfer sees about themselves: their rulings and score disputes, with the decision and any score
 * change. Marshal reports about pace or carts stay with staff (client, 21 Oct).
 */
export function rulingsFor(tournamentId: string, entryId: string) {
  return incidentsFor(tournamentId)
    .filter(i => (i.kind === 'rules' || i.kind === 'score-dispute') && i.entryIds.includes(entryId))
    .map(i => ({ incident: i, changes: data.changes.filter(c => i.scoreChangeIds?.includes(c.id) && c.entryId === entryId) }))
}

/* ───────── Score changes (audit trail) ───────── */

export interface ScoreChange {
  id: string
  tournamentId: string
  entryId: string
  round: number
  holeIndex: number
  hole: number
  from: number | null
  to: number | null
  reason: string
  by: Actor
  at: string
  incidentId?: string
}

export const scoreChangesFor = (tournamentId: string, entryId?: string) =>
  data.changes.filter(c => c.tournamentId === tournamentId && (!entryId || c.entryId === entryId)).sort((a, b) => b.at.localeCompare(a.at))

/** Every change to an entered score after the fact goes through here, with a reason. */
export function correctScore(t: Tournament, entryId: string, round: number, holeIndex: number, to: number | null, reason: string, by: Actor, incidentId?: string) {
  const from = cardFor(t, entryId, round)[holeIndex]
  if (from === to) return undefined
  const course = getCourse(t.courseId)
  const hole = course ? roundHoles(t, course, round)[holeIndex]?.hole ?? holeIndex + 1 : holeIndex + 1
  setStrokes(t, entryId, round, holeIndex, to)
  const change: ScoreChange = { id: uid('chg'), tournamentId: t.id, entryId, round, holeIndex, hole, from, to, reason: reason.trim(), by, at: stamp(t.id), incidentId }
  data.changes.push(change)
  save()
  return change
}

/* ───────── Markers ───────── */

/**
 * Who marks whom, the backend's rule: in each group the player before you on the tee sheet marks your card and
 * the first is marked by the last (A marks B, B marks C … D marks A; a two-ball mark each other). Each player
 * enters their own score and the score of the player they mark; the two cards must agree. When a marker is out
 * of the round (WD, DNF, DQ, no-show), an official gives the card to someone else in the group. Any other change is the organiser's.
 */
export function markerOf(tournamentId: string, round: number, entryId: string): Entry | undefined {
  const field = entriesFor(tournamentId)
  const moved = data.markers[tournamentId]?.[round]?.[entryId]
  if (moved) return field.find(e => e.id === moved)
  const g = groupsFor(tournamentId, round).find(x => x.entryIds.includes(entryId))
  if (!g) return undefined
  // Someone who withdrew or was disqualified in an earlier round isn't on the tee: the rotation closes up around them
  const gone = (id: string) => round > 1 && ['wd', 'dq'].includes(roundStatus(tournamentId, id, round - 1))
  const ring = g.entryIds.filter(id => id === entryId || !gone(id))
  const n = ring.length
  if (n < 2) return undefined
  return field.find(e => e.id === ring[(ring.indexOf(entryId) + n - 1) % n])
}

/** The players this person marks: one, or more after a card is moved to them */
export function markedBy(tournamentId: string, round: number, entryId: string): Entry[] {
  const g = groupsFor(tournamentId, round).find(x => x.entryIds.includes(entryId))
  if (!g) return []
  return entriesFor(tournamentId).filter(e => g.entryIds.includes(e.id) && e.id !== entryId && markerOf(tournamentId, round, e.id)?.id === entryId)
}

/** The player is still out there but their marker isn't (withdrew, disqualified…) and nobody has taken the card */
export function markerMissing(t: Tournament, round: number, entryId: string) {
  if (roundStatus(t.id, entryId, round) !== 'playing' || cardState(t.id, entryId, round) === 'verified') return false
  const m = markerOf(t.id, round, entryId)
  return !!m && roundStatus(t.id, m.id, round) !== 'playing'
}

/** Who can take a card over: the others in the group still playing */
export function markerChoices(t: Tournament, round: number, entryId: string): Entry[] {
  const g = groupsFor(t.id, round).find(x => x.entryIds.includes(entryId))
  const now = markerOf(t.id, round, entryId)?.id
  return entriesFor(t.id).filter(e => !!g?.entryIds.includes(e.id) && e.id !== entryId && e.id !== now && roundStatus(t.id, e.id, round) === 'playing')
}

/** Client, 30 Oct: markers are automatic. An official moves a card when its marker is out of the round; only the organiser makes any other change. */
export const canChangeMarker = (t: Tournament, round: number, entryId: string, by: Actor) => decidesPlay(by) || markerMissing(t, round, entryId)

/** Gives a card to a new marker. Holes the old marker recorded stay on the record; the new one carries on from the next hole. */
export function setMarker(t: Tournament, round: number, entryId: string, markerId: string, reason: string, by: Actor) {
  const from = markerOf(t.id, round, entryId)
  if (!canChangeMarker(t, round, entryId, by) || from?.id === markerId || !reason.trim()) return false
  // What the old marker recorded stays on the record; the new marker only fills in the holes still to come
  ;((data.marker[t.id] ??= {})[entryId] ??= {})[round] = markerCardFor(t, entryId, round)
  ;((data.markers[t.id] ??= {})[round] ??= {})[entryId] = markerId
  const name = (id?: string) => entriesFor(t.id).find(e => e.id === id)?.name ?? 'nobody'
  data.audit.push({ id: uid('aud'), tournamentId: t.id, round, kind: 'marker', entryId, by, at: stamp(t.id), reason: reason.trim(), text: `${name(entryId)}’s marker: ${name(from?.id)} → ${name(markerId)}` })
  save()
  return true
}

/**
 * The marker's record of a player's card. Simulated markers agree unless the seed or the golfer says
 * otherwise; when the signed-in golfer is the marker, only what they entered counts.
 */
export function markerCardFor(t: Tournament, entryId: string, round: number): (number | null)[] {
  const own = cardFor(t, entryId, round)
  const marker = markerOf(t.id, round, entryId)
  const explicit = data.marker[t.id]?.[entryId]?.[round] ?? []
  return own.map((s, i) => (explicit[i] !== undefined && explicit[i] !== null ? explicit[i] : marker?.isMe ? null : s))
}

export function setMarkerStrokes(t: Tournament, entryId: string, round: number, holeIndex: number, strokes: number | null) {
  const card = [...(data.marker[t.id]?.[entryId]?.[round] ?? [])]
  card[holeIndex] = strokes
  ;((data.marker[t.id] ??= {})[entryId] ??= {})[round] = card
  save()
}

/** Holes where the player's own score and their marker's record differ */
export function mismatches(t: Tournament, entryId: string, round: number): number[] {
  const own = cardFor(t, entryId, round)
  const marked = markerCardFor(t, entryId, round)
  return own.flatMap((s, i) => (s !== null && marked[i] !== null && marked[i] !== s ? [i] : []))
}

/* ───────── Verifying cards ───────── */

/** The committee accepts handed-in cards (one, or every clean one at once). A verified card is locked. */
export function verifyCards(t: Tournament, entryIds: string[], round: number, by: Actor) {
  const ids = entryIds.filter(id => cardState(t.id, id, round) !== 'verified')
  if (!ids.length) return 0
  ids.forEach(id => setCardState(t.id, id, round, 'verified'))
  const field = entriesFor(t.id)
  const names = ids.map(id => field.find(e => e.id === id)?.name ?? 'Player')
  data.audit.push({
    id: uid('aud'), tournamentId: t.id, round, kind: 'card', entryId: ids.length === 1 ? ids[0] : undefined, by, at: stamp(t.id),
    text: ids.length === 1 ? `${names[0]}: card verified` : `${ids.length} cards verified`, reason: ids.length > 1 ? names.join(', ') : undefined,
  })
  save()
  return ids.length
}

/** Opens a verified card again to correct it: a reason is required, and never after the round is signed off */
export function unlockCard(t: Tournament, entryId: string, round: number, reason: string, by: Actor) {
  if (!reason.trim() || cardState(t.id, entryId, round) !== 'verified' || signOffFor(t.id, round)) return false
  setCardState(t.id, entryId, round, 'submitted')
  const name = entriesFor(t.id).find(e => e.id === entryId)?.name ?? 'Player'
  data.audit.push({ id: uid('aud'), tournamentId: t.id, round, kind: 'card', entryId, by, at: stamp(t.id), text: `${name}: card unlocked to correct`, reason: reason.trim() })
  save()
  return true
}

/* ───────── Pace of play ───────── */

export type PaceStatus = 'not-started' | 'on-pace' | 'behind' | 'out-of-position' | 'finished'

export const PACE_LABEL: Record<PaceStatus, string> = {
  'not-started': 'Not started', 'on-pace': 'On pace', behind: 'Behind', 'out-of-position': 'Out of position', finished: 'Finished',
}

export interface GroupPace {
  group: TeeGroup
  players: Entry[]
  /** Holes the whole group has finished */
  thru: number
  /** Hole they're on now (null before the start or after the last hole) */
  onHole: number | null
  behindMinutes: number
  /** Holes between this group and the one ahead (2+ means an empty hole in front of them) */
  gapHoles: number | null
  status: PaceStatus
}

const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0) }

/**
 * Pace from the scores entered. The prototype's clock is set by the group furthest ahead of schedule,
 * so every other group's lag is relative to them. With GPS cart tags (TagMarshal) this would use
 * real positions and times instead.
 */
export function paceFor(t: Tournament, round = 1) {
  const course = getCourse(t.courseId)
  const holes = course ? roundHoles(t, course, round).length : 18
  const minutesPerHole = (t.pace?.targetMinutes ?? 255) / holes
  const flagMinutes = t.pace?.flagMinutes ?? 10
  const field = entriesFor(t.id)
  const base = groupsFor(t.id, round)
    .slice()
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time) || a.startHole - b.startHole)
    .map(group => {
      const players = group.entryIds.map(id => field.find(e => e.id === id)).filter((e): e is Entry => !!e)
      const thrus = players.map(p => cardFor(t, p.id, round).filter(s => s !== null).length)
      return { group, players, thru: thrus.length ? Math.min(...thrus) : 0 }
    })

  const first = base.length ? toMinutes(base[0].group.time) : 0
  const clock = t.status === 'in-progress' && base.some(b => b.thru > 0)
    ? Math.max(...base.map(b => toMinutes(b.group.time) + (b.thru + 0.5) * minutesPerHole))
    : t.status === 'completed' ? first + holes * minutesPerHole + 60 : first - 15

  const groups: GroupPace[] = base.map((b, i) => {
    const elapsed = clock - toMinutes(b.group.time)
    const expected = Math.max(0, Math.min(holes, Math.floor(elapsed / minutesPerHole)))
    const behindMinutes = Math.max(0, Math.round((expected - b.thru) * minutesPerHole))
    const ahead = base.slice(0, i).reverse().find(x => x.group.startHole === b.group.startHole)
    const gapHoles = ahead ? ahead.thru - b.thru : null
    const finished = b.thru >= holes || t.status === 'completed'
    const status: PaceStatus =
      finished ? 'finished'
      : elapsed < 0 || (b.thru === 0 && t.status !== 'in-progress') ? 'not-started'
      : gapHoles !== null && gapHoles >= 2 && behindMinutes > 0 ? 'out-of-position'
      : behindMinutes >= flagMinutes ? 'behind'
      : 'on-pace'
    const onHole = finished || status === 'not-started' ? null : ((b.group.startHole - 1 + b.thru) % holes) + 1
    return { ...b, thru: finished ? holes : b.thru, onHole, behindMinutes: finished ? 0 : behindMinutes, gapHoles, status }
  })

  return { clock: addMinutes('00:00', Math.max(0, Math.round(clock))), minutesPerHole, flagMinutes, holes, groups }
}

/* ───────── Official's day: player status, suspending play, signing off results ───────── */

/**
 * The committee's actions besides scores and decisions (client answers, Sept 21 and Oct 16). Each one is
 * kept in the audit trail with who, when and why; nothing is ever deleted.
 */
export type AuditKind = 'status' | 'suspend' | 'resume' | 'sign-off' | 'staff' | 'card' | 'marker' | 'winners' | 'publish' | 'request'

export interface AuditEntry {
  id: string
  tournamentId: string
  round: number
  kind: AuditKind
  text: string
  reason?: string
  entryId?: string
  by: Actor
  at: string
}

/**
 * Statuses a person can choose for a player, given how far they've got. Reinstating goes back to 'playing'. A
 * disqualification is the organiser's decision: an official can ask for one, and can't undo one.
 */
export function statusChoices(t: Tournament, entryId: string, round: number, by?: Actor): RoundStatus[] {
  const started = cardFor(t, entryId, round).some(s => s !== null)
  const now = roundStatus(t.id, entryId, round)
  const official = !!by && !decidesPlay(by)
  if (now !== 'playing') return now === 'dq' && official ? [] : ['playing']
  const all: RoundStatus[] = started ? ['wd', 'dnf', 'dq'] : ['no-show', 'wd', 'dq']
  return official && pendingDq(t.id, entryId) ? all.filter(s => s !== 'dq') : all
}

export function setPlayerStatus(t: Tournament, entryId: string, round: number, status: RoundStatus, reason: string, by: Actor) {
  const from = roundStatus(t.id, entryId, round)
  if (from === status || !reason.trim() || ((status === 'dq' || from === 'dq') && !decidesPlay(by))) return false
  setRoundStatus(t.id, entryId, round, status)
  // Withdrawn or disqualified means out of the rest of the tournament; reinstating undoes that too
  const later = (t.rounds ?? []).map(r => r.number).filter(n => n > round)
  if (status === 'wd' || status === 'dq') later.forEach(n => setRoundStatus(t.id, entryId, n, status))
  if (status === 'playing' && (from === 'wd' || from === 'dq')) later.filter(n => roundStatus(t.id, entryId, n) === from).forEach(n => setRoundStatus(t.id, entryId, n, 'playing'))
  const name = entriesFor(t.id).find(e => e.id === entryId)?.name ?? 'Player'
  data.audit.push({
    id: uid('aud'), tournamentId: t.id, round, kind: 'status', entryId, by, at: stamp(t.id), reason: reason.trim(),
    text: status === 'playing' ? `${name} reinstated (was ${ROUND_STATUS_LABEL[from].toLowerCase()})` : `${name}: ${ROUND_STATUS_LABEL[status].toLowerCase()}`,
  })
  save()
  return true
}

/** Who set a player's status, when and why (the latest change), for the player's own screen */
export function statusNoteFor(tournamentId: string, entryId: string, round: number) {
  return [...data.audit].reverse().find(a => a.kind === 'status' && a.tournamentId === tournamentId && a.entryId === entryId && a.round === round)
}

export const SUSPEND_REASONS = ['Lightning in the area', 'Heavy rain', 'Course unplayable', 'Darkness', 'Other'] as const

/** Stops play for the whole field: the organiser's decision. Golfers' scoring screens and every staff console show it until play resumes. */
export function suspendPlay(t: Tournament, round: number, reason: string, note: string, by: Actor) {
  if (!decidesPlay(by) || suspensionFor(t.id)) return
  const at = stamp(t.id)
  setSuspension(t.id, { reason, note: note.trim() || undefined, by: by.name, at })
  data.audit.push({ id: uid('aud'), tournamentId: t.id, round, kind: 'suspend', text: `Play suspended: ${reason}`, reason: note.trim() || undefined, by, at })
  save()
}

export function resumePlay(t: Tournament, round: number, note: string, by: Actor) {
  const s = suspensionFor(t.id)
  if (!s || !decidesPlay(by)) return
  setSuspension(t.id, undefined)
  data.audit.push({ id: uid('aud'), tournamentId: t.id, round, kind: 'resume', text: `Play resumed (suspended for ${s.reason.toLowerCase()})`, reason: note.trim() || undefined, by, at: stamp(t.id) })
  save()
}

/* ───────── Decisions that belong to the organiser (client, 30 Oct) ───────── */

/**
 * Disqualifying a player and stopping or restarting play are the organiser's call. An official records what they
 * want and why; it waits here until the organiser approves or declines it, and nothing changes on the course until then.
 */
export type RequestKind = 'dq' | 'suspend' | 'resume'
export type RequestStatus = 'pending' | 'approved' | 'declined'

export interface OrganiserRequest {
  id: string
  tournamentId: string
  round: number
  kind: RequestKind
  entryId?: string
  /** Why: the rule broken, or the reason to stop */
  reason: string
  /** Suspend and resume: the message players would see */
  note?: string
  by: Actor
  at: string
  status: RequestStatus
  answer?: string
  decidedBy?: Actor
  decidedAt?: string
}

/** The organiser (or platform staff) makes these calls */
export const decidesPlay = (by: Actor) => by.role === 'organiser' || by.role === 'admin'

export const requestsFor = (tournamentId: string) =>
  data.requests.filter(r => r.tournamentId === tournamentId).sort((a, b) => b.at.localeCompare(a.at))

export const pendingRequests = (tournamentId: string) => requestsFor(tournamentId).filter(r => r.status === 'pending')

export const pendingDq = (tournamentId: string, entryId: string) => pendingRequests(tournamentId).find(r => r.kind === 'dq' && r.entryId === entryId)

export function requestTitle(t: Tournament, r: Pick<OrganiserRequest, 'kind' | 'entryId' | 'reason'>) {
  if (r.kind === 'dq') return `Disqualify ${entriesFor(t.id).find(e => e.id === r.entryId)?.name ?? 'player'}`
  return r.kind === 'suspend' ? `Suspend play: ${r.reason.toLowerCase()}` : 'Resume play'
}

/** An official sends a decision to the organiser. Refused while the same one is already waiting. */
export function raiseRequest(t: Tournament, input: { round: number; kind: RequestKind; entryId?: string; reason: string; note?: string }, by: Actor) {
  if (!input.reason.trim()) return false
  if (pendingRequests(t.id).some(r => r.kind === input.kind && r.entryId === input.entryId)) return false
  const at = stamp(t.id)
  const request: OrganiserRequest = { id: uid('req'), tournamentId: t.id, ...input, reason: input.reason.trim(), note: input.note?.trim() || undefined, by, at, status: 'pending' }
  data.requests.push(request)
  const what = input.kind === 'dq' ? `disqualify ${entriesFor(t.id).find(e => e.id === input.entryId)?.name ?? 'a player'}` : input.kind === 'suspend' ? 'suspend play' : 'resume play'
  data.audit.push({ id: uid('aud'), tournamentId: t.id, round: input.round, kind: 'request', entryId: input.entryId, by, at, text: `Asked the organiser to ${what}`, reason: request.reason })
  save()
  return true
}

/** The organiser's final decision. Approving does the thing itself; declining needs an answer for the official. */
export function decideRequest(t: Tournament, id: string, approve: boolean, answer: string, by: Actor) {
  const r = data.requests.find(x => x.id === id)
  if (!r || r.status !== 'pending' || !decidesPlay(by) || (!approve && !answer.trim())) return false
  const at = stamp(t.id)
  Object.assign(r, { status: approve ? 'approved' : 'declined', answer: answer.trim() || undefined, decidedBy: by, decidedAt: at })
  data.audit.push({
    id: uid('aud'), tournamentId: t.id, round: r.round, kind: 'request', entryId: r.entryId, by, at,
    text: `${approve ? 'Approved' : 'Declined'} ${r.by.name}’s request: ${requestTitle(t, r)}`, reason: answer.trim() || undefined,
  })
  if (approve && r.kind === 'dq' && r.entryId) setPlayerStatus(t, r.entryId, r.round, 'dq', r.reason, by)
  if (approve && r.kind === 'suspend') suspendPlay(t, r.round, r.reason, r.note ?? '', by)
  if (approve && r.kind === 'resume') resumePlay(t, r.round, r.note ?? '', by)
  save()
  return true
}

export interface SignOff { by: Actor; at: string }

export const signOffFor = (tournamentId: string, round: number): SignOff | undefined => data.signOffs[tournamentId]?.[round]

/** Today's round in a multi-round event: the first one not signed off yet (the last one when they all are) */
export const currentRound = (t: Tournament) => { const r = roundNumbers(t); return r.find(n => !signOffFor(t.id, n)) ?? r[r.length - 1] }

/** What has to be true before the committee signs off a round's results */
export function signOffChecks(t: Tournament, round: number) {
  const field = entriesFor(t.id).filter(e => e.status === 'registered')
  const playing = field.filter(e => roundStatus(t.id, e.id, round) === 'playing')
  const unverified = playing.filter(e => cardState(t.id, e.id, round) !== 'verified')
  const decisions = data.incidents.filter(i => i.tournamentId === t.id && i.status === 'committee').length
  const suspended = !!suspensionFor(t.id)
  const requests = pendingRequests(t.id).length
  return {
    playing: playing.length, verified: playing.length - unverified.length, unverified, decisions, suspended, requests,
    excluded: field.length - playing.length, ready: !unverified.length && !decisions && !suspended && !requests && playing.length > 0,
  }
}

/** Locks the round's cards and results; the organiser then publishes them and closes the tournament (client answer, Sept 21). */
export function signOffRound(t: Tournament, round: number, by: Actor) {
  if (!signOffChecks(t, round).ready || signOffFor(t.id, round)) return false
  const at = stamp(t.id)
  ;(data.signOffs[t.id] ??= {})[round] = { by, at }
  data.audit.push({ id: uid('aud'), tournamentId: t.id, round, kind: 'sign-off', text: `Round ${round} results signed off`, by, at })
  save()
  return true
}

/* ───────── Change log: every score change, decision, status change and stoppage ───────── */

export type ActivityKind = 'score' | 'decision' | AuditKind

export interface Activity { id: string; at: string; by: Actor; kind: ActivityKind; title: string; detail?: string }

export function activityFor(t: Tournament): Activity[] {
  const field = entriesFor(t.id)
  const name = (id: string) => field.find(e => e.id === id)?.name ?? 'Player'
  const scores: Activity[] = data.changes.filter(c => c.tournamentId === t.id).map(c => ({
    id: c.id, at: c.at, by: c.by, kind: 'score', title: `${name(c.entryId)} · hole ${c.hole}: ${c.from ?? '–'} → ${c.to ?? '–'}`, detail: c.reason,
  }))
  const decisions: Activity[] = data.incidents
    .filter(i => i.tournamentId === t.id && i.status === 'resolved' && i.decidedBy && i.decidedBy.role !== 'marshal' && i.decidedAt)
    .map(i => ({ id: i.id, at: i.decidedAt!, by: i.decidedBy!, kind: 'decision', title: `Decision · ${incidentKindLabel(i.kind)}${i.hole ? `, hole ${i.hole}` : ''}`, detail: i.decision }))
  const audit: Activity[] = data.audit.filter(a => a.tournamentId === t.id).map(a => ({ id: a.id, at: a.at, by: a.by, kind: a.kind, title: a.text, detail: a.reason }))
  return [...scores, ...decisions, ...audit].sort((a, b) => b.at.localeCompare(a.at))
}

/* ───────── What needs the official now ───────── */

export interface NeedItem {
  id: string
  tone: 'urgent' | 'normal' | 'info'
  title: string
  detail: string
  /** Console tab that deals with it */
  tab: 'incidents' | 'scorecards' | 'pace'
  at?: string
}

/** The official's to-do list for the round: decisions first, then players' requests, then cards. */
export function officialQueue(t: Tournament, round = 1): NeedItem[] {
  const field = entriesFor(t.id).filter(e => e.status === 'registered')
  const name = (id: string) => field.find(e => e.id === id)?.name ?? 'A player'
  const items: NeedItem[] = []
  for (const i of incidentsFor(t.id)) {
    const where = i.hole ? ` · hole ${i.hole}` : ''
    if (i.status === 'committee') {
      items.push({ id: i.id, tone: 'urgent', tab: 'incidents', at: i.at, title: `${incidentKindLabel(i.kind)}${where} — needs a decision`, detail: `${i.entryIds.map(name).join(', ') || i.raisedBy.name}: ${i.note}` })
    } else if (i.status === 'open' && i.raisedBy.role === 'golfer') {
      items.push(i.kind === 'slow-play'
        ? { id: i.id, tone: 'info', tab: 'pace', at: i.at, title: `Slow group reported by a player${where}`, detail: `${i.raisedBy.name}: ${i.note} The marshal has it.` }
        : { id: i.id, tone: 'normal', tab: 'incidents', at: i.at, title: `${i.kind === 'rules' ? 'Ruling asked for' : incidentKindLabel(i.kind)}${where}`, detail: `${i.raisedBy.name}: ${i.note}` })
    }
  }
  const playing = field.filter(e => roundStatus(t.id, e.id, round) === 'playing')
  for (const e of playing.filter(p => markerMissing(t, round, p.id))) {
    const m = markerOf(t.id, round, e.id)!
    items.push({ id: `marker-${e.id}`, tone: 'urgent', tab: 'scorecards', title: `${e.name} has no marker`, detail: `${m.name} is ${ROUND_STATUS_LABEL[roundStatus(t.id, m.id, round)].toLowerCase()}. Give the card to someone else in the group.` })
  }
  const toVerify = playing.filter(e => cardState(t.id, e.id, round) === 'submitted')
  if (toVerify.length) {
    items.push({ id: 'cards', tone: 'normal', tab: 'scorecards', title: `${toVerify.length} card${toVerify.length > 1 ? 's' : ''} handed in to verify`, detail: toVerify.slice(0, 4).map(e => e.name).join(', ') + (toVerify.length > 4 ? ` and ${toVerify.length - 4} more` : '') })
  }
  const diffs = playing.filter(e => mismatches(t, e.id, round).length)
  if (diffs.length) {
    items.push({ id: 'diffs', tone: 'info', tab: 'scorecards', title: `${diffs.length} score discrepanc${diffs.length > 1 ? 'ies' : 'y'} on the course`, detail: `${diffs.map(e => e.name).join(', ')}. Players settle these with their marker; it comes to you only if they can’t agree.` })
  }
  return items
}

/* ───────── Results: individual, Four-Ball and scramble, with countback ───────── */

/** gross = strokes · net = strokes less handicap strokes · points = Stableford */
export type RankBasis = 'gross' | 'net' | 'points'

export const RANK_LABEL: Record<RankBasis, string> = { gross: 'Gross', net: 'Net', points: 'Points' }

/** The results lists a tournament keeps: Stableford ranks by points; otherwise what the organiser set (gross, net or both) */
export function basesFor(t: Tournament): RankBasis[] {
  if (t.format === 'Stableford') return ['points']
  const basis = t.scoring?.basis ?? (t.format === 'Stroke Play' ? 'gross' : 'gross-and-net')
  return basis === 'gross-and-net' ? ['gross', 'net'] : [basis]
}

export const roundNumbers = (t: Tournament) => (t.rounds?.length ? t.rounds.map(r => r.number) : [1])
const finalRound = (t: Tournament) => { const r = roundNumbers(t); return r[r.length - 1] }

export interface ResultRow {
  /** Entry id, or the team id in Four-Ball and scramble */
  id: string
  /** The player, or the team: "Carter & Nguyen" (Four-Ball), "Team Carter" (scramble) */
  name: string
  members: Entry[]
  /** The player, or the team's first player */
  entry: Entry
  divisionId: string
  isMe: boolean
  thru: number
  holes: number
  gross: number
  grossToPar: number
  net: number
  netToPar: number
  points: number
  /** Playing handicap: the player's, or the scramble team's */
  playing: number
  /** Each member's playing handicap (Four-Ball: 85% of course handicap each; scramble: full course handicap) */
  handicaps: number[]
  state: CardState
  status: RoundStatus
  /** What counts on each hole (null = not played yet) */
  perHole: { gross: (number | null)[]; net: (number | null)[]; points: (number | null)[] }
  /** Four-Ball: whose ball counted on each hole for the main result */
  counted?: (string | null)[]
}

const siOf = (h: HoleData, n: number) => (n === 9 ? Math.ceil(h.handicap / 2) : h.handicap)
const sumOf = (a: (number | null)[]) => a.reduce<number>((s, v) => s + (v ?? 0), 0)
const surname = (e: Entry) => e.name.split(' ').slice(-1)[0]

function courseHandicap(t: Tournament, course: Course, entry: Entry, allowancePct: number, nine: boolean) {
  const tee = course.teeSets?.find(ts => ts.id === teeSetIdFor(t, entry))
  const full = playingHandicap(entry.handicapIndex, tee, course.holeData.reduce((s, h) => s + h.par, 0), allowancePct, entry.gender)
  return nine ? Math.round(full / 2) : full
}

function totals(holes: HoleData[], gross: (number | null)[], net: (number | null)[], points: (number | null)[]) {
  const par = holes.reduce((s, h, i) => s + (gross[i] === null ? 0 : h.par), 0)
  const g = sumOf(gross), nt = sumOf(net)
  return { thru: gross.filter(v => v !== null).length, holes: holes.length, gross: g, grossToPar: g - par, net: nt, netToPar: nt - par, points: sumOf(points) }
}

function playerRow(t: Tournament, round: number, r: LeaderboardRow, holes: HoleData[]): ResultRow {
  const n = holes.length
  const card = cardFor(t, r.entry.id, round)
  const got = (i: number) => strokesOnHole(r.playing, siOf(holes[i], n), n)
  return {
    id: r.entry.id, name: r.entry.name, members: [r.entry], entry: r.entry, divisionId: r.entry.divisionId, isMe: !!r.entry.isMe,
    thru: r.thru, holes: r.holes, gross: r.gross, grossToPar: r.grossToPar, net: r.net, netToPar: r.netToPar, points: r.points,
    playing: r.playing, handicaps: [r.playing], state: r.state, status: r.status,
    perHole: {
      gross: card,
      net: card.map((s, i) => (s === null ? null : s - got(i))),
      points: card.map((s, i) => (s === null ? null : stablefordPoints(s, holes[i].par, got(i)))),
    },
  }
}

/**
 * Four-Ball (better ball): partners play their own ball off 85% of their course handicap and the better score on
 * each hole counts, gross and net separately. Scramble: one team score per hole off the team handicap (35/15,
 * 30/20/10 or 25/20/15/10% of the players' course handicaps, lowest first — client answer T-07). The prototype
 * stands in for the scramble's single team card with the best of the players' cards on each hole.
 */
function teamRow(t: Tournament, round: number, id: string, members: LeaderboardRow[], holes: HoleData[], course: Course): ResultRow {
  const n = holes.length
  const four = t.format === 'Four-Ball'
  const main = basesFor(t)[0]
  const cards = members.map(m => cardFor(t, m.entry.id, round))
  // A disqualified player's scores don't count; a partner who withdrew keeps the holes they finished
  const counts = members.map(m => m.status !== 'dq')
  const gross: (number | null)[] = [], net: (number | null)[] = [], points: (number | null)[] = [], counted: (string | null)[] = []
  const handicaps = members.map(m => courseHandicap(t, course, m.entry, four ? t.scoring?.allowancePct ?? 85 : 100, n === 9))
  const playing = four ? 0 : scrambleTeamHandicap(handicaps)
  holes.forEach((h, i) => {
    const balls = members.flatMap((m, k) => {
      const s = cards[k][i]
      if (s === null || !counts[k]) return []
      const got = strokesOnHole(four ? handicaps[k] : playing, siOf(h, n), n)
      return [{ who: m.entry.name, gross: s, net: s - got, points: stablefordPoints(s, h.par, got) }]
    })
    if (!balls.length) { gross.push(null); net.push(null); points.push(null); counted.push(null); return }
    const best = [...balls].sort((a, b) => (main === 'points' ? b.points - a.points : main === 'net' ? a.net - b.net : a.gross - b.gross))[0]
    gross.push(Math.min(...balls.map(b => b.gross)))
    net.push(Math.min(...balls.map(b => b.net)))
    points.push(Math.max(...balls.map(b => b.points)))
    counted.push(best.who)
  })
  const active = members.filter(m => m.status === 'playing')
  const states = active.map(m => m.state)
  const first = members[0].entry
  return {
    id, members: members.map(m => m.entry), entry: first, divisionId: first.divisionId, isMe: members.some(m => m.entry.isMe),
    name: members.length === 1 ? first.name : four ? members.map(m => surname(m.entry)).join(' & ') : `Team ${surname(first)}`,
    ...totals(holes, gross, net, points), playing, handicaps,
    state: !states.length ? members[0].state : states.every(s => s === 'verified') ? 'verified' : states.every(s => s !== 'in-progress') ? 'submitted' : 'in-progress',
    status: active.length ? 'playing' : members[0].status,
    perHole: { gross, net, points }, counted: four ? counted : undefined,
  }
}

/** Every player (or team) for one round, unsorted */
export function resultRows(t: Tournament, round = 1, divisionId?: string): ResultRow[] {
  const course = getCourse(t.courseId)
  if (!course) return []
  const holes = roundHoles(t, course, round)
  const board = leaderboard(t, round)
  let rows: ResultRow[]
  if (teamSizeOf(t) === 1) rows = board.map(r => playerRow(t, round, r, holes))
  else {
    const order = entriesFor(t.id).map(e => e.id)
    const teams = new Map<string, LeaderboardRow[]>()
    for (const r of [...board].sort((a, b) => order.indexOf(a.entry.id) - order.indexOf(b.entry.id))) {
      const k = r.entry.teamId ?? r.entry.id
      teams.set(k, [...(teams.get(k) ?? []), r])
    }
    rows = [...teams].map(([id, m]) => teamRow(t, round, id, m, holes, course))
  }
  return divisionId ? rows.filter(r => r.divisionId === divisionId) : rows
}

export interface Standing { row: ResultRow; position: string; tieNote?: string }

const keyOf = (basis: RankBasis) => (r: Pick<ResultRow, 'grossToPar' | 'netToPar' | 'points'>) =>
  basis === 'points' ? -r.points : basis === 'net' ? r.netToPar : r.grossToPar

const countbackHoles = (n: number) => (n >= 18 ? [9, 6, 3, 1] : [6, 3, 1].filter(c => c < n))
const countbackLabel = (c: number, n: number) => (c === 1 ? 'last hole' : c === 9 && n === 18 ? 'back 9' : `last ${c}`)
const showCountback = (v: number, basis: RankBasis) => (basis === 'points' ? `${-v} pts` : Number.isInteger(v) ? String(v) : v.toFixed(1))

/**
 * Countback value for the last `count` holes, lower is better (points are negated). Net: the gross for those holes
 * less the same share of the handicap (½, ⅓, ⅙, 1/18 — client answer T-11); Four-Ball adds up the better net ball.
 */
function countbackValue(t: Tournament, r: ResultRow, count: number, basis: RankBasis) {
  const tail = (a: (number | null)[]) => sumOf(a.slice(r.holes - count))
  if (basis === 'points') return -tail(r.perHole.points)
  if (basis === 'gross') return tail(r.perHole.gross)
  if (t.format === 'Four-Ball') return tail(r.perHole.net)
  return Math.round((tail(r.perHole.gross) - (r.playing * count) / r.holes) * 100) / 100
}

interface Placed<T> { item: T; position: string; tieNote?: string }

/**
 * Places in score order. A tie is split by countback when the tournament uses it and everyone tied has finished;
 * level after the last hole means a shared place. A playoff, when the tournament uses one, happens on the course.
 */
function placeAll<T>(ranked: T[], key: (x: T) => number, o: { method: TieBreak; finished: (x: T) => boolean; values: (x: T) => number[]; labels: string[]; show: (v: number) => string }): Placed<T>[] {
  const out: Placed<T>[] = []
  let place = 1
  for (let i = 0; i < ranked.length;) {
    const tied = ranked.filter(r => key(r) === key(ranked[i]))
    const finished = tied.every(o.finished)
    if (tied.length === 1) out.push({ item: tied[0], position: String(place) })
    else if (o.method !== 'countback' || !finished) {
      const note = !finished ? 'Tied — countback once everyone has finished' : o.method === 'playoff' ? 'Tied — decided by a playoff on the course' : 'Shared place'
      tied.forEach(r => out.push({ item: r, position: `T${place}`, tieNote: note }))
    } else {
      const values = new Map(tied.map(r => [r, o.values(r)] as const))
      const cmp = (a: T, b: T) => {
        const va = values.get(a)!, vb = values.get(b)!
        for (let k = 0; k < va.length; k++) if (va[k] !== vb[k]) return va[k] - vb[k]
        return 0
      }
      const sorted = [...tied].sort(cmp)
      const decidedAt = o.labels.findIndex((_, k) => new Set(tied.map(r => values.get(r)![k])).size > 1)
      sorted.forEach(r => {
        const level = sorted.filter(x => cmp(x, r) === 0).length
        const first = sorted.findIndex(x => cmp(x, r) === 0)
        out.push({
          item: r, position: `${level > 1 ? 'T' : ''}${place + first}`,
          tieNote: decidedAt < 0 ? 'Level after countback — shared place' : `Countback, ${o.labels[decidedAt]}: ${o.show(values.get(r)![decidedAt])}`,
        })
      })
    }
    place += tied.length
    i += tied.length
  }
  return out
}

/** One round in order, on the tournament's main basis unless asked for another (gross or net list, a division) */
export function ranking(t: Tournament, round = 1, opts: { divisionId?: string; basis?: RankBasis } = {}): Standing[] {
  const basis = opts.basis ?? basesFor(t)[0]
  const key = keyOf(basis)
  const rows = resultRows(t, round, opts.divisionId)
  const out = (r: ResultRow) => r.status !== 'playing'
  rows.sort((a, b) => Number(out(a)) - Number(out(b)) || Number(a.thru === 0) - Number(b.thru === 0) || key(a) - key(b) || b.thru - a.thru)
  const ranked = rows.filter(r => !out(r) && r.thru > 0)
  const n = rows[0]?.holes ?? 18
  const segs = countbackHoles(n)
  const placed = placeAll(ranked, key, {
    method: t.scoring?.tieBreak ?? 'countback',
    finished: r => r.thru === r.holes,
    values: r => segs.map(c => countbackValue(t, r, c, basis)),
    labels: segs.map(c => countbackLabel(c, n)),
    show: v => showCountback(v, basis),
  })
  return [
    ...placed.map(p => ({ row: p.item, position: p.position, tieNote: p.tieNote })),
    ...rows.filter(r => out(r) || r.thru === 0).map(row => ({ row, position: out(row) ? ROUND_STATUS_CODE[row.status] : '–' })),
  ]
}

/** The committee's round results (official's results board) */
export const standings = (t: Tournament, round = 1, basis?: RankBasis) => ranking(t, round, { basis })

export interface OverallRow {
  id: string
  name: string
  members: Entry[]
  entry: Entry
  divisionId: string
  isMe: boolean
  position: string
  tieNote?: string
  /** Score per round on this basis (null = not played yet) */
  byRound: (number | null)[]
  total: number
  toPar: number
  /** Finished every round so far */
  complete: boolean
  /** A WD, NS, DNF or DQ in any round so far leaves the player out */
  out?: { round: number; status: RoundStatus }
}

/**
 * Standings after a round (client answer T-11): rounds added up on the basis asked for (gross, net or points).
 * A tie goes to countback on the last round's card.
 */
export function overallStandings(t: Tournament, upToRound: number, opts: { divisionId?: string; basis?: RankBasis } = {}): OverallRow[] {
  const basis = opts.basis ?? basesFor(t)[0]
  const rounds = roundNumbers(t).filter(n => n <= upToRound)
  const boards = rounds.map(n => resultRows(t, n, opts.divisionId))
  const value = (r: ResultRow) => (basis === 'points' ? r.points : basis === 'net' ? r.net : r.gross)
  const over = (r: ResultRow) => (basis === 'points' ? 0 : basis === 'net' ? r.netToPar : r.grossToPar)
  const lastRow = new Map<string, ResultRow>()
  const rows: OverallRow[] = (boards[0] ?? []).map(first => {
    const per = boards.map(b => b.find(r => r.id === first.id))
    const outAt = per.findIndex(r => r && r.status !== 'playing')
    const byRound = per.map(r => (r && r.thru ? value(r) : null))
    const last = per[per.length - 1]
    if (last) lastRow.set(first.id, last)
    return {
      id: first.id, name: first.name, members: first.members, entry: first.entry, divisionId: first.divisionId, isMe: first.isMe, position: '', byRound,
      total: sumOf(byRound), toPar: per.reduce((s, r) => s + (r && r.thru ? over(r) : 0), 0),
      complete: per.every(r => !!r && r.thru === r.holes),
      out: outAt >= 0 ? { round: rounds[outAt], status: per[outAt]!.status } : undefined,
    }
  })
  const key = (r: OverallRow) => (basis === 'points' ? -r.total : r.toPar)
  const played = (r: OverallRow) => r.byRound.some(v => v !== null)
  rows.sort((a, b) => Number(!!a.out) - Number(!!b.out) || Number(!played(a)) - Number(!played(b)) || key(a) - key(b))
  const n = boards[boards.length - 1]?.[0]?.holes ?? 18
  const segs = countbackHoles(n)
  const lastNo = rounds[rounds.length - 1]
  const placed = placeAll(rows.filter(r => !r.out && played(r)), key, {
    method: t.scoring?.tieBreak ?? 'countback',
    finished: r => r.complete,
    values: r => { const l = lastRow.get(r.id); return segs.map(c => (l ? countbackValue(t, l, c, basis) : 0)) },
    labels: segs.map(c => `${rounds.length > 1 ? `round ${lastNo}, ` : ''}${countbackLabel(c, n)}`),
    show: v => showCountback(v, basis),
  })
  placed.forEach(p => { p.item.position = p.position; p.item.tieNote = p.tieNote })
  const rest = rows.filter(r => r.out || !played(r))
  rest.forEach(r => { r.position = r.out ? ROUND_STATUS_CODE[r.out.status] : '–' })
  return [...placed.map(p => p.item), ...rest]
}

/* ───────── Winners ───────── */

export interface Winner {
  prizeId: string
  /** Player or team id from the results; empty until someone is picked */
  rowId?: string
  name?: string
  /** The winning score, or the distance for a hole prize */
  detail?: string
}

export interface WinnerList { winners: Winner[]; by: Actor; at: string }

/** The tournament's prizes; with none set up, a winner for each results list */
export function prizesFor(t: Tournament): Prize[] {
  if (t.prizes?.length) return t.prizes
  const team = teamSizeOf(t) > 1
  return basesFor(t).map((b, i) => ({
    id: `prz-${b}`, label: b === 'points' ? (team ? 'Winning team' : 'Winner') : `${RANK_LABEL[b]} ${team ? 'winners' : 'winner'}`, value: i === 0 ? t.prize : '',
  }))
}

/** Which list a prize goes by. Hole prizes (closest to the pin, longest drive) are measured on the course and picked by hand. */
export function prizeBasis(t: Tournament, p: Prize): RankBasis | 'hole' {
  if (p.hole || /closest|longest|drive|pin|hole.in.one/i.test(p.label)) return 'hole'
  if (/net/i.test(p.label)) return 'net'
  if (t.format === 'Stableford' || /points|stableford/i.test(p.label)) return 'points'
  if (/gross|champion/i.test(p.label)) return 'gross'
  return basesFor(t)[0]
}

export const prizeLabel = (t: Tournament, p?: Prize) =>
  !p ? 'Prize' : `${p.label}${p.divisionId ? ` · ${t.divisions?.find(d => d.id === p.divisionId)?.name.replace(/\s*\(.*\)$/, '') ?? ''}` : ''}`

/** The final list a prize is decided on: everyone who finished every round, in order */
export function prizeStandings(t: Tournament, p: Prize) {
  const basis = prizeBasis(t, p)
  if (basis === 'hole') return []
  return overallStandings(t, finalRound(t), { divisionId: p.divisionId || undefined, basis }).filter(r => !r.out && r.complete)
}

export const scoreText = (r: Pick<OverallRow, 'total' | 'toPar'>, basis: RankBasis) => (basis === 'points' ? `${r.total} pts` : `${r.total} (${toPar(r.toPar)})`)

/** Top of each list after the last round. A player or team takes one ranked prize; the next best gets the other. */
export function suggestWinners(t: Tournament): Winner[] {
  const taken = new Set<string>()
  return prizesFor(t).map(p => {
    const basis = prizeBasis(t, p)
    if (basis === 'hole') return { prizeId: p.id }
    const pick = prizeStandings(t, p).find(r => !taken.has(r.id))
    if (!pick) return { prizeId: p.id }
    taken.add(pick.id)
    return { prizeId: p.id, rowId: pick.id, name: pick.name, detail: scoreText(pick, basis) }
  })
}

export const declaredWinners = (tournamentId: string): WinnerList | undefined => data.winners[tournamentId]

/** What golfers see once results are out: the organiser's confirmed winners, or the top of each list */
export const winnersFor = (t: Tournament): Winner[] => data.winners[t.id]?.winners ?? suggestWinners(t)

/** The organiser confirms who won what, after the committee signs off. Kept in the change log. */
export function declareWinners(t: Tournament, winners: Winner[], by: Actor) {
  const prizes = prizesFor(t)
  const at = stamp(t.id)
  data.winners[t.id] = { winners, by, at }
  data.audit.push({
    id: uid('aud'), tournamentId: t.id, round: finalRound(t), kind: 'winners', by, at, text: data.audit.some(a => a.tournamentId === t.id && a.kind === 'winners') ? 'Winners changed' : 'Winners confirmed',
    reason: winners.filter(w => w.name).map(w => `${prizeLabel(t, prizes.find(p => p.id === w.prizeId))}: ${w.name}${w.detail ? ` (${w.detail})` : ''}`).join(' · ') || undefined,
  })
  save()
}

/** Results go out to golfers and the tournament closes; winners nobody confirmed go out as the top of each list */
export function recordPublish(t: Tournament, by: Actor) {
  if (!data.winners[t.id]) data.winners[t.id] = { winners: suggestWinners(t), by, at: stamp(t.id) }
  data.audit.push({ id: uid('aud'), tournamentId: t.id, round: finalRound(t), kind: 'publish', by, at: stamp(t.id), text: 'Results published — tournament closed' })
  save()
}

/** The players behind a results row (a player, or a team's players) */
export const membersOf = (t: Tournament, rowId?: string) => (rowId ? entriesFor(t.id).filter(e => e.id === rowId || e.teamId === rowId) : [])

/* ───────── Reports and downloads ───────── */

const CARD_LABEL: Record<CardState, string> = { 'in-progress': 'Not handed in', submitted: 'Handed in', verified: 'Verified' }
const cell = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const csv = (rows: unknown[][]) => rows.map(r => r.map(cell).join(',')).join('\n')
const divisionName = (t: Tournament, id?: string) => t.divisions?.find(d => d.id === id)?.name ?? ''
export const fileName = (t: Tournament, what: string, ext = 'csv') => `${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${what}.${ext}`

/** Final standings on one basis; byDivision gives one block per division */
export function resultsCsv(t: Tournament, basis: RankBasis, byDivision = false) {
  const rounds = roundNumbers(t)
  const team = teamSizeOf(t) > 1
  const divisions: (string | undefined)[] = byDivision && (t.divisions?.length ?? 0) > 1 ? t.divisions!.map(d => d.id) : [undefined]
  const lines: unknown[][] = [[
    'Division', 'Position', team ? 'Team' : 'Player', team ? 'Players' : 'Handicap index', ...rounds.map(n => `R${n}`), 'Total', ...(basis === 'points' ? [] : ['To par']), 'Tie-break / status',
  ]]
  for (const d of divisions) {
    for (const r of overallStandings(t, finalRound(t), { basis, divisionId: d })) {
      const played = r.byRound.some(v => v !== null)
      lines.push([
        divisionName(t, d ?? r.divisionId), r.position, r.name, team ? r.members.map(m => m.name).join('; ') : r.entry.handicapIndex, ...r.byRound,
        played ? r.total : '', ...(basis === 'points' ? [] : [played ? toPar(r.toPar) : '']), r.out ? `${ROUND_STATUS_LABEL[r.out.status]} in round ${r.out.round}` : r.tieNote ?? '',
      ])
    }
  }
  return csv(lines)
}

/** Who won what, with contact details for the prize giving */
export function winnersCsv(t: Tournament) {
  const prizes = prizesFor(t)
  return csv([
    ['Prize', 'Division', 'Value', 'Winner', 'Players', 'Score / detail', 'Email'],
    ...winnersFor(t).map(w => {
      const p = prizes.find(x => x.id === w.prizeId)
      const who = membersOf(t, w.rowId)
      return [p?.label ?? '', divisionName(t, p?.divisionId), p?.value ?? '', w.name ?? 'Not picked yet', who.map(m => m.name).join('; '), w.detail ?? '', who.map(m => m.email).filter(Boolean).join('; ')]
    }),
  ])
}

/** Every card hole by hole: a par line, then one line per player, for each round */
export function scorecardsCsv(t: Tournament) {
  const course = getCourse(t.courseId)
  if (!course) return ''
  const lines: unknown[][] = []
  for (const n of roundNumbers(t)) {
    const holes = roundHoles(t, course, n)
    lines.push(['Round', 'Player', 'Division', 'Playing handicap', ...holes.map(h => `H${h.hole}`), 'Gross', 'Net', 'Points', 'Marker', 'Card', 'Status'])
    lines.push([n, 'Par', '', '', ...holes.map(h => h.par), holes.reduce((s, h) => s + h.par, 0), '', '', '', '', ''])
    for (const r of leaderboard(t, n)) {
      lines.push([
        n, r.entry.name, divisionName(t, r.entry.divisionId), r.playing, ...cardFor(t, r.entry.id, n).map(s => s ?? ''),
        r.thru ? r.gross : '', r.thru ? r.net : '', r.thru ? r.points : '', markerOf(t.id, n, r.entry.id)?.name ?? '', CARD_LABEL[r.state], ROUND_STATUS_LABEL[r.status],
      ])
    }
    lines.push([])
  }
  return csv(lines)
}

/** The change log for the record */
export function activityCsv(t: Tournament) {
  return csv([['When', 'Who', 'Role', 'What', 'Reason / detail'], ...activityFor(t).map(a => [a.at.replace('T', ' '), a.by.name, ACTOR_LABEL[a.by.role], a.title, a.detail ?? ''])])
}

/**
 * A golfer's own score sheet, every round, as a page to print or save as PDF. Players get only their own sheet,
 * not a general download (client, 21 Oct).
 */
export function scoreSheetHtml(t: Tournament, entryId: string) {
  const course = getCourse(t.courseId)
  const me = entriesFor(t.id).find(e => e.id === entryId)
  if (!course || !me) return ''
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  const basis = basesFor(t)[0]
  const overall = overallStandings(t, finalRound(t), { basis }).find(r => r.id === (me.teamId ?? me.id))
  const partners = membersOf(t, me.teamId).filter(e => e.id !== me.id)
  const rounds = roundNumbers(t).map(n => {
    const holes = roundHoles(t, course, n)
    const row = leaderboard(t, n).find(r => r.entry.id === entryId)
    const card = cardFor(t, entryId, n)
    const signed = signOffFor(t.id, n)
    const got = (i: number) => strokesOnHole(row?.playing ?? 0, siOf(holes[i], holes.length), holes.length)
    const body = holes.map((h, i) => `<tr><td>${h.hole}</td><td>${h.par}</td><td>${siOf(h, holes.length)}</td><td class="s">${card[i] ?? ''}</td><td>${card[i] === null ? '' : card[i]! - got(i)}</td><td>${card[i] === null ? '' : stablefordPoints(card[i]!, h.par, got(i))}</td></tr>`).join('')
    const status = row && row.status !== 'playing' ? ROUND_STATUS_LABEL[row.status] : row ? CARD_LABEL[row.state] : ''
    return `<section><h2>Round ${n}</h2><p class="m">Playing handicap ${row?.playing ?? '–'} · marker ${esc(markerOf(t.id, n, entryId)?.name ?? '–')} · ${esc(status)}${signed ? ` · signed off by ${esc(signed.by.name)}` : ''}</p>
<table><thead><tr><th>Hole</th><th>Par</th><th>SI</th><th>Score</th><th>Net</th><th>Pts</th></tr></thead><tbody>${body}</tbody>
<tfoot><tr><td>Total</td><td>${holes.reduce((s, h) => s + h.par, 0)}</td><td></td><td class="s">${row?.thru ? row.gross : ''}</td><td>${row?.thru ? row.net : ''}</td><td>${row?.thru ? row.points : ''}</td></tr></tfoot></table></section>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Score sheet · ${esc(me.name)}</title><style>
body{font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#111;margin:28px}h1{font-size:20px;margin:0}h2{font-size:15px;margin:0 0 4px}
.top{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}.m{color:#555;margin:0 0 8px;font-size:12px}
.grid{display:flex;flex-wrap:wrap;gap:24px}section{flex:1;min-width:240px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:3px 6px;text-align:center}
th{background:#f3f3f3;font-size:11px}td.s{font-weight:700}tfoot td{font-weight:700;background:#f8f8f8}.r{text-align:right}.big{font-size:22px;font-weight:800}footer{margin-top:18px;color:#666;font-size:11px}
</style></head><body><div class="top"><div><h1>${esc(t.name)}</h1><p class="m">${esc(t.venue)} · ${esc(t.dateRange)} · ${esc(t.format)}</p>
<p style="margin:6px 0 0"><b>${esc(me.name)}</b> · Handicap Index ${me.handicapIndex}${divisionName(t, me.divisionId) ? ` · ${esc(divisionName(t, me.divisionId))}` : ''}${partners.length ? ` · with ${esc(partners.map(p => p.name).join(', '))}` : ''}</p></div>
<div class="r">${overall ? `<div class="big">${esc(overall.position)}</div><div class="m">${RANK_LABEL[basis]} ${overall.byRound.some(v => v !== null) ? esc(scoreText(overall, basis)) : ''}</div>` : ''}</div></div>
<div class="grid">${rounds}</div><footer>${t.resultsPublished ? 'Final results.' : 'Results are not final until the organiser publishes them.'} Printed ${esc(new Date().toLocaleString('en-US'))}.</footer></body></html>`
}

/** Saves a report straight from the browser */
export function downloadFile(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ───────── Interest in other tournaments ───────── */

/**
 * A golfer tapped "I'm interested" on another tournament we run: the organiser gets their name and
 * contact details to follow up (client, 21 Oct call). The golfer is already signed in, so nothing is typed.
 */
export interface Interest { id: string; tournamentId: string; name: string; email: string; phone: string; at: string }

export const interestsFor = (tournamentId: string) =>
  data.interests.filter(i => i.tournamentId === tournamentId).sort((a, b) => b.at.localeCompare(a.at))

export const hasShownInterest = (tournamentId: string, email: string) =>
  data.interests.some(i => i.tournamentId === tournamentId && i.email.toLowerCase() === email.toLowerCase())

export function showInterest(tournamentId: string, who: { name: string; email: string; phone: string }) {
  if (hasShownInterest(tournamentId, who.email)) return
  data.interests.push({ id: uid('int'), tournamentId, ...who, at: new Date().toISOString().slice(0, 19) })
  save()
}

/* ───────── Store ───────── */

interface OpsData {
  incidents: Incident[]
  changes: ScoreChange[]
  /** marker[tournamentId][entryId][round] = the marker's entries for that player (gaps = not entered) */
  marker: Record<string, Record<string, Record<number, (number | null)[]>>>
  interests: Interest[]
  /** Status changes, suspensions, sign-offs and staff changes */
  audit: AuditEntry[]
  /** signOffs[tournamentId][round] */
  signOffs: Record<string, Record<number, SignOff>>
  /** Marshal and official logins by email */
  logins: Record<string, StaffLogin>
  /** removed[tournamentId][email]: taken off that tournament */
  removed: Record<string, Record<string, Removal>>
  /** markers[tournamentId][round][entryId] = who the card was moved to (otherwise the group rotation) */
  markers: Record<string, Record<number, Record<string, string>>>
  /** Winners the organiser confirmed */
  winners: Record<string, WinnerList>
  /** Decisions officials sent to the organiser */
  requests: OrganiserRequest[]
}

const STORAGE_KEY = 'gtp-ops-v1'

const empty = (): OpsData => ({ incidents: [], changes: [], marker: {}, interests: [], audit: [], signOffs: {}, logins: {}, removed: {}, markers: {}, winners: {}, requests: [] })

let data: OpsData = empty()
let version = 0
const listeners = new Set<() => void>()

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* private mode: session only */ }
  version++
  listeners.forEach(l => l())
}

export function useOpsVersion() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => version)
}

/** Seeds the live tournament with a day's worth of marshal and committee work to look at. */
function seed(): OpsData {
  const fresh: OpsData = empty()
  data = fresh
  const t = MOCK_TOURNAMENTS.find(x => x.status === 'in-progress')
  if (!t) return fresh
  const round = 1
  const groups = groupsFor(t.id, round)
  if (!groups.length) return fresh
  const field = entriesFor(t.id)
  const name = (id: string) => field.find(e => e.id === id)?.name ?? 'A player'
  // Seeded entries happened shortly before the course clock
  const clock = paceFor(t, round).clock
  const at = (minutesAgo: number) => `${t.startDate}T${addMinutes(clock, -minutesAgo)}:00`
  const marshal: Actor = { name: staffOn(t, 'marshal')?.name ?? 'Marshal', role: 'marshal' }
  const setMarker = (entryId: string, card: (number | null)[]) => { ((fresh.marker[t.id] ??= {})[entryId] ??= {})[round] = card }

  // The golfer's marker wrote down one stroke more on a hole: the golfer sees it on their card
  const me = field.find(e => e.isMe)
  if (me) {
    const own = cardFor(t, me.id, round)
    const played = own.filter(s => s !== null).length
    const idx = own[1] !== null ? 1 : own.findIndex(s => s !== null)
    if (idx >= 0) { const c: (number | null)[] = []; c[idx] = (own[idx] ?? 4) + 1; setMarker(me.id, c) }
    // …and the golfer has marked their partner on every hole so far
    for (const p of markedBy(t.id, round, me.id)) setMarker(p.id, cardFor(t, p.id, round).map((s, i) => (i < played ? s : null)))
  }

  // Another pair couldn't agree and went to the committee: the furthest-along player outside the golfer's group
  const played = (id: string) => cardFor(t, id, round).filter(s => s !== null).length
  const disputed = groups
    .filter(g => !g.entryIds.some(id => id === me?.id))
    .flatMap(g => g.entryIds)
    .filter(id => played(id) >= 1 && markerOf(t.id, round, id))
    .sort((a, b) => played(b) - played(a))[0]
  if (disputed) {
    const own = cardFor(t, disputed, round)
    const hi = played(disputed) - 1
    const holeNo = (getCourse(t.courseId) ? roundHoles(t, getCourse(t.courseId)!, round)[hi]?.hole : undefined) ?? hi + 1
    const c: (number | null)[] = []
    c[hi] = (own[hi] ?? 4) + 1
    setMarker(disputed, c)
    const markerName = name(markerOf(t.id, round, disputed)?.id ?? '')
    fresh.incidents.push({
      id: 'inc-seed-dispute', tournamentId: t.id, round, kind: 'score-dispute', hole: holeNo, entryIds: [disputed],
      note: `${name(disputed)} has ${own[hi]} on hole ${holeNo}; their marker ${markerName} recorded ${c[hi]}. They couldn't agree on the course.`,
      raisedBy: { name: markerName, role: 'golfer' }, at: at(9), status: 'committee',
      updates: [{ at: at(6), by: marshal, text: 'Spoke to both players. The ball moved while addressing it in the bunker; they disagree whether it counts. Sent to the committee.' }],
    })
  }

  const g = (i: number) => groups[Math.min(i, groups.length - 1)]
  fresh.incidents.push(
    {
      id: 'inc-seed-slow', tournamentId: t.id, round, kind: 'slow-play', hole: 1, entryIds: g(2).entryIds,
      note: 'Group a full hole behind the group ahead after a lost-ball search on the 1st.',
      raisedBy: marshal, at: at(52), status: 'resolved', updates: [],
      decision: 'Warned the group and timed them on the next hole; back in position.', decidedBy: marshal, decidedAt: at(40),
    },
    {
      id: 'inc-seed-cart', tournamentId: t.id, round, kind: 'cart', hole: 3, entryIds: g(0).entryIds.slice(0, 2),
      note: 'Cart 16 driven onto the apron of the 3rd green.',
      raisedBy: marshal, at: at(12), status: 'open', updates: [],
    },
    {
      id: 'inc-seed-rules', tournamentId: t.id, round, kind: 'rules', hole: 2, entryIds: g(1).entryIds.slice(0, 1),
      note: 'Ball in the red-staked area left of the 2nd fairway. Player asked about relief.',
      raisedBy: marshal, at: at(30), status: 'resolved', updates: [],
      decision: 'Explained penalty-area relief: one stroke, drop within two club-lengths. Player took it.', decidedBy: marshal, decidedAt: at(28),
    },
    {
      // A player used "Ask for a ruling" from their scorecard: the marshal goes first, the official sees it too
      id: 'inc-seed-ask', tournamentId: t.id, round, kind: 'rules', hole: 4, entryIds: g(3).entryIds.slice(0, 1),
      note: 'Ball came to rest against the cart-path edge right of the 4th green. Do I get free relief?',
      raisedBy: { name: name(g(3).entryIds[0]), role: 'golfer' }, at: at(4), status: 'open', updates: [],
    },
  )
  return fresh
}

export function resetOpsData() {
  data = seed()
  save()
}

/* ───────── Load (last, so every helper above is initialised) ───────── */

;(function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) { data = { ...empty(), ...JSON.parse(raw) }; return }
  } catch { /* fall through to seed */ }
  data = seed()
})()

// Another tab of the app changed the data (e.g. the organiser removed an official): pick it up so that
// tab's consoles react, as a real backend would push it
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try { data = { ...empty(), ...JSON.parse(e.newValue) } } catch { return }
    version++
    listeners.forEach(l => l())
  })
}
