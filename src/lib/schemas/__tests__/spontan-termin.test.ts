import { describe, it, expect } from 'vitest'
import { SpontanTerminSchema } from '../spontan-termin'

// AAR-1480 Schema-Tests fuer SpontanTerminSchema.

const validBase = {
  vorname: 'Max',
  nachname: 'Mustermann',
  telefon: '+491701234567',
  email: 'max@example.com',
  besichtigungsortAdresse: 'Hauptstr. 1, 80331 Muenchen',
  besichtigungsortLat: 48.137,
  besichtigungsortLng: 11.575,
  svId: '550e8400-e29b-41d4-a716-446655440000',
  startIso: '2026-05-20T14:00:00+02:00',
  durationMin: 60,
  flowlinkKanal: 'whatsapp' as const,
}

describe('SpontanTerminSchema', () => {
  it('akzeptiert validen Spontan-Termin', () => {
    const r = SpontanTerminSchema.safeParse(validBase)
    expect(r.success).toBe(true)
  })

  it('akzeptiert email=null', () => {
    const r = SpontanTerminSchema.safeParse({ ...validBase, email: null })
    expect(r.success).toBe(true)
  })

  it('akzeptiert besichtigungsort Lat/Lng = null (vor Geocoding)', () => {
    const r = SpontanTerminSchema.safeParse({
      ...validBase,
      besichtigungsortLat: null,
      besichtigungsortLng: null,
    })
    expect(r.success).toBe(true)
  })

  it('lehnt leeren vorname ab (min 1)', () => {
    const r = SpontanTerminSchema.safeParse({ ...validBase, vorname: '' })
    expect(r.success).toBe(false)
  })

  it('lehnt ungueltige svId ab (kein UUID)', () => {
    const r = SpontanTerminSchema.safeParse({ ...validBase, svId: 'not-a-uuid' })
    expect(r.success).toBe(false)
  })

  it('lehnt startIso ohne Offset ab', () => {
    const r = SpontanTerminSchema.safeParse({ ...validBase, startIso: '2026-05-20T14:00:00' })
    expect(r.success).toBe(false)
  })

  it('lehnt durationMin=0 ab', () => {
    const r = SpontanTerminSchema.safeParse({ ...validBase, durationMin: 0 })
    expect(r.success).toBe(false)
  })

  it('lehnt durationMin > 480 ab (max 8h)', () => {
    const r = SpontanTerminSchema.safeParse({ ...validBase, durationMin: 481 })
    expect(r.success).toBe(false)
  })

  it('lehnt durationMin = float ab (int erforderlich)', () => {
    const r = SpontanTerminSchema.safeParse({ ...validBase, durationMin: 60.5 })
    expect(r.success).toBe(false)
  })

  it('lehnt ungueltigen flowlinkKanal ab (Enum-Violation)', () => {
    const r = SpontanTerminSchema.safeParse({
      ...validBase,
      flowlinkKanal: 'fax' as unknown as 'whatsapp',
    })
    expect(r.success).toBe(false)
  })

  it('akzeptiert alle 4 flowlinkKanal-Werte', () => {
    for (const kanal of ['whatsapp', 'sms', 'email', 'kein'] as const) {
      const r = SpontanTerminSchema.safeParse({ ...validBase, flowlinkKanal: kanal })
      expect(r.success).toBe(true)
    }
  })

  it('lehnt Lat ausserhalb [-90, 90] ab', () => {
    const r = SpontanTerminSchema.safeParse({ ...validBase, besichtigungsortLat: 95 })
    expect(r.success).toBe(false)
  })

  it('lehnt Lng ausserhalb [-180, 180] ab', () => {
    const r = SpontanTerminSchema.safeParse({ ...validBase, besichtigungsortLng: 200 })
    expect(r.success).toBe(false)
  })
})
