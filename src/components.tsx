import { useState, type ReactNode, type InputHTMLAttributes } from 'react'
import type { TournamentStatus, RegistrationStatus, Tournament } from './types'
import { PHONE_CODES, splitPhone, joinPhone } from './account-rules'

/* ─────────────────────────── Icons ─────────────────────────── */

/* Nav icons draw with currentColor so the nav bar controls their tint */
export function IconHome({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 10.182L12 3l9 7.182V21a1 1 0 01-1 1H5a1 1 0 01-1-1V10.182z"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 22V13h6v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

export function IconTournament({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M7 3h10v6a5 5 0 01-10 0V3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill={active ? 'currentColor' : 'none'} fillOpacity="0.15"/>
      <path d="M7 6H4a2 2 0 000 4h3M17 6h3a2 2 0 010 4h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

export function IconProfile({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" fill={active ? 'currentColor' : 'none'} fillOpacity="0.15"/>
      <path d="M4 20c0-3.866 3.582-7 8-7s8 3.134 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

export function IconArrowRight({ color = '#0c1a12' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3.5 9h11M10 4.5L14.5 9 10 13.5" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconBack() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M15 19l-7-7 7-7" stroke="#1a3a2a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="#9ca3af" strokeWidth="1.5"/>
      <path d="M12.5 12.5l3 3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IconFilter() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M2.5 5h15M5 10h10M7.5 15h5" stroke="#1a3a2a" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IconCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1.5" y="2.5" width="12" height="11" rx="1.5" stroke="#4a9264" strokeWidth="1.2"/>
      <path d="M5 1v3M10 1v3M1.5 6.5h12" stroke="#4a9264" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

export function IconPin() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 1.5a4 4 0 014 4c0 2.8-4 8.5-4 8.5S3.5 8.3 3.5 5.5a4 4 0 014-4z" stroke="#4a9264" strokeWidth="1.2"/>
      <circle cx="7.5" cy="5.5" r="1.5" stroke="#4a9264" strokeWidth="1.2"/>
    </svg>
  )
}

export function IconClock() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="#4a9264" strokeWidth="1.2"/>
      <path d="M7.5 4v3.5l2.5 1.5" stroke="#4a9264" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

export function IconEye({ show }: { show: boolean }) {
  return show ? (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" stroke="#6b7280" strokeWidth="1.4"/>
      <circle cx="10" cy="10" r="2.5" stroke="#6b7280" strokeWidth="1.4"/>
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 4l12 12M8.46 8.52A2.5 2.5 0 0012.5 11.5M2 10s3-6 8-6a7.43 7.43 0 014 1.09M18 10s-1.3 3.09-4 5M11.6 15.78A7.5 7.5 0 012 10" stroke="#6b7280" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

export function IconEdit() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M12.5 2.5l3 3L5 16H2v-3L12.5 2.5z" stroke="#1a3a2a" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconSignOut() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M12 6l4 3-4 3" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 9H7" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M9 3H3a1 1 0 00-1 1v10a1 1 0 001 1h6" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

export function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 4l4 4-4 4" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconGolf() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="20" fill="#1a3a2a"/>
      <path d="M20 8v18" stroke="#c9a227" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M20 8l8 5-8 5V8z" fill="#c9a227"/>
      <ellipse cx="20" cy="28" rx="6" ry="2" fill="#4a9264" opacity="0.6"/>
      <circle cx="20" cy="32" r="2" fill="#f0f9f3"/>
    </svg>
  )
}

export function IconCheckCircle() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" fill="#16a34a" fillOpacity="0.12" stroke="#16a34a" strokeWidth="1.4"/>
      <path d="M6.5 10l2.5 2.5L13.5 8" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconWarning() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2L18 17H2L10 2z" fill="#dc2626" fillOpacity="0.12" stroke="#dc2626" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M10 8v4M10 14.5v.5" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IconInfo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" fill="#2563eb" fillOpacity="0.12" stroke="#2563eb" strokeWidth="1.4"/>
      <path d="M10 9v5M10 6.5v.5" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IconCourse() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 14h12M3 14V7l6-4 6 4v7" stroke="#4a9264" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 14v-4h4v4" stroke="#4a9264" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5" r="2.5" stroke="#6b7280" strokeWidth="1.3"/>
      <circle cx="11" cy="5" r="2" stroke="#6b7280" strokeWidth="1.3"/>
      <path d="M1 13c0-2.761 2.239-4.5 5-4.5s5 1.739 5 4.5" stroke="#6b7280" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M13 13c0-1.657-1.343-3-3-3" stroke="#6b7280" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

export function IconSpinner() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="spin" fill="none">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25"/>
      <path d="M10 2a8 8 0 018 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

export function IconEmptyBox() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <rect x="8" y="20" width="48" height="36" rx="4" stroke="#c8e8d8" strokeWidth="2"/>
      <path d="M8 30h48" stroke="#c8e8d8" strokeWidth="2"/>
      <path d="M24 30V20l8-8 8 8v10" stroke="#c8e8d8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="32" cy="44" r="5" fill="#c8e8d8"/>
    </svg>
  )
}

export function IconError() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="28" stroke="#c8e8d8" strokeWidth="2"/>
      <path d="M32 20v16M32 42v2" stroke="#c8e8d8" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  )
}

/* ─────────────────────────── Buttons ─────────────────────────── */

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  className?: string
  type?: 'button' | 'submit'
  /** Submit a form elsewhere on the page by its id */
  form?: string
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  fullWidth,
  className = '',
  type = 'button',
  form,
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-display font-semibold rounded-full tracking-tight transition-all duration-150 select-none active:scale-[0.97]'

  const sizes = {
    sm: 'h-10 px-4 text-sm',
    md: 'h-[52px] px-6 text-[15px]',
    lg: 'h-14 px-7 text-base',
  }

  const variants = {
    primary:
      'bg-ink text-white shadow-[0_8px_20px_-8px_rgba(12,26,18,0.6)] active:bg-pine-900 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none',
    secondary:
      'bg-white text-ink ring-1 ring-black/10 active:bg-canvas disabled:opacity-40',
    ghost:
      'bg-black/[0.04] text-gray-500 active:bg-black/[0.07] disabled:opacity-100 disabled:text-gray-400',
    danger:
      'bg-red-50 text-red-600 ring-1 ring-red-200 active:bg-red-100 disabled:opacity-40',
  }

  return (
    <button
      type={type}
      form={form}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {loading && <IconSpinner />}
      {children}
    </button>
  )
}

/* ─────────────────────────── Inputs ─────────────────────────── */

/** Shared look for text inputs, selects and date fields: filled, borderless, soft focus ring */
export function fieldClass(hasError: boolean, onCanvas = false) {
  const rest = onCanvas ? 'bg-white border-black/[0.06] shadow-card' : 'bg-canvas border-transparent'
  return `w-full h-[52px] rounded-2xl px-4 text-[15px] text-ink font-sans placeholder:text-gray-400
    transition-all duration-150 border
    ${hasError
      ? 'bg-red-50/60 border-red-300 focus:ring-4 focus:ring-red-100'
      : `${rest} focus:bg-white focus:border-pine-400 focus:ring-4 focus:ring-pine-100/60`
    }`
}

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  hint?: string
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  /** Set when the field sits directly on the canvas background rather than inside a white card */
  onCanvas?: boolean
}

