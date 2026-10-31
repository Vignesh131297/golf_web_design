import { useEffect, useState, type ReactNode } from 'react'
import type { Route } from '../router'
import { navigate } from '../router'
import { useApp } from '../app-context'
import { Wordmark, PageHeader } from '../shell'
import { Button, StatusBadge, IconSignOut } from '../components'
import { MOCK_PROFILE } from '../data'
import { useDataVersion } from '../store'
import { cardState, entriesFor, useLiveVersion } from '../live'
import { formatDay } from '../golf'
import {
  STAFF_ROLE_LABEL, assignmentFor, assignmentsFor, incidentsFor, mismatches, paceFor, scoreChangesFor, sessionEnded, signOffFor, useOpsVersion,
  type Actor, type Assignment, type GroupPace, type StaffRole,
} from '../ops'
import {
  ActivityLog, CourseRulesBoard, IncidentForm, IncidentsBoard, OfficialToday, OverallBoard, PaceBoard, Panel, ResultsBoard, ScorecardsBoard, StatRow,
  SuspendedBanner, TeeSheetBoard,
} from '../ops-ui'
import { IconLock } from '../admin/AdminShell'

/*
 * Consoles for marshals and tournament officials. Their login only reaches the tournaments they're
 * assigned to: read-only tee sheet and contacts before the day, full access while it's live, nothing
 * once it closes (client, Oct 16: "the role comes embedded with the tournament").
 */

/* ───────── Icons (currentColor so the nav can tint them) ───────── */

