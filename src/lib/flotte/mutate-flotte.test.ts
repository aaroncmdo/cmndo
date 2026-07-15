import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/vehicles/ensure-vehicle', () => ({
  createVehicleStub: vi.fn(async () => ({ ok: true, vehicleId: 'v1' })),
}))
import { addFahrzeugToFlotte, bindeVehicleAnFlotte } from './mutate-flotte'

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

describe('bindeVehicleAnFlotte', () => {
  it('bindet ein Fahrzeug an die Flotte', async () => {
    const db = { from: () => ({ insert: async () => ({ error: null }) }) } as any
    const res = await bindeVehicleAnFlotte(db, { firmaId: 'f1', vehicleId: 'v1', userId: 'u1' })
    expect(res).toEqual({ ok: true })
  })
  it('23505 (UNIQUE firma_id,vehicle_id) -> bereitsVorhanden, KEIN Fehler', async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: '23505', message: 'dup' } }) }) } as any
    const res = await bindeVehicleAnFlotte(db, { firmaId: 'f1', vehicleId: 'v1', userId: 'u1' })
    expect(res).toEqual({ ok: false, bereitsVorhanden: true })
  })
  it('anderer Fehler -> ok:false + error', async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: '23503', message: 'fk' } }) }) } as any
    const res = await bindeVehicleAnFlotte(db, { firmaId: 'f1', vehicleId: 'v1', userId: 'u1' })
    expect(res).toEqual({ ok: false, error: 'fk' })
  })
})
