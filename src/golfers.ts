import type { GolferProfile, NewAccount } from './types'
import { MOCK_PROFILE, applyNewAccount } from './data'

/*
 * Golfer logins on both prototypes: the demo golfer, plus anyone who signs up in this browser. A real backend owns
 * these. Here they're saved to localStorage so a new account can sign out and back in; the signed-in golfer's
 * details are loaded into MOCK_PROFILE, which every golfer screen reads.
 */

interface SavedGolfer { password: string; profile: GolferProfile }

const STORAGE_KEY = 'gtp-golfers-v1'
/** This tab's golfer, so a reload keeps them */
const SESSION_KEY = 'gtp-session-golfer'
const emailKey = (email?: string) => email?.trim().toLowerCase() ?? ''
const DEMO_EMAIL = emailKey(MOCK_PROFILE.email)
const DEMO_PASSWORD = 'golfer'
const DEMO_PROFILE: GolferProfile = { ...MOCK_PROFILE }

/** The golfer signed in right now, if any (a marshal or organiser login has none) */
let current: string | null = null

function read(): Record<string, SavedGolfer> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}

function write(golfers: Record<string, SavedGolfer>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(golfers)) } catch { /* private mode: session only */ }
}

function setCurrent(key: string | null) {
  current = key
  try {
    if (key) sessionStorage.setItem(SESSION_KEY, key)
    else sessionStorage.removeItem(SESSION_KEY)
  } catch { /* private mode: sign-in lasts until reload */ }
}

export const golferPassword = (email: string): string | undefined =>
  read()[emailKey(email)]?.password ?? (emailKey(email) === DEMO_EMAIL ? DEMO_PASSWORD : undefined)

export function setGolferPassword(email: string, password: string) {
  const key = emailKey(email)
  const golfers = read()
  const profile = golfers[key]?.profile ?? (key === DEMO_EMAIL ? DEMO_PROFILE : undefined)
  if (!profile) return
  golfers[key] = { password, profile }
  write(golfers)
}

/** Sign-up finished: the account exists from now on, and this golfer is signed in */
export function registerGolfer(password: string, account: NewAccount) {
  applyNewAccount(account)
  setCurrent(emailKey(account.email))
  write({ ...read(), [emailKey(account.email)]: { password, profile: { ...MOCK_PROFILE } } })
}

/** Sign-in: everything the golfer screens read now belongs to this golfer */
export function becomeGolfer(email: string) {
  const key = emailKey(email)
  const profile = read()[key]?.profile ?? (key === DEMO_EMAIL ? DEMO_PROFILE : undefined)
  if (!profile) return
  const target = MOCK_PROFILE as unknown as Record<string, unknown>
  Object.keys(target).forEach(k => delete target[k])
  Object.assign(MOCK_PROFILE, profile)
  setCurrent(key)
}

/** After a reload: the golfer this tab had signed in, if any */
export function restoreGolfer() {
  try {
    const key = sessionStorage.getItem(SESSION_KEY)
    if (key) becomeGolfer(key)
  } catch { /* private mode: nothing to restore */ }
}

/** Keeps profile edits. A changed email becomes the golfer's login. */
export function rememberGolfer() {
  if (!current) return
  const golfers = read()
  const password = golferPassword(current) ?? ''
  const to = emailKey(MOCK_PROFILE.email)
  if (to !== current) delete golfers[current]
  golfers[to] = { password, profile: { ...MOCK_PROFILE } }
  write(golfers)
  setCurrent(to)
}

export function signOutGolfer() {
  rememberGolfer()
  setCurrent(null)
}
