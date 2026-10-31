import { useSyncExternalStore } from 'react'
import type { Tournament } from '../types'
import { MOCK_TOURNAMENTS } from '../data'

/**
 * Roles, permissions, admin logins and organisations for the admin console
 * (prototype — no backend; everything is checked in the browser and saved to localStorage).
 *
 * Model (based on the chitfund admin, extended for organisers):
 *  - A permission is "screen.action" from a single catalog.
 *  - Every admin login has exactly one role.
 *  - Two built-in roles always exist:
 *      Super Admin — the platform owner, has every permission.
 *      Organizer   — given to every organisation owner. It is the CEILING of what any
 *                    organisation can do; the Super Admin decides what it includes.
 *  - Platform roles (created by platform admins) apply platform-wide.
 *    Organisation roles (created by organisers) apply only inside that organisation and
 *    can never exceed the Organizer ceiling.
 *  - Nobody can grant or assign permissions they don't hold themselves.
 */

/* ───────── Permission catalog (single source of truth) ───────── */

export type ActionKey =
  | 'view' | 'create' | 'edit' | 'delete'
  | 'status' | 'scorecard' | 'deactivate' | 'assign-role' | 'reset-data' | 'approve'

/** platform = only platform staff can ever hold it; organization = only organisation members; shared = both */
export type PermScope = 'shared' | 'platform' | 'organization'

export interface ScreenDef {
  key: string
  name: string
  description: string
  actions: ActionKey[]
  scope: PermScope
}

export interface ModuleDef {
  name: string
  screens: ScreenDef[]
}

export const PERMISSION_CATALOG: ModuleDef[] = [
  {
    name: 'Dashboard',
    screens: [
      { key: 'dashboard', name: 'Dashboard', description: 'Overview, statistics and quick actions', actions: ['view'], scope: 'shared' },
    ],
  },
  {
    name: 'Events',
    screens: [
      { key: 'tournaments', name: 'Tournaments', description: 'Tournament list, details and status', actions: ['view', 'create', 'edit', 'delete', 'status'], scope: 'shared' },
      { key: 'courses', name: 'Courses', description: 'Course details and scorecards', actions: ['view', 'create', 'edit', 'delete', 'scorecard'], scope: 'shared' },
    ],
  },
  {
    name: 'Organisation',
    screens: [
      { key: 'organisation', name: 'Organisation profile', description: 'Your organisation’s details and review status', actions: ['view', 'edit'], scope: 'organization' },
      { key: 'organizers', name: 'Organizers', description: 'Review, approve and suspend organisations', actions: ['view', 'approve'], scope: 'platform' },
    ],
  },
  {
    name: 'Administration',
    screens: [
      { key: 'roles', name: 'Roles & permissions', description: 'Create roles and choose what they can do', actions: ['view', 'create', 'edit', 'delete'], scope: 'shared' },
      { key: 'users', name: 'Admin users', description: 'Admin logins and their roles', actions: ['view', 'create', 'edit', 'deactivate', 'assign-role'], scope: 'shared' },
      { key: 'settings', name: 'Settings', description: 'Platform maintenance tools', actions: ['reset-data'], scope: 'platform' },
    ],
  },
]

export const STANDARD_ACTIONS: ActionKey[] = ['view', 'create', 'edit', 'delete']

export const ACTION_LABELS: Record<ActionKey, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  status: 'Change status',
  scorecard: 'Edit scorecard',
  deactivate: 'Deactivate',
  'assign-role': 'Assign role',
  'reset-data': 'Reset demo data',
  approve: 'Approve & suspend',
}

export const permKey = (screen: string, action: ActionKey) => `${screen}.${action}`

const ALL_SCREENS = PERMISSION_CATALOG.flatMap(m => m.screens)
const keysOf = (screens: ScreenDef[]) => screens.flatMap(s => s.actions.map(a => permKey(s.key, a)))

export const ALL_PERMISSIONS: string[] = keysOf(ALL_SCREENS)
/** Permissions a platform role may contain */
export const PLATFORM_ELIGIBLE: string[] = keysOf(ALL_SCREENS.filter(s => s.scope !== 'organization'))
/** Permissions an organisation role (including Organizer) may contain */
export const ORG_ELIGIBLE: string[] = keysOf(ALL_SCREENS.filter(s => s.scope !== 'platform'))

export function screenOf(perm: string) {
  return ALL_SCREENS.find(s => perm.startsWith(`${s.key}.`))
}

/**
 * Keeps a permission set consistent: any action on a screen that has "view"
 * implies "view", so nobody can end up with Edit but no way to open the page.
 */
