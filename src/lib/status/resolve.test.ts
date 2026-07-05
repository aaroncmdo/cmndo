// src/lib/status/resolve.test.ts
import { describe, it, expect } from 'vitest'
import { resolveStatus, statusLabel, statusBadgeView } from './resolve'

describe('resolveStatus', () => {
  it('resolves a known code', () => {
    expect(resolveStatus('fall-status', 'vs-reguliert').label).toBe('VS reguliert vollständig')
  })
  it('falls back to the code as label + neutral slot for unknown codes', () => {
    expect(resolveStatus('fall-status', 'total-unknown')).toEqual({ label: 'total-unknown', slot: 'neutral' })
  })
  it('falls back to em-dash for empty/null code', () => {
    expect(resolveStatus('fall-status', null).label).toBe('—')
    expect(resolveStatus('fall-status', '').label).toBe('—')
  })
})

describe('statusLabel', () => {
  it('returns the role variant when present', () => {
    expect(statusLabel('claims-status', 'in_kommunikation_vs', 'kunde')).toBe('Wir verhandeln mit der Versicherung')
  })
  it('falls back to the base label when the role has no variant', () => {
    expect(statusLabel('claims-status', 'in_kommunikation_vs', 'admin')).toBe('Kommunikation mit VS')
    expect(statusLabel('claims-status', 'in_kommunikation_vs')).toBe('Kommunikation mit VS')
  })
})

describe('statusBadgeView', () => {
  it('returns label + slotClass + iconKey', () => {
    expect(statusBadgeView('fall-status', 'vs-reguliert')).toEqual({
      label: 'VS reguliert vollständig',
      slotClass: 'bg-success-soft text-success-strong',
      iconKey: undefined,
    })
  })
})
