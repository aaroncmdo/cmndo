import { describe, it, expect } from 'vitest'
import { isWinbackEligible, type WinbackLead } from './winback'

// Win-back = einmalige Reaktivierung erreichbarer TOTER Leads (kalt / Timeout-
// disqualifiziert), die den mini_wizard/self-service-Flow begonnen, aber nie
// abgeschlossen haben. RECHTLICH KRITISCH: 'eigenverantwortung' (Eigenverschulden
// = kein Anspruch gegen die Gegenseite) darf NIE reaktiviert werden.

const base: WinbackLead = {
  status: 'kalt',
  disqualifiziert_grund_key: null,
  email: 'max@example.de',
  reminder_token: 'tok-123',
  winback_opt_out: false,
  winback_sent_at: null,
}

describe('isWinbackEligible', () => {
  it('kalt mit Kontakt+Token = erholbar', () => {
    expect(isWinbackEligible(base)).toBe(true)
  })

  it('disqualifiziert wegen timeout = erholbar (nur Zeit gerissen)', () => {
    expect(isWinbackEligible({ ...base, status: 'disqualifiziert', disqualifiziert_grund_key: 'timeout' })).toBe(true)
  })

  it('disqualifiziert wegen eigenverantwortung = NIE (kein Anspruch)', () => {
    expect(isWinbackEligible({ ...base, status: 'disqualifiziert', disqualifiziert_grund_key: 'eigenverantwortung' })).toBe(false)
  })

  it('disqualifiziert ohne/mit unbekanntem Grund = nein (nur explizit timeout)', () => {
    expect(isWinbackEligible({ ...base, status: 'disqualifiziert', disqualifiziert_grund_key: null })).toBe(false)
    expect(isWinbackEligible({ ...base, status: 'disqualifiziert', disqualifiziert_grund_key: 'unklar' })).toBe(false)
  })

  it('aktive Stati (neu/umgewandelt/flow-gesendet) = nein', () => {
    for (const status of ['neu', 'umgewandelt', 'flow-gesendet', 'quali-offen', 'rueckruf']) {
      expect(isWinbackEligible({ ...base, status })).toBe(false)
    }
  })

  it('ohne Email ODER ohne Token = nein (Mail nicht zustellbar/kein Resume-Link)', () => {
    expect(isWinbackEligible({ ...base, email: null })).toBe(false)
    expect(isWinbackEligible({ ...base, email: '   ' })).toBe(false)
    expect(isWinbackEligible({ ...base, reminder_token: null })).toBe(false)
  })

  it('opted-out = nein (Abmeldung respektieren)', () => {
    expect(isWinbackEligible({ ...base, winback_opt_out: true })).toBe(false)
  })

  it('schon gesendet = nein (Idempotenz, kein Doppel-Blast)', () => {
    expect(isWinbackEligible({ ...base, winback_sent_at: '2026-07-03T00:00:00Z' })).toBe(false)
  })
})
