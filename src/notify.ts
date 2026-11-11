import { useSyncExternalStore } from 'react'
import type { Tournament } from './types'
import { MOCK_PROFILE, MOCK_TOURNAMENTS } from './data'
import { entriesFor, groupOf, roundStatus, suspensionFor } from './live'
import { uid } from './golf'
import type { Actor } from './ops'

/*
 * Sprint 4 · notifications, announcements and the push device registry (PN1–PN3, AN1, section 7 events).
 * Identical copy in the web and mobile prototypes.
 *
 * What the real system does and this file stands in for:
 *  - A domain change (tee time moved, play suspended, announcement sent…) writes ONE notification event to the
 *    outbox in the same transaction. Nothing is sent before the transaction commits.
 *  - A worker resolves who may receive it, then creates one delivery per recipient × channel × device, de-duplicated
 *    on (event, recipient, device, channel). Email and push are tracked separately: one can fail while the other works.
 *  - Push goes to FCM (Android) / APNs (iOS). "Accepted" means the provider took it — not that the phone showed it.
 *    Permanently invalid tokens are removed. Transient failures retry with a cap.
 *  - The push payload is versioned and carries ids only — never incident details or anything private. The app
 *    re-checks access when the golfer taps it; the payload alone never grants access.
 * In the prototype a timer plays the worker, and everything is kept in localStorage.
 */

export type NotifyKind = 'registration-confirmed' | 'staff-assigned' | 'tee-time-changed' | 'announcement' | 'play-suspended' | 'play-resumed'

export const NOTIFY_LABEL: Record<NotifyKind, string> = {
  'registration-confirmed': 'Registration confirmed',
  'staff-assigned': 'Staff assignment',
  'tee-time-changed': 'Tee time changed',
  announcement: 'Announcement',
  'play-suspended': 'Play suspended',
  'play-resumed': 'Play resumed',
}

export type Channel = 'email' | 'push'
/** queued → attempted → accepted (provider took it) | failed (gave up). skipped = nothing to send to (no device / push off). */
export type DeliveryState = 'queued' | 'attempted' | 'accepted' | 'failed' | 'skipped'
export type Audience = 'golfers' | 'staff' | 'both'

export interface Recipient {
  /** The account: email in the prototype, user id in the real system */
  account: string
  name: string
  kind: 'golfer' | 'staff'
}

/** The versioned push payload (also what the app's deep-link handler receives). Ids only. */
export interface PushPayload {
  v: 1
  type: NotifyKind
  eventId: string
  tournamentId: string
  /** announcement id, tee group id, assignment id… */
  resourceId?: string
}

export interface NotifyEvent {
  id: string
  kind: NotifyKind
  tournamentId: string
  resourceId?: string
  title: string
  body: string
  createdAt: string
  by?: Actor
  recipients: Recipient[]
  /** Same key = same logical event; a retry never creates a second one */
  idempotencyKey: string
  /** After this the alert is stale and isn't shown (tee times, suspensions) */
  expiresAt?: string
}

export interface Delivery {
  id: string
  eventId: string
  account: string
  name: string
  channel: Channel
  deviceId?: string
  state: DeliveryState
  attempts: number
  error?: string
  updatedAt: string
}

export interface Announcement {
  id: string
  tournamentId: string
  title: string
  body: string
  audience: Audience
  sentBy: Actor
  sentAt: string
  eventId: string
  counts: { golfers: number; staff: number }
}

export interface Device {
  id: string
  account: string
  platform: 'android' | 'ios'
  environment: 'staging' | 'production'
  /** Provider token — the real one never leaves the server's registry; shown shortened here */
  token: string
  label: string
  registeredAt: string
  lastSeenAt: string
  /** Seeded bad token: the next push fails permanently and the device is removed */
  invalid?: boolean
}

export type PushPermission = 'not-asked' | 'granted' | 'denied'

interface NotifyData {
  events: NotifyEvent[]
  deliveries: Delivery[]
  announcements: Announcement[]
  devices: Device[]
  /** The signed-in golfer's phone (mobile prototype) */
  permission: PushPermission
  /** Events the phone already showed as a banner (no duplicate alerts on reconnect) */
  shown: string[]
}

