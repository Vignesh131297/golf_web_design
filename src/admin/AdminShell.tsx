import type { ReactNode } from 'react'
import type { Route } from '../router'
import { useApp } from '../app-context'
import { Wordmark } from '../shell'
import { Button, IconSignOut } from '../components'
import { resetDemoData } from '../store'
import { resetLiveData } from '../live'
import { resetOpsData } from '../ops'
import { resetRewards } from '../rewards'
import { resetAccessData, verifyOrganizationEmail, type OrgStatus } from './access'
import { navigate } from '../router'

/* ───────── Icons (currentColor so the nav can tint them) ───────── */

export function IconDashboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7.5" height="9" rx="2" stroke="currentColor" strokeWidth="1.8"/>
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="2" stroke="currentColor" strokeWidth="1.8"/>
      <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.8"/>
      <rect x="3" y="15" width="7.5" height="6" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  )
}
export function IconTrophy() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M7 3h10v6a5 5 0 01-10 0V3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M7 6H4a2 2 0 000 4h3M17 6h3a2 2 0 010 4h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}
export function IconFlag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M6 21V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M6 4h11l-2.5 4L17 12H6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <ellipse cx="11" cy="20" rx="6" ry="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}
export function IconShield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M8.5 12l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
export function IconUsersNav() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M16 4.5a3.5 3.5 0 010 7M18.5 14.5c1.9.8 3 2.7 3 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}
export function IconLock() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M8 10.5V7.5a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

/* ───────── Permission helpers ───────── */

/** Renders children only if the signed-in admin has the permission (like chitfund's <Kcplsecure>) */
export function Can({ perm, children, fallback = null }: { perm: string; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useApp()
  return <>{can(perm) ? children : fallback}</>
}

/** Shown when an admin opens a page their role doesn't allow */
export function NoAccess({ what }: { what: string }) {
  const { can, adminRole } = useApp()
  const home = can('dashboard.view') ? '/admin' : null
  return (
    <div className="bg-white rounded-[32px] shadow-card flex flex-col items-center text-center py-16 px-8 page-in">
      <span className="w-20 h-20 rounded-full bg-canvas text-gray-400 flex items-center justify-center"><IconLock /></span>
      <h2 className="font-display font-bold text-ink text-[22px] tracking-tight mt-5">You don't have access</h2>
      <p className="text-sm text-gray-500 mt-2 max-w-[360px] leading-relaxed">
        Your role{adminRole ? <> (<span className="font-semibold text-ink">{adminRole.name}</span>)</> : ''} doesn't include permission to {what}. Ask a Super Admin if you need it.
      </p>
      {home && <Button size="sm" variant="secondary" className="mt-6" onClick={() => navigate(home)}>Go to dashboard</Button>}
    </div>
  )
}

export function IconPlus() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3.5v11M3.5 9h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
}
export function IconPencil() {
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M12.5 2.5l3 3L5 16H2v-3L12.5 2.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
}
export function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M3 5h12M7 5V3.5h4V5M5 5l.7 10a1 1 0 001 1h4.6a1 1 0 001-1L13 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/* ───────── Admin layout ───────── */

const NAV = [
  { label: 'Dashboard',   href: '#/admin',             Icon: IconDashboard, match: ['admin'] },
  { label: 'Tournaments', href: '#/admin/tournaments', Icon: IconTrophy,    match: ['admin-tournaments', 'admin-tournament-edit', 'admin-tournament-live'] },
  { label: 'Courses',     href: '#/admin/courses',     Icon: IconFlag,      match: ['admin-courses', 'admin-course-edit'] },
  { label: 'Organisation', href: '#/admin/organisation', Icon: IconBuilding, match: ['admin-organisation'] },
  { label: 'Organizers',  href: '#/admin/organizers',  Icon: IconBuilding,  match: ['admin-organizers'] },
  { label: 'Roles & permissions', href: '#/admin/roles', Icon: IconShield,   match: ['admin-roles', 'admin-role-edit'] },
  { label: 'Admin users', href: '#/admin/users',       Icon: IconUsersNav,  match: ['admin-users'] },
]

