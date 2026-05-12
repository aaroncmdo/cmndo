'use client'

// AAR-glass-s1: Pill-Form-Input mit Label-Eyebrow.
// Placeholder-Color = brand-ondo (fallback Ondo), Typed-Color = brand-primary
// (fallback Navy). Beide via CSS-Vars, sodass Brand-Provider automatisch
// die Farben umfärbt.

import { cn } from '@/lib/utils'

interface Props {
  label: string
  placeholder?: string
  value?: string
  defaultValue?: string
  onChange?: (v: string) => void
  type?: 'text' | 'email' | 'tel' | 'number'
  name?: string
  required?: boolean
  className?: string
  inputClassName?: string
  autoComplete?: string
  id?: string
}

export function GlassInput({
  label,
  placeholder,
  value,
  defaultValue,
  onChange,
  type = 'text',
  name,
  required,
  className,
  inputClassName,
  autoComplete,
  id,
}: Props) {
  return (
    <div className={cn('flex flex-col gap-1.5 w-full min-w-0', className)}>
      <span
        className="px-[22px] text-[11px] font-bold uppercase tracking-[0.1em]"
        style={{
          fontFamily: 'var(--font-heading, "Montserrat", system-ui, sans-serif)',
          color: 'color-mix(in srgb, var(--brand-primary, var(--claimondo-navy)) 75%, transparent)',
        }}
      >
        {label}
        {required && <span className="ml-1 text-[var(--claimondo-ondo)]">*</span>}
      </span>
      <div
        className={cn(
          'flex items-center px-[26px] py-[13px] min-h-[44px] min-w-0 w-full',
          'rounded-[var(--glass-radius-pill)]',
          '[background:var(--glass-bg)]',
          '[backdrop-filter:var(--glass-blur)] [-webkit-backdrop-filter:var(--glass-blur)]',
          '[border:var(--glass-border)]',
          '[box-shadow:var(--glass-shadow)]',
          'text-[14.5px] font-medium leading-[1.2]',
        )}
        style={{ fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)' }}
      >
        <input
          id={id}
          type={type}
          name={name}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          required={required}
          autoComplete={autoComplete}
          onChange={e => onChange?.(e.target.value)}
          className={cn(
            'flex-1 min-w-0 w-full bg-transparent border-none outline-none',
            'placeholder:font-medium',
            inputClassName,
          )}
          style={{
            color: 'var(--brand-primary, var(--claimondo-navy))',
            // Placeholder-Color via CSS-Var (cross-browser über data-attribute)
          }}
        />
      </div>
      <style jsx>{`
        input::placeholder {
          color: var(--brand-secondary, var(--claimondo-ondo));
          opacity: 1;
        }
      `}</style>
    </div>
  )
}
