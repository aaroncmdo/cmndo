import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { persistKuerzungsPositionen, type KuerzungsPosition } from './kuerzungs-positionen'

function mockDb(insertResult: { error: { message: string } | null } = { error: null }) {
  const calls: { table: string; rows: Record<string, unknown>[] }[] = []
  const db = {
    from(table: string) {
      return {
        insert(rows: Record<string, unknown>[]) {
          calls.push({ table, rows })
          return Promise.resolve(insertResult)
        },
      }
    },
  } as unknown as SupabaseClient
  return { db, calls }
}

const REF = { fallId: 'fall-1', claimId: 'claim-1' }

describe('persistKuerzungsPositionen', () => {
  it('filtert ungültige typ-Werte raus', async () => {
    const { db, calls } = mockDb()
    const pos: KuerzungsPosition[] = [
      { typ: 'bogus', betrag_gekuerzt: 50 },
      { typ: 'upe', betrag_gekuerzt: 200 },
    ]
    const res = await persistKuerzungsPositionen(db, REF, pos)
    expect(res).toEqual({ ok: true, geschrieben: 1 })
    expect(calls).toHaveLength(1)
    expect(calls[0].rows).toHaveLength(1)
    expect(calls[0].rows[0].typ).toBe('upe')
  })

  it('filtert nicht-finite betrag_gekuerzt raus', async () => {
    const { db, calls } = mockDb()
    const pos: KuerzungsPosition[] = [
      { typ: 'verbringung', betrag_gekuerzt: Number.NaN },
      { typ: 'verbringung', betrag_gekuerzt: 150 },
    ]
    const res = await persistKuerzungsPositionen(db, REF, pos)
    expect(res.geschrieben).toBe(1)
    expect(calls[0].rows[0].betrag_gekuerzt).toBe(150)
  })

  it('leere / komplett gefilterte Liste -> kein insert-Call', async () => {
    const { db, calls } = mockDb()
    const res = await persistKuerzungsPositionen(db, REF, [])
    expect(res).toEqual({ ok: true, geschrieben: 0 })
    expect(calls).toHaveLength(0)
  })

  it('setzt bezeichnung-Fallback aus der Label-Map', async () => {
    const { db, calls } = mockDb()
    await persistKuerzungsPositionen(db, REF, [{ typ: 'upe', betrag_gekuerzt: 200 }])
    expect(calls[0].rows[0].bezeichnung).toBe('UPE-Aufschläge')
  })

  it('behält explizite bezeichnung', async () => {
    const { db, calls } = mockDb()
    await persistKuerzungsPositionen(db, REF, [
      { typ: 'upe', betrag_gekuerzt: 200, bezeichnung: 'UPE laut Schreiben' },
    ])
    expect(calls[0].rows[0].bezeichnung).toBe('UPE laut Schreiben')
  })

  it('setzt quelle=vs_kuerzung + fall_id + claim_id + betrag_gefordert', async () => {
    const { db, calls } = mockDb()
    await persistKuerzungsPositionen(db, REF, [
      { typ: 'wertminderung', betrag_gefordert: 800, betrag_gekuerzt: 300 },
    ])
    const row = calls[0].rows[0]
    expect(row.quelle).toBe('vs_kuerzung')
    expect(row.fall_id).toBe('fall-1')
    expect(row.claim_id).toBe('claim-1')
    expect(row.betrag_gefordert).toBe(800)
    expect(row.betrag_gekuerzt).toBe(300)
  })

  it('betrag_gefordert default null wenn fehlt', async () => {
    const { db, calls } = mockDb()
    await persistKuerzungsPositionen(db, REF, [{ typ: 'mietwagen', betrag_gekuerzt: 90 }])
    expect(calls[0].rows[0].betrag_gefordert).toBeNull()
  })

  it('propagiert insert-Fehler als Result-Object', async () => {
    const { db } = mockDb({ error: { message: 'insert kaputt' } })
    const res = await persistKuerzungsPositionen(db, REF, [{ typ: 'upe', betrag_gekuerzt: 200 }])
    expect(res).toEqual({ ok: false, geschrieben: 0, error: 'insert kaputt' })
  })
})
