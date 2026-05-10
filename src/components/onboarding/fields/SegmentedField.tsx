'use client'

import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

export function SegmentedField({ feld, value, onChange, disabled }: Props) {
  const optionen = feld.optionen ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{
        fontSize: 14, fontWeight: 600, color: 'var(--claimondo-navy)',
        letterSpacing: '-.01em', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {feld.label}
        {feld.pflicht && <span style={{ color: '#FF9F0A', fontSize: 13 }}>*</span>}
      </label>
      {feld.hint && (
        <span style={{ fontSize: 13, color: 'var(--wiz-text-3)', marginTop: -2, letterSpacing: '-.005em' }}>
          {feld.hint}
        </span>
      )}
      <div style={{
        display: 'inline-flex',
        padding: 3,
        background: 'var(--wiz-fill)',
        borderRadius: 'var(--wiz-r-sm)',
        width: '100%',
        position: 'relative',
      }}>
        {optionen.map(opt => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 14px',
              fontSize: 14,
              fontWeight: 600,
              color: value === opt.value ? 'var(--claimondo-navy)' : 'var(--wiz-text-2)',
              borderRadius: 11,
              cursor: disabled ? 'not-allowed' : 'pointer',
              letterSpacing: '-.01em',
              transition: 'color .25s var(--wiz-ease)',
              background: value === opt.value ? '#fff' : 'transparent',
              boxShadow: value === opt.value
                ? '0 1px 2px rgba(15,30,68,.04), 0 3px 8px rgba(15,30,68,.06)'
                : 'none',
              border: 'none',
              fontFamily: 'inherit',
            }}
          >
            {opt.icon && <span style={{ fontSize: 14, lineHeight: 1, opacity: .8 }}>{opt.icon}</span>}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