export function normalizePermissions(perms: Iterable<string>): string[] {
  const set = new Set(perms)
  for (const s of ALL_SCREENS) {
    if (!s.actions.includes('view')) continue
    if (s.actions.some(a => a !== 'view' && set.has(permKey(s.key, a)))) set.add(permKey(s.key, 'view'))
  }
  return ALL_PERMISSIONS.filter(p => set.has(p)) // stable catalog order, unknown keys dropped
}

const intersect = (a: string[], b: string[]) => { const s = new Set(b); return a.filter(x => s.has(x)) }

/* ───────── Records ───────── */

export type RoleScope = 'platform' | 'organization'

export interface Role {
  id: string
  name: string
  description: string
  permissions: string[]
  scope: RoleScope
  /** Set for roles an organisation created for its own team */
  organizationId?: string
  /** Built-in: Super Admin (never editable) and Organizer (editable by Super Admin only) */
  system?: boolean
}

export interface AdminUser {
  id: string
  name: string
  email: string
  /** Prototype only — a real system stores a salted hash on the server, never in the browser */
  password: string
  roleId: string
  active: boolean
  /** undefined = platform staff; otherwise the organisation this login belongs to */
  organizationId?: string
  lastSignIn?: string
  /** The built-in platform admin can't be deactivated or moved off Super Admin */
  system?: boolean
  /** Role in their organisation, e.g. "Tournament Director" (organisers only) */
  jobTitle?: string
  /** Opted in to product news (CASL: separate, unticked opt-in) */
  marketingOptIn?: boolean
  /** The same person also plays: one login opens their golfer account and this console (client, 21 Oct) */
  alsoGolfer?: boolean
  /** Optional photo ID for organisers (verified tick) */
  idCheck?: { document: string; fileName: string; status: 'checking' | 'verified'; at: string }
}

export type OrgStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type OrgType = 'Golf club' | 'Golf association' | 'Corporate' | 'Charity / non-profit' | 'Independent tournament organizer'
export const ORG_TYPES: OrgType[] = ['Golf club', 'Golf association', 'Corporate', 'Charity / non-profit', 'Independent tournament organizer']
/** Older saved values → current names */
const LEGACY_TYPES: Record<string, OrgType> = { Association: 'Golf association', Charity: 'Charity / non-profit', 'Tournament organizer': 'Independent tournament organizer' }

export const EVENTS_PER_YEAR = ['1–5', '6–10', '11–25', '25+']
export const FIELD_SIZES = ['Under 50', '50–100', '100–150', '150+']

/** A review decision, kept as the organisation's audit history */
export interface OrgDecision {
  status: OrgStatus
  byUserId: string
  at: string
  reason?: string
}

export interface Organization {
  id: string
  name: string
  type: OrgType
  email: string
  phone: string
  website?: string
  city: string
  region: string
  country: string
  homeCourseId?: string
  eventsPerYear?: string
  about?: string
  logoUrl?: string
  street?: string
  postalCode?: string
  /** Not shown publicly: help the platform team verify the organisation */
  registrationNumber?: string
  golfCanadaId?: string
  fieldSize?: string
  /** The owner clicked the verification link sent at sign-up */
  emailVerified?: boolean
  decisions?: OrgDecision[]
  status: OrgStatus
  /** Why it was rejected or suspended */
  statusReason?: string
  ownerUserId: string
  createdAt: string
}

export const SUPER_ADMIN_ROLE_ID = 'super-admin'
export const ORGANIZER_ROLE_ID = 'organizer'

const DEFAULT_ROLES: Role[] = [
  {
    id: SUPER_ADMIN_ROLE_ID,
    name: 'Super Admin',
    description: 'Platform owner. Full access to everything, including organisers, roles and admin users.',
    permissions: ALL_PERMISSIONS,
    scope: 'platform',
    system: true,
  },
  {
    id: ORGANIZER_ROLE_ID,
    name: 'Organizer',
    description: 'Given to every organisation owner. The most any organisation can do — their own roles can never exceed it.',
    permissions: normalizePermissions([
      'dashboard.view',
      'tournaments.view', 'tournaments.create', 'tournaments.edit', 'tournaments.delete', 'tournaments.status',
      'courses.view', 'courses.create', 'courses.edit', 'courses.scorecard',
      'organisation.view', 'organisation.edit',
      'roles.view', 'roles.create', 'roles.edit', 'roles.delete',
      'users.view', 'users.create', 'users.edit', 'users.deactivate', 'users.assign-role',
    ]),
    scope: 'organization',
    system: true,
  },
  {
    id: 'tournament-director',
    name: 'Tournament Director',
    description: 'Runs events end to end. Can view courses but not change them.',
    permissions: normalizePermissions(['dashboard.view', 'tournaments.view', 'tournaments.create', 'tournaments.edit', 'tournaments.delete', 'tournaments.status', 'courses.view']),
    scope: 'platform',
  },
  {
    id: 'course-manager',
    name: 'Course Manager',
    description: 'Maintains course details and scorecards. Read-only on tournaments.',
    permissions: normalizePermissions(['dashboard.view', 'courses.view', 'courses.create', 'courses.edit', 'courses.delete', 'courses.scorecard', 'tournaments.view']),
    scope: 'platform',
  },
  {
    id: 'registration-desk',
    name: 'Registration Desk',
    description: 'Front-desk staff. Can open and close registration on tournaments.',
    permissions: normalizePermissions(['dashboard.view', 'tournaments.view', 'tournaments.status', 'courses.view']),
    scope: 'platform',
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to events for reporting.',
    permissions: normalizePermissions(['dashboard.view', 'tournaments.view', 'courses.view']),
    scope: 'platform',
  },
  {
    id: 'o-savannah-event-staff',
    name: 'Event Staff',
    description: 'Savannah match-day staff: view events and open or close registration.',
    permissions: normalizePermissions(['dashboard.view', 'tournaments.view', 'tournaments.status', 'courses.view']),
    scope: 'organization',
    organizationId: 'o-savannah',
  },
]

