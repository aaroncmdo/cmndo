import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock schadenbild-gewerke BEFORE importing the module under test
vi.mock('../schadenbild-gewerke', () => ({
  klassifiziereSchadenbild: vi.fn().mockResolvedValue({ kategorien: ['lackierung'], confidence: 80 }),
}))

import { klassifiziereSchadenbild } from '../schadenbild-gewerke'
import { waehleBedarf } from '../ermittle-bedarf'

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
