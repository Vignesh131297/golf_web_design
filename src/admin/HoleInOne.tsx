import { useState } from 'react'
import { PageHeader } from '../shell'
import { Button, Input, SelectField, EmptyState } from '../components'
import { useApp } from '../app-context'
import { MOCK_COURSES } from '../data'
import { useDataVersion } from '../store'
import { formatDay, uid } from '../golf'
import { cardFor, entriesFor, useLiveVersion } from '../live'
import { roundNumbers } from '../ops'
import { Modal, Panel } from '../ops-ui'
import { Textarea } from './forms'
import { NoAccess } from './AdminShell'
import { scopedTournaments } from './access'

/*
 * PROPOSAL for AJ (Sprint 4 demo, 24 Nov 2026): "a separate placeholder where we can capture specific
 * hole-in-one incidents from any tournament … populate that as a separate database".
 *
 * Prototype only. Records are kept in this browser (localStorage), and holes scored in 1 on any
 * scorecard are listed as "Found on a scorecard" for the organiser to confirm. The real build needs
 * an approved data model and API — nothing here changes scoring or the backend.
 */

interface HoleInOneRecord {
  id: string
  golfer: string
  tournamentId: string
  tournamentName: string
  courseName: string
  hole: number
  par: number
  yards?: number
  round: number
  date: string
  details: string
  source: 'recorded' | 'scorecard'
}

const KEY = 'gtp-hole-in-one-proposal-v1'

// Two earlier incidents so the register isn't empty in the demo (fictional golfers)
const SEED: HoleInOneRecord[] = [
  { id: 'hio-1', golfer: 'Priya Natarajan', tournamentId: 't8', tournamentName: 'Augusta Pines Club Championship', courseName: 'Augusta Pines Golf Club',
    hole: 12, par: 3, yards: 210, round: 1, date: '2026-10-04', details: '5-iron. Witnessed by playing partners Ella Ahmed and Henry Kim; marker signed the card.', source: 'recorded' },
  { id: 'hio-2', golfer: 'Marcus Lee', tournamentId: 't8', tournamentName: 'Augusta Pines Club Championship', courseName: 'Augusta Pines Golf Club',
    hole: 16, par: 3, yards: 230, round: 2, date: '2026-10-05', details: 'Hybrid. Confirmed by the tournament official on the course.', source: 'recorded' },
]

function load(): HoleInOneRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : SEED
  } catch {
    return SEED
  }
}
function save(list: HoleInOneRecord[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* private mode */ }
}

