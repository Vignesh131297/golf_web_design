import { useState } from 'react'
import type { Course } from '../types'
import { Button, EmptyState, SkeletonRow } from '../components'
import { useApp } from '../app-context'
import { navigate } from '../router'
import { PageHeader } from '../shell'
import { useDataVersion } from '../store'
import { BackLink } from '../screens/TournamentDetails'
import { NoAccess } from './AdminShell'
import {
  PROVIDER, ProviderError, applyFixes, checkLayout, getProviderCourse, importCourse, importedCourse, liveOn, lookalike, providerCountries, refreshCourse, searchProvider,
  type ProviderCourse, type SearchHit,
} from './course-import'

/*
 * Sprint 4 · GC2–GC8: Courses → Import from the course database.
 * Search → Preview (layout, tees, scorecard; missing data marked) → Review (fix what blocks, see what's optional)
 * → Imported (course is Active, selectable in tournament set-up). Manual "New course" stays available throughout.
 */

const CHIP = 'inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-bold font-display whitespace-nowrap'
const MISSING = <span className="text-amber-600 font-semibold" title="The provider doesn’t have this">missing</span>

type Step = 'search' | 'preview' | 'review' | 'done'

function errorText(e: unknown): { title: string; body: string; retry: boolean } {
  if (e instanceof ProviderError) {
    if (e.code === 'timeout') return { title: 'The course database didn’t answer', body: 'It took too long to respond. Try again in a moment, or add the course by hand.', retry: true }
    if (e.code === 'rate-limited') return { title: 'Too many searches', body: `The course database is limiting searches. Try again in ${e.retryAfter ?? 30} seconds.`, retry: true }
    if (e.code === 'credentials') return { title: 'Course database unavailable', body: 'Our connection to the course database isn’t working. The platform team has been told. You can still add the course by hand.', retry: false }
    if (e.code === 'not-found') return { title: 'Course no longer listed', body: e.message, retry: false }
    if (e.code === 'malformed') return { title: 'This course’s data is incomplete', body: `${e.message} Add it by hand instead, or pick another course.`, retry: false }
  }
  return { title: 'Something went wrong', body: 'Try again, or add the course by hand.', retry: true }
}

