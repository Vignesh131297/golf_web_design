import { useState, type ReactNode } from 'react'
import { Button, Input, SelectField, ChoiceChips, PhoneInput } from '../components'
import { Wordmark } from '../shell'
import { useApp } from '../app-context'
import { navigate } from '../router'
import { MOCK_COURSES } from '../data'
import { ORG_TYPES, EVENTS_PER_YEAR, FIELD_SIZES, registerOrganizer, type OrgType } from '../admin/access'
import { COUNTRIES, postalCodeError } from '../account-rules'
import { Textarea } from '../admin/forms'

/*
 * Organiser sign-up, steps 2–3 (after the login step on Sign up):
 * organisation details → review & submit. Spec: Docs/REGISTER ORGANIZER.txt.
 */

const NO_COURSE = '__none'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URLISH = /^[\w-]+(\.[\w-]+)+(\/.*)?$/i

const STEPS = [
  { title: 'Organisation details', subtitle: 'Who you are and how golfers and our team can reach you' },
  { title: 'Review & submit', subtitle: 'Check your details before sending them for approval' },
]

function Section({ id, title, hint, children }: { id?: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} className="bg-white rounded-3xl shadow-card p-6 scroll-mt-6">
      <h3 className="text-[17px] text-ink font-bold font-display tracking-tight">{title}</h3>
      {hint && <p className="text-[13px] text-gray-500 mt-0.5">{hint}</p>}
      <div className="space-y-5 mt-4">{children}</div>
    </section>
  )
}

