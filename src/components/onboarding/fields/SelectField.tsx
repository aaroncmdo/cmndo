'use client'

// AAR-glass-s1: Native-Select als Glass-Pill mit Custom-Chevron.

import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

export function SelectField({ feld, value, onChange, disabled }: Props) {
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
        style={{ border: 'var(--glass-border)', display: 'flex', alignItems: 'center', padding: '0 8px 0 26px', minHeight: 44, minWidth: 0, width: '100%' }}
      >
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          required={feld.pflicht}
          style={{
            flex: 1,
            minWidth: 0,
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            cursor: 'pointer',
            appearance: 'none',
            padding: '13px 0',
            paddingRight: 32,
            fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)',
            fontSize: 14.5,
            fontWeight: 500,
            color: value
              ? 'var(--brand-primary, var(--claimondo-navy))'
              : 'var(--brand-secondary, var(--claimondo-ondo))',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' viewBox='0 0 24 24'%3E%3Cpath stroke='%234573A2' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
          }}
        >
          <option value="">{feld.placeholder ?? 'Bitte wählen'}</option>
          {optionen.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
