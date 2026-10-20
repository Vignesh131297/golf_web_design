import type { TextareaHTMLAttributes } from 'react'
import { Input, fieldClass } from '../components'
import { GOLF_PHOTOS } from '../store'

/*
 * Small form building blocks shared by the admin screens and the create/edit wizards
 * (TournamentWizard, CourseWizard).
 */

/* ───────── Small building blocks ───────── */

export function Textarea({ label, error, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-gray-600 font-display">{label}</label>
      <textarea
        {...props}
        className={`${fieldClass(!!error)} h-auto min-h-[120px] py-3 leading-relaxed resize-y`}
      />
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  )
}

export function PhotoPicker({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="space-y-3">
      <div className="relative h-40 @md:h-52 rounded-2xl overflow-hidden bg-canvas flex items-center justify-center">
        {value
          ? <img src={value} alt="Selected photo" className="absolute inset-0 w-full h-full object-cover" />
          : <span className="text-[13px] text-gray-400 font-medium">No photo selected</span>}
      </div>
      <div className="grid grid-cols-4 @md:grid-cols-7 gap-2">
        {GOLF_PHOTOS.map(url => {
          const on = url === value
          return (
            <button
              key={url}
              type="button"
              onClick={() => onChange(url)}
              aria-label="Use this photo"
              aria-pressed={on}
              className={`relative aspect-[4/3] rounded-xl overflow-hidden transition-all ${on ? 'ring-[3px] ring-lime-500 ring-offset-2' : 'opacity-80 hover:opacity-100'}`}
            >
              <img src={url.replace('w=800&h=500', 'w=200&h=150')} alt="" className="w-full h-full object-cover" />
            </button>
          )
        })}
      </div>
      <Input label="…or paste an image link" placeholder="https://" value={value} onChange={e => onChange(e.target.value)} error={error} />
    </div>
  )
}

/** On/off switch with a label and optional hint */
export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
      <span>
        <span className="block text-[14px] font-semibold text-ink font-display">{label}</span>
        {hint && <span className="block text-[12px] text-gray-500 mt-0.5">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors ${checked ? 'bg-ink' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px] bg-lime-400' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

/** Small "+ Add" button for repeatable rows */
export function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="h-10 px-4 rounded-full bg-canvas text-ink text-[13px] font-bold font-display hover:bg-gray-200 inline-flex items-center gap-1.5">
      <span className="text-[16px] leading-none">+</span> {label}
    </button>
  )
}

/** Round remove button for repeatable rows */
export function RemoveRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className="w-10 h-10 mt-[26px] rounded-full bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 flex-shrink-0 text-[18px] leading-none">×</button>
  )
}

/** Upload an image (shrunk in the browser) or paste a link; used for hole pictures and the club scorecard */
export function ImageUpload({ label, hint, value, onChange }: { label: string; hint?: string; value?: string; onChange: (v?: string) => void }) {
  function pick(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, 900 / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
        onChange(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-gray-600 font-display">{label}</span>
      <div className="flex items-start gap-3">
        <div className="w-24 h-24 rounded-xl bg-canvas overflow-hidden flex items-center justify-center flex-shrink-0">
          {value ? <img src={value} alt={label} className="w-full h-full object-cover" /> : <span className="text-[11px] text-gray-400 text-center px-2">No image</span>}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <label className="h-9 px-4 rounded-full bg-ink text-white text-[12px] font-bold font-display inline-flex items-center cursor-pointer hover:opacity-90">
              {value ? 'Replace image' : 'Upload image'}
              <input type="file" accept="image/*" className="sr-only" onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
            </label>
            {value && <button type="button" onClick={() => onChange(undefined)} className="h-9 px-4 rounded-full bg-canvas text-[12px] font-bold font-display text-rose-600">Remove</button>}
          </div>
          <Input aria-label={`${label} link`} placeholder="…or paste an image link" value={value?.startsWith('data:') ? '' : value ?? ''} onChange={e => onChange(e.target.value || undefined)} />
          {hint && <p className="text-[12px] text-gray-500">{hint}</p>}
        </div>
      </div>
    </div>
  )
}
