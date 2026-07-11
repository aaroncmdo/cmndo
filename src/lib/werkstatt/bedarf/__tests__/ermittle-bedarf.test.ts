import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock schadenbild-gewerke BEFORE importing the module under test
vi.mock('../schadenbild-gewerke', () => ({
  klassifiziereSchadenbild: vi.fn().mockResolvedValue({ kategorien: ['lackierung'], confidence: 80 }),
}))

import { klassifiziereSchadenbild } from '../schadenbild-gewerke'
import { waehleBedarf, ermittleReparaturbedarf } from '../ermittle-bedarf'

const mockKlassifiziere = vi.mocked(klassifiziereSchadenbild)

beforeEach(() => {
  mockKlassifiziere.mockReset()
  mockKlassifiziere.mockResolvedValue({ kategorien: ['lackierung'], confidence: 80 })
})

describe('waehleBedarf (Evidenz-Eskalation)', () => {
  // Case 1: gutachten present with hours > 0
  it('gutachtenZeiten mit Stunden > 0 -> quelle gutachten, confidence 100', async () => {
    const result = await waehleBedarf({
      gutachtenZeiten: { zeit_kar_std: 3, zeit_lack_std: 2, zeit_ak_std: 0 },
      fotoUrls: ['http://example.com/foto.jpg'],
      manuell: ['glas'],
    })
    expect(result.quelle).toBe('gutachten')
    expect(result.confidence).toBe(100)
    expect(result.kategorien).toContain('karosserie')
    expect(result.kategorien).toContain('lackierung')
    expect(result.kategorien).not.toContain('mechanik')
    // Vision classifier must NOT be called when gutachten is definitive
    expect(mockKlassifiziere).not.toHaveBeenCalled()
  })

  // Case 2: no gutachten, fotoUrls non-empty -> schadenbild with mocked classifier
  it('kein Gutachten, Fotos vorhanden -> quelle schadenbild, confidence vom Mock', async () => {
    mockKlassifiziere.mockResolvedValue({ kategorien: ['lackierung', 'karosserie'], confidence: 75 })
    const result = await waehleBedarf({
      gutachtenZeiten: null,
      fotoUrls: ['http://example.com/foto1.jpg'],
      manuell: ['glas'],
    })
    expect(result.quelle).toBe('schadenbild')
    expect(result.confidence).toBe(75)
    expect(result.kategorien).toEqual(['lackierung', 'karosserie'])
    expect(mockKlassifiziere).toHaveBeenCalledWith(['http://example.com/foto1.jpg'])
  })

  // Case 3: no gutachten, no photos, manuell set -> quelle manuell, confidence 40
  it('kein Gutachten, keine Fotos, manuell gesetzt -> quelle manuell, confidence 40', async () => {
    const result = await waehleBedarf({
      gutachtenZeiten: null,
      fotoUrls: [],
      manuell: ['glas'],
    })
    expect(result.quelle).toBe('manuell')
    expect(result.confidence).toBe(40)
    expect(result.kategorien).toContain('glas')
  })

  // Case 4: nothing -> unbekannt
  it('keine Evidenz -> unbekannt, leere kategorien, confidence 0', async () => {
    const result = await waehleBedarf({
      gutachtenZeiten: null,
      fotoUrls: [],
      manuell: null,
    })
    expect(result).toEqual({ kategorien: [], quelle: 'unbekannt', confidence: 0 })
    expect(mockKlassifiziere).not.toHaveBeenCalled()
  })

  // Edge: gutachtenZeiten present but ALL hours = 0 -> falls through to next evidence
  it('gutachtenZeiten alle Stunden 0 -> faellt durch zu schadenbild (nicht quelle gutachten)', async () => {
    mockKlassifiziere.mockResolvedValue({ kategorien: ['lackierung'], confidence: 65 })
    const result = await waehleBedarf({
      gutachtenZeiten: { zeit_kar_std: 0, zeit_lack_std: '0', zeit_ak_std: null },
      fotoUrls: ['http://example.com/foto.jpg'],
      manuell: null,
    })
    expect(result.quelle).not.toBe('gutachten')
    expect(result.quelle).toBe('schadenbild')
    expect(result.confidence).toBe(65)
  })

  // Edge: gutachtenZeiten with hours but classifier returns empty (Vision fail-safe) -> still uses schadenbild path correctly
  it('Fotos vorhanden aber KI liefert leere kategorien -> faellt durch zu manuell', async () => {
    mockKlassifiziere.mockResolvedValue({ kategorien: [], confidence: 0 })
    const result = await waehleBedarf({
      gutachtenZeiten: null,
      fotoUrls: ['http://example.com/foto.jpg'],
      manuell: ['mechanik'],
    })
    // schadenbild returned empty kategorien, so it falls through
    expect(result.quelle).toBe('manuell')
    expect(result.confidence).toBe(40)
    expect(result.kategorien).toContain('mechanik')
  })
})

// ---------------------------------------------------------------------------
// ermittleReparaturbedarf — DB-Huelle
// ---------------------------------------------------------------------------

