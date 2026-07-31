import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks der DB-nahen Dependencies (splitOrKeepFaelleUpdate bleibt ECHT — pure Routing-Logik).
const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/claims/get-claim-for-role', () => ({ resolveClaimId: vi.fn().mockResolvedValue('CLAIM-1') }))
vi.mock('./calculate-lead-price', () => ({
  getLeadPriceFromTable: vi.fn().mockResolvedValue({ betrag_netto: 150, typ: 'paket' }),
  isCaseInKontingent: vi.fn().mockResolvedValue(true),
}))

import { processCaseBilling } from './process-case-billing'

// Fake-DB: liefert Claim + Guthaben beim Lesen; der claims.update-LATCH
// (.eq().is().select()) liefert `latchResult`; sachverstaendige.update zaehlt Dekremente.
function fakeDb(opts: { claim: Record<string, unknown>; guthaben: number; latchResult: unknown[] }) {
  const calls = { decrement: 0, latchUsedIsNull: false }
  const db = {
    from: (table: string) => {
      if (table === 'claims') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: opts.claim, error: null }) }) }),
          update: () => ({
            eq: () => ({
              is: (_col: string, _val: unknown) => {
                calls.latchUsedIsNull = true
                return { select: () => Promise.resolve({ data: opts.latchResult, error: null }) }
              },
            }),
          }),
        }
      }
      if (table === 'sachverstaendige') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { werbebudget_guthaben_netto: opts.guthaben }, error: null }) }) }),
          update: () => ({ eq: () => { calls.decrement++; return Promise.resolve({ error: null }) } }),
        }
      }
      return {}
    },
  }
  return { db, calls }
}

// sa_unterschrieben: true = Normalfall (Claim am SA-Signing geboren) — das P4-Gate ist inert.
const baseClaim = { id: 'CLAIM-1', sv_id: 'SV-1', sa_unterschrieben: true, schadens_hoehe_netto: 5000, lead_preis_netto: null, gutachten: [] }

describe('processCaseBilling — Doppel-Abzug-Schutz (atomarer Latch)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('Latch GEWONNEN (1 Zeile) → Guthaben wird genau EINMAL dekrementiert', async () => {
    const { db, calls } = fakeDb({ claim: { ...baseClaim }, guthaben: 300, latchResult: [{ id: 'CLAIM-1' }] })
    createAdminClient.mockReturnValue(db)
    const r = await processCaseBilling('FALL-1')
    expect(calls.latchUsedIsNull).toBe(true) // Marker-Write ist der atomare IS-NULL-Latch
    expect(calls.decrement).toBe(1)
    expect(r).toMatchObject({ guthaben_verrechnet_netto: 150, sv_nachzahlung_netto: 0 })
  })

  it('Latch VERLOREN (0 Zeilen = paralleler/erneuter Lauf) → KEIN Guthaben-Abzug, return null', async () => {
    const { db, calls } = fakeDb({ claim: { ...baseClaim }, guthaben: 300, latchResult: [] })
    createAdminClient.mockReturnValue(db)
    const r = await processCaseBilling('FALL-1')
    expect(calls.decrement).toBe(0) // <-- der Kern: kein Doppel-Abzug
    expect(r).toBeNull()
  })
})

describe('processCaseBilling — P4 SA-Gate (Invariante: kein Billing vor Kunden-Bestaetigung)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sa_unterschrieben=false (SV-Sofort-Claim) → null, KEIN Latch, KEIN Abzug', async () => {
    const { db, calls } = fakeDb({
      claim: { ...baseClaim, sa_unterschrieben: false },
      guthaben: 300,
      latchResult: [{ id: 'CLAIM-1' }],
    })
    createAdminClient.mockReturnValue(db)
    const r = await processCaseBilling('FALL-1')
    expect(r).toBeNull()
    expect(calls.latchUsedIsNull).toBe(false)
    expect(calls.decrement).toBe(0)
  })

  it('sa_unterschrieben=null (Alt-Daten defensiv) → null', async () => {
    const { db, calls } = fakeDb({
      claim: { ...baseClaim, sa_unterschrieben: null },
      guthaben: 300,
      latchResult: [{ id: 'CLAIM-1' }],
    })
    createAdminClient.mockReturnValue(db)
    const r = await processCaseBilling('FALL-1')
    expect(r).toBeNull()
    expect(calls.decrement).toBe(0)
  })
})
