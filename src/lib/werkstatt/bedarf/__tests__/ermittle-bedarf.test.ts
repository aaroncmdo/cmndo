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

// Chain-Stubs, gespiegelt an den ECHTEN Query-Formen im Resolver:
//   claims:            .from('claims').select(...).eq('id', X).maybeSingle()
//   auftraege (Gate):  .from('auftraege').select(...).eq('claim_id', X).eq('gutachten_final_freigegeben', true).maybeSingle()
//   v_gutachten_werte: .from('v_gutachten_werte').select(...).eq('claim_id', X).maybeSingle()
//   leads:             .from('leads').select(...).eq('id', X).maybeSingle()
//   persist:           .from(table).update(patch).eq('id', X)

/** select().eq().maybeSingle() — 1 eq */
const selEq1 = (data: unknown) => ({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) }),
  }),
})
/** select().eq().eq().maybeSingle() — 2 eq (auftraege-Gate) */
const selEq2 = (data: unknown) => ({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) }),
    }),
  }),
})
/** update().eq() — success */
const updOk = () => ({ update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })
/** update().eq() — throws (persist-Fehler) */
const updThrow = () => ({ update: vi.fn().mockReturnValue({ eq: vi.fn().mockRejectedValue(new Error('DB down')) }) })

describe('ermittleReparaturbedarf (DB-Huelle)', () => {
  it('Gutachten freigegeben + Stunden (aus v_gutachten_werte) -> quelle gutachten, confidence 100', async () => {
    // claims: lead_id + schadenskategorie (KEINE gutachten_zeit_*)
    // auftraege: freigegeben -> Gate offen
    // v_gutachten_werte: Stunden per claim_id
    const fakeSb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'claims') {
          return { ...selEq1({ lead_id: 'lead-1', schadenskategorie: 'glas' }), ...updOk() }
        }
        if (table === 'auftraege') {
          return selEq2({ gutachten_final_freigegeben: true, claim_id: 'claim-1' })
        }
        if (table === 'v_gutachten_werte') {
          return selEq1({ gutachten_zeit_kar_std: 5, gutachten_zeit_lack_std: null, gutachten_zeit_ak_std: null })
        }
        if (table === 'leads') {
          return { ...selEq1({ schadensfoto_urls: [], schadenskategorie: 'glas' }), ...updOk() }
        }
        return { ...selEq1(null), ...updOk() }
      }),
    }

    const result = await ermittleReparaturbedarf(fakeSb, { claimId: 'claim-1' })
    expect(result.quelle).toBe('gutachten')
    expect(result.confidence).toBe(100)
    expect(result.kategorien).toContain('karosserie')
    // Gutachten ist definitiv -> Vision-Klassifizierer NICHT aufgerufen
    expect(mockKlassifiziere).not.toHaveBeenCalled()
  })

  it('kein Gutachten, nur schadenskategorie -> quelle manuell, confidence 40', async () => {
    mockKlassifiziere.mockResolvedValue({ kategorien: [], confidence: 0 })
    const fakeSb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'claims') {
          return { ...selEq1({ lead_id: null, schadenskategorie: 'lackierung' }), ...updOk() }
        }
        if (table === 'auftraege') {
          return selEq2(null) // kein freigegebenes Gutachten
        }
        return { ...selEq1(null), ...updOk() }
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
        if (table === 'claims') {
          // select ok, aber persist-update wirft
          return { ...selEq1({ lead_id: null, schadenskategorie: 'glas' }), ...updThrow() }
        }
        if (table === 'auftraege') {
          return selEq2(null)
        }
        return { ...selEq1(null), ...updThrow() }
      }),
    }

    // Should NOT throw; should return manuell result despite persist failure
    const result = await ermittleReparaturbedarf(fakeSb, { claimId: 'claim-1' })
    expect(result.quelle).toBe('manuell')
    expect(result.kategorien).toContain('glas')
  })

  it('Claim-Kontext: Fotos aus leads via claims.lead_id -> quelle schadenbild', async () => {
    mockKlassifiziere.mockResolvedValue({ kategorien: ['karosserie'], confidence: 70 })
    const fakeSb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'claims') {
          return { ...selEq1({ lead_id: 'lead-9', schadenskategorie: null }), ...updOk() }
        }
        if (table === 'auftraege') {
          return selEq2(null) // kein Gutachten
        }
        if (table === 'leads') {
          return { ...selEq1({ schadensfoto_urls: ['http://img.com/9.jpg'], schadenskategorie: null }), ...updOk() }
        }
        return { ...selEq1(null), ...updOk() }
      }),
    }

    const result = await ermittleReparaturbedarf(fakeSb, { claimId: 'claim-9' })
    expect(result.quelle).toBe('schadenbild')
    expect(result.kategorien).toContain('karosserie')
    expect(mockKlassifiziere).toHaveBeenCalledWith(['http://img.com/9.jpg'])
  })

  it('Lead-Kontext: laedt schadensfoto_urls und schadenskategorie direkt aus leads', async () => {
    mockKlassifiziere.mockResolvedValue({ kategorien: ['karosserie'], confidence: 70 })
    const fakeSb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'leads') {
          return {
            ...selEq1({ schadensfoto_urls: ['http://img.com/1.jpg'], schadenskategorie: 'mechanik' }),
            ...updOk(),
          }
        }
        return { ...selEq1(null), ...updOk() }
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
        if (table === 'claims') {
          return { ...selEq1({ lead_id: null, schadenskategorie: null }), ...updOk() }
        }
        if (table === 'auftraege') {
          return selEq2(null)
        }
        return { ...selEq1(null), ...updOk() }
      }),
    }

    const result = await ermittleReparaturbedarf(fakeSb, { claimId: 'claim-zero' })
    expect(result.quelle).toBe('unbekannt')
    expect(result.confidence).toBe(0)
    expect(result.kategorien).toEqual([])
  })
})
