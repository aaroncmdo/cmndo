'use client'

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
      disabled={disabled}
      onClick={() => onChange(!value)}
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        padding: '18px 20px',
        background: 'var(--wiz-fill-2)',
        borderRadius: 'var(--wiz-r-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: 'none',
        fontFamily: 'inherit',
        textAlign: 'left',
        width: '100%',
      }}
    >
      <span style={{
        width: 22, height: 22, flexShrink: 0,
        borderRadius: '50%',
        border: `1.5px solid ${value ? 'var(--claimondo-ondo)' : 'var(--wiz-separator)'}`,
        background: value ? 'var(--claimondo-ondo)' : '#fff',
        display: 'grid', placeItems: 'center',
        transition: 'all .22s var(--wiz-ease)',
        marginTop: 1,
      }}>
        <Check size={14} color={value ? '#fff' : 'transparent'} strokeWidth={2.5} />
      </span>
      <span
        style={{ fontSize: 13, color: 'var(--wiz-text-2)', lineHeight: 1.55, letterSpacing: '-.005em' }}
        dangerouslySetInnerHTML={{ __html: feld.label }}
      />
    </button>
  )
}
