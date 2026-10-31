import { useState } from 'react'
import type { Tournament } from '../types'
import { Button, EmptyState, StatusBadge } from '../components'
import { useApp } from '../app-context'
import { navigate } from '../router'
import { PageHeader } from '../shell'
import { setTournamentStatus, upsertTournament, useDataVersion } from '../store'
import { cardState, entriesFor, generateTeeSheet, groupsFor, roundStatus, simulateTick, useLiveVersion } from '../live'
import { formatClock } from '../golf'
import { activityFor, currentRound, declaredWinners, incidentsFor, markerMissing, mismatches, paceFor, pendingRequests, recordPublish, signOffFor, slotStatus, staffRoleOf, useOpsVersion, type Actor } from '../ops'
import {
  ActivityLog, FieldBoard, IncidentsBoard, InterestBoard, LeaderboardBoard, OrganiserDecisions, PaceBoard, Panel, PlayControl, ReportsBoard, ScorecardsBoard, StaffSlotsBoard, StatRow,
  SuspendedBanner, WinnersBoard, fmtTime,
} from '../ops-ui'
import { BackLink } from '../screens/TournamentDetails'
import { NoAccess } from './AdminShell'
import { scopedTournaments } from './access'

type Tab = 'scorecards' | 'leaderboard' | 'results' | 'field' | 'pace' | 'incidents' | 'staff' | 'changes' | 'reports'

/**
 * Tournament day for organisers and platform staff: build the tee sheet, manage the field, watch pace,
 * settle disputes, verify scorecards (corrections need a reason), run the marshal and official slots, follow the
 * leaderboard, confirm the winners once the committee signs off, then publish results and download the reports.
 * Once published the tournament is closed and can't be reopened (client answer T-14).
 */