const DEFAULT_USERS: AdminUser[] = [
  { id: 'u-admin', name: 'Administrator', email: 'admin@gmail.com', password: 'admin', roleId: SUPER_ADMIN_ROLE_ID, active: true, system: true },
  { id: 'u-director', name: 'Priya Raman', email: 'director@gmail.com', password: 'director', roleId: 'tournament-director', active: true },
  { id: 'u-courses', name: 'Marcus Lee', email: 'courses@gmail.com', password: 'courses', roleId: 'course-manager', active: true },
  { id: 'u-desk', name: 'Hannah Cole', email: 'desk@gmail.com', password: 'desk', roleId: 'registration-desk', active: true },
  { id: 'u-former', name: 'Tom Baker', email: 'tom@gmail.com', password: 'tom', roleId: 'viewer', active: false },
  // Approved organisation
  { id: 'u-savannah', name: 'Grace Whitfield', email: 'owner@savannahgolf.com', password: 'savannah', roleId: ORGANIZER_ROLE_ID, organizationId: 'o-savannah', active: true },
  { id: 'u-savannah-staff', name: 'Leo Park', email: 'leo@savannahgolf.com', password: 'leo', roleId: 'o-savannah-event-staff', organizationId: 'o-savannah', active: true },
  // Runs the live club championship (t8), with a marshal and an official on duty
  { id: 'u-augusta', name: 'Dana Whitfield', email: 'dana@augustapines.com', password: 'augusta', roleId: ORGANIZER_ROLE_ID, organizationId: 'o-augusta', active: true, jobTitle: 'Tournament Director' },
  // The demo golfer is also on the Augusta Pines committee: organisers often play in their own events
  { id: 'u-augusta-alex', name: 'Alexander Hartwell', email: 'alex.hartwell@golfclub.com', password: 'golfer', roleId: ORGANIZER_ROLE_ID, organizationId: 'o-augusta', active: true, jobTitle: 'Committee member', alsoGolfer: true },
  // Pending organisation
  { id: 'u-coastal', name: 'Nadia Brooks', email: 'hello@coastalcharity.org', password: 'coastal', roleId: ORGANIZER_ROLE_ID, organizationId: 'o-coastal', active: true },
]

const DEFAULT_ORGS: Organization[] = [
  {
    id: 'o-savannah', name: 'Savannah Golf Club', type: 'Golf club',
    email: 'events@savannahgolf.com', phone: '+1 (912) 555-0140', website: 'savannahgolf.com',
    street: '1661 Wilmington Island Rd', city: 'Savannah', region: 'Georgia', postalCode: '31410', country: 'United States',
    eventsPerYear: '11–25', fieldSize: '100–150', emailVerified: true,
    decisions: [{ status: 'approved', byUserId: 'u-admin', at: '2026-03-03T09:00:00.000Z' }],
    status: 'approved', ownerUserId: 'u-savannah', createdAt: '2026-03-02T10:00:00.000Z',
  },
  {
    id: 'o-augusta', name: 'Augusta Pines Golf Club', type: 'Golf club',
    email: 'events@augustapines.com', phone: '+1 (706) 555-0100', website: 'augustapinesgolf.com',
    street: '1200 Pine Valley Rd', city: 'Augusta', region: 'Georgia', postalCode: '30907', country: 'United States',
    homeCourseId: 'c1', eventsPerYear: '6–10', fieldSize: '50–100', emailVerified: true,
    decisions: [{ status: 'approved', byUserId: 'u-admin', at: '2026-04-11T09:00:00.000Z' }],
    status: 'approved', ownerUserId: 'u-augusta', createdAt: '2026-04-10T10:00:00.000Z',
  },
  {
    id: 'o-coastal', name: 'Coastal Charity Golf', type: 'Charity / non-profit',
    email: 'hello@coastalcharity.org', phone: '+1 (831) 555-0199', website: 'coastalcharity.org',
    street: '400 Cannery Row', city: 'Monterey', region: 'California', postalCode: '93940', country: 'United States',
    eventsPerYear: '1–5', fieldSize: 'Under 50', registrationNumber: 'EIN 94-1234567', emailVerified: false,
    status: 'pending', ownerUserId: 'u-coastal', createdAt: '2026-09-20T15:30:00.000Z',
  },
]

