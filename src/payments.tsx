import { useState, type FormEvent } from 'react'
import { Button, Input } from './components'
import { formatMoney } from './golf'
import { couponExpiry, issueCoupon, type Coupon } from './rewards'
import { Modal } from './ops-ui'

/*
 * Entry-fee checkout. The client wants online payment as early as possible; the team chose Stripe
 * (it covers most countries and card networks; Interac support still to confirm). In production
 * these fields are Stripe Elements, so card details never touch our servers.
 */

const digits = (v: string) => v.replace(/\D/g, '')
const cardFormat = (v: string) => digits(v).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ')
const expiryFormat = (v: string) => { const d = digits(v).slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d }

export function PaymentSheet({ title, lines, total, currency, onPaid, onClose }: {
  title: string
  lines: [string, string][]
  total: number
  currency: string
  onPaid: () => void
  onClose: () => void
}) {
  const [card, setCard] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [coupon, setCoupon] = useState<Coupon | null>(null)
  const [state, setState] = useState<'idle' | 'paying' | 'declined'>('idle')

  function pay(e?: FormEvent) {
    e?.preventDefault()
    if (digits(card).length < 15) return setError('Enter the full card number')
    if (digits(expiry).length < 4) return setError('Enter the expiry date')
    if (digits(cvc).length < 3) return setError('Enter the security code')
    if (!name.trim()) return setError('Enter the name on the card')
    setError('')
    setState('paying')
    // Stripe test cards: 4000 0000 0000 0002 is declined; anything else succeeds in the prototype
    setTimeout(() => {
      if (digits(card) === '4000000000000002') return setState('declined')
      onPaid()
      // Every payment earns a Golaf.ca discount (client, 21 Oct call)
      setCoupon(issueCoupon(title))
      setState('idle')
    }, 1300)
  }

  if (coupon) {
    return (
      <Modal title="Payment complete" subtitle={`${formatMoney(total, currency)} paid — your receipt is on its way by email.`} onClose={onClose}
        footer={<Button fullWidth onClick={onClose}>Done</Button>}>
        <p className="text-[14px] text-ink font-semibold">Thanks for entering! Here’s a reward from our golf shop:</p>
        <CouponCard coupon={coupon} />
        <p className="text-[12px] text-gray-400">You’ll also find this code on your profile.</p>
      </Modal>
    )
  }

  return (
    <Modal title={title} subtitle="Secure payment by Stripe. You’ll get a receipt by email." onClose={onClose}
      footer={<>
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        <Button fullWidth loading={state === 'paying'} onClick={() => pay()}>{state === 'paying' ? 'Paying…' : `Pay ${formatMoney(total, currency)}`}</Button>
      </>}>
      <div className="rounded-2xl bg-canvas px-4 py-3 space-y-1.5">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between text-[13px]"><span className="text-gray-500">{label}</span><span className="font-semibold text-ink">{value}</span></div>
        ))}
        <div className="flex justify-between pt-2 border-t border-black/[0.06] text-[15px]"><span className="font-bold text-ink">Total</span><span className="font-display font-extrabold text-ink">{formatMoney(total, currency)}</span></div>
      </div>
      {state === 'declined' && <p className="rounded-2xl bg-rose-50 text-rose-700 text-[13px] font-semibold px-4 py-3">Your card was declined. Try another card — nothing was charged.</p>}
      <form onSubmit={pay} className="space-y-3" noValidate>
        <Input label="Card number" inputMode="numeric" autoComplete="cc-number" placeholder="1234 1234 1234 1234" value={card} onChange={e => setCard(cardFormat(e.target.value))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="MM / YY" value={expiry} onChange={e => setExpiry(expiryFormat(e.target.value))} />
          <Input label="Security code" inputMode="numeric" autoComplete="cc-csc" placeholder="CVC" value={cvc} onChange={e => setCvc(digits(e.target.value).slice(0, 4))} />
        </div>
        <Input label="Name on card" autoComplete="cc-name" value={name} error={error} onChange={e => setName(e.target.value)} />
        <button type="submit" hidden />
      </form>
      <p className="text-[11px] text-gray-400 leading-relaxed">Prototype: no real payment is taken. Stripe test card 4242 4242 4242 4242 succeeds; 4000 0000 0000 0002 is declined.</p>
    </Modal>
  )
}

/** The Golaf.ca reward a payment earns, shown right after paying and on the profile */
export function CouponCard({ coupon }: { coupon: Coupon }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(coupon.code); setCopied(true) } catch { setCopied(false) }
  }
  return (
    <div className="rounded-2xl bg-ink text-white p-4 relative overflow-hidden">
      <p className="text-lime-400 text-[11px] font-bold font-display uppercase tracking-wider">{coupon.percent}% off at {coupon.shop}</p>
      <p className="text-[13px] text-white/70 mt-1">On any golf purchase until {couponExpiry(coupon)}. Enter the code at checkout.</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="flex-1 h-11 rounded-xl border border-dashed border-white/40 flex items-center justify-center font-display font-extrabold tracking-[0.12em] text-[17px] select-all">{coupon.code}</span>
        <button type="button" onClick={copy} className="h-11 px-3.5 rounded-xl bg-lime-400 text-ink text-[12px] font-bold font-display">{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      <a href={coupon.shopUrl} target="_blank" rel="noreferrer" className="inline-block mt-3 text-[12px] font-bold font-display text-lime-400 underline underline-offset-4">Shop at {coupon.shop} ↗</a>
    </div>
  )
}
