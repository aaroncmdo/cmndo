import { describe, it, expect } from 'vitest'
import { PFLICHT_SLOTS, SIGNIERT_SICHTBAR_FUER } from './generate-pflichtdokumente'

// Aaron 04.07.: Widerruf + Datenschutz werden wieder mit-signiert, und ALLE vom
// Kunden mit-signierten Dokumente (inkl. Honorarvereinbarung) sind kunden-sichtbar —
// der Kunde muss alles sehen, was er beim Gutachter unterschreibt. Diese Invarianten
// schuetzen die rechtlich heikle Dokument-Sichtbarkeit gegen versehentliche Regression.
describe('SV-Pflichtdokument-Slots', () => {
  it('umfasst alle vier mit-signierten Rechtsdokumente in fester Reihenfolge', () => {
    expect([...PFLICHT_SLOTS]).toEqual([
      'sv_sicherungsabtretung',
      'sv_honorarvereinbarung',
      'sv_widerrufsbelehrung',
      'sv_datenschutzerklaerung',
    ])
  })

  it('alles Signierte ist kunden- UND gutachter-sichtbar (inkl. Honorarvereinbarung)', () => {
    expect(SIGNIERT_SICHTBAR_FUER).toContain('kunde')
    expect(SIGNIERT_SICHTBAR_FUER).toContain('sachverstaendiger')
  })

  it('Sichtbarkeit deckt alle Akten-Beteiligten ab (admin/KB/SV/Kanzlei/Kunde)', () => {
    expect([...SIGNIERT_SICHTBAR_FUER].sort()).toEqual(
      ['admin', 'kanzlei', 'kunde', 'kundenbetreuer', 'sachverstaendiger'],
    )
  })
})
