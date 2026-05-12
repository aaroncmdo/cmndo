'use client'

// AAR-glass-s1: Checkbox als Glass-Pill mit langem Label.
// Klick auf die ganze Pill toggled. Border-Color der Checkbox brandet
// transitiv über var(--brand-secondary).

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  label: React.ReactNode
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (v: boolean) => void
  name?: string
  required?: boolean
  className?: string
  id?: string
}

export function GlassCheckboxPill({
  label,
  checked,
  defaultChecked,
  onChange,
  name,
  required,
  className,
  id,
}: Props) {
  const [internal, setInternal] = useState<boolean>(defaultChecked ?? false)
  const isControlled = checked !== undefined
  const value = isControlled ? checked : internal

  function toggle() {
    const next = !value
    if (!isControlled) setInternal(next)
    onChange?.(next)
  }

  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-center gap-3 cursor-pointer px-[22px] py-[14px]',
        'rounded-[var(--glass-radius-pill)]',
        '[background:var(--glass-bg)]',
        '[backdrop-filter:var(--glass-blur)] [-webkit-backdrop-filter:var(--glass-blur)]',
        '[border:var(--glass-border)]',
        '[box-shadow:var(--glass-shadow)]',
        'text-[12.5px] leading-[1.4]',
        className,
      )}
      style={{
        fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)',
        color: 'color-mix(in srgb, var(--brand-primary, var(--claimondo-navy)) 75%, transparent)',
      }}
      onClick={toggle}
    >
      <input
        id={id}
        type="checkbox"
        name={name}
        checked={value}
        required={required}
        readOnly
        className="sr-only"
      />
      <span
        className={cn(
          'flex-shrink-0 w-[18px] h-[18px] rounded-[6px] flex items-center justify-center transition-colors',
        )}
        style={{
          background: value ? 'var(--brand-secondary, var(--claimondo-ondo))' : 'rgba(255,255,255,0.6)',
          border: value
            ? '1.5px solid var(--brand-secondary, var(--claimondo-ondo))'
            : '1.5px solid color-mix(in srgb, transparent 55%, var(--brand-secondary, var(--claimondo-ondo)))',
        }}
      >
        {value && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
      </span>
      <span>{label}</span>
    </label>
  )
}