const Svg = ({ children }: { children: ReactNode }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
const IconPace = () => <Svg><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></Svg>
const IconAlert = () => <Svg><path d="M12 3l9.5 17h-19L12 3z" /><path d="M12 10v4M12 17v.5" /></Svg>
const IconCard = () => <Svg><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="M3.5 9h17M9 9v11M14.5 9v11" /></Svg>
const IconHistory = () => <Svg><path d="M3.5 12a8.5 8.5 0 102.5-6" /><path d="M3 4v4h4M12 8v4l3 2" /></Svg>
const IconSheet = () => <Svg><path d="M7 3.5h10M5 7.5h14M5 7.5v13h14v-13M9 12h6M9 16h4" /></Svg>
const IconList = () => <Svg><path d="M8 6h12M8 12h12M8 18h12M4 6h.5M4 12h.5M4 18h.5" /></Svg>
const IconToday = () => <Svg><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3" /></Svg>
const IconTrophy = () => <Svg><path d="M8 4h8v5a4 4 0 01-8 0V4zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8.5 20.5h7M10 17h4" /></Svg>
const IconFlag = () => <Svg><path d="M6 21V4M6 4h11l-2.5 4L17 12H6" /></Svg>

export type StaffTab = 'today' | 'pace' | 'incidents' | 'scorecards' | 'results' | 'changes' | 'course' | 'tee-sheet'

const TABS: Record<StaffRole, { tab: StaffTab; label: string; Icon: () => ReactNode }[]> = {
  marshal: [
    { tab: 'pace', label: 'Pace of play', Icon: IconPace },
    { tab: 'incidents', label: 'Incidents', Icon: IconAlert },
    { tab: 'tee-sheet', label: 'Tee sheet & contacts', Icon: IconSheet },
  ],
  official: [
    { tab: 'today', label: 'Today', Icon: IconToday },
    { tab: 'scorecards', label: 'Scorecards', Icon: IconCard },
    { tab: 'incidents', label: 'Disputes & rulings', Icon: IconAlert },
    { tab: 'pace', label: 'Pace of play', Icon: IconPace },
    { tab: 'results', label: 'Results & sign-off', Icon: IconTrophy },
    { tab: 'changes', label: 'Change log', Icon: IconHistory },
    { tab: 'course', label: 'Course & rules', Icon: IconFlag },
    { tab: 'tee-sheet', label: 'Tee sheet & contacts', Icon: IconSheet },
  ],
}

const defaultTab = (role: StaffRole): StaffTab => (role === 'marshal' ? 'pace' : 'today')

/* ───────── Layout ───────── */

export function StaffLayout({ route, children }: { route: Route; children: ReactNode }) {
  useDataVersion()
  useOpsVersion()
  const { signOut, staffEmail, staffName, staffSince, switchRole, forceSignOut } = useApp()

  // Taken off the tournament or password reset elsewhere: the session ends at once, with the reason (checked every 5 s too)
  const ended = staffEmail && staffSince ? sessionEnded(staffEmail, staffSince) : undefined
  useEffect(() => {
    if (ended) { forceSignOut(ended); return }
    const timer = setInterval(() => {
      const why = staffEmail && staffSince ? sessionEnded(staffEmail, staffSince) : undefined
      if (why) forceSignOut(why)
    }, 5000)
    return () => clearInterval(timer)
  }, [ended, staffEmail, staffSince, forceSignOut])
  const current = route.name === 'staff-event' ? assignmentFor(staffEmail ?? undefined, route.id) : undefined
  const tab = route.name === 'staff-event' ? (route.tab as StaffTab) || (current ? defaultTab(current.role) : 'pace') : undefined
  const all = assignmentsFor(staffEmail ?? undefined)
  const roles = [...new Set(all.map(a => STAFF_ROLE_LABEL[a.role]))].join(' · ')
  const isGolferToo = staffEmail?.toLowerCase() === MOCK_PROFILE.email.toLowerCase()
  const nav = current && current.window === 'live' ? TABS[current.role] : current ? TABS[current.role].filter(x => x.tab === 'tee-sheet') : []
  const initials = staffName.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const link = (to: StaffTab) => `#/staff/${current!.tournament.id}/${to}`

  const navItem = (href: string, label: string, active: boolean, Icon: () => ReactNode) => (
    <a key={href} href={href} aria-current={active ? 'page' : undefined}
      className={`h-12 px-4 rounded-full flex items-center gap-3 font-display font-bold text-[14px] tracking-tight transition-colors ${
        active ? 'bg-lime-400 text-ink' : 'text-white/60 hover:text-white hover:bg-white/[0.06]'}`}>
      <Icon />{label}
    </a>
  )

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[264px] flex-col bg-ink p-5 z-30">
        <div className="px-2 pt-1"><Wordmark dark /></div>
        <div className="mx-1 mt-5 rounded-2xl bg-white/[0.06] px-3.5 py-3">
          <p className="text-white/45 text-[10px] font-bold font-display uppercase tracking-wider">{current ? `${STAFF_ROLE_LABEL[current.role]} console` : 'Tournament duty'}</p>
          <p className="text-white text-[14px] font-bold font-display tracking-tight leading-snug mt-0.5">{current?.tournament.name ?? 'My assignments'}</p>
          {current && <p className="text-white/45 text-[12px] mt-1">{current.tournament.venue}</p>}
        </div>
        <nav className="mt-6 flex flex-col gap-1.5" aria-label="Staff">
          {navItem('#/staff', 'My assignments', route.name === 'staff', IconList)}
          {current && nav.map(({ tab: t, label, Icon }) => navItem(link(t), label, tab === t, Icon))}
        </nav>
        {isGolferToo && (
          <button onClick={() => switchRole('golfer')} className="mt-auto h-10 px-4 rounded-full text-left text-white/60 hover:text-white hover:bg-white/[0.06] text-[13px] font-semibold font-display">
            ⇄ Switch to my golf
          </button>
        )}
        <div className={`${isGolferToo ? 'mt-3' : 'mt-auto'} flex items-center gap-3 rounded-full bg-white/[0.06] p-1.5 pr-2`}>
          <span className="w-9 h-9 rounded-full bg-lime-400 flex items-center justify-center font-display font-extrabold text-ink text-[13px]">{initials}</span>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[13px] font-bold font-display truncate">{staffName}</p>
            <p className="text-white/45 text-[11px] truncate">{roles || 'No assignments'}</p>
          </div>
          <button onClick={signOut} aria-label="Sign out" title="Sign out" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
            <IconSignOut />
          </button>
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-30 bg-ink">
        <div className="flex items-center justify-between px-4 sm:px-6 h-16">
          <Wordmark dark />
          <div className="flex gap-2">
            {isGolferToo && <button onClick={() => switchRole('golfer')} className="h-9 px-4 rounded-full bg-white/10 text-white text-[13px] font-bold font-display">My golf</button>}
            <button onClick={signOut} className="h-9 px-4 rounded-full bg-white/10 text-white text-[13px] font-bold font-display">Sign out</button>
          </div>
        </div>
        <nav className="flex gap-1.5 px-4 sm:px-6 pb-3 overflow-x-auto no-scrollbar whitespace-nowrap" aria-label="Staff">
          <a href="#/staff" className={`h-9 px-4 rounded-full flex items-center text-[13px] font-bold font-display ${route.name === 'staff' ? 'bg-lime-400 text-ink' : 'bg-white/10 text-white/70'}`}>Assignments</a>
          {current && nav.map(({ tab: t, label }) => (
            <a key={t} href={link(t)} className={`h-9 px-4 rounded-full flex items-center text-[13px] font-bold font-display ${tab === t ? 'bg-lime-400 text-ink' : 'bg-white/10 text-white/70'}`}>{label}</a>
          ))}
        </nav>
      </header>

      <main className="lg:pl-[264px]">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">{children}</div>
      </main>
    </div>
  )
}

