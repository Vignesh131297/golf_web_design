import { useMemo, useState, type ReactNode } from 'react'
import type { Course, HoleData, NineRating, TeeSet } from '../types'
import { MOCK_COURSES, MOCK_TOURNAMENTS } from '../data'
import { useDataVersion, upsertCourse, generateHoles } from '../store'
import { Button, Input, SelectField, ChoiceChips, EmptyState } from '../components'
import { useApp } from '../app-context'
import { navigate } from '../router'
import { TEE_COLORS, formatDay, teeSwatch, teeTotal } from '../golf'
import { BackLink } from '../screens/TournamentDetails'
import { NoAccess } from './AdminShell'
import { canChangeCourse } from './access'
import { Textarea, Toggle, AddRowButton, RemoveRowButton, PhotoPicker, ImageUpload } from './forms'
import { useConfirmDeleteCourse } from './ManageCourses'
import {
  StepHeader, SectionRail, SectionCard, FieldGroup, OptionCards, Segmented, Callout, ValidationPanel, SummaryCard,
  FieldError, type WizardStep, type SectionState,
} from './wizard-ui'
import {
  COURSE_SECTIONS, COURSE_SECTION_KEYS, COURSE_STEPS, COUNTRIES, COURSE_TYPES, COURSE_FACILITIES,
  newCourse, newTee, fromExistingCourse, fitTees, womenDiffer, menPar, womenPar, unitShort, validateCourse, courseWarnings,
  strokeIndexAdvice, finalizeCourse, createsVersion, isUsed, type CourseSectionKey, type CourseStepKey, type Errors,
} from './course-setup'
import { timeZoneForCourse } from './tournament-setup'

/*
 * Create / edit course as a 3-step wizard:
 *   A · Course & location → B · Tees & scorecard → C · Review & activate
 * Spec: Docs/CREATE COURSE.txt. Rules live in course-setup.ts.
 */

type Setter = (patch: Partial<Course>) => void
interface SectionProps { c: Course; set: Setter; e: Errors; scorecardLocked: boolean }

