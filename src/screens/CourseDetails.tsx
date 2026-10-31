import { useState } from 'react'
import type { Course, HoleData } from '../types'
import { InfoRow, EmptyState, IconPin } from '../components'
import { getCourse, getTournament } from '../data'
import { isPublicTournament } from '../admin/access'
import MoreTournaments from './MoreTournaments'
import { navigate } from '../router'
import { useFakeLoad } from '../shell'
import { BackLink } from './TournamentDetails'
import { HoleMapView } from '../hole-map'
import { dist, generateHoleMap, teeSwatch, teeTotal, formatClock } from '../golf'

function NineTable({ label, holes, totalLabel, unit }: { label: string; holes: HoleData[]; totalLabel: string; unit: string }) {
  const par = holes.reduce((s, h) => s + h.par, 0)
  const yds = holes.reduce((s, h) => s + h.yards, 0)
  return (
    <div className="rounded-2xl bg-canvas p-1.5">
      <p className="px-3 pt-2 pb-2 text-[13px] font-bold font-display text-gray-500">{label}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-center text-[13px] border-separate border-spacing-0">
          <thead>
            <tr className="text-[11px] font-bold font-display text-gray-400">
              <th className="py-2 text-left pl-3 font-bold">Hole</th>
              {holes.map(h => <th key={h.hole} className="py-2 font-bold">{h.hole}</th>)}
              <th className="py-2 pr-3 font-bold text-ink">{totalLabel}</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            <tr>
              <td className="py-2.5 pl-3 text-left font-semibold text-gray-500 rounded-tl-xl">Par</td>
              {holes.map(h => <td key={h.hole} className="py-2.5 font-semibold text-ink">{h.par}</td>)}
              <td className="py-2.5 pr-3 font-bold text-ink rounded-tr-xl">{par}</td>
            </tr>
            <tr className="[&>td]:border-t [&>td]:border-black/[0.05]">
              <td className="py-2.5 pl-3 text-left font-semibold text-gray-500">{unit}</td>
              {holes.map(h => <td key={h.hole} className="py-2.5 text-gray-600">{h.yards}</td>)}
              <td className="py-2.5 pr-3 font-bold text-ink">{yds.toLocaleString()}</td>
            </tr>
            <tr className="[&>td]:border-t [&>td]:border-black/[0.05]">
              <td className="py-2.5 pl-3 text-left font-semibold text-gray-500 rounded-bl-xl">Hcp</td>
              {holes.map(h => <td key={h.hole} className="py-2.5 text-gray-400">{h.handicap}</td>)}
              <td className="py-2.5 pr-3 text-gray-400 rounded-br-xl">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TeesTable({ course }: { course: Course }) {
  const tees = course.teeSets ?? []
  if (!tees.length) return null
  const rating = (r?: number, s?: number) => (r !== undefined ? `${r.toFixed(1)} / ${s}` : '—')
  return (
    <section className="bg-white rounded-[28px] shadow-card p-6 lg:p-7">
      <h2 className="font-display font-bold text-ink text-[19px] tracking-tight mb-4">Tees</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <thead>
            <tr className="text-[12px] font-bold font-display text-gray-400">
              <th className="py-2 pr-3">Tees</th><th className="py-2 px-3 text-right">{course.distanceUnit === 'metres' ? 'Metres' : 'Yards'}</th>
              <th className="py-2 px-3 text-right">Men rating / slope</th><th className="py-2 pl-3 text-right">Women rating / slope</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.05]">
            {tees.map(t => (
              <tr key={t.id}>
                <td className="py-2.5 pr-3 font-semibold text-ink"><span className="inline-flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full ring-1 ring-black/15" style={{ background: teeSwatch(t.color) }} />{t.name}</span></td>
                <td className="py-2.5 px-3 text-right">{teeTotal(t).toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right">{rating(t.menRating, t.menSlope)}</td>
                <td className="py-2.5 pl-3 text-right">{rating(t.womenRating, t.womenSlope)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function HoleGuide({ course }: { course: Course }) {
  const [index, setIndex] = useState(0)
  const hole = course.holeData[index]
  const map = hole.map ?? generateHoleMap(hole)
  return (
    <section className="bg-white rounded-[28px] shadow-card p-6 lg:p-7">
      <h2 className="font-display font-bold text-ink text-[19px] tracking-tight mb-4">Hole guide</h2>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2">
        {course.holeData.map((h, i) => (
          <button key={h.hole} onClick={() => setIndex(i)} aria-pressed={i === index}
            className={`w-9 h-9 rounded-full text-[13px] font-bold font-display flex-shrink-0 ${i === index ? 'bg-ink text-white' : 'bg-canvas text-gray-600 hover:bg-gray-200'}`}>{h.hole}</button>
        ))}
      </div>
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-5 mt-3 items-start">
        {/* The club's own picture of the hole (from its website or scorecard); a sketch without one */}
        <div>
          {hole.imageUrl ? (
            <a href={hole.imageUrl} target="_blank" rel="noreferrer" className="block rounded-3xl overflow-hidden bg-canvas">
              <img src={hole.imageUrl} alt={`Hole ${hole.hole} from ${course.name}`} className="w-full max-h-[520px] object-contain" />
            </a>
          ) : (
            <HoleMapView map={map} size="md" ariaLabel={`Hole ${hole.hole} layout`} />
          )}
          <p className="text-[12px] text-gray-400 mt-2">
            {hole.imageUrl
              ? `Image: ${course.holeImageSource ?? `${course.name} scorecard`}`
              : "Sketch. The club's own picture of this hole shows here once it's added."}
          </p>
        </div>
        <div>
          <p className="font-display font-extrabold text-ink text-[22px] tracking-tight">Hole {hole.hole}{hole.name ? ` · ${hole.name}` : ''}</p>
          <p className="text-[14px] text-gray-500">Par {hole.par}{hole.parWomen && hole.parWomen !== hole.par ? ` (women ${hole.parWomen})` : ''} · Stroke index {hole.handicap}</p>
          <ul className="mt-4 space-y-1.5 text-[14px]">
            {(course.teeSets ?? []).map(t => (
              <li key={t.id} className="flex justify-between"><span className="inline-flex items-center gap-2 text-gray-600"><span className="w-3 h-3 rounded-full ring-1 ring-black/15" style={{ background: teeSwatch(t.color) }} />{t.name}</span><span className="font-semibold text-ink">{t.yards[index]} {course.distanceUnit === 'metres' ? 'm' : 'yds'}</span></li>
            ))}
          </ul>
          <p className="text-[13px] text-gray-500 mt-4">Green depth {dist(map.greenFront, map.greenBack)} yds · {map.hazards.filter(h => h.type === 'bunker').length} bunkers{map.hazards.some(h => h.type === 'water') ? ' · water in play' : ''}</p>
          {hole.notes && <p className="text-[14px] text-gray-600 mt-3 leading-relaxed">{hole.notes}</p>}
        </div>
      </div>
    </section>
  )
}

/** [tournamentId]: the tournament the golfer came from — the only one this page mentions (client, 21 Oct) */
export default function CourseDetails({ id, tournamentId }: { id: string; tournamentId?: string }) {
  const loading = useFakeLoad(600)
  const [nine, setNine] = useState<'front' | 'back' | 'all'>('all')
  // Draft courses are only visible in the admin console
  const found = getCourse(id)
  const course = found?.lifecycle === 'draft' ? undefined : found
  const ours = tournamentId ? getTournament(tournamentId) : undefined
  const event = ours && ours.courseId === id && isPublicTournament(ours) ? ours : undefined

  const goBack = () => (window.history.length > 1 ? window.history.back() : navigate('/tournaments'))

  if (loading) {
    return (
      <div>
        <div className="h-9 w-32 skeleton rounded-full mb-5" />
        <div className="h-[340px] skeleton rounded-[32px]" />
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-6">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-20 skeleton rounded-2xl" />)}
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="bg-white rounded-[32px] shadow-card">
        <EmptyState title="Course not found" subtitle="This course could not be loaded."
          action={{ label: 'Back to tournaments', onClick: () => navigate('/tournaments') }} />
      </div>
    )
  }

  const stats: [string | number, string][] = [
    [course.holes, 'Holes'],
    [course.par, 'Par'],
    [course.yardage.toLocaleString(), course.distanceUnit === 'metres' ? 'Metres' : 'Yards'],
    [course.rating.toFixed(1), 'Rating'],
    [course.slope, 'Slope'],
    [course.established, 'Established'],
  ]

  const front = course.holeData.slice(0, 9)
  const back  = course.holeData.slice(9, 18)

  return (
    <div className="page-in">
      <BackLink label="Back" onClick={goBack} />

      <div className="relative h-[280px] lg:h-[340px] rounded-[32px] overflow-hidden bg-pine-100 shadow-card">
        <img src={course.imageUrl} alt={course.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 scrim-bottom" />
        <div className="absolute bottom-7 left-7 right-7">
          <p className="text-white/75 text-[14px] font-semibold font-display flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1.5a4 4 0 014 4c0 2.8-4 8.5-4 8.5S3.5 8.3 3.5 5.5a4 4 0 014-4z" stroke="#c8ec5a" strokeWidth="1.3"/>
              <circle cx="7.5" cy="5.5" r="1.5" stroke="#c8ec5a" strokeWidth="1.3"/>
            </svg>
            {course.city}, {course.region}
          </p>
          <h1 className="font-display font-extrabold text-white text-[32px] lg:text-[44px] leading-[1.05] tracking-tight mt-1">{course.name}</h1>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-6">
        {stats.map(([value, label], i) => (
          <div key={label} className={`rounded-2xl p-4 ${i === 0 ? 'bg-lime-400' : 'bg-white shadow-card'}`}>
            <p className="font-display font-extrabold text-[22px] tracking-tight text-ink leading-none">{value}</p>
            <p className={`text-[12px] font-semibold mt-2 ${i === 0 ? 'text-pine-800' : 'text-gray-500'}`}>{label}</p>
          </div>
        ))}
      </div>

      {course.status && course.status !== 'open' && (
        <div className={`mt-6 rounded-2xl px-5 py-4 ${course.status === 'closed' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>
          <p className="text-sm font-bold font-display">{course.status === 'closed' ? 'Course closed' : 'Partly open / maintenance'}</p>
          {course.statusNote && <p className="text-[13px] opacity-80 mt-0.5">{course.statusNote}</p>}
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 mt-6 items-start">
        <div className="space-y-6">
          <section className="bg-white rounded-[28px] shadow-card p-6 lg:p-7">
            <h2 className="font-display font-bold text-ink text-[19px] tracking-tight mb-3">About the course</h2>
            <p className="text-[15px] text-gray-600 leading-relaxed">{course.description}</p>
          </section>

          <section className="bg-white rounded-[28px] shadow-card p-6 lg:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-display font-bold text-ink text-[19px] tracking-tight">Scorecard</h2>
              {back.length > 0 && (
                <div className="flex bg-canvas rounded-full p-1">
                  {([['front', 'Front 9'], ['back', 'Back 9'], ['all', `All ${course.holes}`]] as const).map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={nine === value} onClick={() => setNine(value)}
                      className={`h-8 px-3.5 rounded-full text-[12px] font-bold font-display transition-all ${nine === value ? 'bg-ink text-white' : 'text-gray-500 hover:text-ink'}`}>{label}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3">
              {(nine !== 'back' || !back.length) && <NineTable label="Front 9" holes={front} totalLabel="OUT" unit={course.distanceUnit === 'metres' ? 'Metres' : 'Yards'} />}
              {back.length > 0 && nine !== 'front' && <NineTable label="Back 9" holes={back} totalLabel="IN" unit={course.distanceUnit === 'metres' ? 'Metres' : 'Yards'} />}
            </div>
            {course.scorecardImageUrl && (
              <a href={course.scorecardImageUrl} target="_blank" rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-bold font-display text-ink hover:underline">View the club's scorecard ›</a>
            )}
          </section>

          <TeesTable course={course} />
          <HoleGuide course={course} />
        </div>

        <aside className="lg:sticky lg:top-8 space-y-6">
          <section className="bg-white rounded-[28px] shadow-card p-6 space-y-4">
            <InfoRow icon={<IconPin />} label="Address" value={`${course.address}, ${course.city}, ${course.region}`} />
            <InfoRow
              icon={
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M2 7.5l4 4 7-7" stroke="#4a9264" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              }
              label="Designer"
              value={course.designer}
            />
            {course.phone && <InfoRow icon={<span className="text-[14px]">☎</span>} label="Phone" value={course.phone} />}
            {course.website && (
              <InfoRow icon={<span className="text-[14px]">↗</span>} label="Website"
                value={<a href={course.website.startsWith('http') ? course.website : `https://${course.website}`} target="_blank" rel="noreferrer" className="text-pine-600 font-semibold underline underline-offset-4">{course.website}</a>} />
            )}
            {course.dressCode && <InfoRow icon={<span className="text-[14px]">👕</span>} label="Dress code" value={course.dressCode} />}
            <div className="flex flex-wrap gap-2 pt-1">
              {course.geo && (
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${course.geo.lat},${course.geo.lng}`} target="_blank" rel="noreferrer"
                  className="h-10 px-4 rounded-full bg-ink text-white text-[13px] font-bold font-display inline-flex items-center">Directions ↗</a>
              )}
              {course.bookingUrl && (
                <a href={course.bookingUrl.startsWith('http') ? course.bookingUrl : `https://${course.bookingUrl}`} target="_blank" rel="noreferrer"
                  className="h-10 px-4 rounded-full bg-canvas text-ink text-[13px] font-bold font-display inline-flex items-center">Book a tee time ↗</a>
              )}
            </div>
          </section>

          {!!course.facilities?.length && (
            <section className="bg-white rounded-[28px] shadow-card p-6">
              <h2 className="font-display font-bold text-ink text-[18px] tracking-tight mb-3">Facilities</h2>
              <div className="flex flex-wrap gap-1.5">
                {course.facilities.map(f => <span key={f} className="h-8 px-3 rounded-full bg-canvas text-[13px] font-semibold text-gray-600 inline-flex items-center">{f}</span>)}
              </div>
            </section>
          )}

          {event && (
            <section className="bg-ink rounded-[28px] p-6 text-white">
              <p className="text-lime-400 text-[12px] font-bold font-display uppercase tracking-wider">Your tournament here</p>
              <h2 className="font-display font-bold text-[19px] tracking-tight mt-1">{event.name}</h2>
              <p className="text-white/70 text-[14px] mt-1">{event.dateRange}{event.teeSheet ? ` · ${event.teeSheet.startType === 'shotgun' ? 'Shotgun start' : 'First tee time'} ${formatClock(event.teeSheet.firstTeeTime)}` : ''}</p>
              <button onClick={() => navigate(`/tournaments/${event.id}`)} className="mt-4 h-10 px-4 rounded-full bg-lime-400 text-ink text-[13px] font-bold font-display">Back to the tournament</button>
            </section>
          )}

          <MoreTournaments excludeId={event?.id} excludeCourseId={course.id} />
        </aside>
      </div>
    </div>
  )
}
