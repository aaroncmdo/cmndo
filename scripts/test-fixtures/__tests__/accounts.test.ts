import { describe, it, expect } from 'vitest'
import { Reporter } from '../lib'
import { ensureAccounts } from '../accounts'
import { SV_SACHVERSTAENDIGE_ID } from '../ids'

function fakeDb() {
  const calls: { table: string; op: string; id?: string; arg: Record<string, unknown> }[] = []
  const db = {
    from(table: string) {
      return {
        update: (patch: Record<string, unknown>) => ({
          eq: (_c: string, id: string) => {
            calls.push({ table, op: 'update', id, arg: patch })
            return Promise.resolve({ error: null })
          },
        }),
        upsert: (row: Record<string, unknown>) => {
          calls.push({ table, op: 'upsert', arg: row })
          return Promise.resolve({ error: null })
        },
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      }
    },
  }
  return { db: db as never, calls }
}

describe('ensureAccounts', () => {
  it('entsperrt die test-sv sachverstaendige-Row (gesperrt/deaktiviert -> null, ist_aktiv=true)', async () => {
    const { db, calls } = fakeDb()
    await ensureAccounts(db, { reporter: new Reporter() })
    const svPatch = calls.find((c) => c.table === 'sachverstaendige' && c.id === SV_SACHVERSTAENDIGE_ID)
    expect(svPatch).toBeTruthy()
    expect(svPatch!.arg).toMatchObject({
      gesperrt_grund: null,
      gesperrt_seit: null,
      deaktiviert_am: null,
      deaktiviert_grund: null,
      ist_aktiv: true,
      ist_testaccount: true,
    })
  })
})
