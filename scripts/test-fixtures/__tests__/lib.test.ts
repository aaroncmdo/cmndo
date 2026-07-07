import { describe, it, expect } from 'vitest'
import { Reporter, upsertById } from '../lib'

// Fake-db: zeichnet from(table).upsert(row)/update(patch).eq('id',id) auf.
function fakeDb() {
  const calls: { table: string; op: string; arg: unknown }[] = []
  const db = {
    from(table: string) {
      return {
        upsert: (row: unknown) => {
          calls.push({ table, op: 'upsert', arg: row })
          return Promise.resolve({ error: null })
        },
        update: (patch: unknown) => ({
          eq: (_c: string, _v: string) => {
            calls.push({ table, op: 'update', arg: patch })
            return Promise.resolve({ error: null })
          },
        }),
        select: (_c: string) => ({
          eq: (_col: string, _v: string) => Promise.resolve({ data: [], error: null }),
        }),
      }
    },
  }
  return { db: db as never, calls }
}

describe('upsertById', () => {
  it('upsertet die Row und meldet ok', async () => {
    const { db, calls } = fakeDb()
    const rep = new Reporter()
    await upsertById(db, 'claims', { id: 'x', schadentag: '2026-01-01' }, { reporter: rep })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'claims', op: 'upsert', arg: { id: 'x' } })
    expect(rep.failures).toBe(0)
  })

  it('dry-run schreibt NICHT (nur select)', async () => {
    const { db, calls } = fakeDb()
    const rep = new Reporter()
    await upsertById(db, 'claims', { id: 'x' }, { reporter: rep, dryRun: true })
    expect(calls.filter((c) => c.op === 'upsert')).toHaveLength(0)
  })
})

describe('Reporter', () => {
  it('zählt failures und exitCode', () => {
    const rep = new Reporter()
    rep.ok('a')
    rep.skip('b')
    rep.fail('c', new Error('boom'))
    expect(rep.failures).toBe(1)
    expect(rep.exitCode()).toBe(1)
  })
})
