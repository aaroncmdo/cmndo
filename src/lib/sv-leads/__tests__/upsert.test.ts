// Tests fuer upsertSvLead — reine Guard-Logik (vor createAdminClient-Aufruf).
// Getestet: name/adresse-Pflicht, lat/lng-Pflicht, PLZ-Pflicht fuer Nicht-DAT-Leads.
// Der createAdminClient-Mock ist minimal: rpc gibt eine Fake-ID zurueck.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock: createAdminClient ──────────────────────────────────────────────────
// Muss vor dem Import von upsertSvLead deklariert werden (vi.mock-Hoisting).
const mockRpc = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockImplementation(() => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}))

// ─── Subject under test ───────────────────────────────────────────────────────
import { upsertSvLead } from '../upsert'

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // Standardmaessig gibt rpc eine Fake-ID zurueck (guard-Tests kommen nicht bis hierher)
  mockRpc.mockResolvedValue({ data: 'fake-sv-lead-id', error: null })
})

describe('upsertSvLead — Nicht-DAT-Lead ohne PLZ (Dedup-Luecke)', () => {
  it('(a) Nicht-DAT ohne plz => ok:false mit PLZ-Fehler', async () => {
    const result = await upsertSvLead({
      name: 'Kein PLZ SV',
      adresse: 'Irgendwo 1',
      lat: 51.0,
      lng: 7.0,
      // kein dat_id, kein plz -> stille Duplikat-Luecke -> Guard wirft
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/PLZ/i)
    // Sicherstellen, dass createAdminClient NICHT aufgerufen wurde (Guard vor DB)
    const { createAdminClient } = await import('@/lib/supabase/admin')
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('(b) Nicht-DAT MIT plz => Guard passiert, rpc wird aufgerufen', async () => {
    const result = await upsertSvLead({
      name: 'Mit PLZ SV',
      adresse: 'Hauptstr. 1',
      lat: 51.0,
      lng: 7.0,
      plz: '50667',
      // kein dat_id — Dedup via normalized_name+plz
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.id).toBe('fake-sv-lead-id')
    expect(mockRpc).toHaveBeenCalledOnce()
    expect(mockRpc).toHaveBeenCalledWith('sv_lead_upsert', expect.objectContaining({ p: expect.any(Object) }))
  })

  it('(c) DAT-Lead (dat_id gesetzt) ohne plz => Guard passiert (DAT dedup via dat_id)', async () => {
    const result = await upsertSvLead({
      name: 'DAT SV',
      adresse: 'Bahnhofstr. 5',
      lat: 50.9,
      lng: 6.9,
      dat_id: 'DAT-12345',
      // kein plz — erlaubt fuer DAT-Leads
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.id).toBe('fake-sv-lead-id')
    expect(mockRpc).toHaveBeenCalledOnce()
  })
})

describe('upsertSvLead — vorgelagerte Guards (Regression)', () => {
  it('name fehlt => ok:false bevor PLZ-Guard greift', async () => {
    const result = await upsertSvLead({
      name: '',
      adresse: 'Hauptstr. 1',
      lat: 51.0,
      lng: 7.0,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/Name/i)
  })

  it('lat NaN => ok:false bevor PLZ-Guard greift', async () => {
    const result = await upsertSvLead({
      name: 'Test SV',
      adresse: 'Hauptstr. 1',
      lat: NaN,
      lng: 7.0,
      plz: '50667',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/lat|lng|Standort/i)
  })

  it('DAT-Lead MIT leerem dat_id-String (trim) => wie Nicht-DAT, plz Pflicht', async () => {
    const result = await upsertSvLead({
      name: 'Leer DAT SV',
      adresse: 'Teststr. 1',
      lat: 51.0,
      lng: 7.0,
      dat_id: '   ', // nur Whitespace -> trim -> leer -> wie kein dat_id
      // kein plz
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/PLZ/i)
  })
})