/* ───────── Store ───────── */

const STORAGE_KEY = 'gtp-access-v2'

let roles: Role[] = structuredClone(DEFAULT_ROLES)
let users: AdminUser[] = structuredClone(DEFAULT_USERS)
let orgs: Organization[] = structuredClone(DEFAULT_ORGS)
let version = 0
const listeners = new Set<() => void>()

;(function load() {
  try {
    localStorage.removeItem('gtp-access-v1') // previous format, before organisations
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as { roles?: Role[]; users?: AdminUser[]; orgs?: Organization[] }
    if (Array.isArray(saved.roles) && saved.roles.some(r => r.id === SUPER_ADMIN_ROLE_ID) && saved.roles.some(r => r.id === ORGANIZER_ROLE_ID)) roles = saved.roles
    if (Array.isArray(saved.users) && saved.users.some(u => u.system)) users = saved.users
    // Demo accounts added after this browser saved its data
    for (const u of DEFAULT_USERS) if (!users.some(x => x.id === u.id)) users.push(structuredClone(u))
    if (Array.isArray(saved.orgs)) orgs = saved.orgs.map(o => ({
      ...o,
      type: LEGACY_TYPES[o.type] ?? o.type,
      eventsPerYear: o.eventsPerYear === '10–25' ? '11–25' : o.eventsPerYear,
      // Organisations decided before verification existed count as verified
      emailVerified: o.emailVerified ?? o.status !== 'pending',
    }))
    for (const o of DEFAULT_ORGS) if (!orgs.some(x => x.id === o.id)) orgs.push(structuredClone(o))
  } catch {
    /* corrupt or unavailable storage — keep defaults */
  }
})()

function commit() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ roles, users, orgs })) } catch { /* session-only */ }
  version++
  listeners.forEach(l => l())
}

// Another tab changed an account (a new password, say): pick it up, as a real backend would
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      const saved = JSON.parse(e.newValue) as { roles?: Role[]; users?: AdminUser[]; orgs?: Organization[] }
      if (saved.roles) roles = saved.roles
      if (saved.users) users = saved.users
      if (saved.orgs) orgs = saved.orgs
    } catch { return }
    version++
    listeners.forEach(l => l())
  })
}

export function useAccessVersion() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb) },
    () => version,
  )
}

export const getRoles = () => roles
export const getUsers = () => users
export const getOrganizations = () => orgs
export const getRole = (id: string) => roles.find(r => r.id === id)
export const getUser = (id: string) => users.find(u => u.id === id)
export const getOrganization = (id?: string) => (id ? orgs.find(o => o.id === id) : undefined)
export const usersWithRole = (roleId: string, organizationId?: string) =>
  users.filter(u => u.roleId === roleId && (organizationId === undefined || u.organizationId === organizationId))

/** The ceiling for every organisation role */
export const organizerCeiling = () => intersect(getRole(ORGANIZER_ROLE_ID)?.permissions ?? [], ORG_ELIGIBLE)

/** Effective permissions for a role */
export function rolePermissions(roleId: string): string[] {
  const role = getRole(roleId)
  if (!role) return []
  if (role.id === SUPER_ADMIN_ROLE_ID) return ALL_PERMISSIONS
  if (role.id === ORGANIZER_ROLE_ID) return organizerCeiling()
  if (role.scope === 'organization') return intersect(role.permissions, organizerCeiling())
  return intersect(role.permissions, PLATFORM_ELIGIBLE)
}

/** What a signed-in admin can do right now (nothing if inactive, or their organisation is blocked) */
export function userPermissions(user?: AdminUser): string[] {
  if (!user?.active) return []
  const org = getOrganization(user.organizationId)
  if (user.organizationId && (!org || org.status === 'rejected' || org.status === 'suspended')) return []
  return rolePermissions(user.roleId)
}

type Result = { ok: true } | { ok: false; reason: string }

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const isSuperAdmin = (u?: AdminUser) => u?.roleId === SUPER_ADMIN_ROLE_ID && u.active

/* ───────── Roles: visibility and grant rules ───────── */

