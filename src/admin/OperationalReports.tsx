import { useState, type ReactNode } from 'react'
import type { Tournament } from '../types'
import { Button } from '../components'
import { useApp } from '../app-context'
import { useLiveVersion } from '../live'
import {
  INCIDENT_KINDS, INCIDENT_STATE_LABEL, downloadFile, fileName, incidentRows, incidentsCsv, participationCsv, participationSummary, registrationCsv, registrationRows,
  roundNumbers, useOpsVersion, type IncidentFilter, type IncidentKind, type IncidentStatus, type RegistrationFilter,
} from '../ops'
import { Panel } from '../ops-ui'

/*
 * Sprint 4 · RP1–RP10: operational CSVs while a tournament is running. Owner / platform admin only (the API
 * enforces it; golfers, marshals and officials never see this panel). Every file starts with the tournament,
 * the time it was made and the filters used; text cells are protected against spreadsheet formulas.
 * API: GET /tournaments/{id}/reports/{registrations|incidents|participation}.csv?…filters
 */

const sel = 'h-9 rounded-full bg-canvas px-3 text-[13px] font-semibold text-ink'

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>{children}</label>
}

function ReportCard({ title, detail, count, unit, filters, onDownload }: { title: string; detail: string; count: number; unit: string; filters: ReactNode; onDownload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function go() {
    setBusy(true); setError('')
    try { await onDownload() } catch (e) { setError(e instanceof Error ? e.message : 'The report couldn’t be made. Try again.') }
    setBusy(false)
  }
  return (
    <li className="px-6 py-5">
      <div className="flex flex-wrap items-start gap-4">
        <span className="w-10 h-10 rounded-2xl bg-lime-400/40 flex items-center justify-center flex-shrink-0 text-[11px] font-extrabold font-display text-pine-800">CSV</span>
        <div className="flex-1 min-w-[220px]">
          <p className="font-display font-bold text-ink text-[15px]">{title}</p>
          <p className="text-[13px] text-gray-600 leading-relaxed">{detail}</p>
        </div>
        <div className="text-right">
          <p className="font-display font-extrabold text-ink text-[22px] leading-none">{count}</p>
          <p className="text-[11px] text-gray-500">{unit}</p>
        </div>
        <Button size="sm" onClick={go} disabled={busy}>{busy ? 'Preparing…' : 'Download'}</Button>
      </div>
      <div className="flex flex-wrap gap-3 mt-3 pl-14">{filters}</div>
      {count === 0 && <p className="pl-14 mt-2 text-[12px] text-amber-700">Nothing matches these filters — the file will have the headings only.</p>}
      {error && <p className="pl-14 mt-2 text-[12px] text-rose-600 font-semibold">{error}</p>}
    </li>
  )
}

export function OperationalReports({ t }: { t: Tournament }) {
  useLiveVersion()
  useOpsVersion()
  const { showToast } = useApp()
  const rounds = roundNumbers(t)
  const [reg, setReg] = useState<RegistrationFilter>({})
  const [inc, setInc] = useState<IncidentFilter>({})
  const [partRound, setPartRound] = useState<number | undefined>(undefined)
  const regRows = registrationRows(t, reg)
  const incRows = incidentRows(t, inc)
  const part = participationSummary(t, partRound ?? rounds[0])

  // In production large exports run async; here the file is made in the browser after a short "preparing" step
  const make = (name: string, text: () => string) => new Promise<void>(resolve => setTimeout(() => {
    downloadFile(name, text())
    showToast(`Downloaded ${name}`)
    resolve()
  }, 500))

  const roundSelect = (value: number | undefined, onChange: (n: number | undefined) => void, any = 'All rounds') => (
    <select className={sel} value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)}>
      <option value="">{any}</option>
      {rounds.map(n => <option key={n} value={n}>Round {n}</option>)}
    </select>
  )

  return (
    <Panel flush title="Operational reports" subtitle="For the organiser and platform admins while the tournament runs. Each file lists the tournament, time and filters at the top.">
      <ul className="divide-y divide-black/[0.05] border-t border-black/[0.05]">
        <ReportCard title="Registrations" unit={regRows.length === 1 ? 'entry' : 'entries'} count={regRows.length}
          detail="Every entry with golfer, division, status, when they registered and who entered them. Add a round to include that round’s status. No payment details."
          onDownload={() => make(fileName(t, 'registrations'), () => registrationCsv(t, reg))}
          filters={<>
            <Filter label="Status">
              <select className={sel} value={reg.status ?? ''} onChange={e => setReg({ ...reg, status: (e.target.value || undefined) as RegistrationFilter['status'] })}>
                <option value="">Any</option><option value="registered">Registered</option><option value="withdrawn">Withdrawn</option>
              </select>
            </Filter>
            {(t.divisions?.length ?? 0) > 1 && (
              <Filter label="Division">
                <select className={sel} value={reg.divisionId ?? ''} onChange={e => setReg({ ...reg, divisionId: e.target.value || undefined })}>
                  <option value="">All</option>{t.divisions!.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Filter>
            )}
            <Filter label="Round status">{roundSelect(reg.round, n => setReg({ ...reg, round: n }), 'Don’t include')}</Filter>
          </>} />

        <ReportCard title="Incidents" unit={incRows.length === 1 ? 'incident' : 'incidents'} count={incRows.length}
          detail="Kind, players, who raised it and when, every follow-up note, whether it went to the committee, and the decision."
          onDownload={() => make(fileName(t, 'incidents'), () => incidentsCsv(t, inc))}
          filters={<>
            <Filter label="Round">{roundSelect(inc.round, n => setInc({ ...inc, round: n }))}</Filter>
            <Filter label="Kind">
              <select className={sel} value={inc.kind ?? ''} onChange={e => setInc({ ...inc, kind: (e.target.value || undefined) as IncidentKind | undefined })}>
                <option value="">All</option>{INCIDENT_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </Filter>
            <Filter label="State">
              <select className={sel} value={inc.state ?? ''} onChange={e => setInc({ ...inc, state: (e.target.value || undefined) as IncidentStatus | undefined })}>
                <option value="">All</option>{(Object.keys(INCIDENT_STATE_LABEL) as IncidentStatus[]).map(k => <option key={k} value={k}>{INCIDENT_STATE_LABEL[k]}</option>)}
              </select>
            </Filter>
            <Filter label="From"><input type="date" className={sel} value={inc.from ?? ''} onChange={e => setInc({ ...inc, from: e.target.value || undefined })} /></Filter>
            <Filter label="To"><input type="date" className={sel} value={inc.to ?? ''} onChange={e => setInc({ ...inc, to: e.target.value || undefined })} /></Filter>
          </>} />

        <ReportCard title="Participation" unit={`${part.unit} registered`} count={part.units}
          detail={`Per round: registered, withdrawn before play, playing, WD / DQ / NS / DNF, cards submitted and verified, then each player’s status. Round ${part.round}: ${part.playing} playing · ${part.wd} WD · ${part.dq} DQ · ${part.ns} NS · ${part.dnf} DNF · ${part.cardsVerified}/${part.playing} cards verified.`}
          onDownload={() => make(fileName(t, 'participation'), () => participationCsv(t, partRound))}
          filters={<Filter label="Round">{roundSelect(partRound, setPartRound)}</Filter>} />
      </ul>
      <p className="px-6 py-4 text-[12px] text-gray-500 leading-relaxed">
        Files are UTF-8 and open in Excel or Google Sheets. Text that starts with = + − or @ is saved with a leading ' so a spreadsheet never runs it as a formula.
        Payment, refund and revenue reports aren’t part of this sprint.
      </p>
    </Panel>
  )
}
