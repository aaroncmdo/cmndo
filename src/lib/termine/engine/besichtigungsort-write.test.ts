import { describe, it, expect } from 'vitest'
import { korrigiereBesichtigungsort, bestaetigeBesichtigungsort } from './besichtigungsort-write'

function fakeDb(captures: Record<string, unknown>[]) {
  return {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => { captures.push(patch); return { error: null } },
      }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { fall_id: 'f1' } }) }) }),
      insert: async () => ({ error: null }),
    }),
  } as never
}

describe('korrigiereBesichtigungsort', () => {
  it('schreibt geocodete Coords + bestaetigt_von/am', async () => {
    const caps: Record<string, unknown>[] = []
    const r = await korrigiereBesichtigungsort('t1', { adresse: 'Domkloster 4', lat: 50.94, lng: 6.96 }, 'kunde', { db: fakeDb(caps) })
    expect(r.ok).toBe(true)
    const patch = caps[0]
    expect(patch.besichtigungsort_adresse).toBe('Domkloster 4')
    expect(patch.besichtigungsort_lat).toBe(50.94)
    expect(patch.besichtigungsort_bestaetigt_von).toBe('kunde')
    expect(patch.besichtigungsort_bestaetigt_am).toBeTruthy()
  })
  it('lehnt fehlende Coords ab', async () => {
    const r = await korrigiereBesichtigungsort('t1', { adresse: 'x', lat: null as never, lng: null as never }, 'sv', { db: fakeDb([]) })
    expect(r.ok).toBe(false)
  })
})

describe('bestaetigeBesichtigungsort', () => {
  it('setzt nur bestaetigt_*, keine Coords', async () => {
    const caps: Record<string, unknown>[] = []
    const r = await bestaetigeBesichtigungsort('t1', 'kunde', { db: fakeDb(caps) })
    expect(r.ok).toBe(true)
    expect(caps[0].besichtigungsort_bestaetigt_von).toBe('kunde')
    expect(caps[0].besichtigungsort_adresse).toBeUndefined()
  })
})
