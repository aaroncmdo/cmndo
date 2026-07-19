// Task #5 — setWerkstattMarken / setWerkstattFahrzeugGruppen: Admin-Gate + Normalisierung/Filter.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  rolle: 'admin' as string | null,
  updateArg: undefined as Record<string, unknown> | undefined,
  updateError: null as { message: string } | null,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/isochrone/calculate-isochrone', () => ({ calculateIsochrone: vi.fn() }))
vi.mock('@/lib/partner/standard-staffel', () => ({ setzeStandardStaffel: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockImplementation(async () => ({ data: h.rolle ? { id: 'admin1', rolle: h.rolle } : null })),
        })),
      })),
    })),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn((arg: Record<string, unknown>) => {
        h.updateArg = arg
        return { eq: vi.fn().mockImplementation(async () => ({ error: h.updateError })) }
      }),
    })),
  })),
}))

beforeEach(() => {
  h.rolle = 'admin'
  h.updateArg = undefined
  h.updateError = null
})

describe('setWerkstattMarken', () => {
  it('non-admin -> ok:false, kein Update', async () => {
    h.rolle = null
    const { setWerkstattMarken } = await import('../actions')
    const r = await setWerkstattMarken('w1', ['BMW'])
    expect(r.ok).toBe(false)
    expect(h.updateArg).toBeUndefined()
  })

  it('normalisiert: trim + dedupe (case-insensitiv via Set nach trim) + non-empty', async () => {
    const { setWerkstattMarken } = await import('../actions')
    const r = await setWerkstattMarken('w1', [' BMW ', 'BMW', '', '   ', 'Audi'])
    expect(r.ok).toBe(true)
    expect(h.updateArg).toEqual({ marken: ['BMW', 'Audi'] })
  })

  it('DB-Fehler -> ok:false', async () => {
    h.updateError = { message: 'boom' }
    const { setWerkstattMarken } = await import('../actions')
    expect((await setWerkstattMarken('w1', ['BMW'])).error).toBe('boom')
  })
})

describe('setWerkstattFahrzeugGruppen', () => {
  it('filtert unbekannte Werte gegen die fixe Liste', async () => {
    const { setWerkstattFahrzeugGruppen } = await import('../actions')
    const r = await setWerkstattFahrzeugGruppen('w1', ['pkw', 'quatsch', 'lkw', 'transporter'])
    expect(r.ok).toBe(true)
    expect(h.updateArg).toEqual({ fahrzeug_gruppen: ['pkw', 'lkw', 'transporter'] })
  })

  it('non-admin -> ok:false', async () => {
    h.rolle = 'kundenbetreuer'
    const { setWerkstattFahrzeugGruppen } = await import('../actions')
    expect((await setWerkstattFahrzeugGruppen('w1', ['pkw'])).ok).toBe(false)
  })
})
