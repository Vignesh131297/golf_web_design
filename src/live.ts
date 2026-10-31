import { useSyncExternalStore } from 'react'
import type { Course, HoleData, Point, Tournament } from './types'
import { MOCK_PROFILE, MOCK_TOURNAMENTS, getCourse } from './data'
import { ratingsGenderOf } from './account-rules'
import { playingHandicap, stablefordPoints, strokesOnHole, teeTimeFor, uid } from './golf'
import { upsertTournament } from './store'

/*
 * Tournament-day data for the prototype: entries (the field), tee groups, hole-by-hole
 * scorecards and marked shots. Saved to localStorage like the admin store. A real backend
 * would own all of this and push changes over WebSocket/SSE; here `simulateTick` moves the
 * rest of the field along so the leaderboard feels live.
 */

export interface Entry {
  id: string
  tournamentId: string
  name: string
  handicapIndex: number
  gender: 'men' | 'women'
  divisionId: string
  /** 'waitlist' is only in older saved data: the client chose no waiting lists (organisers manage the field) */
  status: 'registered' | 'waitlist' | 'withdrawn'
  /** The signed-in golfer */
  isMe?: boolean
  /** Organiser moved this player to other tees; otherwise the division's tees. Fixed once they tee off. */
  teeSetId?: string
  email?: string
  /** Who entered the golfer: the golfer online, or the organiser on their behalf */
  registeredBy?: 'self' | 'organiser'
  paymentStatus?: PaymentStatus
  /** Four-Ball pair or scramble team: partners share it */
  teamId?: string
}

/**
 * Verified ticks next to a player's name: photo ID checked, and Handicap Index confirmed with the
 * handicap body. The signed-in golfer's come from their profile; other players' are fixed per player
 * in the prototype (a real backend returns them with the registrant list).
 */
export function ticksFor(e: Pick<Entry, 'id' | 'isMe'>): { id: boolean; handicap: boolean } {
  if (e.isMe) return { id: MOCK_PROFILE.idCheck?.status === 'verified', handicap: !!MOCK_PROFILE.handicapVerified }
  const h = [...e.id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7)
  return { id: h % 5 < 2, handicap: h % 10 < 7 }
}

/** paid = online by card · pay-at-course = collected on the day · waived = no charge · link-sent = organiser emailed a payment link · free = no fee */
export type PaymentStatus = 'paid' | 'pay-at-course' | 'waived' | 'link-sent' | 'free'

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  paid: 'Paid online', 'pay-at-course': 'Pay at course', waived: 'Fee waived', 'link-sent': 'Payment link sent', free: 'Free entry',
}

export interface TeeGroup {
  id: string
  tournamentId: string
  round: number
  time: string
  startHole: number
  entryIds: string[]
}

export interface Shot {
  at: Point
  club?: string
  ts: number
}

export type CardState = 'in-progress' | 'submitted' | 'verified'

interface LiveData {
  entries: Entry[]
  groups: TeeGroup[]
  /** scores[tournamentId][entryId][round] = strokes per hole index (null = not played) */
  scores: Record<string, Record<string, Record<number, (number | null)[]>>>
  cardState: Record<string, Record<string, Record<number, CardState>>>
  /** shots[tournamentId][entryId][round][holeNumber] */
  shots: Record<string, Record<string, Record<number, Record<number, Shot[]>>>>
  /** roundStatus[tournamentId][entryId][round], set by an official; missing = still playing */
  roundStatus?: Record<string, Record<string, Record<number, RoundStatus>>>
  /** suspended[tournamentId]: play stopped by an official */
  suspended?: Record<string, Suspension>
}

// v2: entries carry registeredBy / paymentStatus; groups seeded for pace of play
const STORAGE_KEY = 'gtp-live-v4'