function ReviewCard({ title, rows, onEdit }: { title: string; rows: [string, string | undefined][]; onEdit?: () => void }) {
  return (
    <section className="bg-white rounded-3xl shadow-card p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[17px] text-ink font-bold font-display tracking-tight">{title}</h3>
        {onEdit && <button type="button" onClick={onEdit} className="h-8 px-3.5 rounded-full bg-canvas text-[12px] font-bold font-display text-ink hover:bg-gray-200">Edit</button>}
      </div>
      <dl className="divide-y divide-black/[0.05]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-6 py-3">
            <dt className="text-[14px] text-gray-500">{label}</dt>
            <dd className="text-[14px] font-semibold text-ink text-right">{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default function OrganizerSetup() {
  const { basics, completeOrganizerSetup } = useApp()
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [name, setName]         = useState('')
  const [type, setType]         = useState<OrgType | ''>('')
  const [about, setAbout]       = useState('')
  const [logo, setLogo]         = useState('')
  const [email, setEmail]       = useState(basics?.email ?? '')
  const [phone, setPhone]       = useState(basics?.phone ?? '')
  const [website, setWebsite]   = useState('')
  const [street, setStreet]     = useState('')
  const [city, setCity]         = useState('')
  const [region, setRegion]     = useState('')
  const [postal, setPostal]     = useState('')
  const [country, setCountry]   = useState('Canada')
  const [regNumber, setRegNo]   = useState('')
  const [gcId, setGcId]         = useState('')
  const [homeCourse, setHome]   = useState('')
  const [events, setEvents]     = useState('')
  const [fieldSize, setField]   = useState('')
  const [agreed, setAgreed]     = useState(false)

  // Setup only makes sense straight after the organiser login step
  if (!basics || basics.accountType !== 'organizer' || !basics.password) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-display font-extrabold text-ink text-[28px] tracking-tight">Start by creating your organiser account</h1>
        <p className="text-gray-500">Your organisation details come right after your login details.</p>
        <Button onClick={() => navigate('/signup', { replace: true })}>Go to sign up</Button>
      </div>
    )
  }

  const clear = (f: string) => { if (errors[f]) setErrors(x => ({ ...x, [f]: '' })) }
  const field = <T,>(set: (v: T) => void, key: string) => (v: T) => { set(v); clear(key) }

  function validateDetails() {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Enter the organisation name'
    if (!type) e.type = 'Choose what kind of organisation you are'
    if (logo.trim() && !/^https?:\/\/\S+$/.test(logo.trim())) e.logo = 'Paste a full image link (https://…)'
    if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid contact email'
    if (phone.replace(/\D/g, '').length < 7) e.phone = 'Enter a valid phone number'
    if (website.trim() && !URLISH.test(website.trim().replace(/^https?:\/\//, ''))) e.website = 'Enter a website like yourclub.com'
    if (!street.trim()) e.street = 'Enter the street address'
    if (!city.trim()) e.city = 'Enter the city'
    if (!region.trim()) e.region = 'Enter the province or state'
    if (!postal.trim()) e.postal = 'Enter the postal / ZIP code'
    else { const p = postalCodeError(country, postal); if (p) e.postal = p }
    return e
  }

  function goReview() {
    const e = validateDetails()
    setErrors(e)
    if (Object.values(e).some(Boolean)) {
      requestAnimationFrame(() => document.querySelector('.text-red-500, [role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      return
    }
    setStep(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function editSection(id: string) {
    setStep(0)
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function submit() {
    if (!agreed) { setErrors({ agreed: 'Please confirm you’re authorised and agree to the organiser terms' }); return }
    setSaving(true)
    setTimeout(() => {
      const r = registerOrganizer({
        fullName: basics!.fullName,
        email: basics!.email,
        phone: basics!.phone,
        password: basics!.password!,
        jobTitle: basics!.jobTitle,
        marketingOptIn: basics!.marketingOptIn,
        org: {
          name: name.trim(),
          type: type as OrgType,
          about: about.trim() || undefined,
          logoUrl: logo.trim() || undefined,
          email: email.trim(),
          phone: phone.trim(),
          website: website.trim().replace(/^https?:\/\//, '') || undefined,
          street: street.trim(),
          city: city.trim(),
          region: region.trim(),
          postalCode: postal.trim().toUpperCase(),
          country,
          registrationNumber: regNumber.trim() || undefined,
          golfCanadaId: gcId.trim() || undefined,
          homeCourseId: homeCourse && homeCourse !== NO_COURSE ? homeCourse : undefined,
          eventsPerYear: events || undefined,
          fieldSize: fieldSize || undefined,
        },
      })
      setSaving(false)
      if (!r.ok) { setErrors({ submit: r.reason }); setStep(0); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
      completeOrganizerSetup(r.userId!)
    }, 1100)
  }

  const courseName = MOCK_COURSES.find(c => c.id === homeCourse)?.name

  return (
    <div className="min-h-screen bg-canvas">
      <header className="h-20 px-6 lg:px-10 flex items-center justify-between max-w-[1180px] mx-auto">
        <Wordmark />
        <span className="text-[13px] font-bold font-display text-gray-500">Step {step + 2} of 3 · {STEPS[step].title}</span>
      </header>

      <div className="max-w-[1180px] mx-auto px-6 lg:px-10 pb-16 grid lg:grid-cols-[300px_minmax(0,1fr)] gap-8 lg:gap-12">
        {/* Stepper */}
        <aside className="lg:sticky lg:top-6 self-start">
          <div className="bg-ink rounded-[28px] p-6 relative overflow-hidden">
            <div className="absolute -right-12 -top-16 w-48 h-48 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(200,236,90,0.25) 0%, rgba(200,236,90,0) 70%)' }} />
            <p className="relative text-white/55 text-[13px] font-medium">Welcome, {(basics.firstName ?? basics.fullName).split(/\s+/)[0]} 👋</p>
            <h1 className="relative font-display font-extrabold text-white text-[24px] leading-tight tracking-tight mt-1">
              Register your organisation
            </h1>
            <ol className="relative mt-6 space-y-2">
              {STEPS.map((s, i) => {
                const done = i < step
                const current = i === step
                return (
                  <li key={s.title}>
                    <button type="button" disabled={i > step} onClick={() => setStep(i)}
                      className={`w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${current ? 'bg-white/[0.08]' : done ? 'hover:bg-white/[0.05]' : 'opacity-50 cursor-default'}`}>
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold font-display flex-shrink-0 ${done ? 'bg-lime-400 text-ink' : current ? 'bg-white text-ink' : 'bg-white/10 text-white/70'}`}>
                        {done ? '✓' : i + 1}
                      </span>
                      <span>
                        <span className="block text-white text-[14px] font-bold font-display tracking-tight">{s.title}</span>
                        <span className="block text-white/45 text-[12px] leading-snug">{s.subtitle}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
            <div className="relative mt-6 rounded-2xl bg-white/[0.06] p-4">
              <p className="text-white text-[13px] font-bold font-display">What happens next</p>
              <ol className="text-white/55 text-[12px] leading-relaxed mt-2 space-y-1.5 list-decimal pl-4">
                <li>We email you a link to verify your address.</li>
                <li>You're signed into the console and can draft tournaments.</li>
                <li>Our team reviews your organisation, usually within 2 business days.</li>
                <li>Once approved, publish events, take registrations and invite your team.</li>
              </ol>
            </div>
          </div>
        </aside>

        {/* Form */}
        <div key={step} className="page-in">
          <h2 className="font-display font-extrabold text-ink text-[32px] tracking-tight">{STEPS[step].title}</h2>
          <p className="text-gray-500 mt-1 mb-7">{STEPS[step].subtitle}</p>

          {errors.submit && (
            <div role="alert" className="mb-5 bg-rose-50 text-rose-700 rounded-2xl px-5 py-4 text-sm font-semibold font-display">{errors.submit}</div>
          )}

          {step === 0 && (
            <div className="space-y-5">
              <Section id="org-about" title="About your organisation">
                <Input label="Organisation name *" placeholder="e.g. Savannah Golf Club" value={name}
                  onChange={e => field(setName, 'name')(e.target.value)} error={errors.name} hint="The name golfers will see on your tournaments" />
                <ChoiceChips label="Organisation type *" options={ORG_TYPES} value={type}
                  onChange={v => field(setType, 'type')(v as OrgType)} error={errors.type} />
                <Textarea label="About the organisation (optional)" placeholder="A short description shown to golfers" value={about}
                  onChange={e => setAbout(e.target.value)} style={{ minHeight: 90 }} />
                <Input label="Logo link (optional)" placeholder="https://…" value={logo} onChange={e => field(setLogo, 'logo')(e.target.value)} error={errors.logo}
                  hint="Shown on your organisation's tournaments" />
              </Section>

              <Section id="org-contact" title="Public contact" hint="Shown to golfers on your tournaments">
                <div className="grid sm:grid-cols-2 gap-5">
                  <Input label="Contact email *" type="email" value={email} onChange={e => field(setEmail, 'email')(e.target.value)} error={errors.email} />
                  <PhoneInput label="Contact phone *" value={phone} onChange={v => field(setPhone, 'phone')(v)} error={errors.phone} />
                </div>
                <Input label="Website (optional)" placeholder="yourclub.com" value={website} onChange={e => field(setWebsite, 'website')(e.target.value)} error={errors.website} />
              </Section>

              <Section id="org-address" title="Address">
                <Input label="Street address *" value={street} onChange={e => field(setStreet, 'street')(e.target.value)} error={errors.street} />
                <div className="grid sm:grid-cols-2 gap-5">
                  <Input label="City *" value={city} onChange={e => field(setCity, 'city')(e.target.value)} error={errors.city} />
                  <Input label="Province / state *" value={region} onChange={e => field(setRegion, 'region')(e.target.value)} error={errors.region} />
                  <Input label="Postal / ZIP code *" value={postal} onChange={e => field(setPostal, 'postal')(e.target.value.toUpperCase())} error={errors.postal} />
                  <SelectField label="Country *" value={country} onChange={v => { setCountry(v); clear('postal') }} options={COUNTRIES} />
                </div>
              </Section>

              <Section id="org-verify" title="Verification details" hint="Optional and never shown publicly — they help us approve you faster">
                <div className="grid sm:grid-cols-2 gap-5">
                  <Input label="Business / charity registration number" placeholder="e.g. CRA 123456789 RR0001" value={regNumber} onChange={e => setRegNo(e.target.value)} />
                  <Input label="Golf Canada club / facility ID" value={gcId} onChange={e => setGcId(e.target.value)} />
                </div>
              </Section>

              <Section id="org-events" title="About your events" hint="Optional — helps us set up your account">
                <SelectField label="Home course" placeholder="Select a course" value={homeCourse} onChange={setHome}
                  options={[...MOCK_COURSES.filter(c => (c.lifecycle ?? 'active') === 'active').map(c => ({ value: c.id, label: c.name })), { value: NO_COURSE, label: 'Not listed — I’ll add it later' }]} />
                <ChoiceChips label="Tournaments per year" options={EVENTS_PER_YEAR} value={events} onChange={v => setEvents(v as string)} />
                <ChoiceChips label="Typical field size" options={FIELD_SIZES} value={fieldSize} onChange={v => setField(v as string)} />
              </Section>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <ReviewCard title="Your login" onEdit={() => navigate('/signup')} rows={[
                ['Name', basics.fullName], ['Email', basics.email], ['Mobile', basics.phone],
                ['Role in the organisation', basics.jobTitle], ['Access', 'Owner (Organizer)'],
                ['Product news', basics.marketingOptIn ? 'Yes' : 'No'],
              ]} />
              <ReviewCard title="Organisation" onEdit={() => editSection('org-about')} rows={[
                ['Name', name], ['Type', type], ['About', about], ['Logo', logo ? 'Added' : undefined],
              ]} />
              <ReviewCard title="Public contact & address" onEdit={() => editSection('org-contact')} rows={[
                ['Contact', `${email} · ${phone}`], ['Website', website],
                ['Address', [street, city, region, postal.toUpperCase(), country].filter(Boolean).join(', ')],
              ]} />
              <ReviewCard title="Verification & events" onEdit={() => editSection('org-verify')} rows={[
                ['Registration number', regNumber], ['Golf Canada ID', gcId],
                ['Home course', courseName ?? (homeCourse === NO_COURSE ? 'Add later' : '')],
                ['Tournaments per year', events], ['Typical field size', fieldSize],
              ]} />
              <label className={`flex items-start gap-3 rounded-2xl p-4 cursor-pointer ${errors.agreed ? 'bg-rose-50 ring-1 ring-rose-200' : 'bg-white shadow-card'}`}>
                <input type="checkbox" checked={agreed} onChange={e => { setAgreed(e.target.checked); clear('agreed') }} className="mt-1 w-4 h-4 accent-[#0c1a12]" />
                <span className="text-[14px] text-gray-600 leading-relaxed">
                  I confirm I'm authorised to register <span className="font-semibold text-ink">{name}</span> and agree to the <span className="font-semibold text-ink">Organiser Terms</span>.
                  Publishing stays locked until the platform team approves this organisation.
                  {errors.agreed && <span className="block text-rose-600 text-[12px] font-semibold mt-1" role="alert">{errors.agreed}</span>}
                </span>
              </label>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mt-8">
            <Button variant="secondary" onClick={() => (step === 0 ? navigate('/signup') : setStep(0))}>Back</Button>
            <Button onClick={step === 0 ? goReview : submit} loading={saving} className="min-w-[220px]">
              {saving ? 'Submitting…' : step === 0 ? 'Review details' : 'Submit for approval'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
