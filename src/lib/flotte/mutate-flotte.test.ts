import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/vehicles/ensure-vehicle', () => ({
  createVehicleStub: vi.fn(async () => ({ ok: true, vehicleId: 'v1' })),
}))
import { addFahrzeugToFlotte } from './mutate-flotte'

describe('addFahrzeugToFlotte', () => {
  it('maps unique-violation to a friendly message', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = { from: () => ({ insert: async () => ({ error: { code: '23505', message: 'dup' } }) }) } as any
    const res = await addFahrzeugToFlotte(db, 'f1', { kennzeichen: 'K-AB 1' }, 'u1')
    expect(res).toEqual({ ok: false, error: 'Dieses Fahrzeug ist bereits in der Flotte.' })
  })
  it('rejects empty kennzeichen', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await addFahrzeugToFlotte({} as any, 'f1', { kennzeichen: '' }, 'u1')
    expect(res.ok).toBe(false)
  })
})