const FIRST = ['James', 'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Lucas', 'Mia', 'Mason', 'Isla', 'Logan', 'Grace', 'Owen', 'Chloe', 'Caleb', 'Zoe', 'Ryan', 'Nora', 'Henry', 'Ella', 'Jack', 'Lily']
const LAST = ['Carter', 'Nguyen', 'Patel', 'Walsh', 'Brennan', 'Okafor', 'Lindqvist', 'Moreno', 'Fraser', 'Kim', 'Duarte', 'Shaw', 'Hughes', 'Rossi', 'Tanaka', 'Murphy', 'Becker', 'Lopez', 'Reid', 'Silva', 'Ahmed', 'Grant', 'Cole', 'Price']

/** Deterministic pseudo-random 0..1 from a string, so seeded scores don't change on reload. */
function rand(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10_000) / 10_000
}

/** A believable score for a hole from par, stroke index and handicap. */
function simulatedScore(seed: string, hole: HoleData, handicapIndex: number) {
  const r = rand(seed)
  const extra = handicapIndex / 18 + (19 - hole.handicap) / 40
  const delta = r < 0.08 ? -1 : r < 0.5 ? 0 : r < 0.8 ? 1 : r < 0.95 ? 2 : 3
  return Math.max(2, hole.par + Math.round(delta * (0.6 + extra / 2)))
}

let data: LiveData = { entries: [], groups: [], scores: {}, cardState: {}, shots: {} }
let version = 0
const listeners = new Set<() => void>()

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* private mode: session only */ }
  version++
  listeners.forEach(l => l())
}

export function useLiveVersion() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => version)
}

/* ───────── Seed ───────── */

function seedField(t: Tournament, count: number, includeMe: boolean) {
  const division = (index: number) => {
    const divisions = t.divisions ?? []
    return divisions.find(d => index >= d.minHandicap && index <= d.maxHandicap)?.id ?? divisions[0]?.id ?? 'div-open'
  }
  const entries: Entry[] = []
  for (let i = 0; i < count; i++) {
    const index = Math.round((rand(`${t.id}-hcp-${i}`) * 26 + 0.4) * 10) / 10
    entries.push({
      id: `${t.id}-e${i}`,
      tournamentId: t.id,
      name: `${FIRST[(i * 7 + t.id.length) % FIRST.length]} ${LAST[(i * 5 + 3) % LAST.length]}`,
      handicapIndex: index,
      gender: i % 4 === 3 ? 'women' : 'men',
      divisionId: division(index),
      status: 'registered',
      email: `${FIRST[(i * 7 + t.id.length) % FIRST.length]}.${LAST[(i * 5 + 3) % LAST.length]}${i}@example.com`.toLowerCase(),
      registeredBy: i % 5 === 4 ? 'organiser' : 'self',
      paymentStatus: i % 5 === 4 ? 'pay-at-course' : 'paid',
    })
  }
  if (includeMe) {
    entries.splice(2, 0, {
      id: `${t.id}-me`,
      tournamentId: t.id,
      name: `${MOCK_PROFILE.firstName} ${MOCK_PROFILE.lastName}`,
      handicapIndex: MOCK_PROFILE.handicapIndex,
      gender: ratingsGenderOf(MOCK_PROFILE),
      divisionId: division(MOCK_PROFILE.handicapIndex),
      status: 'registered',
      isMe: true,
      email: MOCK_PROFILE.email,
      registeredBy: 'self',
      paymentStatus: 'paid',
    })
  }
  // Four-Ball pairs and scramble teams: partners sit next to each other in the field
  const size = teamSizeOf(t)
  if (size > 1) entries.forEach((e, i) => { e.teamId = `${t.id}-team${Math.floor(i / size) + 1}` })
  return entries
}

/** Players per team: 2 for Four-Ball, the tournament's team size for a scramble (4 by default), 1 otherwise */
export const teamSizeOf = (t: Tournament) =>
  t.format === 'Four-Ball' || t.format === 'Scramble' ? t.team?.size ?? (t.format === 'Scramble' ? 4 : 2) : 1

