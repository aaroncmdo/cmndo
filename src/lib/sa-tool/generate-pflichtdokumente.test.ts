import { describe, it, expect } from 'vitest'
import { PFLICHT_SLOTS, KUNDEN_VERTRAG_SLOTS } from './generate-pflichtdokumente'

// Aaron 04.07.: Widerruf + Datenschutz werden wieder mit-signiert (Ruecknahme des
// AAR-360-Zwischenstands). Diese Invarianten schuetzen die rechtlich heikle
// Dokument-Sichtbarkeit gegen versehentliche Regression.
describe('SV-Pflichtdokument-Slots', () => {
  it('umfasst alle vier mit-signierten Rechtsdokumente in fester Reihenfolge', () => {
    expect([...PFLICHT_SLOTS]).toEqual([
      'sv_sicherungsabtretung',
      'sv_honorarvereinbarung',
      'sv_widerrufsbelehrung',
      'sv_datenschutzerklaerung',
    ])
  })

  it('Kunde sieht SA + Widerruf + Datenschutz — aber NICHT die Honorarvereinbarung', () => {
    expect(KUNDEN_VERTRAG_SLOTS.has('sv_sicherungsabtretung')).toBe(true)
    expect(KUNDEN_VERTRAG_SLOTS.has('sv_widerrufsbelehrung')).toBe(true)
    expect(KUNDEN_VERTRAG_SLOTS.has('sv_datenschutzerklaerung')).toBe(true)
    expect(KUNDEN_VERTRAG_SLOTS.has('sv_honorarvereinbarung')).toBe(false)
  })

  it('jeder Kunden-Vertrag-Slot ist auch ein Pflicht-Slot (kein Tippfehler)', () => {
    for (const slot of KUNDEN_VERTRAG_SLOTS) {
      expect((PFLICHT_SLOTS as readonly string[]).includes(slot)).toBe(true)
    }
  })
})
