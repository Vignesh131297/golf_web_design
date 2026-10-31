import { useMemo, useState, type ReactNode } from 'react'
import type { Division, Official, Prize, Tournament, TournamentFormat, TournamentRound } from '../types'
import { useDataVersion, upsertTournament, STATUS_OPTIONS } from '../store'
import { MOCK_COURSES } from '../data'
import { Button, Input, SelectField, ChoiceChips, EmptyState } from '../components'
import { useApp } from '../app-context'
import { navigate } from '../router'
import { CURRENCIES, FEE_INCLUDES, formatClock, formatDay, formatMoney, teeSwatch, teeTotal } from '../golf'
import { BackLink } from '../screens/TournamentDetails'
import { NoAccess } from './AdminShell'
import { canPublish, scopedTournaments } from './access'
import { entriesFor } from '../live'
import { Textarea, Toggle, AddRowButton, RemoveRowButton, PhotoPicker } from './forms'
import { STATUS_TONE, useConfirmDeleteTournament } from './ManageTournaments'
import {
  StepHeader, SectionRail, SectionCard, FieldGroup, OptionCards, Segmented, DateTimeInput, Stepper, Callout,
  ValidationPanel, SummaryCard, FieldLabel, FieldError, RangeInput, type WizardStep, type SectionState,
} from './wizard-ui'
import {
  SECTIONS, SECTION_KEYS, STEPS, CATEGORIES, TIME_ZONES, PRIZE_CATEGORIES, HOLE_PRIZES, OFFICIAL_ROLES, LOCAL_RULE_TEMPLATES,
  RECOMMENDED_ALLOWANCE, newDraft, fromExisting, applyFirstRoundDefaults, courseOf, firstRoundDate, isTeam, feeTotal,
  teeSheetPreview, validateAll, warningsFor, publishedStatus, finalize, isLocked, newDivision, timeZoneForCourse,
  type SectionKey, type StepKey, type Errors,
} from './tournament-setup'
import { isSelectable } from './course-setup'
import { sendInvite, slotStatus, staffRoleOf } from '../ops'
import { SlotChip } from '../ops-ui'
import { SCRAMBLE_ALLOWANCES } from '../golf'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Scramble teams get a share of each player's course handicap, lowest handicap first (client answer T-07) */
function ScrambleAllowances({ size }: { size: 2 | 3 | 4 }) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label="Team handicap allowance" required />
      <div className="rounded-2xl bg-canvas overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead><tr className="text-[11px] font-bold font-display text-gray-400">
            <th className="px-4 py-2">Team</th><th className="px-2 py-2">Lowest</th><th className="px-2 py-2">2nd</th><th className="px-2 py-2">3rd</th><th className="px-2 py-2">Highest</th>
          </tr></thead>
          <tbody>
            {([2, 3, 4] as const).map(n => (
              <tr key={n} className={`border-t border-black/[0.05] ${n === size ? 'bg-lime-400/30 font-semibold' : ''}`}>
                <td className="px-4 py-2 text-ink">{n}-player</td>
                {[0, 1, 2, 3].map(k => <td key={k} className="px-2 py-2">{SCRAMBLE_ALLOWANCES[n][k] !== undefined ? `${SCRAMBLE_ALLOWANCES[n][k]}%` : '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FieldError hint="Applied to each player’s course handicap and added together for the team’s playing handicap." />
    </div>
  )
}

/*
 * Create / edit tournament as a 3-step wizard:
 *   A · Essentials → B · Setup → C · Review & publish
 * Spec: Docs/CREATE TOURNAMENT - REVISED.txt. Rules live in tournament-setup.ts.
 */

type Setter = (patch: Partial<Tournament>) => void
interface SectionProps { t: Tournament; set: Setter; e: Errors; registered: number }

export function TournamentWizard({ id }: { id: string | null }) {
  useDataVersion()
  const { showToast, showDialog, can, adminUser, adminOrg } = useApp()
  const confirmDelete = useConfirmDeleteTournament()
  const existing = id ? scopedTournaments(adminUser).find(x => x.id === id) : undefined

  const [t, setT] = useState<Tournament>(() => existing
    ? fromExisting(existing)
    : newDraft({ name: adminUser?.name, email: adminOrg?.email ?? adminUser?.email, phone: adminOrg?.phone }))
  const [step, setStep] = useState<StepKey>('essentials')
  const [section, setSection] = useState<SectionKey>('basics')
  // Sections the user has left or tried to continue from: only these show errors
  const [checked, setChecked] = useState<Set<SectionKey>>(() => new Set(existing ? SECTION_KEYS : []))
  const [dirty, setDirty] = useState(false)

  const registered = existing ? entriesFor(existing.id).filter(x => x.status === 'registered').length || existing.players : 0
  const isNew = !existing
  const isDraft = t.status === 'draft'
  const locked = isLocked(t.status)
  const readOnly = locked || (!isNew && !can('tournaments.edit'))
  const publishable = canPublish(adminUser)

  const errors = useMemo(() => validateAll(t, { registered, isDraft }), [t, registered, isDraft])
  const warnings = useMemo(() => warningsFor(t), [t])

  if (id && !existing) {
    return (
      <div className="bg-white rounded-[32px] shadow-card">
        <EmptyState title="Tournament not found" subtitle="It may have been deleted." action={{ label: 'Back to tournaments', onClick: () => navigate('/admin/tournaments') }} />
      </div>
    )
  }
  if (isNew && !can('tournaments.create')) return <NoAccess what="create tournaments" />
  if (!can('tournaments.view')) return <NoAccess what="view tournaments" />

  const set: Setter = patch => { setT(cur => ({ ...cur, ...patch })); setDirty(true) }
  const stateOf = (k: SectionKey): SectionState =>
    !checked.has(k) ? 'idle' : Object.keys(errors[k]).length ? 'error' : 'valid'
  const sectionsOf = (s: StepKey) => SECTION_KEYS.filter(k => SECTIONS[k].step === s)

  function go(k: SectionKey) {
    if (step !== 'review') setChecked(v => new Set(v).add(section))
    setSection(k)
    setStep(SECTIONS[k].step)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function goStep(s: StepKey) {
    if (s === 'review') {
      setStep('review')
      setChecked(new Set(SECTION_KEYS)) // the review shows every problem
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else go(sectionsOf(s)[0])
  }
  function next() {
    if (Object.keys(errors[section]).length) {
      // Stay and show what needs fixing; the section rail still allows skipping ahead
      setChecked(v => new Set(v).add(section))
      requestAnimationFrame(() => document.querySelector('[role="alert"], .text-red-500')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      return
    }
    const order = SECTION_KEYS
    const i = order.indexOf(section)
    if (i < order.length - 1) go(order[i + 1])
    else goStep('review')
  }
  function back() {
    if (step === 'review') return go(SECTION_KEYS[SECTION_KEYS.length - 1])
    const i = SECTION_KEYS.indexOf(section)
    if (i > 0) go(SECTION_KEYS[i - 1])
  }

  const errorList = SECTION_KEYS.flatMap(k => Object.values(errors[k]).map(message => ({ section: k, sectionTitle: SECTIONS[k].title, message })))
  const warningList = warnings.map(w => ({ ...w, sectionTitle: SECTIONS[w.section].title }))

  function save(status: Tournament['status'], message: string) {
    const out = finalize(t, status, registered)
    upsertTournament(isNew ? { ...out, organizerId: adminUser?.organizationId } : out)
    setDirty(false)
    showToast(message)
    navigate('/admin/tournaments')
  }
  function saveDraft() {
    if (!t.name.trim()) {
      go('basics')
      showToast('Give the tournament a name to save it as a draft', 'error')
      return
    }
    save('draft', `"${t.name.trim()}" saved as a draft`)
  }
  function publish() {
    if (errorList.length) return
    const status = publishedStatus(t)
    const when = status === 'published' ? `Golfers can see it now and register from ${formatDay(t.registration!.opensAt.slice(0, 10))}.` : status === 'registration-open' ? 'Golfers can see it and register now.' : 'Registration has already closed.'
    showDialog({
      title: `Publish ${t.name.trim()}?`,
      message: `${when} Some settings lock once golfers register.`,
      confirmLabel: 'Publish',
      onConfirm: () => save(status, `"${t.name.trim()}" is published`),
    })
  }
  function saveChanges() {
    if (errorList.length) return goStep('review')
    save(t.status, 'Tournament saved')
  }
  function cancel() {
    if (!dirty) return navigate('/admin/tournaments')
    showDialog({ title: 'Discard changes?', message: "Your changes to this tournament haven't been saved.", confirmLabel: 'Discard', destructive: true, onConfirm: () => navigate('/admin/tournaments') })
  }

  const steps: WizardStep[] = STEPS.filter(s => s.key !== 'review').map(s => ({
    key: s.key, label: s.label,
    sections: sectionsOf(s.key).map(k => ({ key: k, title: SECTIONS[k].title, state: stateOf(k) })),
  }))
  const stepDone = (s: StepKey) => sectionsOf(s).every(k => checked.has(k) && !Object.keys(errors[k]).length)
  const props: SectionProps = { t, set, e: checked.has(section) ? errors[section] : {}, registered }
  const statusLabel = STATUS_OPTIONS.find(o => o.value === t.status)?.label

  return (
    <div className="page-in max-w-[1180px]">
      <BackLink label="Tournaments" onClick={cancel} />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-[14px] text-gray-500 font-medium">{isNew ? 'Create tournament' : readOnly ? 'View tournament' : 'Edit tournament'}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display font-extrabold text-ink text-[32px] lg:text-[36px] leading-tight tracking-tight">{t.name.trim() || 'New tournament'}</h1>
            <span className={`h-7 px-3 rounded-full text-[12px] font-bold font-display inline-flex items-center ${STATUS_TONE[t.status]}`}>{statusLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {!isNew && can('tournaments.delete') && !readOnly && (
            <Button variant="danger" size="sm" onClick={() => confirmDelete(existing!, () => navigate('/admin/tournaments'))}>Delete</Button>
          )}
          {!isNew && !isDraft && <Button variant="secondary" size="sm" onClick={() => navigate(`/admin/tournaments/${t.id}/live`)}>Tournament day</Button>}
          {!readOnly && isDraft && <Button variant="secondary" size="sm" onClick={saveDraft}>Save as draft</Button>}
        </div>
      </div>

      {locked && <div className="mb-5"><Callout tone="warning">This tournament is {statusLabel?.toLowerCase()}, so its set-up can't change. Scores, player status and results are managed on the Tournament day page.</Callout></div>}
      {!locked && readOnly && <div className="mb-5"><Callout tone="warning">Your role can view this tournament but not change it.</Callout></div>}
      {!publishable && isDraft && <div className="mb-5"><Callout tone="warning">Your organisation is under review. You can build the tournament as a draft and publish it once you're approved.</Callout></div>}

      <StepHeader steps={STEPS.map(s => ({ key: s.key, label: s.label, done: s.key !== 'review' && stepDone(s.key) }))} active={step} onSelect={k => goStep(k as StepKey)} />

      {step === 'review' ? (
        <Review t={t} errors={errorList} warnings={warningList} onEdit={go} action={isDraft ? 'publish' : 'save'} />
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <SectionRail sections={steps.find(s => s.key === step)!.sections} active={section} onSelect={k => go(k as SectionKey)} />
          <fieldset disabled={readOnly} className="flex-1 min-w-0 w-full">
            <SectionBody section={section} {...props} />
          </fieldset>
        </div>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-4 mt-8 z-10">
        <div className="bg-ink rounded-full shadow-float p-2 pl-3 flex items-center gap-2">
          <button type="button" onClick={back} disabled={step !== 'review' && section === SECTION_KEYS[0]}
            className="h-11 px-5 rounded-full text-white/80 text-sm font-semibold font-display hover:bg-white/10 disabled:opacity-30">Back</button>
          <p className="flex-1 text-[13px] font-medium text-white/60 truncate text-center">
            {readOnly ? 'View only' : dirty ? 'Unsaved changes' : isNew ? 'Nothing saved yet' : 'All changes saved'}
            {step !== 'review' && <span className="hidden md:inline"> · {SECTIONS[section].title} ({SECTION_KEYS.indexOf(section) + 1} of {SECTION_KEYS.length})</span>}
          </p>
          <button type="button" onClick={cancel} className="h-11 px-5 rounded-full text-white/80 text-sm font-semibold font-display hover:bg-white/10">{readOnly ? 'Close' : 'Cancel'}</button>
          {step !== 'review' ? (
            <Button onClick={next} className="bg-lime-400! text-ink! shadow-none!">{section === SECTION_KEYS[SECTION_KEYS.length - 1] ? 'Review' : 'Continue'}</Button>
          ) : readOnly ? null : isDraft ? (
            <span title={!publishable ? 'Publishing unlocks when your organisation is approved' : errorList.length ? `Fix ${errorList.length} issue${errorList.length > 1 ? 's' : ''} to publish` : undefined}>
              <Button onClick={publish} disabled={!publishable || errorList.length > 0} className="bg-lime-400! text-ink! shadow-none! disabled:bg-white/15! disabled:text-white/40!">Publish tournament</Button>
            </span>
          ) : (
            <Button onClick={saveChanges} disabled={errorList.length > 0} className="bg-lime-400! text-ink! shadow-none! disabled:bg-white/15! disabled:text-white/40!">Save changes</Button>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionBody({ section, ...p }: SectionProps & { section: SectionKey }) {
  switch (section) {
    case 'basics': return <Basics {...p} />
    case 'format': return <Format {...p} />
    case 'rounds': return <Rounds {...p} />
    case 'divisions': return <Divisions {...p} />
    case 'scoring': return <Scoring {...p} />
    case 'tiebreaks': return <TieBreaks {...p} />
    case 'registration': return <Registration {...p} />
    case 'fees': return <Fees {...p} />
    case 'teesheet': return <TeeSheet {...p} />
    case 'rules': return <Rules {...p} />
    case 'results': return <Results {...p} />
    case 'prizes': return <Prizes {...p} />
    case 'visibility': return <Visibility {...p} />
  }
}

/* ───────── A · Essentials ───────── */

function Basics({ t, set, e }: SectionProps) {
  const categories = CATEGORIES.includes(t.category) || !t.category ? CATEGORIES : [t.category, ...CATEGORIES]
  return (
    <SectionCard title="Basic information" subtitle="How golfers will see this tournament">
      <Input label="Tournament name *" placeholder="e.g. Autumn Stableford Cup" value={t.name} maxLength={100}
        onChange={x => set({ name: x.target.value })} error={e.name} />
      <ChoiceChips label="Category *" options={categories} value={t.category} onChange={v => set({ category: v as string })} error={e.category} />
      <div>
        <Textarea label="Description *" placeholder="What makes this event special, who it's for, what's included…" maxLength={1000}
          value={t.description} onChange={x => set({ description: x.target.value })} error={e.description} />
        <p className="text-[11px] text-gray-400 text-right mt-1">{t.description.length}/1000</p>
      </div>
      <FieldGroup title="Cover image *" hint="Shown on tournament cards and the tournament page">
        <PhotoPicker value={t.imageUrl} onChange={v => set({ imageUrl: v })} error={e.imageUrl} />
      </FieldGroup>
      <div className="grid md:grid-cols-2 gap-4">
        <Input label="Logo link" placeholder="https:// (optional)" value={t.logoUrl ?? ''} onChange={x => set({ logoUrl: x.target.value })} />
        <SelectField label="Time zone *" placeholder="Choose a time zone" value={t.timeZone ?? ''} options={TIME_ZONES}
          onChange={v => set({ timeZone: v })} error={e.timeZone} />
      </div>
      <FieldGroup title="Contact shown to golfers">
        <div className="grid md:grid-cols-3 gap-4">
          <Input label="Contact person *" value={t.contactPerson ?? ''} onChange={x => set({ contactPerson: x.target.value })} error={e.contactPerson} />
          <Input label="Contact email *" type="email" value={t.contactEmail ?? ''} onChange={x => set({ contactEmail: x.target.value })} error={e.contactEmail} />
          <Input label="Contact phone" type="tel" value={t.contactPhone ?? ''} onChange={x => set({ contactPhone: x.target.value })} error={e.contactPhone} />
        </div>
      </FieldGroup>
      <Callout>Tournament dates are set from your rounds (Rounds & course).</Callout>
    </SectionCard>
  )
}

const INDIVIDUAL_FORMATS = [
  { value: 'Stroke Play', title: 'Stroke Play', tag: 'Default', description: 'Lowest total strokes wins' },
  { value: 'Stableford', title: 'Stableford', description: 'Points on each hole against par' },
]
const TEAM_FORMATS = [
  { value: 'Four-Ball', title: 'Four-Ball / Better Ball', description: 'Pairs; the better score on each hole counts' },
  { value: 'Scramble', title: 'Scramble', description: 'Everyone plays from the best shot; one team score' },
]

function Format({ t, set, e, registered }: SectionProps) {
  const fixed = registered > 0
  const team = isTeam(t)
  return (
    <SectionCard title="Format & participation" subtitle="How the tournament is played">
      {fixed && <Callout tone="warning">{registered} golfers have registered, so the format and participation can't change.</Callout>}
      <OptionCards label="Participation type" required disabled={fixed} value={t.participation!}
        options={[
          { value: 'individual', title: 'Individual', description: 'Each golfer plays their own ball and score' },
          { value: 'team', title: 'Team', description: 'Golfers play in pairs or teams' },
        ]}
        onChange={v => set({ participation: v as 'individual' | 'team', format: (v === 'team' ? 'Four-Ball' : 'Stroke Play') as TournamentFormat, team: { size: 2, formation: t.team!.formation } })} />
      <OptionCards label="Format" required disabled={fixed} value={t.format} error={e.format}
        options={team ? TEAM_FORMATS : INDIVIDUAL_FORMATS}
        onChange={v => set({ format: v as TournamentFormat, team: { ...t.team!, size: v === 'Four-Ball' ? 2 : Math.max(2, t.team!.size) as 2 | 3 | 4 } })} />
      {team && (
        <FieldGroup title="Team settings">
          <Segmented label="Team size" required disabled={fixed} value={t.team!.size} error={e.teamSize}
            hint={t.format === 'Four-Ball' ? 'Four-Ball is always played in pairs' : undefined}
            options={[2, 3, 4].map(n => ({ value: n as 2 | 3 | 4, label: `${n} players`, disabled: t.format === 'Four-Ball' && n !== 2 }))}
            onChange={v => set({ team: { ...t.team!, size: v } })} />
          <OptionCards label="Team formation" required value={t.team!.formation}
            options={[
              { value: 'players', title: 'Golfers register with partners', description: 'The team is formed at registration' },
              { value: 'organizer', title: 'I build the teams', description: 'Golfers register alone; you group them' },
            ]}
            onChange={v => set({ team: { ...t.team!, formation: v as 'players' | 'organizer' } })} />
        </FieldGroup>
      )}
      <Callout>
        <b>How scores are entered:</b> golfers enter gross strokes for each hole. {t.format === 'Four-Ball' ? 'Each partner enters their own score; the team score is calculated.' : t.format === 'Scramble' ? 'The team enters one score per hole and notes whose ball was used.' : t.format === 'Stableford' ? 'Points use the standard Stableford table (net par = 2 points).' : 'Net scores are calculated from handicaps.'}
      </Callout>
    </SectionCard>
  )
}

function Rounds({ t, set, e }: SectionProps) {
  const course = courseOf(t)
  const rounds = t.rounds!
  function setRounds(next: TournamentRound[]) {
    const prevFirst = firstRoundDate(t)
    const draft = { ...t, rounds: next }
    set(applyFirstRoundDefaults(draft, firstRoundDate(draft), prevFirst))
  }
  function changeCount(n: number) {
    const next = Array.from({ length: n }, (_, i) => rounds[i] ?? { number: i + 1, date: '', holes: 'all' as const, name: `Round ${i + 1}` })
    setRounds(next)
  }
  function chooseCourse(id: string) {
    const c = MOCK_COURSES.find(x => x.id === id)
    const tees = c?.teeSets ?? []
    set({
      courseId: id,
      timeZone: t.timeZone || timeZoneForCourse(c),
      divisions: t.divisions!.map(d => (tees.some(x => x.id === d.teeSetId) ? d : { ...d, teeSetId: tees[1]?.id ?? tees[0]?.id ?? '' })),
      rounds: c?.holes === 9 ? rounds.map(r => ({ ...r, holes: 'all' as const })) : rounds,
    })
  }
  const dates = rounds.map(r => r.date).filter(Boolean).sort()
  return (
    <SectionCard title="Rounds & course" subtitle="Where and when it's played">
      <SelectField label="Golf course *" placeholder="Choose a course" value={t.courseId} onChange={chooseCourse} error={e.courseId}
        options={MOCK_COURSES.filter(c => isSelectable(c) || c.id === t.courseId).map(c => ({ value: c.id, label: `${c.name} — ${c.city}` }))} />
      {course && (
        <div className="flex items-center gap-4 bg-canvas rounded-2xl p-3">
          <img src={course.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover" />
          <div className="flex-1 min-w-0 text-[13px]">
            <p className="font-bold font-display text-ink text-[14px]">{course.name}</p>
            <p className="text-gray-500">{course.holes} holes · Par {course.par} · {course.yardage.toLocaleString()} yds · {course.teeSets?.length ?? 0} tee sets</p>
            <p className="text-[11px] text-gray-400">Ratings, par and the scorecard come from the course and can't be changed here.</p>
          </div>
          <a href={`#/courses/${course.id}`} target="_blank" rel="noreferrer" className="text-[12px] font-bold font-display text-pine-600 hover:underline underline-offset-4">View course</a>
        </div>
      )}
      <Stepper label="Number of rounds" required value={rounds.length} min={1} max={4} onChange={changeCount} />
      <div className="space-y-3">
        {rounds.map((r, i) => (
          <div key={i} className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-start bg-canvas/60 rounded-2xl p-3">
            <Input label="Round name" value={r.name ?? ''} onChange={x => setRounds(rounds.map((y, j) => (j === i ? { ...y, name: x.target.value } : y)))} />
            <DateTimeInput label="Date" required type="date" value={r.date} error={e[`round${i}`]}
              onChange={v => setRounds(rounds.map((y, j) => (j === i ? { ...y, date: v } : y)))} />
            <Segmented label="Holes" required value={r.holes}
              options={course?.holes === 9 ? [{ value: 'all', label: '9 holes' }] : [{ value: 'all', label: '18' }, { value: 'front', label: 'Front 9' }, { value: 'back', label: 'Back 9' }]}
              onChange={v => setRounds(rounds.map((y, j) => (j === i ? { ...y, holes: v as TournamentRound['holes'] } : y)))} />
          </div>
        ))}
      </div>
      {dates.length > 0 && <Callout>Tournament dates: <b>{formatDay(dates[0])}{dates.length > 1 ? ` – ${formatDay(dates[dates.length - 1])}` : ''}</b></Callout>}
      {rounds.length > 1 && <Callout>No cut: every player plays every round (amateur and social events don’t use cuts).</Callout>}
    </SectionCard>
  )
}

function Divisions({ t, set, e }: SectionProps) {
  const course = courseOf(t)
  const tees = course?.teeSets ?? []
  const ds = t.divisions!
  const update = (i: number, patch: Partial<Division>) => set({ divisions: ds.map((d, j) => (j === i ? { ...d, ...patch } : d)) })
  const num = (v: string) => (v === '' ? undefined : Number(v))
  return (
    <SectionCard title="Divisions & tees" subtitle="Flights by handicap, and the tees each one plays"
      aside={<AddRowButton label="Add division" onClick={() => set({ divisions: [...ds, newDivision(tees[1]?.id ?? tees[0]?.id)] })} />}>
      {!course && <Callout tone="warning">Choose a course in Rounds & course to pick tees.</Callout>}
      <div className="space-y-3">
        {ds.map((d, i) => (
          <div key={d.id} className="bg-canvas/60 rounded-2xl p-3 space-y-3">
            <div className="flex gap-3 items-start">
              <div className="flex-1 grid md:grid-cols-[1.4fr_1fr] gap-3">
                <Input label="Name *" placeholder="e.g. Championship" value={d.name} onChange={x => update(i, { name: x.target.value })} />
                <SelectField label="Tee set *" placeholder="Choose tees" value={d.teeSetId} onChange={v => update(i, { teeSetId: v })}
                  options={tees.map(x => ({ value: x.id, label: `${x.name} · ${teeTotal(x).toLocaleString()} yds` }))} />
              </div>
              {ds.length > 1 && <RemoveRowButton label={`Remove ${d.name || 'division'}`} onClick={() => set({ divisions: ds.filter((_, j) => j !== i) })} />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-[minmax(170px,1.2fr)_max-content_minmax(150px,1fr)_minmax(110px,0.8fr)] gap-3 items-start">
              <RangeInput label="Handicap range" step="0.1" min={d.minHandicap} max={d.maxHandicap}
                onMin={v => update(i, { minHandicap: Number(v) })} onMax={v => update(i, { maxHandicap: Number(v) })} />
              <Segmented label="Gender" value={d.gender ?? 'any'} onChange={v => update(i, { gender: v })}
                options={[{ value: 'any', label: 'Any' }, { value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }]} />
              <RangeInput label="Age range" min={d.minAge ?? ''} max={d.maxAge ?? ''}
                onMin={v => update(i, { minAge: num(v) })} onMax={v => update(i, { maxAge: num(v) })} />
              <Input label="Max players" type="number" placeholder="No limit" value={d.maxPlayers ?? ''} onChange={x => update(i, { maxPlayers: num(x.target.value) })} />
            </div>
            {d.teeSetId && (() => {
              const tee = tees.find(x => x.id === d.teeSetId)
              return tee && (
                <p className="text-[12px] text-gray-500 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full ring-1 ring-black/15" style={{ background: teeSwatch(tee.color) }} />
                  Men {tee.menRating !== undefined ? `${tee.menRating} / ${tee.menSlope}` : 'not rated'} · Women {tee.womenRating !== undefined ? `${tee.womenRating} / ${tee.womenSlope}` : 'not rated'}
                </p>
              )
            })()}
            <FieldError error={e[`div${i}`]} />
          </div>
        ))}
      </div>
      <FieldError error={e.divisions} />
      <Callout>Golfers are placed in a division automatically from their handicap, gender and age. They can't choose their tees; you can override the tee for a player on tournament day.</Callout>
    </SectionCard>
  )
}

function Scoring({ t, set, e }: SectionProps) {
  const s = t.scoring!
  const rec = RECOMMENDED_ALLOWANCE[t.format]
  const update = (patch: Partial<typeof s>) => set({ scoring: { ...s, ...patch } })
  const scratch = s.usage === 'scratch'
  return (
    <SectionCard title="Handicap & scoring" subtitle="How handicaps are used and which results are shown">
      <OptionCards label="Handicap usage" required value={s.usage!}
        options={[
          { value: 'handicap', title: 'Handicap', description: 'Net results using each golfer’s course handicap' },
          { value: 'scratch', title: 'Scratch', description: 'Gross results only; handicaps aren’t used' },
        ]}
        onChange={v => update({ usage: v as 'handicap' | 'scratch', basis: v === 'scratch' ? 'gross' : s.basis === 'gross' ? 'gross-and-net' : s.basis })} />
      {!scratch && (
        <>
          <div className="flex items-center gap-2">
            <FieldLabel label="Handicap system" />
            <span className="h-7 px-3 rounded-full bg-canvas text-[12px] font-bold font-display text-ink inline-flex items-center">World Handicap System (WHS)</span>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <DateTimeInput label="Handicap lock date" required type="date" value={s.lockDate ?? ''} max={firstRoundDate(t) || undefined}
              onChange={v => update({ lockDate: v })} error={e.lockDate}
              hint="Default: 7 days before round 1. Course handicaps are calculated once, at lock." />
            <Input label="Maximum Handicap Index" type="number" step="0.1" value={Number.isNaN(s.maxHandicap) ? '' : s.maxHandicap}
              onChange={x => update({ maxHandicap: x.target.value === '' ? 54 : Number(x.target.value) })} error={e.maxHandicap}
              hint="Golfers above this can't enter. 54 = no limit." />
          </div>
          {t.format === 'Scramble' ? <ScrambleAllowances size={t.team?.size ?? 4} /> : (
          <div className="flex flex-col gap-1.5">
            <FieldLabel label="Handicap allowance" required />
            <div className="flex items-center gap-4">
              <input type="range" min={0} max={100} value={s.allowancePct} onChange={x => update({ allowancePct: Number(x.target.value) })}
                aria-label="Handicap allowance" className="flex-1 accent-[var(--color-ink)]" />
              <span className="w-16 text-right font-display font-extrabold text-[17px] text-ink">{s.allowancePct}%</span>
            </div>
            <FieldError error={e.allowancePct} hint={rec ? `Recommended ${rec}% for ${t.format}` : 'Set the team allowance for your scramble'} />
          </div>
          )}
        </>
      )}
      <Segmented label="Results shown" required value={s.basis} onChange={v => update({ basis: v })}
        options={[{ value: 'gross', label: 'Gross' }, { value: 'net', label: 'Net', disabled: scratch }, { value: 'gross-and-net', label: 'Gross and net', disabled: scratch }]}
        hint={t.format === 'Stableford' ? 'Stableford ranks by points; this sets which points (gross or net) count.' : undefined} />
    </SectionCard>
  )
}

function TieBreaks({ t, set, e }: SectionProps) {
  const s = t.scoring!
  const holes = courseOf(t)?.holes ?? 18
  const chosen = s.playoffHoles ?? []
  return (
    <SectionCard title="Tie-breaks" subtitle="How tied positions are decided">
      <OptionCards label="Method" required columns={3} value={s.tieBreak}
        options={[
          { value: 'countback', title: 'Countback', tag: 'Default', description: 'Back 9 → back 6 → back 3 → last hole' },
          { value: 'playoff', title: 'Playoff', description: 'Tied players play extra holes' },
          { value: 'shared', title: 'Shared position', description: 'Tied players share the place' },
        ]}
        onChange={v => set({ scoring: { ...s, tieBreak: v as typeof s.tieBreak } })} />
      {s.tieBreak === 'playoff' && (
        <div className="flex flex-col gap-2">
          <FieldLabel label="Playoff holes (in order)" required />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: holes }, (_, i) => i + 1).map(h => {
              const at = chosen.indexOf(h)
              return (
                <button key={h} type="button" aria-pressed={at >= 0}
                  onClick={() => set({ scoring: { ...s, playoffHoles: at >= 0 ? chosen.filter(x => x !== h) : [...chosen, h] } })}
                  className={`w-10 h-10 rounded-full text-[13px] font-bold font-display ${at >= 0 ? 'bg-ink text-white' : 'bg-canvas text-gray-600 hover:text-ink'}`}>{h}</button>
              )
            })}
          </div>
          <FieldError error={e.playoffHoles} hint={chosen.length ? `Played in this order: ${chosen.join(' → ')}` : undefined} />
        </div>
      )}
    </SectionCard>
  )
}

/* ───────── B · Setup ───────── */

function Registration({ t, set, e, registered }: SectionProps) {
  const r = t.registration!
  const update = (patch: Partial<typeof r>) => set({ registration: { ...r, ...patch } })
  const unit = isTeam(t) ? 'teams' : 'players'
  return (
    <SectionCard title="Registration & entry" subtitle="When and how golfers can enter">
      <div className="grid md:grid-cols-2 gap-4">
        <DateTimeInput label="Registration opens" required type="datetime-local" value={r.opensAt} onChange={v => update({ opensAt: v })} error={e.opensAt} />
        <DateTimeInput label="Registration closes" required type="datetime-local" value={r.closesAt} onChange={v => update({ closesAt: v })} error={e.closesAt}
          hint="Shown to golfers before they register" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Input label={`Maximum ${unit} *`} type="number" min={1} value={t.maxPlayers || ''} onChange={x => set({ maxPlayers: Number(x.target.value) })} error={e.maxPlayers}
          hint={registered ? `${registered} registered so far` : undefined} />
        <Input label={`Minimum ${unit}`} type="number" min={1} placeholder="Optional" value={r.minPlayers ?? ''} error={e.minPlayers}
          onChange={x => update({ minPlayers: x.target.value === '' ? undefined : Number(x.target.value) })} hint="You'll be warned if it isn't reached" />
      </div>
      <Segmented label="Registration method" required value={r.method ?? 'self'} onChange={v => update({ method: v })}
        options={[{ value: 'self', label: 'Golfers register themselves' }, { value: 'organizer', label: 'I add players' }, { value: 'both', label: 'Both' }]} />
      <FieldGroup title="Entry">
        <div className="space-y-4">
          <Toggle label="Official handicap required" checked={t.eligibility!.officialHandicapRequired} onChange={v => set({ eligibility: { ...t.eligibility!, officialHandicapRequired: v } })} />
          <Toggle label="Club members only" checked={t.eligibility!.membersOnly} onChange={v => set({ eligibility: { ...t.eligibility!, membersOnly: v } })} />
        </div>
        <p className="text-[12px] text-gray-500">Age, gender and handicap limits are set through divisions. There’s no waiting list: when the field is full, registration closes and you manage changes on the Tournament day page.</p>
      </FieldGroup>
      <FieldGroup title="Withdrawal">
        <Toggle label="Allow withdrawal" checked={!!r.allowWithdrawal} onChange={v => update({ allowWithdrawal: v, withdrawBy: v ? r.withdrawBy : '' })} />
        {r.allowWithdrawal && (
          <div className="md:w-1/2">
            <DateTimeInput label="Free withdrawal until" required type="datetime-local" value={r.withdrawBy} onChange={v => update({ withdrawBy: v })} error={e.withdrawBy} />
          </div>
        )}
      </FieldGroup>
      <Callout>Registered golfers can see the participant list with names and handicaps only — never contact details.</Callout>
    </SectionCard>
  )
}

function Fees({ t, set, e, registered }: SectionProps) {
  const f = t.fees!
  const update = (patch: Partial<typeof f>) => set({ fees: { ...f, ...patch } })
  const lockedFee = registered > 0
  const { tax, total } = feeTotal(t)
  return (
    <SectionCard title="Fees" subtitle="What golfers pay to enter">
      {lockedFee && <Callout tone="warning">Golfers have registered, so the fee can't change. Charge anything extra separately.</Callout>}
      <fieldset disabled={lockedFee} className="space-y-6 min-w-0">
        <Segmented label="Fee type" required value={f.type ?? 'per-player'} onChange={v => update({ type: v })}
          options={[{ value: 'free', label: 'Free' }, { value: 'per-player', label: 'Per player' }, { value: 'per-team', label: 'Per team' }, { value: 'per-group', label: 'Per group' }]} />
        {f.type !== 'free' && (
          <>
            <div className="grid md:grid-cols-[1fr_160px] gap-4">
              <Input label="Amount *" type="number" min={0} step="0.01" value={f.amount || ''} onChange={x => update({ amount: Number(x.target.value) })} error={e.amount} />
              <SelectField label="Currency *" value={f.currency} options={CURRENCIES} onChange={v => update({ currency: v })} error={e.currency} />
            </div>
            <div className="space-y-3">
              <Toggle label="Add tax / HST" hint="Added on top of the fee" checked={f.taxRate !== undefined} onChange={v => update({ taxRate: v ? 13 : undefined })} />
              {f.taxRate !== undefined && (
                <div className="md:w-1/3">
                  <Input label="Tax rate (%) *" type="number" min={0} max={100} step="0.01" value={f.taxRate} onChange={x => update({ taxRate: Number(x.target.value) })} error={e.taxRate} />
                </div>
              )}
              {f.amount > 0 && (
                <p className="text-[14px] font-display font-bold text-ink">
                  {formatMoney(f.amount, f.currency)}{f.taxRate !== undefined && <> + tax {formatMoney(tax, f.currency)} = {formatMoney(total, f.currency)}</>}
                  <span className="text-gray-500 font-semibold"> {f.type === 'per-team' ? 'per team' : f.type === 'per-group' ? 'per group' : 'per player'}</span>
                </p>
              )}
            </div>
            <ChoiceChips label="What's included" options={FEE_INCLUDES} value={f.includes} onChange={v => update({ includes: v as string[] })} />
          </>
        )}
      </fieldset>
      <Textarea label="Refund policy" placeholder="e.g. Full refund until the withdrawal deadline, then 50% until registration closes."
        value={t.registration!.refundPolicy} onChange={x => set({ registration: { ...t.registration!, refundPolicy: x.target.value } })} style={{ minHeight: 90 }} />
      <Callout tone="warning">The fee can't be changed once a golfer has paid. Card details are only asked for when golfers pay.</Callout>
    </SectionCard>
  )
}

function TeeSheet({ t, set, e }: SectionProps) {
  const s = t.teeSheet!
  const update = (patch: Partial<typeof s>) => set({ teeSheet: { ...s, ...patch } })
  const pv = teeSheetPreview(t)
  const holes = courseOf(t)?.holes ?? 18
  const shotgun = s.startType === 'shotgun'
  return (
    <SectionCard title="Tee sheet & pairings" subtitle="How groups are started on the day">
      <OptionCards label="Start type" required value={s.startType} error={e.startType}
        options={[
          { value: 'tee-times', title: 'Tee times', description: 'Groups start one after another' },
          { value: 'shotgun', title: 'Shotgun', description: 'All groups start together on different holes' },
        ]}
        onChange={v => update({ startType: v as typeof s.startType })} />
      <div className="grid xl:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <DateTimeInput label={shotgun ? 'Shotgun start time' : 'First tee time'} required type="time" value={s.firstTeeTime} onChange={v => update({ firstTeeTime: v })} error={e.firstTeeTime} />
            {!shotgun && <Stepper label="Interval" required suffix="min" value={s.intervalMinutes} min={5} max={20} onChange={v => update({ intervalMinutes: v })} error={e.intervalMinutes} />}
          </div>
          {!shotgun && holes === 18 && (
            <Segmented label="Starting tees" required value={s.startingTees} onChange={v => update({ startingTees: v })}
              options={[{ value: 'first', label: '1st tee' }, { value: 'first-and-tenth', label: '1st and 10th' }]} />
          )}
          <Segmented label="Group size" required value={s.groupSize} onChange={v => update({ groupSize: v })}
            options={[2, 3, 4].map(n => ({ value: n as 2 | 3 | 4, label: String(n) }))} hint="4 is standard" />
          <Segmented label="Pairing method" required value={s.pairing ?? 'automatic'} onChange={v => update({ pairing: v })}
            options={[{ value: 'automatic', label: 'Automatic' }, { value: 'manual', label: 'Manual' }]}
            hint={s.pairing === 'manual' ? 'You build the groups on the Tournament day page' : 'Groups are made from the field when registration closes'} />
          <div className="md:w-1/2">
            <DateTimeInput label="Publish tee sheet on" type="datetime-local" value={s.publishAt ?? ''} onChange={v => update({ publishAt: v })} error={e.publishAt}
              hint="When golfers can see their tee time (optional)" />
          </div>
        </div>
        <div className="bg-canvas rounded-2xl p-4">
          <p className="text-[13px] font-bold font-display text-ink mb-3">Tee sheet preview</p>
          {pv.groups ? (
            <>
              <table className="w-full text-[13px]">
                <thead><tr className="text-[11px] text-gray-400 font-bold font-display text-left"><th className="pb-1.5">Time</th><th className="pb-1.5">{shotgun ? 'Hole' : 'Tee'}</th><th className="pb-1.5 text-right">Group</th></tr></thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {pv.rows.map(r => <tr key={r.group}><td className="py-1.5 font-semibold text-ink">{formatClock(r.time)}</td><td className="py-1.5">{r.tee}</td><td className="py-1.5 text-right text-gray-500">{r.group}</td></tr>)}
                </tbody>
              </table>
              <p className="text-[12px] text-gray-500 mt-3">{pv.groups} groups{shotgun ? ` · fits ${pv.capacity} players` : ` · last tee time ${formatClock(pv.last)}`}</p>
            </>
          ) : <p className="text-[12px] text-gray-500">Set the maximum number of players (Registration) to see the tee sheet.</p>}
        </div>
      </div>
    </SectionCard>
  )
}

function Rules({ t, set, e }: SectionProps) {
  const { showToast } = useApp()
  const officials = t.officials ?? []
  const updateOfficial = (i: number, patch: Partial<Official>) => set({ officials: officials.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const pace = t.pace!
  const addRule = (text: string) => set({ localRules: [t.localRules?.trim(), text].filter(Boolean).join('\n') })
  return (
    <div className="space-y-5">
      <SectionCard title="Local rules" subtitle="The R&A / USGA Rules of Golf apply. Add the committee's local rules, one per line.">
        <div className="flex flex-wrap gap-2">
          {Object.keys(LOCAL_RULE_TEMPLATES).map(k => (
            <button key={k} type="button" onClick={() => addRule(LOCAL_RULE_TEMPLATES[k])} disabled={t.localRules?.includes(LOCAL_RULE_TEMPLATES[k])}
              className="h-9 px-4 rounded-full bg-canvas text-[13px] font-bold font-display text-ink hover:bg-gray-200 disabled:opacity-40">+ {k}</button>
          ))}
        </div>
        <Textarea label="Local rules" placeholder="One rule per line" value={t.localRules ?? ''} onChange={x => set({ localRules: x.target.value })} />
      </SectionCard>
      <SectionCard title="Pace of play" subtitle="Groups behind target appear on the marshal dashboard">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <FieldLabel label="Target round time" required />
            <div className="flex gap-2">
              <select aria-label="Hours" value={Math.floor(pace.targetMinutes / 60)} onChange={x => set({ pace: { ...pace, targetMinutes: Number(x.target.value) * 60 + (pace.targetMinutes % 60) } })}
                className="h-[52px] rounded-2xl bg-canvas px-4 text-[15px] flex-1">{[2, 3, 4, 5, 6].map(h => <option key={h} value={h}>{h} h</option>)}</select>
              <select aria-label="Minutes" value={pace.targetMinutes % 60} onChange={x => set({ pace: { ...pace, targetMinutes: Math.floor(pace.targetMinutes / 60) * 60 + Number(x.target.value) } })}
                className="h-[52px] rounded-2xl bg-canvas px-4 text-[15px] flex-1">{[0, 15, 30, 45].map(m => <option key={m} value={m}>{m} min</option>)}</select>
            </div>
            <FieldError error={e.pace} />
          </div>
          <Stepper label="Flag a group when behind by" required suffix="min" value={pace.flagMinutes} min={1} max={60} onChange={v => set({ pace: { ...pace, flagMinutes: v } })} error={e.flag} />
        </div>
      </SectionCard>
      <SectionCard title="Marshals, officials & team" subtitle="Marshals and tournament officials get a login for this tournament only. It stops working when the tournament closes."
        aside={<AddRowButton label="Add person" onClick={() => set({ officials: [...officials, { name: '', role: 'Marshal', phone: '', email: '' }] })} />}>
        <div className="grid md:grid-cols-3 gap-2 mb-1">
          {[
            ['Marshal / starter', 'Pace of play, tee sheet, cart and rules issues on the course. Can’t change scores.'],
            ['Tournament official', 'The committee: checks scorecards, settles disputes, corrects scores with a reason.'],
            ['Co-organizer', 'Contact only. Give co-organisers console access from Team.'],
          ].map(([title, body]) => (
            <div key={title} className="bg-canvas rounded-2xl px-4 py-3">
              <p className="text-[13px] font-bold font-display text-ink">{title}</p>
              <p className="text-[12px] text-gray-500 leading-relaxed mt-0.5">{body}</p>
            </div>
          ))}
        </div>
        {officials.length === 0 ? <p className="text-[13px] text-gray-500">No one yet. Add a marshal slot even if you fill it later.</p> : (
          <div className="space-y-3">
            {officials.map((o, i) => {
              const access = staffRoleOf(o)
              const status = access ? slotStatus(t, o) : null
              const canInvite = access && o.name.trim() && EMAIL_RE.test(o.email?.trim() ?? '')
              return (
                <div key={i} className="rounded-2xl ring-1 ring-black/[0.06] p-3">
                  <div className="flex gap-3 items-start">
                    <div className="flex-1 grid md:grid-cols-4 gap-3">
                      <Input label={access ? 'Name' : 'Name *'} placeholder={access ? 'Open slot' : ''} value={o.name} onChange={x => updateOfficial(i, { name: x.target.value })} />
                      <SelectField label="Role *" value={o.role} options={OFFICIAL_ROLES.includes(o.role) ? OFFICIAL_ROLES : [...OFFICIAL_ROLES, o.role]} onChange={v => updateOfficial(i, { role: v })} />
                      <Input label={access ? 'Email (their login)' : 'Email'} type="email" value={o.email ?? ''} onChange={x => updateOfficial(i, { email: x.target.value, invitedAt: undefined })} />
                      <Input label="Phone" type="tel" value={o.phone} onChange={x => updateOfficial(i, { phone: x.target.value })} />
                    </div>
                    <RemoveRowButton label={`Remove ${o.name || 'person'}`} onClick={() => set({ officials: officials.filter((_, j) => j !== i) })} />
                  </div>
                  {status && (
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <SlotChip status={status} invited={!!o.invitedAt} />
                      {canInvite && status === 'invited' && (
                        <button type="button" onClick={() => { const code = sendInvite(o.email!); updateOfficial(i, { invitedAt: new Date().toISOString() }); showToast(`Invite sent to ${o.email} — code ${code} (shown for the demo; valid 24 hours)`) }}
                          className="h-8 px-3.5 rounded-full bg-canvas text-[12px] font-bold font-display text-ink hover:bg-gray-200">
                          {o.invitedAt ? 'Resend login' : 'Send login'}
                        </button>
                      )}
                      <span className="text-[12px] text-gray-500">{access === 'marshal' ? 'Marshal console' : 'Official console'}{status === 'open' ? ' · add a name and email to give them a login' : ''}</span>
                    </div>
                  )}
                  <FieldError error={e[`official${i}`]} />
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function Results({ t, set }: SectionProps) {
  const steps = ['Calculated automatically', 'You review and approve', 'Released to golfers']
  return (
    <SectionCard title="Scoring & results" subtitle="How scores are checked and when golfers see results">
      <OptionCards label="Score verification" required value={t.scoreVerification!}
        options={[
          { value: 'organizer', title: 'Golfer submits, organiser verifies', description: 'Cards are checked before they count' },
          { value: 'none', title: 'Not required', description: 'Submitted cards count straight away' },
        ]}
        onChange={v => set({ scoreVerification: v as 'organizer' | 'none' })} />
      <FieldGroup title="Results release" hint="Results are released after the round is complete">
        <ol className="flex flex-col md:flex-row gap-2">
          {steps.map((s, i) => (
            <li key={s} className="flex-1 bg-canvas rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-ink text-lime-400 text-[12px] font-bold flex items-center justify-center">{i + 1}</span>
              <span className="text-[13px] font-semibold text-ink">{s}</span>
            </li>
          ))}
        </ol>
      </FieldGroup>
      <FieldGroup title="Leaderboard views">
        <div className="flex flex-wrap gap-2">
          {['Overall', 'Division', ...(t.scoring!.basis !== 'net' ? ['Gross'] : []), ...(t.scoring!.basis !== 'gross' ? ['Net'] : []), ...(isTeam(t) ? ['Team'] : [])].map(v => (
            <span key={v} className="h-8 px-3.5 rounded-full bg-canvas text-[12px] font-bold font-display text-gray-600 inline-flex items-center">{v}</span>
          ))}
        </div>
      </FieldGroup>
      <Callout>Score corrections always need a reason and are logged. Player statuses (WD, No show, DNF, DQ) are set on the Tournament day page. Golfers can download only their own scorecard.</Callout>
    </SectionCard>
  )
}

function Prizes({ t, set, e }: SectionProps) {
  const prizes = t.prizes ?? []
  const update = (i: number, patch: Partial<Prize>) => set({ prizes: prizes.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const holes = courseOf(t)?.holes ?? 18
  return (
    <SectionCard title="Prizes" subtitle="Optional: overall, division and on-course prizes"
      aside={<AddRowButton label="Add prize" onClick={() => set({ prizes: [...prizes, { id: `prz-${Date.now().toString(36)}`, label: '', value: '', category: 'Overall winner' }] })} />}>
      {prizes.length === 0 ? <p className="text-[13px] text-gray-500">No prizes yet.</p> : (
        <div className="space-y-3">
          {prizes.map((p, i) => (
            <div key={p.id}>
              <div className="flex gap-3 items-start">
                <div className="flex-1 grid md:grid-cols-[1fr_1fr_110px_1.4fr] gap-3">
                  <SelectField label="Category *" value={p.category ?? ''} options={PRIZE_CATEGORIES} onChange={v => update(i, { category: v, hole: HOLE_PRIZES.includes(v) ? p.hole : undefined })} />
                  <SelectField label="Division" value={p.divisionId ?? ''} options={[{ value: '', label: 'Overall' }, ...t.divisions!.map(d => ({ value: d.id, label: d.name || 'Unnamed' }))]}
                    onChange={v => update(i, { divisionId: v || undefined })} />
                  {HOLE_PRIZES.includes(p.category ?? '') ? (
                    <SelectField label="Hole *" value={p.hole ? String(p.hole) : ''} placeholder="—" options={Array.from({ length: holes }, (_, h) => String(h + 1))}
                      onChange={v => update(i, { hole: Number(v) })} />
                  ) : <div className="hidden md:block" />}
                  <Input label="Prize *" placeholder="e.g. Trophy + $500 pro-shop credit" value={p.value} onChange={x => update(i, { value: x.target.value })} />
                </div>
                <RemoveRowButton label="Remove prize" onClick={() => set({ prizes: prizes.filter((_, j) => j !== i) })} />
              </div>
              {p.category === 'Custom' && <div className="mt-2 md:w-1/3"><Input label="Prize name" value={p.label} onChange={x => update(i, { label: x.target.value })} /></div>}
              <FieldError error={e[`prize${i}`]} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function Visibility(_: SectionProps) {
  return (
    <SectionCard title="Communication & visibility" subtitle="Who can see the tournament and what golfers are sent">
      <Toggle label="Registration confirmation" hint="Sent by each golfer's preferred contact method (email by default)" checked onChange={() => {}} />
      <div className="flex flex-col gap-1.5">
        <FieldLabel label="Visibility" required />
        <span className="self-start h-9 px-4 rounded-full bg-ink text-white text-[13px] font-bold font-display inline-flex items-center">Public — anyone can find it</span>
      </div>
      <p className="text-[12px] text-gray-500">Every change is recorded in the tournament's history.</p>
    </SectionCard>
  )
}

/* ───────── C · Review & publish ───────── */

function Review({ t, errors, warnings, onEdit, action }: { t: Tournament; errors: Parameters<typeof ValidationPanel>[0]['errors']; warnings: Parameters<typeof ValidationPanel>[0]['warnings']; onEdit: (k: SectionKey) => void; action: 'publish' | 'save' }) {
  const course = courseOf(t)
  const rounds = [...t.rounds!].filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date))
  const f = t.fees!
  const { total } = feeTotal(t)
  const tee = (id: string) => course?.teeSets?.find(x => x.id === id)?.name
  const dt = (v: string) => (v ? `${formatDay(v.slice(0, 10))}, ${formatClock(v.slice(11, 16))}` : '')
  const fee = f.type === 'free' ? 'Free' : `${formatMoney(total, f.currency)}${f.taxRate ? ' incl. tax' : ''} ${f.type === 'per-team' ? 'per team' : f.type === 'per-group' ? 'per group' : 'per player'}`
  const cards: { title: string; edit: SectionKey; rows: [string, ReactNode][] }[] = [
    { title: 'Basics & format', edit: 'basics', rows: [
      ['Name', t.name], ['Category', t.category], ['Format', `${t.format}${isTeam(t) ? ` · teams of ${t.team!.size}` : ''}`],
      ['Contact', [t.contactPerson, t.contactEmail].filter(Boolean).join(' · ')], ['Time zone', t.timeZone],
    ] },
    { title: 'Rounds, course & divisions', edit: 'rounds', rows: [
      ['Course', course?.name], ['Rounds', rounds.map(r => `${formatDay(r.date)} (${r.holes === 'all' ? course?.holes ?? 18 : r.holes === 'front' ? 'front 9' : 'back 9'})`).join(' · ')],
      ['Divisions', t.divisions!.map(d => `${d.name || '—'} (${tee(d.teeSetId) ?? 'no tees'})`).join(' · ')],
    ] },
    { title: 'Handicap, scoring & tie-breaks', edit: 'scoring', rows: [
      ['Handicaps', t.scoring!.usage === 'scratch' ? 'Scratch — gross only' : `WHS, ${t.scoring!.allowancePct}% allowance, max ${t.scoring!.maxHandicap}`],
      ['Handicap lock', t.scoring!.usage === 'scratch' ? '' : t.scoring!.lockDate ? formatDay(t.scoring!.lockDate) : ''],
      ['Results', t.scoring!.basis === 'gross-and-net' ? 'Gross and net' : t.scoring!.basis === 'net' ? 'Net' : 'Gross'],
      ['Ties', t.scoring!.tieBreak === 'countback' ? 'Countback' : t.scoring!.tieBreak === 'playoff' ? `Playoff (holes ${t.scoring!.playoffHoles?.join(', ')})` : 'Shared'],
    ] },
    { title: 'Registration & fees', edit: 'registration', rows: [
      ['Opens', dt(t.registration!.opensAt)], ['Closes', dt(t.registration!.closesAt)],
      ['Field', `${t.registration!.minPlayers ? `${t.registration!.minPlayers}–` : 'up to '}${t.maxPlayers || '—'} ${isTeam(t) ? 'teams' : 'players'}`],
      ['Fee', fee], ['Free withdrawal until', t.registration!.allowWithdrawal ? dt(t.registration!.withdrawBy) : 'Withdrawal not allowed'],
    ] },
    { title: 'Tee sheet & officials', edit: 'teesheet', rows: [
      ['Start', t.teeSheet!.startType === 'shotgun' ? `Shotgun at ${formatClock(t.teeSheet!.firstTeeTime)}` : `Tee times from ${formatClock(t.teeSheet!.firstTeeTime)}, every ${t.teeSheet!.intervalMinutes} min`],
      ['Groups', `${t.teeSheet!.groupSize} · ${t.teeSheet!.pairing === 'manual' ? 'manual' : 'automatic'} pairings`],
      ['Pace of play', `${Math.floor(t.pace!.targetMinutes / 60)}h ${t.pace!.targetMinutes % 60}m · flag at ${t.pace!.flagMinutes} min behind`],
      ['Officials', (t.officials ?? []).map(o => `${o.name} (${o.role})`).join(' · ') || 'None'],
    ] },
    { title: 'Rules, prizes & visibility', edit: 'rules', rows: [
      ['Local rules', t.localRules?.trim() ? `${t.localRules.trim().split('\n').length} rule(s)` : 'None'],
      ['Score verification', t.scoreVerification === 'none' ? 'Not required' : 'Organiser verifies'],
      ['Prizes', (t.prizes ?? []).map(p => p.category === 'Custom' ? p.label || 'Prize' : p.category).join(' · ') || 'None'],
      ['Visibility', 'Public'],
    ] },
  ]
  return (
    <div className="grid xl:grid-cols-[1fr_340px] gap-6 items-start">
      <div className="space-y-5">
        <div className="bg-ink rounded-[28px] p-5 flex gap-5 items-center relative overflow-hidden">
          <div className="absolute inset-y-0 right-0 w-1/2 pointer-events-none" style={{ background: 'linear-gradient(90deg, rgba(200,236,90,0) 0%, rgba(200,236,90,0.18) 100%)' }} />
          {t.imageUrl && <img src={t.imageUrl} alt="" className="relative w-28 h-20 rounded-2xl object-cover" />}
          <div className="relative min-w-0">
            <p className="text-[12px] font-bold font-display text-lime-400">{t.category || 'Tournament'} · {t.format}</p>
            <h2 className="text-[22px] font-extrabold font-display text-white tracking-tight truncate">{t.name || 'Untitled tournament'}</h2>
            <p className="text-[13px] text-white/60">{rounds.length ? `${formatDay(rounds[0].date)}${rounds.length > 1 ? ` – ${formatDay(rounds[rounds.length - 1].date)}` : ''}` : 'No dates yet'} · {course?.name ?? 'No course'} · {t.maxPlayers || '—'} {isTeam(t) ? 'teams' : 'players'} · {fee}</p>
          </div>
        </div>
        <div className="grid lg:grid-cols-2 gap-5">
          {cards.map(c => <SummaryCard key={c.title} title={c.title} rows={c.rows} onEdit={() => onEdit(c.edit)} />)}
        </div>
        <a href={`#/tournaments/${t.id}`} onClick={ev => { if (t.status === 'draft') { ev.preventDefault() } }}
          className={`inline-block text-[13px] font-bold font-display ${t.status === 'draft' ? 'text-gray-400 cursor-not-allowed' : 'text-pine-600 hover:underline underline-offset-4'}`}
          title={t.status === 'draft' ? 'Available once the tournament is published' : undefined}>Preview as golfer ↗</a>
      </div>
      <div className="xl:sticky xl:top-6">
        <ValidationPanel errors={errors} warnings={warnings} onFix={k => onEdit(k as SectionKey)} action={action} />
      </div>
    </div>
  )
}
