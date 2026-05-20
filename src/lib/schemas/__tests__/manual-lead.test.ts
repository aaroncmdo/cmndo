import { describe, it, expect } from 'vitest'
import { ManualLeadSchema, LACKFARBE_CODES } from '../manual-lead'

// AAR-1480 Schema-Tests fuer ManualLeadSchema.

const minimalValid = {
  vorname: '',
  nachname: '',
  telefon: '',
  email: '',
  kunde_adresse: '',
  kunde_strasse: '',
  kunde_plz: '',
  kunde_stadt: '',
  kunde_lat: null,
  kunde_lng: null,
  source_channel: 'manuell',
  notizen: '',
}

describe('ManualLeadSchema', () => {
  it('akzeptiert Quick-Create-Stub mit leeren Strings (source_channel + notizen reichen)', () => {
    const r = ManualLeadSchema.safeParse(minimalValid)
    expect(r.success).toBe(true)
  })

  it('akzeptiert vollstaendigen Lead mit allen Feldern', () => {
    const r = ManualLeadSchema.safeParse({
      ...minimalValid,
      anrede: 'frau',
      vorname: 'Max',
      nachname: 'Mustermann',
      telefon: '+491701234567',
      email: 'max@example.com',
      fahrzeug_hersteller: 'BMW',
      fahrzeug_modell: '320i',
      lackfarbe_code: 'silber',
      fahrzeug_farbe: 'Silber-Metallic',
      kennzeichen: 'M-XX 1234',
      kunde_adresse: 'Hauptstr. 1, 80331 Muenchen',
      kunde_strasse: 'Hauptstr. 1',
      kunde_plz: '80331',
      kunde_stadt: 'Muenchen',
      kunde_lat: 48.137,
      kunde_lng: 11.575,
      source_channel: 'dispatch-form',
      notizen: 'Anruf 13:00',
    })
    expect(r.success).toBe(true)
  })

  it('lehnt source_channel leer ab (min 1)', () => {
    const r = ManualLeadSchema.safeParse({ ...minimalValid, source_channel: '' })
    expect(r.success).toBe(false)
  })

  it('lehnt fehlende Pflicht-Strings ab (vorname als number)', () => {
    const r = ManualLeadSchema.safeParse({ ...minimalValid, vorname: 123 as unknown as string })
    expect(r.success).toBe(false)
  })

  it('lehnt ungueltigen lackfarbe_code ab (Enum-Violation)', () => {
    const r = ManualLeadSchema.safeParse({ ...minimalValid, lackfarbe_code: 'rosa' as unknown as 'rot' })
    expect(r.success).toBe(false)
  })

  it('akzeptiert alle dokumentierten Lackfarbe-Codes', () => {
    for (const code of LACKFARBE_CODES) {
      const r = ManualLeadSchema.safeParse({ ...minimalValid, lackfarbe_code: code })
      expect(r.success).toBe(true)
    }
  })

  it('lehnt zu langen vorname ab (max 100)', () => {
    const r = ManualLeadSchema.safeParse({ ...minimalValid, vorname: 'X'.repeat(101) })
    expect(r.success).toBe(false)
  })

  it('akzeptiert null fuer kunde_lat/lng (Lead-Stub vor Geocoding)', () => {
    const r = ManualLeadSchema.safeParse({ ...minimalValid, kunde_lat: null, kunde_lng: null })
    expect(r.success).toBe(true)
  })

  it('akzeptiert null fuer optionale Fahrzeug-Felder', () => {
    const r = ManualLeadSchema.safeParse({
      ...minimalValid,
      fahrzeug_hersteller: null,
      fahrzeug_modell: null,
      lackfarbe_code: null,
      fahrzeug_farbe: null,
      kennzeichen: null,
    })
    expect(r.success).toBe(true)
  })

  it('akzeptiert anrede=null (unbekannte Anrede)', () => {
    const r = ManualLeadSchema.safeParse({ ...minimalValid, anrede: null })
    expect(r.success).toBe(true)
  })
})