export function AdminTournamentLive({ id }: { id: string }) {
  useDataVersion()
  useLiveVersion()
  useOpsVersion()
  const { can, adminUser, consoleActor, showToast, showDialog } = useApp()
  const t = scopedTournaments(adminUser).find(x => x.id === id)
  const [round, setRound] = useState(() => { const x = scopedTournaments(adminUser).find(y => y.id === id); return x ? currentRound(x) : 1 })
  // Before tournament day the organiser is mostly managing registrations
  const [tab, setTab] = useState<Tab>(() => {
    const status = scopedTournaments(adminUser).find(x => x.id === id)?.status
    return status === 'in-progress' ? 'scorecards' : status === 'completed' ? 'results' : 'field'
  })

  if (!can('tournaments.view')) return <NoAccess what="view tournaments" />
  if (!t) {
    return (
      <div className="bg-white rounded-[32px] shadow-card">
        <EmptyState title="Tournament not found" subtitle="It may have been deleted." action={{ label: 'Back to tournaments', onClick: () => navigate('/admin/tournaments') }} />
      </div>
    )
  }

  const actor: Actor = consoleActor ?? { name: 'Organiser', role: 'organiser' }
  const field = entriesFor(t.id)
  const registered = field.filter(e => e.status === 'registered')
  const groups = groupsFor(t.id, round)
  const canRun = can('tournaments.status')
  const canScore = can('tournaments.status') || can('courses.scorecard')
  const live = t.status === 'in-progress'
  // Players an official marked WD, NS, DNF or DQ are out of the results and don't need a verified card
  const inField = registered.filter(e => roundStatus(t.id, e.id, round) === 'playing')
  const verified = inField.filter(e => cardState(t.id, e.id, round) === 'verified').length
  const allVerified = inField.length > 0 && verified === inField.length
  const incidents = incidentsFor(t.id)
  const decisions = incidents.filter(i => i.status === 'committee').length
  const differ = registered.filter(e => mismatches(t, e.id, round).length || markerMissing(t, round, e.id)).length
  const pace = paceFor(t, round)
  const flagged = pace.groups.filter(g => g.status === 'behind' || g.status === 'out-of-position').length
  const staff = (t.officials ?? []).filter(o => staffRoleOf(o))
  const openSlots = staff.filter(o => slotStatus(t, o) === 'open').length
  const signed = signOffFor(t.id, round)
  const unsignedRounds = (t.rounds?.map(r => r.number) ?? [1]).filter(n => !signOffFor(t.id, n))

  function start() {
    if (!groups.length) generateTeeSheet(t!, round)
    setTournamentStatus(t!.id, 'in-progress')
    showToast('Tournament is live — scoring is open')
  }

  function publish() {
    showDialog({
      title: 'Publish results and close the tournament?',
      message: `${unsignedRounds.length ? `Not signed off by the committee yet: round ${unsignedRounds.join(', round ')}.` : 'The committee signed off every round.'} ${allVerified ? '' : `${inField.length - verified} card(s) in round ${round} aren't verified yet. `}${pendingRequests(t!.id).length ? `${pendingRequests(t!.id).length} request(s) from officials are still waiting for your decision. ` : ''}${declaredWinners(t!.id) ? 'Winners are confirmed. ' : 'Winners aren’t confirmed — the top of each list goes out. '}Results become final and visible to golfers. A closed tournament can't be reopened; marshal and official logins stop working.`,
      confirmLabel: 'Publish & close',
      onConfirm: () => {
        recordPublish(t!, actor)
        upsertTournament({ ...(t as Tournament), status: 'completed', registrationStatus: 'closed', resultsPublished: true })
        showToast('Results published — golfers can see the results and winners')
      },
    })
  }

  const TABS: [Tab, string, number?][] = [
    ['scorecards', 'Scorecards', differ || undefined],
    ['leaderboard', 'Leaderboard'],
    ['results', 'Results & winners'],
    ['field', 'Field & registrations'],
    ['pace', 'Pace of play', flagged || undefined],
    ['incidents', 'Disputes & incidents', decisions || undefined],
    ['staff', 'Marshals & officials', openSlots || undefined],
    ['changes', 'Change log'],
    ['reports', 'Reports'],
  ]

  return (
    <div className="page-in">
      <BackLink label="Tournament" onClick={() => navigate(`/admin/tournaments/${t.id}`)} />
      <PageHeader
        eyebrow={`${live || t.status === 'completed' ? 'Tournament day' : 'Registrations & tee sheet'} · ${t.venue} · ${t.dateRange}`}
        title={t.name}
        actions={
          <>
            <StatusBadge status={t.status} size="md" />
            {canRun && !live && t.status !== 'completed' && t.status !== 'cancelled' && <Button onClick={start}>Start tournament</Button>}
            {canRun && live && <PlayControl t={t} round={round} actor={actor} />}
            {canRun && live && <Button variant="secondary" onClick={() => { simulateTick(t, currentRound(t)); showToast('Simulated the next hole for the field', 'info') }}>Simulate next hole</Button>}
            {canRun && live && <Button onClick={publish}>Publish results</Button>}
          </>
        }
      />

      {t.status === 'completed' && (
        <div className="mb-6 flex items-start gap-3 bg-canvas text-gray-600 rounded-2xl px-5 py-4 text-[14px] leading-relaxed ring-1 ring-black/[0.06]">
          <span className="w-2 h-2 rounded-full bg-gray-400 mt-2 flex-shrink-0" />
          <p><span className="font-bold font-display text-ink">Closed.</span> Results are final. If something has to change, decide it outside the system first; the score-change history stays here for the record.</p>
        </div>
      )}

      {live && <SuspendedBanner t={t} />}
      {live && canRun && <OrganiserDecisions t={t} actor={actor} />}
      {live && signed && (
        <div className="mb-6 flex items-start gap-3 bg-emerald-50 text-emerald-900 rounded-2xl px-5 py-4 text-[14px] leading-relaxed">
          <span className="w-2 h-2 rounded-full bg-emerald-500 mt-2 flex-shrink-0" />
          <p><span className="font-bold font-display">Round {round} signed off by {signed.by.name} at {fmtTime(signed.at)}.</span> Cards are locked. Publish the results when you’re ready.</p>
        </div>
      )}

      <StatRow items={[
        { label: 'Players', value: `${Math.max(t.players, registered.length)} / ${t.maxPlayers}`, tone: 'dark' },
        { label: 'Cards verified', value: `${verified} / ${inField.length}` },
        { label: 'Waiting for a decision', value: decisions, tone: decisions ? 'warn' : undefined },
        { label: 'Groups behind pace', value: flagged },
      ]} />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {TABS.map(([v, label, badge]) => (
          <button key={v} onClick={() => setTab(v)} aria-pressed={tab === v}
            className={`h-10 px-4 rounded-full text-[13px] font-bold font-display inline-flex items-center gap-2 ${tab === v ? 'bg-ink text-white' : 'bg-white text-gray-600 shadow-card hover:text-ink'}`}>
            {label}
            {badge !== undefined && <span className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] inline-flex items-center justify-center ${tab === v ? 'bg-lime-400 text-ink' : 'bg-rose-500 text-white'}`}>{badge}</span>}
          </button>
        ))}
        {(t.rounds?.length ?? 1) > 1 && (
          <select aria-label="Round" value={round} onChange={e => setRound(Number(e.target.value))}
            className="ml-auto h-10 rounded-full bg-white shadow-card px-4 text-[13px] font-bold font-display text-ink">
            {t.rounds!.map(r => <option key={r.number} value={r.number}>Round {r.number}</option>)}
          </select>
        )}
      </div>

      {tab === 'scorecards' && <ScorecardsBoard t={t} round={round} actor={actor} canManage={canScore} />}
      {tab === 'leaderboard' && <LeaderboardBoard t={t} round={round} />}
      {tab === 'results' && <WinnersBoard t={t} actor={actor} canEdit={canRun} />}
      {tab === 'reports' && <ReportsBoard t={t} />}
      {tab === 'field' && (
        <div className="space-y-6">
          <FieldBoard t={t} round={round} />
          <InterestBoard t={t} />
          <Panel title={`Tee sheet · round ${round}`}
            subtitle={`${t.teeSheet?.startType === 'shotgun' ? 'Shotgun start' : `Every ${t.teeSheet?.intervalMinutes} min`} · groups of ${t.teeSheet?.groupSize} by handicap · rearrange players below`}
            aside={canRun && t.status !== 'completed' && (
              <Button size="sm" variant="secondary" onClick={() => {
                const go = () => { generateTeeSheet(t, round); showToast('Tee sheet generated') }
                if (groups.length) showDialog({ title: 'Rebuild the tee sheet?', message: 'Groups and tee times are rebuilt from the current field. Manual moves are lost.', confirmLabel: 'Rebuild', onConfirm: go })
                else go()
              }}>{groups.length ? 'Rebuild' : 'Generate'}</Button>
            )}>
            {groups.length === 0 ? <p className="text-[14px] text-gray-500 py-6 text-center">No groups yet — generate them once registration closes.</p> : (
              <ul className="grid md:grid-cols-2 gap-x-6 divide-y divide-black/[0.05] md:divide-y-0">
                {groups.map(g => (
                  <li key={g.id} className="flex gap-4 py-2.5 md:border-b md:border-black/[0.05]">
                    <span className="w-20 flex-shrink-0">
                      <span className="block font-display font-extrabold text-ink text-[15px]">{formatClock(g.time)}</span>
                      <span className="block text-[12px] text-gray-500">Hole {g.startHole}</span>
                    </span>
                    <span className="text-[13px] text-gray-600 leading-relaxed">{g.entryIds.map(eid => field.find(f => f.id === eid)?.name).filter(Boolean).join(' · ') || 'Empty'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
      {tab === 'pace' && <PaceBoard t={t} round={round} />}
      {tab === 'incidents' && <IncidentsBoard t={t} round={round} actor={actor} canAct={canScore} />}
      {tab === 'staff' && <StaffSlotsBoard t={t} canEdit={can('tournaments.status') || can('tournaments.edit')} actor={actor} />}
      {tab === 'changes' && (
        <>
          <ActivityLog t={t} />
          <p className="text-[12px] text-gray-500 mt-3">{activityFor(t).length} entr{activityFor(t).length === 1 ? 'y' : 'ies'}. Players see the corrected score; the history is visible to organisers and officials.</p>
        </>
      )}
    </div>
  )
}