/* ───────── My assignments ───────── */

const WINDOW_TEXT = {
  live: ['Live now', 'bg-rose-500 text-white'],
  upcoming: ['Upcoming', 'bg-amber-50 text-amber-700'],
  ended: ['Access ended', 'bg-gray-100 text-gray-500'],
} as const

export function StaffHome() {
  useDataVersion()
  const { staffEmail, staffName } = useApp()
  const list = assignmentsFor(staffEmail ?? undefined)
  return (
    <div className="page-in">
      <PageHeader eyebrow={`Signed in as ${staffName}`} title="My assignments" />
      {list.length === 0 ? (
        <Panel title="No tournaments yet"><p className="text-[14px] text-gray-500">When an organiser adds you as a marshal or official, the tournament appears here.</p></Panel>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {list.map(a => <AssignmentCard key={a.tournament.id + a.official.role} a={a} />)}
        </div>
      )}
      <p className="text-[13px] text-gray-500 mt-6 leading-relaxed max-w-[640px]">
        Each login works for the tournaments you’re assigned to. Before the day you can see the tee sheet and contacts; on the day you get the full console;
        once the tournament closes, your access ends and the results stay with the organiser.
      </p>
    </div>
  )
}

function AssignmentCard({ a }: { a: Assignment }) {
  const t = a.tournament
  const [label, cls] = WINDOW_TEXT[a.window]
  return (
    <article className={`bg-white rounded-[28px] shadow-card overflow-hidden ${a.window === 'ended' ? 'opacity-70' : ''}`}>
      <div className="relative h-[120px] bg-pine-100">
        <img src={t.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <span className={`absolute top-3 left-3 inline-flex items-center h-7 px-3 rounded-full text-[12px] font-bold font-display ${cls}`}>{label}</span>
        <span className="absolute top-3 right-3 inline-flex items-center h-7 px-3 rounded-full text-[12px] font-bold font-display bg-white text-ink">{STAFF_ROLE_LABEL[a.role]}</span>
      </div>
      <div className="p-5">
        <h3 className="font-display font-bold text-ink text-[18px] tracking-tight">{t.name}</h3>
        <p className="text-[13px] text-gray-500 mt-0.5">{t.dateRange} · {t.venue}</p>
        <div className="mt-4">
          {a.window === 'live' && <Button size="sm" onClick={() => navigate(`/staff/${t.id}`)}>Open {a.role === 'marshal' ? 'marshal' : 'official'} console</Button>}
          {a.window === 'upcoming' && (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="secondary" onClick={() => navigate(`/staff/${t.id}/tee-sheet`)}>Tee sheet & contacts</Button>
              <span className="text-[12px] text-gray-500">Full access from {formatDay(t.startDate)}</span>
            </div>
          )}
          {a.window === 'ended' && <p className="text-[13px] text-gray-500">The tournament has closed, so this login no longer opens it.</p>}
        </div>
      </div>
    </article>
  )
}

/* ───────── Tournament console ───────── */

function Blocked({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-[32px] shadow-card flex flex-col items-center text-center py-16 px-8 page-in">
      <span className="w-20 h-20 rounded-full bg-canvas text-gray-400 flex items-center justify-center"><IconLock /></span>
      <h2 className="font-display font-bold text-ink text-[22px] tracking-tight mt-5">{title}</h2>
      <p className="text-sm text-gray-500 mt-2 max-w-[400px] leading-relaxed">{body}</p>
      <Button size="sm" variant="secondary" className="mt-6" onClick={() => navigate('/staff')}>My assignments</Button>
    </div>
  )
}

export function StaffEvent({ id, tab }: { id: string; tab?: string }) {
  useDataVersion()
  useLiveVersion()
  useOpsVersion()
  const { staffEmail, staffName } = useApp()
  const [preset, setPreset] = useState<GroupPace | null>(null)
  const a = assignmentFor(staffEmail ?? undefined, id)
  // Multi-round events: today's round is the first one not yet signed off
  const rounds = a?.tournament.rounds?.map(r => r.number) ?? [1]
  const [round, setRound] = useState(() => rounds.find(n => !signOffFor(id, n)) ?? rounds[rounds.length - 1])

  if (!a) return <Blocked title="Not one of your tournaments" body="Your login only opens tournaments you’re assigned to as a marshal or official." />
  if (a.window === 'ended') return <Blocked title="Your access has ended" body={`${a.tournament.name} has closed. Marshals and officials can’t open a tournament after it ends; the organiser keeps the results.`} />

  const t = a.tournament
  const actor: Actor = { name: staffName, role: a.role }
  const allowed = a.window === 'live' ? TABS[a.role].map(x => x.tab) : ['tee-sheet']
  const active = (allowed.includes(tab as StaffTab) ? tab : allowed[0] === 'tee-sheet' ? 'tee-sheet' : defaultTab(a.role)) as StaffTab

  const pace = paceFor(t, round)
  const incidents = incidentsFor(t.id)
  const registered = entriesFor(t.id).filter(e => e.status === 'registered')
  const stats = a.role === 'marshal'
    ? [
        { label: 'Groups on the course', value: pace.groups.filter(g => g.onHole).length, tone: 'dark' as const },
        { label: 'Behind pace', value: pace.groups.filter(g => g.status === 'behind').length },
        { label: 'Out of position', value: pace.groups.filter(g => g.status === 'out-of-position').length, tone: pace.groups.some(g => g.status === 'out-of-position') ? 'warn' as const : undefined },
        { label: 'Open incidents', value: incidents.filter(i => i.status === 'open').length },
      ]
    : [
        { label: 'Cards to verify', value: registered.filter(e => cardState(t.id, e.id, round) === 'submitted').length, tone: 'dark' as const },
        { label: 'Score discrepancies', value: registered.filter(e => mismatches(t, e.id, round).length).length, tone: registered.some(e => mismatches(t, e.id, round).length) ? 'warn' as const : undefined },
        { label: 'Waiting for a decision', value: incidents.filter(i => i.status === 'committee').length },
        { label: 'Scores changed', value: scoreChangesFor(t.id).length },
      ]

  return (
    <div className="page-in">
      <PageHeader eyebrow={`${STAFF_ROLE_LABEL[a.role]} · ${t.venue} · round ${round}`} title={t.name}
        actions={<>
          {rounds.length > 1 && a.role === 'official' && (
            <div className="flex gap-1 bg-white rounded-full p-1 shadow-card" role="group" aria-label="Round">
              {(t.rounds ?? []).map(r => (
                <button key={r.number} onClick={() => setRound(r.number)} aria-pressed={round === r.number}
                  className={`h-9 px-3.5 rounded-full text-[13px] font-bold font-display ${round === r.number ? 'bg-ink text-white' : 'text-gray-600 hover:text-ink'}`}>
                  Round {r.number}{signOffFor(t.id, r.number) ? ' ✓' : ''}
                </button>
              ))}
            </div>
          )}
          <StatusBadge status={t.status} size="md" />
        </>} />
      {a.window === 'upcoming' && (
        <div className="mb-6 flex items-start gap-3 bg-amber-50 text-amber-800 rounded-2xl px-5 py-4 text-[14px] leading-relaxed">
          <span className="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
          <p><span className="font-bold font-display">Your console opens on {formatDay(t.startDate)}.</span> Until then you can see the tee sheet and who to call.</p>
        </div>
      )}
      {a.window === 'live' && <SuspendedBanner t={t} />}
      {a.window === 'live' && (a.role === 'marshal' || active === 'today' || active === 'scorecards') && <StatRow items={stats} />}

      {active === 'today' && a.role === 'official' && <OfficialToday t={t} round={round} actor={actor} onOpen={to => navigate(`/staff/${t.id}/${to}`)} />}
      {active === 'pace' && <PaceBoard t={t} round={round} onLog={a.role === 'marshal' ? setPreset : undefined} />}
      {active === 'incidents' && <IncidentsBoard t={t} round={round} actor={actor} />}
      {active === 'scorecards' && a.role === 'official' && <ScorecardsBoard t={t} round={round} actor={actor} canManage />}
      {active === 'results' && a.role === 'official' && (
        <div className="space-y-6">
          <ResultsBoard key={round} t={t} round={round} actor={actor} />
          <OverallBoard t={t} round={round} />
        </div>
      )}
      {active === 'changes' && <ActivityLog t={t} />}
      {active === 'course' && <CourseRulesBoard t={t} round={round} />}
      {active === 'tee-sheet' && <TeeSheetBoard t={t} round={round} />}

      {preset && (
        <IncidentForm t={t} round={round} actor={actor} onClose={() => setPreset(null)}
          preset={{ kind: 'slow-play', hole: preset.onHole ?? undefined, entryIds: preset.players.map(p => p.id),
            note: preset.status === 'out-of-position' ? `Out of position: ${preset.gapHoles} holes behind the group ahead.` : `${preset.behindMinutes} min behind pace.` }} />
      )}
    </div>
  )
}
