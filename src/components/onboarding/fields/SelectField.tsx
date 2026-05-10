'use client'

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
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        required={feld.pflicht}
        style={{
          width: '100%',
          background: 'var(--wiz-fill)',
          border: '1.5px solid transparent',
          borderRadius: 'var(--wiz-r-sm)',
          padding: '14px 16px',
          fontSize: 16,
          color: value ? 'var(--claimondo-navy)' : 'var(--wiz-text-3)',
          fontFamily: 'inherit',
          letterSpacing: '-.01em',
          transition: 'all .2s var(--wiz-ease)',
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' viewBox='0 0 24 24'%3E%3Cpath stroke='%234573A2' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 14px center',
          paddingRight: 40,
        }}
      >
        <option value="">{feld.placeholder ?? 'Bitte wählen'}</option>
        {optionen.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}
