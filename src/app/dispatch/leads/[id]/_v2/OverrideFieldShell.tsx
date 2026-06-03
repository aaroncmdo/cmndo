'use client'

// P2d-2 (dispatch-config-unify): gemeinsame Label-Eyebrow (1:1 wie
// components/onboarding/fields/TextField) + dezenter Save-Status, damit die
// Dispatcher-Override-Felder optisch zu den FieldRenderer-Feldern passen.

import type { ReactNode } from 'react'
import type { OnboardingFeld } from '@/components/onboarding/types'

export type OverrideSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function OverrideFieldShell({
  feld,
  status,
  children,
}: {
  feld: OnboardingFeld
  status?: OverrideSaveStatus
  children: ReactNode
}) {
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
        {status === 'saving' && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--claimondo-ondo)' }}>speichert …</span>}
        {status === 'saved' && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--brand-success, #1a7a35)' }}>gespeichert ✓</span>}
        {status === 'error' && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--brand-danger, #c0392b)' }}>Fehler</span>}
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
      {children}
    </div>
  )
}
