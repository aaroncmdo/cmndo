import { describe, it, expect } from 'vitest'
import {
  piStatusToEinzugAction,
  retryFensterStartDatum,
  pollCooldownCutoff,
  EINZUG_RETRY_WINDOW_TAGE,
  EINZUG_POLL_COOLDOWN_H,
} from '../einzug-retry'

describe('piStatusToEinzugAction (Doppelbelastungs-Schutz)', () => {
  it('succeeded -> paid', () => {
    expect(piStatusToEinzugAction('succeeded')).toBe('paid')
  })

  it('laufende Stati -> pending (NICHT neu anlegen = keine Doppelbelastung)', () => {
    for (const s of ['processing', 'requires_action', 'requires_confirmation', 'requires_capture']) {
      expect(piStatusToEinzugAction(s)).toBe('pending')
    }
  })

  it('terminal-nicht-erfolgreiche Stati -> retry', () => {
    for (const s of ['canceled', 'requires_payment_method']) {
      expect(piStatusToEinzugAction(s)).toBe('retry')
    }
  })

  it('unbekannter Status -> retry (konservativ; Neuanlage ist idempotent via vorheriges Retrieve)', () => {
    expect(piStatusToEinzugAction('irgendwas_neues')).toBe('retry')
  })
})

describe('retryFensterStartDatum / pollCooldownCutoff', () => {
  const REF = Date.UTC(2026, 6, 10, 12, 0, 0) // 2026-07-10T12:00:00Z

  it('Retry-Fenster-Start = ref - WINDOW Tage (YYYY-MM-DD)', () => {
    expect(retryFensterStartDatum(REF)).toBe('2026-07-05')
    expect(EINZUG_RETRY_WINDOW_TAGE).toBe(5)
  })

  it('Poll-Cutoff = ref - COOLDOWN Stunden (ISO)', () => {
    // 12:00 - 20h = Vortag 16:00
    expect(pollCooldownCutoff(REF)).toBe('2026-07-09T16:00:00.000Z')
    expect(EINZUG_POLL_COOLDOWN_H).toBe(20)
  })
})