export function Input({ label, error, hint, leadingIcon, trailingIcon, onCanvas, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-[13px] font-semibold text-gray-600 font-display">
          {label}
        </label>
      )}
      <div className="relative">
        {leadingIcon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
            {leadingIcon}
          </div>
        )}
        <input
          {...props}
          className={`
            ${fieldClass(!!error, onCanvas)}
            ${leadingIcon ? 'pl-11' : ''}
            ${trailingIcon ? 'pr-12' : ''}
            ${className}
          `}
        />
        {trailingIcon && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            {trailingIcon}
          </div>
        )}
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5.5" fill="#dc2626" fillOpacity="0.15"/>
            <path d="M6 4v2.5M6 8v.5" stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs text-gray-400">{hint}</p>
      )}
    </div>
  )
}

function FieldError({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5.5" fill="#dc2626" fillOpacity="0.15"/>
        <path d="M6 4v2.5M6 8v.5" stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
      {message}
    </p>
  )
}

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  label: string
  error?: string
  hint?: string
  onCanvas?: boolean
}

export function PasswordInput({ label, error, hint, onCanvas, ...props }: PasswordInputProps) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-gray-600 font-display">{label}</label>
      <div className="relative">
        <input {...props} type={show ? 'text' : 'password'} className={`${fieldClass(!!error, onCanvas)} pr-12`} />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-1 active:opacity-60 transition-opacity"
          tabIndex={-1}
        >
          <IconEye show={show} />
        </button>
      </div>
      {error && <FieldError message={error} />}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

