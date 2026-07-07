import { describe, it, expect, vi } from 'vitest'
import { handleEinzugPaymentFailed } from './einzug-webhook'

function fakeDb(neqResult: { error: null | { message: string } } = { error: null }) {
  const calls: any[] = []
  const chain: any = {}
  chain.update = vi.fn((patch: any) => { calls.push({ op: 'update', patch }); return chain })
  chain.eq = vi.fn((c: string, v: any) => { calls.push({ op: 'eq', c, v }); return chain })
  chain.neq = vi.fn((c: string, v: any) => { calls.push({ op: 'neq', c, v }); return Promise.resolve(neqResult) })
  const db: any = { from: vi.fn(() => chain), _calls: calls }
  return db
}

describe('handleEinzugPaymentFailed', () => {
  it('setzt fehlgeschlagen idempotent fuer abrechnung_id', async () => {
    const db = fakeDb()
    const r = await handleEinzugPaymentFailed(db, {
      metadata: { abrechnung_id: 'abr-1', abrechnungs_nr: 'R-2026-001' },
      amount: 11900,
      last_payment_error: { message: 'insufficient_funds' },
    })
    expect(r.acted).toBe(true)
    expect(r.abrId).toBe('abr-1')
    expect(r.grund).toBe('insufficient_funds')
    expect(r.betragBrutto).toBe(119)
    const patch = db._calls.find((c: any) => c.op === 'update')?.patch
    expect(patch.status).toBe('fehlgeschlagen')
    expect(db._calls.some((c: any) => c.op === 'neq' && c.c === 'status' && c.v === 'bezahlt')).toBe(true)
  })

  it('no-op ohne abrechnung_id', async () => {
    const db = fakeDb()
    const r = await handleEinzugPaymentFailed(db, { metadata: { gutachter_id: 'g-1' } })
    expect(r.acted).toBe(false)
    expect(db.from).not.toHaveBeenCalled()
  })

  it('wirft bei DB-Fehler damit Stripe retry ausgeloest wird', async () => {
    const db = fakeDb({ error: { message: 'db down' } })
    await expect(
      handleEinzugPaymentFailed(db, { metadata: { abrechnung_id: 'abr-1' }, amount: 100 })
    ).rejects.toThrow(/update failed/)
  })
})
