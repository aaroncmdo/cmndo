import { describe, expect, test } from 'vitest'
import { hatKontakt, istSelfServiceFaehig, type SelfServiceAnfrage } from '../eligibility'

function makeAnfrage(overrides: Partial<SelfServiceAnfrage> = {}): SelfServiceAnfrage {
  return {
    source: null, // native
    telefon: '015112345678',
    email: 'kunde@example.de',
    konvertiert_zu_lead_id: null,
    status: 'neu',
    ...overrides,
  }
}

describe('hatKontakt', () => {
  test('Telefon (>=6 Zeichen) reicht', () => {
    expect(hatKontakt({ telefon: '015112345678', email: null })).toBe(true)
  })
  test('Email mit @ reicht', () => {
    expect(hatKontakt({ telefon: null, email: 'a@b.de' })).toBe(true)
  })
  test('leere/zu kurze Kontakte → false', () => {
    expect(hatKontakt({ telefon: '', email: '' })).toBe(false)
    expect(hatKontakt({ telefon: '123', email: 'keinemail' })).toBe(false)
    expect(hatKontakt({ telefon: null, email: null })).toBe(false)
  })
})

describe('istSelfServiceFaehig', () => {
  test('native Anfrage mit Kontakt → true', () => {
    expect(istSelfServiceFaehig(makeAnfrage({ source: null }))).toBe(true)
  })
  test('Cluster-LP mit Kontakt → true', () => {
    expect(istSelfServiceFaehig(makeAnfrage({ source: 'kfz_gutachter_lp' }))).toBe(true)
  })
  test('sv_embed → false (eigener Pfad)', () => {
    expect(istSelfServiceFaehig(makeAnfrage({ source: 'sv_embed' }))).toBe(false)
  })
  test('schon promotet (konvertiert_zu_lead_id gesetzt) → false', () => {
    expect(istSelfServiceFaehig(makeAnfrage({ konvertiert_zu_lead_id: 'lead-1' }))).toBe(false)
  })
  test('terminaler Status → false', () => {
    expect(istSelfServiceFaehig(makeAnfrage({ status: 'konvertiert' }))).toBe(false)
    expect(istSelfServiceFaehig(makeAnfrage({ status: 'storniert' }))).toBe(false)
  })
  test('kein Kontakt → false', () => {
    expect(istSelfServiceFaehig(makeAnfrage({ telefon: null, email: '' }))).toBe(false)
  })
})
