import { Fragment, useEffect, useState, type ReactNode } from 'react'
import type { Official, Tournament } from './types'
import { Button, Input, VerifiedTick } from './components'
import { Textarea } from './admin/forms'
import { useApp } from './app-context'
import { getCourse } from './data'
import { upsertTournament } from './store'
import {
  PAYMENT_LABEL, ROUND_STATUS_CODE, ROUND_STATUS_LABEL, addEntry, cardFor, entriesFor, outcomesFor, pickupAllowed, type HoleOutcome, finishRoundForDemo, groupsFor, leaderboard, moveToGroup, roundHoles,
  roundStatus, suspensionFor, teamSizeOf, teeSetIdFor, ticksFor, updateEntry, useLiveVersion, type Entry, type PaymentStatus, type RoundStatus,
} from './live'
import { divisionForGolfer, formatClock, formatMoney, toPar, withTax } from './golf'
import { ScoreCell } from './screens/Leaderboard'
import {
  ACTOR_LABEL, INCIDENT_KINDS, LOGIN_RULES, PACE_LABEL, RANK_LABEL, STAFF_ROLE_LABEL, SUSPEND_REASONS, activateLogin, activityCsv, activityFor, addIncidentNote,
  basesFor, canChangeMarker, claimIncident, correctScore, decideRequest, decidesPlay, declareWinners, declaredWinners, downloadFile, fileName, finishReset, incidentKindLabel, incidentsFor, interestsFor,
  logIncident, loginFor, markerCardFor, markerChoices, markerMissing, markerOf, mismatches, officialQueue, overallStandings, paceFor, prizeBasis, prizeLabel,
  pendingDq, pendingRequests, prizeStandings, prizesFor, raiseRequest, ranking, removalFor, removeFromTournament, requestTitle, requestsFor, resetByOrganiser, resolveIncident, restoreToTournament, resultsCsv, resumePlay,
  rulingsFor, scoreChangesFor, scoreSheetHtml, scoreText, scorecardsCsv, sendInvite, sendToCommittee, setMarker, setPlayerStatus, signOffChecks, signOffFor,
  signOffRound, slotStatus, staffRoleOf, startReset, statusChoices, statusNoteFor, suggestWinners, suspendPlay, unlockCard, useOpsVersion, verifyCards, winnersCsv,
  type ActivityKind, type Actor, type GroupPace, type Incident, type IncidentKind, type IncidentStatus, type NeedItem, type OrganiserRequest, type PaceStatus, type RankBasis,
  type RequestStatus, type SlotStatus, type Standing, type Winner,
  blockerText, canOverride, markerOutcomesFor, settledFor, markerPolicyOf, outcomeText, overrideFor, overrideVerify, verifyBlockers,
} from './ops'
import { notifyStaffAssigned, notifyTeeTimeChange } from './notify'

/*
 * Tournament-day panels shared by the organiser console and the marshal / official consoles.
 * Each panel takes the signed-in person as an Actor, so every action is recorded against them.
 */

/* ───────── Small pieces ───────── */

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

const CHIP = 'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-bold font-display whitespace-nowrap'

const SLOT_STYLE: Record<SlotStatus, [string, string]> = {
  open: ['Open slot', 'bg-canvas text-gray-500'],
  invited: ['Invite pending', 'bg-amber-50 text-amber-700'],
  active: ['Active', 'bg-emerald-50 text-emerald-700'],
  locked: ['Locked', 'bg-rose-50 text-rose-700'],
  removed: ['Taken off', 'bg-gray-100 text-gray-600'],
  ended: ['Access ended', 'bg-gray-100 text-gray-500'],
}
export function SlotChip({ status, invited }: { status: SlotStatus; invited?: boolean }) {
  const [label, cls] = SLOT_STYLE[status]
  return <span className={`${CHIP} ${cls}`}>{status === 'invited' && !invited ? 'Login not sent' : label}</span>
}

const PACE_STYLE: Record<PaceStatus, string> = {
  'not-started': 'bg-canvas text-gray-500',
  'on-pace': 'bg-emerald-50 text-emerald-700',
  behind: 'bg-amber-50 text-amber-700',
  'out-of-position': 'bg-rose-50 text-rose-700',
  finished: 'bg-gray-100 text-gray-500',
}
export const PaceChip = ({ status }: { status: PaceStatus }) => <span className={`${CHIP} ${PACE_STYLE[status]}`}>{PACE_LABEL[status]}</span>

const INCIDENT_STYLE: Record<IncidentStatus, [string, string]> = {
  open: ['On the course', 'bg-amber-50 text-amber-700'],
  committee: ['Needs a decision', 'bg-rose-50 text-rose-700'],
  resolved: ['Resolved', 'bg-emerald-50 text-emerald-700'],
}
export const IncidentChip = ({ status }: { status: IncidentStatus }) => <span className={`${CHIP} ${INCIDENT_STYLE[status][1]}`}>{INCIDENT_STYLE[status][0]}</span>