/** Which permission lets you see each nav item */
const NAV_PERM: Record<string, string> = {
  Dashboard: 'dashboard.view',
  Tournaments: 'tournaments.view',
  Courses: 'courses.view',
  Organisation: 'organisation.view',
  Organizers: 'organizers.view',
  'Roles & permissions': 'roles.view',
  'Admin users': 'users.view',
}

export const ORG_STATUS_STYLE: Record<OrgStatus, { label: string; chip: string; dot: string }> = {
  pending:   { label: 'Pending review', chip: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-500' },
  approved:  { label: 'Approved',       chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  rejected:  { label: 'Rejected',       chip: 'bg-rose-50 text-rose-700',       dot: 'bg-rose-500' },
  suspended: { label: 'Suspended',      chip: 'bg-gray-100 text-gray-600',      dot: 'bg-gray-400' },
}

export function IconBuilding() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 21V5a2 2 0 012-2h7a2 2 0 012 2v16M15 9h3a2 2 0 012 2v10M3 21h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 7h3M8 11h3M8 15h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

function useResetDemo() {
  const { showDialog, showToast } = useApp()
  return () => showDialog({
    title: 'Reset demo data?',
    message: 'This restores the original tournaments, courses, organisers, roles and admin users, and removes every change made in the admin console on this device.',
    confirmLabel: 'Reset data',
    destructive: true,
    onConfirm: () => { resetDemoData(); resetAccessData(); resetLiveData(); resetOpsData(); resetRewards(); showToast('Demo data restored', 'info') },
  })
}

/** Shown across the console until an organiser's email is verified and their organisation approved */
function OrgStatusBanner() {
  const { adminOrg, adminUser, showToast } = useApp()
  if (!adminOrg || adminOrg.status === 'approved') return null
  const unverified = !adminOrg.emailVerified && adminOrg.status === 'pending' && adminOrg.ownerUserId === adminUser?.id
  return (
    <div className="mb-6 space-y-3 page-in">
      {unverified && (
        <div className="flex flex-wrap items-start gap-3 bg-rose-50 text-rose-800 rounded-2xl px-5 py-4" role="status">
          <span className="w-2 h-2 rounded-full bg-rose-500 mt-2 flex-shrink-0" />
          <div className="flex-1 min-w-[240px] text-[14px] leading-relaxed">
            <p className="font-bold font-display">Verify your email</p>
            <p>We sent a link to <span className="font-semibold">{adminUser?.email}</span>. Our team can approve {adminOrg.name} once you've verified it. The link expires after 24 hours.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => showToast(`Verification link sent again to ${adminUser?.email}`, 'info')}
              className="h-9 px-4 rounded-full bg-white text-rose-700 text-[13px] font-bold font-display hover:bg-rose-100">Resend link</button>
            <button type="button" onClick={() => { verifyOrganizationEmail(adminOrg.id); showToast('Email verified') }}
              title="Prototype only: stands in for clicking the link in the email"
              className="h-9 px-4 rounded-full bg-ink text-white text-[13px] font-bold font-display hover:bg-pine-900">Open verification link (demo)</button>
          </div>
        </div>
      )}
      <div className="flex items-start gap-3 bg-amber-50 text-amber-800 rounded-2xl px-5 py-4">
        <span className="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
        <div className="text-[14px] leading-relaxed">
          <p className="font-bold font-display">{adminOrg.name} is under review</p>
          <p>Meanwhile you can complete your organisation profile and create <span className="font-semibold">draft</span> tournaments. Publishing, taking registrations and inviting your team unlock once the platform team approves you — usually within 2 business days.</p>
        </div>
      </div>
    </div>
  )
}

export function AdminLayout({ route, children }: { route: Route; children: ReactNode }) {
  const { signOut, can, adminUser, adminRole, adminOrg, switchRole } = useApp()
  const reset = useResetDemo()
  // Organisation profile only makes sense for organisation members; Organizers only for platform staff
  const nav = NAV.filter(n => can(NAV_PERM[n.label]) &&
    !(n.label === 'Organisation' && !adminOrg) && !(n.label === 'Organizers' && adminOrg))
  const initials = (adminUser?.name ?? 'A').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="min-h-screen bg-canvas">
      {/* Sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[264px] flex-col bg-ink p-5 z-30">
        <div className="px-2 pt-1"><Wordmark dark /></div>
        {adminOrg ? (
          <div className="mx-1 mt-5 rounded-2xl bg-white/[0.06] px-3.5 py-3">
            <p className="text-white/45 text-[10px] font-bold font-display uppercase tracking-wider">Organiser console</p>
            <p className="text-white text-[14px] font-bold font-display tracking-tight truncate mt-0.5">{adminOrg.name}</p>
            <span className={`mt-2 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-bold font-display ${ORG_STATUS_STYLE[adminOrg.status].chip}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ORG_STATUS_STYLE[adminOrg.status].dot}`} />
              {ORG_STATUS_STYLE[adminOrg.status].label}
            </span>
          </div>
        ) : (
          <span className="mx-2 mt-4 self-start inline-flex items-center gap-2 h-7 px-3 rounded-full bg-lime-400/15 text-lime-400 text-[11px] font-bold font-display tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-lime-400" /> Admin console
          </span>
        )}

        <nav className="mt-6 flex flex-col gap-1.5" aria-label="Admin">
          {nav.map(({ label, href, Icon, match }) => {
            const active = match.includes(route.name)
            return (
              <a key={label} href={href} aria-current={active ? 'page' : undefined}
                className={`h-12 px-4 rounded-full flex items-center gap-3 font-display font-bold text-[14px] tracking-tight transition-colors ${
                  active ? 'bg-lime-400 text-ink' : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
                }`}>
                <Icon />{adminOrg && label === 'Admin users' ? 'Team' : label}
              </a>
            )
          })}
        </nav>

        {adminUser?.alsoGolfer && (
          <button onClick={() => switchRole('golfer')} className="mt-6 rounded-2xl bg-white/[0.06] px-4 py-3 text-left hover:bg-white/[0.1] transition-colors">
            <span className="block text-white/45 text-[10px] font-bold font-display uppercase tracking-wider">Your other roles</span>
            <span className="block text-lime-400 text-[13px] font-bold font-display mt-1">⇄ Switch to my golf</span>
          </button>
        )}
        {can('settings.reset-data') && <button onClick={reset} className="mt-auto h-10 px-4 rounded-full text-left text-white/50 hover:text-white hover:bg-white/[0.06] text-[13px] font-semibold font-display transition-colors">
          ↺ Reset demo data
        </button>}
        <div className={`${can('settings.reset-data') ? 'mt-3' : 'mt-auto'} flex items-center gap-3 rounded-full bg-white/[0.06] p-1.5 pr-2`}>
          <span className="w-9 h-9 rounded-full bg-lime-400 flex items-center justify-center font-display font-extrabold text-ink text-[13px]">{initials}</span>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[13px] font-bold font-display truncate">{adminUser?.name ?? 'Admin'}</p>
            <p className="text-white/45 text-[11px] truncate">{adminRole?.name ?? 'No role'}</p>
          </div>
          <button onClick={signOut} aria-label="Sign out" title="Sign out" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
            <IconSignOut />
          </button>
        </div>
      </aside>

      {/* Compact top bar below lg */}
      <header className="lg:hidden sticky top-0 z-30 bg-ink">
        <div className="flex items-center justify-between px-4 sm:px-6 h-16">
          <Wordmark dark />
          <button onClick={signOut} className="h-9 px-4 rounded-full bg-white/10 text-white text-[13px] font-bold font-display">Sign out</button>
        </div>
        <nav className="flex gap-1.5 px-4 sm:px-6 pb-3 overflow-x-auto no-scrollbar whitespace-nowrap" aria-label="Admin">
          {nav.map(({ label, href, match }) => {
            const active = match.includes(route.name)
            return (
              <a key={label} href={href} aria-current={active ? 'page' : undefined}
                className={`h-9 px-4 rounded-full flex items-center text-[13px] font-bold font-display ${active ? 'bg-lime-400 text-ink' : 'bg-white/10 text-white/70'}`}>
                {adminOrg && label === 'Admin users' ? 'Team' : label}
              </a>
            )
          })}
        </nav>
      </header>

      <main className="lg:pl-[264px]">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
          <OrgStatusBanner />
          {children}
        </div>
      </main>
    </div>
  )
}
