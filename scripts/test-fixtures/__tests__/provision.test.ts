import { describe, it, expect } from 'vitest'
import { runProvision } from '../provision'

function fakeDb() {
  const writes: string[] = []
  const db = {
    from() {
      return {
        update: () => ({
          eq: () => {
            writes.push('update')
            return Promise.resolve({ error: null })
          },
        }),
        upsert: () => {
          writes.push('upsert')
          return Promise.resolve({ error: null })
        },
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      }
    },
  }
  return { db: db as never, writes }
}

describe('runProvision', () => {
  it('dry-run macht keine Writes', async () => {
    const { db, writes } = fakeDb()
    const rep = await runProvision(db, { dryRun: true })
    expect(writes).toHaveLength(0)
    expect(rep.failures).toBe(0)
  })
  it('non-dry-run schreibt', async () => {
    const { db, writes } = fakeDb()
    await runProvision(db, { dryRun: false })
    expect(writes.length).toBeGreaterThan(0)
  })
})
