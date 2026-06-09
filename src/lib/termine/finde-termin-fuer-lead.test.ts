import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findeTerminFuerLead } from './finde-termin-fuer-lead'

type Row = { id: string; sv_id: string | null; start_zeit: string }
const r = (id: string, sv: string | null, start: string): Row => ({ id, sv_id: sv, start_zeit: start })

// Stub: branched über die ERSTE .eq()-Spalte — bezug-Query startet mit eq('bezug_typ'),
// Legacy-Query mit eq('lead_id'). .in() ist der terminale Promise.
const makeDb = (bezugRows: Row[], legacyRows: Row[]) =>
  ({
    from: () => {
      let firstEqCol: string | null = null
      const chain: Record<string, (...a: unknown[]) => unknown> = {
        select: () => chain,
        eq: (col: unknown) => {
          if (firstEqCol === null) firstEqCol = col as string
          return chain
        },
        in: () => Promise.resolve({ data: firstEqCol === 'lead_id' ? legacyRows : bezugRows, error: null }),
      }
      return chain
    },
  }) as unknown as SupabaseClient

describe('findeTerminFuerLead — Dual-Lookup (Legacy lead_id ∪ Engine bezug)', () => {
  it('findet einen Legacy-Termin (nur lead_id)', async () => {
    const db = makeDb([], [r('t1', 'sv1', '2026-07-01T09:00:00Z')])
    expect(await findeTerminFuerLead(db, 'L1')).toEqual({ id: 't1', sv_id: 'sv1' })
  })

  it('findet einen Engine-Termin (nur bezug_typ=lead/bezug_id)', async () => {
    const db = makeDb([r('t2', 'sv2', '2026-07-01T09:00:00Z')], [])
    expect(await findeTerminFuerLead(db, 'L1')).toEqual({ id: 't2', sv_id: 'sv2' })
  })

  it('dedupt einen Termin, der in BEIDEN Lookups auftaucht (lead_id UND bezug gesetzt)', async () => {
    const t = r('t3', 'sv3', '2026-07-01T09:00:00Z')
    const db = makeDb([t], [t])
    expect(await findeTerminFuerLead(db, 'L1')).toEqual({ id: 't3', sv_id: 'sv3' })
  })

  it('liefert den NEUESTEN (start_zeit desc) quellenübergreifend', async () => {
    const db = makeDb([r('alt', 'svA', '2026-07-01T09:00:00Z')], [r('neu', 'svB', '2026-07-10T09:00:00Z')])
    expect(await findeTerminFuerLead(db, 'L1')).toEqual({ id: 'neu', sv_id: 'svB' })
  })

  it('null, wenn kein aktiver Termin existiert', async () => {
    expect(await findeTerminFuerLead(makeDb([], []), 'L1')).toBeNull()
  })

  it('sv_id darf null sein (sv_lead/kb-Assignee)', async () => {
    const db = makeDb([], [r('t4', null, '2026-07-01T09:00:00Z')])
    expect(await findeTerminFuerLead(db, 'L1')).toEqual({ id: 't4', sv_id: null })
  })
})