function seed(): LiveData {
  const fresh: LiveData = { entries: [], groups: [], scores: {}, cardState: {}, shots: {} }
  data = fresh
  for (const t of MOCK_TOURNAMENTS) {
    if (!t.players || t.status === 'draft') continue
    const live = t.status === 'in-progress' || t.status === 'completed'
    const fieldSize = Math.min(t.players, live ? 16 : 24)
    const includeMe = t.registrationStatus === 'registered' || t.status === 'in-progress'
    fresh.entries.push(...seedField(t, fieldSize - (includeMe ? 1 : 0), includeMe))
    if (live) {
      for (const r of t.rounds ?? [{ number: 1 }]) generateTeeSheet(t, r.number, false)
      const course = getCourse(t.courseId)
      if (!course) continue
      const holes = roundHoles(t, course, 1)
      // Live: each group is about a hole behind the one ahead and the golfer is on hole 5. The group after
      // theirs is slow (an empty hole in front of them) and holds up everyone behind, so the marshal has work to do
      const groups = groupsFor(t.id, 1)
      const meGroup = Math.max(0, groups.findIndex(g => g.entryIds.some(id => id.endsWith('-me'))))
      const slowGroup = meGroup + 1 < groups.length ? meGroup + 1 : -1
      const groupThru = (gi: number) => Math.max(0, 4 + meGroup - gi - (slowGroup >= 0 && gi >= slowGroup ? 2 : 0))
      for (const e of entriesFor(t.id)) {
        // Completed events are fully scored; live ones are part-way round
        const gi = groups.findIndex(g => g.entryIds.includes(e.id))
        const played = t.status === 'completed' ? holes.length : e.isMe ? 4 : Math.max(0, groupThru(gi) - (rand(`${e.id}-thru`) < 0.25 ? 1 : 0))
        const card = holes.map((h, i) => (i < played ? simulatedScore(`${e.id}-${h.hole}`, h, e.handicapIndex) : null))
        ;((fresh.scores[t.id] ??= {})[e.id] ??= {})[1] = card
        if (t.status === 'completed') ((fresh.cardState[t.id] ??= {})[e.id] ??= {})[1] = 'verified'
      }
      // A finished event is fully scored: every round of every card, all verified
      if (t.status === 'completed') {
        for (const r of (t.rounds ?? []).slice(1)) {
          const later = roundHoles(t, course, r.number)
          for (const e of entriesFor(t.id)) {
            ;((fresh.scores[t.id] ??= {})[e.id] ??= {})[r.number] = later.map(h => simulatedScore(`${e.id}-r${r.number}-${h.hole}`, h, e.handicapIndex))
            ;((fresh.cardState[t.id] ??= {})[e.id] ??= {})[r.number] = 'verified'
          }
        }
      }
    }
  }
  return fresh
}


export function resetLiveData() {
  data = seed()
  save()
}

/* ───────── Field and registration ───────── */

export const entriesFor = (tournamentId: string) => data.entries.filter(e => e.tournamentId === tournamentId && e.status !== 'withdrawn')

export const myEntry = (tournamentId: string) => entriesFor(tournamentId).find(e => e.isMe)

/** The tournament's player count covers the whole field; the seeded entries are only a sample of it. */
function adjustPlayers(tournamentId: string, delta: number) {
  const t = MOCK_TOURNAMENTS.find(x => x.id === tournamentId)
  if (t) upsertTournament({ ...t, players: Math.max(0, t.players + delta) })
}

