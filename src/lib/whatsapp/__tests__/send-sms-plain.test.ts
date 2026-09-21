import { describe, it, expect } from 'vitest'
import { normalizeE164 } from '../send-sms-plain'

// AAR-956: E.164-Normalisierung für den Plain-SMS-Fallback. Reihenfolge ist
// wichtig — '00' MUSS vor '0' geprüft werden, sonst wird "0049…" als deutsche
// 0-Nummer fehlinterpretiert.
describe('normalizeE164', () => {
  it('00-Präfix → +', () => {
    expect(normalizeE164('00491231234567')).toBe('+491231234567')
  })
  it('führende 0 → +49 (deutsche Nummer)', () => {
    expect(normalizeE164('01231234567')).toBe('+491231234567')
  })
  it('bereits +E.164 bleibt unverändert', () => {
    expect(normalizeE164('+491231234567')).toBe('+491231234567')
  })
  it('Leerzeichen werden entfernt', () => {
    expect(normalizeE164('+49 123 1234567')).toBe('+491231234567')
  })
  it('nackte Nummer ohne Präfix bekommt +', () => {
    expect(normalizeE164('491231234567')).toBe('+491231234567')
  })
})