export function CourseWizard({ id }: { id: string | null }) {
  useDataVersion()
  const { showToast, showDialog, can, adminUser } = useApp()
  const confirmDelete = useConfirmDeleteCourse()
  const existing = id ? MOCK_COURSES.find(x => x.id === id) : undefined

  const [c, setC] = useState<Course>(() => (existing ? fromExistingCourse(existing) : newCourse()))
  const [step, setStep] = useState<CourseStepKey>('course')
  const [section, setSection] = useState<CourseSectionKey>('details')
  const [checked, setChecked] = useState<Set<CourseSectionKey>>(() => new Set(existing ? COURSE_SECTION_KEYS : []))
  const [dirty, setDirty] = useState(false)

  const isNew = !existing
  const lifecycle = c.lifecycle ?? 'active'
  const scorecardLocked = !can('courses.scorecard')
  const readOnly = !isNew && (!can('courses.edit') || !canChangeCourse(adminUser, existing!))
  const errors = useMemo(() => validateCourse(c, { scorecardLocked }), [c, scorecardLocked])
  const warnings = useMemo(() => courseWarnings(c), [c])

  if (id && !existing) {
    return (
      <div className="bg-white rounded-[32px] shadow-card">
        <EmptyState title="Course not found" subtitle="It may have been deleted." action={{ label: 'Back to courses', onClick: () => navigate('/admin/courses') }} />
      </div>
    )
  }
  if (isNew && !can('courses.create')) return <NoAccess what="create courses" />
  if (!can('courses.view')) return <NoAccess what="view courses" />

  const set: Setter = patch => { setC(cur => ({ ...cur, ...patch })); setDirty(true) }
  const sectionsOf = (s: CourseStepKey) => COURSE_SECTION_KEYS.filter(k => COURSE_SECTIONS[k].step === s)
  const stateOf = (k: CourseSectionKey): SectionState => (!checked.has(k) ? 'idle' : Object.keys(errors[k]).length ? 'error' : 'valid')

  function go(k: CourseSectionKey) {
    if (step !== 'review') setChecked(v => new Set(v).add(section))
    setSection(k)
    setStep(COURSE_SECTIONS[k].step)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function goStep(s: CourseStepKey) {
    if (s === 'review') {
      setStep('review')
      setChecked(new Set(COURSE_SECTION_KEYS))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else go(sectionsOf(s)[0])
  }
  function next() {
    if (Object.keys(errors[section]).length) {
      setChecked(v => new Set(v).add(section))
      requestAnimationFrame(() => document.querySelector('[role="alert"], .text-red-500')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      return
    }
    const i = COURSE_SECTION_KEYS.indexOf(section)
    if (i < COURSE_SECTION_KEYS.length - 1) go(COURSE_SECTION_KEYS[i + 1])
    else goStep('review')
  }
  function back() {
    if (step === 'review') return go(COURSE_SECTION_KEYS[COURSE_SECTION_KEYS.length - 1])
    const i = COURSE_SECTION_KEYS.indexOf(section)
    if (i > 0) go(COURSE_SECTION_KEYS[i - 1])
  }

  const errorList = COURSE_SECTION_KEYS.flatMap(k => Object.values(errors[k]).map(message => ({ section: k, sectionTitle: COURSE_SECTIONS[k].title, message })))
  const warningList = warnings.map(w => ({ ...w, sectionTitle: COURSE_SECTIONS[w.section].title }))
  const newVersion = createsVersion(existing ? fromExistingCourse(existing) : undefined, c)

  function save(next: Course['lifecycle'], message: string) {
    const out = finalizeCourse(c, next, existing ? fromExistingCourse(existing) : undefined)
    upsertCourse(isNew ? { ...out, organizerId: adminUser?.organizationId } : out)
    setDirty(false)
    showToast(message)
    navigate('/admin/courses')
  }
  function saveDraft() {
    if (!c.facilityName?.trim() || !c.name.trim()) {
      go('details')
      showToast('Add the facility and course name to save a draft', 'error')
      return
    }
    save('draft', `"${c.name.trim()}" saved as a draft`)
  }
  function activate() {
    if (errorList.length) return
    showDialog({
      title: `Activate ${c.name.trim()}?`,
      message: 'Golfers will see the course, and organisers can choose it for tournaments.',
      confirmLabel: 'Activate',
      onConfirm: () => save('active', `"${c.name.trim()}" is active`),
    })
  }
  function saveChanges() {
    if (errorList.length) return goStep('review')
    save(lifecycle, newVersion ? `Saved — ratings version ${(c.version ?? 1) + 1} applies from today` : 'Course saved')
  }
  function archive(to: 'archived' | 'active') {
    showDialog({
      title: to === 'archived' ? `Archive ${c.name}?` : `Restore ${c.name}?`,
      message: to === 'archived' ? "It won't be offered for new tournaments. Past tournaments and results still show it." : 'It will be available for new tournaments again.',
      confirmLabel: to === 'archived' ? 'Archive' : 'Restore',
      onConfirm: () => save(to, to === 'archived' ? 'Course archived' : 'Course restored'),
    })
  }
  function cancel() {
    if (!dirty) return navigate('/admin/courses')
    showDialog({ title: 'Discard changes?', message: "Your changes to this course haven't been saved.", confirmLabel: 'Discard', destructive: true, onConfirm: () => navigate('/admin/courses') })
  }

  const steps: WizardStep[] = COURSE_STEPS.filter(s => s.key !== 'review').map(s => ({
    key: s.key, label: s.label, sections: sectionsOf(s.key).map(k => ({ key: k, title: COURSE_SECTIONS[k].title, state: stateOf(k) })),
  }))
  const stepDone = (s: CourseStepKey) => sectionsOf(s).every(k => checked.has(k) && !Object.keys(errors[k]).length)
  const props: SectionProps = { c, set, e: checked.has(section) ? errors[section] : {}, scorecardLocked }
  const LIFECYCLE_TONE = { draft: 'bg-canvas text-gray-600', active: 'bg-emerald-50 text-emerald-700', archived: 'bg-gray-100 text-gray-500' }

  return (
    <div className="page-in max-w-[1180px]">
      <BackLink label="Courses" onClick={cancel} />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-[14px] text-gray-500 font-medium">{isNew ? 'Create course' : readOnly ? 'View course' : 'Edit course'}{c.facilityName && c.facilityName !== c.name ? ` · ${c.facilityName}` : ''}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display font-extrabold text-ink text-[32px] lg:text-[36px] leading-tight tracking-tight">{c.name.trim() || 'New course'}</h1>
            <span className={`h-7 px-3 rounded-full text-[12px] font-bold font-display inline-flex items-center capitalize ${LIFECYCLE_TONE[lifecycle]}`}>{lifecycle}</span>
            {!isNew && lifecycle !== 'draft' && <span className="text-[12px] font-semibold text-gray-500">Ratings v{c.version ?? 1}{c.effectiveFrom ? ` · from ${formatDay(c.effectiveFrom)}` : ''}</span>}
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2.5">
            {!isNew && can('courses.delete') && <Button variant="danger" size="sm" onClick={() => confirmDelete(existing!, () => navigate('/admin/courses'))}>Delete</Button>}
            {!isNew && lifecycle === 'active' && <Button variant="secondary" size="sm" onClick={() => archive('archived')}>Archive</Button>}
            {!isNew && lifecycle === 'archived' && <Button variant="secondary" size="sm" onClick={() => archive('active')}>Restore</Button>}
            {lifecycle === 'draft' && <Button variant="secondary" size="sm" onClick={saveDraft}>Save as draft</Button>}
          </div>
        )}
      </div>

      {readOnly && <div className="mb-5"><Callout tone="warning">{can('courses.edit') ? 'This course was added by another organiser or the platform, so you can view it but not change it.' : 'Your role can view this course but not change it.'}</Callout></div>}
      {!readOnly && scorecardLocked && <div className="mb-5"><Callout tone="warning">Your role can't change tee ratings or the scorecard; those sections are view only.</Callout></div>}
      {lifecycle === 'archived' && <div className="mb-5"><Callout tone="warning">This course is archived: it isn't offered for new tournaments.</Callout></div>}

      <StepHeader steps={COURSE_STEPS.map(s => ({ key: s.key, label: s.label, done: s.key !== 'review' && stepDone(s.key) }))} active={step} onSelect={k => goStep(k as CourseStepKey)} />

      {step === 'review' ? (
        <Review c={c} errors={errorList} warnings={warningList} onEdit={go} action={lifecycle === 'draft' ? 'activate' : 'save'} newVersion={newVersion} />
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <SectionRail sections={steps.find(s => s.key === step)!.sections} active={section} onSelect={k => go(k as CourseSectionKey)} />
          <fieldset disabled={readOnly} className="flex-1 min-w-0 w-full">
            <SectionBody section={section} {...props} />
          </fieldset>
        </div>
      )}

      <div className="sticky bottom-4 mt-8 z-10">
        <div className="bg-ink rounded-full shadow-float p-2 pl-3 flex items-center gap-2">
          <button type="button" onClick={back} disabled={step !== 'review' && section === COURSE_SECTION_KEYS[0]}
            className="h-11 px-5 rounded-full text-white/80 text-sm font-semibold font-display hover:bg-white/10 disabled:opacity-30">Back</button>
          <p className="flex-1 text-[13px] font-medium text-white/60 truncate text-center">
            {readOnly ? 'View only' : dirty ? 'Unsaved changes' : isNew ? 'Nothing saved yet' : 'All changes saved'}
            {step !== 'review' && <span className="hidden md:inline"> · {COURSE_SECTIONS[section].title} ({COURSE_SECTION_KEYS.indexOf(section) + 1} of {COURSE_SECTION_KEYS.length})</span>}
          </p>
          <button type="button" onClick={cancel} className="h-11 px-5 rounded-full text-white/80 text-sm font-semibold font-display hover:bg-white/10">{readOnly ? 'Close' : 'Cancel'}</button>
          {step !== 'review' ? (
            <Button onClick={next} className="bg-lime-400! text-ink! shadow-none!">{section === COURSE_SECTION_KEYS[COURSE_SECTION_KEYS.length - 1] ? 'Review' : 'Continue'}</Button>
          ) : readOnly ? null : lifecycle === 'draft' ? (
            <span title={errorList.length ? `Fix ${errorList.length} issue${errorList.length > 1 ? 's' : ''} to activate` : undefined}>
              <Button onClick={activate} disabled={errorList.length > 0} className="bg-lime-400! text-ink! shadow-none! disabled:bg-white/15! disabled:text-white/40!">Activate course</Button>
            </span>
          ) : (
            <Button onClick={saveChanges} disabled={errorList.length > 0} className="bg-lime-400! text-ink! shadow-none! disabled:bg-white/15! disabled:text-white/40!">Save changes</Button>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionBody({ section, ...p }: SectionProps & { section: CourseSectionKey }) {
  switch (section) {
    case 'details': return <Details {...p} />
    case 'location': return <Location {...p} />
    case 'contact': return <Contact {...p} />
    case 'tees': return <Tees {...p} />
    case 'scorecard': return <Scorecard {...p} />
  }
}

/* ───────── A · Course & location ───────── */

function Details({ c, set, e }: SectionProps) {
  function changeHoles(n: 9 | 18) {
    if (n === c.holes) return
    const holeData = generateHoles(n, c.holeData)
    set({ holes: n, holeData, teeSets: fitTees((c.teeSets ?? []).map(t => ({ ...t, yards: t.yards.slice(0, n) })), holeData) })
  }
  return (
    <SectionCard title="Course details" subtitle="What golfers see on the course page">
      <div className="grid md:grid-cols-2 gap-4">
        <Input label="Facility / club name *" placeholder="e.g. Augusta Pines Golf Club" value={c.facilityName ?? ''} error={e.facilityName}
          onChange={x => set({ facilityName: x.target.value, name: !c.name || c.name === c.facilityName ? x.target.value : c.name })} />
        <Input label="Course name *" placeholder="e.g. North Course" value={c.name} error={e.name} onChange={x => set({ name: x.target.value })}
          hint="Same as the facility unless it has several courses" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Segmented label="Number of holes" required value={c.holes as 9 | 18} onChange={changeHoles}
          options={[{ value: 18, label: '18 holes' }, { value: 9, label: '9 holes' }]}
          hint="Changing this resizes the scorecard" />
        <Segmented label="Distance unit" required value={c.distanceUnit ?? 'yards'} onChange={v => set({ distanceUnit: v })}
          options={[{ value: 'yards', label: 'Yards' }, { value: 'metres', label: 'Metres' }]} />
      </div>
      <Segmented label="Course type" value={c.courseType ?? 'public'} onChange={v => set({ courseType: v })} options={[...COURSE_TYPES]} />
      <Textarea label="Description *" placeholder="Character of the course, signature holes, conditions…" value={c.description}
        onChange={x => set({ description: x.target.value })} error={e.description} />
      <div className="grid md:grid-cols-2 gap-4">
        <Input label="Designer" placeholder="Optional" value={c.designer} onChange={x => set({ designer: x.target.value })} />
        <Input label="Year opened" placeholder="e.g. 1978" inputMode="numeric" maxLength={4} value={c.established} onChange={x => set({ established: x.target.value })} error={e.established} />
      </div>
      <FieldGroup title="Cover photo *" hint="Used on the course page and on tournaments played here">
        <PhotoPicker value={c.imageUrl} onChange={v => set({ imageUrl: v })} error={e.imageUrl} />
      </FieldGroup>
    </SectionCard>
  )
}

function Location({ c, set, e }: SectionProps) {
  const lat = c.geo?.lat, lng = c.geo?.lng
  const setGeo = (k: 'lat' | 'lng', v: string) => {
    const next = { lat: lat ?? NaN, lng: lng ?? NaN, [k]: v === '' ? NaN : Number(v) }
    set({ geo: Number.isNaN(next.lat) && Number.isNaN(next.lng) ? undefined : next })
  }
  const address = [c.address, c.city, c.region, c.postalCode, c.country].filter(Boolean).join(', ')
  const hasPin = lat !== undefined && lng !== undefined && !Number.isNaN(lat) && !Number.isNaN(lng)
  return (
    <SectionCard title="Location" subtitle="Used for directions and “near me” search">
      <Input label="Street address *" placeholder="e.g. 2604 Washington Road" value={c.address} onChange={x => set({ address: x.target.value })} error={e.address} />
      <div className="grid md:grid-cols-2 gap-4">
        <Input label="City *" value={c.city} onChange={x => set({ city: x.target.value })} error={e.city} />
        <Input label="Province / state *" value={c.region} onChange={x => set({ region: x.target.value })} error={e.region} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Input label="Postal / ZIP code *" value={c.postalCode ?? ''} onChange={x => set({ postalCode: x.target.value.toUpperCase() })} error={e.postalCode} />
        <SelectField label="Country *" value={c.country} options={COUNTRIES} onChange={v => set({ country: v })} error={e.country} />
      </div>
      <FieldGroup title="Map pin *" hint="Latitude and longitude of the clubhouse. Search the address on the map, then copy the coordinates.">
        <div className="grid md:grid-cols-[1fr_1fr_auto] gap-4 items-start">
          <Input label="Latitude" type="number" step="any" placeholder="e.g. 43.6532" value={lat === undefined || Number.isNaN(lat) ? '' : lat} onChange={x => setGeo('lat', x.target.value)} />
          <Input label="Longitude" type="number" step="any" placeholder="e.g. -79.3832" value={lng === undefined || Number.isNaN(lng) ? '' : lng} onChange={x => setGeo('lng', x.target.value)} />
          <a href={hasPin ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || c.name)}`}
            target="_blank" rel="noreferrer" className="md:mt-[26px] h-[52px] px-5 rounded-full bg-canvas text-ink text-[13px] font-bold font-display inline-flex items-center justify-center hover:bg-gray-200 whitespace-nowrap">
            {hasPin ? 'Check pin on map ↗' : 'Find on map ↗'}
          </a>
        </div>
        <FieldError error={e.geo} />
      </FieldGroup>
      <p className="text-[13px] text-gray-500">Time zone: <span className="font-semibold text-ink">{timeZoneForCourse(c) || '—'}</span> (set from the location; used for tee times)</p>
    </SectionCard>
  )
}

function Contact({ c, set, e }: SectionProps) {
  return (
    <SectionCard title="Contact, facilities & status" subtitle="What golfers need to plan their day">
      <FieldGroup title="Contact (shown to golfers)">
        <div className="grid md:grid-cols-2 gap-4">
          <Input label="Phone" type="tel" value={c.phone ?? ''} onChange={x => set({ phone: x.target.value })} error={e.phone} />
          <Input label="Email" type="email" value={c.email ?? ''} onChange={x => set({ email: x.target.value })} error={e.email} />
          <Input label="Website" placeholder="yourclub.com" value={c.website ?? ''} onChange={x => set({ website: x.target.value })} error={e.website} />
          <Input label="Tee-time booking link" placeholder="https://" value={c.bookingUrl ?? ''} onChange={x => set({ bookingUrl: x.target.value })} error={e.bookingUrl} />
        </div>
      </FieldGroup>
      <ChoiceChips label="Facilities" options={COURSE_FACILITIES} value={c.facilities ?? []} onChange={v => set({ facilities: v as string[] })} />
      <Input label="Dress code" placeholder="e.g. Collared shirts; soft spikes only" value={c.dressCode ?? ''} onChange={x => set({ dressCode: x.target.value })} />
      <OptionCards label="Course status" required columns={3} value={c.status ?? 'open'} onChange={v => set({ status: v as Course['status'] })}
        options={[
          { value: 'open', title: 'Open', description: 'Normal play' },
          { value: 'maintenance', title: 'Partly open', description: 'Some holes or greens under maintenance' },
          { value: 'closed', title: 'Temporarily closed', description: 'No play right now' },
        ]} />
      {c.status !== 'open' && (
        <Input label="Status note *" placeholder="e.g. Greens 4 and 11 are being re-turfed; temporary greens in play" value={c.statusNote ?? ''}
          onChange={x => set({ statusNote: x.target.value })} error={e.statusNote} hint="Shown to golfers on the course page" />
      )}
    </SectionCard>
  )
}

/* ───────── B · Tees & scorecard ───────── */

function num(v: string) { return v === '' ? undefined : Number(v) }

function RatingPair({ label, rating, slope, onChange }: { label: string; rating?: number; slope?: number; onChange: (r?: number, s?: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Input label={`${label} rating`} type="number" step="0.1" placeholder="e.g. 72.4" value={rating ?? ''} onChange={x => onChange(num(x.target.value), slope)} />
      <Input label={`${label} slope`} type="number" step="1" placeholder="55–155" value={slope ?? ''} onChange={x => onChange(rating, num(x.target.value))} />
    </div>
  )
}

function NineFields({ label, front, back, onChange }: { label: string; front?: NineRating; back?: NineRating; onChange: (f?: NineRating, b?: NineRating) => void }) {
  const toNine = (r?: number, s?: number) => (r === undefined && s === undefined ? undefined : { rating: r ?? NaN, slope: s ?? NaN })
  const show = (n?: NineRating) => ({ r: n && !Number.isNaN(n.rating) ? n.rating : undefined, s: n && !Number.isNaN(n.slope) ? n.slope : undefined })
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <RatingPair label={`${label} front 9`} rating={show(front).r} slope={show(front).s} onChange={(r, s) => onChange(toNine(r, s), back)} />
      <RatingPair label={`${label} back 9`} rating={show(back).r} slope={show(back).s} onChange={(r, s) => onChange(front, toNine(r, s))} />
    </div>
  )
}

function Tees({ c, set, e, scorecardLocked }: SectionProps) {
  const tees = c.teeSets ?? []
  const update = (i: number, patch: Partial<TeeSet>) => set({ teeSets: tees.map((t, j) => (j === i ? { ...t, ...patch } : t)) })
  const unit = unitShort(c)
  return (
    <SectionCard title="Tee sets" subtitle="Enter ratings exactly as published by Golf Canada / your provincial association — never estimate"
      aside={!scorecardLocked && <AddRowButton label="Add tee set" onClick={() => set({ teeSets: [...tees, newTee('', '', c.holeData.map(h => h.yards))] })} />}>
      <fieldset disabled={scorecardLocked} className="space-y-4 min-w-0">
        {tees.map((t, i) => {
          const men = t.menRating !== undefined || t.menSlope !== undefined
          const women = t.womenRating !== undefined || t.womenSlope !== undefined
          return (
            <div key={t.id} className="bg-canvas/60 rounded-2xl p-4 space-y-4">
              <div className="flex gap-3 items-start">
                <div className="flex-1 grid md:grid-cols-[1fr_1.4fr] gap-3">
                  <Input label="Name *" placeholder="e.g. Blue" value={t.name} onChange={x => update(i, { name: x.target.value, color: t.color || (TEE_COLORS.some(k => k.value === x.target.value) ? x.target.value : '') })} />
                  <ChoiceChips label="Marker colour *" value={t.color} onChange={v => update(i, { color: v as string })}
                    options={TEE_COLORS.map(k => ({ value: k.value, swatch: k.swatch }))} />
                </div>
                {tees.length > 1 && <RemoveRowButton label={`Remove ${t.name || 'tee set'}`} onClick={() => set({ teeSets: tees.filter((_, j) => j !== i), scorecardTeeId: c.scorecardTeeId === t.id ? tees.find((_, j) => j !== i)?.id : c.scorecardTeeId })} />}
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
                <span className="text-gray-500">Total <b className="text-ink">{teeTotal(t).toLocaleString()} {unit}</b> (yards per hole are set in the scorecard)</span>
                <label className="inline-flex items-center gap-2 font-semibold text-ink cursor-pointer">
                  <input type="radio" name="scorecard-tee" checked={c.scorecardTeeId === t.id} onChange={() => set({ scorecardTeeId: t.id })} className="accent-[var(--color-ink)]" />
                  Show on the course scorecard
                </label>
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                {(['men', 'women'] as const).map(g => {
                  const on = g === 'men' ? men : women
                  const par = g === 'men' ? menPar(c) : womenPar(c)
                  return (
                    <div key={g} className={`rounded-2xl p-3 space-y-3 ${on ? 'bg-white' : 'bg-transparent ring-1 ring-black/[0.06]'}`}>
                      <Toggle label={`Rated for ${g}`} hint={on ? `Par ${par}` : undefined} checked={on}
                        onChange={v => update(i, g === 'men'
                          ? { menRating: v ? NaN : undefined, menSlope: v ? NaN : undefined, menFront: undefined, menBack: undefined }
                          : { womenRating: v ? NaN : undefined, womenSlope: v ? NaN : undefined, womenFront: undefined, womenBack: undefined })} />
                      {on && (
                        <RatingPair label="Course" rating={nanToUndef(g === 'men' ? t.menRating : t.womenRating)} slope={nanToUndef(g === 'men' ? t.menSlope : t.womenSlope)}
                          onChange={(r, s) => update(i, g === 'men' ? { menRating: r ?? NaN, menSlope: s ?? NaN } : { womenRating: r ?? NaN, womenSlope: s ?? NaN })} />
                      )}
                      {on && c.holes === 18 && (
                        <details className="group">
                          <summary className="cursor-pointer text-[13px] font-bold font-display text-pine-600 list-none">Front 9 / back 9 ratings <span className="font-normal text-gray-500">(for 9-hole rounds)</span></summary>
                          <div className="mt-3">
                            <NineFields label="" front={g === 'men' ? t.menFront : t.womenFront} back={g === 'men' ? t.menBack : t.womenBack}
                              onChange={(f, b) => update(i, g === 'men' ? { menFront: f, menBack: b } : { womenFront: f, womenBack: b })} />
                          </div>
                        </details>
                      )}
                    </div>
                  )
                })}
              </div>
              <FieldError error={e[`tee${i}`]} />
            </div>
          )
        })}
      </fieldset>
      <FieldError error={e.tees} />
      <Callout>A tee without a rating for a gender can't be used for net scoring for that gender. Ratings change after a re-rating — saving new ratings creates a new version, and past tournaments keep the ratings they were played on.</Callout>
    </SectionCard>
  )
}
const nanToUndef = (n?: number) => (n === undefined || Number.isNaN(n) ? undefined : n)

function Scorecard({ c, set, e, scorecardLocked }: SectionProps) {
  const tees = c.teeSets ?? []
  const differ = womenDiffer(c)
  const [open, setOpen] = useState<number | null>(null)
  const unit = unitShort(c)
  const setHole = (i: number, patch: Partial<HoleData>) => set({ holeData: c.holeData.map((h, j) => (j === i ? { ...h, ...patch } : h)) })
  const setYards = (teeIdx: number, holeIdx: number, v: string) =>
    set({ teeSets: tees.map((t, j) => (j === teeIdx ? { ...t, yards: t.yards.map((y, k) => (k === holeIdx ? Number(v) : y)) } : t)) })
  const cell = 'w-full min-w-[52px] h-9 rounded-lg bg-canvas text-center text-[13px] font-semibold text-ink border border-transparent focus:bg-white focus:border-pine-400 focus:outline-none disabled:bg-transparent'
  const nines = c.holes === 18 ? [[0, 9, 'Out'], [9, 18, 'In']] as const : [[0, 9, 'Total']] as const
  const sum = (from: number, to: number, f: (h: HoleData, i: number) => number) => c.holeData.slice(from, to).reduce((s, h, k) => s + (f(h, from + k) || 0), 0)
  const advice = strokeIndexAdvice(c.holeData.map(h => h.handicap))
  return (
    <SectionCard title="Scorecard" subtitle={`Par, stroke index and ${unit === 'm' ? 'metres' : 'yards'} for every hole and tee set`}>
      <fieldset disabled={scorecardLocked} className="space-y-4 min-w-0">
        <Toggle label="Women play a different par or stroke index" hint="WHS recommends one stroke index allocation for men and one for women" checked={differ}
          onChange={v => set({ holeData: c.holeData.map(h => ({ ...h, parWomen: v ? h.par : undefined, handicapWomen: v ? h.handicap : undefined })) })} />
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[13px] border-separate border-spacing-x-1 border-spacing-y-1">
            <thead>
              <tr className="text-[11px] font-bold font-display text-gray-400 text-center">
                <th className="text-left px-1">Hole</th>
                <th>Par</th>{differ && <th>Par (W)</th>}
                <th>SI</th>{differ && <th>SI (W)</th>}
                {tees.map(t => <th key={t.id}><span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full ring-1 ring-black/15" style={{ background: teeSwatch(t.color) }} />{t.name || 'Tee'}</span></th>)}
                <th className="sr-only">Details</th>
              </tr>
            </thead>
            <tbody>
              {nines.map(([from, to, label]) => (
                <NineRows key={label}>
                  {c.holeData.slice(from, to).map((h, k) => {
                    const i = from + k
                    return (
                      <HoleRow key={h.hole} open={open === i} colSpan={4 + (differ ? 2 : 0) + tees.length}
                        detail={
                          <div className="space-y-3 py-2">
                            <div className="grid md:grid-cols-[200px_1fr] gap-3">
                              <Input label="Hole name" placeholder="Optional, e.g. Pine Hollow" value={h.name ?? ''} onChange={x => setHole(i, { name: x.target.value })} />
                              <Input label="Notes for golfers" placeholder="How the hole plays, where to miss" value={h.notes ?? ''} onChange={x => setHole(i, { notes: x.target.value })} />
                            </div>
                            <ImageUpload label={`Hole ${h.hole} picture`} value={h.imageUrl} onChange={v => setHole(i, { imageUrl: v })}
                              hint="From the club's website or printed scorecard. Golfers see it in the Hole guide; without it they see a sketch." />
                          </div>
                        }>
                        <td className="px-1 font-display font-extrabold text-ink">{h.hole}</td>
                        <td><input aria-label={`Hole ${h.hole} par`} type="number" className={cell} value={h.par} onChange={x => setHole(i, { par: Number(x.target.value) })} /></td>
                        {differ && <td><input aria-label={`Hole ${h.hole} women's par`} type="number" className={cell} value={h.parWomen ?? h.par} onChange={x => setHole(i, { parWomen: Number(x.target.value) })} /></td>}
                        <td><input aria-label={`Hole ${h.hole} stroke index`} type="number" className={cell} value={h.handicap} onChange={x => setHole(i, { handicap: Number(x.target.value) })} /></td>
                        {differ && <td><input aria-label={`Hole ${h.hole} women's stroke index`} type="number" className={cell} value={h.handicapWomen ?? h.handicap} onChange={x => setHole(i, { handicapWomen: Number(x.target.value) })} /></td>}
                        {tees.map((t, ti) => (
                          <td key={t.id}><input aria-label={`Hole ${h.hole} ${t.name} ${unit}`} type="number" className={cell} value={t.yards[i] ?? ''} onChange={x => setYards(ti, i, x.target.value)} /></td>
                        ))}
                        <td className="text-right">
                          <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
                            className={`h-8 px-3 rounded-full text-[11px] font-bold font-display ${h.name || h.notes || h.imageUrl ? 'bg-lime-300/50 text-pine-800' : 'bg-canvas text-gray-500'} hover:text-ink`}>
                            {h.name || h.notes || h.imageUrl ? 'Details ✓' : 'Details'}
                          </button>
                        </td>
                      </HoleRow>
                    )
                  })}
                  <tr className="text-center font-display font-extrabold text-ink">
                    <td className="px-1 text-left text-[11px] text-gray-500">{label}</td>
                    <td>{sum(from, to, h => h.par)}</td>{differ && <td>{sum(from, to, h => h.parWomen ?? h.par)}</td>}
                    <td className="text-gray-300">—</td>{differ && <td className="text-gray-300">—</td>}
                    {tees.map(t => <td key={t.id}>{sum(from, to, (_, i) => t.yards[i]).toLocaleString()}</td>)}
                    <td />
                  </tr>
                </NineRows>
              ))}
              {c.holes === 18 && (
                <tr className="text-center font-display font-extrabold text-ink bg-lime-300/30">
                  <td className="px-1 text-left text-[11px] rounded-l-lg">Total</td>
                  <td>{menPar(c)}</td>{differ && <td>{womenPar(c)}</td>}
                  <td />{differ && <td />}
                  {tees.map(t => <td key={t.id}>{teeTotal(t).toLocaleString()}</td>)}
                  <td className="rounded-r-lg" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </fieldset>
      <FieldError error={e.scorecard} />
      <div className="rounded-2xl bg-canvas/60 p-4 space-y-4">
        <div>
          <p className="text-[14px] font-bold font-display text-ink">Club scorecard & hole pictures</p>
          <p className="text-[12px] text-gray-500 mt-0.5">Golfers see the club's own pictures in the Hole guide. Add a picture per hole with “Details”. Use images from the club's website or printed scorecard, with the club's permission.</p>
        </div>
        <ImageUpload label="Club scorecard" value={c.scorecardImageUrl} onChange={v => set({ scorecardImageUrl: v })}
          hint="Golfers can open it from the course page" />
        <Input label="Where the hole pictures come from" placeholder="e.g. Augusta Pines Golf Club scorecard" value={c.holeImageSource ?? ''}
          onChange={x => set({ holeImageSource: x.target.value })} hint="Shown under each picture" />
      </div>
      {advice.length > 0 && (
        <Callout tone="warning">
          <b>Stroke index guidance (WHS Appendix E)</b> — not required, but recommended:
          <ul className="list-disc pl-5 mt-1">{advice.map(a => <li key={a}>{a}</li>)}</ul>
        </Callout>
      )}
    </SectionCard>
  )
}

function NineRows({ children }: { children: ReactNode }) { return <>{children}</> }

function HoleRow({ children, open, detail, colSpan }: { children: ReactNode; open: boolean; detail: ReactNode; colSpan: number }) {
  return (
    <>
      <tr>{children}</tr>
      {open && <tr><td colSpan={colSpan} className="px-1">{detail}</td></tr>}
    </>
  )
}

/* ───────── C · Review & activate ───────── */

function Review({ c, errors, warnings, onEdit, action, newVersion }: {
  c: Course; errors: Parameters<typeof ValidationPanel>[0]['errors']; warnings: Parameters<typeof ValidationPanel>[0]['warnings']
  onEdit: (k: CourseSectionKey) => void; action: 'activate' | 'save'; newVersion: boolean
}) {
  const tees = c.teeSets ?? []
  const unit = unitShort(c)
  const pair = (r?: number, s?: number) => (r === undefined || Number.isNaN(r) ? '—' : `${r} / ${Number.isNaN(s) ? '—' : s}`)
  const used = isUsed(c) ? MOCK_TOURNAMENTS.filter(t => t.courseId === c.id).length : 0
  const cards: { title: string; edit: CourseSectionKey; rows: [string, ReactNode][] }[] = [
    { title: 'Course details', edit: 'details', rows: [
      ['Facility', c.facilityName], ['Course', c.name], ['Holes', `${c.holes} · par ${menPar(c)}`],
      ['Type', COURSE_TYPES.find(x => x.value === c.courseType)?.label], ['Designer · opened', [c.designer, c.established].filter(Boolean).join(' · ')],
      ['Distance unit', c.distanceUnit === 'metres' ? 'Metres' : 'Yards'],
    ] },
    { title: 'Location', edit: 'location', rows: [
      ['Address', [c.address, c.city, c.region, c.postalCode].filter(Boolean).join(', ')], ['Country', c.country],
      ['Map pin', c.geo ? `${c.geo.lat}, ${c.geo.lng}` : ''], ['Time zone', timeZoneForCourse(c)],
    ] },
    { title: 'Contact, facilities & status', edit: 'contact', rows: [
      ['Contact', [c.phone, c.email, c.website].filter(Boolean).join(' · ')], ['Facilities', (c.facilities ?? []).join(', ')],
      ['Dress code', c.dressCode], ['Status', c.status === 'open' ? 'Open' : `${c.status === 'closed' ? 'Temporarily closed' : 'Partly open'} — ${c.statusNote}`],
    ] },
  ]
  return (
    <div className="grid xl:grid-cols-[1fr_340px] gap-6 items-start">
      <div className="space-y-5">
        <div className="bg-ink rounded-[28px] p-5 flex gap-5 items-center relative overflow-hidden">
          <div className="absolute inset-y-0 right-0 w-1/2 pointer-events-none" style={{ background: 'linear-gradient(90deg, rgba(200,236,90,0) 0%, rgba(200,236,90,0.18) 100%)' }} />
          {c.imageUrl && <img src={c.imageUrl} alt="" className="relative w-28 h-20 rounded-2xl object-cover" />}
          <div className="relative min-w-0">
            <p className="text-[12px] font-bold font-display text-lime-400">{c.facilityName && c.facilityName !== c.name ? c.facilityName : 'Golf course'}</p>
            <h2 className="text-[22px] font-extrabold font-display text-white tracking-tight truncate">{c.name || 'Untitled course'}</h2>
            <p className="text-[13px] text-white/60">{[c.city, c.region, c.country].filter(Boolean).join(', ') || 'No location yet'} · {c.holes} holes · par {menPar(c)} · {tees.length} tee set{tees.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div className="grid lg:grid-cols-2 gap-5">
          {cards.map(x => <SummaryCard key={x.title} title={x.title} rows={x.rows} onEdit={() => onEdit(x.edit)} />)}
          <section className="bg-white rounded-3xl shadow-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[16px] font-extrabold font-display text-ink tracking-tight">Ratings history</h3>
            </div>
            <p className="text-[13px] text-gray-600">Current: <b className="text-ink">version {c.version ?? 1}</b>{c.effectiveFrom ? `, from ${formatDay(c.effectiveFrom)}` : ''}{used ? ` · used by ${used} tournament${used > 1 ? 's' : ''}` : ''}</p>
            {newVersion && <p className="mt-2 text-[12px] font-semibold text-amber-800 bg-amber-50 rounded-xl px-3 py-2">Saving creates version {(c.version ?? 1) + 1}, effective today. Tournaments that already locked handicaps keep version {c.version ?? 1}.</p>}
            {!!c.history?.length && (
              <ul className="mt-3 space-y-1 text-[12px] text-gray-500">
                {[...c.history].reverse().map(h => <li key={h.version}>Version {h.version}: {h.effectiveFrom ? formatDay(h.effectiveFrom) : 'start'} – {formatDay(h.until)}</li>)}
              </ul>
            )}
          </section>
        </div>
        <section className="bg-white rounded-3xl shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[16px] font-extrabold font-display text-ink tracking-tight">Tee sets & scorecard</h3>
            <button type="button" onClick={() => onEdit('tees')} className="h-8 px-3.5 rounded-full bg-canvas text-[12px] font-bold font-display text-ink hover:bg-gray-200">Edit</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-[11px] font-bold font-display text-gray-400 text-left"><th className="py-2">Tees</th><th className="py-2 text-right">{unit === 'm' ? 'Metres' : 'Yards'}</th><th className="py-2 text-right">Men rating / slope</th><th className="py-2 text-right">Women rating / slope</th></tr></thead>
              <tbody className="divide-y divide-black/[0.05]">
                {tees.map(t => (
                  <tr key={t.id}>
                    <td className="py-2 font-semibold text-ink"><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full ring-1 ring-black/15" style={{ background: teeSwatch(t.color) }} />{t.name || '—'}{c.scorecardTeeId === t.id && <span className="text-[10px] font-bold text-pine-600 uppercase">scorecard</span>}</span></td>
                    <td className="py-2 text-right">{teeTotal(t).toLocaleString()}</td>
                    <td className="py-2 text-right">{pair(t.menRating, t.menSlope)}</td>
                    <td className="py-2 text-right">{pair(t.womenRating, t.womenSlope)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 grid gap-1 text-center text-[12px]" style={{ gridTemplateColumns: `64px repeat(${c.holes}, minmax(26px, 1fr))` }}>
              <span className="text-left font-bold text-gray-400">Hole</span>{c.holeData.map(h => <span key={h.hole} className="font-bold text-gray-400">{h.hole}</span>)}
              <span className="text-left font-bold text-ink">Par</span>{c.holeData.map(h => <span key={h.hole} className="font-semibold text-ink">{h.par}</span>)}
              <span className="text-left font-bold text-ink">SI</span>{c.holeData.map(h => <span key={h.hole} className="text-gray-500">{h.handicap}</span>)}
            </div>
          </div>
        </section>
      </div>
      <div className="xl:sticky xl:top-6">
        <ValidationPanel errors={errors} warnings={warnings} onFix={k => onEdit(k as CourseSectionKey)} action={action} />
      </div>
    </div>
  )
}
