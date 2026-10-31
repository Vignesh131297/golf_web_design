import { useState } from 'react'
import type { Point } from '../types'
import { Button, EmptyState, StatusBadge } from '../components'
import { getTournament, getCourse } from '../data'
import { useApp } from '../app-context'
import { navigate } from '../router'
import { PageHeader } from '../shell'
import { useDataVersion } from '../store'
import {
  addShot, cardFor, cardState, entriesFor, groupOf, leaderboard, myEntry, roundHoles, setCardState, setStrokes,
  shotsFor, undoShot, useLiveVersion,
} from '../live'
import { dist, generateHoleMap, playingHandicap, scoreLabel, strokesOnHole, toPar, formatClock } from '../golf'
import { HoleMapView, greenDistances, hazardsAhead } from '../hole-map'
import { BackLink } from './TournamentDetails'
import { ScoreCell } from './Leaderboard'
import { currentRound, incidentsFor, logIncident, markedBy, markerCardFor, markerMissing, markerOf, mismatches, setMarkerStrokes, useOpsVersion } from '../ops'
import { IncidentForm, MyRoundStatus, MyRulings } from '../ops-ui'
import { ROUND_STATUS_LABEL, groupBehind, roundStatus, suspensionFor, teeSetIdFor } from '../live'

const HAZARD_LABEL = { bunker: 'Bunker', water: 'Water', trees: 'Trees' }

/**
 * Live scoring for the signed-in golfer: hole-by-hole strokes, the hole map with the ball's
 * position, distances to the green and hazards, and marked shots. In production the ball
 * position comes from the phone's GPS when the player stands at the ball (or a tap on the
 * satellite map); here "Use GPS" simulates a position along the hole.
 */