export function AdminHoleInOne() {
  useDataVersion()
  useLiveVersion()
  const { can, adminUser, showToast } = useApp()
  const [records, setRecords] = useState<HoleInOneRecord[]>(load)
  const [adding, setAdding] = useState<Partial<HoleInOneRecord> | null>(null)
  if (!can('tournaments.view')) return <NoAccess what="view hole-in-one records" />

  const tournaments = scopedTournaments(adminUser)
  const ids = new Set(tournaments.map(t => t.id))
  const mine = records.filter(r => ids.has(r.tournamentId))

  // Holes scored in one on any scorecard, not yet recorded
  const found: HoleInOneRecord[] = []
  for (const t of tournaments) {
    const course = MOCK_COURSES.find(c => c.id === t.courseId)
    if (!course) continue
    for (const e of entriesFor(t.id)) {
      for (const round of roundNumbers(t)) {
        cardFor(t, e.id, round).forEach((s, i) => {
          if (s !== 1) return
          const h = course.holeData[i]
          if (!h || mine.some(r => r.tournamentId === t.id && r.golfer === e.name && r.hole === h.hole && r.round === round)) return
          found.push({ id: `found-${t.id}-${e.id}-${round}-${h.hole}`, golfer: e.name, tournamentId: t.id, tournamentName: t.name, courseName: course.name,
            hole: h.hole, par: h.par, yards: h.yards, round, date: t.rounds?.find(r => r.number === round)?.date ?? t.startDate, details: '', source: 'scorecard' })
        })
      }
    }
  }

  function add(r: HoleInOneRecord) {
    const next = [r, ...records]
    setRecords(next); save(next); setAdding(null)
    showToast(`Hole-in-one recorded: ${r.golfer}, hole ${r.hole}`)
  }

  const list = [...mine].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div className="page-in">
      <PageHeader eyebrow="Tournaments" title="Hole-in-One register" />
      <div className="-mt-3 mb-6 flex flex-wrap items-start gap-3">
        <p className="text-gray-500 max-w-2xl">
          Every hole-in-one from every tournament, kept in one place. Holes scored in 1 on a scorecard appear below for you to confirm; you can also record one by hand.
        </p>
        <span className="h-7 px-3 rounded-full bg-amber-100 text-amber-800 text-[12px] font-bold font-display inline-flex items-center">Proposal for AJ · demo data</span>
      </div>

      {found.length > 0 && (
        <Panel title={`Found on scorecards · ${found.length}`} subtitle="A hole scored in 1. Confirm it to add it to the register.">
          <ul className="divide-y divide-gray-100">
            {found.map(f => (
              <li key={f.id} className="py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink">{f.golfer} · hole {f.hole} (par {f.par})</p>
                  <p className="text-[12px] text-gray-500">{f.tournamentName} · round {f.round} · {formatDay(f.date)}</p>
                </div>
                <Button size="sm" onClick={() => setAdding({ ...f, id: undefined, source: 'scorecard' })}>Confirm</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mt-6">
        <Panel flush title={`Register · ${list.length}`} aside={<Button size="sm" onClick={() => setAdding({ source: 'recorded' })}>Record a hole-in-one</Button>}>
          {list.length === 0 ? (
            <div className="p-6"><EmptyState title="No holes-in-one yet" subtitle="They appear here when a golfer scores 1 on a hole, or when you record one." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="py-2.5 pl-6 pr-2">Golfer</th>
                    <th className="py-2.5 px-2">Tournament</th>
                    <th className="py-2.5 px-2">Golf course</th>
                    <th className="py-2.5 px-2">Hole</th>
                    <th className="py-2.5 px-2">Round</th>
                    <th className="py-2.5 px-2">Date</th>
                    <th className="py-2.5 pl-2 pr-6">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0 align-top">
                      <td className="py-3 pl-6 pr-2 font-semibold text-ink whitespace-nowrap">{r.golfer}</td>
                      <td className="py-3 px-2">{r.tournamentName}</td>
                      <td className="py-3 px-2 text-gray-600">{r.courseName}</td>
                      <td className="py-3 px-2 whitespace-nowrap">{r.hole} <span className="text-gray-400">· par {r.par}{r.yards ? ` · ${r.yards} yds` : ''}</span></td>
                      <td className="py-3 px-2">{r.round}</td>
                      <td className="py-3 px-2 whitespace-nowrap">{formatDay(r.date)}</td>
                      <td className="py-3 pl-2 pr-6 text-gray-600 max-w-sm">{r.details || '—'}{r.source === 'scorecard' && <span className="ml-1 text-[11px] font-semibold text-pine-700">· from scorecard</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {adding && <RecordModal initial={adding} tournaments={tournaments} onClose={() => setAdding(null)} onSave={add} />}
    </div>
  )
}

function RecordModal({ initial, tournaments, onClose, onSave }: {
  initial: Partial<HoleInOneRecord>
  tournaments: ReturnType<typeof scopedTournaments>
  onClose: () => void
  onSave: (r: HoleInOneRecord) => void
}) {
  const [f, setF] = useState<Partial<HoleInOneRecord>>({ round: 1, ...initial })
  const [tried, setTried] = useState(false)
  const t = tournaments.find(x => x.id === f.tournamentId)
  const course = t && MOCK_COURSES.find(c => c.id === t.courseId)
  const golfers = t ? entriesFor(t.id).filter(e => e.status === 'registered') : []
  const missing = !f.golfer || !t || !f.hole || !f.date
  function submit() {
    setTried(true)
    if (missing || !course) return
    const h = course.holeData.find(x => x.hole === f.hole)!
    onSave({ id: uid('hio-'), golfer: f.golfer!, tournamentId: t!.id, tournamentName: t!.name, courseName: course.name, hole: h.hole, par: h.par, yards: h.yards,
      round: f.round ?? 1, date: f.date!, details: f.details ?? '', source: f.source ?? 'recorded' })
  }
  return (
    <Modal title="Record a hole-in-one" subtitle="Saved to the separate Hole-in-One register" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Save</Button></>}>
      <div className="flex flex-col gap-4">
        <SelectField label="Tournament *" value={f.tournamentId ?? ''} placeholder="Choose a tournament"
          options={tournaments.map(x => ({ value: x.id, label: x.name }))}
          onChange={v => { const tt = tournaments.find(x => x.id === v); setF({ ...f, tournamentId: v, golfer: undefined, hole: undefined, date: tt?.startDate }) }}
          error={tried && !t ? 'Choose the tournament' : undefined} />
        <Input label="Golf course" value={course?.name ?? ''} readOnly hint="From the tournament" />
        <SelectField label="Golfer *" value={f.golfer ?? ''} placeholder={t ? 'Choose a golfer' : 'Choose a tournament first'}
          options={golfers.map(e => ({ value: e.name, label: e.name }))} onChange={v => setF({ ...f, golfer: v })}
          error={tried && !f.golfer ? 'Choose the golfer' : undefined} />
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Hole *" value={f.hole ? String(f.hole) : ''} placeholder="Hole"
            options={(course?.holeData ?? []).map(h => ({ value: String(h.hole), label: `Hole ${h.hole} · par ${h.par}` }))}
            onChange={v => setF({ ...f, hole: Number(v) })} error={tried && !f.hole ? 'Choose the hole' : undefined} />
          <SelectField label="Round" value={String(f.round ?? 1)} options={(t ? roundNumbers(t) : [1]).map(n => ({ value: String(n), label: `Round ${n}` }))}
            onChange={v => setF({ ...f, round: Number(v) })} />
        </div>
        <Input label="Date of incident *" type="date" value={f.date ?? ''} onChange={x => setF({ ...f, date: x.target.value })} error={tried && !f.date ? 'Enter the date' : undefined} />
        <Textarea label="Incident details" value={f.details ?? ''} onChange={x => setF({ ...f, details: x.target.value })}
          placeholder="Club used, witnesses, who confirmed it" rows={3} />
      </div>
    </Modal>
  )
}
