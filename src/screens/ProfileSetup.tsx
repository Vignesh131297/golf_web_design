import { useState, type ReactNode } from 'react'
import { IdentityUpload, settledId, type IdCheck } from '../verification'
import { Button, Input, SelectField, ChoiceChips, PhoneInput, fieldClass } from '../components'
import { Wordmark } from '../shell'
import { useApp } from '../app-context'
import { navigate } from '../router'
import { MOCK_COURSES } from '../data'
import {
  COUNTRIES, GENDERS, ISSUING_BODIES, RELATIONSHIPS, CONTACT_METHODS, DIETARY, TEE_OPTIONS, JUNIOR_UNDER,
  SHIRT_SIZES, GLOVE_SIZES, GLOVE_HANDS,
  emptyGolferDraft, validateGolferStep, needsRatingsChoice, toggleDietary, toNewAccount, ageOn,
  type GolferDraft, type GolferStep, type Errors,
} from '../account-rules'

/*
 * Golfer sign-up, after the account step on Sign up:
 * verify email → about you → your game → preferences. Spec: Docs/REGISTER GOLFER.txt.
 */

const STEPS: { key: 'verify' | GolferStep; title: string; subtitle: string }[] = [
  { key: 'verify', title: 'Verify your email', subtitle: 'So we can reach you about your tournaments' },
  { key: 'about', title: 'About you', subtitle: 'Personal details and who to contact in an emergency' },
  { key: 'game', title: 'Your game', subtitle: 'Handicap and where you usually play' },
  { key: 'prefs', title: 'Preferences', subtitle: 'How organisers contact you, your player pack and catering' },
]

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-3xl shadow-card p-6">
      <h3 className="text-[17px] text-ink font-bold font-display tracking-tight">{title}</h3>
      {hint && <p className="text-[13px] text-gray-500 mt-0.5">{hint}</p>}
      <div className="space-y-5 mt-4">{children}</div>
    </section>
  )
}

/** Large two-option choice (Yes / Not yet, Member / Guest) */
function Pick<T extends string>({ value, onChange, options, error }: { value: T | ''; onChange: (v: T) => void; options: { value: T; title: string; body: string }[]; error?: string }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5" role="radiogroup">
        {options.map(o => {
          const on = value === o.value
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
              className={`text-left rounded-2xl p-4 transition-all ${on ? 'bg-ink text-white' : `bg-canvas text-ink hover:bg-gray-200/70 ${error ? 'ring-1 ring-red-300' : ''}`}`}>
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-[15px] tracking-tight">{o.title}</span>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center ${on ? 'bg-lime-400' : 'border-2 border-black/15'}`}>{on && <span className="w-2 h-2 rounded-full bg-ink" />}</span>
              </div>
              <p className={`text-[12px] mt-1.5 leading-snug ${on ? 'text-white/60' : 'text-gray-500'}`}>{o.body}</p>
            </button>
          )
        })}
      </div>
      {error && <p className="text-xs text-red-500 font-medium mt-1.5">{error}</p>}
    </div>
  )
}