export function registerMe(t: Tournament, divisionId: string, waitlist = false, paymentStatus: PaymentStatus = 'paid') {
  const existing = data.entries.find(e => e.tournamentId === t.id && e.isMe)
  const wasRegistered = existing?.status === 'registered'
  if (existing) Object.assign(existing, { status: waitlist ? 'waitlist' : 'registered', divisionId, registeredBy: 'self', paymentStatus })
  else {
    data.entries.push({
      id: `${t.id}-me`,
      tournamentId: t.id,
      name: `${MOCK_PROFILE.firstName} ${MOCK_PROFILE.lastName}`,
      handicapIndex: MOCK_PROFILE.handicapIndex,
      gender: ratingsGenderOf(MOCK_PROFILE),
      divisionId,
      status: waitlist ? 'waitlist' : 'registered',
      isMe: true,
      email: MOCK_PROFILE.email,
      registeredBy: 'self',
      paymentStatus,
    })
  }
  save()
  if (!waitlist && !wasRegistered) adjustPlayers(t.id, 1)
}

export function withdrawMe(tournamentId: string) {
  const me = data.entries.find(e => e.tournamentId === tournamentId && e.isMe)
  const wasRegistered = me?.status === 'registered'
  if (me) me.status = 'withdrawn'
  save()
  if (wasRegistered) adjustPlayers(tournamentId, -1)
}

export interface NewEntryInput {
  firstName: string
  lastName: string
  email: string
  handicapIndex: number
  gender: 'men' | 'women'
  divisionId: string
  teeSetId?: string
  paymentStatus: PaymentStatus
}

/**
 * The organiser registers a golfer on their behalf (client, 17 Oct). Same rules as golfers registering
 * themselves: no waiting list, so a full field refuses; one entry per golfer.
 */
export function addEntry(t: Tournament, input: NewEntryInput): { ok: true; entry: Entry } | { ok: false; error: string; field?: 'email' | 'capacity' } {
  const field = entriesFor(t.id).filter(e => e.status === 'registered')
  if (Math.max(t.players, field.length) >= t.maxPlayers) return { ok: false, field: 'capacity', error: 'The field is full — there is no waiting list.' }
  const email = input.email.trim().toLowerCase()
  if (field.some(e => e.email?.toLowerCase() === email)) return { ok: false, field: 'email', error: 'This golfer is already registered.' }
  const entry: Entry = {
    id: `${t.id}-o${Date.now().toString(36)}`,
    tournamentId: t.id,
    name: `${input.firstName.trim()} ${input.lastName.trim()}`,
    handicapIndex: input.handicapIndex,
    gender: input.gender,
    divisionId: input.divisionId,
    teeSetId: input.teeSetId,
    status: 'registered',
    email,
    registeredBy: 'organiser',
    paymentStatus: input.paymentStatus,
  }
  data.entries.push(entry)
  save()
  adjustPlayers(t.id, 1)
  return { ok: true, entry }
}

/** Who's playing: the registered field, by surname. Shown only to golfers registered for the tournament. */
export const registrantsFor = (tournamentId: string) =>
  entriesFor(tournamentId)
    .filter(e => e.status === 'registered')
    .sort((a, b) => (a.name.split(' ').slice(-1)[0] ?? '').localeCompare(b.name.split(' ').slice(-1)[0] ?? '') || a.name.localeCompare(b.name))

/** Organiser edits to a player in the field: replace (name, handicap), change tees or division, remove. */
export function updateEntry(entryId: string, patch: Partial<Pick<Entry, 'name' | 'handicapIndex' | 'gender' | 'divisionId' | 'teeSetId' | 'status'>>) {
  const e = data.entries.find(x => x.id === entryId)
  if (!e) return
  const wasRegistered = e.status === 'registered'
  Object.assign(e, patch)
  if (patch.status === 'withdrawn') data.groups.forEach(g => { g.entryIds = g.entryIds.filter(id => id !== entryId) })
  save()
  if (wasRegistered && patch.status === 'withdrawn') adjustPlayers(e.tournamentId, -1)
}

/** Moves a player into another tee group for the round (organisers rearrange groups by hand). */
export function moveToGroup(tournamentId: string, round: number, entryId: string, groupId: string) {
  for (const g of groupsFor(tournamentId, round)) {
    g.entryIds = g.entryIds.filter(id => id !== entryId)
    if (g.id === groupId) g.entryIds.push(entryId)
  }
  save()
}

