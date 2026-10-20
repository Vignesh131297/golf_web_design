import { useState, type FormEvent } from 'react'
import { Button, Input, PasswordInput, PhoneInput } from '../components'
import { AuthLayout } from '../shell'
import { useApp, type AccountType } from '../app-context'
import { getUsers } from '../admin/access'
import { isBlockedPassword, nameError } from '../account-rules'

type Errors = Partial<Record<'firstName' | 'lastName' | 'email' | 'phone' | 'password' | 'confirm' | 'terms', string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function passwordStrength(pw: string) {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score // 0–4
}

const STRENGTH_LABEL = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
const STRENGTH_BAR   = ['bg-rose-400', 'bg-rose-400', 'bg-amber-400', 'bg-lime-500', 'bg-lime-500']

/* ───────── Step 1: golfer or organizer ───────── */

const ACCOUNT_TYPES: { value: AccountType; title: string; body: string; points: string[] }[] = [
  {
    value: 'golfer',
    title: 'Golfer',
    body: 'Find and enter tournaments, and keep your golfer profile in one place.',
    points: ['Browse and register for events', 'Handicap, tee and player-pack details'],
  },
  {
    value: 'organizer',
    title: 'Organizer',
    body: 'Create and manage tournaments for your club, company or charity.',
    points: ['Publish events once approved', 'Invite your team and set their permissions'],
  },
]

function AccountTypeStep({ value, onChange, onContinue }: {
  value: AccountType | null
  onChange: (t: AccountType) => void
  onContinue: () => void
}) {
  return (
    <>
      <p className="text-[13px] font-bold font-display text-gray-500">Step 1 of 3 · Account type</p>
      <h2 className="font-display font-extrabold text-ink text-[32px] leading-tight tracking-tight mt-1">How will you use the platform?</h2>
      <div role="radiogroup" aria-label="Account type" className="grid gap-3 mt-8">
        {ACCOUNT_TYPES.map(t => {
          const on = value === t.value
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(t.value)}
              className={`text-left rounded-3xl p-5 transition-all ${on ? 'bg-ink text-white shadow-float' : 'bg-white shadow-card hover:-translate-y-0.5'}`}
            >
              <div className="flex items-start gap-4">
                <span className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${on ? 'bg-lime-400 text-ink' : 'bg-canvas text-ink'}`}>
                  {t.value === 'golfer' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M7 3h10v6a5 5 0 01-10 0V3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M7 6H4a2 2 0 000 4h3M17 6h3a2 2 0 010 4h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-display font-bold text-[18px] tracking-tight">{t.title}</span>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${on ? 'bg-lime-400' : 'border-2 border-black/15'}`}>
                      {on && <span className="w-2 h-2 rounded-full bg-ink" />}
                    </span>
                  </span>
                  <span className={`block text-[14px] mt-1 leading-relaxed ${on ? 'text-white/65' : 'text-gray-500'}`}>{t.body}</span>
                  <span className="flex flex-wrap gap-1.5 mt-3">
                    {t.points.map(p => (
                      <span key={p} className={`h-6 px-2.5 rounded-full text-[11px] font-semibold font-display inline-flex items-center ${on ? 'bg-white/10 text-white/80' : 'bg-canvas text-gray-600'}`}>{p}</span>
                    ))}
                  </span>
                </span>
              </div>
            </button>
          )
        })}
      </div>
      <Button fullWidth size="lg" className="mt-6" disabled={!value} onClick={onContinue}>Continue</Button>
    </>
  )
}

/* ───────── Step 2: login details ───────── */

