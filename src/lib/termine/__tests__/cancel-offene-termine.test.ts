import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cancelOffeneTermineFuerFall, cancelOffeneTermineFuerBezug } from '../cancel-offene-termine'

// Stub-db: select aktive Termine (or.in) -> Liste; update (eq.in.select) -> {data:[{id}]} (sageAb-Erfolg).
// `orExpr` faengt den PostgREST-Ausdruck mit, damit die Achse (fall vs lead) pruefbar ist.
function stubDb(aktive: { id: string }[]): { db: SupabaseClient; updates: string[]; orExprs: string[] } {
  const updates: string[] = []
  const orExprs: string[] = []
  const db = {
    from: () => ({
      select: () => ({
        // P3.3: die Funktion filtert bezug-aware via .or(bezugOrExpr(...)) — der alte Stub
        // kannte nur .eq() und liess die Kette ins Leere laufen (Test war deshalb rot).
        or: (expr: string) => {
          orExprs.push(expr)
          return { in: async () => ({ data: aktive, error: null }) }
        },
      }),
      update: () => ({
        eq: (_c: string, id: string) => ({
          in: () => ({
            select: async () => { updates.push(id); return { data: [{ id }], error: null } },
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
  return { db, updates, orExprs }
}

describe('cancelOffeneTermineFuerFall', () => {
  it('cancelt jeden aktiven Termin (sageAb pro Termin)', async () => {
    const { db, updates } = stubDb([{ id: 't1' }, { id: 't2' }])
    await cancelOffeneTermineFuerFall(db, 'f1', 'storno_test')
    expect(updates.sort()).toEqual(['t1', 't2'])
  })

  it('kein aktiver Termin -> no-op (kein Throw)', async () => {
    const { db, updates } = stubDb([])
    await cancelOffeneTermineFuerFall(db, 'f1', 'storno_test')
    expect(updates).toEqual([])
  })

  it('filtert auf der fall-Achse', async () => {
    const { db, orExprs } = stubDb([{ id: 't1' }])
    await cancelOffeneTermineFuerFall(db, 'f1', 'storno_test')
    expect(orExprs[0]).toContain('fall_id.eq.f1')
  })
})

describe('cancelOffeneTermineFuerBezug', () => {
  // Ops-Test 11.08. (RC-5): Bei Quali-Disqualifikation (Eigenverschulden/Werkstattbindung)
  // haengt der Termin an der LEAD-Achse — der Lead ist noch nicht konvertiert, es gibt
  // keinen Fall. Ohne diese Achse blieb der Slot des Gutachters blockiert.
  it('filtert auf der lead-Achse und cancelt', async () => {
    const { db, updates, orExprs } = stubDb([{ id: 't9' }])
    await cancelOffeneTermineFuerBezug(db, 'lead', 'l1', 'quali_disqualifiziert')
    expect(orExprs[0]).toContain('lead_id.eq.l1')
    expect(orExprs[0]).toContain('bezug_typ.eq.lead')
    expect(updates).toEqual(['t9'])
  })

  it('leere ID -> no-op (kein versehentlicher Massen-Cancel)', async () => {
    const { db, updates } = stubDb([{ id: 't1' }])
    await cancelOffeneTermineFuerBezug(db, 'lead', '', 'quali_disqualifiziert')
    expect(updates).toEqual([])
  })
})