/** The tees a player plays from: an organiser's override, else their division's */
export const teeSetIdFor = (t: Tournament, entry: Entry) =>
  entry.teeSetId ?? t.divisions?.find(d => d.id === entry.divisionId)?.teeSetId

/* ───────── Rounds, tee sheet ───────── */

export function roundHoles(t: Tournament, course: Course, round: number): HoleData[] {
  const which = t.rounds?.find(r => r.number === round)?.holes ?? 'all'
  if (which === 'front') return course.holeData.slice(0, 9)
  if (which === 'back') return course.holeData.slice(9, 18)
  return course.holeData
}

export const groupsFor = (tournamentId: string, round: number) =>
  data.groups.filter(g => g.tournamentId === tournamentId && g.round === round)

/** Builds groups from the registered field (similar handicaps together) and assigns tee times. */
export function generateTeeSheet(t: Tournament, round: number, persist = true) {
  const course = getCourse(t.courseId)
  const sheet = t.teeSheet
  if (!course || !sheet) return
  // Similar handicaps together; partners in Four-Ball and scramble always share a group
  const players = entriesFor(t.id).filter(e => e.status === 'registered')
    .sort((a, b) => (a.teamId ?? '').localeCompare(b.teamId ?? '', undefined, { numeric: true }) || a.handicapIndex - b.handicapIndex)
  data.groups = data.groups.filter(g => !(g.tournamentId === t.id && g.round === round))
  for (let i = 0; i * sheet.groupSize < players.length; i++) {
    const { time, startHole } = teeTimeFor(sheet, i, roundHoles(t, course, round).length)
    data.groups.push({
      id: uid('g'),
      tournamentId: t.id,
      round,
      time,
      startHole,
      entryIds: players.slice(i * sheet.groupSize, (i + 1) * sheet.groupSize).map(e => e.id),
    })
  }
  if (persist) save()
}

export const groupOf = (tournamentId: string, round: number, entryId: string) =>
  groupsFor(tournamentId, round).find(g => g.entryIds.includes(entryId))

/**
 * The group playing right behind this player's group: the next tee time from the same starting hole,
 * or in a shotgun start the group that began on the hole before ours.
 */
export function groupBehind(tournamentId: string, round: number, entryId: string) {
  const all = groupsFor(tournamentId, round)
  const mine = all.find(g => g.entryIds.includes(entryId))
  if (!mine) return undefined
  const next = all.filter(g => g.startHole === mine.startHole && g.time > mine.time).sort((a, b) => a.time.localeCompare(b.time))[0]
  if (next) return next
  const last = Math.max(...all.map(g => g.startHole))
  return all.find(g => g !== mine && g.time === mine.time && g.startHole === (mine.startHole === 1 ? last : mine.startHole - 1))
}

/* ───────── Scorecards ───────── */

export function cardFor(t: Tournament, entryId: string, round: number): (number | null)[] {
  const course = getCourse(t.courseId)
  const length = course ? roundHoles(t, course, round).length : 18
  const card = data.scores[t.id]?.[entryId]?.[round] ?? []
  return Array.from({ length }, (_, i) => card[i] ?? null)
}

export const cardState = (tournamentId: string, entryId: string, round: number): CardState =>
  data.cardState[tournamentId]?.[entryId]?.[round] ?? 'in-progress'

export function setStrokes(t: Tournament, entryId: string, round: number, holeIndex: number, strokes: number | null) {
  const card = cardFor(t, entryId, round)
  card[holeIndex] = strokes
  ;((data.scores[t.id] ??= {})[entryId] ??= {})[round] = card
  save()
}

export function setCardState(tournamentId: string, entryId: string, round: number, state: CardState) {
  ;((data.cardState[tournamentId] ??= {})[entryId] ??= {})[round] = state
  save()
}

/* ───────── Player status and play suspension (set by tournament officials; audit trail in ops.ts) ───────── */

