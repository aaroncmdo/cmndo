import { describe, it, expect } from 'vitest'
import { kundenBrandingErlaubt, svEigenBrandingErlaubt, brandingBezahlt } from '../gate'

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

describe('brandingBezahlt (Paid-Perk, Aaron 03.08.)', () => {
  it('true fuer jeden zahlenden Abo-Status (Kanon wie Finder-Boost)', () => {
    for (const s of ['aktiv', 'comped', 'ueberfaellig']) {
      expect(brandingBezahlt({ paket: 'basic', anzahlung_status: 'offen' }, s)).toBe(true)
    }
  })
  it('false fuer gekuendigt/inaktiv/kein Abo ohne Paid-Paket (Downgrade ab gekuendigt)', () => {
    for (const s of ['gekuendigt', 'inaktiv', null, undefined]) {
      expect(brandingBezahlt({ paket: 'basic', anzahlung_status: 'offen' }, s as string | null)).toBe(false)
    }
  })
  it('true fuer Paid-Paket MIT bezahlter Anzahlung (auch ohne Abo)', () => {
    expect(brandingBezahlt({ paket: 'standard', anzahlung_status: 'bezahlt' }, null)).toBe(true)
    expect(brandingBezahlt({ paket: 'pro', anzahlung_status: 'bezahlt' }, 'gekuendigt')).toBe(true)
  })
  it('false fuer Paid-Paket mit OFFENER Anzahlung (mitten im Onboarding)', () => {
    expect(brandingBezahlt({ paket: 'premium', anzahlung_status: 'offen' }, null)).toBe(false)
  })
  it('false fuer basic trotz anzahlung_status=bezahlt (Basic zaehlt nie als Paid-Paket)', () => {
    expect(brandingBezahlt({ paket: 'basic', anzahlung_status: 'bezahlt' }, null)).toBe(false)
  })
  it('fail-closed bei null/undefined sv', () => {
    expect(brandingBezahlt(null, null)).toBe(false)
    expect(brandingBezahlt(undefined, 'gekuendigt')).toBe(false)
  })
})
