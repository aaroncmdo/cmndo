import { describe, it, expect } from 'vitest'
import { seedeKundenBindungFirstTouch } from '../bindung'

// Fake: from('claims').select().eq().maybeSingle() -> claimRow; from('profiles').update().eq().is() erfasst.
function fakeDb(claimRow: unknown) {
  const updates: { table: string; patch: any; filters: [string, unknown][] }[] = []
  const make = (table: string) => {
    const c: any = {}; let patch: any = null; const filters: [string, unknown][] = []
    c.select = () => c
    c.eq = (col: string, val: unknown) => { filters.push([col, val]); return c }
    c.is = (col: string, val: unknown) => { filters.push([`is:${col}`, val]); return c }
    c.maybeSingle = () => Promise.resolve({ data: claimRow, error: null })
    c.update = (p: any) => { patch = p; return c }
    c.then = (res: (v: unknown) => unknown) => { if (patch) updates.push({ table, patch, filters }); return Promise.resolve({ error: null }).then(res) }
    return c
  }
  return { _updates: updates, from: (t: string) => make(t) } as any
}

describe('seedeKundenBindungFirstTouch', () => {
  it('Owner am Claim -> profiles First-Touch-Update mit IS-NULL-Guard', async () => {
    const db = fakeDb({ netzwerk_owner_id: 'owner-1' })
    await seedeKundenBindungFirstTouch(db, 'kunde-1', 'claim-1')
    expect(db._updates).toHaveLength(1)
    const u = db._updates[0]
    expect(u.table).toBe('profiles')
    expect(u.patch.netzwerk_owner_id).toBe('owner-1')
    expect(u.patch.netzwerk_owner_seit).toBeTruthy()
    expect(u.filters).toContainEqual(['id', 'kunde-1'])
    expect(u.filters).toContainEqual(['is:netzwerk_owner_id', null]) // First-Touch: nie ueberschreiben
  })
  it('Kein Owner am Claim -> kein Update (No-op)', async () => {
    const db = fakeDb({ netzwerk_owner_id: null })
    await seedeKundenBindungFirstTouch(db, 'kunde-1', 'claim-1')
    expect(db._updates).toHaveLength(0)
  })
})
