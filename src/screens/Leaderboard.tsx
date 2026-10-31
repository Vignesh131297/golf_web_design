import { useEffect, useState } from 'react'
import type { Tournament } from '../types'
import { EmptyState, StatusBadge, Button } from '../components'
import { getTournament, getCourse } from '../data'
import { isPublicTournament } from '../admin/access'
import { navigate } from '../router'
import { PageHeader } from '../shell'
import { useDataVersion } from '../store'
import { cardFor, myEntry, roundHoles, simulateTick, teamSizeOf, useLiveVersion } from '../live'
import { toPar } from '../golf'
import {
  RANK_LABEL, basesFor, currentRound, overallStandings, prizeLabel, prizesFor, ranking, roundNumbers, useOpsVersion, winnersFor, type RankBasis, type Standing,
} from '../ops'
import { ScoreSheetModal, formatText } from '../ops-ui'
import { BackLink } from './TournamentDetails'

/** Score cell colour like a TV graphic: birdie or better circled lime, bogey or worse boxed. */
export function ScoreCell({ strokes, par }: { strokes: number | null; par: number }) {
  if (strokes === null) return <span className="text-gray-300">·</span>
  const d = strokes - par
  const shape = d <= -2 ? 'rounded-full bg-amber-300 ring-2 ring-amber-400' : d === -1 ? 'rounded-full bg-lime-400' : d === 1 ? 'rounded-md ring-1 ring-black/25' : d >= 2 ? 'rounded-md bg-ink text-white' : ''
  return <span className={`inline-flex w-7 h-7 items-center justify-center text-[13px] font-bold ${shape}`}>{strokes}</span>
}

const toParClass = (n: number) => (n < 0 ? 'text-rose-600' : n > 0 ? 'text-ink' : 'text-gray-600')
const chip = (on: boolean, lime = false) =>
  `h-9 px-4 rounded-full text-[13px] font-semibold font-display ${on ? (lime ? 'bg-lime-400 text-ink' : 'bg-ink text-white') : 'bg-white text-gray-600 shadow-card'}`