export function CourseImport() {
  useDataVersion()
  const { can, adminUser, consoleActor, showToast } = useApp()
  const [step, setStep] = useState<Step>('search')
  const [q, setQ] = useState('')
  const [country, setCountry] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ReturnType<typeof errorText> | null>(null)
  const [course, setCourse] = useState<ProviderCourse | null>(null)
  const [layoutId, setLayoutId] = useState('')
  const [teeIds, setTeeIds] = useState<string[]>([])
  const [fixPar, setFixPar] = useState<Record<number, number>>({})
  const [fixSi, setFixSi] = useState<Record<number, number>>({})
  const [result, setResult] = useState<{ course: Course; updated: boolean } | null>(null)
  const [conflict, setConflict] = useState<Course | null>(null)

  if (!can('courses.create')) return <NoAccess what="import courses" />

  async function search(e?: React.FormEvent) {
    e?.preventDefault()
    if (q.trim().length < 3) { setError({ title: 'Type at least 3 letters', body: 'Search by course or club name, e.g. “Lakeview”.', retry: false }); setHits(null); return }
    setBusy(true); setError(null)
    try { setHits(await searchProvider(q, country || undefined)) } catch (err) { setError(errorText(err)); setHits(null) }
    setBusy(false)
  }

  async function open(hit: SearchHit, layout?: string) {
    setBusy(true); setError(null)
    try {
      const c = await getProviderCourse(hit.providerCourseId)
      const l = c.layouts.find(x => x.layoutId === layout) ?? c.layouts[0]
      setCourse(c); setLayoutId(l.layoutId); setTeeIds(l.tees.map(t => t.teeId)); setFixPar({}); setFixSi({}); setConflict(null)
      setStep('preview')
    } catch (err) { setError(errorText(err)) }
    setBusy(false)
  }

  const layout = course?.layouts.find(l => l.layoutId === layoutId)
  const fixed = layout ? applyFixes(layout, { par: fixPar, si: fixSi }) : undefined
  const check = fixed ? checkLayout(fixed, teeIds) : undefined
  const already = course && layout ? importedCourse(course.providerCourseId, layout.layoutId) : undefined
  const similar = course && !already ? lookalike(course) : undefined
  const by = consoleActor?.name ?? adminUser?.name ?? 'Organiser'

  function doImport() {
    if (!course || !layout) return
    const input = { course, layoutId: layout.layoutId, teeIds, fixes: { par: fixPar, si: fixSi }, importedBy: by, organizerId: adminUser?.organizationId }
    const r = conflict ? refreshCourse(conflict, input) : importCourse(input)
    if (r.ok) { setResult(r); setStep('done'); showToast(r.updated ? 'Course updated from the course database' : 'Course imported — ready for tournaments'); return }
    if (r.existing) { setConflict(r.existing); return }
    showToast(r.error, 'error')
  }

  return (
    <div className="page-in max-w-[1100px]">
      <BackLink label="Courses" onClick={() => navigate('/admin/courses')} />
      <PageHeader eyebrow={PROVIDER.name} title="Import a course"
        actions={<Button variant="secondary" onClick={() => navigate('/admin/courses/new')}>Add by hand instead</Button>} />

      <ol className="flex flex-wrap gap-2 mb-6" aria-label="Steps">
        {(['search', 'preview', 'review', 'done'] as Step[]).map((s, i) => (
          <li key={s} className={`h-9 px-4 rounded-full text-[13px] font-bold font-display inline-flex items-center gap-2 ${step === s ? 'bg-ink text-white' : 'bg-white text-gray-500 shadow-card'}`}>
            <span className={`w-5 h-5 rounded-full text-[11px] inline-flex items-center justify-center ${step === s ? 'bg-lime-400 text-ink' : 'bg-canvas'}`}>{i + 1}</span>
            {['Search', 'Preview', 'Review & import', 'Done'][i]}
          </li>
        ))}
      </ol>

      {step === 'search' && (
        <section className="bg-white rounded-[28px] shadow-card p-6">
          <form onSubmit={search} className="flex flex-wrap gap-3 items-end">
            <label className="flex-1 min-w-[260px] flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-gray-600 font-display">Course or club name</span>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Lakeview, Cedar Ridge, Harbourside" autoFocus
                className="h-12 rounded-2xl bg-canvas px-4 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-pine-400" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-gray-600 font-display">Country</span>
              <select value={country} onChange={e => setCountry(e.target.value)} className="h-12 rounded-2xl bg-canvas px-4 text-[14px] font-semibold text-ink">
                <option value="">Any</option>{providerCountries().map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <Button type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</Button>
          </form>
          <p className="text-[12px] text-gray-400 mt-2">Demo: search “timeout”, “busy” or “key” to see the error states; “Riverbend” has incomplete data.</p>

          {error && (
            <div role="alert" className="mt-5 rounded-2xl bg-rose-50 ring-1 ring-rose-200 p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]"><p className="font-display font-bold text-rose-800">{error.title}</p><p className="text-[13px] text-rose-700">{error.body}</p></div>
              {error.retry && <Button size="sm" variant="secondary" onClick={() => search()}>Try again</Button>}
              <Button size="sm" variant="ghost" onClick={() => navigate('/admin/courses/new')}>Add by hand</Button>
            </div>
          )}

          {busy && !course && <div className="mt-5 space-y-2"><SkeletonRow /><SkeletonRow /></div>}
          {hits && !busy && (hits.length === 0
            ? <div className="mt-4"><EmptyState title="No courses found" subtitle="Check the spelling or try the club’s name. You can always add the course by hand." action={{ label: 'Add by hand', onClick: () => navigate('/admin/courses/new') }} /></div>
            : (
              <ul className="mt-5 divide-y divide-black/[0.05] rounded-2xl ring-1 ring-black/[0.06]">
                {hits.map(h => (
                  <li key={h.providerCourseId} className="p-4 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[240px]">
                      <p className="font-display font-bold text-ink text-[15px]">{h.facility}</p>
                      <p className="text-[13px] text-gray-500">{h.city}, {h.region}, {h.country}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Provider reference {h.providerCourseId}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {h.layouts.map(l => {
                        const done = importedCourse(h.providerCourseId, l.layoutId)
                        return (
                          <Button key={l.layoutId} size="sm" variant={done ? 'ghost' : 'secondary'} onClick={() => open(h, l.layoutId)}>
                            {l.name} · {l.holes} holes{done ? ' · imported' : ''}
                          </Button>
                        )
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            ))}
          <p className="text-[11px] text-gray-400 mt-4">{PROVIDER.attribution}</p>
        </section>
      )}

      {(step === 'preview' || step === 'review') && course && layout && fixed && check && (
        <div className="space-y-5">
          <section className="bg-white rounded-[28px] shadow-card p-6">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex-1 min-w-[240px]">
                <p className="text-[12px] font-semibold text-pine-600 font-display">{course.city}, {course.region}, {course.country}</p>
                <h2 className="font-display font-extrabold text-ink text-[22px] tracking-tight">{course.facility}</h2>
                <p className="text-[13px] text-gray-500">{course.address ?? <>Address {MISSING}</>} · {course.postalCode ?? <>postal code {MISSING}</>} · {course.phone ?? <>phone {MISSING}</>}</p>
                <p className="text-[11px] text-gray-400 mt-1">{course.providerCourseId} · provider data updated {course.updatedAt} · {PROVIDER.attribution}</p>
              </div>
              {course.layouts.length > 1 && (
                <div className="flex gap-2">
                  {course.layouts.map(l => (
                    <button key={l.layoutId} onClick={() => { setLayoutId(l.layoutId); setTeeIds(l.tees.map(t => t.teeId)); setFixPar({}); setFixSi({}) }} aria-pressed={l.layoutId === layoutId}
                      className={`h-10 px-4 rounded-full text-[13px] font-bold font-display ${l.layoutId === layoutId ? 'bg-ink text-white' : 'bg-canvas text-ink'}`}>{l.name} · {l.holes}</button>
                  ))}
                </div>
              )}
            </div>
            {already && (
              <p className="mt-4 rounded-2xl bg-amber-50 text-amber-900 px-4 py-3 text-[13px]">
                <span className="font-bold">Already imported</span> as <a className="underline" href={`#/admin/courses/${already.id}`}>{already.name}</a> on {already.source?.importedAt.slice(0, 10)} by {already.source?.importedBy}. Importing again doesn’t create a copy — you can update it from the provider instead.
              </p>
            )}
            {similar && (
              <p className="mt-4 rounded-2xl bg-amber-50 text-amber-900 px-4 py-3 text-[13px]">
                <span className="font-bold">Looks like a course you already have:</span> <a className="underline" href={`#/admin/courses/${similar.id}`}>{similar.name}</a> (added by hand). Use that one, or import this as a separate course.
              </p>
            )}
          </section>

          <section className="bg-white rounded-[28px] shadow-card p-6">
            <h3 className="font-display font-bold text-ink text-[17px]">Tee sets</h3>
            <p className="text-[13px] text-gray-500 mb-3">Choose the tees to bring in. Ratings and slope the provider doesn’t have are marked.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] min-w-[560px]">
                <thead><tr className="text-[12px] text-gray-400 font-bold border-b border-black/[0.05]"><th className="py-2 pr-2">Import</th><th className="py-2 px-2">Tee</th><th className="py-2 px-2 text-right">Yards</th><th className="py-2 px-2 text-right">Men rating / slope</th><th className="py-2 px-2 text-right">Women rating / slope</th></tr></thead>
                <tbody>
                  {layout.tees.map(tee => (
                    <tr key={tee.teeId} className="border-b border-black/[0.05]">
                      <td className="py-2 pr-2"><input type="checkbox" aria-label={`Import ${tee.name} tees`} checked={teeIds.includes(tee.teeId)} onChange={e => setTeeIds(e.target.checked ? [...teeIds, tee.teeId] : teeIds.filter(x => x !== tee.teeId))} /></td>
                      <td className="py-2 px-2 font-semibold text-ink">{tee.name}</td>
                      <td className="py-2 px-2 text-right">{tee.yards.reduce((s, y) => s + y, 0).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right">{tee.menRating !== undefined ? `${tee.menRating} / ${tee.menSlope}` : MISSING}</td>
                      <td className="py-2 px-2 text-right">{tee.womenRating !== undefined ? `${tee.womenRating} / ${tee.womenSlope}` : MISSING}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white rounded-[28px] shadow-card p-6">
            <h3 className="font-display font-bold text-ink text-[17px]">Scorecard · {layout.holes} holes · par {fixed.scorecard.reduce((s, h) => s + (h.par ?? 0), 0)}</h3>
            <p className="text-[13px] text-gray-500 mb-3">{step === 'review' ? 'Fix the red cells — the provider’s value is kept on record next to yours.' : 'Hole, par, stroke index and yards for each tee.'}</p>
            <div className="overflow-x-auto">
              <table className="text-center text-[12px]">
                <tbody>
                  <tr><td className="pr-3 text-left font-bold text-gray-400">Hole</td>{fixed.scorecard.map(h => <td key={h.number} className="w-11 font-bold text-gray-400">{h.number}</td>)}</tr>
                  {(['par', 'si'] as const).map(k => {
                    const si = fixed.scorecard.map(h => h.si)
                    return (
                      <tr key={k}>
                        <td className="pr-3 text-left font-semibold text-ink whitespace-nowrap">{k === 'par' ? 'Par' : 'Stroke index'}</td>
                        {fixed.scorecard.map((h, i) => {
                          const v = k === 'par' ? h.par : h.si
                          const bad = k === 'par' ? !v || v < 3 || v > 6 : !v || si.indexOf(v) !== i || si.lastIndexOf(v) !== i
                          return (
                            <td key={h.number} className="py-0.5">
                              {step === 'review' && bad
                                ? <input aria-label={`${k === 'par' ? 'Par' : 'Stroke index'} hole ${h.number}`} type="number" value={v ?? ''} min={1} max={k === 'par' ? 6 : layout.holes}
                                    onChange={e => (k === 'par' ? setFixPar : setFixSi)(f => ({ ...f, [i]: Number(e.target.value) }))}
                                    className="w-10 h-8 rounded-lg bg-rose-50 ring-2 ring-rose-300 text-center font-bold text-ink" />
                                : <span className={`inline-flex w-10 h-8 items-center justify-center rounded-lg ${bad ? 'bg-rose-50 text-rose-700 ring-2 ring-rose-300 font-bold' : (k === 'par' ? fixPar[i] : fixSi[i]) !== undefined ? 'bg-lime-400/40 font-bold' : 'bg-canvas'}`}>{v ?? '?'}</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  {layout.tees.filter(t => teeIds.includes(t.teeId)).map(t => (
                    <tr key={t.teeId}><td className="pr-3 text-left text-gray-500 whitespace-nowrap">{t.name} yds</td>{t.yards.map((y, i) => <td key={i} className="text-gray-500">{y}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white rounded-[28px] shadow-card p-6 space-y-3">
            {check.errors.length > 0 && (
              <div className="rounded-2xl bg-rose-50 ring-1 ring-rose-200 p-4 text-[13px] text-rose-800">
                <p className="font-display font-bold mb-1">Fix before importing</p>
                <ul className="list-disc pl-5 space-y-0.5">{check.errors.map(e => <li key={e}>{e}</li>)}</ul>
              </div>
            )}
            {check.missing.length > 0 && (
              <div className="rounded-2xl bg-amber-50 p-4 text-[13px] text-amber-900">
                <p className="font-display font-bold mb-1">Not in the provider’s data (optional)</p>
                <ul className="list-disc pl-5 space-y-0.5">{check.missing.map(e => <li key={e}>{e}</li>)}</ul>
                <p className="mt-1">You can add these later in the course editor. Golfers without matching ratings use the tee’s other rating.</p>
              </div>
            )}
            {check.warnings.map(w => <p key={w} className="rounded-2xl bg-canvas p-3 text-[13px] text-gray-700">{w}</p>)}
            {conflict && (
              <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4 text-[13px] text-amber-900">
                <p className="font-display font-bold">This layout is already imported as {conflict.name}.</p>
                <p className="mt-0.5">Update it from the provider instead? Changed ratings or scorecard become a new course version from today; tournaments already played keep the old one.{liveOn(conflict.id).length ? ` Not possible while ${liveOn(conflict.id)[0].name} is in progress.` : ''}</p>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" onClick={doImport} disabled={!!liveOn(conflict.id).length}>Update {conflict.name}</Button>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/courses/${conflict.id}`)}>Open it</Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setStep('search'); setCourse(null) }}>Back to results</Button>
              {step === 'preview'
                ? <Button onClick={() => setStep('review')}>Continue to review</Button>
                : <Button onClick={already && !conflict ? () => setConflict(already) : doImport} disabled={check.errors.length > 0}>{already ? 'Update existing course…' : `Import ${teeIds.length} tee set${teeIds.length === 1 ? '' : 's'}`}</Button>}
            </div>
          </section>
        </div>
      )}

      {step === 'done' && result && (
        <section className="bg-white rounded-[28px] shadow-card p-8 text-center">
          <span className="inline-flex w-14 h-14 rounded-full bg-lime-400 items-center justify-center text-[26px]">✓</span>
          <h2 className="font-display font-extrabold text-ink text-[22px] mt-3">{result.updated ? 'Course updated' : 'Course imported'}</h2>
          <p className="text-[14px] text-gray-600 mt-1">{result.course.name} · {result.course.holes} holes · par {result.course.par} · {result.course.teeSets?.length} tee sets{result.updated ? ` · version ${result.course.version}` : ''}</p>
          <p className="text-[12px] text-gray-400 mt-1">Source {result.course.source?.providerCourseId} · {result.course.source?.filledByHand ? `fixed by hand: ${result.course.source.filledByHand.join(', ')}` : 'no manual fixes'}</p>
          <span className={`${CHIP} bg-emerald-50 text-emerald-700 mt-3`}>Active — can be chosen for tournaments</span>
          <div className="flex flex-wrap gap-2 justify-center mt-5">
            <Button onClick={() => navigate('/admin/tournaments/new')}>Create a tournament on it</Button>
            <Button variant="secondary" onClick={() => navigate(`/admin/courses/${result.course.id}`)}>Open in course editor</Button>
            <Button variant="ghost" onClick={() => { setStep('search'); setCourse(null); setResult(null); setConflict(null) }}>Import another</Button>
          </div>
        </section>
      )}
    </div>
  )
}