/** Roles an admin can see on the Roles page */
export function visibleRoles(actor?: AdminUser): Role[] {
  if (!actor) return []
  if (actor.organizationId) return roles.filter(r => r.id === ORGANIZER_ROLE_ID || r.organizationId === actor.organizationId)
  return roles.filter(r => r.scope === 'platform' || r.id === ORGANIZER_ROLE_ID)
}

/** Can this admin change this role's name/permissions? */
export function canEditRole(actor: AdminUser | undefined, role: Role): boolean {
  if (!actor || role.id === SUPER_ADMIN_ROLE_ID) return false
  if (!userPermissions(actor).includes('roles.edit')) return false
  if (role.id === ORGANIZER_ROLE_ID) return isSuperAdmin(actor) // only the platform owner sets the organiser ceiling
  if (role.scope === 'organization') return role.organizationId === actor.organizationId
  return !actor.organizationId
}

/**
 * Permissions this admin may put into a role of the given scope.
 * You can never grant what you don't have; organisation roles are also capped by the Organizer ceiling.
 */
export function grantablePermissions(actor: AdminUser | undefined, roleId: string | undefined, scope: RoleScope): string[] {
  if (!actor) return []
  if (roleId === ORGANIZER_ROLE_ID) return isSuperAdmin(actor) ? ORG_ELIGIBLE : []
  const mine = userPermissions(actor)
  return scope === 'organization'
    ? intersect(intersect(mine, ORG_ELIGIBLE), organizerCeiling())
    : intersect(mine, PLATFORM_ELIGIBLE)
}

export function saveRole(
  actor: AdminUser | undefined,
  input: { id?: string; name: string; description: string; permissions: string[] },
): Result & { id?: string } {
  if (!actor) return { ok: false, reason: 'Not signed in' }
  const existing = input.id ? getRole(input.id) : undefined
  const scope: RoleScope = existing?.scope ?? (actor.organizationId ? 'organization' : 'platform')
  const organizationId = existing?.organizationId ?? (actor.organizationId || undefined)

  if (existing && !canEditRole(actor, existing)) return { ok: false, reason: 'You can’t change this role' }
  if (!existing && !userPermissions(actor).includes('roles.create')) return { ok: false, reason: 'You can’t create roles' }

  const name = input.name.trim()
  if (!name) return { ok: false, reason: 'Role name is required' }
  const clash = roles.some(r => r.id !== input.id && r.name.trim().toLowerCase() === name.toLowerCase() &&
    (r.system || r.organizationId === organizationId))
  if (clash) return { ok: false, reason: `A role called "${name}" already exists` }

  const requested = normalizePermissions(input.permissions)
  const grantable = new Set(grantablePermissions(actor, existing?.id, scope))
  const blocked = requested.filter(p => !grantable.has(p))
  if (blocked.length) return { ok: false, reason: `You can’t grant permissions you don’t have (${blocked.length} blocked)` }

  const base = organizationId ? `${organizationId}-${slug(name)}` : slug(name)
  const role: Role = {
    id: existing?.id ?? (base && !getRole(base) ? base : `role-${Date.now().toString(36)}`),
    name: existing?.system ? existing.name : name,
    description: input.description.trim(),
    permissions: requested,
    scope,
    organizationId,
    system: existing?.system,
  }
  roles = existing ? roles.map(r => (r.id === role.id ? role : r)) : [...roles, role]
  commit()
  return { ok: true, id: role.id }
}

export function deleteRole(actor: AdminUser | undefined, id: string): Result {
  const role = getRole(id)
  if (!role) return { ok: false, reason: 'Role not found' }
  if (role.system) return { ok: false, reason: 'Built-in roles can’t be deleted' }
  if (!actor || !userPermissions(actor).includes('roles.delete') || !canEditRole({ ...actor, roleId: actor.roleId }, role)) {
    return { ok: false, reason: 'You can’t delete this role' }
  }
  const n = usersWithRole(id).length
  if (n) return { ok: false, reason: `${n} admin user${n > 1 ? 's have' : ' has'} this role. Give them another role first.` }
  roles = roles.filter(r => r.id !== id)
  commit()
  return { ok: true }
}

/* ───────── Users: visibility and assignment rules ───────── */

export function visibleUsers(actor?: AdminUser): AdminUser[] {
  if (!actor) return []
  return actor.organizationId ? users.filter(u => u.organizationId === actor.organizationId) : users
}

export const isOrgOwner = (u: AdminUser) => !!u.organizationId && getOrganization(u.organizationId)?.ownerUserId === u.id