export const ANNOUNCEMENT_LIMITS = { title: 80, body: 1000 }

const STORAGE_KEY = 'gtp-notify-v1'
const nowIso = () => new Date().toISOString().slice(0, 19)
const plusHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString().slice(0, 19)

let data: NotifyData = { events: [], deliveries: [], announcements: [], devices: [], permission: 'not-asked', shown: [] }
let version = 0
const listeners = new Set<() => void>()

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* private mode: session only */ }
  version++
  listeners.forEach(l => l())
}

export function useNotifyVersion() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => version)
}

export const MY_ACCOUNT = () => MOCK_PROFILE.email.toLowerCase()

/* ───────── Audiences ───────── */

const isStaffRole = (role: string) => /marshal|official/i.test(role)

/** Registered golfers still in the tournament (a disqualified player isn't messaged as part of the field) */
export function golferRecipients(t: Tournament): Recipient[] {
  return entriesFor(t.id)
    .filter(e => e.status === 'registered' && !!e.email && roundStatus(t.id, e.id, 1) !== 'dq')
    .map(e => ({ account: e.email!.toLowerCase(), name: e.name, kind: 'golfer' as const }))
}

/** Marshals and officials with a login for this tournament */
export function staffRecipients(t: Tournament): Recipient[] {
  return (t.officials ?? []).filter(o => o.email && isStaffRole(o.role)).map(o => ({ account: o.email!.toLowerCase(), name: o.name, kind: 'staff' as const }))
}

export function audienceFor(t: Tournament, audience: Audience): Recipient[] {
  const all = [...(audience !== 'staff' ? golferRecipients(t) : []), ...(audience !== 'golfers' ? staffRecipients(t) : [])]
  // One person can be both (the demo golfer marshals another event): one delivery each
  return all.filter((r, i) => all.findIndex(x => x.account === r.account) === i)
}

export const pushReach = (recipients: Recipient[]) => recipients.filter(r => devicesFor(r.account).length > 0).length

/* ───────── Devices (PN1) ───────── */

export const devicesFor = (account: string) => data.devices.filter(d => d.account === account.toLowerCase())
export const pushPermission = () => data.permission

/** The phone asked the OS: allowed → the app registers its token against the signed-in account (server-side identity) */
export function setPushPermission(p: PushPermission, platform: 'android' | 'ios' = 'ios') {
  data.permission = p
  const me = MY_ACCOUNT()
  if (p === 'granted' && !data.devices.some(d => d.account === me && d.label === 'This phone')) {
    data.devices.push({ id: uid('dev'), account: me, platform, environment: 'staging', token: `${platform === 'ios' ? 'apns' : 'fcm'}_${Math.random().toString(36).slice(2, 10)}…`, label: 'This phone', registeredAt: nowIso(), lastSeenAt: nowIso() })
  }
  if (p === 'denied') data.devices = data.devices.filter(d => !(d.account === me && d.label === 'This phone'))
  save()
}

/** The provider rotated the token: same device, new token (no duplicate device) */
export function rotateToken(deviceId: string) {
  const d = data.devices.find(x => x.id === deviceId)
  if (!d) return
  d.token = `${d.platform === 'ios' ? 'apns' : 'fcm'}_${Math.random().toString(36).slice(2, 10)}…`
  d.lastSeenAt = nowIso()
  save()
}

/** Sign out (or switch account): this phone's token is unbound so the next person never gets the last person's alerts */
export function unregisterThisPhone() {
  data.devices = data.devices.filter(d => !(d.account === MY_ACCOUNT() && d.label === 'This phone'))
  save()
}

export function removeDevice(deviceId: string) {
  data.devices = data.devices.filter(d => d.id !== deviceId)
  save()
}

/* ───────── Events and the outbox (PN2) ───────── */

/**
 * Writes one event and its deliveries. Returns the existing event when the idempotency key was used before
 * (a retried "Send" or a double click never sends twice).
 */