export function Panel({ title, subtitle, aside, children, flush }: { title: string; subtitle?: ReactNode; aside?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className={`bg-white rounded-[28px] shadow-card ${flush ? 'overflow-hidden' : 'p-6'}`}>
      <div className={`flex flex-wrap items-start justify-between gap-3 ${flush ? 'px-6 pt-6 pb-3' : 'mb-4'}`}>
        <div className="min-w-0">
          <h2 className="font-display font-bold text-ink text-[19px] tracking-tight">{title}</h2>
          {subtitle && <p className="text-[12px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {aside && <div className="flex flex-wrap gap-2">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

export function Modal({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div role="dialog" aria-modal="true" aria-labelledby="modal-title"
          className="pointer-events-auto bg-white rounded-[28px] shadow-2xl w-full max-w-[520px] max-h-[calc(100vh-2rem)] flex flex-col fade-in-up">
          <div className="px-7 pt-7">
            <h3 id="modal-title" className="font-display font-bold text-ink text-[20px] tracking-tight">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{subtitle}</p>}
          </div>
          <div className="px-7 py-5 overflow-y-auto space-y-4">{children}</div>
          <div className="px-7 pb-7 flex gap-2.5">{footer}</div>
        </div>
      </div>
    </>
  )
}

function Chips<T extends string | number>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-gray-600 font-display">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <button key={String(o.value)} type="button" onClick={() => onChange(o.value)} aria-pressed={o.value === value}
            className={`h-9 px-3.5 rounded-full text-[13px] font-semibold font-display ${o.value === value ? 'bg-ink text-white' : 'bg-canvas text-gray-600 hover:bg-gray-200'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const SELECT = 'h-10 rounded-xl bg-canvas px-3 text-[13px] font-semibold text-ink border border-transparent focus:border-pine-400 focus:outline-none'

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'dark' | 'warn' }) {
  return (
    <div className={`rounded-[24px] p-5 ${tone === 'dark' ? 'bg-ink text-white' : tone === 'warn' ? 'bg-rose-50' : 'bg-white shadow-card'}`}>
      <p className={`text-[13px] font-semibold ${tone === 'dark' ? 'text-white/55' : tone === 'warn' ? 'text-rose-700' : 'text-gray-500'}`}>{label}</p>
      <p className={`font-display font-extrabold text-[30px] leading-tight ${tone === 'dark' ? 'text-lime-400' : tone === 'warn' ? 'text-rose-700' : 'text-ink'}`}>{value}</p>
    </div>
  )
}
export function StatRow({ items }: { items: { label: string; value: ReactNode; tone?: 'dark' | 'warn' }[] }) {
  return <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">{items.map(i => <Stat key={i.label} {...i} />)}</div>
}

const names = (t: Tournament, ids: string[]) => {
  const field = entriesFor(t.id)
  return ids.map(id => field.find(e => e.id === id)?.name).filter(Boolean).join(', ')
}

/* ───────── Pace of play ───────── */

export function PaceBoard({ t, round, onLog, compact }: { t: Tournament; round: number; onLog?: (g: GroupPace) => void; compact?: boolean }) {
  useLiveVersion()
  const pace = paceFor(t, round)
  const flagged = pace.groups.filter(g => g.status === 'behind' || g.status === 'out-of-position')
  const list = compact ? flagged : pace.groups

  return (
    <Panel
      title={compact ? 'Groups needing attention' : 'Pace of play'}
      subtitle={<>Target {Math.floor((t.pace?.targetMinutes ?? 255) / 60)} h {(t.pace?.targetMinutes ?? 255) % 60} min · flag at {pace.flagMinutes} min behind · course clock {formatClock(pace.clock)}</>}
      aside={!compact && (
        <div className="flex gap-1.5">
          {(['on-pace', 'behind', 'out-of-position', 'finished'] as PaceStatus[]).map(s => (
            <span key={s} className={`${CHIP} ${PACE_STYLE[s]}`}>{pace.groups.filter(g => g.status === s).length} {PACE_LABEL[s].toLowerCase()}</span>
          ))}
        </div>
      )}
    >
      {list.length === 0 ? (
        <p className="text-[14px] text-gray-500 py-6 text-center">{compact ? 'Every group is on pace.' : 'No groups yet — the tee sheet hasn’t been built.'}</p>
      ) : (
        <ul className="divide-y divide-black/[0.05]">
          {list.map(g => (
            <li key={g.group.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span className="w-[74px] flex-shrink-0">
                <span className="block font-display font-extrabold text-ink text-[15px]">{formatClock(g.group.time)}</span>
                <span className="block text-[11px] text-gray-500">Tee {g.group.startHole}</span>
              </span>
              <span className="w-16 flex-shrink-0 text-center">
                <span className="block font-display font-extrabold text-ink text-[20px] leading-none">{g.onHole ?? (g.status === 'finished' ? 'F' : '–')}</span>
                <span className="block text-[10px] text-gray-400 font-semibold mt-0.5">{g.onHole ? 'ON HOLE' : g.status === 'finished' ? 'DONE' : 'NOT OUT'}</span>
              </span>
              <span className="flex-1 min-w-[180px] text-[13px] text-gray-600 leading-relaxed">
                {g.players.map(p => p.name).join(' · ')}
                {g.status === 'out-of-position' && <span className="block text-[12px] text-rose-700 font-semibold">Empty hole in front of them ({g.gapHoles} holes behind the group ahead)</span>}
              </span>
              <span className="flex items-center gap-2 ml-auto">
                {g.behindMinutes > 0 && g.status !== 'finished' && <span className="text-[13px] font-bold text-ink">+{g.behindMinutes} min</span>}
                <PaceChip status={g.status} />
                {onLog && (g.status === 'behind' || g.status === 'out-of-position') && (
                  <Button size="sm" variant="secondary" onClick={() => onLog(g)}>Log warning</Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!compact && (
        <div className="mt-4 rounded-2xl bg-canvas px-4 py-3 text-[12px] text-gray-500 leading-relaxed">
          <span className="font-bold text-ink">Cart GPS (TagMarshal): not connected.</span> Positions come from the scores golfers enter. With cart tags,
          this shows live positions, and alerts when a cart enters a no-cart zone.
        </div>
      )}
    </Panel>
  )
}

/* ───────── Incidents ───────── */

interface IncidentPreset { kind?: IncidentKind; hole?: number; entryIds?: string[]; note?: string }

export function IncidentForm({ t, round, actor, preset, onClose }: { t: Tournament; round: number; actor: Actor; preset?: IncidentPreset; onClose: () => void }) {
  const { showToast } = useApp()
  const course = getCourse(t.courseId)
  const holes = course ? roundHoles(t, course, round) : []
  const groups = groupsFor(t.id, round)
  const field = entriesFor(t.id).filter(e => e.status === 'registered')
  const [kind, setKind] = useState<IncidentKind>(preset?.kind ?? 'slow-play')
  const [hole, setHole] = useState<number | ''>(preset?.hole ?? '')
  const [groupId, setGroupId] = useState(() => groups.find(g => preset?.entryIds?.some(id => g.entryIds.includes(id)))?.id ?? '')
  const [entryIds, setEntryIds] = useState<string[]>(preset?.entryIds ?? [])
  const [note, setNote] = useState(preset?.note ?? '')
  const [error, setError] = useState('')
  const players = groupId ? field.filter(e => groups.find(g => g.id === groupId)?.entryIds.includes(e.id)) : field
  const canEscalate = actor.role === 'marshal' || actor.role === 'golfer'

  function save(status: IncidentStatus) {
    if (!note.trim()) return setError('Say what happened')
    logIncident({ tournamentId: t.id, round, kind, hole: hole === '' ? undefined : hole, entryIds, note, raisedBy: actor, status })
    showToast(status === 'committee' ? 'Logged and sent to the committee' : 'Incident logged')
    onClose()
  }

  return (
    <Modal title="Log an incident" subtitle="Recorded with your name and the time. Players aren’t notified." onClose={onClose}
      footer={<>
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        {canEscalate && <Button variant="secondary" fullWidth onClick={() => save('committee')}>Send to committee</Button>}
        <Button fullWidth onClick={() => save('open')}>Log it</Button>
      </>}>
      <Chips label="What happened" options={INCIDENT_KINDS.map(k => ({ value: k.value, label: k.label }))} value={kind} onChange={setKind} />
      <p className="text-[12px] text-gray-500 -mt-2">{INCIDENT_KINDS.find(k => k.value === kind)?.hint}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-gray-600 font-display">Hole</span>
          <select className={SELECT} value={hole} onChange={e => setHole(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Not on a hole</option>
            {holes.map(h => <option key={h.hole} value={h.hole}>Hole {h.hole}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-gray-600 font-display">Group</span>
          <select className={SELECT} value={groupId} onChange={e => { setGroupId(e.target.value); setEntryIds([]) }}>
            <option value="">Any group</option>
            {groups.map(g => <option key={g.id} value={g.id}>{formatClock(g.time)} · tee {g.startHole}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-gray-600 font-display">Players involved</span>
        <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
          {players.map(p => {
            const on = entryIds.includes(p.id)
            return (
              <button key={p.id} type="button" aria-pressed={on} onClick={() => setEntryIds(on ? entryIds.filter(x => x !== p.id) : [...entryIds, p.id])}
                className={`h-8 px-3 rounded-full text-[12px] font-semibold ${on ? 'bg-lime-400 text-ink' : 'bg-canvas text-gray-600 hover:bg-gray-200'}`}>{p.name}</button>
            )
          })}
        </div>
      </div>
      <Textarea label="What happened" placeholder="e.g. Cart 16 driven onto the apron of the 4th green" value={note} error={error}
        onChange={e => { setNote(e.target.value); setError('') }} style={{ minHeight: 90 }} />
    </Modal>
  )
}

function DecisionModal({ t, incident, actor, onClose }: { t: Tournament; incident: Incident; actor: Actor; onClose: () => void }) {
  const { showToast } = useApp()
  const course = getCourse(t.courseId)
  const holes = course ? roundHoles(t, course, incident.round) : []
  const committee = actor.role !== 'marshal'
  const [decision, setDecision] = useState('')
  const [changeScore, setChangeScore] = useState(incident.kind === 'score-dispute' && committee)
  const [entryId, setEntryId] = useState(incident.entryIds[0] ?? '')
  const [holeIndex, setHoleIndex] = useState(Math.max(0, holes.findIndex(h => h.hole === incident.hole)))
  const current = entryId ? cardFor(t, entryId, incident.round)[holeIndex] : null
  const marked = entryId ? markerCardFor(t, entryId, incident.round)[holeIndex] : null
  const [strokes, setStrokesValue] = useState<number | ''>(marked ?? current ?? '')
  const [error, setError] = useState('')

  function save() {
    if (!decision.trim()) return setError('Record the decision')
    const change = changeScore && entryId && strokes !== '' ? { t, entryId, holeIndex, strokes } : undefined
    if (!resolveIncident(incident.id, actor, decision, change)) {
      // Another official decided it first: theirs stands
      const first = incidentsFor(t.id).find(x => x.id === incident.id)
      showToast(`Already decided by ${first?.decidedBy?.name ?? 'another official'} — their decision stands`, 'info')
      return onClose()
    }
    showToast(change ? 'Decision recorded and the score updated — the player sees it on their card' : 'Decision recorded — the player sees it on their card')
    onClose()
  }

  return (
    <Modal title={committee ? 'Committee decision' : 'Handled on the course'} onClose={onClose}
      subtitle={committee ? 'The decision is final for this tournament and kept with the scorecard.' : 'Say what you did. If it needs a ruling on a score, send it to the committee instead.'}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth onClick={save}>Save decision</Button></>}>
      <div className="rounded-2xl bg-canvas px-4 py-3 text-[13px] text-gray-600 leading-relaxed">
        <span className="font-bold text-ink">{incidentKindLabel(incident.kind)}{incident.hole ? ` · hole ${incident.hole}` : ''}</span> — {incident.note}
      </div>
      <Textarea label="Decision" placeholder={committee ? 'e.g. Ball moved while addressing it in the bunker: one-stroke penalty, 6 on the 3rd.' : 'e.g. Warned the group; back in position by the next tee.'}
        value={decision} error={error} onChange={e => { setDecision(e.target.value); setError('') }} style={{ minHeight: 90 }} />
      {committee && incident.entryIds.length > 0 && (
        <div className="rounded-2xl ring-1 ring-black/[0.06] p-4 space-y-3">
          <label className="flex items-center gap-2.5 text-[14px] font-semibold text-ink font-display">
            <input type="checkbox" checked={changeScore} onChange={e => setChangeScore(e.target.checked)} className="w-4 h-4 accent-[var(--color-ink)]" />
            Change a score because of this decision
          </label>
          {changeScore && (
            <div className="grid grid-cols-3 gap-2">
              <select aria-label="Player" className={SELECT} value={entryId} onChange={e => setEntryId(e.target.value)}>
                {incident.entryIds.map(id => <option key={id} value={id}>{names(t, [id])}</option>)}
              </select>
              <select aria-label="Hole" className={SELECT} value={holeIndex} onChange={e => setHoleIndex(Number(e.target.value))}>
                {holes.map((h, i) => <option key={h.hole} value={i}>Hole {h.hole}</option>)}
              </select>
              <input aria-label="Strokes" type="number" min={1} max={15} value={strokes} onChange={e => setStrokesValue(e.target.value === '' ? '' : Number(e.target.value))}
                className={`${SELECT} text-center`} />
              <p className="col-span-3 text-[12px] text-gray-500">Card now shows {current ?? '–'}{marked !== null && marked !== current ? `; the marker recorded ${marked}` : ''}. The change is added to the audit trail.</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function NoteModal({ title, placeholder, onSave, onClose }: { title: string; placeholder: string; onSave: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  return (
    <Modal title={title} onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth disabled={!text.trim()} onClick={() => { onSave(text); onClose() }}>Save</Button></>}>
      <Textarea label="Note" placeholder={placeholder} value={text} onChange={e => setText(e.target.value)} style={{ minHeight: 90 }} />
    </Modal>
  )
}

type IncidentFilter = 'active' | 'committee' | 'resolved' | 'all'

export function IncidentsBoard({ t, round, actor, canAct = true }: { t: Tournament; round: number; actor: Actor; canAct?: boolean }) {
  useOpsVersion()
  useLiveVersion()
  const { showToast, showDialog } = useApp()
  const committee = actor.role !== 'marshal'
  const all = incidentsFor(t.id)
  const [filter, setFilter] = useState<IncidentFilter>(committee && all.some(i => i.status === 'committee') ? 'committee' : 'active')
  const [logging, setLogging] = useState(false)
  const [deciding, setDeciding] = useState<Incident | null>(null)
  const [noting, setNoting] = useState<{ incident: Incident; escalate: boolean } | null>(null)
  const counts: Record<IncidentFilter, number> = {
    active: all.filter(i => i.status !== 'resolved').length,
    committee: all.filter(i => i.status === 'committee').length,
    resolved: all.filter(i => i.status === 'resolved').length,
    all: all.length,
  }
  const list = all.filter(i => filter === 'all' || (filter === 'active' ? i.status !== 'resolved' : i.status === filter))
  const canLog = canAct && t.status === 'in-progress'

  return (
    <Panel title={committee ? 'Disputes & incidents' : 'Incidents'}
      subtitle={committee ? 'Rulings and score disputes come here from marshals and golfers. Decisions are recorded with your name.' : 'Log anything that happens on the course. Send rulings and score disputes to the committee.'}
      aside={canLog && <Button size="sm" onClick={() => setLogging(true)}>Log incident</Button>}>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {([['active', 'Open'], ['committee', 'Needs a decision'], ['resolved', 'Resolved'], ['all', 'All']] as [IncidentFilter, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setFilter(v)} aria-pressed={filter === v}
            className={`h-9 px-3.5 rounded-full text-[13px] font-semibold font-display ${filter === v ? 'bg-ink text-white' : 'bg-canvas text-gray-600 hover:bg-gray-200'}`}>
            {label} <span className="opacity-60">{counts[v]}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? <p className="text-[14px] text-gray-500 py-6 text-center">Nothing here.</p> : (
        <ul className="space-y-3">
          {list.map(i => (
            <li key={i.id} className="rounded-2xl ring-1 ring-black/[0.06] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display font-bold text-ink text-[15px]">{incidentKindLabel(i.kind)}</span>
                {i.hole && <span className={`${CHIP} bg-canvas text-ink`}>Hole {i.hole}</span>}
                <IncidentChip status={i.status} />
                {committee && i.claimedBy && i.status !== 'resolved' && (
                  <span className={`${CHIP} ${i.claimedBy.name === actor.name ? 'bg-lime-400/40 text-ink' : 'bg-sky-50 text-sky-800'}`}>{i.claimedBy.name === actor.name ? 'With you' : `With ${i.claimedBy.name}`}</span>
                )}
                <span className="ml-auto text-[12px] text-gray-500">{fmtTime(i.at)} · {i.raisedBy.name} ({ACTOR_LABEL[i.raisedBy.role].toLowerCase()})</span>
              </div>
              {i.entryIds.length > 0 && <p className="text-[12px] font-semibold text-pine-700 mt-1.5">{names(t, i.entryIds)}</p>}
              <p className="text-[14px] text-gray-700 mt-1.5 leading-relaxed">{i.note}</p>
              {i.updates.map((u, k) => (
                <p key={k} className="text-[13px] text-gray-600 mt-2 pl-3 border-l-2 border-black/10 leading-relaxed">
                  <span className="font-semibold text-ink">{u.by.name}</span> <span className="text-gray-400">{fmtTime(u.at)}</span> — {u.text}
                </p>
              ))}
              {i.status === 'resolved' && i.decision && (
                <div className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-900 leading-relaxed">
                  <span className="font-bold">Decision</span> · {i.decidedBy?.name} ({ACTOR_LABEL[i.decidedBy?.role ?? 'official'].toLowerCase()}) {i.decidedAt ? fmtTime(i.decidedAt) : ''} — {i.decision}
                  {i.scoreChangeIds?.length ? <span className="block text-[12px] mt-1">Score changed — see Score changes.</span> : null}
                </div>
              )}
              {canAct && i.status !== 'resolved' && t.status === 'in-progress' && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {committee
                    ? i.claimedBy && i.claimedBy.name !== actor.name
                      ? <Button size="sm" variant="secondary" onClick={() => showDialog({
                          title: `Take over from ${i.claimedBy!.name}?`,
                          message: `${i.claimedBy!.name} is handling this. Taking over is noted on the dispute so they know.`,
                          confirmLabel: 'Take over',
                          onConfirm: () => { claimIncident(i.id, actor); showToast(`You’ve taken this over from ${i.claimedBy!.name}`, 'info') },
                        })}>Take over</Button>
                      : <>
                          {!i.claimedBy && actor.role === 'official' && (
                            <Button size="sm" variant="secondary" onClick={() => { claimIncident(i.id, actor); showToast('The other officials see you’re handling this', 'info') }}>I’ll take it</Button>
                          )}
                          <Button size="sm" onClick={() => { if (actor.role === 'official') claimIncident(i.id, actor); setDeciding(i) }}>Decide</Button>
                        </>
                    : <>
                        {i.status === 'open' && <Button size="sm" onClick={() => setDeciding(i)}>Handled on the course</Button>}
                        {i.status === 'open' && <Button size="sm" variant="secondary" onClick={() => setNoting({ incident: i, escalate: true })}>Send to committee</Button>}
                      </>}
                  <Button size="sm" variant="ghost" onClick={() => setNoting({ incident: i, escalate: false })}>Add note</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {logging && <IncidentForm t={t} round={round} actor={actor} onClose={() => setLogging(false)} />}
      {deciding && <DecisionModal t={t} incident={deciding} actor={actor} onClose={() => setDeciding(null)} />}
      {noting && (
        <NoteModal title={noting.escalate ? 'Send to the committee' : 'Add a note'} placeholder={noting.escalate ? 'What the committee needs to know' : 'What happened next'}
          onClose={() => setNoting(null)}
          onSave={text => {
            if (noting.escalate) { sendToCommittee(noting.incident.id, actor, text); showToast('Sent to the committee') }
            else addIncidentNote(noting.incident.id, actor, text)
          }} />
      )}
    </Panel>
  )
}

/* ───────── Scorecards ───────── */

function CorrectionModal({ t, entry, round, holeIndex, actor, onClose }: { t: Tournament; entry: Entry; round: number; holeIndex: number; actor: Actor; onClose: () => void }) {
  const { showToast } = useApp()
  const course = getCourse(t.courseId)
  const hole = course ? roundHoles(t, course, round)[holeIndex] : undefined
  const current = outcomesFor(t, entry.id, round)[holeIndex]
  const marked = markerOutcomesFor(t, entry.id, round)[holeIndex]
  const disagree = marked !== null && marked !== current
  const [value, setValue] = useState<number | 'P' | ''>((disagree ? marked : current) ?? '')
  const [reason, setReason] = useState(disagree ? 'Marker’s score confirmed' : '')
  const [error, setError] = useState('')
  const pickups = pickupAllowed(t)

  function save() {
    if (value === '' || (typeof value === 'number' && (value < 1 || value > 15))) return setError(pickups ? 'Enter 1–15 strokes, or choose Pickup' : 'Enter 1–15 strokes')
    if (!reason.trim()) return setError('A reason is required — it goes in the audit trail')
    const c = correctScore(t, entry.id, round, holeIndex, value as HoleOutcome, reason, actor)
    showToast(!c ? 'No change' : current === value ? `Hole ${hole?.hole}: ${outcomeText(current)} confirmed for ${entry.name} — settled by the committee` : `Hole ${hole?.hole}: ${outcomeText(current)} → ${outcomeText(value as HoleOutcome)} for ${entry.name}`)
    onClose()
  }

  const show = (v: HoleOutcome) => (v === 'P' ? 'P' : v ?? '–')
  return (
    <Modal title={`Correct hole ${hole?.hole ?? holeIndex + 1} · ${entry.name}`} subtitle="Every correction is kept with who made it, when and why. A verified card goes back to handed in." onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth onClick={save}>Save correction</Button></>}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-canvas py-3"><p className="text-[11px] font-semibold text-gray-500">Player entered</p><p className="font-display font-extrabold text-[24px] text-ink">{show(current)}</p></div>
        <div className="rounded-2xl bg-canvas py-3"><p className="text-[11px] font-semibold text-gray-500">Marker recorded</p><p className="font-display font-extrabold text-[24px] text-ink">{show(marked)}</p></div>
        <div className="rounded-2xl bg-lime-400/40 py-3"><p className="text-[11px] font-semibold text-pine-800">Par {hole?.par}</p>
          <input aria-label="Correct strokes" type="number" min={1} max={15} value={value === 'P' ? '' : value} placeholder={value === 'P' ? 'P' : ''}
            onChange={e => { setValue(e.target.value === '' ? '' : Number(e.target.value)); setError('') }}
            className="w-16 h-9 mt-0.5 rounded-xl bg-white text-center font-display font-extrabold text-[20px]" />
        </div>
      </div>
      {pickups && (
        <button type="button" onClick={() => { setValue('P'); setError('') }} aria-pressed={value === 'P'}
          className={`w-full h-11 rounded-2xl text-[14px] font-semibold font-display ${value === 'P' ? 'bg-ink text-white' : 'bg-canvas text-ink hover:bg-gray-200'}`}>
          Pickup — no score on this hole (0 points)
        </button>
      )}
      <Input label="Reason *" placeholder="e.g. Marker’s score confirmed after speaking to the group" value={reason} error={error} onChange={e => { setReason(e.target.value); setError('') }} />
    </Modal>
  )
}

/** Sprint 4 · SC2: verify a card the marker hasn't fully confirmed. Needs a reason; the card shows "Override" from then on. */
function OverrideModal({ t, entry, round, actor, onClose }: { t: Tournament; entry: Entry; round: number; actor: Actor; onClose: () => void }) {
  const { showToast } = useApp()
  const course = getCourse(t.courseId)
  const holes = course ? roundHoles(t, course, round) : []
  const blockers = blockerText(verifyBlockers(t, entry.id, round), i => holes[i]?.hole ?? i + 1)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  function save() {
    if (!reason.trim()) return setError('A reason is required — it stays on the card and in the change log')
    if (overrideVerify(t, entry.id, round, reason, actor)) showToast(`${entry.name}'s card verified by override`)
    else showToast('This card can’t be overridden now — reload and try again', 'error')
    onClose()
  }
  return (
    <Modal title={`Verify ${entry.name}’s card without the marker`} subtitle="Use this only when the marker can’t confirm (left the course, one-player group). The card is marked as overridden, not as marker-confirmed." onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth onClick={save}>Verify by override</Button></>}>
      <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-3.5 text-[13px] text-amber-900">
        <p className="font-bold font-display mb-1">Still open on this card</p>
        <ul className="list-disc pl-5 space-y-0.5">{blockers.map(b => <li key={b}>{b}</li>)}</ul>
      </div>
      <Input label="Reason *" placeholder="e.g. Marker withdrew after the 7th; scores confirmed with the group on the 9th green" value={reason} error={error} onChange={e => { setReason(e.target.value); setError('') }} />
    </Modal>
  )
}

/** One hole on the official's card grid: strokes as usual, a pickup as "P" (SC1) */
function OutcomeCell({ v, par }: { v: HoleOutcome; par: number }) {
  if (v === 'P') return <span title="Pickup — 0 points" className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-gray-200 text-gray-600 font-display font-extrabold text-[13px]">P</span>
  return <ScoreCell strokes={v} par={par} />
}

type CardFilter = 'all' | 'attention' | 'verified'

