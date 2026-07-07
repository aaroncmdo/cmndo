import { describe, it, expect } from 'vitest'
import {
  piStatusToEinzugAction,
  retryFensterStartDatum,
  pollCooldownCutoff,
  einzugBranchFuerPiStatus,
} from './einzug-retry'

describe('piStatusToEinzugAction', () => {
  it('succeeded -> paid', () => expect(piStatusToEinzugAction('succeeded')).toBe('paid'))
  it('processing -> pending', () => expect(piStatusToEinzugAction('processing')).toBe('pending'))
  it('requires_action -> pending', () => expect(piStatusToEinzugAction('requires_action')).toBe('pending'))
  it('requires_confirmation -> pending', () => expect(piStatusToEinzugAction('requires_confirmation')).toBe('pending'))
  it('requires_capture -> pending', () => expect(piStatusToEinzugAction('requires_capture')).toBe('pending'))
  it('canceled -> retry', () => expect(piStatusToEinzugAction('canceled')).toBe('retry'))
  it('requires_payment_method -> retry', () => expect(piStatusToEinzugAction('requires_payment_method')).toBe('retry'))
  it('unknown -> retry (fail-safe)', () => expect(piStatusToEinzugAction('something_else')).toBe('retry'))
})

describe('retryFensterStartDatum', () => {
  it('returns ISO date 5 days before refMs by default', () => {
    const refMs = new Date('2026-07-07T00:00:00Z').getTime()
    expect(retryFensterStartDatum(refMs)).toBe('2026-07-02')
  })
  it('respects custom tage', () => {
    const refMs = new Date('2026-07-07T00:00:00Z').getTime()
    expect(retryFensterStartDatum(refMs, 3)).toBe('2026-07-04')
  })
})

describe('pollCooldownCutoff', () => {
  it('returns ISO timestamp 20 hours before refMs by default', () => {
    const refMs = new Date('2026-07-07T20:00:00Z').getTime()
    const result = pollCooldownCutoff(refMs)
    expect(result).toBe(new Date('2026-07-07T00:00:00Z').toISOString())
  })
})

describe('einzugBranchFuerPiStatus — frisch erstellter PI -> DB-Status', () => {
  it('succeeded -> paid', () => expect(einzugBranchFuerPiStatus('succeeded')).toBe('paid'))
  it('processing (SEPA) -> im_einzug', () => expect(einzugBranchFuerPiStatus('processing')).toBe('im_einzug'))
  it('requires_payment_method -> fehlgeschlagen', () => expect(einzugBranchFuerPiStatus('requires_payment_method')).toBe('fehlgeschlagen'))
  it('requires_action -> fehlgeschlagen (off_session nicht abschliessbar)', () => expect(einzugBranchFuerPiStatus('requires_action')).toBe('fehlgeschlagen'))
  it('canceled -> fehlgeschlagen', () => expect(einzugBranchFuerPiStatus('canceled')).toBe('fehlgeschlagen'))
  it('unbekannt -> fehlgeschlagen (fail-safe)', () => expect(einzugBranchFuerPiStatus('irgendwas')).toBe('fehlgeschlagen'))
})