export default function SignUp() {
  const { startSetup, basics } = useApp()
  const [accountType, setAccountType] = useState<AccountType | null>(basics?.accountType ?? null)
  const [typeChosen, setTypeChosen]   = useState(false)
  const isOrganizer = accountType === 'organizer'

  const [firstName, setFirstName] = useState(basics?.firstName ?? basics?.fullName.split(/\s+/)[0] ?? '')
  const [lastName, setLastName]   = useState(basics?.lastName ?? basics?.fullName.split(/\s+/).slice(1).join(' ') ?? '')
  const [jobTitle, setJobTitle]   = useState(basics?.jobTitle ?? '')
  const [terms, setTerms]         = useState(false)
  const [marketing, setMarketing] = useState(basics?.marketingOptIn ?? false)
  const [email, setEmail]       = useState(basics?.email ?? '')
  const [phone, setPhone]       = useState(basics?.phone ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [errors, setErrors]     = useState<Errors>({})
  const [loading, setLoading]   = useState(false)

  function validate(): Errors {
    const e: Errors = {}
    const fe = nameError(firstName, 'first'); if (fe) e.firstName = fe
    const le = nameError(lastName, 'last'); if (le) e.lastName = le
    if (!email.trim()) e.email = 'Email is required'
    else if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email address'
    else if (isOrganizer && getUsers().some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
      e.email = 'An account with this email already exists. Sign in instead.'
    }
    if (phone.replace(/\D/g, '').length < 7) e.phone = 'Enter a valid phone number'
    if (password.length < 8) e.password = 'Use at least 8 characters'
    else if (isBlockedPassword(password)) e.password = 'This password is too common — choose another'
    if (!terms) e.terms = 'Please agree to the Terms of Service and Privacy Policy'
    if (!confirm) e.confirm = 'Please confirm your password'
    else if (confirm !== password) e.confirm = "Passwords don't match"
    return e
  }

  const clear = (f: keyof Errors) => { if (errors[f]) setErrors(x => ({ ...x, [f]: undefined })) }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      startSetup({
        fullName: `${firstName.trim()} ${lastName.trim()}`, firstName: firstName.trim(), lastName: lastName.trim(),
        email: email.trim(), phone: phone.trim(), password, accountType: accountType ?? 'golfer',
        jobTitle: isOrganizer ? jobTitle.trim() || undefined : undefined, marketingOptIn: marketing,
      })
    }, 1000)
  }

  const strength = passwordStrength(password)

  const hero = isOrganizer
    ? { headline: <>Run your<br /><span className="text-lime-400">tournaments.</span></>, sub: 'Register your club or company, get approved, and publish events golfers can enter.' }
    : { headline: <>Join the<br /><span className="text-lime-400">clubhouse.</span></>, sub: 'Create your account to enter tournaments, track results and manage your golfer profile.' }

  if (!typeChosen) {
    return (
      <AuthLayout headline={hero.headline} sub={hero.sub}>
        <AccountTypeStep value={accountType} onChange={setAccountType} onContinue={() => setTypeChosen(true)} />
        <p className="text-center text-sm text-gray-500 mt-7">
          Already have an account?{' '}
          <a href="#/signin" className="text-ink font-semibold font-display underline underline-offset-4 decoration-lime-500 decoration-2 hover:opacity-70">
            Sign in
          </a>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout headline={hero.headline} sub={hero.sub}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-bold font-display text-gray-500">
          Step 2 of 3 · {isOrganizer ? 'Your organiser login' : 'Your login details'}
        </p>
        <button type="button" onClick={() => setTypeChosen(false)} className="text-[13px] font-semibold font-display text-gray-500 hover:text-ink">
          {isOrganizer ? 'Organizer' : 'Golfer'} · Change
        </button>
      </div>
      <h2 className="font-display font-extrabold text-ink text-[32px] tracking-tight mt-1">
        {isOrganizer ? 'Create organiser account' : 'Create account'}
      </h2>
      {isOrganizer && (
        <p className="text-gray-500 text-[14px] mt-1">This is your personal login. You'll add your organisation's details next.</p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8" noValidate>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="First name" placeholder="Alexander" value={firstName} autoComplete="given-name" onCanvas
            onChange={e => { setFirstName(e.target.value); clear('firstName') }} error={errors.firstName} />
          <Input label="Last name" placeholder="Hartwell" value={lastName} autoComplete="family-name" onCanvas
            onChange={e => { setLastName(e.target.value); clear('lastName') }} error={errors.lastName} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label={isOrganizer ? 'Work email' : 'Email address'}
            type="email"
            placeholder={isOrganizer ? 'you@yourclub.com' : 'you@example.com'}
            value={email}
            onChange={e => { setEmail(e.target.value); clear('email') }}
            error={errors.email}
            autoComplete="email"
            onCanvas
          />
          <PhoneInput
            label={isOrganizer ? 'Mobile phone' : 'Phone number'}
            value={phone}
            onChange={v => { setPhone(v); clear('phone') }}
            error={errors.phone}
            autoComplete="tel"
            onCanvas
          />
        </div>

        {isOrganizer && (
          <Input label="Your role in the organisation (optional)" placeholder="e.g. Tournament Director, Club Manager" value={jobTitle}
            onChange={e => setJobTitle(e.target.value)} onCanvas />
        )}

        <div className="flex flex-col gap-2">
          <PasswordInput
            label="Password"
            placeholder="At least 8 characters (12+ is better)"
            value={password}
            onChange={e => { setPassword(e.target.value); clear('password') }}
            error={errors.password}
            autoComplete="new-password"
            onCanvas
          />
          {password && !errors.password && (
            <div className="flex items-center gap-3">
              <div className="flex-1 flex gap-1">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full ${i < strength ? STRENGTH_BAR[strength] : 'bg-black/[0.08]'}`} />
                ))}
              </div>
              <span className="text-[11px] font-semibold text-gray-500 w-16 text-right">{STRENGTH_LABEL[strength]}</span>
            </div>
          )}
        </div>

        <PasswordInput
          label="Confirm password"
          placeholder="Re-enter your password"
          value={confirm}
          onChange={e => { setConfirm(e.target.value); clear('confirm') }}
          error={errors.confirm}
          autoComplete="new-password"
          onCanvas
        />

        <div className="space-y-3 mt-1">
          <label className={`flex items-start gap-3 rounded-2xl px-4 py-3 cursor-pointer ${errors.terms ? 'bg-rose-50 ring-1 ring-rose-200' : 'bg-white shadow-card'}`}>
            <input type="checkbox" checked={terms} onChange={e => { setTerms(e.target.checked); clear('terms') }} className="mt-0.5 w-4 h-4 accent-[#0c1a12]" />
            <span className="text-[13px] text-gray-600 leading-relaxed">
              I agree to the <span className="font-semibold text-ink">Terms of Service</span> and <span className="font-semibold text-ink">Privacy Policy</span>
              {errors.terms && <span className="block text-rose-600 text-[12px] font-semibold mt-0.5" role="alert">{errors.terms}</span>}
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-2xl px-4 py-3 cursor-pointer bg-white shadow-card">
            <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#0c1a12]" />
            <span className="text-[13px] text-gray-600 leading-relaxed">
              {isOrganizer ? 'Send me product news and updates from Golf Tournament Platform' : 'Send me news about tournaments and offers from Golf Tournament Platform'}
              <span className="block text-[11px] text-gray-400">Optional · unsubscribe any time</span>
            </span>
          </label>
        </div>

        <Button type="submit" fullWidth size="lg" loading={loading} className="mt-2">
          {loading ? 'Creating account…' : 'Continue'}
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-7">
        Already have an account?{' '}
        <a href="#/signin" className="text-ink font-semibold font-display underline underline-offset-4 decoration-lime-500 decoration-2 hover:opacity-70">
          Sign in
        </a>
      </p>

    </AuthLayout>
  )
}
