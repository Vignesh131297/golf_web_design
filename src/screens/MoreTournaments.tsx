import { IconPin } from '../components'
import { MOCK_PROFILE, MOCK_TOURNAMENTS } from '../data'
import { isPublicTournament } from '../admin/access'
import { hasShownInterest, showInterest, useOpsVersion } from '../ops'
import { myEntry } from '../live'
import { useApp } from '../app-context'
import { navigate } from '../router'

/**
 * Other tournaments we run (client, 21 Oct call): we promote our own events, never the course's other
 * events. "I'm interested" sends the signed-in golfer's name and contact details to that organiser.
 */
export default function MoreTournaments({ excludeId, excludeCourseId }: { excludeId?: string; excludeCourseId?: string }) {
  useOpsVersion()
  const { showToast } = useApp()
  const me = { name: `${MOCK_PROFILE.firstName} ${MOCK_PROFILE.lastName}`, email: MOCK_PROFILE.email, phone: MOCK_PROFILE.phone }
  const others = MOCK_TOURNAMENTS
    .filter(t => isPublicTournament(t) && t.id !== excludeId && t.courseId !== excludeCourseId)
    .filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    // Not the ones they've already entered
    .filter(t => myEntry(t.id)?.status !== 'registered')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 3)
  if (!others.length) return null

  return (
    <section>
      <h2 className="font-display font-bold text-ink text-[18px] tracking-tight">More tournaments on our platform</h2>
      <p className="text-[13px] text-gray-500 mt-0.5 mb-3">Like the look of one? Tap “I’m interested” and its organiser will get in touch.</p>
      <div className="space-y-3">
        {others.map(t => {
          const sent = hasShownInterest(t.id, me.email)
          return (
            <div key={t.id} className="bg-white rounded-3xl shadow-card p-3 flex items-center gap-3.5">
              <button onClick={() => navigate(`/tournaments/${t.id}`)} className="relative w-[64px] h-[64px] rounded-2xl overflow-hidden flex-shrink-0 bg-canvas" aria-label={`Open ${t.name}`}>
                <img src={t.imageUrl} alt="" className="w-full h-full object-cover" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold font-display text-pine-500">{t.dateRange}</p>
                <button onClick={() => navigate(`/tournaments/${t.id}`)} className="block text-left font-display font-bold text-ink text-[14px] leading-snug tracking-tight line-clamp-2 hover:underline">{t.name}</button>
                <span className="flex items-center gap-1 mt-0.5 text-xs text-gray-500 truncate"><IconPin />{t.city}</span>
              </div>
              <button
                disabled={sent}
                onClick={() => { showInterest(t.id, me); showToast(`Sent — the organiser of ${t.name} will contact you`) }}
                className={`h-9 px-3.5 rounded-full text-[12px] font-bold font-display flex-shrink-0 ${sent ? 'bg-pine-50 text-pine-700' : 'bg-ink text-white hover:bg-pine-900'}`}>
                {sent ? 'Interest sent ✓' : 'I’m interested'}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
