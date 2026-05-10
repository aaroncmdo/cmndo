'use client'

import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

export function ToggleCardsField({ feld, value, onChange, disabled }: Props) {
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
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 12,
      }}>
        {optionen.map(opt => {
          const isActive = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              style={{
                background: isActive
                  ? 'linear-gradient(135deg, rgba(69,115,162,.06), rgba(123,163,204,.04))'
                  : '#fff',
                border: `1.5px solid ${isActive ? 'var(--claimondo-ondo)' : 'var(--wiz-separator)'}`,
                borderRadius: 'var(--wiz-r-md)',
                padding: 18,
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all .22s var(--wiz-ease)',
                textAlign: 'left',
                boxShadow: isActive ? 'var(--wiz-shadow-2)' : 'none',
                transform: isActive ? 'translateY(-1px)' : 'none',
                fontFamily: 'inherit',
              }}
            >
              <span style={{
                width: 44, height: 44, flexShrink: 0,
                borderRadius: 13,
                background: isActive ? 'var(--claimondo-ondo)' : 'var(--wiz-fill)',
                display: 'grid', placeItems: 'center',
                color: isActive ? '#fff' : 'var(--claimondo-ondo)',
                fontSize: 20,
                transition: 'all .22s var(--wiz-ease)',
                boxShadow: isActive ? '0 6px 14px rgba(69,115,162,.28)' : 'none',
              }}>
                {opt.icon}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <strong style={{ fontSize: 15, fontWeight: 600, color: 'var(--claimondo-navy)', letterSpacing: '-.012em' }}>
                  {opt.label}
                </strong>
                {opt.description && (
                  <span style={{ fontSize: 13, color: 'var(--wiz-text-2)', lineHeight: 1.45, letterSpacing: '-.005em' }}>
                    {opt.description}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
