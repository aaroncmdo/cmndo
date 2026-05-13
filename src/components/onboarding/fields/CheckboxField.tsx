'use client'

// AAR-glass-s1: Checkbox als Glass-Pill mit langem Label.

import { Check } from 'lucide-react'
import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: boolean
  onChange: (val: boolean) => void
  disabled?: boolean
}

export function CheckboxField({ feld, value, onChange, disabled }: Props) {
  return (
    <button
      type="button"
      data-testid={`feld-${feld.feld_key}`}
      data-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className="[background:var(--glass-bg)] [backdrop-filter:var(--glass-blur)] [-webkit-backdrop-filter:var(--glass-blur)] [box-shadow:var(--glass-shadow)] rounded-[var(--glass-radius-pill)]"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: '14px 22px',
        border: 'var(--glass-border)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)',
        textAlign: 'left',
        width: '100%',
        minWidth: 0,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          flexShrink: 0,
          borderRadius: 6,
          border: value
            ? '1.5px solid var(--brand-secondary, var(--claimondo-ondo))'
            : '1.5px solid color-mix(in srgb, transparent 55%, var(--brand-secondary, var(--claimondo-ondo)))',
          background: value ? 'var(--brand-secondary, var(--claimondo-ondo))' : 'rgba(255,255,255,0.6)',
          display: 'grid',
          placeItems: 'center',
          transition: 'all .2s ease',
        }}
      >
        <Check size={11} color={value ? '#fff' : 'transparent'} strokeWidth={3} />
      </span>
      <span
        style={{
          fontSize: 12.5,
          lineHeight: 1.4,
          color: 'color-mix(in srgb, var(--brand-primary, var(--claimondo-navy)) 75%, transparent)',
        }}
        dangerouslySetInnerHTML={{ __html: feld.label }}
      />
    </button>
  )
}