/** Roles this admin may give to someone in the given organisation (undefined = platform staff) */
export function assignableRoles(actor: AdminUser | undefined, targetOrgId: string | undefined): Role[] {
  if (!actor) return []
  const mine = new Set(userPermissions(actor))
  const pool = targetOrgId
    ? roles.filter(r => r.id === ORGANIZER_ROLE_ID || r.organizationId === targetOrgId)
    : roles.filter(r => r.scope === 'platform')
  // Can't hand out a role that can do more than you can
  return pool.filter(r => isSuperAdmin(actor) || rolePermissions(r.id).every(p => mine.has(p)))
}

/** Can the actor edit / deactivate this user at all? */
export function canManageUser(actor: AdminUser | undefined, target: AdminUser): boolean {
  if (!actor) return false
  if (actor.organizationId && target.organizationId !== actor.organizationId) return false
  if (target.system) return actor.id === target.id || isSuperAdmin(actor)
  if (isOrgOwner(target) && !isSuperAdmin(actor) && actor.id !== target.id) return false // only the owner or the platform can change an owner
  return true
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const activeSuperAdmins = () => users.filter(u => u.active && u.roleId === SUPER_ADMIN_ROLE_ID)
const emailTaken = (email: string, exceptId?: string) => users.some(u => u.id !== exceptId && u.email.toLowerCase() === email.toLowerCase())

export function saveUser(
  actor: AdminUser | undefined,
  input: { id?: string; name: string; email: string; password: string; roleId: string },
): Result & { id?: string } {
  if (!actor) return { ok: false, reason: 'Not signed in' }
  const existing = input.id ? getUser(input.id) : undefined
  if (existing && !canManageUser(actor, existing)) return { ok: false, reason: 'You can’t change this user' }

  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (!name) return { ok: false, reason: 'Name is required' }
  if (!EMAIL_RE.test(email)) return { ok: false, reason: 'Enter a valid email address' }
  if (emailTaken(email, input.id)) return { ok: false, reason: 'Another admin user already uses this email' }

  const organizationId = existing ? existing.organizationId : (actor.organizationId || undefined)
  if (!existing && organizationId && getOrganization(organizationId)?.status !== 'approved') {
    return { ok: false, reason: 'You can invite your team once your organisation is approved' }
  }
  const roleChanging = !existing || existing.roleId !== input.roleId
  if (roleChanging) {
    if (!getRole(input.roleId)) return { ok: false, reason: 'Choose a role' }
    if (existing && !userPermissions(actor).includes('users.assign-role')) return { ok: false, reason: 'You can’t change roles' }
    if (!assignableRoles(actor, organizationId).some(r => r.id === input.roleId)) {
      return { ok: false, reason: 'You can’t assign a role with more permissions than your own' }
    }
    if (existing?.system) return { ok: false, reason: 'The built-in admin must stay a Super Admin' }
    if (existing && isOrgOwner(existing)) return { ok: false, reason: 'The organisation owner keeps the Organizer role' }
    if (existing?.roleId === SUPER_ADMIN_ROLE_ID && existing.active && activeSuperAdmins().length <= 1) {
      return { ok: false, reason: 'You need at least one active Super Admin' }
    }
  }
  if (!existing && input.password.length < 4) return { ok: false, reason: 'Password must be at least 4 characters' }

  const user: AdminUser = existing
    ? { ...existing, name, email, roleId: input.roleId, password: input.password || existing.password }
    : { id: `u-${Date.now().toString(36)}`, name, email, password: input.password, roleId: input.roleId, organizationId, active: true }
  users = existing ? users.map(u => (u.id === user.id ? user : u)) : [...users, user]
  commit()
  return { ok: true, id: user.id }
}

export function setUserActive(actor: AdminUser | undefined, id: string, active: boolean): Result {
  const user = getUser(id)
  if (!user) return { ok: false, reason: 'User not found' }
  if (!canManageUser(actor, user)) return { ok: false, reason: 'You can’t change this user' }
  if (!active) {
    if (user.system) return { ok: false, reason: 'The built-in admin can’t be deactivated' }
    if (id === actor?.id) return { ok: false, reason: 'You can’t deactivate your own account' }
    if (isOrgOwner(user)) return { ok: false, reason: 'The organisation owner can’t be deactivated' }
    if (user.roleId === SUPER_ADMIN_ROLE_ID && activeSuperAdmins().length <= 1) return { ok: false, reason: 'You need at least one active Super Admin' }
  }
  users = users.map(u => (u.id === id ? { ...u, active } : u))
  commit()
  return { ok: true }
}

export function resetPassword(actor: AdminUser | undefined, id: string, password: string): Result {
  const user = getUser(id)
  if (!user || !canManageUser(actor, user)) return { ok: false, reason: 'You can’t change this user' }
  if (password.length < 4) return { ok: false, reason: 'Password must be at least 4 characters' }
  users = users.map(u => (u.id === id ? { ...u, password } : u))
  commit()
  return { ok: true }
}

/* ───────── Organisations ───────── */

export interface OrganizerSignup {
  fullName: string
  email: string
  phone: string
  password: string
  jobTitle?: string
  marketingOptIn?: boolean
  idCheck?: AdminUser['idCheck']
  org: Omit<Organization, 'id' | 'status' | 'statusReason' | 'ownerUserId' | 'createdAt' | 'emailVerified' | 'decisions'>
}

/** Organiser self sign-up: creates a pending organisation and its owner login */
export function registerOrganizer(input: OrganizerSignup): Result & { userId?: string } {
  const email = input.email.trim().toLowerCase()
  if (emailTaken(email)) return { ok: false, reason: 'An account with this email already exists. Sign in instead.' }
  const orgName = input.org.name.trim()
  if (orgs.some(o => o.name.trim().toLowerCase() === orgName.toLowerCase() && o.status !== 'rejected')) {
    return { ok: false, reason: `"${orgName}" is already registered. Ask its owner to add you to their team.` }
  }
  const orgId = `o-${slug(orgName) || Date.now().toString(36)}`.slice(0, 40)
  const userId = `u-${Date.now().toString(36)}`
  const org: Organization = {
    ...input.org,
    name: orgName,
    id: getOrganization(orgId) ? `${orgId}-${Date.now().toString(36)}` : orgId,
    status: 'pending',
    ownerUserId: userId,
    createdAt: new Date().toISOString(),
    emailVerified: false,
    decisions: [],
  }
  orgs = [...orgs, org]
  users = [...users, {
    id: userId, name: input.fullName.trim(), email, password: input.password,
    roleId: ORGANIZER_ROLE_ID, organizationId: org.id, active: true,
    jobTitle: input.jobTitle?.trim() || undefined, marketingOptIn: !!input.marketingOptIn, idCheck: input.idCheck,
  }]
  commit()
  return { ok: true, userId }
}

export function updateOrganization(actor: AdminUser | undefined, id: string, patch: Partial<Omit<Organization, 'id' | 'status' | 'ownerUserId' | 'createdAt'>>): Result {
  const org = getOrganization(id)
  if (!org) return { ok: false, reason: 'Organisation not found' }
  const allowed = actor?.organizationId === id ? userPermissions(actor).includes('organisation.edit') : isSuperAdmin(actor)
  if (!allowed) return { ok: false, reason: 'You can’t edit this organisation' }
  if (patch.name !== undefined && !patch.name.trim()) return { ok: false, reason: 'Organisation name is required' }
  orgs = orgs.map(o => (o.id === id ? { ...o, ...patch } : o))
  commit()
  return { ok: true }
}

/** Allowed review moves: a registration is decided once; afterwards only suspend / reactivate */
const NEXT_STATUS: Record<OrgStatus, OrgStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['suspended'],
  suspended: ['approved'],
  rejected: [],
}

