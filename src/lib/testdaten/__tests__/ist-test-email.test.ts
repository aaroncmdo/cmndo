import { describe, it, expect } from 'vitest'
import { istTestEmail, istTestPartner, istReservierteTestDomain } from '../ist-test-email'

describe('istTestEmail', () => {
  it('erkennt test/smoke/@claimondo.test', () => {
    expect(istTestEmail('test@x.de')).toBe(true)
    expect(istTestEmail('smoke.run@y.de')).toBe(true)
    expect(istTestEmail('jemand@claimondo.test')).toBe(true)
    expect(istTestEmail('MaxTest@web.de')).toBe(true) // case-insensitive
  })
  it('lässt echte Emails durch', () => {
    expect(istTestEmail('max.mustermann@gmail.com')).toBe(false)
    expect(istTestEmail('kunde@claimondo.de')).toBe(false)
  })
  it('ist null/undefined/leer-sicher', () => {
    expect(istTestEmail(null)).toBe(false)
    expect(istTestEmail(undefined)).toBe(false)
    expect(istTestEmail('')).toBe(false)
  })
})

describe('istTestPartner', () => {
  it('erkennt Test/Smoke/Demo per Name (Wort-Grenze)', () => {
    expect(istTestPartner('Test Firmna', 'daniel@b.de')).toBe(true)
    expect(istTestPartner('Test Makler GmbH (Smoke)', null)).toBe(true)
    expect(istTestPartner('SMOKE Werkstatt (Test)', null)).toBe(true)
    expect(istTestPartner('Demo Betrieb', null)).toBe(true)
  })
  it('erkennt Test per Email', () => {
    expect(istTestPartner('Echte GmbH', 'smoke@x.de')).toBe(true)
    expect(istTestPartner(null, 'jemand@claimondo.test')).toBe(true)
  })
  it('laesst echte Partner durch — kein Substring-FP (Contest/latest/MaxTest)', () => {
    expect(istTestPartner('Contest GmbH', 'info@contest.de')).toBe(false)
    expect(istTestPartner('Latest Automotive', 'latest@web.de')).toBe(false)
    expect(istTestPartner('Daniel Bundesmann', 'daniel@bundesmann.de')).toBe(false)
    expect(istTestPartner('Auto Conen GmbH', null)).toBe(false)
  })
  it('null/undefined-sicher', () => {
    expect(istTestPartner(null, null)).toBe(false)
    expect(istTestPartner(undefined, undefined)).toBe(false)
  })
})

describe('istReservierteTestDomain', () => {
  it('erkennt die RFC-reservierten Domains', () => {
    expect(istReservierteTestDomain('throwaway-x@claimondo.test')).toBe(true) // Smoke-Konvention
    expect(istReservierteTestDomain('jemand@example.com')).toBe(true)
    expect(istReservierteTestDomain('jemand@example.org')).toBe(true)
    expect(istReservierteTestDomain('jemand@example.net')).toBe(true)
    expect(istReservierteTestDomain('x@foo.invalid')).toBe(true)
    expect(istReservierteTestDomain('x@irgendwas.localhost')).toBe(true)
    expect(istReservierteTestDomain('X@CLAIMONDO.TEST')).toBe(true) // case-insensitive
    expect(istReservierteTestDomain('  x@claimondo.test  ')).toBe(true) // getrimmt
  })

  // ⭐ Der eigentliche Zweck dieser dritten Stufe: KEIN Substring-Treffer. Ein
  // False-Positive wuerde hier einen echten Schadensfall aus der operativen Liste
  // entfernen -- deshalb muss alles, was istTestEmail noch faengt, hier durchfallen.
  it('markiert NICHT, was nur "test"/"smoke" im Text hat (Abgrenzung zu istTestEmail)', () => {
    expect(istTestEmail('test@x.de')).toBe(true)
    expect(istReservierteTestDomain('test@x.de')).toBe(false)

    expect(istTestEmail('MaxTest@web.de')).toBe(true)
    expect(istReservierteTestDomain('MaxTest@web.de')).toBe(false)

    expect(istTestEmail('smoke.run@y.de')).toBe(true)
    expect(istReservierteTestDomain('smoke.run@y.de')).toBe(false)

    expect(istReservierteTestDomain('contest@firma.de')).toBe(false)
    expect(istReservierteTestDomain('max.mustermann@gmail.com')).toBe(false)
    expect(istReservierteTestDomain('kunde@claimondo.de')).toBe(false)
  })

  // Die reservierte Zeichenfolge muss die DOMAIN sein, nicht irgendwo stehen.
  it('greift nur auf der Domain, nicht im Local-Part', () => {
    expect(istReservierteTestDomain('example.com@gmail.com')).toBe(false)
    expect(istReservierteTestDomain('test@claimondo.de')).toBe(false)
    expect(istReservierteTestDomain('x@testfirma.de')).toBe(false)
  })

  it('ist null/undefined/leer-sicher', () => {
    expect(istReservierteTestDomain(null)).toBe(false)
    expect(istReservierteTestDomain(undefined)).toBe(false)
    expect(istReservierteTestDomain('')).toBe(false)
    expect(istReservierteTestDomain('   ')).toBe(false)
  })
})