export default function LivePlay({ id }: { id: string }) {
  useDataVersion()
  useLiveVersion()
  useOpsVersion()
  const { showToast, showDialog } = useApp()
  const [asking, setAsking] = useState(false)
  const t = getTournament(id)
  const course = t ? getCourse(t.courseId) : undefined
  const me = t ? myEntry(t.id) : undefined
  const round = t ? currentRound(t) : 1
  const holes = t && course ? roundHoles(t, course, round) : []
  const card = t && me ? cardFor(t, me.id, round) : []
  const firstOpen = Math.max(0, card.findIndex(s => s === null))
  const [index, setIndex] = useState(firstOpen === -1 ? 0 : firstOpen)
  const [target, setTarget] = useState<Point | undefined>()
  const [draft, setDraft] = useState<number | null>(null)
  // The official signed off the last round while this screen was open: carry on from the new round's first open hole
  const [seenRound, setSeenRound] = useState(round)
  if (round !== seenRound) { setSeenRound(round); setIndex(firstOpen) }

  if (!t || !course || !me || me.status !== 'registered' || t.status !== 'in-progress') {
    return (
      <div className="bg-white rounded-[32px] shadow-card">
        <EmptyState
          title={t?.status !== 'in-progress' ? 'Scoring isn’t open' : 'You’re not in this field'}
          subtitle={t?.status !== 'in-progress' ? 'Live scoring opens when the tournament starts.' : 'Only registered players can enter scores.'}
          action={{ label: 'Back to tournament', onClick: () => navigate(t ? `/tournaments/${t.id}` : '/tournaments') }}
        />
      </div>
    )
  }

  // A handed-in card, or an official's WD / NS / DNF / DQ, ends scoring for the round
  const out = roundStatus(t.id, me.id, round) !== 'playing' ? roundStatus(t.id, me.id, round) : undefined
  const locked = cardState(t.id, me.id, round) !== 'in-progress' || !!out
  const hole = holes[index]
  const map = hole.map ?? generateHoleMap(hole)
  const division = t.divisions?.find(d => d.id === me.divisionId)
  const tee = course.teeSets?.find(ts => ts.id === teeSetIdFor(t, me))
  const coursePar = course.holeData.reduce((s, h) => s + h.par, 0)
  const playing = playingHandicap(me.handicapIndex, tee, coursePar, t.scoring?.allowancePct ?? 100, me.gender)
  const received = strokesOnHole(playing, hole.handicap, holes.length)
  const holeYards = tee?.yards[hole.hole - 1] ?? hole.yards
  const shots = shotsFor(t.id, me.id, round, hole.hole)
  const ball = shots.length ? shots[shots.length - 1].at : map.tee
  const toGreen = greenDistances(map, ball)
  const ahead = hazardsAhead(map, ball).slice(0, 3)
  const saved = card[index]
  const strokes = draft ?? saved ?? hole.par
  const row = leaderboard(t, round).find(r => r.entry.id === me.id)
  const group = groupOf(t.id, round, me.id)
  const behind = groupBehind(t.id, round, me.id)
  const partners = group ? entriesFor(t.id).filter(e => group.entryIds.includes(e.id) && !e.isMe) : []
  const blanks = card.filter(s => s === null).length
  // Each player marks the next one in the group: I enter their score too, and the two cards must agree
  const marker = markerOf(t.id, round, me.id)
  const markees = markedBy(t.id, round, me.id).filter(p => roundStatus(t.id, p.id, round) === 'playing')
  const noMarker = markerMissing(t, round, me.id)
  const myMarked = markerCardFor(t, me.id, round)
  const disputedHoles = new Set(incidentsFor(t.id).filter(i => i.kind === 'score-dispute' && i.status !== 'resolved' && i.entryIds.includes(me.id)).map(i => i.hole))
  const unsettled = mismatches(t, me.id, round).filter(i => !disputedHoles.has(holes[i].hole))

  function goTo(i: number) {
    setIndex(i)
    setTarget(undefined)
    setDraft(null)
  }

  function saveScore() {
    setStrokes(t!, me!.id, round, index, strokes)
    showToast(`Hole ${hole.hole}: ${strokes} — ${scoreLabel(strokes, hole.par)}`)
    setDraft(null)
    if (index < holes.length - 1) goTo(index + 1)
  }

  function markBall(at: Point) {
    addShot(t!.id, me!.id, round, hole.hole, { at, ts: Date.now() })
    setTarget(undefined)
  }

  /** Prototype GPS: a believable spot 60–240 yds further along the hole than the last ball. */
  function locateBall() {
    const next = map.path[Math.min(map.path.length - 1, shots.length + 1)] ?? map.greenCentre
    const remaining = dist(ball, map.greenCentre)
    const step = Math.min(remaining, 60 + Math.random() * 180)
    const towards = remaining > 0 ? step / Math.max(1, dist(ball, next)) : 0
    const at = remaining < 25
      ? { x: map.greenCentre.x + Math.round((Math.random() - 0.5) * 10), y: map.greenCentre.y + Math.round((Math.random() - 0.5) * 10) }
      : { x: Math.round(ball.x + (next.x - ball.x) * Math.min(1, towards) + (Math.random() - 0.5) * 16), y: Math.round(ball.y + (next.y - ball.y) * Math.min(1, towards)) }
    markBall(at)
    showToast('Ball position from GPS (simulated in the prototype)', 'info')
  }

  function sendToCommittee(i: number) {
    logIncident({
      tournamentId: t!.id, round, kind: 'score-dispute', hole: holes[i].hole, entryIds: [me!.id], status: 'committee',
      note: `${me!.name} has ${card[i]} on hole ${holes[i].hole}; marker ${marker?.name ?? ''} recorded ${myMarked[i]}. We couldn’t agree.`,
      raisedBy: { name: me!.name, role: 'golfer' },
    })
    showToast('Sent to the committee — keep playing, they’ll decide')
  }

  /** Players can't see who is slow ahead of them, but they do notice the group behind waiting on nobody (client, 21 Oct) */
  function reportGroupBehind() {
    if (!behind) return
    const names = entriesFor(t!.id).filter(e => behind.entryIds.includes(e.id)).map(e => e.name)
    showDialog({
      title: 'Report the group behind?',
      message: `The marshal gets a quiet note that the ${formatClock(behind.time)} group (${names.join(', ')}) is falling behind while you're on hole ${hole.hole}. Only the marshal and the committee see it.`,
      confirmLabel: 'Tell the marshal',
      onConfirm: () => {
        logIncident({
          tournamentId: t!.id, round, kind: 'slow-play', hole: hole.hole, entryIds: behind.entryIds,
          note: `Player report: we're on hole ${hole.hole} and the group behind (${formatClock(behind.time)} tee time) is well back — ${names.join(', ')}.`,
          raisedBy: { name: me!.name, role: 'golfer' },
        })
        showToast('Sent to the marshal — thanks')
      },
    })
  }

  function submitCard() {
    // Golfers submit the card as entered and are responsible for it (client answer T-09)
    showDialog({
      title: blanks ? `Submit with ${blanks} blank hole${blanks > 1 ? 's' : ''}?` : 'Submit your scorecard?',
      message: `${blanks ? 'Holes without a score stay blank on your card. ' : ''}Gross ${row?.gross ?? '—'} (${toPar(row?.grossToPar ?? 0)}), net ${row?.net ?? '—'}. You're responsible for the card as entered; the committee verifies it next and you can't change scores after submitting.`,
      confirmLabel: 'Submit card',
      onConfirm: () => { setCardState(t!.id, me!.id, round, 'submitted'); showToast('Scorecard submitted') },
    })
  }

  return (
    <div className="page-in">
      <BackLink label={t.name} onClick={() => navigate(`/tournaments/${t.id}`)} />
      <PageHeader
        eyebrow={`Round ${round} · ${division?.name ?? ''} · ${tee?.name ?? ''} tees · playing handicap ${playing}`}
        title="My round"
        actions={
          <>
            <StatusBadge status="in-progress" size="md" />
            <Button variant="secondary" onClick={() => navigate(`/tournaments/${t.id}/leaderboard`)}>Leaderboard</Button>
          </>
        }
      />

      {/* An official stopped play: shown until they resume it */}
      {suspensionFor(t.id) && (
        <div role="alert" className="mb-5 rounded-2xl bg-rose-600 text-white px-5 py-4">
          <p className="font-display font-bold text-[16px]">Play suspended — {suspensionFor(t.id)!.reason.toLowerCase()}. Mark your ball and stop play.</p>
          <p className="text-[14px] text-white/85 mt-0.5">
            {suspensionFor(t.id)!.note ? `${suspensionFor(t.id)!.by}, tournament official: “${suspensionFor(t.id)!.note}”` : 'Wait for the official to resume play. Your scores so far are saved.'}
          </p>
        </div>
      )}

      <MyRoundStatus t={t} entryId={me.id} round={round} />

      {noMarker && (
        <div role="status" className="mb-5 rounded-2xl bg-amber-50 text-amber-900 px-5 py-4">
          <p className="font-display font-bold text-[15px]">{marker?.name} can’t mark your card any more</p>
          <p className="text-[13px] mt-0.5">Keep playing and scoring. The official gives your card to someone else in your group.</p>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          ['Position', row?.position ?? '–'],
          ['To par (gross)', row && row.thru ? toPar(row.grossToPar) : 'E'],
          ['Net', row && row.thru ? toPar(row.netToPar) : 'E'],
          ['Thru', row?.thru === holes.length ? 'F' : String(row?.thru ?? 0)],
        ].map(([label, value], i) => (
          <div key={label} className={`rounded-2xl p-4 ${i === 0 ? 'bg-ink text-white' : 'bg-white shadow-card'}`}>
            <p className={`text-[12px] font-semibold ${i === 0 ? 'text-white/55' : 'text-gray-500'}`}>{label}</p>
            <p className={`font-display font-extrabold text-[26px] leading-tight ${i === 0 ? 'text-lime-400' : 'text-ink'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Hole strip */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-4">
        {holes.map((h, i) => {
          const s = card[i]
          return (
            <button key={h.hole} onClick={() => goTo(i)} aria-pressed={i === index} aria-label={`Hole ${h.hole}${s !== null ? `, ${s} strokes` : ''}`}
              className={`flex-shrink-0 w-12 rounded-2xl py-1.5 flex flex-col items-center ${i === index ? 'bg-ink text-white' : 'bg-white shadow-card text-ink'}`}>
              <span className={`text-[10px] font-bold ${i === index ? 'text-white/60' : 'text-gray-400'}`}>{h.hole}</span>
              <span className="text-[15px] font-display font-extrabold leading-tight">{s ?? '–'}</span>
            </button>
          )
        })}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6 items-start">
        {/* Map */}
        <section className="bg-white rounded-[28px] shadow-card p-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="font-display font-bold text-ink text-[17px]">Hole {hole.hole}{hole.name ? ` · ${hole.name}` : ''}</p>
            <p className="text-[13px] text-gray-500">Par {hole.par} · {holeYards} yds · SI {hole.handicap}</p>
          </div>
          <HoleMapView
            map={map}
            size="lg"
            shots={shots.map((s, i) => ({ at: s.at, label: String(i + 1) }))}
            ball={ball}
            target={target}
            onPick={locked ? undefined : setTarget}
            ariaLabel={`Hole ${hole.hole} map — tap to measure`}
          />
          <div className="flex flex-wrap gap-2 mt-3">
            {target ? (
              <>
                <Button size="sm" onClick={() => markBall(target)}>Mark ball here</Button>
                <Button size="sm" variant="secondary" onClick={() => setTarget(undefined)}>Clear target</Button>
                <span className="text-[13px] text-gray-500 self-center">{dist(ball, target)} yds to target · {dist(target, map.greenCentre)} yds from there to the pin</span>
              </>
            ) : (
              <>
                <Button size="sm" onClick={locateBall} disabled={locked}>Use GPS for my ball</Button>
                <Button size="sm" variant="secondary" onClick={() => undoShot(t.id, me.id, round, hole.hole)} disabled={locked || !shots.length}>Undo last shot</Button>
                <span className="text-[13px] text-gray-500 self-center">Tap the map to measure, then mark your ball</span>
              </>
            )}
          </div>
        </section>

        {/* Distances and score */}
        <div className="space-y-5">
          <section className="bg-ink rounded-[28px] p-6 text-white">
            <p className="text-white/55 text-[13px] font-semibold font-display">{shots.length ? `From your ball (shot ${shots.length})` : 'From the tee'}</p>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              {[['Front', toGreen.front], ['Centre', toGreen.centre], ['Back', toGreen.back]].map(([label, yards], i) => (
                <div key={label} className={`rounded-2xl py-3 ${i === 1 ? 'bg-lime-400 text-ink' : 'bg-white/[0.08]'}`}>
                  <p className="font-display font-extrabold text-[30px] leading-none">{yards}</p>
                  <p className={`text-[11px] font-semibold mt-1.5 ${i === 1 ? 'text-pine-800' : 'text-white/55'}`}>{label}</p>
                </div>
              ))}
            </div>
            {ahead.length > 0 && (
              <ul className="mt-4 space-y-1.5 text-[13px]">
                {ahead.map(({ hazard, reach, carry }) => (
                  <li key={hazard.id} className="flex justify-between text-white/75">
                    <span>{HAZARD_LABEL[hazard.type]}</span>
                    <span><span className="text-white font-semibold">{reach}</span> to reach · <span className="text-white font-semibold">{carry}</span> to carry</span>
                  </li>
                ))}
              </ul>
            )}
            {hole.notes && <p className="text-[13px] text-white/60 mt-4 leading-relaxed">{hole.notes}</p>}
          </section>

          <section className="bg-white rounded-[28px] shadow-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-ink text-[18px]">Score for hole {hole.hole}</h2>
              <span className="text-[12px] font-semibold text-pine-600">{received ? `${received} stroke${received > 1 ? 's' : ''} received` : 'No strokes received'}</span>
            </div>
            <div className="flex items-center justify-center gap-5 mt-5">
              <button disabled={locked || strokes <= 1} onClick={() => setDraft(strokes - 1)} aria-label="One fewer stroke"
                className="w-14 h-14 rounded-full bg-canvas text-ink text-[26px] font-bold disabled:opacity-40">−</button>
              <div className="text-center w-28">
                <p className="font-display font-extrabold text-ink text-[56px] leading-none">{strokes}</p>
                <p className="text-[13px] font-semibold text-gray-500 mt-1">{scoreLabel(strokes, hole.par)} · net {strokes - received}</p>
              </div>
              <button disabled={locked || strokes >= 15} onClick={() => setDraft(strokes + 1)} aria-label="One more stroke"
                className="w-14 h-14 rounded-full bg-canvas text-ink text-[26px] font-bold disabled:opacity-40">+</button>
            </div>
            {shots.length > 0 && !locked && strokes !== shots.length + 1 && (
              <button onClick={() => setDraft(shots.length + 1)} className="block mx-auto mt-3 text-[12px] font-semibold text-pine-600 underline underline-offset-4">
                Use marked shots ({shots.length} + 1 putt = {shots.length + 1})
              </button>
            )}
            <Button fullWidth className="mt-5" onClick={saveScore} disabled={locked}>
              {out ? ROUND_STATUS_LABEL[out] : locked ? 'Card submitted' : saved !== null && draft === null ? 'Saved — next hole' : 'Save score'}
            </Button>
          </section>

          {unsettled.length > 0 && (
            <section className="bg-rose-50 rounded-[28px] p-6">
              <h2 className="font-display font-bold text-rose-800 text-[17px]">Score discrepancy with your marker</h2>
              <p className="text-[13px] text-rose-700 mt-1">{marker?.name.split(' ')[0] ?? 'Your marker'} wrote down a different score. Agree on one with them now; if you can’t, the committee decides.</p>
              <ul className="mt-3 space-y-3">
                {unsettled.map(i => (
                  <li key={i} className="bg-white rounded-2xl p-3.5">
                    <p className="text-[14px] text-ink"><span className="font-bold">Hole {holes[i].hole}:</span> you {card[i]} · {marker?.name.split(' ')[0] ?? 'marker'} {myMarked[i]}</p>
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      <Button size="sm" onClick={() => { setStrokes(t, me.id, round, i, myMarked[i]); showToast(`Hole ${holes[i].hole} changed to ${myMarked[i]}`) }}>Use {myMarked[i]}</Button>
                      <Button size="sm" variant="secondary" onClick={() => { setMarkerStrokes(t, me.id, round, i, card[i]); showToast(`${marker?.name.split(' ')[0] ?? 'Marker'} changed their record to ${card[i]}`) }}>Marker changes to {card[i]}</Button>
                      <Button size="sm" variant="ghost" onClick={() => sendToCommittee(i)}>Send to committee</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {markees.length > 0 && (
            <section className="bg-white rounded-[28px] shadow-card p-6">
              <h2 className="font-display font-bold text-ink text-[17px]">You’re marking</h2>
              <p className="text-[12px] text-gray-500 mt-0.5">Enter their score for hole {hole.hole}. {marker ? `${marker.name} marks yours.` : ''}</p>
              <ul className="mt-3 space-y-3">
                {markees.map(p => {
                  const theirs = cardFor(t, p.id, round)[index]
                  const mine = markerCardFor(t, p.id, round)[index]
                  const value = mine ?? hole.par
                  return (
                    <li key={p.id} className="flex items-center gap-3">
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-semibold text-ink truncate">{p.name}</span>
                        <span className={`block text-[12px] ${mine !== null && theirs !== null && mine !== theirs ? 'text-rose-600 font-semibold' : 'text-gray-500'}`}>
                          {mine === null ? 'Not entered yet' : theirs === null ? 'Waiting for their score' : mine === theirs ? 'Matches their card ✓' : `They entered ${theirs} — check with them`}
                        </span>
                      </span>
                      <button disabled={locked || value <= 1} onClick={() => setMarkerStrokes(t, p.id, round, index, value - 1)} aria-label={`One fewer for ${p.name}`}
                        className="w-10 h-10 rounded-full bg-canvas text-ink text-[20px] font-bold disabled:opacity-40">−</button>
                      <span className={`w-8 text-center font-display font-extrabold text-[22px] ${mine === null ? 'text-gray-300' : 'text-ink'}`}>{value}</span>
                      <button disabled={locked || value >= 15} onClick={() => setMarkerStrokes(t, p.id, round, index, mine === null ? value : value + 1)} aria-label={`${mine === null ? 'Confirm' : 'One more for'} ${p.name}`}
                        className="w-10 h-10 rounded-full bg-canvas text-ink text-[20px] font-bold disabled:opacity-40">{mine === null ? '✓' : '+'}</button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <MyRulings t={t} entryId={me.id} />

          <section className="bg-white rounded-[28px] shadow-card p-5 flex items-center gap-4">
            <span className="flex-1 text-[13px] text-gray-600 leading-relaxed"><span className="font-bold text-ink block text-[14px]">Need a ruling?</span>A marshal or the committee answers rules questions and disputes.</span>
            <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>Ask for a ruling</Button>
          </section>

          {behind && (
            <section className="bg-white rounded-[28px] shadow-card p-5 flex items-center gap-4">
              <span className="flex-1 text-[13px] text-gray-600 leading-relaxed"><span className="font-bold text-ink block text-[14px]">Group behind falling back?</span>Tell the marshal quietly — e.g. you’re on the green and they’re still not on the tee.</span>
              <Button size="sm" variant="secondary" onClick={reportGroupBehind}>Report slow group</Button>
            </section>
          )}

          {partners.length > 0 && (
            <section className="bg-white rounded-[28px] shadow-card p-6">
              <h2 className="font-display font-bold text-ink text-[17px] mb-3">Your group</h2>
              <ul className="space-y-2">
                {partners.map(p => {
                  const pc = cardFor(t, p.id, round)
                  const thru = pc.filter(s => s !== null).length
                  return (
                    <li key={p.id} className="flex justify-between text-[14px]">
                      <span className="text-ink font-semibold">{p.name}</span>
                      <span className="text-gray-500">thru {thru}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      </div>

      {/* Card */}
      <section className="bg-white rounded-[28px] shadow-card p-6 mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-display font-bold text-ink text-[18px]">My scorecard</h2>
          {locked
            ? <span className="text-[13px] font-semibold text-pine-600">{out ? `${ROUND_STATUS_LABEL[out]} — left out of the results` : cardState(t.id, me.id, round) === 'verified' ? 'Verified by the committee' : 'Submitted — awaiting verification'}</span>
            : <span className="flex items-center gap-3">
                {unsettled.length > 0 && <span className="text-[12px] text-rose-600 font-semibold">Settle hole {unsettled.map(i => holes[i].hole).join(', ')} with your marker first</span>}
                <Button size="sm" onClick={submitCard} disabled={unsettled.length > 0}>{blanks ? `Submit card (${blanks} blank)` : 'Submit card'}</Button>
              </span>}
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {holes.map((h, i) => (
              <button key={h.hole} onClick={() => goTo(i)} className={`flex flex-col items-center gap-1 w-9 rounded-xl py-1 ${i === index ? 'bg-canvas' : ''}`}>
                <span className="text-[10px] font-bold text-gray-400">{h.hole}</span>
                <span className="text-[10px] text-gray-400">P{h.par}</span>
                <span className={unsettled.includes(i) ? 'rounded-lg ring-2 ring-rose-400' : ''}><ScoreCell strokes={card[i]} par={h.par} /></span>
                <span className={`text-[10px] font-semibold ${unsettled.includes(i) ? 'text-rose-600' : 'text-gray-300'}`}>{myMarked[i] ?? '·'}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
      {asking && (
        <IncidentForm t={t} round={round} actor={{ name: me.name, role: 'golfer' }} onClose={() => setAsking(false)}
          preset={{ kind: 'rules', hole: hole.hole, entryIds: [me.id] }} />
      )}
    </div>
  )
}
