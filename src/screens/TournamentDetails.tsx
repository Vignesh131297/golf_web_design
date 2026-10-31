import { useState, type ReactNode } from 'react'
import type { Division, Tournament } from '../types'
import {
  Button, StatusBadge, GlassChip, InfoTile, SpotsBar, EmptyState,
  IconCalendar, IconClock, IconCourse, IconUsers, IconCheckCircle,
  VerifiedTick,
} from '../components'
import { getTournament, getCourse, MOCK_PROFILE } from '../data'
import { ratingsGenderOf } from '../account-rules'
import { isPublicTournament, organizerName } from '../admin/access'
import { useApp } from '../app-context'
import { navigate } from '../router'
import { useFakeLoad } from '../shell'
import { useDataVersion } from '../store'
import { entriesFor, groupOf, myEntry, registerMe, registrantsFor, ticksFor, useLiveVersion, withdrawMe } from '../live'
import {
  TIE_BREAK_OPTIONS, isoDate, isoLocalDateTime, formatClock, formatDateTime, formatDay, formatMoney, teeSwatch, teeTotal,
  divisionForGolfer, feeUnit, withTax,
} from '../golf'
import { PaymentSheet } from '../payments'
import MoreTournaments from './MoreTournaments'

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 text-[14px] font-semibold font-display text-gray-500 hover:text-ink mb-5 group">
      <span className="w-9 h-9 rounded-full bg-white shadow-card flex items-center justify-center group-hover:-translate-x-0.5 transition-transform">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="#0c1a12" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
      {label}
    </button>
  )
}

function Notice({ tone, title, body }: { tone: 'rose' | 'amber' | 'gray' | 'lime'; title: string; body: string }) {
  const tones = { rose: 'bg-rose-50 text-rose-700', amber: 'bg-amber-50 text-amber-700', gray: 'bg-canvas text-gray-700', lime: 'bg-lime-300/50 text-ink' }
  return (
    <div className={`rounded-2xl px-5 py-4 ${tones[tone]}`}>
      <p className="text-sm font-bold font-display">{title}</p>
      <p className="text-[13px] opacity-80 mt-0.5 leading-relaxed">{body}</p>
    </div>
  )
}

/**
 * Who's playing (client, 17 Oct): golfers registered for the tournament can see the registrant list —
 * name, division and handicap only, never contact details. Everyone else sees just the count.
 */
