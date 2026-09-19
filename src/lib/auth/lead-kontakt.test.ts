import { describe, it, expect, vi } from 'vitest'
import { findeVorgaengeZuKontakt, telefonSuffix } from './lead-kontakt'

type LeadRow = { id: string; email: string | null; vorname: string | null }

function adminMock(opts: { leads?: LeadRow[]; claims?: Array<{ id: string }> }) {
  const leads = opts.leads ?? []
  const claims = opts.claims ?? []
  const chain = (rows: unknown[]) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'like', 'in', 'order', 'limit']) q[m] = vi.fn(() => q)
    ;(q as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: rows, error: null })
    return q
  }
  const from = vi.fn((t: string) => (t === 'leads' ? chain(leads) : chain(claims)))
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient & { from: ReturnType<typeof vi.fn> }
}

describe('telefonSuffix', () => {
  it('liefert die letzten 9 Ziffern, unabhaengig vom Format', () => {
    expect(telefonSuffix('+49 177 5799941')).toBe('775799941')
    expect(telefonSuffix('01775799941')).toBe('775799941')
  })
  it('null bei zu kurzer Eingabe', () => {
    expect(telefonSuffix('12345')).toBeNull()
    expect(telefonSuffix('')).toBeNull()
    expect(telefonSuffix(null)).toBeNull()
  })
})

describe('findeVorgaengeZuKontakt', () => {
  it('leer ohne Eingabe, ohne DB-Aufruf', async () => {
    const admin = adminMock({})
    const r = await findeVorgaengeZuKontakt(admin, {})
    expect(r).toEqual({ leadIds: [], claimIds: [], leadEmail: null, leadVorname: null })
    expect(admin.from).not.toHaveBeenCalled()
  })
  it('Telefon: findet Lead + Claim, liefert Lead-E-Mail fuer die Kontoanlage', async () => {
    const admin = adminMock({ leads: [{ id: 'L1', email: 'k@example.test', vorname: 'Kai' }], claims: [{ id: 'C1' }] })
    const r = await findeVorgaengeZuKontakt(admin, { telefon: '+49 177 5799941' })
    expect(r.leadIds).toEqual(['L1'])
    expect(r.claimIds).toEqual(['C1'])
    expect(r.leadEmail).toBe('k@example.test')
    expect(r.leadVorname).toBe('Kai')
  })
  it('E-Mail wird klein und getrimmt verglichen', async () => {
    const admin = adminMock({ leads: [{ id: 'L2', email: 'k@example.test', vorname: null }] })
    const r = await findeVorgaengeZuKontakt(admin, { email: '  K@Example.TEST ' })
    expect(r.leadIds).toEqual(['L2'])
  })
  it('Lead ohne E-Mail: leadEmail bleibt null (Stufe-1-Weiche)', async () => {
    const admin = adminMock({ leads: [{ id: 'L3', email: null, vorname: 'Ada' }] })
    const r = await findeVorgaengeZuKontakt(admin, { telefon: '+491775799941' })
    expect(r.leadIds).toEqual(['L3'])
    expect(r.leadEmail).toBeNull()
    expect(r.leadVorname).toBe('Ada')
  })
})