export default function ProfileSetup() {
  const { basics, completeSetup, showToast } = useApp()
  const [step, setStep]       = useState(0)
  const [errors, setErrors]   = useState<Errors>({})
  const [saving, setSaving]   = useState(false)
  const [verified, setVerified] = useState(false)
  const [d, setD]             = useState<GolferDraft>(emptyGolferDraft)
  const [idCheck, setIdCheck] = useState<IdCheck | undefined>()

  // Setup only makes sense after the account step of sign-up
  if (!basics) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-display font-extrabold text-ink text-[28px] tracking-tight">Start by creating your account</h1>
        <p className="text-gray-500">Your golfer profile is set up right after sign-up.</p>
        <Button onClick={() => navigate('/signup', { replace: true })}>Go to sign up</Button>
      </div>
    )
  }

  const set = <K extends keyof GolferDraft>(k: K, v: GolferDraft[K]) => {
    setD(cur => ({ ...cur, [k]: v }))
    if (errors[k]) setErrors(x => ({ ...x, [k]: undefined }))
  }
  const key = STEPS[step].key
  const isLast = step === STEPS.length - 1
  const age = d.dob ? ageOn(d.dob) : undefined

  function next() {
    if (key !== 'verify') {
      const errs = validateGolferStep(key, d)
      setErrors(errs)
      if (Object.values(errs).some(Boolean)) {
        requestAnimationFrame(() => document.querySelector('.text-red-500')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
        return
      }
    }
    if (!isLast) { setStep(step + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setSaving(true)
    setTimeout(() => completeSetup({ ...toNewAccount(basics!, d, verified), idCheck: settledId(idCheck) }), 1200)
  }

  function back() {
    setErrors({})
    if (step === 0) navigate('/signup')
    else setStep(step - 1)
  }

  const firstName = basics.firstName ?? basics.fullName.split(/\s+/)[0]

  return (
    <div className="min-h-screen bg-canvas">
      <header className="h-20 px-6 lg:px-10 flex items-center justify-between max-w-[1180px] mx-auto">
        <Wordmark />
        <span className="text-[13px] font-bold font-display text-gray-500">Step 3 of 3 · Golfer profile</span>
      </header>

      <div className="max-w-[1180px] mx-auto px-6 lg:px-10 pb-16 grid lg:grid-cols-[300px_minmax(0,1fr)] gap-8 lg:gap-12">
        {/* Stepper */}
        <aside className="lg:sticky lg:top-6 self-start">
          <div className="bg-ink rounded-[28px] p-6 relative overflow-hidden">
            <div className="absolute -right-12 -top-16 w-48 h-48 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(200,236,90,0.25) 0%, rgba(200,236,90,0) 70%)' }} />
            <p className="relative text-white/55 text-[13px] font-medium">Welcome, {firstName} 👋</p>
            <h1 className="relative font-display font-extrabold text-white text-[24px] leading-tight tracking-tight mt-1">Set up your golfer profile</h1>
            <ol className="relative mt-6 space-y-2">
              {STEPS.map((s, i) => {
                const done = i < step
                const current = i === step
                return (
                  <li key={s.key}>
                    <button type="button" disabled={i > step} onClick={() => { setErrors({}); setStep(i) }}
                      className={`w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${current ? 'bg-white/[0.08]' : done ? 'hover:bg-white/[0.05]' : 'opacity-50 cursor-default'}`}>
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold font-display flex-shrink-0 ${done ? 'bg-lime-400 text-ink' : current ? 'bg-white text-ink' : 'bg-white/10 text-white/70'}`}>
                        {done ? (s.key === 'verify' && !verified ? '!' : '✓') : i + 1}
                      </span>
                      <span>
                        <span className="block text-white text-[14px] font-bold font-display tracking-tight">{s.title}</span>
                        <span className="block text-white/45 text-[12px] leading-snug">{s.key === 'verify' && done ? (verified ? 'Verified' : 'Not verified yet') : s.subtitle}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
            <p className="relative mt-6 text-white/45 text-[12px] leading-relaxed">You can't reach Home until your profile is set up. Your email, phone, date of birth and address are never shown to other golfers.</p>
          </div>
        </aside>

        {/* Form */}
        <div key={step} className="page-in">
          <div className="flex gap-1.5 mb-6 lg:hidden">
            {STEPS.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-lime-500' : 'bg-black/[0.08]'}`} />)}
          </div>
          <h2 className="font-display font-extrabold text-ink text-[32px] tracking-tight">{STEPS[step].title}</h2>
          <p className="text-gray-500 mt-1 mb-7">{STEPS[step].subtitle}</p>

          <div className="space-y-5">
            {key === 'verify' && (
              <Section title={verified ? 'Email verified' : 'Check your inbox'}>
                {verified ? (
                  <div className="flex items-center gap-3 bg-lime-300/40 rounded-2xl px-4 py-3">
                    <span className="w-8 h-8 rounded-full bg-ink text-lime-400 flex items-center justify-center font-bold">✓</span>
                    <p className="text-[14px] text-ink"><span className="font-semibold">{basics.email}</span> is verified.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[14px] text-gray-600 leading-relaxed">
                      We sent a verification link to <span className="font-semibold text-ink">{basics.email}</span>. It expires after 24 hours.
                      You can set up your profile first, but you'll need to verify before registering for a tournament.
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      <Button onClick={() => { setVerified(true); showToast('Email verified') }}>Open verification link (demo)</Button>
                      <Button variant="secondary" onClick={() => showToast(`Link sent again to ${basics.email}`, 'info')}>Resend link</Button>
                    </div>
                  </>
                )}
              </Section>
            )}

            {key === 'about' && (
              <>
                <Section title="Personal details">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="dob" className="text-[13px] font-semibold text-gray-600 font-display">Date of birth *</label>
                      <input id="dob" type="date" value={d.dob} onChange={e => set('dob', e.target.value)} max={new Date().toISOString().split('T')[0]}
                        className={`${fieldClass(!!errors.dob)} ${d.dob ? '' : 'text-gray-400'}`} />
                      {errors.dob ? <p className="text-xs text-red-500 font-medium">{errors.dob}</p>
                        : age !== undefined && age < JUNIOR_UNDER && age >= 13 && <p className="text-[12px] text-pine-600 font-semibold">You'll be registered as a Junior</p>}
                    </div>
                  </div>
                  <ChoiceChips label="Gender *" options={GENDERS} value={d.gender} onChange={v => { set('gender', v as string); if (!needsRatingsChoice(v as string)) set('ratingsGender', '') }} error={errors.gender} />
                  {needsRatingsChoice(d.gender) && (
                    <div>
                      <ChoiceChips label="Handicap ratings to use *" options={[{ value: 'men', label: "Men's ratings" }, { value: 'women', label: "Women's ratings" }]}
                        value={d.ratingsGender} onChange={v => set('ratingsGender', v as 'men' | 'women')} error={errors.ratingsGender}
                        hint="Course handicaps are calculated from the men's or women's tee ratings" />
                    </div>
                  )}
                </Section>
                <Section title="Address" hint="Postal code and country are required; the rest is optional">
                  <Input label="Street address" placeholder="Optional" value={d.street} onChange={e => set('street', e.target.value)} autoComplete="street-address" />
                  <div className="grid sm:grid-cols-2 gap-5">
                    <Input label="City" value={d.city} onChange={e => set('city', e.target.value)} autoComplete="address-level2" />
                    <Input label="Province / state" value={d.region} onChange={e => set('region', e.target.value)} autoComplete="address-level1" />
                    <Input label="Postal / ZIP code *" value={d.postalCode} onChange={e => set('postalCode', e.target.value.toUpperCase())} error={errors.postalCode} autoComplete="postal-code" />
                    <SelectField label="Country *" value={d.country} onChange={v => { set('country', v); setErrors(x => ({ ...x, postalCode: undefined })) }} options={COUNTRIES} error={errors.country} />
                  </div>
                </Section>
                <Section title="Emergency contact">
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    <Input label="Name *" placeholder="Full name" value={d.ecName} onChange={e => set('ecName', e.target.value)} error={errors.ecName} autoComplete="off" />
                    <PhoneInput label="Phone *" value={d.ecPhone} onChange={v => set('ecPhone', v)} error={errors.ecPhone} preferCountry={d.country} autoComplete="off" />
                    <SelectField label="Relationship" placeholder="Optional" value={d.ecRelationship} onChange={v => set('ecRelationship', v)} options={RELATIONSHIPS} />
                  </div>
                </Section>
              </>
            )}

            {key === 'game' && (
              <>
                <Section title="Handicap">
                  <p className="text-[13px] font-semibold text-gray-600 font-display -mb-3">Do you have a Handicap Index? *</p>
                  <Pick value={d.hasHandicap} onChange={v => set('hasHandicap', v)} error={errors.hasHandicap} options={[
                    { value: 'yes', title: 'Yes', body: 'From Golf Canada, USGA or another body' },
                    { value: 'not-yet', title: 'Not yet', body: 'Some tournaments need one — add it later' },
                  ]} />
                  {d.hasHandicap === 'yes' && (
                    <div className="grid sm:grid-cols-3 gap-5">
                      <Input label="Handicap Index *" placeholder="e.g. 12.4 or +2.0" value={d.handicap} onChange={e => set('handicap', e.target.value)} error={errors.handicap}
                        hint="Plus handicaps start with +" inputMode="decimal" />
                      <SelectField label="Issuing body *" placeholder="Select" value={d.body} onChange={v => set('body', v)} options={ISSUING_BODIES} error={errors.body} />
                      <Input label="Member / handicap number" placeholder="Optional" value={d.memberNo} onChange={e => set('memberNo', e.target.value)} />
                    </div>
                  )}
                  {d.hasHandicap === 'not-yet' && (
                    <p className="text-sm text-gray-500 bg-canvas rounded-2xl px-4 py-3 leading-relaxed">No problem — add it from your profile once you have one. Tournaments that require an official handicap will tell you before you register.</p>
                  )}
                  {d.hasHandicap === 'yes' && <p className="text-[12px] text-gray-500">You can update your index before each tournament. It's locked a week before the tournament starts, and the organiser can adjust it.</p>}
                </Section>
                <Section title="Where you play">
                  <Input label="Home club / home course" placeholder="Optional — start typing" value={d.homeClub} onChange={e => set('homeClub', e.target.value)} list="home-courses" />
                  <datalist id="home-courses">{MOCK_COURSES.filter(c => (c.lifecycle ?? 'active') === 'active').map(c => <option key={c.id} value={c.name} />)}</datalist>
                  <div>
                    <p className="text-[13px] font-semibold text-gray-600 font-display mb-1.5">Club membership</p>
                    <Pick value={d.membership} onChange={v => set('membership', v)} options={[
                      { value: 'Member', title: 'Member', body: 'I belong to a participating club' },
                      { value: 'Guest', title: 'Guest', body: 'Playing as a visitor' },
                    ]} />
                  </div>
                  <ChoiceChips label="Preferred tee" options={TEE_OPTIONS} value={d.tee} onChange={v => set('tee', v as string)}
                    hint="Optional — a preference only; each tournament sets the tees" />
                </Section>
              </>
            )}

            {key === 'prefs' && (
              <>
                <Section title="Contact">
                  <ChoiceChips label="Preferred contact method *" options={[...CONTACT_METHODS]} value={d.contact}
                    onChange={v => set('contact', v as GolferDraft['contact'])} error={errors.contact} hint="How organisers reach you about your tournaments" />
                </Section>
<Section title="Player pack" hint="Optional · sizes for the tournament shirt and glove">
                  <ChoiceChips label="Shirt / apparel size" options={SHIRT_SIZES} value={d.shirt} onChange={v => set('shirt', d.shirt === v ? '' : v as string)} />
                  <ChoiceChips label="Glove size" options={GLOVE_SIZES} value={d.glove} onChange={v => set('glove', d.glove === v ? '' : v as string)} />
                  <ChoiceChips label="Glove hand" options={GLOVE_HANDS} value={d.gloveHand} onChange={v => set('gloveHand', d.gloveHand === v ? '' : v as GolferDraft['gloveHand'])}
                    hint="Right-handed golfers usually wear a left-hand glove" />
                </Section>
                <Section title="Identity" hint="Optional · get the verified tick">
                  <IdentityUpload value={idCheck} onChange={setIdCheck} />
                </Section>
                <Section title="Catering" hint="Optional">
                  <ChoiceChips label="Dietary requirements" options={DIETARY} value={d.dietary}
                    onChange={v => set('dietary', toggleDietary(d.dietary, v as string[]))} error={errors.dietary} hint="Select all that apply" />
                  <Input label="Anything else?" placeholder="Allergies or other requirements" value={d.dietaryNote} onChange={e => set('dietaryNote', e.target.value)} />
                </Section>
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 mt-8">
            <Button variant="secondary" onClick={back}>Back</Button>
            <Button onClick={next} loading={saving} className="min-w-[200px]">
              {saving ? 'Setting up your profile…' : isLast ? 'Finish setup' : key === 'verify' && !verified ? 'Verify later' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