function WhosPlaying({ t, players, isRegistered }: { t: Tournament; players: number; isRegistered: boolean }) {
  const [q, setQ] = useState('')
  const [all, setAll] = useState(false)
  const list = registrantsFor(t.id)
  const shown = list.filter(e => !q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase()))
  const division = (id: string) => t.divisions?.find(d => d.id === id)?.name ?? ''
  return (
    <section id="whos-playing" className="bg-white rounded-[28px] shadow-card p-6 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-bold text-ink text-[19px] tracking-tight">Who's playing</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">{players} registered{players > list.length && isRegistered ? ` · ${list.length} shown in the prototype` : ''}</p>
        </div>
        {isRegistered && list.length > 8 && (
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a player" aria-label="Find a player"
            className="h-10 w-[220px] rounded-full bg-canvas px-4 text-[14px] border border-transparent focus:border-pine-400 focus:outline-none" />
        )}
      </div>
      {!isRegistered ? (
        <div className="flex items-center gap-3 rounded-2xl bg-canvas px-4 py-3.5">
          <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-gray-400 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8"/><path d="M8 10.5V7.5a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </span>
          <p className="text-[14px] text-gray-600">Registered golfers can see who else is playing. Register to see the list.</p>
        </div>
      ) : (
        <>
          <ul className="grid sm:grid-cols-2 gap-x-6">
            {(all || q ? shown : shown.slice(0, 10)).map(e => (
              <li key={e.id} className="flex items-center gap-3 py-2.5 border-b border-black/[0.05]">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center font-display font-extrabold text-[12px] flex-shrink-0 ${e.isMe ? 'bg-lime-400 text-ink' : 'bg-canvas text-ink'}`}>
                  {e.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('')}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1 text-[14px] font-semibold text-ink min-w-0"><span className="truncate">{e.name}</span>{ticksFor(e).id && <VerifiedTick kind="id" />}{e.isMe && <span className="ml-0.5 text-[11px] font-bold text-pine-700">You</span>}</span>
                  <span className="block text-[12px] text-gray-500 truncate">{division(e.divisionId)}</span>
                </span>
                <span className="flex items-center gap-1 text-[13px] font-semibold text-gray-600">{e.handicapIndex < 0 ? `+${Math.abs(e.handicapIndex).toFixed(1)}` : e.handicapIndex.toFixed(1)}{ticksFor(e).handicap && <VerifiedTick kind="handicap" size={13} />}</span>
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className="text-[14px] text-gray-500 py-4">No player matches "{q}".</p>}
          {!q && shown.length > 10 && (
            <button onClick={() => setAll(!all)} className="mt-3 text-[13px] font-bold font-display text-ink underline underline-offset-4 decoration-lime-500 decoration-2">
              {all ? 'Show fewer' : `Show all ${shown.length}`}
            </button>
          )}
          <p className="text-[12px] text-gray-400 mt-3">Only players in this tournament see this list. Contact details are never shown.</p>
        </>
      )}
    </section>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-[28px] shadow-card p-6 lg:p-7">
      <h2 className="font-display font-bold text-ink text-[19px] tracking-tight mb-4">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-[14px] text-gray-500">{label}</dt>
      <dd className="text-[14px] font-semibold text-ink text-right">{value}</dd>
    </div>
  )
}

/** Why the signed-in golfer can't enter, or null when eligible. */
function eligibilityProblem(t: Tournament): string | null {
  const e = t.eligibility
  const hcp = MOCK_PROFILE.handicapIndex
  if (!e) return null
  if (e.maxHandicap !== undefined && hcp > e.maxHandicap) return `Handicap index ${e.maxHandicap} or lower is required (yours is ${hcp.toFixed(1)}).`
  if (e.minHandicap !== undefined && hcp < e.minHandicap) return `Handicap index ${e.minHandicap} or higher is required.`
  if (e.gender === 'men' && ratingsGenderOf(MOCK_PROFILE) === 'women') return 'This event is for men.'
  if (e.gender === 'women' && ratingsGenderOf(MOCK_PROFILE) !== 'women') return 'This event is for women.'
  if (e.officialHandicapRequired && !MOCK_PROFILE.handicapBody) return 'An official handicap is required.'
  if (e.membersOnly && MOCK_PROFILE.membership !== 'Member') return 'This event is for members of the host club.'
  if (e.minAge !== undefined || e.maxAge !== undefined) {
    const age = MOCK_PROFILE.dob ? Math.floor((Date.now() - new Date(MOCK_PROFILE.dob).getTime()) / 31_557_600_000) : undefined
    if (age !== undefined && e.minAge !== undefined && age < e.minAge) return `Players must be ${e.minAge} or older.`
    if (age !== undefined && e.maxAge !== undefined && age > e.maxAge) return `Players must be ${e.maxAge} or younger.`
  }
  return null
}

const myAge = () => (MOCK_PROFILE.dob ? Math.floor((Date.now() - new Date(MOCK_PROFILE.dob).getTime()) / 31_557_600_000) : undefined)
const divisionFor = (divisions: Division[] = [], hcp: number) =>
  divisionForGolfer(divisions, { index: hcp, gender: ratingsGenderOf(MOCK_PROFILE), age: myAge() })

export default function TournamentDetails({ id }: { id: string }) {
  const [paying, setPaying] = useState(false)
  useDataVersion()
  useLiveVersion()
  const { showToast, showDialog, touchProfile } = useApp()
  const loading = useFakeLoad(600)
  // Drafts and events from organisers awaiting approval aren't public
  const found = getTournament(id)
  const t = found && isPublicTournament(found) ? found : undefined

  const goBack = () => (window.history.length > 1 ? window.history.back() : navigate('/tournaments'))

  if (loading) {
    return (
      <div>
        <div className="h-9 w-40 skeleton rounded-full mb-5" />
        <div className="h-[380px] skeleton rounded-[32px]" />
        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 mt-6">
          <div className="h-64 skeleton rounded-[28px]" />
          <div className="h-80 skeleton rounded-[28px]" />
        </div>
      </div>
    )
  }

  if (!t) {
    return (
      <div className="bg-white rounded-[32px] shadow-card">
        <EmptyState title="Tournament not found" subtitle="This tournament may have been removed or the link is invalid."
          action={{ label: 'Back to tournaments', onClick: () => navigate('/tournaments') }} />
      </div>
    )
  }

  const course = getCourse(t.courseId)
  const me = myEntry(t.id)
  const field = entriesFor(t.id).filter(e => e.status === 'registered')
  const players = Math.max(t.players, field.length)
  const spotsLeft = t.maxPlayers - players
  const fees = t.fees!
  const reg = t.registration!
  const now = isoLocalDateTime()
  const windowOpen = !reg.opensAt || (now >= reg.opensAt && now <= reg.closesAt)

  const isCancelled  = t.status === 'cancelled'
  const isCompleted  = t.status === 'completed'
  const isLive       = t.status === 'in-progress'
  const isRegistered = me?.status === 'registered'
  const isWaitlisted = me?.status === 'waitlist'
  const isOpen       = t.registrationStatus === 'open' && !isCancelled && !isCompleted && !isLive
  const isComingSoon = t.registrationStatus === 'coming-soon'
  const isClosed     = (t.registrationStatus === 'closed' || t.status === 'registration-closed') && !isCancelled && !isCompleted && !isLive
  const problem      = eligibilityProblem(t)
  const myDivision   = t.divisions?.find(d => d.id === me?.divisionId) ?? divisionFor(t.divisions, MOCK_PROFILE.handicapIndex)
  const myGroup      = me ? groupOf(t.id, 1, me.id) : undefined
  const earlyBird    = fees.earlyBirdAmount !== undefined && fees.earlyBirdUntil && isoDate(new Date()) <= fees.earlyBirdUntil
  const priceNow     = earlyBird ? fees.earlyBirdAmount! : MOCK_PROFILE.membership === 'Member' && fees.memberAmount !== undefined ? fees.memberAmount : fees.amount

  const badgeStatus =
    isLive ? 'in-progress' : isCancelled ? 'cancelled' : isCompleted ? 'completed' : isRegistered ? 'registered'
    : isOpen ? 'open' : isComingSoon ? 'coming-soon' : 'closed'

  function register() {
    if (MOCK_PROFILE.emailVerified === false) {
      showDialog({
        title: 'Verify your email to register',
        message: `We sent a verification link to ${MOCK_PROFILE.email}. Verify it, then register for ${t!.name}.`,
        confirmLabel: 'Open verification link (demo)',
        cancelLabel: 'Later',
        onConfirm: () => { MOCK_PROFILE.emailVerified = true; touchProfile(); showToast('Email verified — you can register now') },
      })
      return
    }
    if (!myDivision) { showToast('No division matches your handicap', 'error'); return }
    // No waiting list (client answer T-04): a full field simply closes
    if (spotsLeft <= 0) { showToast('The field is full — contact the organiser', 'info'); return }
    // Online payment from the first release (client answer T-06)
    if (withTax(priceNow, fees) > 0) { setPaying(true); return }
    showDialog({
      title: 'Confirm your entry',
      message: `${t!.name} · ${myDivision.name} division · free entry. You can withdraw until ${formatDateTime(reg.withdrawBy)}.`,
      confirmLabel: 'Register',
      onConfirm: () => { registerMe(t!, myDivision.id, false, 'free'); showToast(`You're registered for ${t!.name}!`) },
    })
  }

  function withdraw() {
    const late = reg.withdrawBy && now > reg.withdrawBy
    showDialog({
      title: 'Withdraw from this tournament?',
      message: late ? `The free withdrawal deadline has passed. ${reg.refundPolicy}` : reg.refundPolicy || 'Your spot will be released.',
      confirmLabel: 'Withdraw',
      cancelLabel: 'Keep my spot',
      destructive: true,
      onConfirm: () => { withdrawMe(t!.id); showToast('You have withdrawn', 'info') },
    })
  }

  const primaryAction =
    isLive && isRegistered ? <Button fullWidth onClick={() => navigate(`/tournaments/${t.id}/play`)}>Enter my scores</Button>
    : isLive || isCompleted ? <Button fullWidth onClick={() => navigate(`/tournaments/${t.id}/leaderboard`)}>{isLive ? 'Live leaderboard' : 'Results'}</Button>
    : isCancelled ? <Button variant="ghost" disabled fullWidth>Tournament cancelled</Button>
    : isRegistered || isWaitlisted ? <Button variant="danger" fullWidth onClick={withdraw}>{isWaitlisted ? 'Leave waiting list' : 'Withdraw'}</Button>
    : isClosed || !windowOpen ? <Button variant="ghost" disabled fullWidth>{now < reg.opensAt ? `Opens ${formatDateTime(reg.opensAt)}` : 'Registration closed'}</Button>
    : isComingSoon ? <Button fullWidth onClick={() => showToast("You'll be notified when registration opens")}>Notify me</Button>
    : problem ? <Button variant="ghost" disabled fullWidth>Not eligible</Button>
    : spotsLeft <= 0 ? <Button variant="ghost" disabled fullWidth>Field is full</Button>
    : <Button fullWidth onClick={register}>{withTax(priceNow, fees) > 0 ? `Register & pay ${formatMoney(withTax(priceNow, fees), fees.currency)}` : 'Register now'}</Button>

  const scoring = t.scoring!
  const sheet = t.teeSheet!

  return (
    <div className="page-in">
      <BackLink label="Tournaments" onClick={goBack} />

      {/* Banner */}
      <div className="relative h-[300px] lg:h-[380px] rounded-[32px] overflow-hidden bg-pine-100 shadow-card">
        <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 scrim-top" />
        <div className="absolute inset-0 scrim-bottom" />

        {t.prizes?.[0] && !isCancelled && (
          <div className="absolute top-5 right-5 rounded-2xl px-4 py-2.5 max-w-[260px] shadow-md" style={{ background: 'rgba(201,162,39,0.95)' }}>
            <p className="text-[10px] text-ink/60 font-bold font-display uppercase tracking-wider leading-none">{t.prizes[0].label}</p>
            <p className="text-[14px] text-ink font-bold font-display leading-tight mt-1">{t.prizes[0].value}</p>
          </div>
        )}

        <div className="absolute bottom-7 left-7 right-7">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <StatusBadge status={badgeStatus} size="md" onImage={badgeStatus !== 'in-progress'} />
            <GlassChip>{t.format}</GlassChip>
            <GlassChip>{t.category}</GlassChip>
            {(t.rounds?.length ?? 1) > 1 && <GlassChip>{t.rounds!.length} rounds</GlassChip>}
          </div>
          <h1 className="font-display font-extrabold text-white text-[32px] lg:text-[44px] leading-[1.05] tracking-tight max-w-3xl">{t.name}</h1>
          <p className="text-white/75 text-[15px] mt-2">{t.venue} · {t.location}</p>
          <p className="text-white/60 text-[13px] mt-1.5 font-semibold font-display">
            Organised by <span className="text-white">{organizerName(t.organizerId) ?? 'Golf Tournament Platform'}</span>
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 mt-6 items-start">
        {/* Main column */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoTile icon={<IconCalendar />} label="Date" value={t.dateRange} />
            <InfoTile icon={<IconClock />} label={sheet.startType === 'shotgun' ? 'Shotgun' : 'First tee'} value={formatClock(sheet.firstTeeTime)} />
            <InfoTile icon={<IconCourse />} label="Format" value={`${t.format}${t.format !== 'Stableford' ? ` · ${scoring.basis === 'gross-and-net' ? 'gross & net' : scoring.basis}` : ''}`} />
            <InfoTile icon={<IconUsers />} label="Field" value={`${players} / ${t.maxPlayers}`} />
          </div>

          <Card title="About this tournament">
            <p className={`text-[15px] leading-relaxed ${isCancelled ? 'text-rose-600' : 'text-gray-600'}`}>{t.description}</p>
          </Card>

          <Card title="Schedule">
            <ul className="divide-y divide-black/[0.05] -my-2">
              {t.rounds!.map(r => (
                <li key={r.number} className="flex items-center gap-4 py-3">
                  <span className="w-10 h-10 rounded-full bg-ink text-white text-[13px] font-bold font-display flex items-center justify-center">R{r.number}</span>
                  <span className="flex-1">
                    <span className="block font-display font-bold text-ink text-[15px]">{formatDay(r.date)}</span>
                    <span className="block text-[13px] text-gray-500">
                      {r.holes === 'all' ? `${course?.holes ?? 18} holes` : r.holes === 'front' ? 'Front 9' : 'Back 9'} ·{' '}
                      {sheet.startType === 'shotgun' ? `Shotgun start ${formatClock(sheet.firstTeeTime)}` : `Tee times from ${formatClock(sheet.firstTeeTime)}, every ${sheet.intervalMinutes} min${sheet.startingTees === 'first-and-tenth' ? ' off the 1st and 10th' : ''}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {myGroup && (
              <div className="mt-4 rounded-2xl bg-lime-300/50 px-4 py-3">
                <p className="text-[13px] font-bold font-display text-ink">Your round 1 tee time: {formatClock(myGroup.time)} · Hole {myGroup.startHole}</p>
                <p className="text-[12px] text-pine-700 mt-0.5">
                  Playing with {myGroup.entryIds.filter(e => e !== me?.id).map(eid => field.find(f => f.id === eid)?.name).filter(Boolean).join(', ') || '—'}
                </p>
              </div>
            )}
          </Card>

          <Card title="Format & scoring">
            <dl className="divide-y divide-black/[0.05] -my-2.5">
              <Row label="Format" value={t.format} />
              {t.format !== 'Stableford' && <Row label="Results" value={scoring.basis === 'gross-and-net' ? 'Gross and net' : scoring.basis === 'net' ? 'Net' : 'Gross'} />}
              <Row label="Handicap allowance" value={`${scoring.allowancePct}% of course handicap`} />
              <Row label="Max handicap for net" value={scoring.maxHandicap} />
              <Row label="Ties" value={TIE_BREAK_OPTIONS.find(o => o.value === scoring.tieBreak)?.label} />
              {scoring.cutAfterRound > 0 && <Row label="Cut" value={`Top ${scoring.cutSize} and ties after round ${scoring.cutAfterRound}`} />}
            </dl>
          </Card>

          <Card title="Divisions & eligibility">
            <div className="space-y-2">
              {t.divisions!.map(d => {
                const tee = course?.teeSets?.find(ts => ts.id === d.teeSetId)
                const mine = myDivision?.id === d.id
                return (
                  <div key={d.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${mine ? 'bg-lime-300/50' : 'bg-canvas'}`}>
                    <span className="w-4 h-4 rounded-full ring-1 ring-black/15 flex-shrink-0" style={{ background: teeSwatch(tee?.color ?? '') }} />
                    <span className="flex-1 min-w-0">
                      <span className="block font-display font-bold text-ink text-[14px]">{d.name}{mine && ' · your division'}</span>
                      <span className="block text-[12px] text-gray-500">Handicap {d.minHandicap} to {d.maxHandicap}{d.gender && d.gender !== 'any' ? ` · ${d.gender === 'men' ? 'Men' : 'Women'}` : ''}{d.minAge !== undefined || d.maxAge !== undefined ? ` · Age ${d.minAge ?? 'any'}–${d.maxAge ?? 'any'}` : ''} · {tee ? `${tee.name} tees, ${teeTotal(tee).toLocaleString()} yds` : 'Tees TBC'}</span>
                    </span>
                  </div>
                )
              })}
            </div>
            <ul className="mt-4 text-[13px] text-gray-600 space-y-1.5 list-disc pl-5">
              <li>{t.eligibility!.gender === 'open' ? 'Open to all players' : t.eligibility!.gender === 'men' ? 'Men only' : 'Women only'}{t.eligibility!.membersOnly ? ', members of the host club' : ''}</li>
              {(t.eligibility!.minHandicap !== undefined || t.eligibility!.maxHandicap !== undefined) && (
                <li>Handicap index {t.eligibility!.minHandicap ?? 'any'} to {t.eligibility!.maxHandicap ?? 'any'}</li>
              )}
              {(t.eligibility!.minAge !== undefined || t.eligibility!.maxAge !== undefined) && (
                <li>Age {t.eligibility!.minAge ?? 'any'} to {t.eligibility!.maxAge ?? 'any'}</li>
              )}
              {t.eligibility!.officialHandicapRequired && <li>Official handicap required</li>}
            </ul>
          </Card>

          {!!t.prizes?.length && (
            <Card title="Prizes">
              <ul className="divide-y divide-black/[0.05] -my-2">
                {t.prizes.map(p => (
                  <li key={p.id} className="flex justify-between gap-4 py-2.5">
                    <span className="text-[14px] text-gray-600">{p.label}{p.divisionId ? ` · ${t.divisions?.find(d => d.id === p.divisionId)?.name ?? ''}` : ''}</span>
                    <span className="text-[14px] font-semibold text-ink text-right">{p.value}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {t.localRules && (
            <Card title="Local rules">
              <ul className="text-[14px] text-gray-600 space-y-1.5 list-disc pl-5">
                {t.localRules.split('\n').filter(Boolean).map((rule, i) => <li key={i}>{rule}</li>)}
              </ul>
            </Card>
          )}

          {course && (
            <Card title="The course">
              <a href={`#/courses/${course.id}/${t.id}`} className="group flex items-center gap-4 rounded-2xl bg-canvas p-3 hover:bg-gray-200/60 transition-colors">
                <img src={course.imageUrl} alt="" className="w-24 h-20 rounded-xl object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-ink text-[16px] tracking-tight">{course.name}</p>
                  <p className="text-[13px] text-gray-500 mt-0.5">{course.city}, {course.region}</p>
                  <p className="text-[12px] text-pine-600 font-semibold mt-1">Par {course.par} · {course.yardage.toLocaleString()} yds · {course.holes} holes</p>
                </div>
              </a>
            </Card>
          )}

          {!isCancelled && <WhosPlaying t={t} players={players} isRegistered={isRegistered} />}

          {(t.contactEmail || t.contactPhone || !!t.officials?.length) && (
            <Card title="Contacts">
              <dl className="divide-y divide-black/[0.05] -my-2.5">
                {t.contactEmail && <Row label="Email" value={<a className="underline decoration-lime-500 underline-offset-4" href={`mailto:${t.contactEmail}`}>{t.contactEmail}</a>} />}
                {t.contactPhone && <Row label="Phone" value={t.contactPhone} />}
                {t.officials?.filter(o => o.name.trim()).map(o => <Row key={o.name} label={o.role} value={`${o.name}${o.phone ? ` · ${o.phone}` : ''}`} />)}
              </dl>
            </Card>
          )}
        </div>

        {/* Sticky action card */}
        <aside className="lg:sticky lg:top-8 bg-white rounded-[28px] shadow-card p-6 space-y-5">
          <div>
            <p className="text-[13px] text-gray-500 font-semibold font-display">{earlyBird ? 'Early-bird entry' : 'Entry fee'}</p>
            <p className="font-display font-extrabold text-ink text-[34px] leading-tight tracking-tight">
              {fees.amount === 0 ? 'Free' : formatMoney(priceNow, fees.currency)}<span className="text-[15px] text-gray-500 font-semibold">{feeUnit(fees) ? ` ${feeUnit(fees)}` : ''}</span>
            </p>
            {fees.taxRate !== undefined && priceNow > 0 && <p className="text-[12px] text-gray-500">+ {fees.taxRate}% tax = {formatMoney(withTax(priceNow, fees), fees.currency)}</p>}
            {(fees.memberAmount !== undefined && fees.memberAmount !== fees.amount) && <p className="text-[12px] text-gray-500">Members {formatMoney(fees.memberAmount, fees.currency)} · Guests {formatMoney(fees.amount, fees.currency)}</p>}
            {earlyBird && <p className="text-[12px] text-pine-600 font-semibold">Until {formatDay(fees.earlyBirdUntil!)}, then {formatMoney(fees.amount, fees.currency)}</p>}
            {!!fees.includes.length && <p className="text-[12px] text-gray-500 mt-1">Includes {fees.includes.join(', ').toLowerCase()}</p>}
          </div>

          {isLive && <Notice tone="rose" title="Live now" body={isRegistered ? "You're in the field — enter your scores hole by hole." : 'Follow the leaderboard as scores come in.'} />}
          {isRegistered && !isCancelled && !isCompleted && !isLive && (
            <div className="flex items-center gap-3 bg-lime-300/50 rounded-2xl px-4 py-3.5">
              <IconCheckCircle />
              <div>
                <p className="text-sm font-bold text-ink font-display">You're registered!</p>
                <p className="text-xs text-pine-700 mt-0.5">{myDivision?.name} division{myGroup ? ` · tee time ${formatClock(myGroup.time)}` : ' · tee times published before the event'}</p>
              </div>
            </div>
          )}
          {isWaitlisted && <Notice tone="amber" title="You're on the waiting list" body="We'll email you if a spot opens up." />}
          {isOpen && !isRegistered && !isWaitlisted && problem && <Notice tone="amber" title="Not eligible" body={problem} />}
          {isOpen && !isRegistered && !isWaitlisted && !problem && (
            <div className="bg-canvas rounded-2xl p-4"><SpotsBar players={players} maxPlayers={t.maxPlayers} /></div>
          )}
          {isClosed && <Notice tone="rose" title="Registration closed" body="The registration period for this tournament has ended." />}
          {isComingSoon && <Notice tone="amber" title="Registration opening soon" body={reg.opensAt ? `Opens ${formatDateTime(reg.opensAt)}.` : 'Registration details will be announced shortly.'} />}
          {isCancelled && <Notice tone="rose" title="Tournament cancelled" body="If you were registered, you will receive a full refund within 5–7 business days." />}
          {isCompleted && <Notice tone="gray" title="Tournament completed" body={t.resultsPublished ? 'Final results are published.' : 'Results will be published once cards are verified.'} />}

          <div className="space-y-2.5">
            {primaryAction}
            {isLive && isRegistered && <Button variant="secondary" fullWidth onClick={() => navigate(`/tournaments/${t.id}/leaderboard`)}>Live leaderboard</Button>}
            <Button variant="secondary" fullWidth onClick={() => navigate(`/courses/${t.courseId}/${t.id}`)}>
              <IconCourse /> View course
            </Button>
          </div>

          <div className="border-t border-black/[0.06] pt-4 space-y-2.5 text-[13px]">
            <div className="flex justify-between gap-4"><span className="text-gray-500">Registration opens</span><span className="font-semibold text-ink text-right">{formatDateTime(reg.opensAt)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-gray-500">Closes</span><span className="font-semibold text-ink text-right">{formatDateTime(reg.closesAt)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-gray-500">Free withdrawal until</span><span className="font-semibold text-ink text-right">{formatDateTime(reg.withdrawBy)}</span></div>
            <p className="text-[12px] text-gray-400 leading-relaxed pt-1">{reg.refundPolicy}</p>
          </div>
        </aside>
      </div>
      <div className="mt-8 max-w-[760px]"><MoreTournaments excludeId={t.id} /></div>
      {paying && myDivision && (
        <PaymentSheet title={`Enter ${t.name}`} currency={fees.currency} total={withTax(priceNow, fees)} onClose={() => setPaying(false)}
          lines={[
            ['Division', myDivision.name],
            [earlyBird ? 'Entry (early bird)' : MOCK_PROFILE.membership === 'Member' && fees.memberAmount !== undefined ? 'Entry (member)' : 'Entry', formatMoney(priceNow, fees.currency)],
            ...(fees.taxRate ? [[`Tax (${fees.taxRate}%)`, formatMoney(withTax(priceNow, fees) - priceNow, fees.currency)] as [string, string]] : []),
          ]}
          onPaid={() => { registerMe(t, myDivision.id, false, 'paid'); showToast(`Paid ${formatMoney(withTax(priceNow, fees), fees.currency)} — you're registered for ${t.name}!`) }} />
      )}
    </div>
  )
}
