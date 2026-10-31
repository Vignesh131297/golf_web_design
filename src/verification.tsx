import { useEffect, useRef, useState } from 'react'
import { VerifiedTick } from './components'
import type { GolferProfile } from './types'

/*
 * Verified ticks (client, 21 Oct call). Shared verbatim between the web and mobile prototypes.
 *  - Photo ID: optional for golfers and organisers. A verified person gets a blue tick, which makes the
 *    field more trustworthy for organisers and sponsors. In production an ID-check service (e.g. Stripe
 *    Identity) checks the document and we keep only the result; here the check passes after a few seconds.
 *  - Handicap: confirmed with the handicap body (Golf Canada's API in production). This tick matters most.
 */

export type IdCheck = NonNullable<GolferProfile['idCheck']>

export const ID_DOCUMENTS = ['Driver’s licence', 'Passport', 'Provincial / state ID']

/** Seconds the prototype "check" takes */
const CHECK_SECONDS = 4

/** 'checking' turns into 'verified' once the (simulated) check has had time to finish */
export function idStatus(check?: IdCheck): 'none' | 'checking' | 'verified' {
  if (!check) return 'none'
  if (check.status === 'verified') return 'verified'
  return Date.now() - Date.parse(check.at) > CHECK_SECONDS * 1000 ? 'verified' : 'checking'
}

/** The verified state to save once the check is through */
export const settledId = (check?: IdCheck): IdCheck | undefined =>
  check && idStatus(check) === 'verified' ? { ...check, status: 'verified' } : check

/** Optional photo-ID upload with its check status */
export function IdentityUpload({ value, onChange, who = 'golfer', card = false }: {
  value?: IdCheck
  onChange: (v: IdCheck | undefined) => void
  who?: 'golfer' | 'organiser'
  /** White card for grey pages; grey panel inside white cards (default) */
  card?: boolean
}) {
  const [doc, setDoc] = useState(value?.document ?? ID_DOCUMENTS[0])
  const file = useRef<HTMLInputElement>(null)
  const status = idStatus(value)
  const [, tick] = useState(0)

  // Re-render while the check runs, then save the verified result
  useEffect(() => {
    if (status !== 'checking') return
    const timer = setInterval(() => {
      tick(n => n + 1)
      if (idStatus(value) === 'verified') onChange(settledId(value))
    }, 500)
    return () => clearInterval(timer)
  }, [status, value, onChange])

  function picked(f?: File) {
    if (!f) return
    onChange({ document: doc, fileName: f.name, status: 'checking', at: new Date().toISOString() })
  }

  return (
    <div className={`rounded-2xl p-4 ${card ? 'bg-white shadow-card' : 'bg-canvas'}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5"><VerifiedTick kind="id" size={22} /></span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-ink text-[15px]">Verify your identity <span className="text-gray-400 font-semibold text-[12px]">(optional)</span></p>
          <p className="text-[13px] text-gray-500 mt-0.5 leading-relaxed">
            {who === 'golfer'
              ? 'Upload a photo of your ID to get a blue tick next to your name. Organisers and sponsors can trust a verified field. '
              : 'Upload a photo of your ID so golfers and our team know who runs your tournaments. '}
            We keep it encrypted and never show it to anyone else.
          </p>
        </div>
      </div>

      {status === 'none' && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Document">
            {ID_DOCUMENTS.map(d => (
              <button key={d} type="button" role="radio" aria-checked={doc === d} onClick={() => setDoc(d)}
                className={`h-9 px-3.5 rounded-full text-[12px] font-bold font-display ${doc === d ? 'bg-ink text-white' : 'bg-white text-gray-600 ring-1 ring-black/10'}`}>{d}</button>
            ))}
          </div>
          <input ref={file} type="file" accept="image/*,application/pdf" className="hidden" aria-label="Photo of your ID"
            onChange={e => picked(e.target.files?.[0])} />
          <button type="button" onClick={() => file.current?.click()}
            className="h-11 px-5 rounded-full bg-white ring-1 ring-black/10 text-ink text-[13px] font-bold font-display">Upload a photo of your {doc.toLowerCase()}</button>
        </div>
      )}

      {status === 'checking' && (
        <p className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
          <span className="w-4 h-4 rounded-full border-2 border-pine-400 border-t-transparent animate-spin" aria-hidden="true" />
          Checking your {value!.document.toLowerCase()}…
        </p>
      )}

      {status === 'verified' && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-[#1170b8]">ID verified · {value!.document}</p>
          <button type="button" onClick={() => onChange(undefined)} className="text-[12px] font-semibold text-gray-500 underline underline-offset-4">Remove</button>
        </div>
      )}
    </div>
  )
}

/** "Verify with Golf Canada": confirms the golfer's Handicap Index with the handicap body */
export function HandicapCheck({ profile, onVerified }: {
  profile: Pick<GolferProfile, 'hasHandicap' | 'handicapBody' | 'handicapNumber' | 'handicapVerified'>
  onVerified: () => void
}) {
  const [state, setState] = useState<'idle' | 'checking' | 'error'>('idle')
  const body = profile.handicapBody || 'Golf Canada'
  if (profile.hasHandicap === false) return null
  if (profile.handicapVerified) {
    return <p className="flex items-center gap-1.5 text-[13px] font-semibold text-pine-600"><VerifiedTick kind="handicap" /> Verified with {body}</p>
  }
  function verify() {
    if (!profile.handicapNumber?.trim()) { setState('error'); return }
    setState('checking')
    setTimeout(() => { setState('idle'); onVerified() }, 1500)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={verify} disabled={state === 'checking'}
        className="h-9 px-4 rounded-full bg-ink text-white text-[12px] font-bold font-display disabled:opacity-60">
        {state === 'checking' ? `Checking with ${body}…` : `Verify with ${body}`}
      </button>
      {state === 'error' && <span className="text-[12px] font-semibold text-rose-600">Add your {body} member number in Edit profile first</span>}
    </div>
  )
}
