import { describe, it, expect } from 'vitest'
import { istInterneEmail, istInterneIdentitaet } from '../interne-identitaet'

// Regression-Guard fuer den Test-SV-Guard (2026-07-03): interne/Test-Leads duerfen NIE
// einen echten Sachverstaendigen buchen/benachrichtigen. Firmendomain @claimondo.de = intern
// (Aaron-Entscheid) — genau die aaron.sprafke@ / info@claimondo.de-Leads hatten den echten
// SV (UnfallSafe/Koeln) gebucht.
describe('istInterneEmail — Firmendomain + Test-Marker', () => {
  it('erkennt @claimondo.de (Gruender-Test-Leads) als intern', () => {
    expect(istInterneEmail('aaron.sprafke@claimondo.de')).toBe(true)
    expect(istInterneEmail('info@claimondo.de')).toBe(true)
    expect(istInterneEmail('aaron.sprafke+kunde15@claimondo.de')).toBe(true)
    expect(istInterneEmail('NICOLAS.KITTA@Claimondo.de')).toBe(true) // case-insensitiv
  })

  it('erkennt @claimondo.test und @claimondo-test.de als intern', () => {
    expect(istInterneEmail('smoke-sv@claimondo.test')).toBe(true)
    expect(istInterneEmail('max.fresh@claimondo-test.de')).toBe(true)
  })

  it('erkennt test/smoke/e2e-Marker auf Fremd-Domains als intern', () => {
    expect(istInterneEmail('test-user@example.com')).toBe(true)
    expect(istInterneEmail('e2e-runner@gmail.com')).toBe(true)
    expect(istInterneEmail('claude.smoke@gmail.com')).toBe(true)
  })

  it('laesst echte externe Kunden durch (nicht intern)', () => {
    expect(istInterneEmail('anja.harig@icloud.com')).toBe(false)
    expect(istInterneEmail('hans.mueller@gmail.com')).toBe(false)
    expect(istInterneEmail('kontakt@autohaus-koeln.de')).toBe(false)
  })

  it('keine False-Positives bei test-aehnlichen echten Adressen', () => {
    expect(istInterneEmail('testarossa@ferrari.de')).toBe(false)
    expect(istInterneEmail('contest@web.de')).toBe(false)
    expect(istInterneEmail('qadir@gmail.com')).toBe(false)
  })

  it('leere/fehlende Email ist nicht intern (fail-open)', () => {
    expect(istInterneEmail(null)).toBe(false)
    expect(istInterneEmail(undefined)).toBe(false)
    expect(istInterneEmail('')).toBe(false)
    expect(istInterneEmail('   ')).toBe(false)
    expect(istInterneEmail('keine-email')).toBe(false)
  })
})

describe('istInterneIdentitaet — Email ODER Platzhalter-Name', () => {
  it('erkennt Platzhalter-Namen (Mustermann) auch bei externer Email', () => {
    expect(istInterneIdentitaet('irgendwer@gmail.com', 'Max Mustermann')).toBe(true)
    expect(istInterneIdentitaet(null, 'Mustermann')).toBe(true)
  })

  it('echter Kunde mit echtem Namen ist nicht intern', () => {
    expect(istInterneIdentitaet('anja.harig@icloud.com', 'Anja Harig')).toBe(false)
    expect(istInterneIdentitaet(null, null)).toBe(false)
  })
})
