import { describe, it, expect } from 'vitest'
import { normalizeE164 } from '../send-sms-plain'

// AAR-956: E.164-Normalisierung für den Plain-SMS-Fallback. Reihenfolge ist
// wichtig — '00' MUSS vor '0' geprüft werden, sonst wird "0049…" als deutsche
// 0-Nummer fehlinterpretiert.
describe('normalizeE164', () => {
  it('00-Präfix → +', () => {
    expect(normalizeE164('00491633628571')).toBe('+491633628571')
  })
  it('führende 0 → +49 (deutsche Nummer)', () => {
    expect(normalizeE164('01633628571')).toBe('+491633628571')
  })
  it('bereits +E.164 bleibt unverändert', () => {
    expect(normalizeE164('+491633628571')).toBe('+491633628571')
  })
  it('Leerzeichen werden entfernt', () => {
    expect(normalizeE164('+49 163 3628571')).toBe('+491633628571')
  })
  it('nackte Nummer ohne Präfix bekommt +', () => {
    expect(normalizeE164('491633628571')).toBe('+491633628571')
  })
})
