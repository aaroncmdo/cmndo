'use client'

// AAR-glass-s1: Textarea als Liquid-Glass-Card (größerer Radius als Pills,
// weil mehrzeilig). Label = Montserrat-Eyebrow.

import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

export function TextareaField({ feld, value, onChange, disabled }: Props) {
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
        className="[background:var(--glass-bg)] [backdrop-filter:var(--glass-blur)] [-webkit-backdrop-filter:var(--glass-blur)] [box-shadow:var(--glass-shadow)]"
        style={{
          border: 'var(--glass-border)',
          borderRadius: 22,
          padding: '14px 22px',
          minWidth: 0,
          width: '100%',
        }}
      >
        <textarea
          name={feld.feld_key}
          data-testid={`feld-${feld.feld_key}`}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={feld.placeholder ?? ''}
          disabled={disabled}
          required={feld.pflicht}
          rows={4}
          className="glass-field-input"
          style={{
            width: '100%',
            minHeight: 110,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)',
            fontSize: 14.5,
            fontWeight: 500,
            lineHeight: 1.55,
            color: 'var(--brand-primary, var(--claimondo-navy))',
          }}
        />
      </div>
    </div>
  )
}
