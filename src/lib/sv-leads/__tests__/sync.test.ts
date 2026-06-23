import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock upsertSvLead before importing sync
vi.mock('@/lib/sv-leads/upsert', () => ({
  upsertSvLead: vi.fn(),
}))

// Lazy-import so mock is in place
const getSyncFn = async () => {
  const mod = await import('../sources/sync')
  return mod.syncSvLeadsFromSource
}

describe('syncSvLeadsFromSource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserted beide Kandidaten und gibt importiert: 2 zurueck', async () => {
    const { upsertSvLead } = await import('@/lib/sv-leads/upsert')
    vi.mocked(upsertSvLead).mockResolvedValue({ ok: true, id: 'abc' })

    const source = {
      name: 'test_source',
      fetchCandidates: vi.fn().mockResolvedValue([
        { name: 'SV Eins', adresse: 'Hauptstr. 1', lat: 51.0, lng: 7.0 },
        { name: 'SV Zwei', adresse: 'Bahnhofstr. 2', lat: 50.9, lng: 6.9 },
      ]),
    }

    const syncSvLeadsFromSource = await getSyncFn()
    const result = await syncSvLeadsFromSource(source)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.importiert).toBe(2)
    expect(result.fehler).toHaveLength(0)
    expect(upsertSvLead).toHaveBeenCalledTimes(2)
  })

  it('sammelt Fehler eines Kandidaten in fehler[], setzt Batch fort', async () => {
    const { upsertSvLead } = await import('@/lib/sv-leads/upsert')
    vi.mocked(upsertSvLead)
      .mockResolvedValueOnce({ ok: false, error: 'Geocode fehlgeschlagen' })
      .mockResolvedValueOnce({ ok: true, id: 'xyz' })

    const source = {
      name: 'test_source',
      fetchCandidates: vi.fn().mockResolvedValue([
        { name: 'Fehlschlag SV', adresse: 'Irgendwo 99', lat: NaN, lng: NaN },
        { name: 'Erfolg SV', adresse: 'Gute Str. 1', lat: 50.9, lng: 6.9 },
      ]),
    }

    const syncSvLeadsFromSource = await getSyncFn()
    const result = await syncSvLeadsFromSource(source)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.importiert).toBe(1)
    expect(result.fehler).toHaveLength(1)
    expect(result.fehler[0]).toMatch(/Fehlschlag SV/)
    expect(upsertSvLead).toHaveBeenCalledTimes(2)
  })

  it('setzt quelle auf source.name wenn Kandidat kein quelle hat', async () => {
    const { upsertSvLead } = await import('@/lib/sv-leads/upsert')
    vi.mocked(upsertSvLead).mockResolvedValue({ ok: true, id: 'id1' })

    const source = {
      name: 'dat_sync',
      fetchCandidates: vi.fn().mockResolvedValue([
        { name: 'DAT SV', adresse: 'Musterstr. 1', lat: 51.0, lng: 7.0 },
      ]),
    }

    const syncSvLeadsFromSource = await getSyncFn()
    await syncSvLeadsFromSource(source)

    expect(upsertSvLead).toHaveBeenCalledWith(
      expect.objectContaining({ quelle: 'dat_sync' }),
    )
  })

  it('behaelt vorhandene quelle des Kandidaten (kein Ueberschreiben)', async () => {
    const { upsertSvLead } = await import('@/lib/sv-leads/upsert')
    vi.mocked(upsertSvLead).mockResolvedValue({ ok: true, id: 'id2' })

    const source = {
      name: 'dat_sync',
      fetchCandidates: vi.fn().mockResolvedValue([
        { name: 'DAT SV', adresse: 'Musterstr. 1', lat: 51.0, lng: 7.0, quelle: 'dat_export_v2' },
      ]),
    }

    const syncSvLeadsFromSource = await getSyncFn()
    await syncSvLeadsFromSource(source)

    expect(upsertSvLead).toHaveBeenCalledWith(
      expect.objectContaining({ quelle: 'dat_export_v2' }),
    )
  })

  it('gibt ok:false wenn fetchCandidates wirft', async () => {
    const source = {
      name: 'broken_source',
      fetchCandidates: vi.fn().mockRejectedValue(new Error('Netzwerk-Timeout')),
    }

    const syncSvLeadsFromSource = await getSyncFn()
    const result = await syncSvLeadsFromSource(source)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/Netzwerk-Timeout/)
  })

  it('gibt importiert: 0 und leere fehler[] wenn fetchCandidates [] liefert (Stub-Verhalten)', async () => {
    const { upsertSvLead } = await import('@/lib/sv-leads/upsert')

    const source = {
      name: 'dat_sync',
      fetchCandidates: vi.fn().mockResolvedValue([]),
    }

    const syncSvLeadsFromSource = await getSyncFn()
    const result = await syncSvLeadsFromSource(source)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.importiert).toBe(0)
    expect(result.fehler).toHaveLength(0)
    expect(upsertSvLead).not.toHaveBeenCalled()
  })
})