/**
 * Exceptions an official records per player and round (client answers, Sept 21): withdrew, didn't show,
 * didn't finish, disqualified. Holes already played stay on the card; the player drops out of the
 * results but is never deleted.
 */
export type RoundStatus = 'playing' | 'wd' | 'no-show' | 'dnf' | 'dq'

export const ROUND_STATUS_LABEL: Record<RoundStatus, string> = {
  playing: 'Playing', wd: 'Withdrew', 'no-show': 'No show', dnf: 'Did not finish', dq: 'Disqualified',
}
/** Short code for the position column */
export const ROUND_STATUS_CODE: Record<RoundStatus, string> = { playing: '', wd: 'WD', 'no-show': 'NS', dnf: 'DNF', dq: 'DQ' }

export const roundStatus = (tournamentId: string, entryId: string, round: number): RoundStatus =>
  data.roundStatus?.[tournamentId]?.[entryId]?.[round] ?? 'playing'

export function setRoundStatus(tournamentId: string, entryId: string, round: number, status: RoundStatus) {
  ;(((data.roundStatus ??= {})[tournamentId] ??= {})[entryId] ??= {})[round] = status
  save()
}

/** Play stopped by an official (lightning, heavy rain, darkness). Scoring screens show it until play resumes. */
export interface Suspension { reason: string; note?: string; by: string; at: string }

export const suspensionFor = (tournamentId: string): Suspension | undefined => data.suspended?.[tournamentId]

export function setSuspension(tournamentId: string, s: Suspension | undefined) {
  data.suspended ??= {}
  if (s) data.suspended[tournamentId] = s
  else delete data.suspended[tournamentId]
  save()
}

/** Demo only: plays out the round for everyone still playing and hands in their cards, so results can be signed off. */
export function finishRoundForDemo(t: Tournament, round = 1) {
  const course = getCourse(t.courseId)
  if (!course || t.status !== 'in-progress') return
  const holes = roundHoles(t, course, round)
  for (const e of entriesFor(t.id)) {
    if (e.status !== 'registered' || roundStatus(t.id, e.id, round) !== 'playing') continue
    const card = cardFor(t, e.id, round).map((s, i) => s ?? simulatedScore(`${e.id}-${holes[i].hole}-live${round > 1 ? `-r${round}` : ''}`, holes[i], e.handicapIndex))
    ;((data.scores[t.id] ??= {})[e.id] ??= {})[round] = card
    if (cardState(t.id, e.id, round) === 'in-progress') ((data.cardState[t.id] ??= {})[e.id] ??= {})[round] = 'submitted'
  }
  save()
}

/** Plays the next hole for everyone still on the course except the signed-in golfer. */
export function simulateTick(t: Tournament, round = 1) {
  const course = getCourse(t.courseId)
  if (!course || t.status !== 'in-progress' || suspensionFor(t.id)) return
  const holes = roundHoles(t, course, round)
  let changed = false
  for (const e of entriesFor(t.id)) {
    if (e.isMe || cardState(t.id, e.id, round) !== 'in-progress' || roundStatus(t.id, e.id, round) !== 'playing') continue
    const card = cardFor(t, e.id, round)
    const next = card.findIndex(s => s === null)
    if (next < 0 || rand(`${e.id}-${next}-${Date.now() >> 14}`) < 0.35) continue
    card[next] = simulatedScore(`${e.id}-${holes[next].hole}-live`, holes[next], e.handicapIndex)
    ;((data.scores[t.id] ??= {})[e.id] ??= {})[round] = card
    changed = true
  }
  if (changed) save()
}

/* ───────── Shots (ball positions) ───────── */

export const shotsFor = (tournamentId: string, entryId: string, round: number, hole: number): Shot[] =>
  data.shots[tournamentId]?.[entryId]?.[round]?.[hole] ?? []

export function addShot(tournamentId: string, entryId: string, round: number, hole: number, shot: Shot) {
  const list = (((data.shots[tournamentId] ??= {})[entryId] ??= {})[round] ??= {})[hole] ??= []
  list.push(shot)
  save()
}

