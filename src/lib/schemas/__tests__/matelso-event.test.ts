import { describe, it, expect } from 'vitest'
import { MatelsoEventSchema } from '../matelso-event'

describe('MatelsoEventSchema', () => {
  it('akzeptiert den Mail-Beispiel-Payload (alle Felder Strings)', () => {
    const r = MatelsoEventSchema.safeParse({
      call_id: 'mtl-abc-123',
      anrufer_nummer: '+491701234567',
      angerufene_nummer: '+4922125906530',
      anruf_status: 'answered',
      dauer_sekunden: '120',
      quelle: 'Google Ads Kampagne X',
      zeitpunkt: '2026-05-22T10:15:00Z',
    })
    expect(r.success).toBe(true)
  })

  it('akzeptiert leeres Objekt (unterdrueckte Nummer / fehlende DDD-Keys)', () => {
    const r = MatelsoEventSchema.safeParse({})
    expect(r.success).toBe(true)
  })

  it('akzeptiert dauer_sekunden als number', () => {
    const r = MatelsoEventSchema.safeParse({ anrufer_nummer: '+4915112345678', dauer_sekunden: 42 })
    expect(r.success).toBe(true)
  })

  it('akzeptiert unbekannte Felder (passthrough — matelso darf erweitern)', () => {
    const r = MatelsoEventSchema.safeParse({ anrufer_nummer: '+49170', neues_matelso_feld: 'x' })
    expect(r.success).toBe(true)
    if (r.success) expect((r.data as Record<string, unknown>).neues_matelso_feld).toBe('x')
  })

  it('lehnt nicht-Objekt-Body ab (string)', () => {
    const r = MatelsoEventSchema.safeParse('just-a-string')
    expect(r.success).toBe(false)
  })

  it('lehnt null-Body ab', () => {
    expect(MatelsoEventSchema.safeParse(null).success).toBe(false)
  })

  it('lehnt Array-Body ab', () => {
    const r = MatelsoEventSchema.safeParse([{ anrufer_nummer: '+49170' }])
    expect(r.success).toBe(false)
  })
})
