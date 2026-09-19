import { describe, it, expect, vi, beforeEach } from 'vitest'
const finde = vi.fn()
vi.mock('@/lib/auth/lead-kontakt', () => ({ findeVorgaengeZuKontakt: (...a: unknown[]) => finde(...a) }))
import { ladeOffeneLeadsFuerKunde } from './offene-leads'

function adminMock(rows: unknown[]) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'in', 'is', 'order', 'limit']) q[m] = vi.fn(() => q)
  ;(q as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: rows, error: null })
  return { from: vi.fn(() => q) } as unknown as import('@supabase/supabase-js').SupabaseClient
}

beforeEach(() => finde.mockReset())

describe('ladeOffeneLeadsFuerKunde', () => {
  it('nur Leads OHNE Claim (konvertiert_zu_fall_id is null)', async () => {
    finde.mockResolvedValue({ leadIds: ['L1', 'L2'], claimIds: ['C1'], leadEmail: null, leadVorname: null })
    const admin = adminMock([{ id: 'L2', created_at: '2026-09-18T10:00:00Z', schadentyp: 'Auffahrunfall', kennzeichen: null }])
    const r = await ladeOffeneLeadsFuerKunde(admin, { email: 'k@example.test', telefon: null })
    expect(r).toEqual([{ id: 'L2', createdAt: '2026-09-18T10:00:00Z', schadentyp: 'Auffahrunfall', kennzeichen: null }])
  })
  it('leer ohne Kontakt, ohne Suche', async () => {
    expect(await ladeOffeneLeadsFuerKunde(adminMock([]), { email: null, telefon: null })).toEqual([])
    expect(finde).not.toHaveBeenCalled()
  })
  it('leer wenn der Kontakt keine Leads hat', async () => {
    finde.mockResolvedValue({ leadIds: [], claimIds: [], leadEmail: null, leadVorname: null })
    const admin = adminMock([{ id: 'X' }])
    expect(await ladeOffeneLeadsFuerKunde(admin, { email: null, telefon: '+491775799941' })).toEqual([])
  })
})
