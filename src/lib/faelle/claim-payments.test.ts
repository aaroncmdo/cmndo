import { describe, it, expect } from 'vitest'
import { upsertClaimPayment, getClaimPayments } from './claim-payments'

// Minimaler Fake-Supabase-Client, der die Aufrufe aufzeichnet (kein echter DB-Zugriff).
function fakeDb(existingId: string | null) {
  const calls = { inserted: null as unknown, updated: null as unknown, selectedEq: {} as Record<string, unknown> }
  const builder: Record<string, unknown> = {
    select() { return builder },
    eq(col: string, val: unknown) { calls.selectedEq[col] = val; return builder },
    maybeSingle() { return Promise.resolve({ data: existingId ? { id: existingId } : null, error: null }) },
    update(patch: unknown) { calls.updated = patch; return { eq() { return Promise.resolve({ error: null }) } } },
    insert(row: unknown) { calls.inserted = row; return Promise.resolve({ error: null }) },
  }
  return { db: { from: () => builder } as never, calls }
}

describe('upsertClaimPayment', () => {
  it('inserts a new sv-row with richtung=auszahlung + filtert select auf partei', async () => {
    const { db, calls } = fakeDb(null)
    const res = await upsertClaimPayment(db, 'claim-1', 'sv',
      { erhaltener_betrag: 300, zahlungseingang_am: '2026-07-07' }, 'user-1')
    expect(res.ok).toBe(true)
    expect(calls.selectedEq.claim_id).toBe('claim-1')
    expect(calls.selectedEq.partei).toBe('sv')
    expect(calls.inserted).toMatchObject({
      claim_id: 'claim-1', partei: 'sv', richtung: 'auszahlung',
      erhaltener_betrag: 300, zahlungseingang_am: '2026-07-07', created_by_user_id: 'user-1',
    })
  })

  it('updated die bestehende (claim,partei)-Row statt zu inserten, richtung=eingang fuer vs', async () => {
    const { db, calls } = fakeDb('row-9')
    const res = await upsertClaimPayment(db, 'claim-1', 'vs', { erhaltener_betrag: 5000 })
    expect(res.ok).toBe(true)
    expect(calls.inserted).toBeNull()
    expect(calls.updated).toMatchObject({ erhaltener_betrag: 5000, richtung: 'eingang' })
  })
})

describe('getClaimPayments', () => {
  it('gruppiert claim_payments-Zeilen nach partei (vs/kunde/sv)', async () => {
    const rows = [
      { partei: 'vs', forderungsbetrag: 5000, erhaltener_betrag: 5000, zahlungseingang_am: '2026-07-06', status: 'erhalten' },
      { partei: 'kunde', forderungsbetrag: null, erhaltener_betrag: 3000, zahlungseingang_am: '2026-07-07', status: null },
    ]
    const db = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }) }) } as never
    const res = await getClaimPayments(db, 'claim-1')
    expect(res.vs?.erhaltener_betrag).toBe(5000)
    expect(res.kunde?.erhaltener_betrag).toBe(3000)
    expect(res.sv).toBeNull()
  })

  it('liefert alle-null bei DB-Fehler (graceful)', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) } as never
    const res = await getClaimPayments(db, 'claim-1')
    expect(res).toEqual({ vs: null, kunde: null, sv: null })
  })
})