export function setOrganizationStatus(actor: AdminUser | undefined, id: string, status: OrgStatus, reason?: string): Result {
  if (!actor || actor.organizationId || !userPermissions(actor).includes('organizers.approve')) return { ok: false, reason: 'You can’t review organisers' }
  const org = getOrganization(id)
  if (!org) return { ok: false, reason: 'Organisation not found' }
  if (!NEXT_STATUS[org.status].includes(status)) return { ok: false, reason: 'This organisation has already been reviewed' }
  if (status === 'approved' && org.status === 'pending' && !org.emailVerified) return { ok: false, reason: 'The owner must verify their email before approval' }
  if ((status === 'rejected' || status === 'suspended') && !reason?.trim()) return { ok: false, reason: 'Give a reason so the organiser knows what to fix' }
  const decision: OrgDecision = { status, byUserId: actor.id, at: new Date().toISOString(), reason: reason?.trim() || undefined }
  orgs = orgs.map(o => (o.id === id ? { ...o, status, statusReason: status === 'approved' ? undefined : reason?.trim(), decisions: [...(o.decisions ?? []), decision] } : o))
  commit()
  return { ok: true }
}

export const allowedStatusMoves = (org: Organization) => NEXT_STATUS[org.status]

/** Prototype stand-in for the owner clicking the verification link in their email */
export function verifyOrganizationEmail(id: string) {
  orgs = orgs.map(o => (o.id === id ? { ...o, emailVerified: true } : o))
  commit()
}

const domainOf = (v?: string) => v?.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('@').pop()

