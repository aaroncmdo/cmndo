import { describe, it, expect, vi } from 'vitest'
import { setVehicleOwnerFuerFall } from './owner'

function makeDb(params: {
  vehicleId: string | null
  updateCount?: number
  updateError?: { message: string } | null
  claimError?: { message: string } | null
}) {
  const db = {
    from: vi.fn((table: string) => {
      if (table === 'v_claim_full') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: params.claimError ? null : params.vehicleId ? [{ vehicle_id: params.vehicleId }] : [],
                    error: params.claimError ?? null,
                  })),
                })),
              })),
            })),
          })),
        }
      }
      if (table === 'vehicles') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(async () => ({
                error: params.updateError ?? null,
                count: params.updateError ? null : params.updateCount ?? 0,
              })),
            })),
          })),
        }
      }
      return {}
    }),
  }
  return db as never
}

describe('setVehicleOwnerFuerFall', () => {
  it('setzt den Owner wenn das Fall-Fahrzeug noch keinen hat', async () => {
    const res = await setVehicleOwnerFuerFall(makeDb({ vehicleId: 'veh-1', updateCount: 1 }), 'fall-1', 'user-1')
    expect(res).toEqual({ ok: true, updated: 1 })
  })

  it('no-op wenn der Fall kein Fahrzeug hat — vehicles wird nie angefasst', async () => {
    const db = makeDb({ vehicleId: null })
    const res = await setVehicleOwnerFuerFall(db, 'fall-2', 'user-1')
    expect(res).toEqual({ ok: true, updated: 0 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tables: string[] = (db as any).from.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(tables).not.toContain('vehicles')
  })

  it('respektiert bestehenden Owner (IS-NULL-Guard, count 0)', async () => {
    const res = await setVehicleOwnerFuerFall(makeDb({ vehicleId: 'veh-1', updateCount: 0 }), 'fall-3', 'user-2')
    expect(res).toEqual({ ok: true, updated: 0 })
  })

  it('Update-Fehler -> ok:false mit error', async () => {
    const res = await setVehicleOwnerFuerFall(
      makeDb({ vehicleId: 'veh-1', updateError: { message: 'rls deny' } }),
      'fall-4',
      'user-1',
    )
    expect(res.ok).toBe(false)
    expect(res.error).toBe('rls deny')
  })

  it('Claims-Query-Fehler -> ok:false mit error', async () => {
    const res = await setVehicleOwnerFuerFall(
      makeDb({ vehicleId: null, claimError: { message: 'boom' } }),
      'fall-5',
      'user-1',
    )
    expect(res.ok).toBe(false)
    expect(res.error).toBe('boom')
  })
})