export default function Leaderboard({ id }: { id: string }) {
  useDataVersion()
  useLiveVersion()
  useOpsVersion()
  const found = getTournament(id)
  const t = found && isPublicTournament(found) ? found : undefined
  const [view, setView] = useState<number | 'overall'>(() => (t ? currentRound(t) : 1))
  const [basisPick, setBasis] = useState<RankBasis | null>(null)
  const [division, setDivision] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const [updated, setUpdated] = useState(() => new Date())
  const round = view === 'overall' ? 1 : view

  // Live: poll for new scores (a real app gets them pushed over WebSocket/SSE)
  useEffect(() => {
    if (t?.status !== 'in-progress') return
    const timer = setInterval(() => { simulateTick(t, currentRound(t)); setUpdated(new Date()) }, 8000)
    return () => clearInterval(timer)
  }, [t])

  if (!t) {
    return (
      <div className="bg-white rounded-[32px] shadow-card">
        <EmptyState title="Tournament not found" subtitle="This leaderboard isn't available." action={{ label: 'Back to tournaments', onClick: () => navigate('/tournaments') }} />
      </div>
    )
  }

  const bases = basesFor(t)
  const basis = basisPick ?? bases[0]
  const rounds = roundNumbers(t)
  const course = getCourse(t.courseId)
  const holes = course ? roundHoles(t, course, round) : []
  const list = view === 'overall' ? [] : ranking(t, view, { basis, divisionId: division || undefined })
  const overall = view === 'overall' ? overallStandings(t, rounds[rounds.length - 1], { basis, divisionId: division || undefined }) : []
  const me = myEntry(t.id)
  const live = t.status === 'in-progress'
  const published = t.status === 'completed' && !!t.resultsPublished
  const started = view === 'overall' ? overall.some(r => r.byRound.some(v => v !== null)) : list.some(s => s.row.thru > 0)
  const team = teamSizeOf(t) > 1
  const myPlayed = !!me && rounds.some(n => cardFor(t, me.id, n).some(s => s !== null))

  return (
    <div className="page-in">
      <BackLink label={t.name} onClick={() => navigate(`/tournaments/${t.id}`)} />
      <PageHeader
        eyebrow={`${t.venue} · ${t.dateRange}`}
        title={live ? 'Live leaderboard' : t.status === 'completed' ? 'Results' : 'Leaderboard'}
        actions={
          <>
            {live && <StatusBadge status="in-progress" size="md" />}
            {myPlayed && <Button variant="secondary" onClick={() => setSheet(true)}>My score sheet</Button>}
            {live && me?.status === 'registered' && <Button onClick={() => navigate(`/tournaments/${t.id}/play`)}>Enter my scores</Button>}
          </>
        }
      />

      {published && <Winners t={t} />}
      {t.status === 'completed' && !published && (
        <p className="mb-5 rounded-2xl bg-amber-50 text-amber-800 text-[14px] px-5 py-3">Provisional — the committee is checking the cards. Final results and winners appear once the organiser publishes them.</p>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {rounds.map(n => <button key={n} onClick={() => setView(n)} aria-pressed={view === n} className={chip(view === n)}>Round {n}</button>)}
        {rounds.length > 1 && <button onClick={() => setView('overall')} aria-pressed={view === 'overall'} className={chip(view === 'overall')}>Overall</button>}
        {bases.length > 1 && (
          <>
            <span className="w-px h-6 bg-black/10 mx-1" />
            {bases.map(b => <button key={b} onClick={() => setBasis(b)} aria-pressed={basis === b} className={chip(basis === b)}>{RANK_LABEL[b]}</button>)}
          </>
        )}
        {(t.divisions?.length ?? 0) > 1 && (
          <>
            <span className="w-px h-6 bg-black/10 mx-1" />
            {[{ id: '', name: 'All divisions' }, ...(t.divisions ?? [])].map(d => (
              <button key={d.id} onClick={() => setDivision(d.id)} aria-pressed={division === d.id} className={chip(division === d.id, true)}>{d.name}</button>
            ))}
          </>
        )}
      </div>

      {!started ? (
        <div className="bg-white rounded-[28px] shadow-card">
          <EmptyState title="No scores yet" subtitle={`Round ${round} hasn't started. Scores appear here hole by hole once play begins.`} />
        </div>
      ) : view === 'overall' ? (
        <div className="bg-white rounded-[28px] shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[12px] font-bold font-display text-gray-400 border-b border-black/[0.05]">
                  <th className="py-3.5 pl-6 pr-2 w-16">Pos</th><th className="py-3.5 px-2">{team ? 'Team' : 'Player'}</th>
                  {rounds.map(n => <th key={n} className="py-3.5 px-2 text-right">R{n}</th>)}
                  <th className="py-3.5 px-2 text-right">Total</th><th className="py-3.5 pl-2 pr-6 text-right">{basis === 'points' ? '' : 'To par'}</th>
                </tr>
              </thead>
              <tbody>
                {overall.map(r => (
                  <tr key={r.id} className={`border-b border-black/[0.05] ${r.isMe ? 'bg-lime-300/40' : ''} ${r.out ? 'text-gray-400' : ''}`}>
                    <td className="py-3.5 pl-6 pr-2 font-display font-extrabold text-ink text-[15px]">{r.position}</td>
                    <td className="py-3.5 px-2">
                      <span className="block font-display font-bold text-ink text-[14px]">{r.name}{r.isMe && <You />}</span>
                      {r.tieNote && <span className="block text-[12px] text-pine-700">{r.tieNote}</span>}
                    </td>
                    {r.byRound.map((v, k) => <td key={k} className="py-3.5 px-2 text-right text-[13px] text-gray-600">{v ?? '–'}</td>)}
                    <td className="py-3.5 px-2 text-right font-display font-extrabold text-[16px] text-ink">{r.byRound.some(v => v !== null) ? r.total : '–'}</td>
                    <td className={`py-3.5 pl-2 pr-6 text-right font-display font-bold ${toParClass(r.toPar)}`}>{basis !== 'points' && r.byRound.some(v => v !== null) ? toPar(r.toPar) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[28px] shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[12px] font-bold font-display text-gray-400 border-b border-black/[0.05]">
                  <th className="py-3.5 pl-6 pr-2 w-16">Pos</th>
                  <th className="py-3.5 px-2">{team ? 'Team' : 'Player'}</th>
                  <th className="py-3.5 px-2 text-right">{basis === 'points' ? 'Points' : RANK_LABEL[basis]}</th>
                  <th className="py-3.5 px-2 text-right">{basis === 'gross' ? 'Net' : 'Gross'}</th>
                  <th className="py-3.5 px-2 text-right">Thru</th>
                  <th className="py-3.5 pl-2 pr-6 text-right hidden sm:table-cell">Strokes</th>
                </tr>
              </thead>
              <tbody>
                {list.map(s => (
                  <LeaderRow key={s.row.id} t={t} s={s} round={round} basis={basis} holes={holes} open={open === s.row.id} onToggle={() => setOpen(open === s.row.id ? null : s.row.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[12px] text-gray-400 mt-3">
        {live ? `Updated ${updated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })} · refreshes automatically` : published ? 'Final results' : 'Provisional'}
        {' · '}{formatText(t)} · ties by countback (back 9, last 6, last 3, last hole). Tap a {team ? 'team' : 'player'} for the card.
      </p>
      {sheet && me && <ScoreSheetModal t={t} entryId={me.id} onClose={() => setSheet(false)} />}
    </div>
  )
}

const You = () => <span className="ml-2 text-[11px] bg-ink text-lime-400 rounded-full px-2 py-0.5 align-middle">You</span>

/** Published winners at the top of the results; the golfer's own prize stands out */
function Winners({ t }: { t: Tournament }) {
  const prizes = prizesFor(t)
  const winners = winnersFor(t).filter(w => w.name)
  if (!winners.length) return null
  const me = myEntry(t.id)
  return (
    <section className="mb-6 bg-ink text-white rounded-[28px] p-6">
      <p className="text-[12px] font-bold font-display text-lime-400 uppercase tracking-wider">Winners</p>
      <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
        {winners.map(w => {
          const mine = !!me && (w.rowId === me.id || (!!me.teamId && w.rowId === me.teamId))
          return (
            <li key={w.prizeId} className={`rounded-2xl px-4 py-3 ${mine ? 'bg-lime-400 text-ink' : 'bg-white/10'}`}>
              <p className={`text-[12px] font-semibold ${mine ? 'text-ink/70' : 'text-white/60'}`}>{prizeLabel(t, prizes.find(p => p.id === w.prizeId))}</p>
              <p className="font-display font-extrabold text-[17px] leading-snug">{w.name}{mine && ' — you!'}</p>
              {w.detail && <p className={`text-[12px] ${mine ? 'text-ink/70' : 'text-white/60'}`}>{w.detail}</p>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function LeaderRow({ t, s, round, basis, holes, open, onToggle }: {
  t: Tournament; s: Standing; round: number; basis: RankBasis; holes: { hole: number; par: number }[]; open: boolean; onToggle: () => void
}) {
  const { row, position, tieNote } = s
  const finished = row.thru === row.holes
  const team = row.members.length > 1
  const main = basis === 'points' ? row.points : basis === 'net' ? row.netToPar : row.grossToPar
  const other = basis === 'gross' ? row.netToPar : row.grossToPar
  const division = t.divisions?.find(d => d.id === row.divisionId)?.name
  return (
    <>
      <tr onClick={onToggle} className={`border-b border-black/[0.05] cursor-pointer transition-colors ${row.isMe ? 'bg-lime-300/40 hover:bg-lime-300/60' : 'hover:bg-canvas/70'}`}>
        <td className="py-3.5 pl-6 pr-2 font-display font-extrabold text-ink text-[15px]">{position}</td>
        <td className="py-3.5 px-2">
          <span className="block font-display font-bold text-ink text-[14px]">{row.name}{row.isMe && <You />}</span>
          <span className="block text-[12px] text-gray-500">
            {team ? `${row.members.map(m => m.name).join(' · ')} · ${t.format === 'Scramble' ? `team handicap ${row.playing}` : `HCP ${row.handicaps.join(' / ')}`}`
              : `${division ? `${division} · ` : ''}HCP ${row.entry.handicapIndex.toFixed(1)} (plays ${row.playing})`}
          </span>
          {tieNote && finished && <span className="block text-[12px] text-pine-700">{tieNote}</span>}
        </td>
        <td className={`py-3.5 px-2 text-right font-display font-extrabold text-[16px] ${basis === 'points' ? 'text-ink' : toParClass(main)}`}>{row.status !== 'playing' ? '–' : basis === 'points' ? main : toPar(main)}</td>
        <td className={`py-3.5 px-2 text-right font-display font-bold text-[15px] ${toParClass(other)}`}>{row.status !== 'playing' ? '–' : toPar(other)}</td>
        <td className="py-3.5 px-2 text-right text-[13px] font-semibold text-gray-600">{finished ? 'F' : row.thru}</td>
        <td className="py-3.5 pl-2 pr-6 text-right text-[13px] text-gray-500 hidden sm:table-cell">{row.gross}</td>
      </tr>
      {open && (
        <tr className="bg-canvas/60 border-b border-black/[0.05]">
          <td colSpan={6} className="px-6 py-4">
            <div className="overflow-x-auto">
              <table className="text-center">
                <tbody>
                  <tr>
                    <td className="pr-3 text-left text-[10px] font-bold text-gray-400">Hole</td>
                    {holes.map(h => <td key={h.hole} className="w-8 text-[10px] font-bold text-gray-400">{h.hole}<span className="block font-normal">P{h.par}</span></td>)}
                  </tr>
                  {row.members.map(m => {
                    const card = cardFor(t, m.id, round)
                    return (
                      <tr key={m.id}>
                        <td className="pr-3 text-left text-[12px] font-semibold text-ink whitespace-nowrap">{team ? m.name.split(' ')[0] : 'Score'}</td>
                        {holes.map((h, i) => <td key={h.hole} className="py-0.5"><ScoreCell strokes={card[i]} par={h.par} /></td>)}
                      </tr>
                    )
                  })}
                  {team && (
                    <tr>
                      <td className="pr-3 text-left text-[12px] font-bold text-pine-700 whitespace-nowrap">{t.format === 'Four-Ball' ? `Better ball${basis === 'net' ? ' (net)' : ''}` : `Team${basis === 'net' ? ' (net)' : ''}`}</td>
                      {holes.map((h, i) => <td key={h.hole} className="py-0.5"><ScoreCell strokes={(basis === 'net' ? row.perHole.net : row.perHole.gross)[i]} par={h.par} /></td>)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-gray-500 mt-2">
              {row.status !== 'playing' ? 'Out of the results' : row.state === 'verified' ? 'Card verified' : row.state === 'submitted' ? 'Card handed in — awaiting verification' : 'Card in progress'}
            </p>
          </td>
        </tr>
      )}
    </>
  )
}
