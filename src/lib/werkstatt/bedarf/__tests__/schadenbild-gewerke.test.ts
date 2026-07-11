import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ai/vision/client', () => ({
  getAnthropicVisionClient: vi.fn(),
  buildImageBlocks: (urls: string[]) => urls.map((u) => ({ type: 'image', source: { type: 'url', url: u } })),
}))
import { getAnthropicVisionClient } from '@/lib/ai/vision/client'
import { klassifiziereSchadenbild } from '../schadenbild-gewerke'

const mockClient = (text: string) => ({ messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text }] }) } })

beforeEach(() => vi.mocked(getAnthropicVisionClient).mockReset())

describe('klassifiziereSchadenbild', () => {
  it('parst gueltiges JSON + filtert unbekannte Gewerke', async () => {
    vi.mocked(getAnthropicVisionClient).mockReturnValue(
      mockClient('{"kategorien":["lackierung","xxx","karosserie"],"confidence":82}') as never,
    )
    const r = await klassifiziereSchadenbild(['u1'])
    expect(r.kategorien).toEqual(['lackierung', 'karosserie'])
    expect(r.confidence).toBe(82)
  })
  it('Client null -> fail-safe leer', async () => {
    vi.mocked(getAnthropicVisionClient).mockReturnValue(null as never)
    expect(await klassifiziereSchadenbild(['u1'])).toEqual({ kategorien: [], confidence: 0 })
  })
  it('keine URLs -> leer', async () => {
    expect(await klassifiziereSchadenbild([])).toEqual({ kategorien: [], confidence: 0 })
  })
  it('Parse-Fehler -> fail-safe leer', async () => {
    vi.mocked(getAnthropicVisionClient).mockReturnValue(mockClient('kein json') as never)
    expect(await klassifiziereSchadenbild(['u1'])).toEqual({ kategorien: [], confidence: 0 })
  })
  it('leere Kategorien -> confidence 0 (kein Filter-Signal)', async () => {
    vi.mocked(getAnthropicVisionClient).mockReturnValue(mockClient('{"kategorien":[],"confidence":90}') as never)
    expect(await klassifiziereSchadenbild(['u1'])).toEqual({ kategorien: [], confidence: 0 })
  })
})
