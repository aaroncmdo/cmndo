import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cancelOffeneTermineFuerFall } from '../cancel-offene-termine'

// Stub-db: select aktive Termine (eq.in) -> Liste; update (eq.in.select) -> {data:[{id}]} (sageAb-Erfolg).
function stubDb(aktive: { id: string }[]): { db: SupabaseClient; updates: string[] } {
  const updates: string[] = []
  const db = {
    from: () => ({
      select: () => ({
        eq: function () { return this },
        in: async () => ({ data: aktive, error: null }),
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
  return { db, updates }
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
})