/** Helper: baut eine vollstaendige Supabase-Query-Chain (from->select->eq->maybeSingle) */
function buildChain(resolveWith: unknown) {
  const single = vi.fn().mockResolvedValue({ data: resolveWith, error: null })
  const eq = vi.fn().mockReturnValue({ maybeSingle: single, eq: vi.fn().mockReturnValue({ maybeSingle: single }) })
  const select = vi.fn().mockReturnValue({ eq })
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  return { select, eq, update, single }
}

/** Minimal Fake-sb: from(table) gibt unterschiedliche Chains per Aufruf-Reihenfolge */
function buildFakeSb(fromMap: Record<string, unknown>) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      const data = fromMap[table]
      const chain = buildChain(data)
      return {
        select: chain.select,
        update: chain.update,
      }
    }),
  }
}

describe('ermittleReparaturbedarf (DB-Huelle)', () => {
  it('Gutachten freigegeben + Stunden -> quelle gutachten, confidence 100', async () => {
    // auftraege row: gutachten_final_freigegeben=true, claim_id matches
    // claims row: gutachten_zeit_kar_std=5, others null
    let callCount = 0
    const fakeSb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'auftraege') {
          const maybeSingle = vi.fn().mockResolvedValue({
            data: { gutachten_final_freigegeben: true, claim_id: 'claim-1' },
            error: null,
          })
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }), maybeSingle }) }) }
        }
        if (table === 'claims') {
          callCount++
          if (callCount === 1) {
            // first claims call: load gutachten_zeit_* + schadenskategorie
            const maybeSingle = vi.fn().mockResolvedValue({
              data: { gutachten_zeit_kar_std: 5, gutachten_zeit_lack_std: null, gutachten_zeit_ak_std: null, schadenskategorie: 'glas', lead_id: null, schadensfoto_urls: null },
              error: null,
            })
            return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
          }
          // persist update call
          return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
        }
        if (table === 'leads') {
          const maybeSingle = vi.fn().mockResolvedValue({ data: { schadensfoto_urls: [], schadenskategorie: 'glas' }, error: null })
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }),
    }

    const result = await ermittleReparaturbedarf(fakeSb, { claimId: 'claim-1' })
    expect(result.quelle).toBe('gutachten')
    expect(result.confidence).toBe(100)
    expect(result.kategorien).toContain('karosserie')
  })

  it('kein Gutachten, nur schadenskategorie -> quelle manuell, confidence 40', async () => {
    mockKlassifiziere.mockResolvedValue({ kategorien: [], confidence: 0 })
    const fakeSb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'auftraege') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }
        }
        if (table === 'claims') {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { gutachten_zeit_kar_std: null, gutachten_zeit_lack_std: null, gutachten_zeit_ak_std: null, schadenskategorie: 'lackierung', lead_id: null, schadensfoto_urls: null }, error: null }) }) }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }),
    }

    const result = await ermittleReparaturbedarf(fakeSb, { claimId: 'claim-1' })
    expect(result.quelle).toBe('manuell')
    expect(result.confidence).toBe(40)
    expect(result.kategorien).toContain('lackierung')
  })

  it('Persist-Fehler bricht den Return NICHT', async () => {
    mockKlassifiziere.mockResolvedValue({ kategorien: [], confidence: 0 })
    const fakeSb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'auftraege') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }
        }
        if (table === 'claims') {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { gutachten_zeit_kar_std: null, gutachten_zeit_lack_std: null, gutachten_zeit_ak_std: null, schadenskategorie: 'glas', lead_id: null, schadensfoto_urls: null }, error: null }) }) }),
            // persist update throws
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockRejectedValue(new Error('DB down')) }),
          }
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }),
    }

    // Should NOT throw; should return manuell result despite persist failure
    const result = await ermittleReparaturbedarf(fakeSb, { claimId: 'claim-1' })
    expect(result.quelle).toBe('manuell')
    expect(result.kategorien).toContain('glas')
  })

  it('Lead-Kontext: laedt schadensfoto_urls und schadenskategorie aus leads', async () => {
    mockKlassifiziere.mockResolvedValue({ kategorien: ['karosserie'], confidence: 70 })
    const fakeSb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { schadensfoto_urls: ['http://img.com/1.jpg'], schadenskategorie: 'mechanik' }, error: null }) }) }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }),
    }

    const result = await ermittleReparaturbedarf(fakeSb, { leadId: 'lead-1' })
    expect(result.quelle).toBe('schadenbild')
    expect(result.kategorien).toContain('karosserie')
    expect(mockKlassifiziere).toHaveBeenCalledWith(['http://img.com/1.jpg'])
  })

  it('keine Evidenz -> unbekannt, confidence 0', async () => {
    mockKlassifiziere.mockResolvedValue({ kategorien: [], confidence: 0 })
    const fakeSb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'auftraege') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }
        }
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { gutachten_zeit_kar_std: null, gutachten_zeit_lack_std: null, gutachten_zeit_ak_std: null, schadenskategorie: null, lead_id: null, schadensfoto_urls: null }, error: null }) }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }),
    }

    const result = await ermittleReparaturbedarf(fakeSb, { claimId: 'claim-zero' })
    expect(result.quelle).toBe('unbekannt')
    expect(result.confidence).toBe(0)
    expect(result.kategorien).toEqual([])
  })
})