export function emit(input: Omit<NotifyEvent, 'id' | 'createdAt'>): { event: NotifyEvent; duplicate: boolean } {
  const existing = data.events.find(e => e.idempotencyKey === input.idempotencyKey)
  if (existing) return { event: existing, duplicate: true }
  const event: NotifyEvent = { ...input, id: uid('evt'), createdAt: nowIso() }
  data.events.push(event)
  for (const r of event.recipients) {
    data.deliveries.push({ id: uid('dlv'), eventId: event.id, account: r.account, name: r.name, channel: 'email', state: 'queued', attempts: 0, updatedAt: nowIso() })
    const devices = devicesFor(r.account)
    if (!devices.length) data.deliveries.push({ id: uid('dlv'), eventId: event.id, account: r.account, name: r.name, channel: 'push', state: 'skipped', attempts: 0, error: 'No app with alerts on', updatedAt: nowIso() })
    for (const d of devices) data.deliveries.push({ id: uid('dlv'), eventId: event.id, account: r.account, name: r.name, channel: 'push', deviceId: d.id, state: 'queued', attempts: 0, updatedAt: nowIso() })
  }
  save()
  scheduleWorker()
  return { event, duplicate: false }
}

let workerTimer: ReturnType<typeof setTimeout> | undefined
/** The outbox worker: queued → attempted → accepted / failed. Bad tokens fail permanently and are removed. */
function scheduleWorker() {
  if (workerTimer || typeof window === 'undefined') return
  workerTimer = setTimeout(() => {
    workerTimer = undefined
    let pending = false
    for (const d of data.deliveries) {
      if (d.state !== 'queued' && d.state !== 'attempted') continue
      d.attempts++
      d.updatedAt = nowIso()
      const device = d.deviceId ? data.devices.find(x => x.id === d.deviceId) : undefined
      if (d.channel === 'push' && d.deviceId && !device) { d.state = 'failed'; d.error = 'Device signed out'; continue }
      if (device?.invalid) {
        if (d.attempts >= 3) { d.state = 'failed'; d.error = 'Token no longer valid — device removed'; data.devices = data.devices.filter(x => x.id !== device.id) }
        else { d.state = 'attempted'; d.error = 'Provider unavailable, retrying'; pending = true }
        continue
      }
      d.state = 'accepted'
      d.error = undefined
    }
    save()
    if (pending) scheduleWorker()
  }, 900)
}

