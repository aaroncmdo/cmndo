import { describe, it, expect } from 'vitest'
import { istMeetVideo } from '../kb-termin-sync'

describe('istMeetVideo', () => {
  it('Google-Meet-Link → true (Google gehört dem Meet-Pfad)', () => {
    expect(istMeetVideo('https://meet.google.com/abc-defg-hij')).toBe(true)
  })
  it('Jitsi-Link → false (Engine darf Google-Block anlegen)', () => {
    expect(istMeetVideo('https://meet.jit.si/claimondo-xyz')).toBe(false)
  })
  it('null/undefined/leer → false (Telefon-Termin)', () => {
    expect(istMeetVideo(null)).toBe(false)
    expect(istMeetVideo(undefined)).toBe(false)
    expect(istMeetVideo('')).toBe(false)
  })
})
