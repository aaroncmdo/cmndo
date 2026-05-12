'use client'

// AAR-glass-s1: Segmented-Control als Glass-Pill-Container mit CTA-Gradient-
// Fill für die aktive Option.

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, width: '100%' }}>
      <label
        style={{
          fontFamily: 'var(--font-heading, "Montserrat", system-ui, sans-serif)',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '.1em',
          color: 'color-mix(in srgb, var(--brand-primary, var(--claimondo-navy)) 75%, transparent)',
          padding: '0 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {feld.label}
        {feld.pflicht && <span style={{ color: 'var(--brand-secondary, var(--claimondo-ondo))', fontSize: 13 }}>*</span>}
      </label>
      {feld.hint && (
        <span
          style={{
            fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)',
            fontSize: 12,
            color: 'color-mix(in srgb, var(--brand-primary, var(--claimondo-navy)) 50%, transparent)',
            padding: '0 22px',
            marginTop: -2,
          }}
        >
          {feld.hint}
        </span>
      )}
      <div
        className="[background:var(--glass-bg)] [backdrop-filter:var(--glass-blur)] [-webkit-backdrop-filter:var(--glass-blur)] [box-shadow:var(--glass-shadow)] rounded-[var(--glass-radius-pill)]"
        style={{ display: 'flex', padding: 4, border: 'var(--glass-border)', width: '100%', minWidth: 0, gap: 4 }}
      >
        {optionen.map(opt => {
          const isActive = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '9px 12px',
                fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)',
                fontSize: 13.5,
                fontWeight: 600,
                letterSpacing: '-.01em',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all .22s ease',
                borderRadius: 999,
                border: isActive ? '1px solid rgba(255,255,255,.3)' : 'none',
                background: isActive ? 'var(--cta-gradient)' : 'transparent',
                color: isActive ? '#fff' : 'color-mix(in srgb, var(--brand-primary, var(--claimondo-navy)) 65%, transparent)',
                boxShadow: isActive ? '0 6px 16px color-mix(in srgb, transparent 65%, var(--brand-primary, var(--claimondo-ondo)))' : 'none',
              }}
            >
              {opt.icon && <span style={{ fontSize: 14, lineHeight: 1, opacity: isActive ? 0.95 : 0.8 }}>{opt.icon}</span>}
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
