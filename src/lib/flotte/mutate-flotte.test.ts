import { describe, it, expect, vi, beforeEach } from 'vitest'

// ensureVehicleFromFin/createVehicleStub werden ueber Modul-Level-Handles gesteuert. Die Referenz
// steckt in einer NESTED Arrow (erst zur Testzeit ausgewertet) -> kein vi.mock-Hoisting-Problem.
const ensureMock = vi.fn()
const stubMock = vi.fn()
vi.mock('@/lib/vehicles/ensure-vehicle', () => ({
  ensureVehicleFromFin: (...a: unknown[]) => ensureMock(...a),
  createVehicleStub: (...a: unknown[]) => stubMock(...a),
  VIN_REGEX: /^[A-HJ-NPR-Z0-9]{17}$/,
}))

import { addFahrzeugToFlotte, bindeVehicleAnFlotte } from './mutate-flotte'

beforeEach(() => {
  ensureMock.mockReset()
  stubMock.mockReset()
  ensureMock.mockResolvedValue({ ok: true, vehicleId: 'v-fin' })
  stubMock.mockResolvedValue({ ok: true, vehicleId: 'v1' })
})

function dbWithBindOk() {
  // bindeVehicleAnFlotte macht .from('flotten_fahrzeuge').insert(...)
  return { from: () => ({ insert: async () => ({ error: null }) }) } as never
}

describe('addFahrzeugToFlotte', () => {
  it('maps unique-violation to a friendly message', async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: '23505', message: 'dup' } }) }) } as never
    const res = await addFahrzeugToFlotte(db, 'f1', { kennzeichen: 'K-AB 1' }, 'u1')
    expect(res).toEqual({ ok: false, error: 'Dieses Fahrzeug ist bereits in der Flotte.' })
  })

  it('rejects empty kennzeichen', async () => {
    const res = await addFahrzeugToFlotte({} as never, 'f1', { kennzeichen: '' }, 'u1')
    expect(res.ok).toBe(false)
  })

  it('gültige FIN -> ensureVehicleFromFin (dedup), nicht Stub', async () => {
    const res = await addFahrzeugToFlotte(dbWithBindOk(), 'f1', {
      kennzeichen: 'K-AB 123', fin: 'WVWZZZ1JZXW000001',
    }, 'u1')
    expect(res.ok).toBe(true)
    expect(ensureMock).toHaveBeenCalledTimes(1)
    expect(stubMock).not.toHaveBeenCalled()
  })

  it('keine/ungültige FIN -> createVehicleStub', async () => {
    const res = await addFahrzeugToFlotte(dbWithBindOk(), 'f1', {
      kennzeichen: 'K-AB 123', fin: 'ZU-KURZ',
    }, 'u1')
    expect(res.ok).toBe(true)
    expect(stubMock).toHaveBeenCalledTimes(1)
    expect(ensureMock).not.toHaveBeenCalled()
  })
})

describe('bindeVehicleAnFlotte', () => {
  it('bindet ein Fahrzeug an die Flotte', async () => {
    const db = { from: () => ({ insert: async () => ({ error: null }) }) } as never
    const res = await bindeVehicleAnFlotte(db, { firmaId: 'f1', vehicleId: 'v1', userId: 'u1' })
    expect(res).toEqual({ ok: true })
  })

  it('23505 (UNIQUE firma_id,vehicle_id) -> bereitsVorhanden, KEIN Fehler', async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: '23505', message: 'dup' } }) }) } as never
    const res = await bindeVehicleAnFlotte(db, { firmaId: 'f1', vehicleId: 'v1', userId: 'u1' })
    expect(res).toEqual({ ok: false, bereitsVorhanden: true })
  })

  it('anderer Fehler -> ok:false + error', async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: '23503', message: 'fk' } }) }) } as never
    const res = await bindeVehicleAnFlotte(db, { firmaId: 'f1', vehicleId: 'v1', userId: 'u1' })
    expect(res).toEqual({ ok: false, error: 'fk' })
  })
})
