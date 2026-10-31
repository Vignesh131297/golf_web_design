import { handicapText, headlineStat, gloveText } from '../account-rules'
import type { ReactNode } from 'react'
import { Avatar, Button, VerifiedTick } from '../components'
import { HandicapCheck, IdentityUpload, idStatus } from '../verification'
import { activeCoupons } from '../rewards'
import { CouponCard } from '../payments'
import { MOCK_PROFILE } from '../data'
import { PageHeader, useFakeLoad } from '../shell'
import { useApp } from '../app-context'
import { navigate } from '../router'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <dt className="text-[14px] text-gray-500 flex-shrink-0">{label}</dt>
      <dd className="text-[14px] font-semibold text-ink text-right truncate">{value}</dd>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-[28px] shadow-card px-6 pt-5 pb-2">
      <h2 className="font-display font-bold text-ink text-[17px] tracking-tight mb-1">{title}</h2>
      <dl className="divide-y divide-black/[0.05]">{children}</dl>
    </section>
  )
}

export default function Profile() {
  const { signOut, showToast, profileVersion, touchProfile } = useApp()
  void profileVersion
  const loading = useFakeLoad(600)
  const p = MOCK_PROFILE

  if (loading) {
    return (
      <div>
        <div className="h-9 w-48 skeleton rounded-full mb-8" />
        <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] gap-6">
          <div className="h-[420px] skeleton rounded-[32px]" />
          <div className="grid md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-56 skeleton rounded-[28px]" />)}
          </div>
        </div>
      </div>
    )
  }

  const fullName = `${p.firstName} ${p.lastName}`
  const dob = p.dob ? new Date(p.dob).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'
  const memberYears = new Date().getFullYear() - parseInt(p.memberSince.split(' ')[1])

  return (
    <div className="page-in">
      <PageHeader
        eyebrow="Your account"
        title="Profile"
        actions={<Button onClick={() => navigate('/profile/edit')}>Edit profile</Button>}
      />

      <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] gap-6 items-start">
        {/* Profile card */}
        <aside className="lg:sticky lg:top-8 bg-ink rounded-[32px] p-7 shadow-float relative overflow-hidden">
          <div
            className="absolute -left-16 -top-20 w-64 h-64 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(200,236,90,0.22) 0%, rgba(200,236,90,0) 70%)' }}
          />
          <div className="relative">
            <Avatar initials={p.avatarInitials} photo={p.photoUrl} size="xl" ring />
            <h2 className="font-display font-extrabold text-white text-[26px] tracking-tight mt-5 flex items-center gap-2">{fullName}{idStatus(p.idCheck) === 'verified' && <VerifiedTick kind="id" size={22} />}</h2>
            <p className="text-white/55 text-sm">{p.email}</p>
            <p className="text-white/55 text-sm mt-0.5">
              {memberYears > 0 ? `Member for ${memberYears} year${memberYears > 1 ? 's' : ''}` : 'New member'}
              {p.homeClub ? ` · ${p.homeClub}` : ''}
            </p>

            <div className="grid grid-cols-3 gap-2 mt-6">
              <div className="bg-lime-400 rounded-2xl p-3">
                <p className="font-display font-extrabold text-ink text-[20px] leading-none tracking-tight">{handicapText(p)}</p>
                <p className="text-pine-800 text-[11px] font-semibold mt-1.5 flex items-center gap-1">Handicap{p.handicapVerified && <VerifiedTick kind="handicap" size={12} />}</p>
              </div>
              <div className="bg-white/[0.08] rounded-2xl p-3">
                <p className="font-display font-extrabold text-white text-[20px] leading-none tracking-tight">{p.tournamentsPlayed}</p>
                <p className="text-white/55 text-[11px] font-semibold mt-1.5">Played</p>
              </div>
              <div className="bg-white/[0.08] rounded-2xl p-3">
                <p className="font-display font-extrabold text-white text-[20px] leading-none tracking-tight">{headlineStat(p).value}</p>
                <p className="text-white/55 text-[11px] font-semibold mt-1.5">{headlineStat(p).label}</p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => showToast('Settings coming soon', 'info')}
                className="flex-1 h-11 rounded-full bg-white/10 border border-white/15 text-white text-[13px] font-bold font-display hover:bg-white/20 transition-colors"
              >
                Settings
              </button>
              <button
                onClick={signOut}
                className="flex-1 h-11 rounded-full bg-rose-500/15 border border-rose-400/30 text-rose-200 text-[13px] font-bold font-display hover:bg-rose-500/25 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </aside>

        {/* Details */}
        <div className="grid md:grid-cols-2 gap-6 items-start">
          <section className="md:col-span-2 bg-white rounded-[28px] shadow-card p-6">
            <h2 className="font-display font-bold text-ink text-[17px] tracking-tight">Verification</h2>
            <p className="text-[13px] text-gray-500 mt-0.5 mb-4">Verified ticks show next to your name and handicap in every tournament you enter.</p>
            <div className="grid md:grid-cols-2 gap-4 items-start">
              <IdentityUpload value={p.idCheck} onChange={v => { p.idCheck = v; touchProfile(); if (v?.status === 'checking') showToast('ID uploaded — checking it now', 'info'); else if (v?.status === 'verified') showToast('ID verified — you now have the blue tick') }} />
              <div className="rounded-2xl bg-canvas p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5"><VerifiedTick kind="handicap" size={22} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-bold text-ink text-[15px]">Verify your handicap</p>
                    <p className="text-[13px] text-gray-500 mt-0.5 leading-relaxed mb-3">We confirm your Handicap Index with {p.handicapBody || 'Golf Canada'} so organisers can trust the divisions.</p>
                    {p.hasHandicap === false
                      ? <p className="text-[13px] text-gray-500">Add a Handicap Index first.</p>
                      : <HandicapCheck profile={p} onVerified={() => { p.handicapVerified = true; touchProfile(); showToast(`Handicap verified with ${p.handicapBody || 'Golf Canada'}`) }} />}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {activeCoupons().length > 0 && (
            <section className="md:col-span-2 bg-white rounded-[28px] shadow-card p-6">
              <h2 className="font-display font-bold text-ink text-[17px] tracking-tight">Your rewards</h2>
              <p className="text-[13px] text-gray-500 mt-0.5 mb-4">Every payment earns a discount at our golf shop.</p>
              <div className="grid md:grid-cols-2 gap-4">{activeCoupons().map(c => <CouponCard key={c.code} coupon={c} />)}</div>
            </section>
          )}

          <Group title="Personal information">
            <Row label="Full name" value={fullName} />
            <Row label="Email" value={p.email} />
            <Row label="Phone" value={p.phone} />
            <Row label="Date of birth" value={dob} />
            <Row label="Gender" value={p.gender} />
            {(p.street || p.city || p.postalCode) && <Row label="Address" value={[p.street, p.city, p.region, p.postalCode].filter(Boolean).join(', ')} />}
            {p.country && <Row label="Country" value={p.country} />}
            <Row label="Email verified" value={p.emailVerified === false ? 'Not yet — check your inbox' : 'Yes'} />
          </Group>

          <Group title="Golfer information">
            <Row label="Handicap index" value={p.hasHandicap === false ? 'Not yet' : `${handicapText(p)} (WHS)${p.handicapVerified ? ' · verified' : ''}`} />
            {p.handicapBody && <Row label="Issuing body" value={p.handicapBody} />}
            {p.handicapNumber && <Row label="Member number" value={p.handicapNumber} />}
            {p.homeClub && <Row label="Home club" value={p.homeClub} />}
            {p.preferredTee && <Row label="Preferred tee" value={p.preferredTee} />}
            <Row label="Status" value={p.membership} />
            <Row label="Member since" value={p.memberSince} />
          </Group>

          <Group title="Event preferences">
            <Row label="Preferred contact" value={p.preferredContact ?? 'Email'} />
            <Row label="Dietary" value={[...p.dietary, p.dietaryNote].filter(Boolean).join(', ') || 'None'} />
            {p.shirtSize && <Row label="Shirt size" value={p.shirtSize} />}
            {p.gloveSize || p.gloveHand ? <Row label="Glove" value={gloveText(p.gloveSize, p.gloveHand)} /> : null}
            <Row label="Tournaments played" value={String(p.tournamentsPlayed)} />
            <Row label={headlineStat(p).label} value={headlineStat(p).value} />
          </Group>

          <Group title="Emergency contact">
            <Row label="Name" value={p.emergencyContactName} />
            <Row label="Phone" value={p.emergencyContactPhone} />
            {p.emergencyContactRelationship && <Row label="Relationship" value={p.emergencyContactRelationship} />}
          </Group>
        </div>
      </div>
    </div>
  )
}
