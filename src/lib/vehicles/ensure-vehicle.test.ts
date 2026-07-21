import { describe, it, expect, vi } from 'vitest'
import { ensureVehicleFromFin } from './ensure-vehicle'

const FIN = 'WVWZZZ1JZXW000001'

function makeDb(opts: { stubFin: string | null }) {
  const rpc = vi.fn()
  // upsert_vehicle_by_fin -> Ziel-UUID; merge_stub_vehicle -> no-op ok.
  rpc.mockImplementation(async (fn: string) =>
    fn === 'upsert_vehicle_by_fin' ? { data: 'v-target', error: null } : { data: null, error: null },
  )
  const db = {
    rpc,
    from: () => ({
      // supersedes-Lookup: .select('fin').eq('id').maybeSingle()
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { fin: opts.stubFin }, error: null }) }) }),
      // CMM-50.1 Secondary-UPDATE (bei leerem Snapshot nie aufgerufen)
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  } as never
  return { db, rpc }
}

describe('ensureVehicleFromFin supersedes-Merge', () => {
  it('supersedes ist ein Stub (fin NULL) und != target -> merge_stub_vehicle gerufen', async () => {
    const { db, rpc } = makeDb({ stubFin: null })
    const res = await ensureVehicleFromFin({ fin: FIN, db, supersedesVehicleId: 'v-stub' })
    expect(res.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('merge_stub_vehicle', { p_stub: 'v-stub', p_target: 'v-target' })
  })

  it('supersedes hat eine FIN (kein Stub) -> KEIN Merge', async () => {
    const { db, rpc } = makeDb({ stubFin: 'SOMEOTHERFIN00001' })
    await ensureVehicleFromFin({ fin: FIN, db, supersedesVehicleId: 'v-real' })
    expect(rpc).not.toHaveBeenCalledWith('merge_stub_vehicle', expect.anything())
  })

  it('supersedes == target -> KEIN Merge', async () => {
    const { db, rpc } = makeDb({ stubFin: null })
    await ensureVehicleFromFin({ fin: FIN, db, supersedesVehicleId: 'v-target' })
    expect(rpc).not.toHaveBeenCalledWith('merge_stub_vehicle', expect.anything())
  })

  it('kein supersedes -> KEIN Merge', async () => {
    const { db, rpc } = makeDb({ stubFin: null })
    await ensureVehicleFromFin({ fin: FIN, db })
    expect(rpc).not.toHaveBeenCalledWith('merge_stub_vehicle', expect.anything())
  })
})
