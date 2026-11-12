import { useMemo, useState } from 'react'
import type { Tournament } from '../types'
import { Button, Input } from '../components'
import { Textarea } from './forms'
import { useApp } from '../app-context'
import { useLiveVersion } from '../live'
import { decidesPlay, type Actor } from '../ops'
import { Modal, Panel, fmtTime } from '../ops-ui'
import {
  ANNOUNCEMENT_LIMITS, NOTIFY_LABEL, announcementsFor, audienceFor, canAnnounce, deliveriesFor, deliverySummary, eventsFor, payloadOf, pushReach, sendAnnouncement,
  useNotifyVersion, type Audience, type DeliverySummary, type NotifyEvent,
} from '../notify'

/*
 * Sprint 4 · AN1 + section 7: the organiser's announcements and the alerts the system sent for this tournament.
 * Compose → pick the audience → see how many people it reaches → send once (idempotent) → follow email and push
 * delivery separately. API: POST/GET /tournaments/{id}/announcements, GET /tournaments/{id}/notifications.
 */

const CHIP = 'inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-bold font-display whitespace-nowrap'
const AUDIENCE_LABEL: Record<Audience, string> = { golfers: 'Golfers', staff: 'Marshals & officials', both: 'Golfers and staff' }

function DeliveryChips({ s, channel }: { s: DeliverySummary; channel: 'Email' | 'Push' }) {
  if (!s.total) return <span className="text-[12px] text-gray-400">{channel}: —</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="text-[12px] font-semibold text-gray-500 mr-0.5">{channel}</span>
      {s.accepted > 0 && <span className={`${CHIP} bg-emerald-50 text-emerald-700`}>{s.accepted} accepted</span>}
      {s.pending > 0 && <span className={`${CHIP} bg-amber-50 text-amber-700`}>{s.pending} sending…</span>}
      {s.failed > 0 && <span className={`${CHIP} bg-rose-50 text-rose-700`}>{s.failed} failed</span>}
      {s.skipped > 0 && <span className={`${CHIP} bg-canvas text-gray-500`} title="No app with alerts on — they still get the email">{s.skipped} no app</span>}
    </span>
  )
}