/** What the reviewer should check before deciding */
export function reviewChecklist(org: Organization) {
  const owner = getUser(org.ownerUserId)
  const site = domainOf(org.website)
  const emailDomain = domainOf(owner?.email)
  const duplicate = orgs.find(o => o.id !== org.id && o.name.trim().toLowerCase() === org.name.trim().toLowerCase() && o.city.trim().toLowerCase() === org.city.trim().toLowerCase())
  return [
    { label: 'Owner email verified', ok: !!org.emailVerified },
    { label: owner?.idCheck ? `Owner’s photo ID verified (${owner.idCheck.document})` : 'Owner didn’t upload a photo ID (optional)', ok: !!owner?.idCheck },
    { label: site ? `Owner email matches the website (${site})` : 'No website to match the owner email against', ok: !!site && !!emailDomain && (emailDomain === site || emailDomain.endsWith(`.${site}`)) },
    { label: org.registrationNumber || org.golfCanadaId ? 'Registration number or Golf Canada ID given' : 'No registration number or Golf Canada ID', ok: !!(org.registrationNumber || org.golfCanadaId) },
    { label: duplicate ? `Possible duplicate: ${duplicate.name} (${duplicate.status})` : 'No other organisation with this name in the same city', ok: !duplicate },
  ]
}

/* ───────── Tournament visibility ───────── */

/** Golfers only see published events from the platform or from approved organisations */
/** The organiser login that belongs to a golfer, when they also run tournaments */
export const organiserLoginFor = (email: string) =>
  users.find(u => u.alsoGolfer && u.active && u.email.toLowerCase() === email.trim().toLowerCase())

export function isPublicTournament(t: Tournament) {
  if (t.status === 'draft') return false
  if (!t.organizerId) return true
  return getOrganization(t.organizerId)?.status === 'approved'
}

export const publicTournaments = () => MOCK_TOURNAMENTS.filter(isPublicTournament)

export const organizerName = (organizerId?: string) => getOrganization(organizerId)?.name

/* ───────── Admin console scoping ───────── */

/** Tournaments an admin works with: organisers only ever see their own */
export function scopedTournaments(actor?: AdminUser): Tournament[] {
  if (!actor) return []
  return actor.organizationId ? MOCK_TOURNAMENTS.filter(t => t.organizerId === actor.organizationId) : MOCK_TOURNAMENTS
}

/** Can this admin make events visible to golfers? (organisations must be approved first) */
export function canPublish(actor?: AdminUser) {
  if (!actor?.organizationId) return true
  return getOrganization(actor.organizationId)?.status === 'approved'
}

/** Organisers can see every course but only change the ones their organisation added */
export function canChangeCourse(actor: AdminUser | undefined, course: { organizerId?: string }) {
  if (!actor) return false
  return actor.organizationId ? course.organizerId === actor.organizationId : true
}

/* ───────── Sign-in ───────── */

/** 'unknown' = no console account with this email. Wrong-password counts and the lock-out are in ops.ts, shared by every login. */
export type AuthFailure = 'unknown' | 'invalid' | 'inactive' | 'org-rejected' | 'org-suspended'

export function authenticate(email: string, password: string):
  { ok: true; user: AdminUser } | { ok: false; reason: AuthFailure; detail?: string } {
  const key = email.trim().toLowerCase()
  const user = users.find(u => u.email.toLowerCase() === key)
  if (!user) return { ok: false, reason: 'unknown' }
  if (user.password !== password) return { ok: false, reason: 'invalid' }
  if (!user.active) return { ok: false, reason: 'inactive' }
  const org = getOrganization(user.organizationId)
  if (org?.status === 'rejected') return { ok: false, reason: 'org-rejected', detail: org.statusReason }
  if (org?.status === 'suspended') return { ok: false, reason: 'org-suspended', detail: org.statusReason }
  users = users.map(u => (u.id === user.id ? { ...u, lastSignIn: new Date().toISOString() } : u))
  commit()
  return { ok: true, user }
}

/** Forgot password: the account owner sets a new one with a code */
export function setPasswordByEmail(email: string, password: string) {
  const key = email.trim().toLowerCase()
  users = users.map(u => (u.email.toLowerCase() === key ? { ...u, password } : u))
  commit()
}

export function authFailureMessage(r: { reason: AuthFailure; detail?: string }) {
  switch (r.reason) {
    case 'inactive':      return 'This admin account has been deactivated. Contact your administrator.'
    case 'org-rejected':  return `Your organiser application was not approved${r.detail ? `: ${r.detail}` : '.'}`
    case 'org-suspended': return `Your organisation has been suspended${r.detail ? `: ${r.detail}` : '.'} Contact support.`
    default:              return 'Invalid email or password'
  }
}

export function resetAccessData() {
  roles = structuredClone(DEFAULT_ROLES)
  users = structuredClone(DEFAULT_USERS)
  orgs = structuredClone(DEFAULT_ORGS)
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  version++
  listeners.forEach(l => l())
}
