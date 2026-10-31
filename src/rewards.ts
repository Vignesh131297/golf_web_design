/*
 * Shop rewards (client, 21 Oct call): every payment in the app earns a 5% discount at Golaf.ca, the
 * client's golf shop, valid for 30 days. The shop checks the code at its checkout — that link is built
 * later; here we issue and keep the codes. Shared verbatim between the web and mobile prototypes.
 */

export interface Coupon {
  code: string
  percent: number
  shop: string
  shopUrl: string
  /** "YYYY-MM-DD" */
  validUntil: string
  /** What the golfer paid for */
  earnedFor: string
}

export const REWARD_PERCENT = 5
export const REWARD_DAYS = 30
const SHOP = { name: 'Golaf.ca', url: 'https://golaf.ca' }
const STORAGE_KEY = 'gtp-rewards-v1'

let coupons: Coupon[] = []
try { coupons = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { coupons = [] }

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(coupons)) } catch { /* private mode: session only */ }
}

/** A new single-use code for one payment */
export function issueCoupon(earnedFor: string): Coupon {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const code = `GOLAF5-${Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * letters.length)]).join('')}`
  const until = new Date()
  until.setDate(until.getDate() + REWARD_DAYS)
  const coupon: Coupon = { code, percent: REWARD_PERCENT, shop: SHOP.name, shopUrl: SHOP.url, validUntil: until.toISOString().slice(0, 10), earnedFor }
  coupons.unshift(coupon)
  save()
  return coupon
}

/** Codes that haven't expired yet, newest first */
export const activeCoupons = () => coupons.filter(c => c.validUntil >= new Date().toISOString().slice(0, 10))

export function resetRewards() {
  coupons = []
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

export const couponExpiry = (c: Coupon) =>
  new Date(`${c.validUntil}T00:00:00`).toLocaleDateString('en-CA', { day: 'numeric', month: 'short', year: 'numeric' })