function ComposeModal({ t, actor, onClose }: { t: Tournament; actor: Actor; onClose: () => void }) {
  const { showToast } = useApp()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<Audience>('golfers')
  const [step, setStep] = useState<'write' | 'preview'>('write')
  const [errors, setErrors] = useState<{ title?: string; body?: string; audience?: string; form?: string }>({})
  const [sending, setSending] = useState(false)
  // One key per compose: a double click or a retry after a network error can't send twice
  const [key] = useState(() => `ann-${t.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  const recipients = useMemo(() => audienceFor(t, audience), [t, audience])
  const golfers = recipients.filter(r => r.kind === 'golfer').length
  const staff = recipients.length - golfers
  const withApp = pushReach(recipients)

  function preview() {
    const e: typeof errors = {}
    if (!title.trim()) e.title = 'Add a title'
    else if (title.trim().length > ANNOUNCEMENT_LIMITS.title) e.title = `Keep it under ${ANNOUNCEMENT_LIMITS.title} characters`
    if (!body.trim()) e.body = 'Write the message'
    else if (body.trim().length > ANNOUNCEMENT_LIMITS.body) e.body = `Keep it under ${ANNOUNCEMENT_LIMITS.body} characters`
    if (!recipients.length) e.audience = 'Nobody to send to for this audience yet'
    setErrors(e)
    if (!Object.keys(e).length) setStep('preview')
  }

  function send() {
    if (sending) return
    setSending(true)
    const r = sendAnnouncement(t, { title, body, audience }, actor, key)
    setSending(false)
    if (!r.ok) { setErrors({ [r.field ?? 'form']: r.error }); setStep('write'); return }
    showToast(r.duplicate ? 'Already sent — nothing was sent twice' : `Sent to ${r.announcement.counts.golfers + r.announcement.counts.staff} people by email and app`)
    onClose()
  }

  return (
    <Modal title={step === 'write' ? 'New announcement' : 'Check and send'} subtitle={step === 'write' ? `To people in ${t.name}. Sent by email, and as an app alert to anyone with alerts on.` : 'This is what people receive. You can’t edit or unsend it afterwards.'}
      onClose={onClose}
      footer={step === 'write'
        ? <><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth onClick={preview}>Preview</Button></>
        : <><Button variant="secondary" fullWidth onClick={() => setStep('write')}>Back to edit</Button><Button fullWidth onClick={send} disabled={sending}>{sending ? 'Sending…' : `Send to ${recipients.length}`}</Button></>}>
      {step === 'write' ? (
        <>
          <div>
            <p className="text-[13px] font-semibold text-gray-600 font-display mb-1.5">Send to</p>
            <div className="grid grid-cols-3 gap-2">
              {(['golfers', 'staff', 'both'] as Audience[]).map(a => {
                const n = audienceFor(t, a).length
                return (
                  <button key={a} type="button" onClick={() => { setAudience(a); setErrors({ ...errors, audience: undefined }) }} aria-pressed={audience === a}
                    className={`rounded-2xl px-3 py-2.5 text-left ring-1 ${audience === a ? 'bg-ink text-white ring-ink' : 'bg-white text-ink ring-black/[0.08] hover:bg-canvas'}`}>
                    <span className="block text-[13px] font-bold font-display">{AUDIENCE_LABEL[a]}</span>
                    <span className={`block text-[12px] ${audience === a ? 'text-white/70' : 'text-gray-500'}`}>{n} {n === 1 ? 'person' : 'people'}</span>
                  </button>
                )
              })}
            </div>
            {errors.audience && <p className="text-xs text-red-500 font-medium mt-1">{errors.audience}</p>}
          </div>
          <Input label={`Title (${title.trim().length}/${ANNOUNCEMENT_LIMITS.title})`} placeholder="e.g. Shotgun start moved to 8:30" value={title} error={errors.title}
            onChange={e => { setTitle(e.target.value); setErrors({ ...errors, title: undefined }) }} />
          <Textarea label={`Message (${body.trim().length}/${ANNOUNCEMENT_LIMITS.body})`} rows={5} placeholder="What do people need to know or do?" value={body} error={errors.body}
            onChange={e => { setBody(e.target.value); setErrors({ ...errors, body: undefined }) }} />
          {errors.form && <p className="rounded-2xl bg-rose-50 text-rose-800 text-[13px] px-4 py-3">{errors.form}</p>}
          <p className="text-[12px] text-gray-500">Don’t include private details (medical, disciplinary). Announcements aren’t for marketing.</p>
        </>
      ) : (
        <>
          <div className="rounded-2xl bg-canvas p-4">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">App alert</p>
            <div className="mt-2 rounded-2xl bg-white shadow-card p-3">
              <p className="text-[12px] text-gray-400 font-semibold">Golf · now</p>
              <p className="text-[14px] font-bold font-display text-ink">{title.trim()}</p>
              <p className="text-[13px] text-gray-600 line-clamp-2">{body.trim()}</p>
            </div>
          </div>
          <div className="rounded-2xl bg-canvas p-4">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Email</p>
            <p className="text-[13px] text-gray-500 mt-1">Subject: <span className="text-ink font-semibold">{t.name}: {title.trim()}</span></p>
            <p className="text-[13px] text-ink mt-2 whitespace-pre-line">{body.trim()}</p>
            <p className="text-[12px] text-gray-400 mt-3">— {actor.name}, {t.name}</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] py-2.5"><dt className="text-[11px] text-gray-500 font-semibold">Golfers</dt><dd className="font-display font-extrabold text-[22px] text-ink">{golfers}</dd></div>
            <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] py-2.5"><dt className="text-[11px] text-gray-500 font-semibold">Staff</dt><dd className="font-display font-extrabold text-[22px] text-ink">{staff}</dd></div>
            <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] py-2.5"><dt className="text-[11px] text-gray-500 font-semibold">With app alerts</dt><dd className="font-display font-extrabold text-[22px] text-ink">{withApp}</dd></div>
          </dl>
          <p className="text-[12px] text-gray-500">Everyone gets the email. {recipients.length - withApp} {recipients.length - withApp === 1 ? 'person has' : 'people have'} no app with alerts on, so they get email only.</p>
        </>
      )}
    </Modal>
  )
}

function EventDetail({ e, onClose }: { e: NotifyEvent; onClose: () => void }) {
  const rows = deliveriesFor(e.id)
  return (
    <Modal title={e.title} subtitle={`${NOTIFY_LABEL[e.kind]} · ${fmtTime(e.createdAt)}${e.by ? ` · by ${e.by.name}` : ''}`} onClose={onClose}
      footer={<Button variant="secondary" fullWidth onClick={onClose}>Close</Button>}>
      <p className="text-[14px] text-ink whitespace-pre-line">{e.body}</p>
      <div className="rounded-2xl bg-canvas p-3">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Push payload (v1 — ids only)</p>
        <pre className="text-[12px] text-gray-700 whitespace-pre-wrap">{JSON.stringify(payloadOf(e), null, 2)}</pre>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-2xl ring-1 ring-black/[0.06]">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 bg-white"><tr className="text-gray-400 font-bold"><th className="px-3 py-2">Recipient</th><th className="px-2 py-2">Channel</th><th className="px-2 py-2">State</th><th className="px-3 py-2">Note</th></tr></thead>
          <tbody>
            {rows.map(d => (
              <tr key={d.id} className="border-t border-black/[0.05]">
                <td className="px-3 py-1.5 text-ink font-semibold">{d.name}</td>
                <td className="px-2 py-1.5 text-gray-600">{d.channel === 'email' ? 'Email' : 'Push'}</td>
                <td className="px-2 py-1.5"><span className={`${CHIP} ${d.state === 'accepted' ? 'bg-emerald-50 text-emerald-700' : d.state === 'failed' ? 'bg-rose-50 text-rose-700' : d.state === 'skipped' ? 'bg-canvas text-gray-500' : 'bg-amber-50 text-amber-700'}`}>{d.state}</span></td>
                <td className="px-3 py-1.5 text-gray-500">{d.error ?? (d.attempts > 1 ? `${d.attempts} attempts` : '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-gray-500">“Accepted” means the email server or Apple / Google took the message — not that the person has read it.</p>
    </Modal>
  )
}

export function AnnouncementsBoard({ t, actor }: { t: Tournament; actor: Actor }) {
  useNotifyVersion()
  useLiveVersion()
  const [composing, setComposing] = useState(false)
  const [detail, setDetail] = useState<NotifyEvent | null>(null)
  const list = announcementsFor(t.id)
  const events = eventsFor(t.id)
  const allowed = decidesPlay(actor)

  return (
    <div className="space-y-6">
      <Panel flush title="Announcements" subtitle="Messages from you to the field and staff. Email to everyone; an app alert to anyone with alerts on."
        aside={allowed && (canAnnounce(t)
          ? <Button size="sm" onClick={() => setComposing(true)}>New announcement</Button>
          : <span className="text-[12px] text-gray-500">Drafts and cancelled tournaments can’t send announcements</span>)}>
        {list.length === 0 ? <p className="text-[14px] text-gray-500 py-8 text-center">No announcements yet.</p> : (
          <ul className="divide-y divide-black/[0.05] border-t border-black/[0.05]">
            {list.map(a => {
              const ev = events.find(e => e.id === a.eventId)
              return (
                <li key={a.id} className="px-6 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-bold text-ink text-[15px]">{a.title}</p>
                      <p className="text-[13px] text-gray-600 line-clamp-2 whitespace-pre-line">{a.body}</p>
                      <p className="text-[12px] text-gray-400 mt-1">{fmtTime(a.sentAt)} · {a.sentBy.name} · {AUDIENCE_LABEL[a.audience]} ({a.counts.golfers + a.counts.staff})</p>
                    </div>
                    {ev && <Button size="sm" variant="ghost" onClick={() => setDetail(ev)}>Delivery</Button>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    <DeliveryChips s={deliverySummary(a.eventId, 'email')} channel="Email" />
                    <DeliveryChips s={deliverySummary(a.eventId, 'push')} channel="Push" />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel flush title="Alerts sent for this tournament" subtitle="Tee-time changes, play suspended / resumed, staff invitations and registrations — sent automatically once the change is saved.">
        {events.filter(e => e.kind !== 'announcement').length === 0 ? <p className="text-[14px] text-gray-500 py-8 text-center">Nothing sent yet. Moving a player to another tee time, or suspending play, sends an alert.</p> : (
          <ul className="divide-y divide-black/[0.05] border-t border-black/[0.05]">
            {events.filter(e => e.kind !== 'announcement').map(e => (
              <li key={e.id} className="px-6 py-3 flex flex-wrap items-center gap-3">
                <span className={`${CHIP} bg-canvas text-gray-600`}>{NOTIFY_LABEL[e.kind]}</span>
                <span className="flex-1 min-w-[200px]">
                  <span className="block text-[14px] text-ink font-semibold">{e.title}</span>
                  <span className="block text-[12px] text-gray-500">{fmtTime(e.createdAt)} · {e.recipients.length} recipient{e.recipients.length === 1 ? '' : 's'}</span>
                </span>
                <DeliveryChips s={deliverySummary(e.id, 'email')} channel="Email" />
                <DeliveryChips s={deliverySummary(e.id, 'push')} channel="Push" />
                <Button size="sm" variant="ghost" onClick={() => setDetail(e)}>Details</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {composing && <ComposeModal t={t} actor={actor} onClose={() => setComposing(false)} />}
      {detail && <EventDetail e={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
