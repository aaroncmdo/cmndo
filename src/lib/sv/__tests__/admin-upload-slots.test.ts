import { describe, it, expect } from 'vitest'
import { ADMIN_UPLOADBARE_SLOTS, istAdminUploadbar } from '../admin-upload-slots'
import { TIER2_SLOTS } from '../tier2-docs'

describe('ADMIN_UPLOADBARE_SLOTS', () => {
  // Der eigentliche Anlass (20.08.): die Tier-2-Nachweise fehlten in der Whitelist,
  // waehrend die UI den Upload-Button fuer JEDEN Slot anbot. Aaron hatte die Dokumente
  // vorliegen, konnte sie aber nicht einpflegen — der Server antwortete
  // "ist nicht admin-uploadbar".
  it.each(TIER2_SLOTS)('laesst den Tier-2-Slot %s vom Admin hochladen', (slot) => {
    expect(istAdminUploadbar(slot)).toBe(true)
  })

  it('enthaelt WEITERHIN die vier Claimondo-Vertragsdokumente (AAR-359 W6)', () => {
    for (const slot of [
      'sv_sicherungsabtretung',
      'sv_honorarvereinbarung',
      'sv_datenschutzerklaerung',
      'sv_widerrufsbelehrung',
    ]) {
      expect(istAdminUploadbar(slot)).toBe(true)
    }
  })

  // Positiv-Kontrolle: ohne sie wuerde ein `return true` alle Tests oben gruen faerben.
  it('lehnt unbekannte und fremde Slots ab', () => {
    expect(istAdminUploadbar('fahrzeugschein')).toBe(false) // Kunden-Dokument
    expect(istAdminUploadbar('sv_gutachten')).toBe(false)
    expect(istAdminUploadbar('')).toBe(false)
    expect(istAdminUploadbar('sv_berufshaftpflicht_x')).toBe(false) // kein Praefix-Match
  })

  // Strukturschutz: die Whitelist SPREADET TIER2_SLOTS, statt die Werte zu kopieren.
  // Kaeme ein dritter Tier-2-Slot dazu, waere er automatisch admin-uploadbar — dieser
  // Test faengt eine spaetere Ruecknahme des Spreads (etwa beim Aufloesen eines Konflikts).
  it('deckt JEDEN Tier-2-Slot ab, auch kuenftige', () => {
    for (const slot of TIER2_SLOTS) {
      expect(ADMIN_UPLOADBARE_SLOTS as readonly string[]).toContain(slot)
    }
  })

  it('enthaelt keine Duplikate', () => {
    expect(new Set(ADMIN_UPLOADBARE_SLOTS).size).toBe(ADMIN_UPLOADBARE_SLOTS.length)
  })
})
