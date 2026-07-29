import { describe, it, expect } from 'vitest'
import { resolveVermittlerOwnerProfil } from '../owner-resolution'

// Minimaler chainable Fake: from(t).select().eq().maybeSingle() -> { data, error }
function fakeDb(rowByTable: Record<string, unknown>) {
  const make = (table: string) => {
    const c: any = {}
    c.select = () => c
    c.eq = () => c
    c.maybeSingle = () => Promise.resolve({ data: rowByTable[table] ?? null, error: null })
    return c
  }
  return { from: (t: string) => make(t) } as any
}

describe('resolveVermittlerOwnerProfil (Seed-Seite)', () => {
  it('makler -> null (v1 kein Graph-Knoten)', async () => {
    expect(await resolveVermittlerOwnerProfil(fakeDb({}), 'makler', 'm1')).toBeNull()
  })
  it('null typ -> null', async () => {
    expect(await resolveVermittlerOwnerProfil(fakeDb({}), null, null)).toBeNull()
  })
  it('werkstatt -> werkstaetten.user_id', async () => {
    const db = fakeDb({ werkstaetten: { user_id: 'prof-w' } })
    expect(await resolveVermittlerOwnerProfil(db, 'werkstatt', 'w1')).toBe('prof-w')
  })
  it('firmen_flotte -> firmen_flotten_konten.user_id (via konto.id)', async () => {
    const db = fakeDb({ firmen_flotten_konten: { user_id: 'prof-f' } })
    expect(await resolveVermittlerOwnerProfil(db, 'firmen_flotte', 'konto1')).toBe('prof-f')
  })
})
