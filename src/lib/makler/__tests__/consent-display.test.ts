import { describe, it, expect } from 'vitest'
import {
  istVollzugriff,
  consentScopeLabel,
  consentScopeValueClass,
} from '../consent-display'

describe('consent-display', () => {
  it('istVollzugriff nur bei exaktem "vollzugriff"', () => {
    expect(istVollzugriff('vollzugriff')).toBe(true)
    expect(istVollzugriff('minimal')).toBe(false)
    expect(istVollzugriff('widerrufen')).toBe(false)
    expect(istVollzugriff(null)).toBe(false)
    expect(istVollzugriff(undefined)).toBe(false)
    expect(istVollzugriff('')).toBe(false)
  })

  it('consentScopeLabel: Vollzugriff vs Minimal (Fallback Minimal)', () => {
    expect(consentScopeLabel('vollzugriff')).toBe('Vollzugriff')
    expect(consentScopeLabel('minimal')).toBe('Minimal')
    expect(consentScopeLabel(null)).toBe('Minimal')
    expect(consentScopeLabel(undefined)).toBe('Minimal')
  })

  it('consentScopeValueClass nutzt Status-Tokens (kein raw emerald/amber)', () => {
    expect(consentScopeValueClass('vollzugriff')).toBe('text-success-strong')
    expect(consentScopeValueClass('minimal')).toBe('text-warning-strong')
    expect(consentScopeValueClass(null)).toBe('text-warning-strong')
  })
})