/* ─────────────────────────── Phone with country code ─────────────────────────── */

interface PhoneInputProps {
  label: string
  /** The whole number with its code, e.g. "+1 416 555 0144" */
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
  placeholder?: string
  /** Picks between countries that share a code (+1: Canada / United States), e.g. the golfer's country */
  preferCountry?: string
  onCanvas?: boolean
  autoComplete?: string
}

/** A country-code dropdown (Canada by default) next to the number */
export function PhoneInput({ label, value, onChange, error, hint, placeholder = '416 555 0000', preferCountry, onCanvas, autoComplete }: PhoneInputProps) {
  const [country, setCountry] = useState(() => splitPhone(value, preferCountry).country)
  const number = splitPhone(value, country).number
  const code = PHONE_CODES.find(c => c.country === country) ?? PHONE_CODES[0]
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-gray-600 font-display">{label}</label>
      <div className="flex gap-2">
        <div className="relative w-[104px] flex-shrink-0">
          <div className={`${fieldClass(!!error, onCanvas)} flex items-center gap-1.5 px-3 pointer-events-none`} aria-hidden>
            <span className="text-[18px] leading-none">{code.flag}</span>
            <span className="text-[14px] font-semibold text-ink">{code.dial}</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="ml-auto"><path d="M4 6l4 4 4-4" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <select
            aria-label={`${label} country code`}
            value={country}
            onChange={e => { setCountry(e.target.value); onChange(joinPhone(e.target.value, number)) }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {PHONE_CODES.map(c => <option key={c.country} value={c.country}>{c.flag} {c.country} ({c.dial})</option>)}
          </select>
        </div>
        <input
          type="tel"
          inputMode="tel"
          aria-label={label}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={number}
          onChange={e => onChange(joinPhone(country, e.target.value))}
          className={`${fieldClass(!!error, onCanvas)} flex-1 min-w-0`}
        />
      </div>
      {error && <FieldError message={error} />}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

interface SelectFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  options: (string | { value: string; label: string })[]
  placeholder?: string
  error?: string
  onCanvas?: boolean
}

export function SelectField({ label, value, onChange, options, placeholder, error, onCanvas }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-gray-600 font-display">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`${fieldClass(!!error, onCanvas)} appearance-none ${value ? '' : 'text-gray-400'}`}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M4 6l4 4 4-4' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 16px center',
          paddingRight: '44px',
        }}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map(o => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o
          return <option key={opt.value} value={opt.value}>{opt.label}</option>
        })}
      </select>
      {error && <FieldError message={error} />}
    </div>
  )
}

interface ChoiceOption {
  value: string
  label?: string
  /** Optional colour swatch, e.g. for tee colours */
  swatch?: string
}

interface ChoiceChipsProps {
  label: string
  options: (string | ChoiceOption)[]
  /** Single-select: pass a string. Multi-select: pass an array. */
  value: string | string[]
  onChange: (v: string | string[]) => void
  error?: string
  hint?: string
}

