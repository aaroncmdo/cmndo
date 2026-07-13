import { describe, it, expect } from 'vitest'
import { kundenBrandingErlaubt, svEigenBrandingErlaubt } from '../gate'

describe('kundenBrandingErlaubt', () => {
  it('true only when verifiziert AND use_custom_branding', () => {
    expect(kundenBrandingErlaubt({ verifiziert: true, use_custom_branding: true })).toBe(true)
  })
  it('false when branding off', () => {
    expect(kundenBrandingErlaubt({ verifiziert: true, use_custom_branding: false })).toBe(false)
  })
  it('false when not verified', () => {
    expect(kundenBrandingErlaubt({ verifiziert: false, use_custom_branding: true })).toBe(false)
  })
  it('false when neither', () => {
    expect(kundenBrandingErlaubt({ verifiziert: false, use_custom_branding: false })).toBe(false)
  })
  it('false for null / undefined', () => {
    expect(kundenBrandingErlaubt(null)).toBe(false)
    expect(kundenBrandingErlaubt(undefined)).toBe(false)
  })
  it('false when verifiziert is null (null !== true)', () => {
    expect(kundenBrandingErlaubt({ verifiziert: null, use_custom_branding: true })).toBe(false)
  })
})

describe('svEigenBrandingErlaubt', () => {
  it('true when use_custom_branding', () => {
    expect(svEigenBrandingErlaubt({ use_custom_branding: true })).toBe(true)
  })
  it('false when off', () => {
    expect(svEigenBrandingErlaubt({ use_custom_branding: false })).toBe(false)
  })
  it('false for null column / null / undefined', () => {
    expect(svEigenBrandingErlaubt({ use_custom_branding: null })).toBe(false)
    expect(svEigenBrandingErlaubt(null)).toBe(false)
    expect(svEigenBrandingErlaubt(undefined)).toBe(false)
  })
  it('asymmetry: SV-own allows where customer gate denies (verifiziert not true)', () => {
    // same use_custom_branding:true input: SV-own = true, customer gate = false w/o verifiziert
    expect(svEigenBrandingErlaubt({ use_custom_branding: true })).toBe(true)
    expect(kundenBrandingErlaubt({ verifiziert: null, use_custom_branding: true })).toBe(false)
  })
})
