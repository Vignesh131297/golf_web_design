import { Fragment } from 'react'
import type { Course } from '../types'
import { pickupAfter, playingHandicap, strokesOnHole } from '../golf'

/*
 * Worked example for the AJ review (25 Nov 2026): how two golfers with handicaps 12 and 18 are treated
 * on the selected course. Display only — it uses the same stroke-index allocation as scoring
 * (strokesOnHole) and the proposed pick-up point (pickupAfter: net double bogey).
 */
const HANDICAPS = [12, 18]

export function HandicapExample({ course, allowancePct }: { course?: Course; allowancePct: number }) {
  // <details>, not a button: the wizard puts live tournaments in a disabled (view-only) fieldset
  if (!course?.holeData?.length) return null
  const holes = course.holeData
  const n = holes.length
  const coursePar = holes.reduce((s, h) => s + h.par, 0)
  const tee = course.teeSets?.[0]
  // A hole where handicap 12 gets no stroke and 18 gets one, like AJ's example (stroke index 13–18)
  const sample = holes.find(h => h.par === 4 && h.handicap > 12 && h.handicap <= 18) ?? holes.find(h => h.handicap > 12)
  return (
    <details className="group rounded-2xl border border-gray-200">
      <summary className="list-none cursor-pointer flex items-center justify-between gap-3 px-4 py-3 text-left [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-[13px] font-bold text-ink font-display">Worked example: handicap 12 vs handicap 18</span>
          <span className="block text-[12px] text-gray-500">Where each golfer gets strokes on {course.name}, and when they should pick up</span>
        </span>
        <span className="text-[12px] font-bold text-pine-700"><span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span></span>
      </summary>
        <div className="px-4 pb-4">
          {sample && (
            <p className="text-[13px] text-gray-700 bg-canvas rounded-2xl px-4 py-3 leading-relaxed">
              <span className="font-bold text-ink">Hole {sample.hole}: par {sample.par}, stroke index {sample.handicap}.</span>{' '}
              Handicap 12 gets {strokesOnHole(12, sample.handicap, n) ? 'a stroke' : 'no stroke'} here, so they pick up after {pickupAfter(sample.par, strokesOnHole(12, sample.handicap, n))} (double bogey).{' '}
              Handicap 18 gets {strokesOnHole(18, sample.handicap, n)} stroke, so they can play on and pick up after {pickupAfter(sample.par, strokesOnHole(18, sample.handicap, n))} (net double bogey).
            </p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12px] text-center tabular-nums">
              <tbody>
                <Row label="Hole" cells={holes.map(h => h.hole)} strong />
                <Row label="Par" cells={holes.map(h => h.par)} />
                <Row label="Stroke index" cells={holes.map(h => h.handicap)} />
                {HANDICAPS.map(hc => (
                  <Fragment key={hc}>
                    <Row label={`Handicap ${hc} · strokes`} cells={holes.map(h => strokesOnHole(hc, h.handicap, n) || '–')} tone={hc === 12 ? 'sky' : 'lime'} />
                    <Row label={`Handicap ${hc} · pick up after`} cells={holes.map(h => pickupAfter(h.par, strokesOnHole(hc, h.handicap, n)))} tone={hc === 12 ? 'sky' : 'lime'} />
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 text-[12px] text-gray-600 leading-relaxed list-disc pl-5">
            <li>Strokes go to the hardest holes first: a handicap of 12 gets one stroke on stroke index 1–12; 18 gets one on every hole{n === 18 ? '' : ' of an 18-hole card'}.</li>
            <li>Pick up after = par + strokes received + 2 (net double bogey). In Stableford that score already earns 0 points.</li>
            <li>“12” and “18” here are <span className="font-semibold">playing handicaps</span>. A Handicap Index of 12.0 on the {tee?.name ?? 'first'} tees at {allowancePct}% gives a playing handicap of {playingHandicap(12, tee, coursePar, allowancePct)}; 18.0 gives {playingHandicap(18, tee, coursePar, allowancePct)}.</li>
          </ul>
          <p className="mt-2 text-[11px] font-semibold text-amber-700">Proposal for AJ to confirm — pick-up point and handicap wording.</p>
        </div>
    </details>
  )
}

function Row({ label, cells, strong, tone }: { label: string; cells: (number | string)[]; strong?: boolean; tone?: 'sky' | 'lime' }) {
  const bg = tone === 'sky' ? 'bg-sky-50' : tone === 'lime' ? 'bg-lime-400/20' : ''
  return (
    <tr className={`${bg} border-b border-gray-100 last:border-0`}>
      <th scope="row" className="sticky left-0 bg-white text-left font-semibold text-gray-600 pr-3 py-1.5 whitespace-nowrap">{label}</th>
      {cells.map((c, i) => <td key={i} className={`px-1.5 py-1.5 ${strong ? 'font-bold text-ink' : 'text-gray-700'}`}>{c}</td>)}
    </tr>
  )
}