/** Pill buttons for short option lists (tee colour, shirt size, dietary needs…) */
export function ChoiceChips({ label, options, value, onChange, error, hint }: ChoiceChipsProps) {
  const multi = Array.isArray(value)
  const isOn = (v: string) => (multi ? value.includes(v) : value === v)

  function toggle(v: string) {
    if (!multi) return onChange(v)
    // "None" is exclusive with every other choice
    if (v === 'None') return onChange(value.includes('None') ? [] : ['None'])
    const withoutNone = value.filter(x => x !== 'None')
    onChange(withoutNone.includes(v) ? withoutNone.filter(x => x !== v) : [...withoutNone, v])
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[13px] font-semibold text-gray-600 font-display">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(o => {
          const opt = typeof o === 'string' ? { value: o } : o
          const on = isOn(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              aria-pressed={on}
              className={`h-10 px-4 rounded-full inline-flex items-center gap-2 text-[13px] font-semibold font-display transition-all active:scale-95 ${
                on ? 'bg-ink text-white' : `bg-canvas text-gray-600 ${error ? 'ring-1 ring-red-300' : ''}`
              }`}
            >
              {opt.swatch && (
                <span className="w-3.5 h-3.5 rounded-full ring-1 ring-black/15" style={{ background: opt.swatch }} />
              )}
              {opt.label ?? opt.value}
            </button>
          )
        })}
      </div>
      {error && <FieldError message={error} />}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

interface SearchInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export function SearchInput({ value, onChange, placeholder = 'Search tournaments…' }: SearchInputProps) {
  return (
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <IconSearch />
      </div>
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-12 bg-white rounded-full pl-11 pr-4 text-sm text-ink placeholder:text-gray-400 shadow-card border border-transparent focus:border-pine-300 focus:ring-4 focus:ring-pine-100/60 transition-all duration-150"
      />
    </div>
  )
}

/* ─────────────────────────── Status Badges ─────────────────────── */