export function undoShot(tournamentId: string, entryId: string, round: number, hole: number) {
  data.shots[tournamentId]?.[entryId]?.[round]?.[hole]?.pop()
  save()
}

/* ───────── Leaderboard ───────── */

export interface LeaderboardRow {
  entry: Entry
  position: string
  thru: number
  holes: number
  gross: number
  grossToPar: number
  net: number
  netToPar: number
  points: number
  playing: number
  state: CardState
  /** Anything but 'playing' leaves the player out of the results */
  status: RoundStatus
}

export function leaderboard(t: Tournament, round = 1, divisionId?: string): LeaderboardRow[] {
  const course = getCourse(t.courseId)
  if (!course) return []
  const holes = roundHoles(t, course, round)
  const allowance = t.scoring?.allowancePct ?? 100
  const coursePar = course.holeData.reduce((s, h) => s + h.par, 0)

  const rows = entriesFor(t.id)
    .filter(e => e.status === 'registered' && (!divisionId || e.divisionId === divisionId))
    .map(entry => {
      const tee = course.teeSets?.find(ts => ts.id === teeSetIdFor(t, entry))
      const fullPlaying = playingHandicap(entry.handicapIndex, tee, coursePar, allowance, entry.gender)
      // Nine-hole rounds get half the strokes
      const playing = holes.length === 9 ? Math.round(fullPlaying / 2) : fullPlaying
      const card = cardFor(t, entry.id, round)
      let gross = 0, par = 0, received = 0, points = 0, thru = 0
      card.forEach((strokes, i) => {
        if (strokes === null) return
        const hole = holes[i]
        const r = strokesOnHole(playing, holes.length === 9 ? Math.ceil(hole.handicap / 2) : hole.handicap, holes.length)
        gross += strokes; par += hole.par; received += r; thru++
        points += stablefordPoints(strokes, hole.par, r)
      })
      return {
        entry, position: '', thru, holes: holes.length, gross, grossToPar: gross - par,
        net: gross - received, netToPar: gross - received - par, points, playing,
        state: cardState(t.id, entry.id, round),
        status: roundStatus(t.id, entry.id, round),
      }
    })

  const stableford = t.format === 'Stableford'
  const useNet = !stableford && t.scoring?.basis === 'net'
  const key = (r: LeaderboardRow) => (stableford ? -r.points : useNet ? r.netToPar : r.grossToPar)
  const out = (r: LeaderboardRow) => (r.status !== 'playing' ? 1 : 0)
  rows.sort((a, b) => out(a) - out(b) || (a.thru === 0 ? 1 : 0) - (b.thru === 0 ? 1 : 0) || key(a) - key(b) || b.thru - a.thru)

  const ranked = rows.filter(r => !out(r) && r.thru > 0)
  rows.forEach(row => {
    if (out(row)) { row.position = ROUND_STATUS_CODE[row.status]; return }
    if (row.thru === 0) { row.position = '–'; return }
    const same = ranked.filter(r => key(r) === key(row)).length
    const first = ranked.findIndex(r => key(r) === key(row))
    row.position = `${same > 1 ? 'T' : ''}${first + 1}`
  })
  return rows
}

/* ───────── Load (last, so every helper above is initialised) ───────── */

;(function load() {
  try {
    localStorage.removeItem('gtp-live-v1') // before role-based screens
    localStorage.removeItem('gtp-live-v2') // before Four-Ball and scramble teams
    localStorage.removeItem('gtp-live-v3') // before tee sheets for later rounds
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) { data = JSON.parse(raw); return }
  } catch { /* fall through to seed */ }
  data = seed()
})()

// Another tab changed scores, statuses or suspended play: show it here too, as a real backend would push it
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try { data = JSON.parse(e.newValue) } catch { return }
    version++
    listeners.forEach(l => l())
  })
}
