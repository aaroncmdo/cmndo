'use client'

import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

export function TextareaField({ feld, value, onChange, disabled }: Props) {
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
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={feld.placeholder ?? ''}
        disabled={disabled}
        required={feld.pflicht}
        rows={4}
        style={{
          width: '100%',
          background: 'var(--wiz-fill)',
          border: '1.5px solid transparent',
          borderRadius: 'var(--wiz-r-sm)',
          padding: '14px 16px',
          fontSize: 16,
          color: 'var(--claimondo-navy)',
          fontFamily: 'inherit',
          letterSpacing: '-.01em',
          transition: 'all .2s var(--wiz-ease)',
          outline: 'none',
          resize: 'vertical',
          minHeight: 120,
          lineHeight: 1.55,
        }}
        onFocus={e => {
          e.target.style.background = '#fff'
          e.target.style.borderColor = 'var(--claimondo-ondo)'
          e.target.style.boxShadow = '0 0 0 4px rgba(69,115,162,.12)'
        }}
        onBlur={e => {
          e.target.style.background = 'var(--wiz-fill)'
          e.target.style.borderColor = 'transparent'
          e.target.style.boxShadow = 'none'
        }}
      />
    </div>
  )
}