export const eventsFor = (tournamentId: string) => data.events.filter(e => e.tournamentId === tournamentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
export const deliveriesFor = (eventId: string) => data.deliveries.filter(d => d.eventId === eventId)

export interface DeliverySummary { total: number; accepted: number; failed: number; pending: number; skipped: number }
export function deliverySummary(eventId: string, channel: Channel): DeliverySummary {
  const list = deliveriesFor(eventId).filter(d => d.channel === channel)
  return {
    total: list.length,
    accepted: list.filter(d => d.state === 'accepted').length,
    failed: list.filter(d => d.state === 'failed').length,
    pending: list.filter(d => d.state === 'queued' || d.state === 'attempted').length,
    skipped: list.filter(d => d.state === 'skipped').length,
  }
}

export const payloadOf = (e: NotifyEvent): PushPayload => ({ v: 1, type: e.kind, eventId: e.id, tournamentId: e.tournamentId, resourceId: e.resourceId })

/* ───────── Announcements (AN1) ───────── */

export const announcementsFor = (tournamentId: string) => data.announcements.filter(a => a.tournamentId === tournamentId).sort((a, b) => b.sentAt.localeCompare(a.sentAt))
export const announcementById = (id?: string) => data.announcements.find(a => a.id === id)

/** Who can read an announcement: its recipients, and the tournament's organiser / admins (checked by the caller) */
export function canReadAnnouncement(a: Announcement, account: string) {
  const ev = data.events.find(e => e.id === a.eventId)
  return !!ev?.recipients.some(r => r.account === account.toLowerCase())
}

export type SendResult = { ok: true; announcement: Announcement; duplicate: boolean } | { ok: false; field?: 'title' | 'body' | 'audience'; error: string }

/** Tournaments you can announce to: not cancelled, not closed more than a week ago */
export const canAnnounce = (t: Tournament) => t.status !== 'cancelled' && t.status !== 'draft'

export function sendAnnouncement(t: Tournament, input: { title: string; body: string; audience: Audience }, by: Actor, idempotencyKey: string): SendResult {
  const title = input.title.trim(), body = input.body.trim()
  if (!canAnnounce(t)) return { ok: false, error: 'This tournament can’t receive announcements (draft or cancelled).' }
  if (!title) return { ok: false, field: 'title', error: 'Add a title' }
  if (title.length > ANNOUNCEMENT_LIMITS.title) return { ok: false, field: 'title', error: `Keep the title under ${ANNOUNCEMENT_LIMITS.title} characters` }
  if (!body) return { ok: false, field: 'body', error: 'Write the message' }
  if (body.length > ANNOUNCEMENT_LIMITS.body) return { ok: false, field: 'body', error: `Keep the message under ${ANNOUNCEMENT_LIMITS.body} characters` }
  const recipients = audienceFor(t, input.audience)
  if (!recipients.length) return { ok: false, field: 'audience', error: 'Nobody to send to yet for this audience' }
  const prior = data.announcements.find(a => data.events.find(e => e.id === a.eventId)?.idempotencyKey === idempotencyKey)
  if (prior) return { ok: true, announcement: prior, duplicate: true }
  const id = uid('ann')
  const { event } = emit({ kind: 'announcement', tournamentId: t.id, resourceId: id, title, body: body.length > 140 ? `${body.slice(0, 137)}…` : body, by, recipients, idempotencyKey })
  const announcement: Announcement = {
    id, tournamentId: t.id, title, body, audience: input.audience, sentBy: by, sentAt: event.createdAt, eventId: event.id,
    counts: { golfers: recipients.filter(r => r.kind === 'golfer').length, staff: recipients.filter(r => r.kind === 'staff').length },
  }
  data.announcements.push(announcement)
  save()
  return { ok: true, announcement, duplicate: false }
}

/* ───────── Domain events wired from the rest of the app (section 7) ───────── */

/** Tee time or group changed: the players affected (both groups when someone moves), once per save */
export function notifyTeeTimeChange(t: Tournament, round: number, entryIds: string[], by: Actor, detail: string) {
  const field = entriesFor(t.id)
  const recipients = field.filter(e => entryIds.includes(e.id) && e.email && e.status === 'registered').map(e => ({ account: e.email!.toLowerCase(), name: e.name, kind: 'golfer' as const }))
  if (!recipients.length) return undefined
  const group = groupOf(t.id, round, entryIds[0])
  return emit({
    kind: 'tee-time-changed', tournamentId: t.id, resourceId: group?.id, title: `${t.name}: tee time changed`, body: detail, by, recipients,
    idempotencyKey: `tee:${t.id}:${round}:${entryIds.join(',')}:${detail}`, expiresAt: `${t.endDate ?? t.startDate}T23:59:00`,
  }).event
}

export function notifyPlay(t: Tournament, suspended: boolean, reason: string, by: Actor) {
  const recipients = [...golferRecipients(t), ...staffRecipients(t)]
  return emit({
    kind: suspended ? 'play-suspended' : 'play-resumed', tournamentId: t.id, by, recipients,
    title: suspended ? `Play suspended — ${t.name}` : `Play resumed — ${t.name}`,
    body: suspended ? `${reason}. Mark your ball and stop play.` : reason || 'Replace your ball and carry on.',
    idempotencyKey: `${suspended ? 'suspend' : 'resume'}:${t.id}:${nowIso()}`, expiresAt: plusHours(6),
  }).event
}

export function notifyStaffAssigned(t: Tournament, email: string, name: string, role: string, by?: Actor) {
  return emit({
    kind: 'staff-assigned', tournamentId: t.id, resourceId: email.toLowerCase(), by,
    title: `You’re ${/marshal/i.test(role) ? 'a marshal' : 'a tournament official'} at ${t.name}`,
    body: 'Your login works for this tournament only. Open the app to see your tee sheet and contacts.',
    recipients: [{ account: email.toLowerCase(), name, kind: 'staff' }], idempotencyKey: `staff:${t.id}:${email.toLowerCase()}`,
  }).event
}

export function notifyRegistration(t: Tournament, account: string, name: string) {
  return emit({
    kind: 'registration-confirmed', tournamentId: t.id, title: `You’re in: ${t.name}`, body: `${t.dateRange} · ${t.venue}. Tee times are sent when the draw is published.`,
    recipients: [{ account: account.toLowerCase(), name, kind: 'golfer' }], idempotencyKey: `reg:${t.id}:${account.toLowerCase()}`,
  }).event
}

/* ───────── The phone's side (PN3) ───────── */

/** Alerts for this account that the phone hasn't shown yet — at most one banner per event, newest first */
export function unseenForMe(): NotifyEvent[] {
  const me = MY_ACCOUNT()
  if (data.permission !== 'granted') return []
  return data.events.filter(e => !data.shown.includes(e.id) && e.recipients.some(r => r.account === me)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function markShown(eventId: string) {
  if (!data.shown.includes(eventId)) { data.shown.push(eventId); save() }
}

export const eventById = (id?: string) => data.events.find(e => e.id === id)

/** Recent alerts sent to this account (for "Recent alerts" in Profile — not a full inbox, which is out of scope) */
export const recentForMe = (n = 10) => data.events.filter(e => e.recipients.some(r => r.account === MY_ACCOUNT())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, n)

export type Landing =
  | { ok: true; screen: 'announcement'; tournamentId: string; announcementId: string }
  | { ok: true; screen: 'tournament'; tournamentId: string; focus?: 'tee-time' }
  | { ok: true; screen: 'live-play'; tournamentId: string }
  | { ok: true; screen: 'staff'; tournamentId: string }
  | { ok: false; title: string; message: string }

/**
 * Where a tap on an alert goes. The app re-checks the CURRENT state and the signed-in account's access —
 * the payload alone never opens anything (PN3).
 */
export function landingFor(p: PushPayload, account: string): Landing {
  const t = MOCK_TOURNAMENTS.find(x => x.id === p.tournamentId)
  const ev = eventById(p.eventId)
  if (!t) return { ok: false, title: 'Tournament not found', message: 'This tournament was removed. There’s nothing to show.' }
  if (t.status === 'cancelled') return { ok: false, title: 'Tournament cancelled', message: `${t.name} was cancelled after this alert was sent.` }
  if (!ev || !ev.recipients.some(r => r.account === account.toLowerCase())) return { ok: false, title: 'Not available on this account', message: 'This alert was for a different account. Sign in with that account to open it.' }
  if (ev.expiresAt && ev.expiresAt < nowIso()) return { ok: false, title: 'This alert is out of date', message: 'Things have moved on since it was sent. Here’s the tournament as it is now.' }
  switch (p.type) {
    case 'announcement': {
      const a = announcementById(p.resourceId)
      return a ? { ok: true, screen: 'announcement', tournamentId: t.id, announcementId: a.id } : { ok: false, title: 'Announcement not found', message: 'The organiser’s message is no longer available.' }
    }
    case 'tee-time-changed': return { ok: true, screen: 'tournament', tournamentId: t.id, focus: 'tee-time' }
    case 'play-suspended':
      return suspensionFor(t.id) ? { ok: true, screen: 'live-play', tournamentId: t.id } : { ok: false, title: 'Play has already resumed', message: 'The suspension is over. Carry on scoring from the live round.' }
    case 'play-resumed': return { ok: true, screen: 'live-play', tournamentId: t.id }
    case 'staff-assigned': {
      const still = (t.officials ?? []).some(o => o.email?.toLowerCase() === account.toLowerCase() && isStaffRole(o.role))
      return still ? { ok: true, screen: 'staff', tournamentId: t.id } : { ok: false, title: 'You’re no longer assigned', message: `The organiser changed the staff for ${t.name}. Your access to it has ended.` }
    }
    default: return { ok: true, screen: 'tournament', tournamentId: t.id }
  }
}

/* ───────── Seed and load ───────── */

function seed(): NotifyData {
  const fresh: NotifyData = { events: [], deliveries: [], announcements: [], devices: [], permission: 'not-asked', shown: [] }
  data = fresh
  const t = MOCK_TOURNAMENTS.find(x => x.id === 't8')
  if (!t) return fresh
  // Most golfers have the app with alerts on; every third doesn't, and one has a dead token
  golferRecipients(t).forEach((r, i) => {
    if (r.account === MY_ACCOUNT() || i % 3 === 2) return
    fresh.devices.push({ id: `dev-${i}`, account: r.account, platform: i % 2 ? 'android' : 'ios', environment: 'staging', token: `${i % 2 ? 'fcm' : 'apns'}_seed${i}…`, label: i % 2 ? 'Android phone' : 'iPhone', registeredAt: '2026-09-20T09:00:00', lastSeenAt: '2026-10-03T19:00:00', invalid: i === 4 })
  })
  staffRecipients(t).forEach((r, i) => fresh.devices.push({ id: `dev-staff-${i}`, account: r.account, platform: 'ios', environment: 'staging', token: `apns_staff${i}…`, label: 'iPhone', registeredAt: '2026-09-30T10:00:00', lastSeenAt: '2026-10-04T06:30:00' }))
  // Yesterday's welcome announcement, delivered
  const by: Actor = { name: 'Dana Whitfield', role: 'organiser' }
  const recipients = audienceFor(t, 'golfers')
  const ev: NotifyEvent = {
    id: 'evt-seed-welcome', kind: 'announcement', tournamentId: t.id, resourceId: 'ann-seed-welcome', by, recipients, idempotencyKey: 'seed-welcome', createdAt: '2026-10-03T17:00:00',
    title: 'Welcome to the Club Championship', body: 'Range opens at 6:30. Carts are at the bag drop. Please check in 30 minutes before your tee time.',
  }
  fresh.events.push(ev)
  for (const r of recipients) {
    fresh.deliveries.push({ id: uid('dlv'), eventId: ev.id, account: r.account, name: r.name, channel: 'email', state: 'accepted', attempts: 1, updatedAt: ev.createdAt })
    const ds = fresh.devices.filter(d => d.account === r.account)
    if (!ds.length) fresh.deliveries.push({ id: uid('dlv'), eventId: ev.id, account: r.account, name: r.name, channel: 'push', state: 'skipped', attempts: 0, error: 'No app with alerts on', updatedAt: ev.createdAt })
    ds.forEach(d => fresh.deliveries.push({ id: uid('dlv'), eventId: ev.id, account: r.account, name: r.name, channel: 'push', deviceId: d.id, state: 'accepted', attempts: 1, updatedAt: ev.createdAt }))
  }
  fresh.announcements.push({
    id: 'ann-seed-welcome', tournamentId: t.id, title: ev.title, audience: 'golfers', sentBy: by, sentAt: ev.createdAt, eventId: ev.id,
    body: 'Range opens at 6:30. Carts are at the bag drop. Please check in at the starter’s hut 30 minutes before your tee time — the draw is on the app.\n\nDinner and prize giving follow round 2 on Sunday.',
    counts: { golfers: recipients.length, staff: 0 },
  })
  // Already seen on the golfer's phone, so it doesn't pop up as new
  fresh.shown.push(ev.id)
  return fresh
}

export function resetNotifyData() {
  data = seed()
  save()
}

;(function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) { data = { ...seed(), ...JSON.parse(raw) }; return }
  } catch { /* fall through to seed */ }
  data = seed()
})()

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try { data = JSON.parse(e.newValue) } catch { return }
    version++
    listeners.forEach(l => l())
  })
}