export function ScorecardsBoard({ t, round, actor, canManage }: { t: Tournament; round: number; actor: Actor; canManage: boolean }) {
  useLiveVersion()
  useOpsVersion()
  const { showToast } = useApp()
  const course = getCourse(t.courseId)
  const holes = course ? roundHoles(t, course, round) : []
  const rows = leaderboard(t, round)
  const [open, setOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState<CardFilter>('attention')
  const [correcting, setCorrecting] = useState<{ entry: Entry; holeIndex: number } | null>(null)
  const [statusFor, setStatusFor] = useState<Entry | null>(null)
  const [unlocking, setUnlocking] = useState<Entry | null>(null)
  const [moving, setMoving] = useState<Entry | null>(null)
  const [overriding, setOverriding] = useState<Entry | null>(null)
  const pickups = pickupAllowed(t)
  const required = markerPolicyOf(t) === 'required'
  // Closed tournaments can't be reopened in the system (client answer T-14); signed-off rounds are final too
  const closed = t.status === 'completed' || t.status === 'cancelled'
  const signed = signOffFor(t.id, round)
  const editable = canManage && !closed && !signed

  const needsAttention = (r: { entry: Entry; state: string; status: RoundStatus }) => r.status === 'playing' && (mismatches(t, r.entry.id, round).length > 0 || r.state === 'submitted')
  const shown = rows.filter(r => filter === 'all' || (filter === 'verified' ? r.state === 'verified' : needsAttention(r)))
  const counts = { all: rows.length, attention: rows.filter(needsAttention).length, verified: rows.filter(r => r.state === 'verified').length }
  // Handed in, marker agrees: safe to verify in one go (client, Sept 21: bulk actions for officials)
  // Sprint 4 · SC2: "clean" means ready under the marker policy — confirmed by the marker and no discrepancies
  const clean = rows.filter(r => r.status === 'playing' && r.state === 'submitted' && verifyBlockers(t, r.entry.id, round).ready)

  return (
    <Panel flush title="Scorecards"
      subtitle={closed ? 'This tournament is closed — scorecards are final.' : signed ? `Round ${round} was signed off by ${signed.by.name} — scorecards are final.`
        : `Each card is checked against the marker’s record. ${required ? 'Marker confirmation is required on every hole before a card can be verified.' : 'The marker’s record is checked where they entered one.'}${pickups ? ' P = pickup (0 points).' : ''}`}
      aside={
        <div className="flex flex-wrap gap-1.5">
          {editable && clean.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => { verifyCards(t, clean.map(r => r.entry.id), round, actor); showToast(`${clean.length} card${clean.length > 1 ? 's' : ''} verified`) }}>
              Verify {clean.length} clean card{clean.length > 1 ? 's' : ''}
            </Button>
          )}
          {([['attention', 'Needs attention'], ['verified', 'Verified'], ['all', 'All']] as [CardFilter, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} aria-pressed={filter === v}
              className={`h-9 px-3.5 rounded-full text-[13px] font-semibold font-display ${filter === v ? 'bg-ink text-white' : 'bg-canvas text-gray-600 hover:bg-gray-200'}`}>
              {label} <span className="opacity-60">{counts[v]}</span>
            </button>
          ))}
        </div>
      }>
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[640px]">
          <thead>
            <tr className="text-[12px] font-bold font-display text-gray-400 border-y border-black/[0.05]">
              <th className="py-2.5 pl-6 pr-2">Pos</th>
              <th className="py-2.5 px-2">Player</th>
              <th className="py-2.5 px-2 text-right">Gross</th>
              <th className="py-2.5 px-2 text-right">{pickups ? 'Points' : 'Net'}</th>
              <th className="py-2.5 px-2 text-right">Thru</th>
              <th className="py-2.5 px-2">Marker check</th>
              <th className="py-2.5 pl-2 pr-6 text-right">Card</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => {
              const isOpen = open === r.entry.id
              const card = outcomesFor(t, r.entry.id, round)
              const marked = markerOutcomesFor(t, r.entry.id, round)
              const diff = mismatches(t, r.entry.id, round)
              const marker = markerOf(t.id, round, r.entry.id)
              const blanks = card.filter(s => s === null).length
              const block = verifyBlockers(t, r.entry.id, round)
              const override = overrideFor(t.id, r.entry.id, round)
              const holeNo = (i: number) => holes[i]?.hole ?? i + 1
              const state = r.state
              return (
                <Fragment key={r.entry.id}>
                  <tr onClick={() => setOpen(isOpen ? null : r.entry.id)} className={`border-b border-black/[0.05] cursor-pointer hover:bg-canvas/60 ${isOpen ? 'bg-canvas/60' : ''}`}>
                    <td className="py-3 pl-6 pr-2 font-display font-extrabold text-ink">{r.position}</td>
                    <td className="py-3 px-2 text-[14px] font-semibold text-ink">{r.entry.name}{pendingDq(t.id, r.entry.id) && <span className={`${CHIP} bg-rose-50 text-rose-700 ml-2`}>DQ with the organiser</span>}</td>
                    <td className="py-3 px-2 text-right font-display font-bold">{r.thru ? toPar(r.grossToPar) : '–'}</td>
                    <td className="py-3 px-2 text-right text-[13px] text-gray-600">{r.thru ? (pickups ? `${r.points}${r.pickups ? ` · ${r.pickups}P` : ''}` : toPar(r.netToPar)) : '–'}</td>
                    <td className="py-3 px-2 text-right text-[13px] text-gray-600">{r.thru === r.holes ? 'F' : r.thru}</td>
                    <td className="py-3 px-2">
                      {override ? <span title={`${override.by.name}: ${override.reason}`} className={`${CHIP} bg-violet-50 text-violet-700`}>Override · {override.by.name.split(' ')[0]}</span>
                        : markerMissing(t, round, r.entry.id) || (block.noMarker && r.status === 'playing') ? <span className={`${CHIP} bg-rose-50 text-rose-700`}>No marker</span>
                        : diff.length ? <span className={`${CHIP} bg-rose-50 text-rose-700`}>{diff.length > 1 ? `${diff.length} score discrepancies` : 'Score discrepancy'}</span>
                        : block.unconfirmed.length && r.state !== 'in-progress' ? <span className={`${CHIP} bg-amber-50 text-amber-700`}>{block.unconfirmed.length} not confirmed</span>
                        : r.thru ? <span className={`${CHIP} bg-emerald-50 text-emerald-700`}>Agrees</span> : <span className="text-[12px] text-gray-400">—</span>}
                    </td>
                    <td className="py-3 pl-2 pr-6 text-right">
                      {r.status !== 'playing' ? <StatusChip status={r.status} /> : (
                        <span className={`${CHIP} ${state === 'verified' ? 'bg-emerald-50 text-emerald-700' : state === 'submitted' ? 'bg-amber-50 text-amber-700' : 'bg-canvas text-gray-500'}`}>
                          {state === 'verified' ? 'Verified' : state === 'submitted' ? 'Submitted' : 'Playing'}
                        </span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-canvas/60 border-b border-black/[0.05]">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="overflow-x-auto">
                          <table className="text-center text-[12px]">
                            <tbody>
                              <tr>
                                <td className="pr-3 text-left text-[11px] font-bold text-gray-400 whitespace-nowrap">Hole</td>
                                {holes.map(h => <td key={h.hole} className="w-9 text-[11px] font-bold text-gray-400">{h.hole}</td>)}
                              </tr>
                              <tr>
                                <td className="pr-3 text-left text-[12px] font-semibold text-ink whitespace-nowrap">Player</td>
                                {holes.map((h, i) => (
                                  <td key={h.hole} className="py-0.5">
                                    {editable && state !== 'verified'
                                      ? <button onClick={() => setCorrecting({ entry: r.entry, holeIndex: i })} aria-label={`Correct hole ${h.hole}`}
                                          className={`rounded-lg hover:ring-2 hover:ring-pine-400 ${diff.includes(i) ? 'ring-2 ring-rose-400' : block.unconfirmed.includes(i) ? 'ring-2 ring-amber-300' : ''}`}><OutcomeCell v={card[i]} par={h.par} /></button>
                                      : <span className={diff.includes(i) ? 'inline-block rounded-lg ring-2 ring-rose-400' : ''}><OutcomeCell v={card[i]} par={h.par} /></span>}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="pr-3 text-left text-[12px] font-semibold text-gray-500 whitespace-nowrap">Marker{marker ? ` (${marker.name.split(' ')[0]}${roundStatus(t.id, marker.id, round) !== 'playing' ? `, ${ROUND_STATUS_CODE[roundStatus(t.id, marker.id, round)]}` : ''})` : ''}</td>
                                {holes.map((h, i) => {
                                  const st = settledFor(t.id, r.entry.id, round)[i]
                                  if (st && marked[i] !== card[i]) return <td key={h.hole} title={`Settled by ${st.by.name}: ${st.reason}`} className="py-0.5 text-[13px] font-semibold text-violet-600"><span className="line-through opacity-60">{marked[i] ?? '–'}</span>✓</td>
                                  return <td key={h.hole} className={`py-0.5 text-[13px] font-semibold ${diff.includes(i) ? 'text-rose-600' : block.unconfirmed.includes(i) ? 'text-amber-600' : 'text-gray-400'}`}>{marked[i] ?? (block.unconfirmed.includes(i) ? '?' : '·')}</td>
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          {editable && state !== 'verified' && (
                            <Button size="sm" disabled={!block.ready} onClick={() => { verifyCards(t, [r.entry.id], round, actor) ? showToast(`${r.entry.name}'s card verified`) : showToast('Not ready to verify — reload and check the marker record', 'error') }}>Verify card</Button>
                          )}
                          {editable && state !== 'verified' && !block.ready && r.status === 'playing' && canOverride(actor) && !diff.length && (
                            <Button size="sm" variant="secondary" onClick={() => setOverriding(r.entry)}>Verify by override…</Button>
                          )}
                          {editable && state === 'verified' && (
                            <Button size="sm" variant="secondary" onClick={() => setUnlocking(r.entry)}>Unlock to correct…</Button>
                          )}
                          {editable && canChangeMarker(t, round, r.entry.id, actor) && r.status === 'playing' && state !== 'verified' && (groupsFor(t.id, round).find(g => g.entryIds.includes(r.entry.id))?.entryIds.length ?? 0) > 1 && (
                            <Button size="sm" variant={markerMissing(t, round, r.entry.id) ? 'primary' : 'ghost'} onClick={() => setMoving(r.entry)}>Change marker…</Button>
                          )}
                          {editable && actor.role !== 'golfer' && statusChoices(t, r.entry.id, round, actor).length > 0 && (
                            <Button size="sm" variant="ghost" onClick={() => setStatusFor(r.entry)}>{r.status === 'playing' ? 'Player status…' : 'Reinstate…'}</Button>
                          )}
                          <span className="text-[12px] text-gray-500">
                            {r.status === 'dq' && !decidesPlay(actor) ? 'Only the organiser can change a disqualification.'
                              : pendingDq(t.id, r.entry.id) ? 'A disqualification is with the organiser. The player keeps playing until they decide.'
                              : markerMissing(t, round, r.entry.id) ? `${marker?.name} can’t mark any more — give the card to someone else in the group.`
                              : diff.length ? 'Settle the red holes first: click a score to correct it.'
                              : override ? `Verified by override: ${override.by.name} — “${override.reason}”. Not marker-confirmed.`
                              : !block.ready && state !== 'in-progress' ? `${blockerText(block, holeNo).join(' · ')}. Ask the marker to confirm, or verify by override with a reason.`
                              : blanks && state === 'submitted' ? `Submitted with ${blanks} blank hole${blanks > 1 ? 's' : ''} — the player is responsible for the card as entered.`
                              : editable && state !== 'verified' ? 'Click any score to correct it.' : ''}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="text-[14px] text-gray-500 py-8 text-center">{filter === 'attention' ? 'Nothing needs attention right now.' : 'No cards yet.'}</p>}
      {correcting && <CorrectionModal t={t} entry={correcting.entry} round={round} holeIndex={correcting.holeIndex} actor={actor} onClose={() => setCorrecting(null)} />}
      {statusFor && <StatusModal t={t} entry={statusFor} round={round} actor={actor} onClose={() => setStatusFor(null)} />}
      {unlocking && <UnlockModal t={t} entry={unlocking} round={round} actor={actor} onClose={() => setUnlocking(null)} />}
      {moving && <MarkerModal t={t} entry={moving} round={round} actor={actor} onClose={() => setMoving(null)} />}
      {overriding && <OverrideModal t={t} entry={overriding} round={round} actor={actor} onClose={() => setOverriding(null)} />}
    </Panel>
  )
}

/* ───────── Player status (official) ───────── */

const STATUS_STYLE: Record<RoundStatus, string> = {
  playing: 'bg-canvas text-gray-500', wd: 'bg-gray-100 text-gray-600', 'no-show': 'bg-gray-100 text-gray-600', dnf: 'bg-amber-50 text-amber-700', dq: 'bg-rose-50 text-rose-700',
}
export const StatusChip = ({ status }: { status: RoundStatus }) => <span className={`${CHIP} ${STATUS_STYLE[status]}`}>{ROUND_STATUS_LABEL[status]}</span>

const STATUS_HINT: Record<RoundStatus, [string, string]> = {
  playing: ['Back in the field and the results.', 'e.g. Entered as no-show by mistake — player was on the range'],
  wd: ['Withdrew during the round. Holes played stay on the card; left out of the results.', 'e.g. Back injury on the 3rd tee'],
  'no-show': ['Didn’t turn up for their tee time.', 'e.g. No contact by 10 minutes after the tee time'],
  dnf: ['Started but couldn’t finish — not their choice (injury, darkness).', 'e.g. Couldn’t finish before dark after the weather delay'],
  dq: ['Disqualified under the rules. The reason stays with the card for the record.', 'e.g. Rule 3.3b — returned a lower score on the 7th'],
}

function StatusModal({ t, entry, round, actor, onClose }: { t: Tournament; entry: Entry; round: number; actor: Actor; onClose: () => void }) {
  const { showToast } = useApp()
  const current = roundStatus(t.id, entry.id, round)
  const choices = statusChoices(t, entry.id, round, actor)
  const [status, setStatus] = useState<RoundStatus>(choices[0])
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  // A disqualification is the organiser's decision: the official sends it to them
  const asking = status === 'dq' && !decidesPlay(actor)

  function save() {
    if (!reason.trim()) return setError('A reason is required — it goes in the change log')
    if (asking) {
      raiseRequest(t, { round, kind: 'dq', entryId: entry.id, reason }, actor)
      showToast(`Sent to the organiser — ${entry.name} keeps playing until they decide`, 'info')
      return onClose()
    }
    setPlayerStatus(t, entry.id, round, status, reason, actor)
    showToast(status === 'playing' ? `${entry.name} is back in the results` : `${entry.name}: ${ROUND_STATUS_LABEL[status].toLowerCase()} — left out of the results`)
    onClose()
  }

  return (
    <Modal title={`Player status · ${entry.name}`} subtitle={`Now: ${ROUND_STATUS_LABEL[current]}. Scores already entered stay on the card. The change is kept with your name.`} onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth variant={status === 'dq' ? 'danger' : 'primary'} onClick={save}>{asking ? 'Send to organiser' : status === 'playing' ? 'Reinstate' : 'Save status'}</Button></>}>
      <Chips label="Set to" options={choices.map(c => ({ value: c, label: c === 'playing' ? 'Back to playing' : ROUND_STATUS_LABEL[c] }))} value={status} onChange={v => { setStatus(v); setError('') }} />
      <p className="text-[12px] text-gray-500 -mt-2">{asking ? 'The organiser makes the final decision. The player keeps playing until then.' : STATUS_HINT[status][0]}</p>
      <Input label="Reason *" placeholder={STATUS_HINT[status][1]} value={reason} error={error} onChange={e => { setReason(e.target.value); setError('') }} />
    </Modal>
  )
}

/** A verified card is locked; opening it again needs a reason, which goes in the change log */
function UnlockModal({ t, entry, round, actor, onClose }: { t: Tournament; entry: Entry; round: number; actor: Actor; onClose: () => void }) {
  const { showToast } = useApp()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  function save() {
    if (!reason.trim()) return setError('A reason is required — it goes in the change log')
    if (unlockCard(t, entry.id, round, reason, actor)) showToast(`${entry.name}'s card is open to correct`, 'info')
    onClose()
  }
  return (
    <Modal title={`Unlock ${entry.name}’s card`} subtitle="The card goes back to handed in so you can correct a score, then verify it again. The unlock is kept with your name." onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth onClick={save}>Unlock card</Button></>}>
      <Input label="Reason *" placeholder="e.g. Player reported a wrong score on the 14th after handing in" value={reason} error={error} onChange={e => { setReason(e.target.value); setError('') }} />
    </Modal>
  )
}

/** The marker withdrew or was disqualified (or the group asks for a change): someone else in the group takes the card */
function MarkerModal({ t, entry, round, actor, onClose }: { t: Tournament; entry: Entry; round: number; actor: Actor; onClose: () => void }) {
  const { showToast } = useApp()
  const now = markerOf(t.id, round, entry.id)
  const nowStatus = now ? roundStatus(t.id, now.id, round) : 'playing'
  const choices = markerChoices(t, round, entry.id)
  const [to, setTo] = useState(choices[0]?.id ?? '')
  const [reason, setReason] = useState(now && nowStatus !== 'playing' ? `${now.name}: ${ROUND_STATUS_LABEL[nowStatus].toLowerCase()}` : '')
  const [error, setError] = useState('')
  function save() {
    if (!to) return setError('Nobody else in the group is still playing')
    if (!reason.trim()) return setError('A reason is required — it goes in the change log')
    setMarker(t, round, entry.id, to, reason, actor)
    showToast(`${choices.find(c => c.id === to)?.name} now marks ${entry.name}`)
    onClose()
  }
  return (
    <Modal title={`Change marker · ${entry.name}`} subtitle={`Now: ${now ? `${now.name}${nowStatus !== 'playing' ? ` (${ROUND_STATUS_LABEL[nowStatus].toLowerCase()})` : ''}` : 'nobody'}. Holes already marked stay on the record; the new marker carries on from the next hole.`} onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth disabled={!choices.length} onClick={save}>Change marker</Button></>}>
      {choices.length
        ? <Chips label="New marker (same group)" options={choices.map(c => ({ value: c.id, label: c.name }))} value={to} onChange={v => { setTo(v); setError('') }} />
        : <p className="rounded-2xl bg-amber-50 text-amber-800 text-[13px] px-4 py-3">Nobody else in the group is still playing. A marshal or official marks the card on paper; enter it when it’s handed in.</p>}
      <Input label="Reason *" placeholder="e.g. Marker withdrew injured on the 6th" value={reason} error={error} onChange={e => { setReason(e.target.value); setError('') }} />
    </Modal>
  )
}

/* ───────── Suspending play (the organiser's decision; an official asks) ───────── */

/** On every console while play is stopped */
export function SuspendedBanner({ t }: { t: Tournament }) {
  useLiveVersion()
  const s = suspensionFor(t.id)
  if (!s) return null
  return (
    <div role="status" className="mb-6 flex items-start gap-3 bg-rose-600 text-white rounded-2xl px-5 py-4 text-[14px] leading-relaxed">
      <span className="w-2.5 h-2.5 rounded-full bg-white mt-1.5 flex-shrink-0 animate-pulse" />
      <p><span className="font-bold font-display">Play suspended at {fmtTime(s.at)} — {s.reason}.</span> {s.note ? `“${s.note}” ` : ''}Every player has been told to mark their ball and stop. Suspended by {s.by}.</p>
    </div>
  )
}

function SuspendModal({ t, round, actor, onClose }: { t: Tournament; round: number; actor: Actor; onClose: () => void }) {
  const { showToast } = useApp()
  const [reason, setReason] = useState<string>(SUSPEND_REASONS[0])
  const [note, setNote] = useState('')
  const players = entriesFor(t.id).filter(e => e.status === 'registered' && roundStatus(t.id, e.id, round) === 'playing').length
  const asking = !decidesPlay(actor)
  function save() {
    if (asking) {
      raiseRequest(t, { round, kind: 'suspend', reason, note }, actor)
      showToast('Sent to the organiser — play carries on until they decide', 'info')
    } else {
      suspendPlay(t, round, reason, note, actor)
      showToast(`Play suspended — ${players} players, marshals and officials have been told`)
    }
    onClose()
  }
  return (
    <Modal title={asking ? 'Ask the organiser to suspend play' : 'Suspend play'}
      subtitle={asking ? `The organiser makes the final decision and play carries on until they do.${t.contactPhone ? ` Can’t wait? Call them on ${t.contactPhone}.` : ''}` : 'Stops the round for the whole field. Players see it on their scorecard straight away; marshals and officials see it on their consoles.'} onClose={onClose}
      footer={<>
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        <Button fullWidth variant="danger" onClick={save}>{asking ? 'Send to organiser' : 'Suspend play'}</Button>
      </>}>
      <Chips label="Why" options={SUSPEND_REASONS.map(r => ({ value: r as string, label: r }))} value={reason} onChange={setReason} />
      <Textarea label="Message to players (optional)" placeholder="e.g. Mark your ball and go to the clubhouse. Next update at 3:00 PM." value={note} onChange={e => setNote(e.target.value)} style={{ minHeight: 80 }} />
      <div className="rounded-2xl bg-canvas px-4 py-3 text-[12px] text-gray-500 leading-relaxed">
        <span className="font-bold text-ink">Players see:</span> “Play suspended — {reason.toLowerCase()}. Mark your ball and stop play.{note.trim() ? ` ${note.trim()}` : ''}” In-app now; push and SMS come with notifications.
      </div>
    </Modal>
  )
}

function ResumeModal({ t, round, actor, onClose }: { t: Tournament; round: number; actor: Actor; onClose: () => void }) {
  const { showToast } = useApp()
  const [note, setNote] = useState('')
  const asking = !decidesPlay(actor)
  function save() {
    if (asking) {
      raiseRequest(t, { round, kind: 'resume', reason: 'Ready to carry on', note }, actor)
      showToast('Sent to the organiser', 'info')
    } else {
      resumePlay(t, round, note, actor)
      showToast('Play resumed — everyone has been told')
    }
    onClose()
  }
  return (
    <Modal title={asking ? 'Ask the organiser to resume play' : 'Resume play'} subtitle={asking ? 'The organiser makes the final decision. Play stays suspended until they do.' : 'Players replace their ball where they marked it and carry on. The pause is kept in the change log.'} onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth onClick={save}>{asking ? 'Send to organiser' : 'Resume play'}</Button></>}>
      <Textarea label="Message to players (optional)" placeholder="e.g. Siren at 3:10 PM. Play resumes from where you marked your ball." value={note} onChange={e => setNote(e.target.value)} style={{ minHeight: 80 }} />
    </Modal>
  )
}

/* ───────── Decisions that belong to the organiser ───────── */

const REQUEST_STYLE: Record<RequestStatus, [string, string]> = {
  pending: ['With the organiser', 'bg-amber-50 text-amber-700'], approved: ['Approved', 'bg-emerald-50 text-emerald-700'], declined: ['Declined', 'bg-gray-100 text-gray-600'],
}

const Waiting = ({ t, at }: { t: Tournament; at: string }) => (
  <p className="mt-4 rounded-2xl bg-amber-50 text-amber-800 text-[13px] px-4 py-3 leading-relaxed">
    <span className="font-bold">Waiting for the organiser.</span> You asked at {fmtTime(at)}.{t.contactPhone ? ` Can’t wait? Call them on ${t.contactPhone}.` : ''}
  </p>
)

/** Official: what they've sent to the organiser, and the answers */
export function MyRequests({ t }: { t: Tournament }) {
  useOpsVersion()
  const list = requestsFor(t.id)
  if (!list.length) return null
  return (
    <Panel title="Sent to the organiser" subtitle="The organiser makes the final decision on disqualifications and on stopping or restarting play">
      <ul className="space-y-3">
        {list.map(r => (
          <li key={r.id}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-display font-bold text-ink text-[14px] leading-snug">{requestTitle(t, r)}</p>
              <span className={`${CHIP} ${REQUEST_STYLE[r.status][1]}`}>{REQUEST_STYLE[r.status][0]}</span>
            </div>
            <p className="text-[12px] text-gray-500 mt-0.5">{r.by.name} at {fmtTime(r.at)}: {r.reason}</p>
            {r.decidedBy && r.answer && <p className="text-[13px] text-gray-700 mt-1"><span className="font-semibold text-ink">{r.decidedBy.name}:</span> {r.answer}</p>}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function DecideRequestModal({ t, request: r, actor, onClose }: { t: Tournament; request: OrganiserRequest; actor: Actor; onClose: () => void }) {
  const { showToast } = useApp()
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const action = r.kind === 'dq' ? 'Disqualify player' : r.kind === 'suspend' ? 'Suspend play' : 'Resume play'
  function decide(approve: boolean) {
    if (!approve && !answer.trim()) return setError('Say why, so the official knows')
    decideRequest(t, r.id, approve, answer, actor)
    showToast(approve ? `${action}: done — everyone has been told` : 'Declined — the official sees your answer', approve ? 'success' : 'info')
    onClose()
  }
  return (
    <Modal title={requestTitle(t, r)} subtitle={`Asked by ${r.by.name} at ${fmtTime(r.at)}, round ${r.round}. You make the final decision.`} onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={() => decide(false)}>Decline</Button><Button fullWidth variant={r.kind === 'resume' ? 'primary' : 'danger'} onClick={() => decide(true)}>{action}</Button></>}>
      <div className="rounded-2xl bg-canvas px-4 py-3 text-[14px] text-ink leading-relaxed">
        {r.reason}
        {r.note && <span className="block text-[13px] text-gray-600 mt-1">Message to players: “{r.note}”</span>}
      </div>
      <Input label="Your answer (needed to decline)" placeholder="e.g. Spoke to the player; a warning is enough" value={answer} error={error} onChange={e => { setAnswer(e.target.value); setError('') }} />
    </Modal>
  )
}

/** Organiser: what officials have sent for a final decision. Empty most of the day. */
export function OrganiserDecisions({ t, actor }: { t: Tournament; actor: Actor }) {
  useOpsVersion()
  const [deciding, setDeciding] = useState<OrganiserRequest | null>(null)
  const pending = pendingRequests(t.id)
  if (!pending.length) return null
  return (
    <div className="mb-6">
      <Panel flush title="Needs your decision" subtitle="Disqualifications and stopping or restarting play are your call">
        <ul className="divide-y divide-black/[0.05] border-t border-black/[0.05]">
          {pending.map(r => (
            <li key={r.id} className="px-6 py-4 flex items-start gap-3">
              <span className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 bg-rose-500" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-ink text-[15px] leading-snug">{requestTitle(t, r)}</p>
                <p className="text-[13px] text-gray-600 mt-0.5 leading-relaxed">{r.by.name} at {fmtTime(r.at)}: {r.reason}</p>
              </div>
              <Button size="sm" onClick={() => setDeciding(r)}>Decide</Button>
            </li>
          ))}
        </ul>
      </Panel>
      {deciding && <DecideRequestModal t={t} request={deciding} actor={actor} onClose={() => setDeciding(null)} />}
    </div>
  )
}

/** Organiser: stop or restart play straight away */
export function PlayControl({ t, round, actor }: { t: Tournament; round: number; actor: Actor }) {
  useLiveVersion()
  const [open, setOpen] = useState<'suspend' | 'resume' | null>(null)
  return (
    <>
      {suspensionFor(t.id)
        ? <Button variant="secondary" onClick={() => setOpen('resume')}>Resume play</Button>
        : <Button variant="danger" onClick={() => setOpen('suspend')}>Suspend play</Button>}
      {open === 'suspend' && <SuspendModal t={t} round={round} actor={actor} onClose={() => setOpen(null)} />}
      {open === 'resume' && <ResumeModal t={t} round={round} actor={actor} onClose={() => setOpen(null)} />}
    </>
  )
}

/* ───────── Official's Today ───────── */

const Check = ({ ok }: { ok: boolean }) => (
  <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`} aria-hidden="true">
    {ok
      ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 6v7M12 18v.5" /></svg>}
  </span>
)

function SignOffList({ t, round }: { t: Tournament; round: number }) {
  const c = signOffChecks(t, round)
  const rows: [boolean, string][] = [
    [c.unverified.length === 0 && c.playing > 0, `Cards verified · ${c.verified} of ${c.playing}`],
    [c.decisions === 0, c.decisions ? `${c.decisions} dispute${c.decisions > 1 ? 's' : ''} waiting for a decision` : 'No disputes waiting'],
    [c.requests === 0, c.requests ? `${c.requests} decision${c.requests > 1 ? 's' : ''} with the organiser` : 'Nothing waiting for the organiser'],
    [!c.suspended, c.suspended ? 'Play is suspended' : 'Play isn’t suspended'],
  ]
  return (
    <ul className="space-y-2.5">
      {rows.map(([ok, text]) => <li key={text} className="flex items-center gap-2.5 text-[14px]"><Check ok={ok} /><span className={ok ? 'text-ink' : 'text-gray-600'}>{text}</span></li>)}
      {c.excluded > 0 && <li className="text-[12px] text-gray-500 pl-[34px]">{c.excluded} player{c.excluded > 1 ? 's' : ''} out of the results (WD, NS, DNF or DQ)</li>}
    </ul>
  )
}

const TONE: Record<NeedItem['tone'], string> = { urgent: 'bg-rose-500', normal: 'bg-amber-400', info: 'bg-gray-300' }

export function OfficialToday({ t, round, actor, onOpen }: { t: Tournament; round: number; actor: Actor; onOpen: (tab: NeedItem['tab'] | 'results') => void }) {
  useLiveVersion()
  useOpsVersion()
  const items = officialQueue(t, round)
  const signed = signOffFor(t.id, round)
  const s = suspensionFor(t.id)
  const asked = pendingRequests(t.id).find(r => r.kind !== 'dq')
  const [suspending, setSuspending] = useState(false)
  const [resuming, setResuming] = useState(false)

  return (
    <div className="grid xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6 items-start">
      <Panel flush title="Needs you now" subtitle="Decisions first, then players’ requests and cards to check. Everything you do is kept with your name.">
        {items.length === 0 ? <p className="px-6 pb-8 pt-2 text-[14px] text-gray-500">Nothing waiting. Players and marshals reach you here.</p> : (
          <ul className="divide-y divide-black/[0.05] border-t border-black/[0.05]">
            {items.map(i => (
              <li key={i.id} className="px-6 py-4 flex items-start gap-3">
                <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${TONE[i.tone]}`} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-ink text-[15px] leading-snug">{i.title}</p>
                  <p className="text-[13px] text-gray-600 mt-0.5 leading-relaxed">{i.detail}</p>
                  {i.at && <p className="text-[11px] text-gray-400 mt-1">{fmtTime(i.at)}</p>}
                </div>
                <Button size="sm" variant={i.tone === 'urgent' ? 'primary' : 'secondary'} onClick={() => onOpen(i.tab)}>
                  {i.tone === 'urgent' ? 'Decide' : i.tab === 'scorecards' ? 'Check cards' : 'Open'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="space-y-6">
        <Panel title="Play" subtitle={s ? `Suspended at ${fmtTime(s.at)} by ${s.by}` : 'Groups are on the course'}>
          {s ? (
            <>
              <p className="rounded-2xl bg-rose-50 text-rose-800 text-[14px] px-4 py-3 leading-relaxed"><span className="font-bold">{s.reason}.</span>{s.note ? ` ${s.note}` : ''}</p>
              {asked ? <Waiting t={t} at={asked.at} /> : <Button fullWidth className="mt-4" onClick={() => setResuming(true)}>Ask the organiser to resume</Button>}
            </>
          ) : (
            <>
              <p className="text-[13px] text-gray-600 leading-relaxed">Lightning, heavy rain or darkness: ask the organiser to stop the round. They make the final decision, and players and staff are told at once.</p>
              {asked ? <Waiting t={t} at={asked.at} /> : <Button fullWidth variant="danger" className="mt-4" disabled={!!signed} onClick={() => setSuspending(true)}>Ask the organiser to suspend</Button>}
            </>
          )}
        </Panel>
        <MyRequests t={t} />
        <Panel title={`Round ${round} sign-off`} subtitle={signed ? `Signed off by ${signed.by.name} at ${fmtTime(signed.at)}` : 'Once every card is verified and every dispute decided'}>
          <SignOffList t={t} round={round} />
          <Button fullWidth variant="secondary" className="mt-4" onClick={() => onOpen('results')}>{signed ? 'See the results' : 'Go to results'}</Button>
        </Panel>
      </div>
      {suspending && <SuspendModal t={t} round={round} actor={actor} onClose={() => setSuspending(false)} />}
      {resuming && <ResumeModal t={t} round={round} actor={actor} onClose={() => setResuming(false)} />}
    </div>
  )
}

/* ───────── Results: round results and sign-off (official), leaderboard, winners and reports (organiser) ───────── */

const BASIS_TEXT = { gross: 'gross', net: 'net', 'gross-and-net': 'gross and net' } as const
const shortDivision = (t: Tournament, id: string) => t.divisions?.find(d => d.id === id)?.name.replace(/\s*\(.*\)$/, '') ?? ''
const tieText = (t: Tournament) => {
  const tie = t.scoring?.tieBreak ?? 'countback'
  return tie === 'countback' ? 'countback (back 9, last 6, last 3, last hole)' : tie === 'playoff' ? 'a playoff on the course' : 'a shared place'
}
export const formatText = (t: Tournament) =>
  t.format === 'Four-Ball' ? `Four-Ball better ball · ${t.scoring?.allowancePct ?? 85}% of course handicap each`
  : t.format === 'Scramble' ? `Scramble · team handicap ${teamSizeOf(t) === 2 ? '35/15' : teamSizeOf(t) === 3 ? '30/20/10' : '25/20/15/10'}% of course handicaps`
  : t.format

const CardChip = ({ state }: { state: string }) => (
  <span className={`${CHIP} ${state === 'verified' ? 'bg-emerald-50 text-emerald-700' : state === 'submitted' ? 'bg-amber-50 text-amber-700' : 'bg-canvas text-gray-500'}`}>
    {state === 'verified' ? 'Verified' : state === 'submitted' ? 'Handed in' : 'Playing'}
  </span>
)

const TieNote = ({ note }: { note?: string }) =>
  note ? <span className="mt-1 inline-flex items-center h-5 px-2 rounded-full bg-lime-400/40 text-[11px] font-semibold text-pine-800 whitespace-nowrap">{note}</span> : null

/** Gross / net list and division picker for a results table (only the choices this tournament has) */
function ResultsFilters({ t, basis, onBasis, division, onDivision }: { t: Tournament; basis: RankBasis; onBasis: (b: RankBasis) => void; division: string; onDivision: (d: string) => void }) {
  const bases = basesFor(t)
  const divisions = t.divisions ?? []
  return (
    <>
      {bases.length > 1 && bases.map(b => (
        <button key={b} onClick={() => onBasis(b)} aria-pressed={basis === b}
          className={`h-9 px-3.5 rounded-full text-[13px] font-semibold font-display ${basis === b ? 'bg-ink text-white' : 'bg-canvas text-gray-600 hover:bg-gray-200'}`}>{RANK_LABEL[b]}</button>
      ))}
      {divisions.length > 1 && (
        <select aria-label="Division" value={division} onChange={e => onDivision(e.target.value)} className={SELECT}>
          <option value="">All divisions</option>
          {divisions.map(d => <option key={d.id} value={d.id}>{shortDivision(t, d.id)}</option>)}
        </select>
      )}
    </>
  )
}

type Row = Standing['row']
const mainScore = (r: Row, basis: RankBasis) =>
  !r.thru ? '–' : basis === 'points' ? `${r.points} pts` : basis === 'net' ? `${r.net} (${toPar(r.netToPar)})` : `${r.gross} (${toPar(r.grossToPar)})`
const otherScore = (r: Row, basis: RankBasis) =>
  !r.thru ? '–' : basis === 'gross' ? `${r.net} (${toPar(r.netToPar)})` : `${r.gross} (${toPar(r.grossToPar)})`

/** One round in order with countback notes; teams list their players */
function RoundTable({ t, list, basis }: { t: Tournament; list: Standing[]; basis: RankBasis }) {
  const team = teamSizeOf(t) > 1
  const divisions = t.divisions ?? []
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left min-w-[560px]">
        <thead>
          <tr className="text-[12px] font-bold font-display text-gray-400 border-y border-black/[0.05]">
            <th className="py-2.5 pl-6 pr-2">Pos</th><th className="py-2.5 px-2">{team ? 'Team' : 'Player'}</th>
            <th className="py-2.5 px-2 text-right">{RANK_LABEL[basis]}</th><th className="py-2.5 px-2 text-right">{basis === 'gross' ? 'Net' : 'Gross'}</th>
            <th className="py-2.5 px-2 text-right">Thru</th><th className="py-2.5 pl-2 pr-6 text-right">Card</th>
          </tr>
        </thead>
        <tbody>
          {list.map(({ row: r, position, tieNote }) => (
            <tr key={r.id} className={`border-b border-black/[0.05] text-[13px] align-top ${r.status !== 'playing' ? 'text-gray-400' : ''}`}>
              <td className="py-2.5 pl-6 pr-2 font-display font-extrabold text-ink">{position}</td>
              <td className="py-2.5 px-2 font-semibold text-ink">
                {r.name}
                {team && <span className="block text-[11px] font-normal text-gray-500">{r.members.map(m => m.name).join(' · ')}{t.format === 'Scramble' ? ` · team handicap ${r.playing}` : ` · HCP ${r.handicaps.join(' / ')}`}</span>}
                {!team && divisions.length > 1 && <span className="block text-[11px] font-normal text-gray-500">{shortDivision(t, r.divisionId)}</span>}
                <TieNote note={tieNote} />
              </td>
              <td className="py-2.5 px-2 text-right font-display font-bold whitespace-nowrap">{mainScore(r, basis)}</td>
              <td className="py-2.5 px-2 text-right text-gray-600 whitespace-nowrap">{otherScore(r, basis)}</td>
              <td className="py-2.5 px-2 text-right text-gray-600">{r.thru === r.holes ? 'F' : r.thru}</td>
              <td className="py-2.5 pl-2 pr-6 text-right">{r.status !== 'playing' ? <StatusChip status={r.status} /> : <CardChip state={r.state} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ResultsBoard({ t, round, actor }: { t: Tournament; round: number; actor: Actor }) {
  useLiveVersion()
  useOpsVersion()
  const { showToast, showDialog } = useApp()
  const [basis, setBasis] = useState<RankBasis>(basesFor(t)[0])
  const [division, setDivision] = useState('')
  const list = ranking(t, round, { basis, divisionId: division || undefined })
  const checks = signOffChecks(t, round)
  const signed = signOffFor(t.id, round)
  const inResults = list.filter(s => s.row.status === 'playing')
  const out = list.filter(s => s.row.status !== 'playing')
  const unfinished = inResults.filter(s => s.row.thru < s.row.holes).length

  function signOff() {
    showDialog({
      title: `Sign off round ${round}?`,
      message: 'The cards and results are locked. You can’t change scores or statuses after this; the organiser confirms the winners, publishes the results to players and closes the tournament.',
      confirmLabel: 'Sign off',
      onConfirm: () => { if (signOffRound(t, round, actor)) showToast(`Round ${round} signed off — the organiser has been told to publish`) },
    })
  }

  return (
    <div className="grid xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-6 items-start">
      <Panel flush title={`Round ${round} results`}
        subtitle={<>{formatText(t)} · {t.format === 'Stableford' ? 'points' : BASIS_TEXT[t.scoring?.basis ?? (t.format === 'Stroke Play' ? 'gross' : 'gross-and-net')]} · ties by {tieText(t)}</>}
        aside={<ResultsFilters t={t} basis={basis} onBasis={setBasis} division={division} onDivision={setDivision} />}>
        {unfinished > 0 && <p className="mx-6 mb-3 rounded-2xl bg-amber-50 text-amber-800 text-[13px] px-4 py-2.5">{unfinished} {teamSizeOf(t) > 1 ? `team${unfinished > 1 ? 's are' : ' is'}` : `player${unfinished > 1 ? 's are' : ' is'}`} still on the course — positions can change.</p>}
        <RoundTable t={t} list={inResults} basis={basis} />
      </Panel>
      <div className="space-y-6">
        <Panel title="Sign off" subtitle={signed ? `Signed off by ${signed.by.name} at ${fmtTime(signed.at)}` : 'The committee confirms the results; the organiser publishes them'}>
          {signed ? (
            <p className="rounded-2xl bg-emerald-50 text-emerald-900 text-[14px] px-4 py-3 leading-relaxed">
              Cards and results for round {round} are locked. The organiser confirms the winners, publishes the results to players and closes the tournament; after that this login stops working.
            </p>
          ) : (
            <>
              <SignOffList t={t} round={round} />
              <Button fullWidth className="mt-5" disabled={!checks.ready} onClick={signOff}>Sign off round {round}</Button>
              {!checks.ready && <p className="text-[12px] text-gray-500 mt-2.5 leading-relaxed">Verify every card and decide every dispute first. Players out of the results don’t hold it up.</p>}
              {t.status === 'in-progress' && unfinished > 0 && (
                <button onClick={() => { finishRoundForDemo(t, round); showToast('Demo: everyone finished and handed in their card', 'info') }}
                  className="mt-4 text-[12px] font-semibold text-pine-700 underline underline-offset-4">Demo only: play out the round</button>
              )}
            </>
          )}
        </Panel>
        <Panel title="Not in the results" subtitle="Their cards are kept; they’re listed with their status, never deleted">
          {out.length === 0 ? <p className="text-[14px] text-gray-500">Everyone is in the results.</p> : (
            <ul className="space-y-2.5">
              {out.map(({ row: r }) => (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <span className="text-[14px] font-semibold text-ink">{r.name}<span className="block text-[12px] text-gray-500 font-normal">Thru {r.thru} · gross {r.thru ? r.gross : '–'}</span></span>
                  <StatusChip status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

/** Organiser: the live order for a round, the same list players see, with the card state next to each */
export function LeaderboardBoard({ t, round }: { t: Tournament; round: number }) {
  useLiveVersion()
  useOpsVersion()
  const [basis, setBasis] = useState<RankBasis>(basesFor(t)[0])
  const [division, setDivision] = useState('')
  const list = ranking(t, round, { basis, divisionId: division || undefined })
  const signed = signOffFor(t.id, round)
  return (
    <div className="space-y-6">
      <Panel flush title={`Leaderboard · round ${round}`}
        subtitle={<>{formatText(t)} · ties by {tieText(t)} · {signed ? `signed off by ${signed.by.name}` : t.status === 'in-progress' ? 'updates as scores come in' : 'not signed off'}</>}
        aside={<ResultsFilters t={t} basis={basis} onBasis={setBasis} division={division} onDivision={setDivision} />}>
        {list.some(s => s.row.thru > 0) ? <RoundTable t={t} list={list} basis={basis} /> : <p className="text-[14px] text-gray-500 px-6 pb-8 pt-2">No scores yet for round {round}.</p>}
      </Panel>
      <OverallBoard t={t} round={round} />
    </div>
  )
}

/** Multi-round tournaments: the rounds added up, and which rounds are signed off */
export function OverallBoard({ t, round }: { t: Tournament; round: number }) {
  useLiveVersion()
  useOpsVersion()
  const [basis, setBasis] = useState<RankBasis>(basesFor(t)[0])
  const [division, setDivision] = useState('')
  const rounds = t.rounds ?? []
  if (rounds.length < 2) return null
  const rows = overallStandings(t, round, { basis, divisionId: division || undefined })
  const points = basis === 'points'
  return (
    <Panel flush title={`Overall after round ${round} of ${rounds.length}`}
      subtitle={<>Rounds added up ({RANK_LABEL[basis].toLowerCase()}). Final results need every round signed off — {rounds.map(r => `round ${r.number}: ${signOffFor(t.id, r.number) ? 'signed off' : 'not yet'}`).join(' · ')}. A tie at the end goes to countback on the last round’s card.</>}
      aside={<ResultsFilters t={t} basis={basis} onBasis={setBasis} division={division} onDivision={setDivision} />}>
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[480px]">
          <thead>
            <tr className="text-[12px] font-bold font-display text-gray-400 border-y border-black/[0.05]">
              <th className="py-2.5 pl-6 pr-2">Pos</th><th className="py-2.5 px-2">{teamSizeOf(t) > 1 ? 'Team' : 'Player'}</th>
              {rounds.filter(r => r.number <= round).map(r => <th key={r.number} className="py-2.5 px-2 text-right">R{r.number}</th>)}
              <th className="py-2.5 px-2 text-right">Total</th><th className="py-2.5 pl-2 pr-6 text-right">{points ? '' : 'To par'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className={`border-b border-black/[0.05] text-[13px] align-top ${r.out ? 'text-gray-400' : ''}`}>
                <td className="py-2 pl-6 pr-2 font-display font-extrabold text-ink">{r.position}</td>
                <td className="py-2 px-2 font-semibold text-ink">
                  {r.name}
                  {r.out && <span className="block text-[11px] font-normal text-gray-500">{ROUND_STATUS_LABEL[r.out.status]} in round {r.out.round}</span>}
                  <TieNote note={r.tieNote} />
                </td>
                {r.byRound.map((v, k) => <td key={k} className="py-2 px-2 text-right text-gray-600">{v ?? '–'}</td>)}
                <td className="py-2 px-2 text-right font-display font-bold">{r.byRound.some(v => v !== null) ? r.total : '–'}</td>
                <td className="py-2 pl-2 pr-6 text-right text-gray-600">{!points && r.byRound.some(v => v !== null) ? toPar(r.toPar) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

/** Where every round stands: signed off by whom, or what's still open */
function RoundSignOffs({ t }: { t: Tournament }) {
  const rounds = t.rounds?.length ? t.rounds.map(r => r.number) : [1]
  return (
    <ul className="space-y-2.5">
      {rounds.map(n => {
        const s = signOffFor(t.id, n)
        const c = signOffChecks(t, n)
        return (
          <li key={n} className="flex items-start gap-2.5 text-[14px]">
            <Check ok={!!s || t.status === 'completed'} />
            <span className="text-ink">Round {n}<span className="block text-[12px] text-gray-500">
              {s ? `Signed off by ${s.by.name} at ${fmtTime(s.at)}` : t.status === 'completed' ? 'Final' : `Not signed off · ${c.verified} of ${c.playing} cards verified${c.decisions ? ` · ${c.decisions} dispute${c.decisions > 1 ? 's' : ''} open` : ''}`}
            </span></span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Organiser: who wins each prize. Ranked prizes take the top of their list (gross, net, a division) after the last
 * round — one ranked prize per player or team, the next best takes the other. Hole prizes (closest to the pin,
 * longest drive) are measured on the course and picked here. Confirmed winners go to golfers when results are published.
 */
export function WinnersBoard({ t, actor, canEdit }: { t: Tournament; actor: Actor; canEdit: boolean }) {
  useLiveVersion()
  useOpsVersion()
  const { showToast } = useApp()
  const prizes = prizesFor(t)
  const declared = declaredWinners(t.id)
  const suggested = suggestWinners(t)
  const [draft, setDraft] = useState<Winner[]>(() => declared?.winners ?? suggested)
  const closed = t.status === 'completed' || t.status === 'cancelled'
  const rounds = t.rounds?.length ? t.rounds.map(r => r.number) : [1]
  const unsigned = closed ? [] : rounds.filter(n => !signOffFor(t.id, n))
  const field = entriesFor(t.id).filter(e => e.status === 'registered')
  const set = (prizeId: string, patch: Partial<Winner>) => setDraft(d => prizes.map(p => ({ ...(d.find(w => w.prizeId === p.id) ?? { prizeId: p.id }), ...(p.id === prizeId ? patch : {}) })))
  const changed = JSON.stringify(draft) !== JSON.stringify(declared?.winners ?? null)
  const editable = canEdit && !closed

  function confirm() {
    declareWinners(t, draft, actor)
    showToast('Winners confirmed — golfers see them when you publish the results')
  }

  return (
    <div className="grid xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 items-start">
      <Panel flush title="Winners"
        subtitle={declared ? `Confirmed by ${declared.by.name} at ${fmtTime(declared.at)}${closed ? ' · published' : ''}` : 'Suggested from the final results — check them, pick the hole prizes, then confirm'}
        aside={editable && <Button size="sm" disabled={!changed && !!declared} onClick={confirm}>{declared ? 'Save changes' : 'Confirm winners'}</Button>}>
        {unsigned.length > 0 && <p className="mx-6 mb-3 rounded-2xl bg-amber-50 text-amber-800 text-[13px] px-4 py-2.5">Round {unsigned.join(' and ')} isn’t signed off yet — the order can still change.</p>}
        <ul className="divide-y divide-black/[0.05] border-t border-black/[0.05]">
          {prizes.map(p => {
            const basis = prizeBasis(t, p)
            const w = draft.find(x => x.prizeId === p.id) ?? { prizeId: p.id }
            const list = prizeStandings(t, p)
            const tip = suggested.find(x => x.prizeId === p.id)
            return (
              <li key={p.id} className="px-6 py-4 grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 items-start">
                <div>
                  <p className="font-display font-bold text-ink text-[15px]">{prizeLabel(t, p)}</p>
                  <p className="text-[12px] text-gray-500">{p.value || 'No prize value set'} · {basis === 'hole' ? 'measured on the course' : `${RANK_LABEL[basis].toLowerCase()} list${p.divisionId ? `, ${shortDivision(t, p.divisionId)}` : ''}`}</p>
                </div>
                {!editable ? (
                  <p className="text-[14px] font-semibold text-ink">{w.name ?? <span className="text-gray-400 font-normal">Not picked</span>}{w.detail && <span className="block text-[12px] text-gray-500 font-normal">{w.detail}</span>}</p>
                ) : basis === 'hole' ? (
                  <div className="flex flex-wrap gap-2">
                    <select aria-label={`Winner: ${prizeLabel(t, p)}`} value={w.rowId ?? ''} className={`${SELECT} flex-1 min-w-[160px]`}
                      onChange={e => set(p.id, { rowId: e.target.value || undefined, name: field.find(f => f.id === e.target.value)?.name })}>
                      <option value="">Pick the player…</option>
                      {field.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <input aria-label={`Distance: ${prizeLabel(t, p)}`} placeholder="e.g. 4 ft 2 in" value={w.detail ?? ''} onChange={e => set(p.id, { detail: e.target.value })}
                      className={`${SELECT} w-32 font-normal`} />
                  </div>
                ) : (
                  <div>
                    <select aria-label={`Winner: ${prizeLabel(t, p)}`} value={w.rowId ?? ''} className={`${SELECT} w-full`}
                      onChange={e => { const r = list.find(x => x.id === e.target.value); set(p.id, r ? { rowId: r.id, name: r.name, detail: scoreText(r, basis) } : { rowId: undefined, name: undefined, detail: undefined }) }}>
                      <option value="">Nobody</option>
                      {list.slice(0, 8).map(r => <option key={r.id} value={r.id}>{r.position} · {r.name} · {scoreText(r, basis)}</option>)}
                    </select>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {!list.length ? 'Nobody has finished every round yet.' : w.rowId && w.rowId === tip?.rowId ? 'Top of the list' : tip?.name ? `Suggested: ${tip.name}` : ''}
                      {list.find(r => r.id === w.rowId)?.tieNote ? ` · ${list.find(r => r.id === w.rowId)!.tieNote}` : ''}
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <p className="px-6 py-4 text-[12px] text-gray-500 leading-relaxed">One ranked prize per player or team: when someone tops two lists, the next best takes the second prize. Changing a pick is kept in the change log.</p>
      </Panel>
      <Panel title="Rounds" subtitle="Winners are final once every round is signed off and the results are published">
        <RoundSignOffs t={t} />
      </Panel>
    </div>
  )
}

/** Organiser downloads. Golfers never get these — each player downloads only their own score sheet (client, 21 Oct). */
export function ReportsBoard({ t }: { t: Tournament }) {
  useLiveVersion()
  useOpsVersion()
  const { showToast } = useApp()
  const bases = basesFor(t)
  const many = (t.divisions?.length ?? 0) > 1
  const team = teamSizeOf(t) > 1
  const players = entriesFor(t.id).filter(e => e.status === 'registered').length
  const rounds = t.rounds?.length ?? 1
  const reports: { id: string; title: string; detail: string; file: string; make: () => string }[] = [
    ...bases.map(b => ({
      id: `results-${b}`, title: `${RANK_LABEL[b]} results`, file: fileName(t, `${b}-results`), make: () => resultsCsv(t, b),
      detail: `Final order${rounds > 1 ? ` with each round’s score` : ''}, countback notes, and players out of the results (WD, NS, DNF, DQ).`,
    })),
    ...(many ? bases.map(b => ({
      id: `division-${b}`, title: `Division standings · ${RANK_LABEL[b].toLowerCase()}`, file: fileName(t, `${b}-by-division`), make: () => resultsCsv(t, b, true),
      detail: `${t.divisions!.length} divisions, each in its own order.`,
    })) : []),
    { id: 'winners', title: 'Winner details', file: fileName(t, 'winners'), make: () => winnersCsv(t), detail: 'Each prize with the winner, the winning score or distance, and contact email for the prize giving.' },
    { id: 'cards', title: 'Golfer scorecards', file: fileName(t, 'scorecards'), make: () => scorecardsCsv(t), detail: `Every card hole by hole${team ? ' (each player’s own card)' : ''}: marker, card and player status, gross, net and points.` },
    { id: 'log', title: 'Change log', file: fileName(t, 'change-log'), make: () => activityCsv(t), detail: 'Every score change, decision, status change, stoppage and sign-off with who, when and why.' },
  ]
  return (
    <Panel flush title="Reports" subtitle={`${t.name} · ${players} ${team ? 'players' : 'golfers'} · ${rounds} round${rounds > 1 ? 's' : ''} · CSV opens in Excel or Google Sheets`}>
      <ul className="divide-y divide-black/[0.05] border-t border-black/[0.05]">
        {reports.map(r => (
          <li key={r.id} className="px-6 py-4 flex items-start gap-4">
            <span className="w-10 h-10 rounded-2xl bg-canvas flex items-center justify-center flex-shrink-0 text-[11px] font-extrabold font-display text-gray-500">CSV</span>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-ink text-[15px]">{r.title}</p>
              <p className="text-[13px] text-gray-600 leading-relaxed">{r.detail}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{r.file}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => { downloadFile(r.file, r.make()); showToast(`Downloaded ${r.file}`) }}>Download</Button>
          </li>
        ))}
      </ul>
      <p className="px-6 py-4 text-[12px] text-gray-500 leading-relaxed">Golfers can’t download these. Each golfer downloads only their own score sheet from the results page.</p>
    </Panel>
  )
}

/** The golfer's own score sheet: every round, ready to print or save as PDF */
export function ScoreSheetModal({ t, entryId, onClose }: { t: Tournament; entryId: string; onClose: () => void }) {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null)
  return (
    <Modal title="My score sheet" subtitle="Your card for every round, with par, stroke index, net and points. Only you can download your sheet." onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Close</Button><Button fullWidth onClick={() => frame?.contentWindow?.print()}>Save as PDF</Button></>}>
      <iframe ref={setFrame} title="Score sheet" srcDoc={scoreSheetHtml(t, entryId)} className="w-full h-[52vh] rounded-2xl ring-1 ring-black/[0.08] bg-white" />
    </Modal>
  )
}

/* ───────── Marshal and official logins: set up, forgot password ───────── */

/** Marshals and officials set their own password with the code from the organiser's invite (same rules as the marshal, Oct 10) */
export function SetUpLoginModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useApp()
  const [f, setF] = useState({ email: '', code: '', password: '', again: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (patch: Partial<typeof f>) => { setF(v => ({ ...v, ...patch })); setErrors({}) }
  function save() {
    if (f.password !== f.again) return setErrors({ again: 'The two passwords don’t match' })
    const r = activateLogin(f.email, f.code, f.password)
    if (!r.ok) return setErrors({ [r.field]: r.error })
    showToast('Your login is ready — sign in with your new password')
    onClose()
  }
  return (
    <Modal title="Set up your login" subtitle={`For marshals and tournament officials. Use the 6-digit code from the organiser’s invite (email and text). It works once, for ${LOGIN_RULES.inviteHours} hours.`} onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth onClick={save}>Set password</Button></>}>
      <Input label="Email" type="email" value={f.email} error={errors.email} onChange={e => set({ email: e.target.value })} />
      <Input label="Invite code" inputMode="numeric" maxLength={6} placeholder="6 digits" value={f.code} error={errors.code} onChange={e => set({ code: e.target.value.replace(/\D/g, '') })} />
      <Input label="New password" type="password" value={f.password} error={errors.password} hint="At least 8 characters, with letters and numbers" onChange={e => set({ password: e.target.value })} />
      <Input label="Type it again" type="password" value={f.again} error={errors.again} onChange={e => set({ again: e.target.value })} />
    </Modal>
  )
}

/** Forgot password: a code by email and text (5 minutes, 3 tries). Same message whether or not the login exists. */
export function ForgotPasswordModal({ initialEmail = '', onClose }: { initialEmail?: string; onClose: () => void }) {
  const { showToast } = useApp()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [f, setF] = useState({ email: initialEmail, code: '', password: '', again: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (patch: Partial<typeof f>) => { setF(v => ({ ...v, ...patch })); setErrors({}) }
  function send() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErrors({ email: 'Enter the email you sign in with' })
    const code = startReset(f.email)
    const sent = 'If there’s a login for this email, we’ve sent a 6-digit code by email and text.'
    if (!code) { showToast(sent, 'info'); return onClose() }
    showToast(`${sent} (Demo code: ${code})`, 'info')
    setStep('code')
  }
  function save() {
    if (f.password !== f.again) return setErrors({ again: 'The two passwords don’t match' })
    const r = finishReset(f.email, f.code, f.password)
    if (!r.ok) return setErrors({ [r.field]: r.error })
    showToast('Password changed — sign in with the new one. Any other sessions were signed out.')
    onClose()
  }
  return (
    <Modal title="Reset your password" subtitle={step === 'email' ? 'We’ll send a code to the email and phone on your login.' : `Enter the code within ${LOGIN_RULES.resetMinutes} minutes. You have ${LOGIN_RULES.resetTries} tries.`} onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth onClick={step === 'email' ? send : save}>{step === 'email' ? 'Send code' : 'Set new password'}</Button></>}>
      {step === 'email' ? (
        <Input label="Email" type="email" value={f.email} error={errors.email} onChange={e => set({ email: e.target.value })} />
      ) : (
        <>
          <Input label="Code" inputMode="numeric" maxLength={6} placeholder="6 digits" value={f.code} error={errors.code} onChange={e => set({ code: e.target.value.replace(/\D/g, '') })} />
          <Input label="New password" type="password" value={f.password} error={errors.password} hint="At least 8 characters, with letters and numbers" onChange={e => set({ password: e.target.value })} />
          <Input label="Type it again" type="password" value={f.again} error={errors.again} onChange={e => set({ again: e.target.value })} />
        </>
      )}
    </Modal>
  )
}

/* ───────── What the golfer sees about the official's decisions ───────── */

/** Shown on the golfer's own round when an official set their status */
export function MyRoundStatus({ t, entryId, round }: { t: Tournament; entryId: string; round: number }) {
  useLiveVersion()
  useOpsVersion()
  const status = roundStatus(t.id, entryId, round)
  if (status === 'playing') return null
  const note = statusNoteFor(t.id, entryId, round)
  return (
    <div role="alert" className="mb-5 rounded-2xl bg-ink text-white px-5 py-4">
      <p className="font-display font-bold text-[16px]">Your status for round {round}: {ROUND_STATUS_LABEL[status]}</p>
      <p className="text-[14px] text-white/75 mt-0.5 leading-relaxed">
        {note ? `${note.by.name}, tournament official: “${note.reason}”. ` : ''}Your scores so far are kept and you’re left out of the results. If this is wrong, speak to the official.
      </p>
    </div>
  )
}

const ASK_STYLE: Record<IncidentStatus, [string, string]> = {
  open: ['With the marshal', 'bg-amber-50 text-amber-700'],
  committee: ['With the committee', 'bg-rose-50 text-rose-700'],
  resolved: ['Decided', 'bg-emerald-50 text-emerald-700'],
}

/** The golfer's rulings and score disputes, with the answer and any score change */
export function MyRulings({ t, entryId }: { t: Tournament; entryId: string }) {
  useOpsVersion()
  const list = rulingsFor(t.id, entryId)
  if (!list.length) return null
  return (
    <section className="bg-white rounded-[28px] shadow-card p-6">
      <h2 className="font-display font-bold text-ink text-[17px]">Your rulings</h2>
      <p className="text-[12px] text-gray-500 mt-0.5">Rules questions and score disputes about you, and what was decided.</p>
      <ul className="mt-3 space-y-3">
        {list.map(({ incident: i, changes }) => (
          <li key={i.id} className="rounded-2xl ring-1 ring-black/[0.06] p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-bold text-ink text-[14px]">{i.kind === 'rules' ? 'Rules question' : 'Score dispute'}{i.hole ? ` · hole ${i.hole}` : ''}</span>
              <span className={`${CHIP} ${ASK_STYLE[i.status][1]} ml-auto`}>{ASK_STYLE[i.status][0]}</span>
            </div>
            <p className="text-[13px] text-gray-600 mt-1 leading-relaxed">{i.note}</p>
            {i.status === 'resolved' && i.decision ? (
              <div className="mt-2.5 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-900 leading-relaxed">
                <span className="font-bold">{i.decidedBy?.name} ({ACTOR_LABEL[i.decidedBy?.role ?? 'official'].toLowerCase()}):</span> {i.decision}
                {changes.map(c => <span key={c.id} className="block font-semibold mt-1">Your card: hole {c.hole} {c.from ?? '–'} → {c.to ?? '–'}</span>)}
              </div>
            ) : i.claimedBy ? <p className="text-[12px] text-gray-500 mt-2">{i.claimedBy.name} is looking at it.</p> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ───────── Change log (official) ───────── */

const ACT_LABEL: Record<ActivityKind, string> = {
  score: 'Score', decision: 'Decision', status: 'Player status', suspend: 'Play', resume: 'Play', 'sign-off': 'Sign-off', staff: 'Staff',
  card: 'Card', marker: 'Marker', winners: 'Winners', publish: 'Results', request: 'Organiser',
}
const ACT_STYLE: Record<ActivityKind, string> = {
  score: 'bg-canvas text-ink', decision: 'bg-emerald-50 text-emerald-700', status: 'bg-amber-50 text-amber-700',
  suspend: 'bg-rose-50 text-rose-700', resume: 'bg-rose-50 text-rose-700', 'sign-off': 'bg-lime-400/40 text-ink', staff: 'bg-sky-50 text-sky-800',
  card: 'bg-canvas text-gray-600', marker: 'bg-amber-50 text-amber-700', winners: 'bg-lime-400/40 text-ink', publish: 'bg-ink text-white', request: 'bg-sky-50 text-sky-800',
}
type ActFilter = 'all' | 'score' | 'decision' | 'status' | 'play'

export function ActivityLog({ t }: { t: Tournament }) {
  useOpsVersion()
  useLiveVersion()
  const all = activityFor(t)
  const [filter, setFilter] = useState<ActFilter>('all')
  const match = (k: ActivityKind, f: ActFilter) =>
    f === 'all' || (f === 'play' ? ['suspend', 'resume', 'sign-off', 'staff', 'winners', 'publish', 'request'].includes(k) : f === 'score' ? ['score', 'card', 'marker'].includes(k) : k === f)
  const list = all.filter(a => match(a.kind, filter))
  return (
    <Panel flush title="Change log" subtitle="Every score change, decision, player status and stoppage: who, when and why. Nothing here can be edited or deleted, and it stays after the tournament closes."
      aside={
        <div className="flex flex-wrap gap-1.5">
          {([['all', 'All'], ['score', 'Scores & cards'], ['decision', 'Decisions'], ['status', 'Player status'], ['play', 'Play, staff & results']] as [ActFilter, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} aria-pressed={filter === v}
              className={`h-9 px-3.5 rounded-full text-[13px] font-semibold font-display ${filter === v ? 'bg-ink text-white' : 'bg-canvas text-gray-600 hover:bg-gray-200'}`}>
              {label} <span className="opacity-60">{all.filter(a => match(a.kind, v)).length}</span>
            </button>
          ))}
        </div>
      }>
      {list.length === 0 ? <p className="text-[14px] text-gray-500 px-6 pb-8 pt-2">Nothing yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[680px]">
            <thead>
              <tr className="text-[12px] font-bold font-display text-gray-400 border-y border-black/[0.05]">
                <th className="py-2.5 pl-6 pr-2">When</th><th className="py-2.5 px-2">What</th><th className="py-2.5 px-2">Why</th><th className="py-2.5 pl-2 pr-6">By</th>
              </tr>
            </thead>
            <tbody>
              {list.map(a => (
                <tr key={a.id} className="border-b border-black/[0.05] text-[13px] align-top">
                  <td className="py-3 pl-6 pr-2 text-gray-500 whitespace-nowrap">{fmtTime(a.at)}</td>
                  <td className="py-3 px-2"><span className={`${CHIP} ${ACT_STYLE[a.kind]}`}>{ACT_LABEL[a.kind]}</span><span className="block font-semibold text-ink mt-1">{a.title}</span></td>
                  <td className="py-3 px-2 text-gray-600">{a.detail ?? '—'}</td>
                  <td className="py-3 pl-2 pr-6 text-gray-600 whitespace-nowrap">{a.by.name}<span className="block text-[11px] text-gray-400">{ACTOR_LABEL[a.by.role]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

/* ───────── Course and local rules (official, read-only) ───────── */

export function CourseRulesBoard({ t, round }: { t: Tournament; round: number }) {
  const course = getCourse(t.courseId)
  const holes = course ? roundHoles(t, course, round) : []
  const named = holes.some(h => h.name)
  const s = t.scoring
  const target = t.pace?.targetMinutes ?? 255
  const facts: [string, string][] = [
    ['Format', formatText(t)],
    ['Results on', basesFor(t).map(b => RANK_LABEL[b]).join(' and ')],
    ['Handicap allowance', s ? `${s.allowancePct}%` : '—'],
    ['Highest Handicap Index', s?.maxHandicap !== undefined ? String(s.maxHandicap) : '—'],
    ['Ties', s?.tieBreak === 'playoff' ? `Playoff${s.playoffHoles?.length ? ` (holes ${s.playoffHoles.join(', ')})` : ''}` : s?.tieBreak === 'shared' ? 'Shared place' : 'Countback: back 9, last 6, last 3, last hole'],
    ['Cut', 'None — amateur event'],
    ['Pace', `${Math.floor(target / 60)} h ${target % 60} min a round · flag at ${t.pace?.flagMinutes ?? 10} min behind`],
    ['Score check', t.scoreVerification === 'none' ? 'Cards are not checked' : 'Committee verifies every card'],
  ]
  return (
    <div className="grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-6 items-start">
      <Panel flush title={course ? `Holes · ${course.name}` : 'Holes'} subtitle={`Round ${round} · par ${holes.reduce((n, h) => n + h.par, 0)}`}>
        {holes.length === 0 ? <p className="px-6 pb-6 text-[14px] text-gray-500">No course on this tournament.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[420px]">
              <thead>
                <tr className="text-[12px] font-bold font-display text-gray-400 border-y border-black/[0.05]">
                  <th className="py-2 pl-6 pr-2">Hole</th><th className="py-2 px-2 text-right">Par</th><th className="py-2 px-2 text-right">Stroke index</th>
                  <th className={`py-2 ${named ? 'px-2' : 'pl-2 pr-6'} text-right`}>Yards</th>{named && <th className="py-2 pl-2 pr-6">Name</th>}
                </tr>
              </thead>
              <tbody>
                {holes.map(h => (
                  <tr key={h.hole} className="border-b border-black/[0.05] text-[13px]">
                    <td className="py-2 pl-6 pr-2 font-display font-extrabold text-ink">{h.hole}</td>
                    <td className="py-2 px-2 text-right">{h.par}</td>
                    <td className="py-2 px-2 text-right text-gray-600">{h.handicap}</td>
                    <td className={`py-2 ${named ? 'px-2' : 'pl-2 pr-6'} text-right text-gray-600`}>{h.yards}</td>
                    {named && <td className="py-2 pl-2 pr-6 text-gray-500">{h.name ?? ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <div className="space-y-6">
        <Panel title="Format & scoring" subtitle="Set by the organiser; read-only here">
          <dl className="space-y-2.5">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 text-[13px]"><dt className="text-gray-500">{k}</dt><dd className="font-semibold text-ink text-right">{v}</dd></div>
            ))}
          </dl>
        </Panel>
        <Panel title="Local rules">
          <p className="text-[14px] text-gray-700 leading-relaxed whitespace-pre-line">{t.localRules?.trim() || 'The organiser hasn’t added local rules. The Rules of Golf apply.'}</p>
        </Panel>
      </div>
    </div>
  )
}

/* ───────── Score changes ───────── */

export function ScoreChangesLog({ t }: { t: Tournament }) {
  useOpsVersion()
  const changes = scoreChangesFor(t.id)
  return (
    <Panel flush title="Score changes" subtitle="Every score changed after it was entered: who, when, why. Kept for the record after the tournament closes.">
      {changes.length === 0 ? <p className="text-[14px] text-gray-500 px-6 pb-8 pt-2">No scores have been changed.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead>
              <tr className="text-[12px] font-bold font-display text-gray-400 border-y border-black/[0.05]">
                <th className="py-2.5 pl-6 pr-2">When</th><th className="py-2.5 px-2">Player</th><th className="py-2.5 px-2">Hole</th>
                <th className="py-2.5 px-2">Change</th><th className="py-2.5 px-2">Reason</th><th className="py-2.5 pl-2 pr-6">By</th>
              </tr>
            </thead>
            <tbody>
              {changes.map(c => (
                <tr key={c.id} className="border-b border-black/[0.05] text-[13px] align-top">
                  <td className="py-3 pl-6 pr-2 text-gray-500 whitespace-nowrap">{fmtTime(c.at)}</td>
                  <td className="py-3 px-2 font-semibold text-ink">{names(t, [c.entryId])}</td>
                  <td className="py-3 px-2">{c.hole}</td>
                  <td className="py-3 px-2 font-display font-bold whitespace-nowrap">{c.from ?? '–'} → {c.to ?? '–'}</td>
                  <td className="py-3 px-2 text-gray-600">{c.reason}{c.incidentId && <span className={`${CHIP} bg-canvas text-gray-600 ml-1.5`}>From a dispute</span>}</td>
                  <td className="py-3 pl-2 pr-6 text-gray-600 whitespace-nowrap">{c.by.name}<span className="block text-[11px] text-gray-400">{ACTOR_LABEL[c.by.role]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

/* ───────── Tee sheet and contacts ───────── */

export function TeeSheetBoard({ t, round }: { t: Tournament; round: number }) {
  useLiveVersion()
  const groups = groupsFor(t.id, round)
  const field = entriesFor(t.id)
  const contacts = (t.officials ?? []).filter(o => o.name.trim())
  return (
    <div className="grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 items-start">
      <Panel title={`Tee sheet · round ${round}`} subtitle={t.teeSheet?.startType === 'shotgun' ? 'Shotgun start' : `Every ${t.teeSheet?.intervalMinutes} min from ${formatClock(t.teeSheet?.firstTeeTime ?? '08:00')}`}>
        {groups.length === 0 ? <p className="text-[14px] text-gray-500 py-6 text-center">The organiser hasn’t built the tee sheet yet.</p> : (
          <ul className="divide-y divide-black/[0.05]">
            {groups.map(g => (
              <li key={g.id} className="flex gap-4 py-3">
                <span className="w-20 flex-shrink-0">
                  <span className="block font-display font-extrabold text-ink text-[15px]">{formatClock(g.time)}</span>
                  <span className="block text-[12px] text-gray-500">Hole {g.startHole}</span>
                </span>
                <span className="text-[13px] text-gray-600 leading-relaxed">{g.entryIds.map(id => field.find(e => e.id === id)?.name).filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Contacts" subtitle="Organisers, marshals and officials for this tournament">
        <ul className="space-y-3">
          {contacts.map((o, i) => (
            <li key={i} className="flex items-center justify-between gap-3">
              <span><span className="block text-[14px] font-semibold text-ink">{o.name}</span><span className="block text-[12px] text-gray-500">{o.role}</span></span>
              {o.phone && <a href={`tel:${o.phone}`} className="h-9 px-3.5 rounded-full bg-canvas text-[12px] font-bold font-display text-ink inline-flex items-center hover:bg-gray-200">{o.phone}</a>}
            </li>
          ))}
          {t.contactPhone && (
            <li className="flex items-center justify-between gap-3 pt-3 border-t border-black/[0.05]">
              <span><span className="block text-[14px] font-semibold text-ink">Tournament office</span><span className="block text-[12px] text-gray-500">{t.contactEmail}</span></span>
              <a href={`tel:${t.contactPhone}`} className="h-9 px-3.5 rounded-full bg-canvas text-[12px] font-bold font-display text-ink inline-flex items-center hover:bg-gray-200">{t.contactPhone}</a>
            </li>
          )}
        </ul>
      </Panel>
    </div>
  )
}

/* ───────── Field (organiser) ───────── */

function ReplaceModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const { showToast } = useApp()
  const [name, setName] = useState('')
  const [index, setIndex] = useState('')
  const [error, setError] = useState('')
  function save() {
    const hi = Number(index)
    if (!name.trim()) return setError('Enter the new player’s name')
    if (index === '' || Number.isNaN(hi) || hi < -10 || hi > 54) return setError('Handicap Index between +10 and 54')
    updateEntry(entry.id, { name: name.trim(), handicapIndex: hi })
    showToast(`${entry.name} replaced by ${name.trim()}`)
    onClose()
  }
  return (
    <Modal title={`Replace ${entry.name}`} subtitle="The new player takes the same spot, group, team and tee time." onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth onClick={save}>Replace player</Button></>}>
      <Input label="New player’s name" value={name} onChange={e => { setName(e.target.value); setError('') }} />
      <Input label="Handicap Index" type="number" step="0.1" value={index} error={error} onChange={e => { setIndex(e.target.value); setError('') }} />
    </Modal>
  )
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The organiser registers a golfer on their behalf (client, 17 Oct) */
function RegisterGolferModal({ t, onClose }: { t: Tournament; onClose: () => void }) {
  const { showToast } = useApp()
  const course = getCourse(t.courseId)
  const divisions = t.divisions ?? []
  const fees = t.fees
  const fee = fees ? withTax(fees.amount, fees) : 0
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', index: '', gender: 'men' as 'men' | 'women', divisionId: '', teeSetId: '', payment: (fee > 0 ? 'pay-at-course' : 'free') as PaymentStatus, notify: true })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (patch: Partial<typeof form>) => { setForm(f => ({ ...f, ...patch })); setErrors({}) }
  const hi = Number(form.index)
  const suggested = form.index !== '' && !Number.isNaN(hi) ? divisionForGolfer(divisions, { index: hi, gender: form.gender }) : undefined
  const divisionId = form.divisionId || suggested?.id || ''
  const division = divisions.find(d => d.id === divisionId)

  function save() {
    const e: Record<string, string> = {}
    if (!form.firstName.trim()) e.firstName = 'First name is required'
    if (!form.lastName.trim()) e.lastName = 'Last name is required'
    if (!EMAIL_OK.test(form.email.trim())) e.email = 'Enter a valid email — the golfer gets their confirmation here'
    if (form.index === '' || Number.isNaN(hi) || hi < -10 || hi > 54) e.index = 'Handicap Index between +10 and 54'
    else if (t.scoring?.maxHandicap !== undefined && hi > t.scoring.maxHandicap) e.index = `Above this tournament's maximum (${t.scoring.maxHandicap})`
    if (!divisionId) e.divisionId = 'Choose a division'
    if (Object.keys(e).length) return setErrors(e)
    const r = addEntry(t, { firstName: form.firstName, lastName: form.lastName, email: form.email, handicapIndex: hi, gender: form.gender, divisionId, teeSetId: form.teeSetId || undefined, paymentStatus: form.payment })
    if (!r.ok) return setErrors({ [r.field === 'email' ? 'email' : 'form']: r.error })
    showToast(`${r.entry.name} registered${form.notify ? ` — confirmation sent to ${r.entry.email}` : ''}`)
    onClose()
  }

  const payOptions: { value: PaymentStatus; label: string }[] = fee > 0
    ? [{ value: 'pay-at-course', label: 'Pay at course' }, { value: 'link-sent', label: 'Email a payment link' }, { value: 'paid', label: 'Already paid' }, { value: 'waived', label: 'Waive the fee' }]
    : [{ value: 'free', label: 'Free entry' }]

  return (
    <Modal title="Register a golfer" subtitle={`Adds them to ${t.name}. Same rules as golfers registering themselves: one entry each, no waiting list.`} onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth onClick={save}>Register golfer</Button></>}>
      {errors.form && <p className="rounded-2xl bg-rose-50 text-rose-700 text-[13px] font-semibold px-4 py-3">{errors.form}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Input label="First name" value={form.firstName} error={errors.firstName} onChange={e => set({ firstName: e.target.value })} />
        <Input label="Last name" value={form.lastName} error={errors.lastName} onChange={e => set({ lastName: e.target.value })} />
      </div>
      <Input label="Email" type="email" value={form.email} error={errors.email} onChange={e => set({ email: e.target.value })}
        hint="If they already have an account the entry is linked to it; otherwise they're invited to create one." />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Handicap Index" inputMode="decimal" placeholder="e.g. 12.4" value={form.index} error={errors.index} onChange={e => set({ index: e.target.value, divisionId: '' })} />
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-gray-600 font-display">Tee ratings</span>
          <select className={SELECT} value={form.gender} onChange={e => set({ gender: e.target.value as 'men' | 'women', divisionId: '' })}>
            <option value="men">Men's</option><option value="women">Women's</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-gray-600 font-display">Division</span>
          <select className={SELECT} value={divisionId} onChange={e => set({ divisionId: e.target.value })}>
            <option value="">{suggested ? '' : 'Choose…'}</option>
            {divisions.map(d => <option key={d.id} value={d.id}>{d.name}{d.id === suggested?.id ? ' (matches)' : ''}</option>)}
          </select>
          {errors.divisionId && <span className="text-xs text-red-500 font-medium">{errors.divisionId}</span>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-gray-600 font-display">Tees</span>
          <select className={SELECT} value={form.teeSetId} onChange={e => set({ teeSetId: e.target.value })}>
            <option value="">{division ? `Division's (${course?.teeSets?.find(ts => ts.id === division.teeSetId)?.name ?? '—'})` : 'Division\'s tees'}</option>
            {course?.teeSets?.map(ts => <option key={ts.id} value={ts.id}>{ts.name}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-gray-600 font-display">Payment{fee > 0 && fees ? ` · ${formatMoney(fee, fees.currency)}` : ''}</span>
        <div className="flex flex-wrap gap-1.5">
          {payOptions.map(o => (
            <button key={o.value} type="button" aria-pressed={form.payment === o.value} onClick={() => set({ payment: o.value })}
              className={`h-9 px-3.5 rounded-full text-[13px] font-semibold font-display ${form.payment === o.value ? 'bg-ink text-white' : 'bg-canvas text-gray-600 hover:bg-gray-200'}`}>{o.label}</button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2.5 text-[14px] font-semibold text-ink font-display">
        <input type="checkbox" checked={form.notify} onChange={e => set({ notify: e.target.checked })} className="w-4 h-4 accent-[var(--color-ink)]" />
        Email the golfer a confirmation
      </label>
    </Modal>
  )
}

export function FieldBoard({ t, round }: { t: Tournament; round: number }) {
  useLiveVersion()
  const { showDialog, showToast, consoleActor } = useApp()
  const consoleActorOf = (): Actor => consoleActor ?? { name: 'Organiser', role: 'organiser' }
  const course = getCourse(t.courseId)
  const field = entriesFor(t.id).filter(e => e.status === 'registered')
  const groups = groupsFor(t.id, round)
  const [replacing, setReplacing] = useState<Entry | null>(null)
  const [adding, setAdding] = useState(false)
  const closed = t.status === 'completed' || t.status === 'cancelled'
  const players = Math.max(t.players, field.length)
  const full = players >= t.maxPlayers

  return (
    <Panel flush title={`Field · ${players} / ${t.maxPlayers}`}
      subtitle="Register golfers yourself, remove or replace players, move them between groups, or change their tees. A player keeps the same tees once they’ve teed off."
      aside={!closed && (
        <span className="flex items-center gap-2">
          {full && <span className="text-[12px] font-semibold text-rose-700">Field is full</span>}
          <Button size="sm" disabled={full} onClick={() => setAdding(true)}>Register a golfer</Button>
        </span>
      )}>
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[820px]">
          <thead>
            <tr className="text-[12px] font-bold font-display text-gray-400 border-y border-black/[0.05]">
              <th className="py-2.5 pl-6 pr-2">Player</th><th className="py-2.5 px-2">HI</th><th className="py-2.5 px-2">Division</th>
              <th className="py-2.5 px-2">Entry</th>
              <th className="py-2.5 px-2">Tees</th><th className="py-2.5 px-2">Group</th><th className="py-2.5 pl-2 pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {field.map(e => {
              const started = cardFor(t, e.id, round).some(s => s !== null)
              const group = groups.find(g => g.entryIds.includes(e.id))
              return (
                <tr key={e.id} className="border-b border-black/[0.05] text-[13px]">
                  <td className="py-2.5 pl-6 pr-2 font-semibold text-ink"><span className="inline-flex items-center gap-1">{e.name}{ticksFor(e).id && <VerifiedTick kind="id" />}</span>{e.isMe && <span className={`${CHIP} bg-lime-400/40 text-ink ml-1.5`}>Demo golfer</span>}</td>
                  <td className="py-2.5 px-2"><span className="inline-flex items-center gap-1">{e.handicapIndex.toFixed(1)}{ticksFor(e).handicap && <VerifiedTick kind="handicap" size={13} />}</span></td>
                  <td className="py-2.5 px-2 text-gray-600">{t.divisions?.find(d => d.id === e.divisionId)?.name ?? '—'}</td>
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    <span className="block text-[12px] font-semibold text-ink">{e.registeredBy === 'organiser' ? 'By organiser' : 'Online'}</span>
                    <span className="block text-[11px] text-gray-500">{PAYMENT_LABEL[e.paymentStatus ?? 'paid']}</span>
                  </td>
                  <td className="py-2.5 px-2">
                    <select aria-label={`Tees for ${e.name}`} className={SELECT} disabled={started || closed} title={started ? 'Fixed once the player has teed off' : undefined}
                      value={teeSetIdFor(t, e) ?? ''} onChange={x => { updateEntry(e.id, { teeSetId: x.target.value }); showToast(`${e.name} now plays the ${course?.teeSets?.find(ts => ts.id === x.target.value)?.name} tees`) }}>
                      {course?.teeSets?.map(ts => <option key={ts.id} value={ts.id}>{ts.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 px-2">
                    <select aria-label={`Group for ${e.name}`} className={SELECT} disabled={started || closed || !groups.length} value={group?.id ?? ''}
                      onChange={x => {
                        const from = groupsFor(t.id, round).find(g => g.entryIds.includes(e.id))
                        moveToGroup(t.id, round, e.id, x.target.value)
                        const to = groupsFor(t.id, round).find(g => g.id === x.target.value)
                        // Sprint 4 · section 7: the moved player gets the new time; nobody else's time changed
                        const ev = to && to.time !== from?.time ? notifyTeeTimeChange(t, round, [e.id], consoleActorOf(), `Your round ${round} tee time is now ${formatClock(to.time)} from hole ${to.startHole}.`) : undefined
                        showToast(ev ? `${e.name} moved — they’ve been sent the new tee time (email + app)` : `${e.name} moved`)
                      }}>
                      {!group && <option value="">No group</option>}
                      {groups.map(g => <option key={g.id} value={g.id}>{formatClock(g.time)} · tee {g.startHole} ({g.entryIds.length})</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 pl-2 pr-6 text-right whitespace-nowrap">
                    {!closed && <>
                      <button onClick={() => setReplacing(e)} disabled={started} className="h-8 px-3 rounded-full text-[12px] font-bold font-display text-ink bg-canvas hover:bg-gray-200 disabled:opacity-40">Replace</button>
                      <button disabled={started}
                        onClick={() => showDialog({
                          title: `Remove ${e.name}?`, message: 'They’re taken out of the field and their group. Refunds follow your refund policy.',
                          confirmLabel: 'Remove', destructive: true,
                          onConfirm: () => { updateEntry(e.id, { status: 'withdrawn' }); showToast(`${e.name} removed`, 'info') },
                        })}
                        className="h-8 px-3 ml-1.5 rounded-full text-[12px] font-bold font-display text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-40">Remove</button>
                    </>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {replacing && <ReplaceModal entry={replacing} onClose={() => setReplacing(null)} />}
      {adding && <RegisterGolferModal t={t} onClose={() => setAdding(false)} />}
    </Panel>
  )
}

/* ───────── Golfers interested in this tournament ───────── */

/** Golfers who tapped "I'm interested" on another of our tournaments (client, 21 Oct): follow them up */
export function InterestBoard({ t }: { t: Tournament }) {
  useOpsVersion()
  const list = interestsFor(t.id)
  return (
    <Panel flush title={`Interested golfers · ${list.length}`}
      subtitle="Golfers playing our other tournaments who asked to hear about this one. Get in touch to invite them — you can register them yourself.">
      {list.length === 0
        ? <p className="px-6 pb-6 text-[13px] text-gray-500">No one yet. Golfers see this tournament under “More tournaments on our platform”.</p>
        : (
          <ul className="divide-y divide-black/[0.05] border-t border-black/[0.05]">
            {list.map(i => (
              <li key={i.id} className="px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">
                <span className="font-semibold text-ink min-w-[160px]">{i.name}</span>
                <span className="text-gray-600">{i.email}</span>
                <span className="text-gray-600">{i.phone}</span>
                <span className="ml-auto text-[12px] text-gray-400">{new Date(i.at).toLocaleString('en-CA', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        )}
    </Panel>
  )
}

/* ───────── Marshal and official slots (organiser) ───────── */

function FillSlotModal({ t, index, onClose }: { t: Tournament; index: number; onClose: () => void }) {
  const { showToast } = useApp()
  const slot = t.officials![index]
  const [name, setName] = useState(slot.name)
  const [email, setEmail] = useState(slot.email ?? '')
  const [phone, setPhone] = useState(slot.phone)
  const [error, setError] = useState('')
  function save() {
    if (!name.trim()) return setError('Name is required')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter the email they’ll sign in with')
    const officials: Official[] = t.officials!.map((o, i) => (i === index ? { ...o, name: name.trim(), email: email.trim(), phone, invitedAt: new Date().toISOString() } : o))
    upsertTournament({ ...t, officials })
    const code = sendInvite(email.trim())
    notifyStaffAssigned(t, email.trim(), name.trim(), slot.role)
    showToast(code
      ? `Invite sent to ${email.trim()} by email and text — code ${code} (shown for the demo; works once, for ${LOGIN_RULES.inviteHours} hours)`
      : `${name.trim()} already has a login — this tournament now shows in their assignments`)
    onClose()
  }
  return (
    <Modal title={`${slot.name ? 'Change' : 'Fill'} the ${slot.role.toLowerCase()} slot`} subtitle="They get a one-time code to set their own password. The login opens this tournament only and stops working when it closes." onClose={onClose}
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth onClick={save}>Send invite</Button></>}>
      <Input label="Name" value={name} onChange={e => { setName(e.target.value); setError('') }} />
      <Input label="Email (their login)" type="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }} />
      <Input label="Phone" type="tel" value={phone} error={error} onChange={e => setPhone(e.target.value)} />
    </Modal>
  )
}

/** The organiser's page for one marshal or official on this tournament: their login and what they've done */
function StaffDetailModal({ t, index, actor, canEdit, onClose, onChange }: { t: Tournament; index: number; actor: Actor; canEdit: boolean; onClose: () => void; onChange: () => void }) {
  useOpsVersion()
  const { showToast } = useApp()
  const o = t.officials![index]
  const role = staffRoleOf(o)!
  const status = slotStatus(t, o)
  const login = loginFor(o.email)
  const removal = removalFor(t.id, o.email)
  const done = activityFor(t).filter(a => a.by.name === o.name)
  const [removing, setRemoving] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')
  const closed = t.status === 'completed' || t.status === 'cancelled'
  const facts: [string, ReactNode][] = [
    ['Role', STAFF_ROLE_LABEL[role]],
    ['Email (login)', o.email],
    ['Phone', o.phone || '—'],
    ['Last sign-in', when(login?.lastSignIn)],
    ...(status === 'invited' && login?.invite ? [['Invite code expires', when(login.invite.expiresAt)] as [string, ReactNode]] : []),
    ...(status === 'locked' ? [['Locked until', when(login?.lockedUntil)] as [string, ReactNode]] : []),
    ...(removal ? [['Taken off', `${when(removal.at)} by ${removal.by.name} — ${removal.reason}`] as [string, ReactNode]] : []),
  ]

  function remove() {
    if (!reason.trim()) return setError('Say why — it goes in the change log and they see it')
    removeFromTournament(t, o, actor, reason)
    showToast(`${o.name} taken off ${t.name} — signed out now`, 'info')
    setRemoving(false)
  }

  return (
    <Modal title={o.name} subtitle={`${STAFF_ROLE_LABEL[role]} · ${t.name}`} onClose={onClose}
      footer={removing
        ? <><Button variant="secondary" fullWidth onClick={() => setRemoving(false)}>Back</Button><Button variant="danger" fullWidth onClick={remove}>Take off this tournament</Button></>
        : <Button variant="secondary" fullWidth onClick={onClose}>Close</Button>}>
      <div className="flex items-center gap-2"><SlotChip status={status} invited /></div>
      {removing ? (
        <>
          <div className="rounded-2xl bg-rose-50 text-rose-800 text-[13px] px-4 py-3 leading-relaxed">
            Their login stops opening this tournament at once and they’re signed out with your reason. Their decisions, score changes and notes stay in the change log. You can put them back later.
          </div>
          <Input label="Reason *" placeholder="e.g. Called away — Marcus Lee covers the rest of the day" value={reason} error={error} onChange={e => { setReason(e.target.value); setError('') }} />
        </>
      ) : (
        <>
          <dl className="space-y-2">
            {facts.map(([k, v]) => <div key={k} className="flex justify-between gap-4 text-[13px]"><dt className="text-gray-500 flex-shrink-0">{k}</dt><dd className="font-semibold text-ink text-right">{v}</dd></div>)}
          </dl>
          <div className="rounded-2xl bg-canvas px-4 py-3">
            <p className="text-[12px] font-bold font-display text-gray-500">On this tournament</p>
            <p className="text-[13px] text-ink mt-0.5">{done.length ? `${done.length} recorded action${done.length > 1 ? 's' : ''} — ${done.filter(a => a.kind === 'decision').length} decisions, ${done.filter(a => a.kind === 'score').length} score changes` : 'Nothing recorded yet'}</p>
          </div>
          {canEdit && !closed && (
            <div className="flex flex-wrap gap-2">
              {status === 'invited' && <Button size="sm" onClick={() => { const code = sendInvite(o.email!); showToast(`New invite sent — code ${code} (the old code stops working)`); onChange() }}>Resend invite</Button>}
              {(status === 'active' || status === 'locked') && <Button size="sm" variant="secondary" onClick={() => { const code = resetByOrganiser(o.email!); showToast(`Reset code sent to ${o.name} — ${code} (shown for the demo; ${LOGIN_RULES.resetMinutes} minutes). Signed out everywhere.`, 'info') }}>{status === 'locked' ? 'Unlock & reset password' : 'Reset password'}</Button>}
              {status !== 'removed'
                ? <Button size="sm" variant="danger" onClick={() => setRemoving(true)}>Take off this tournament</Button>
                : <Button size="sm" variant="secondary" onClick={() => { restoreToTournament(t, o, actor); showToast(`${o.name} is back on ${t.name}`) }}>Put back</Button>}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

export function StaffSlotsBoard({ t, canEdit, actor }: { t: Tournament; canEdit: boolean; actor?: Actor }) {
  useOpsVersion()
  const { showToast } = useApp()
  const [filling, setFilling] = useState<number | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const slots = (t.officials ?? []).map((o, index) => ({ o, index, role: staffRoleOf(o) })).filter(s => s.role)
  const closed = t.status === 'completed' || t.status === 'cancelled'

  function addSlot(role: 'Marshal' | 'Tournament official') {
    upsertTournament({ ...t, officials: [...(t.officials ?? []), { name: '', role, phone: '' }] })
    showToast(`${role} slot added`)
  }

  return (
    <Panel title="Marshals & officials" subtitle="Logins for this tournament only. Access ends automatically when the tournament closes."
      aside={canEdit && !closed && <>
        <Button size="sm" variant="secondary" onClick={() => addSlot('Marshal')}>+ Marshal slot</Button>
        <Button size="sm" variant="secondary" onClick={() => addSlot('Tournament official')}>+ Official slot</Button>
      </>}>
      {slots.length === 0 ? <p className="text-[14px] text-gray-500 py-6 text-center">No marshal or official slots.</p> : (
        <ul className="divide-y divide-black/[0.05]">
          {slots.map(({ o, index, role }) => {
            const status = slotStatus(t, o)
            return (
              <li key={index} className="flex flex-wrap items-center gap-3 py-3">
                <span className="w-11 h-11 rounded-full bg-canvas flex items-center justify-center font-display font-extrabold text-ink text-[13px]">
                  {o.name ? o.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('') : '?'}
                </span>
                <span className="flex-1 min-w-[160px]">
                  <span className="block text-[14px] font-semibold text-ink">{o.name || 'Open slot'}</span>
                  <span className="block text-[12px] text-gray-500">{STAFF_ROLE_LABEL[role!]}{o.email ? ` · ${o.email}` : ''}{o.phone ? ` · ${o.phone}` : ''}</span>
                </span>
                <SlotChip status={status} invited={!!o.invitedAt} />
                {o.name && o.email && <Button size="sm" variant="ghost" onClick={() => setViewing(index)}>Details</Button>}
                {canEdit && !closed && status !== 'removed' && <Button size="sm" variant="secondary" onClick={() => setFilling(index)}>{o.name ? 'Change' : 'Fill slot'}</Button>}
              </li>
            )
          })}
        </ul>
      )}
      {viewing !== null && <StaffDetailModal t={t} index={viewing} actor={actor ?? { name: 'Organiser', role: 'organiser' }} canEdit={canEdit} onClose={() => setViewing(null)} onChange={() => undefined} />}
      <p className="mt-4 text-[12px] text-gray-500 leading-relaxed">
        <span className="font-bold text-ink">Marshal:</span> pace of play, tee sheet, logging incidents; can’t see or change scores.{' '}
        <span className="font-bold text-ink">Tournament official:</span> checks scorecards, settles disputes and corrects scores with a reason.
      </p>
      {filling !== null && <FillSlotModal t={t} index={filling} onClose={() => setFilling(null)} />}
    </Panel>
  )
}
