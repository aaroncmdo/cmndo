// src/lib/email/__tests__/zustellstatus.test.ts — Zustellstatus transaktionaler Mails (Befund 05.09.2026)
import { describe, it, expect } from 'vitest'
import { mapResendEventFuerEmailLog, sollEmailLogStatusUebernehmen } from '../zustellstatus'

describe('mapResendEventFuerEmailLog', () => {
  it('bildet die vier zustellrelevanten Ereignisse ab', () => {
    expect(mapResendEventFuerEmailLog('email.sent')).toBe('sent')
    expect(mapResendEventFuerEmailLog('email.delivered')).toBe('delivered')
    expect(mapResendEventFuerEmailLog('email.bounced')).toBe('bounced')
    expect(mapResendEventFuerEmailLog('email.complained')).toBe('complained')
  })
  it('ignoriert Oeffnungen und Klicks (Tracking-Pixel, kein Zustellbeleg, kein Leseverhalten in email_log)', () => {
    expect(mapResendEventFuerEmailLog('email.opened')).toBeNull()
    expect(mapResendEventFuerEmailLog('email.clicked')).toBeNull()
  })
  it('ignoriert Unbekanntes ohne zu werfen', () => {
    expect(mapResendEventFuerEmailLog('email.delivery_delayed')).toBeNull()
    expect(mapResendEventFuerEmailLog('contact.created')).toBeNull()
    expect(mapResendEventFuerEmailLog('')).toBeNull()
  })
})

describe('sollEmailLogStatusUebernehmen — nur aufwaerts (out-of-order + Svix-Retries)', () => {
  it('sent -> delivered ja, delivered -> sent nein', () => {
    expect(sollEmailLogStatusUebernehmen('sent', 'delivered')).toBe(true)
    expect(sollEmailLogStatusUebernehmen('delivered', 'sent')).toBe(false)
  })
  it('derselbe Event nochmal schreibt nicht (idempotent)', () => {
    expect(sollEmailLogStatusUebernehmen('delivered', 'delivered')).toBe(false)
    expect(sollEmailLogStatusUebernehmen('bounced', 'bounced')).toBe(false)
  })
  it('ein spaet eintreffendes delivered ueberschreibt KEINEN Bounce', () => {
    expect(sollEmailLogStatusUebernehmen('bounced', 'delivered')).toBe(false)
    expect(sollEmailLogStatusUebernehmen('complained', 'delivered')).toBe(false)
  })
  it('Bounce und Beschwerde gewinnen gegen sent und delivered', () => {
    expect(sollEmailLogStatusUebernehmen('sent', 'bounced')).toBe(true)
    expect(sollEmailLogStatusUebernehmen('delivered', 'bounced')).toBe(true)
    expect(sollEmailLogStatusUebernehmen('delivered', 'complained')).toBe(true)
  })
  it('failed beschreibt die Uebergabe, nicht die Zustellung — ein Provider-Ereignis ist genauer', () => {
    expect(sollEmailLogStatusUebernehmen('failed', 'delivered')).toBe(true)
    expect(sollEmailLogStatusUebernehmen('failed', 'bounced')).toBe(true)
  })
  it('unbekannter Ist-Wert zaehlt als niedrigster Rang (nie blockierend)', () => {
    expect(sollEmailLogStatusUebernehmen(null, 'delivered')).toBe(true)
    expect(sollEmailLogStatusUebernehmen('kaputt', 'sent')).toBe(true)
  })
})
