import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { PageHeader } from '../shell'
import { Button, Input, SelectField, ChoiceChips, EmptyState } from '../components'
import { useApp } from '../app-context'
import { MOCK_COURSES, MOCK_TOURNAMENTS } from '../data'
import { useDataVersion } from '../store'
import { NoAccess, ORG_STATUS_STYLE } from './AdminShell'
import {
  getOrganizations, getUser, updateOrganization, setOrganizationStatus, useAccessVersion, visibleUsers, allowedStatusMoves, reviewChecklist,
  ORG_TYPES, EVENTS_PER_YEAR, FIELD_SIZES, type Organization, type OrgStatus, type OrgType,
} from './access'
import { COUNTRIES, postalCodeError } from '../account-rules'
import { Textarea } from './forms'

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function StatusChip({ status }: { status: OrgStatus }) {
  const s = ORG_STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] font-bold font-display ${s.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
    </span>
  )
}

function Row({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="flex justify-between gap-6 py-3">
      <dt className="text-[14px] text-gray-500 flex-shrink-0">{label}</dt>
      <dd className="text-[14px] font-semibold text-ink text-right truncate">{value || '—'}</dd>
    </div>
  )
}

/* ───────── Organisation profile (organiser side) ───────── */

export function AdminOrganisation() {
  useAccessVersion()
  useDataVersion()
  const { can, adminUser, adminOrg, showToast } = useApp()
  const [editing, setEditing] = useState(false)

  if (!adminOrg) return <NoAccess what="view an organisation profile (you're platform staff)" />
  if (!can('organisation.view')) return <NoAccess what="view your organisation profile" />

  const org = adminOrg
  const owner = getUser(org.ownerUserId)
  const team = visibleUsers(adminUser)
  const events = MOCK_TOURNAMENTS.filter(t => t.organizerId === org.id)
  const live = events.filter(t => t.status !== 'draft').length
  const homeCourse = MOCK_COURSES.find(c => c.id === org.homeCourseId)?.name

  const statusCopy: Record<OrgStatus, string> = {
    pending: org.emailVerified
      ? 'Our team is reviewing your details — usually within 2 business days. Meanwhile you can complete this profile and prepare draft tournaments.'
      : 'Verify your email first (see the banner above) — our team can only approve verified organisations.',
    approved: 'Your organisation is approved. Tournaments you publish are visible to golfers.',
    rejected: org.statusReason ? `Not approved: ${org.statusReason}` : 'Your application was not approved.',
    suspended: org.statusReason ? `Suspended: ${org.statusReason}` : 'Your organisation is suspended.',
  }

  return (
    <div className="page-in">
      <PageHeader
        eyebrow="Organisation"
        title={org.name}
        actions={can('organisation.edit') && !editing && <Button variant="secondary" onClick={() => setEditing(true)}>Edit details</Button>}
      />

      <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] gap-6 items-start">
        <aside className="lg:sticky lg:top-8 space-y-5">
          <section className="bg-ink rounded-[28px] p-6 text-white relative overflow-hidden">
            <div className="absolute inset-y-0 right-0 w-[70%] pointer-events-none"
              style={{ background: 'linear-gradient(90deg, rgba(200,236,90,0) 0%, rgba(200,236,90,0.12) 40%, rgba(200,236,90,0.26) 100%)' }} />
            <p className="relative text-white/55 text-[13px] font-semibold font-display">Review status</p>
            <div className="relative mt-2"><StatusChip status={org.status} /></div>
            <p className="relative text-[13px] text-white/70 leading-relaxed mt-4">{statusCopy[org.status]}</p>
            <p className="relative text-[12px] text-white/40 mt-4">Submitted {formatDate(org.createdAt)}</p>
          </section>
          <section className="bg-white rounded-[28px] shadow-card p-6 grid grid-cols-3 gap-2 text-center">
            {[[events.length, 'Events'], [live, 'Published'], [team.length, 'Team']].map(([v, l]) => (
              <div key={String(l)} className="bg-canvas rounded-2xl py-3">
                <p className="font-display font-extrabold text-ink text-[22px] leading-none">{v}</p>
                <p className="text-[11px] font-semibold text-gray-500 mt-1.5">{l}</p>
              </div>
            ))}
          </section>
        </aside>

        {editing ? (
          <OrgForm org={org} onDone={saved => { setEditing(false); if (saved) showToast('Organisation details saved') }} />
        ) : (
          <div className="grid md:grid-cols-2 gap-6 items-start">
            <section className="bg-white rounded-[28px] shadow-card px-6 pt-5 pb-2">
              <h2 className="font-display font-bold text-ink text-[17px] tracking-tight mb-1">Details</h2>
              <dl className="divide-y divide-black/[0.05]">
                <Row label="Type" value={org.type} />
                <Row label="Address" value={[org.street, org.city, org.region, org.postalCode].filter(Boolean).join(', ')} />
                <Row label="Country" value={org.country} />
                <Row label="Home course" value={homeCourse} />
                <Row label="Events per year" value={org.eventsPerYear} />
                <Row label="Typical field size" value={org.fieldSize} />
                <Row label="Registration number" value={org.registrationNumber} />
                <Row label="Golf Canada ID" value={org.golfCanadaId} />
              </dl>
            </section>
            <section className="bg-white rounded-[28px] shadow-card px-6 pt-5 pb-2">
              <h2 className="font-display font-bold text-ink text-[17px] tracking-tight mb-1">Contact</h2>
              <dl className="divide-y divide-black/[0.05]">
                <Row label="Email" value={org.email} />
                <Row label="Phone" value={org.phone} />
                <Row label="Website" value={org.website} />
                <Row label="Owner" value={owner ? `${owner.name}${owner.jobTitle ? ` · ${owner.jobTitle}` : ''}` : undefined} />
                <Row label="Owner email" value={owner ? `${owner.email}${org.emailVerified ? ' · verified' : ' · not verified'}` : undefined} />
              </dl>
              {org.about && <p className="text-[13px] text-gray-600 leading-relaxed py-3 border-t border-black/[0.05]">{org.about}</p>}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function OrgForm({ org, onDone }: { org: Organization; onDone: (saved: boolean) => void }) {
  const { adminUser } = useApp()
  const [name, setName]       = useState(org.name)
  const [type, setType]       = useState<OrgType>(org.type)
  const [email, setEmail]     = useState(org.email)
  const [phone, setPhone]     = useState(org.phone)
  const [website, setWebsite] = useState(org.website ?? '')
  const [about, setAbout]     = useState(org.about ?? '')
  const [logo, setLogo]       = useState(org.logoUrl ?? '')
  const [street, setStreet]   = useState(org.street ?? '')
  const [postal, setPostal]   = useState(org.postalCode ?? '')
  const [regNo, setRegNo]     = useState(org.registrationNumber ?? '')
  const [gcId, setGcId]       = useState(org.golfCanadaId ?? '')
  const [fieldSize, setField] = useState(org.fieldSize ?? '')
  const [city, setCity]       = useState(org.city)
  const [region, setRegion]   = useState(org.region)
  const [country, setCountry] = useState(org.country)
  const [home, setHome]       = useState(org.homeCourseId ?? '')
  const [events, setEvents]   = useState(org.eventsPerYear ?? '')
  const [error, setError]     = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !postal.trim()) { setError('Name and postal code are required'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid contact email'); return }
    const postalErr = postalCodeError(country, postal)
    if (postalErr) { setError(postalErr); return }
    const r = updateOrganization(adminUser, org.id, {
      name: name.trim(), type, email: email.trim(), phone: phone.trim(),
      website: website.trim().replace(/^https?:\/\//, '') || undefined,
      street: street.trim(), city: city.trim(), region: region.trim(), postalCode: postal.trim().toUpperCase(), country,
      homeCourseId: home || undefined, eventsPerYear: events || undefined, fieldSize: fieldSize || undefined,
      about: about.trim() || undefined, logoUrl: logo.trim() || undefined,
      registrationNumber: regNo.trim() || undefined, golfCanadaId: gcId.trim() || undefined,
    })
    if (!r.ok) { setError(r.reason); return }
    onDone(true)
  }

  return (
    <form onSubmit={submit} noValidate className="bg-white rounded-[28px] shadow-card p-6 space-y-5">
      {error && <div role="alert" className="bg-rose-50 text-rose-700 rounded-2xl px-4 py-3 text-sm font-semibold font-display">{error}</div>}
      <Input label="Organisation name" value={name} onChange={e => { setName(e.target.value); setError('') }} />
      <ChoiceChips label="Organisation type" options={ORG_TYPES} value={type} onChange={v => setType(v as OrgType)} />
      <Textarea label="About the organisation" value={about} onChange={e => setAbout(e.target.value)} style={{ minHeight: 90 }} />
      <Input label="Logo link" placeholder="https://…" value={logo} onChange={e => setLogo(e.target.value)} />
      <div className="grid sm:grid-cols-2 gap-5">
        <Input label="Contact email" type="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }} />
        <Input label="Contact phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
      </div>
      <Input label="Website" value={website} onChange={e => setWebsite(e.target.value)} placeholder="yourclub.com" />
      <Input label="Street address" value={street} onChange={e => { setStreet(e.target.value); setError('') }} />
      <div className="grid sm:grid-cols-2 gap-5">
        <Input label="City" value={city} onChange={e => { setCity(e.target.value); setError('') }} />
        <Input label="Province / state" value={region} onChange={e => { setRegion(e.target.value); setError('') }} />
        <Input label="Postal / ZIP code *" value={postal} onChange={e => { setPostal(e.target.value.toUpperCase()); setError('') }} />
        <SelectField label="Country" value={country} onChange={setCountry} options={COUNTRIES} />
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <Input label="Business / charity registration number" value={regNo} onChange={e => setRegNo(e.target.value)} />
        <Input label="Golf Canada club / facility ID" value={gcId} onChange={e => setGcId(e.target.value)} />
      </div>
      <SelectField label="Home course" placeholder="None" value={home} onChange={setHome} options={MOCK_COURSES.filter(c => (c.lifecycle ?? 'active') === 'active').map(c => ({ value: c.id, label: c.name }))} />
      <ChoiceChips label="Tournaments per year" options={EVENTS_PER_YEAR} value={events} onChange={v => setEvents(v as string)} />
      <ChoiceChips label="Typical field size" options={FIELD_SIZES} value={fieldSize} onChange={v => setField(v as string)} />
      <div className="flex gap-2.5 pt-2">
        <Button variant="secondary" onClick={() => onDone(false)}>Cancel</Button>
        <Button type="submit">Save details</Button>
      </div>
    </form>
  )
}

/* ───────── Organizers review queue (platform side) ───────── */

function ReasonModal({ title, action, onCancel, onConfirm }: { title: string; action: string; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 fade-in" onClick={onCancel} />
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
        <form
          role="dialog" aria-modal="true" aria-label={title}
          onSubmit={e => { e.preventDefault(); if (!reason.trim()) return setError('Give a reason so the organiser knows what to fix'); onConfirm(reason.trim()) }}
          className="pointer-events-auto bg-white rounded-[28px] shadow-2xl w-full max-w-[480px] p-7 fade-in-up"
        >
          <h2 className="font-display font-bold text-ink text-[20px] tracking-tight">{title}</h2>
          <p className="text-sm text-gray-500 mt-1">The organiser sees this reason when they try to sign in.</p>
          <textarea
            autoFocus
            aria-label="Reason"
            value={reason}
            onChange={e => { setReason(e.target.value); setError('') }}
            placeholder="e.g. We couldn't verify the club's registration details."
            className={`mt-5 w-full min-h-[110px] rounded-2xl px-4 py-3 text-[15px] leading-relaxed border ${error ? 'bg-red-50/60 border-red-300' : 'bg-canvas border-transparent focus:bg-white focus:border-pine-400'} focus:outline-none`}
          />
          {error && <p className="text-xs text-red-500 font-medium mt-1.5">{error}</p>}
          <div className="flex gap-2.5 mt-6">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <button type="submit" className="flex-1 h-[52px] rounded-full bg-rose-600 text-white text-[15px] font-bold font-display hover:bg-rose-700">{action}</button>
          </div>
        </form>
      </div>
    </>
  )
}

const TABS: { value: OrgStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

export function AdminOrganizers() {
  useAccessVersion()
  useDataVersion()
  const { can, adminUser, adminOrg, showToast } = useApp()
  const [tab, setTab] = useState<OrgStatus | 'all'>('pending')
  const [asking, setAsking] = useState<{ org: Organization; status: 'rejected' | 'suspended' } | null>(null)

  if (adminOrg || !can('organizers.view')) return <NoAccess what="review organisers" />

  const all = getOrganizations()
  // Oldest first, so nobody waits longest
  const list = all.filter(o => tab === 'all' || o.status === tab).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const canApprove = can('organizers.approve')

  function setStatus(org: Organization, status: OrgStatus, reason?: string) {
    const r = setOrganizationStatus(adminUser, org.id, status, reason)
    if (!r.ok) return showToast(r.reason, 'error')
    const verb = { approved: 'approved', rejected: 'rejected', suspended: 'suspended', pending: 'moved to pending' }[status]
    showToast(`${org.name} ${verb}`, status === 'approved' ? 'success' : 'info')
  }

  return (
    <div className="page-in">
      <PageHeader eyebrow="Platform" title="Organizers" />
      <p className="text-gray-500 -mt-4 mb-6 max-w-2xl">
        Organisations sign up themselves. Check each one against the checklist before their tournaments can go live — a registration is decided once. Suspending an organisation hides its events from golfers and blocks its team from signing in; every decision is recorded.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {TABS.map(t => {
          const n = t.value === 'all' ? all.length : all.filter(o => o.status === t.value).length
          return (
            <button key={t.value} onClick={() => setTab(t.value)} aria-pressed={tab === t.value}
              className={`h-9 px-4 rounded-full text-[13px] font-semibold font-display inline-flex items-center gap-2 ${tab === t.value ? 'bg-ink text-white' : 'bg-white text-gray-600 shadow-card hover:text-ink'}`}>
              {t.label}
              <span className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold inline-flex items-center justify-center ${tab === t.value ? 'bg-lime-400 text-ink' : 'bg-canvas text-gray-500'}`}>{n}</span>
            </button>
          )
        })}
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-[28px] shadow-card">
          <EmptyState title={tab === 'pending' ? 'Nothing to review' : 'No organisations here'} subtitle={tab === 'pending' ? 'New organiser sign-ups will appear here.' : 'Try another tab.'} />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          {list.map(org => {
            const owner = getUser(org.ownerUserId)
            const events = MOCK_TOURNAMENTS.filter(t => t.organizerId === org.id)
            const drafts = events.filter(t => t.status === 'draft').length
            return (
              <article key={org.id} className="bg-white rounded-[28px] shadow-card p-6 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-ink text-[19px] tracking-tight">{org.name}</h2>
                    <p className="text-[13px] text-gray-500">{org.type} · {org.city}, {org.region}, {org.country}</p>
                    {org.about && <p className="text-[13px] text-gray-600 mt-1 line-clamp-2">{org.about}</p>}
                  </div>
                  <StatusChip status={org.status} />
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5 text-[13px]">
                  <div><dt className="text-gray-400 font-semibold font-display text-[11px]">Owner</dt><dd className="text-ink font-semibold truncate">{owner?.name ?? '—'}{owner?.jobTitle ? ` · ${owner.jobTitle}` : ''}</dd><dd className="text-gray-500 truncate">{owner?.email}</dd></div>
                  <div><dt className="text-gray-400 font-semibold font-display text-[11px]">Contact</dt><dd className="text-ink font-semibold truncate">{org.email}</dd><dd className="text-gray-500">{org.phone}</dd></div>
                  <div><dt className="text-gray-400 font-semibold font-display text-[11px]">Website</dt><dd className="text-ink truncate">{org.website ?? '—'}</dd></div>
                  <div><dt className="text-gray-400 font-semibold font-display text-[11px]">Events</dt><dd className="text-ink">{events.length} total{drafts ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : ''} · {org.eventsPerYear ?? '?'} / year{org.fieldSize ? ` · ${org.fieldSize} players` : ''}</dd></div>
                  <div className="col-span-2"><dt className="text-gray-400 font-semibold font-display text-[11px]">Address</dt><dd className="text-ink">{[org.street, org.city, org.region, org.postalCode, org.country].filter(Boolean).join(', ')}</dd></div>
                  <div><dt className="text-gray-400 font-semibold font-display text-[11px]">Registration number</dt><dd className="text-ink truncate">{org.registrationNumber ?? '—'}</dd></div>
                  <div><dt className="text-gray-400 font-semibold font-display text-[11px]">Golf Canada ID</dt><dd className="text-ink truncate">{org.golfCanadaId ?? '—'}</dd></div>
                </dl>

                {org.status === 'pending' && (
                  <ul className="mt-5 bg-canvas rounded-2xl p-4 space-y-1.5" aria-label="Review checklist">
                    {reviewChecklist(org).map(item => (
                      <li key={item.label} className="flex items-start gap-2 text-[13px]">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${item.ok ? 'bg-pine-600 text-white' : 'bg-amber-400 text-ink'}`}>{item.ok ? '✓' : '!'}</span>
                        <span className={item.ok ? 'text-ink' : 'text-amber-800'}>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {!!org.decisions?.length && (
                  <details className="mt-4 text-[12px] text-gray-500">
                    <summary className="cursor-pointer font-bold font-display text-gray-600">History ({org.decisions.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {org.decisions.map((d, i) => (
                        <li key={i}>{ORG_STATUS_STYLE[d.status].label} by {getUser(d.byUserId)?.name ?? 'platform'} · {formatDate(d.at)}{d.reason ? ` — ${d.reason}` : ''}</li>
                      ))}
                    </ul>
                  </details>
                )}

                {org.statusReason && (org.status === 'rejected' || org.status === 'suspended') && (
                  <p className="mt-4 text-[13px] bg-canvas rounded-2xl px-4 py-3 text-gray-600"><span className="font-semibold text-ink">Reason:</span> {org.statusReason}</p>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-auto pt-5">
                  <span className="text-[12px] text-gray-400 mr-auto">Submitted {formatDate(org.createdAt)}</span>
                  {canApprove && allowedStatusMoves(org).includes('rejected') && (
                    <button onClick={() => setAsking({ org, status: 'rejected' })} className="h-10 px-4 rounded-full bg-rose-50 text-rose-600 text-[13px] font-bold font-display hover:bg-rose-100">Reject</button>
                  )}
                  {canApprove && allowedStatusMoves(org).includes('suspended') && (
                    <button onClick={() => setAsking({ org, status: 'suspended' })} className="h-10 px-4 rounded-full bg-rose-50 text-rose-600 text-[13px] font-bold font-display hover:bg-rose-100">Suspend</button>
                  )}
                  {canApprove && allowedStatusMoves(org).includes('approved') && (
                    <span title={org.status === 'pending' && !org.emailVerified ? 'The owner must verify their email first' : undefined}>
                      <button onClick={() => setStatus(org, 'approved')} disabled={org.status === 'pending' && !org.emailVerified} aria-label={`${org.status === 'suspended' ? 'Reactivate' : 'Approve'} ${org.name}`}
                        className="h-10 px-5 rounded-full bg-ink text-lime-400 text-[13px] font-bold font-display hover:bg-pine-900 disabled:bg-gray-200 disabled:text-gray-400">
                        {org.status === 'suspended' ? 'Reactivate' : 'Approve'}
                      </button>
                    </span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {asking && (
        <ReasonModal
          title={asking.status === 'rejected' ? `Reject ${asking.org.name}?` : `Suspend ${asking.org.name}?`}
          action={asking.status === 'rejected' ? 'Reject' : 'Suspend'}
          onCancel={() => setAsking(null)}
          onConfirm={reason => { setStatus(asking.org, asking.status, reason); setAsking(null) }}
        />
      )}
    </div>
  )
}
