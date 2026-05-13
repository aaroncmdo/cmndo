'use client'

// AAR-glass-s1: Auswahl-Cards als Glass-Cards. Aktive Card = CTA-Gradient-Fill,
// inaktive = neutrales Glass. Icon-Bubble entfällt nicht ganz, wird aber
// dezenter (kein Hintergrund-Kreis bei inaktiv).

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {optionen.map(opt => {
          const isActive = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              data-testid={`feld-${feld.feld_key}-opt-${opt.value}`}
              data-feld={feld.feld_key}
              data-value={opt.value}
              data-active={isActive}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={
                isActive
                  ? ''
                  : '[background:var(--glass-bg)] [backdrop-filter:var(--glass-blur)] [-webkit-backdrop-filter:var(--glass-blur)]'
              }
              style={{
                borderRadius: 18,
                padding: '14px 20px',
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all .2s ease',
                textAlign: 'left',
                width: '100%',
                minWidth: 0,
                fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)',
                background: isActive ? 'var(--cta-gradient)' : undefined,
                border: isActive ? '1px solid rgba(255,255,255,.3)' : 'var(--glass-border)',
                boxShadow: isActive
                  ? '0 12px 32px color-mix(in srgb, transparent 60%, var(--brand-primary, var(--claimondo-ondo)))'
                  : 'var(--glass-shadow)',
              }}
            >
              {opt.icon && (
                <span
                  style={{
                    fontSize: 22,
                    flexShrink: 0,
                    filter: isActive ? 'brightness(0) invert(1)' : 'none',
                    opacity: isActive ? 0.95 : 1,
                  }}
                >
                  {opt.icon}
                </span>
              )}
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <strong
                  style={{
                    fontFamily: 'var(--font-heading, "Montserrat", system-ui, sans-serif)',
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: '-.012em',
                    color: isActive ? '#fff' : 'var(--brand-primary, var(--claimondo-navy))',
                  }}
                >
                  {opt.label}
                </strong>
                {opt.description && (
                  <span
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.45,
                      color: isActive
                        ? 'rgba(255,255,255,.85)'
                        : 'color-mix(in srgb, var(--brand-primary, var(--claimondo-navy)) 60%, transparent)',
                    }}
                  >
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