interface StatusBadgeProps {
  status: TournamentStatus | RegistrationStatus | string
  size?: 'sm' | 'md'
  /** Glassy dark style for use on top of photos */
  onImage?: boolean
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  'registration-open': { label: 'Registration Open',   bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'open':              { label: 'Registration Open',   bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'upcoming':          { label: 'Upcoming',             bg: 'bg-sky-50',     text: 'text-sky-700',     dot: 'bg-sky-500'     },
  'in-progress':       { label: 'Live',                 bg: 'bg-rose-500',   text: 'text-white',       dot: 'bg-white animate-pulse' },
  'coming-soon':       { label: 'Coming Soon',          bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  'published':         { label: 'Coming Soon',          bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  'registration-closed': { label: 'Reg. Closed',       bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500'    },
  'closed':            { label: 'Registration Closed',  bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500'    },
  'registered':        { label: 'Registered',           bg: 'bg-lime-300',   text: 'text-ink',         dot: 'bg-pine-800'    },
  'completed':         { label: 'Completed',            bg: 'bg-gray-100',   text: 'text-gray-600',    dot: 'bg-gray-400'    },
  'cancelled':         { label: 'Cancelled',            bg: 'bg-rose-100',   text: 'text-rose-800',    dot: 'bg-rose-700'    },
  'draft':             { label: 'Draft',                bg: 'bg-canvas',     text: 'text-gray-600',    dot: 'bg-gray-400'    },
}

export function StatusBadge({ status, size = 'sm', onImage }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' }
  const sizeClass = size === 'sm' ? 'h-6 px-2.5 text-[11px]' : 'h-7 px-3 text-xs'
  const skin = onImage && status !== 'registered' ? 'glass-dark text-white' : `${cfg.bg} ${cfg.text}`
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold font-display whitespace-nowrap ${skin} ${sizeClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

/** Small glassy pill for secondary labels on photos (format, etc.) */
export function GlassChip({ children }: { children: ReactNode }) {
  return (
    <span className="glass-dark inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold font-display text-white whitespace-nowrap">
      {children}
    </span>
  )
}

/* ─────────────────────────── Section Header ─────────────────────── */

interface SectionHeaderProps {
  title: string
  action?: { label: string; onClick: () => void }
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-3">
      <h3 className="font-display font-bold text-ink text-[18px] tracking-tight">{title}</h3>
      {action && (
        <button onClick={action.onClick} className="text-gray-500 text-[13px] font-semibold font-display active:opacity-60">
          {action.label}
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────── Round Icon Button ─────────────────── */

interface RoundButtonProps {
  onClick: () => void
  children: ReactNode
  /** 'glass' for use on photos, 'solid' on plain backgrounds */
  tone?: 'glass' | 'solid'
  label?: string
}

export function RoundButton({ onClick, children, tone = 'solid', label }: RoundButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-95 ${
        tone === 'glass' ? 'glass-light shadow-md' : 'bg-white shadow-card'
      }`}
    >
      {children}
    </button>
  )
}

/* ─────────────────────────── Top App Bar ─────────────────────────── */

interface TopAppBarProps {
  title: string
  onBack?: () => void
  action?: ReactNode
  transparent?: boolean
}

export function TopAppBar({ title, onBack, action, transparent }: TopAppBarProps) {
  return (
    <div className={`flex items-center justify-between px-5 py-3 ${transparent ? '' : 'bg-canvas'}`}>
      <div className="flex items-center gap-2 min-w-[40px]">
        {onBack && (
          <RoundButton onClick={onBack} label="Back">
            <IconBack />
          </RoundButton>
        )}
      </div>
      <h1 className="font-display font-bold text-ink text-[17px] tracking-tight flex-1 text-center">{title}</h1>
      <div className="min-w-[40px] flex justify-end">
        {action}
      </div>
    </div>
  )
}

/* ─────────────────────────── Info Row ─────────────────────────── */

interface InfoRowProps {
  icon: ReactNode
  label: string
  value: string
}

export function InfoRow({ icon, label, value }: InfoRowProps) {
  return (
    <div className="flex items-center gap-3.5">
      <div className="w-10 h-10 rounded-2xl bg-canvas flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-gray-400 font-medium">{label}</p>
        <p className="text-[14px] font-semibold text-ink leading-snug">{value}</p>
      </div>
    </div>
  )
}

/** Compact label/value tile used in 2-column info grids */
export function InfoTile({ icon, label, value }: InfoRowProps) {
  return (
    <div className="bg-white shadow-card rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <p className="text-[11px] text-gray-500 font-semibold font-display">{label}</p>
      </div>
      <p className="text-[14px] font-bold text-ink leading-snug font-display tracking-tight">{value}</p>
    </div>
  )
}

/* ─────────────────────────── Divider ─────────────────────────── */

export function Divider({ className = '' }: { className?: string }) {
  return <div className={`h-px bg-black/[0.06] ${className}`} />
}

/* ─────────────────────────── Date Tile ─────────────────────────── */

export function DateTile({ date, dark }: { date: string; dark?: boolean }) {
  const d = new Date(`${date}T00:00:00`)
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  return (
    <div className={`w-12 h-[52px] rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${
      dark ? 'bg-white text-ink shadow-md' : 'bg-canvas text-ink'
    }`}>
      <span className="text-[10px] font-bold font-display tracking-wider text-pine-500 leading-none">{month}</span>
      <span className="text-[19px] font-extrabold font-display leading-none mt-1">{d.getDate()}</span>
    </div>
  )
}

/* ─────────────────────────── Progress ─────────────────────────── */

export function SpotsBar({ players, maxPlayers }: { players: number; maxPlayers: number }) {
  const spotsLeft = maxPlayers - players
  const pct = Math.min(100, (players / maxPlayers) * 100)
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-gray-500 font-medium">
          <span className="text-ink font-bold">{players}</span> / {maxPlayers} players
        </span>
        <span className={`text-[12px] font-bold font-display ${spotsLeft <= 10 ? 'text-rose-600' : 'text-pine-600'}`}>
          {spotsLeft > 0 ? `${spotsLeft} spots left` : 'Full'}
        </span>
      </div>
      <div className="h-2 bg-canvas rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pct >= 90 ? 'bg-rose-400' : 'bg-lime-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/* ─────────────────────────── Tournament Card ─────────────────────── */

interface TournamentCardProps {
  tournament: Tournament
  onPress: () => void
  compact?: boolean
}

export function TournamentCard({ tournament, onPress, compact }: TournamentCardProps) {
  const regStatus = tournament.registrationStatus

  if (compact) {
    return (
      <button
        onClick={onPress}
        className="w-full text-left bg-white rounded-3xl shadow-card p-3 flex items-center gap-3.5 active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-lg transition-all duration-150"
      >
        <div className="relative w-[72px] h-[72px] rounded-2xl overflow-hidden flex-shrink-0 bg-canvas">
          <img src={tournament.imageUrl} alt={tournament.name} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold font-display text-pine-500 mb-0.5">
            {tournament.dateRange} · {tournament.format}
          </p>
          <h3 className="font-display font-bold text-ink text-[15px] leading-snug tracking-tight line-clamp-2">
            {tournament.name}
          </h3>
          <div className="flex items-center gap-1 mt-1">
            <IconPin />
            <span className="text-xs text-gray-500 truncate">{tournament.city}</span>
          </div>
        </div>
        <div className="w-9 h-9 rounded-full bg-canvas flex items-center justify-center flex-shrink-0">
          <IconArrowRight />
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={onPress}
      className="w-full h-full flex flex-col justify-start text-left bg-white rounded-[28px] shadow-card overflow-hidden active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-lg transition-all duration-150 p-2"
    >
      {/* Image */}
      <div className="relative h-44 w-full flex-shrink-0 rounded-[22px] overflow-hidden bg-canvas">
        <img src={tournament.imageUrl} alt={tournament.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 scrim-top" />
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
          <StatusBadge status={regStatus === 'registered' ? 'registered' : tournament.status === 'registration-open' ? 'open' : tournament.status} onImage />
          <GlassChip>{tournament.format}</GlassChip>
        </div>
      </div>

      {/* Body */}
      <div className="w-full px-2.5 pt-3.5 pb-2.5">
        <div className="flex items-start gap-3">
          <DateTile date={tournament.startDate} />
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-ink text-[16px] leading-snug tracking-tight">
              {tournament.name}
            </h3>
            <div className="flex items-center gap-1 mt-1">
              <IconPin />
              <span className="text-xs text-gray-500 truncate">{tournament.venue} · {tournament.city}</span>
            </div>
          </div>
        </div>

        {regStatus === 'open' && tournament.maxPlayers > 0 && (
          <div className="mt-3.5">
            <SpotsBar players={tournament.players} maxPlayers={tournament.maxPlayers} />
          </div>
        )}

        {regStatus === 'registered' && (
          <div className="mt-3.5 flex items-center gap-2 bg-lime-300/40 rounded-2xl px-3 py-2.5">
            <IconCheckCircle />
            <span className="text-xs font-bold font-display text-pine-800">You're registered</span>
          </div>
        )}
      </div>
    </button>
  )
}

/* ─────────────────────────── Skeleton Card ─────────────────────── */

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-[28px] shadow-card overflow-hidden p-2">
      <div className="h-44 skeleton rounded-[22px]" />
      <div className="p-3 flex gap-3">
        <div className="w-12 h-[52px] skeleton rounded-2xl flex-shrink-0" />
        <div className="flex-1 space-y-2.5 pt-1">
          <div className="h-4 skeleton rounded-full w-5/6" />
          <div className="h-3 skeleton rounded-full w-1/2" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="w-10 h-10 skeleton rounded-2xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 skeleton rounded-full w-1/3" />
        <div className="h-4 skeleton rounded-full w-4/5" />
      </div>
    </div>
  )
}

/* ─────────────────────────── Empty & Error States ─────────────────── */

interface EmptyStateProps {
  title: string
  subtitle?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-24 h-24 rounded-full bg-white shadow-card flex items-center justify-center">
        <IconEmptyBox />
      </div>
      <h3 className="font-display font-bold text-ink text-lg tracking-tight mt-5">{title}</h3>
      {subtitle && <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-[240px]">{subtitle}</p>}
      {action && (
        <Button onClick={action.onClick} variant="secondary" size="sm" className="mt-6">
          {action.label}
        </Button>
      )}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-24 h-24 rounded-full bg-white shadow-card flex items-center justify-center">
        <IconError />
      </div>
      <h3 className="font-display font-bold text-ink text-lg tracking-tight mt-5">{title}</h3>
      {message && <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-[240px]">{message}</p>}
      {onRetry && (
        <Button onClick={onRetry} variant="primary" size="sm" className="mt-6">
          Try again
        </Button>
      )}
    </div>
  )
}

/* ─────────────────────────── Profile Avatar ─────────────────────── */

interface AvatarProps {
  initials: string
  /** The golfer's picture; initials show without one */
  photo?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Adds a lime ring, used on dark headers */
  ring?: boolean
}

export function Avatar({ initials, photo, size = 'md', ring }: AvatarProps) {
  const sizes = {
    sm: 'w-9 h-9 text-sm',
    md: 'w-11 h-11 text-[15px]',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-24 h-24 text-3xl',
  }
  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center font-display font-bold text-ink select-none flex-shrink-0 ${
        ring ? 'ring-4 ring-white/15' : ''
      }`}
      style={{ background: 'linear-gradient(135deg, #dcf58a 0%, #a9d334 100%)' }}
    >
      {photo ? <img src={photo} alt="Profile picture" className="w-full h-full rounded-full object-cover" /> : initials}
    </div>
  )
}

/** Lets the golfer take or choose a profile picture; returns it as a data URL (the real app uploads it) */
export function ProfilePhotoPicker({ initials, photo, onChange }: { initials: string; photo?: string; onChange: (photo?: string) => void }) {
  function pick(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      // Shrink to 256 px so the prototype can keep it in memory cheaply.
      const img = new Image()
      img.onload = () => {
        const size = 256
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        const side = Math.min(img.width, img.height)
        canvas.getContext('2d')?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
        onChange(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <label className="relative cursor-pointer active:scale-[0.97] transition-transform" aria-label="Change profile picture">
        <Avatar initials={initials} photo={photo} size="xl" />
        <span className="absolute -right-0.5 -bottom-0.5 w-8 h-8 rounded-full bg-ink ring-4 ring-canvas flex items-center justify-center" aria-hidden>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 8h3l2-3h6l2 3h3v11H4z" stroke="#c8ec5a" strokeWidth="1.8" strokeLinejoin="round"/><circle cx="12" cy="13" r="3.5" stroke="#c8ec5a" strokeWidth="1.8"/></svg>
        </span>
        <input type="file" accept="image/*" className="sr-only" onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      <div className="flex gap-3">
        <label className="text-[13px] font-bold font-display text-ink cursor-pointer">
          {photo ? 'Change photo' : 'Add a photo'}
          <input type="file" accept="image/*" className="sr-only" onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {photo && <button type="button" onClick={() => onChange(undefined)} className="text-[13px] font-semibold text-rose-600">Remove</button>}
      </div>
    </div>
  )
}

/* ─────────────────────────── Info Card ─────────────────────── */

interface InfoCardProps {
  children: ReactNode
  className?: string
}

export function InfoCard({ children, className = '' }: InfoCardProps) {
  return (
    <div className={`bg-white rounded-3xl shadow-card overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

/* ─────────────────────────── Stat Tile ─────────────────────── */

interface StatTileProps {
  value: string | number
  label: string
  accent?: boolean
}

export function StatTile({ value, label, accent }: StatTileProps) {
  return (
    <div className={`flex-1 rounded-2xl p-3 ${accent ? 'bg-lime-400' : 'bg-canvas'}`}>
      <p className="font-display font-extrabold text-[20px] tracking-tight text-ink leading-none">{value}</p>
      <p className={`text-[11px] font-semibold mt-1.5 ${accent ? 'text-pine-800' : 'text-gray-500'}`}>{label}</p>
    </div>
  )
}

/* ─────────────────────────── Offline Banner ─────────────────────── */

export function OfflineBanner() {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 3v5M8 10v1" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="8" cy="8" r="7" stroke="#d97706" strokeWidth="1.3"/>
      </svg>
      <p className="text-xs font-medium text-amber-700">No internet connection — showing cached data</p>
    </div>
  )
}

/* ─────────────────────────── Filter Chip ─────────────────────── */

interface FilterChipProps {
  label: string
  active: boolean
  onClick: () => void
}

export function FilterChip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={`h-9 px-4 rounded-full text-[13px] font-semibold font-display whitespace-nowrap transition-all duration-150 active:scale-95 ${
        active
          ? 'bg-ink text-white'
          : 'bg-white text-gray-600 shadow-card active:bg-canvas'
      }`}
    >
      {label}
    </button>
  )
}
