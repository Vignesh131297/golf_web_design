import { useEffect, useState, type ReactNode } from 'react'
import type { Route } from './router'
import { useApp } from './app-context'
import { MOCK_PROFILE } from './data'
import { Avatar, IconHome, IconTournament, IconProfile, IconSignOut } from './components'
import { STAFF_ROLE_LABEL, assignmentsFor } from './ops'

/* ───────────────── Brand ───────────────── */

export function Wordmark({ dark }: { dark?: boolean }) {
  return (
    <a href="#/home" className="flex items-center gap-2.5 group">
      <span className="w-9 h-9 rounded-xl bg-lime-400 flex items-center justify-center font-display font-extrabold text-ink text-[13px] tracking-tight">
        GT
      </span>
      <span className={`font-display font-extrabold text-[15px] leading-tight tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>
        Golf Tournament<br />
        <span className={dark ? 'text-white/50' : 'text-gray-500'} style={{ fontWeight: 600 }}>Platform</span>
      </span>
    </a>
  )
}

/* ───────────────── Navigation ───────────────── */

const NAV = [
  { label: 'Home',        href: '#/home',        Icon: IconHome,       match: ['home'] },
  { label: 'Tournaments', href: '#/tournaments', Icon: IconTournament, match: ['tournaments', 'tournament', 'course'] },
  { label: 'Profile',     href: '#/profile',     Icon: IconProfile,    match: ['profile', 'edit-profile'] },
]

function Sidebar({ route }: { route: Route }) {
  const { signOut, profileVersion, switchRole } = useApp()
  void profileVersion // re-render when the profile changes
  const p = MOCK_PROFILE
  // One account, several roles: tournaments where this golfer is also a marshal or official
  const duties = assignmentsFor(p.email).filter(a => a.window !== 'ended')

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[264px] flex-col bg-ink p-5 z-30">
      <div className="px-2 pt-1">
        <Wordmark dark />
      </div>

      <nav className="mt-10 flex flex-col gap-1.5" aria-label="Main">
        {NAV.map(({ label, href, Icon, match }) => {
          const active = match.includes(route.name)
          return (
            <a
              key={label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`h-12 px-4 rounded-full flex items-center gap-3 font-display font-bold text-[14px] tracking-tight transition-colors ${
                active ? 'bg-lime-400 text-ink' : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Icon active={active} />
              {label}
            </a>
          )
        })}
      </nav>

      {duties.length > 0 && (
        <div className="mt-6 rounded-2xl bg-white/[0.06] p-2">
          <p className="text-white/45 text-[10px] font-bold font-display uppercase tracking-wider px-2 pt-1">Your other roles</p>
          {duties.map(a => (
            <button key={a.tournament.id} onClick={() => switchRole('staff', a.tournament.id)}
              className="mt-1 w-full text-left rounded-xl px-2 py-2 hover:bg-white/[0.06] transition-colors">
              <span className="block text-lime-400 text-[13px] font-bold font-display">{STAFF_ROLE_LABEL[a.role]} ⇄</span>
              <span className="block text-white/55 text-[12px] truncate">{a.tournament.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Promo */}
      <div className="mt-auto rounded-3xl p-4 relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div
          className="absolute -right-8 -top-10 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(200,236,90,0.25) 0%, rgba(200,236,90,0) 70%)' }}
        />
        <p className="relative text-white font-display font-bold text-[14px] tracking-tight">Season 2026 is open</p>
        <p className="relative text-white/50 text-[12px] mt-1 leading-relaxed">New tournaments are added every week.</p>
        <a href="#/tournaments" className="relative inline-flex mt-3 h-8 px-3.5 rounded-full bg-lime-400 text-ink text-[12px] font-bold font-display items-center">
          Browse events
        </a>
      </div>

      {/* User */}
      <div className="mt-4 flex items-center gap-3 rounded-full bg-white/[0.06] p-1.5 pr-2">
        <Avatar initials={p.avatarInitials} photo={p.photoUrl} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-white text-[13px] font-bold font-display truncate">{p.firstName} {p.lastName}</p>
          <p className="text-white/45 text-[11px] truncate">HCP {p.handicapIndex.toFixed(1)}</p>
        </div>
        <button
          onClick={signOut}
          aria-label="Sign out"
          title="Sign out"
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <IconSignOut />
        </button>
      </div>
    </aside>
  )
}

/** Compact top bar used below the `lg` breakpoint */
function TopBar({ route }: { route: Route }) {
  const { profileVersion } = useApp()
  void profileVersion
  return (
    <header className="lg:hidden sticky top-0 z-30 bg-canvas/90 backdrop-blur border-b border-black/[0.05]">
      <div className="flex items-center justify-between px-4 sm:px-6 h-16">
        <Wordmark />
        <a href="#/profile" aria-label="Profile"><Avatar initials={MOCK_PROFILE.avatarInitials} photo={MOCK_PROFILE.photoUrl} size="sm" /></a>
      </div>
      <nav className="flex gap-1.5 px-4 sm:px-6 pb-3" aria-label="Main">
        {NAV.map(({ label, href, match }) => {
          const active = match.includes(route.name)
          return (
            <a
              key={label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`h-9 px-4 rounded-full flex items-center text-[13px] font-bold font-display ${
                active ? 'bg-ink text-white' : 'bg-white text-gray-600 shadow-card'
              }`}
            >
              {label}
            </a>
          )
        })}
      </nav>
    </header>
  )
}

export function AppLayout({ route, children }: { route: Route; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar route={route} />
      <TopBar route={route} />
      <main className="lg:pl-[264px]">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  )
}

/* ───────────────── Page header ───────────────── */

export function PageHeader({ eyebrow, title, actions }: { eyebrow?: string; title: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        {eyebrow && <p className="text-[14px] text-gray-500 font-medium">{eyebrow}</p>}
        <h1 className="font-display font-extrabold text-ink text-[32px] lg:text-[36px] leading-tight tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </div>
  )
}

/* ───────────────── Toast & Dialog ───────────────── */

export function Toast() {
  const { toast, dismissToast } = useApp()
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(dismissToast, 3200)
    return () => clearTimeout(id)
  }, [toast, dismissToast])
  if (!toast) return null

  const dot = { success: 'bg-lime-400 text-ink', error: 'bg-rose-500 text-white', info: 'bg-white/20 text-white' }[toast.type]
  const icon = { success: '✓', error: '✕', info: 'i' }[toast.type]

  return (
    <div
      key={toast.id}
      role="status"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 lg:left-auto lg:right-8 lg:translate-x-0 z-50 w-max flex items-center gap-3 pl-2 pr-4 py-2 rounded-full shadow-float toast-in bg-ink text-white max-w-[calc(100vw-2rem)]"
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${dot}`}>{icon}</div>
      <p className="text-sm font-medium leading-snug">{toast.message}</p>
      <button onClick={dismissToast} aria-label="Dismiss" className="opacity-60 text-lg leading-none hover:opacity-100 ml-1">×</button>
    </div>
  )
}

export function Dialog() {
  const { dialog, closeDialog } = useApp()
  useEffect(() => {
    if (!dialog) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDialog() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, closeDialog])
  if (!dialog) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 fade-in" onClick={closeDialog} />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-6 pointer-events-none">
        <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="pointer-events-auto bg-white rounded-[28px] shadow-2xl w-full max-w-[400px] p-7 fade-in-up">
          <h3 id="dlg-title" className="font-display font-bold text-ink text-[20px] tracking-tight">{dialog.title}</h3>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">{dialog.message}</p>
          <div className="flex gap-2.5 mt-7">
            <button
              onClick={closeDialog}
              className="flex-1 h-12 rounded-full text-sm font-semibold font-display text-gray-600 bg-canvas hover:bg-gray-200 transition-colors"
            >
              {dialog.cancelLabel ?? 'Cancel'}
            </button>
            <button
              autoFocus
              onClick={() => { dialog.onConfirm(); closeDialog() }}
              className={`flex-1 h-12 rounded-full text-sm font-bold font-display transition-colors ${
                dialog.destructive ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-ink text-white hover:bg-pine-900'
              }`}
            >
              {dialog.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ───────────────── Auth split layout ───────────────── */

export function AuthLayout({ headline, sub, children }: { headline: ReactNode; sub: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Hero panel */}
      <div className="p-4 lg:p-5 lg:h-screen lg:sticky lg:top-0">
        <div className="relative h-full min-h-[260px] rounded-[32px] overflow-hidden bg-ink flex flex-col justify-between p-8 lg:p-12">
          <img
            src="https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=1400&h=1600&fit=crop&auto=format"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(12,26,18,0.55) 0%, rgba(12,26,18,0.05) 30%, rgba(12,26,18,0.35) 55%, rgba(12,26,18,0.95) 100%)' }} />
          <div className="relative"><Wordmark dark /></div>
          <div className="relative mt-16 lg:mt-0">
            <h1 className="font-display font-extrabold text-white text-[40px] lg:text-[60px] leading-[1.02] tracking-tight">
              {headline}
            </h1>
            <p className="text-white/60 text-[15px] lg:text-[17px] mt-4 max-w-md">{sub}</p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-10 lg:py-16">
        <div className="w-full max-w-[440px] page-in">{children}</div>
      </div>
    </div>
  )
}

/* ───────────────── Hooks ───────────────── */

/** Simulated network delay for loading skeletons */
export function useFakeLoad(ms = 700) {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setLoading(false), ms)
    return () => clearTimeout(id)
  }, [ms])
  return loading
}
