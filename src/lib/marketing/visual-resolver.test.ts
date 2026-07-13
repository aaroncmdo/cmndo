import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveVisual, pexelsStockFetcher, type BrandLibrary, type StockFetcher } from './visual-resolver'

const emptyBrand: BrandLibrary = { find: () => null }
const noStock: StockFetcher = { fetch: async () => null }

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.PEXELS_API_KEY
})

describe('resolveVisual - Prioritaet Marke -> Stock -> Grafik', () => {
  it('nimmt die Marken-Bibliothek, wenn ein Tag matcht (vor Stock)', async () => {
    const brand: BrandLibrary = { find: (tags) => (tags.includes('warndreieck') ? 'WarndreieckClip' : null) }
    const r = await resolveVisual({ typ: 'marke', tags: ['warndreieck'], queries: ['x'] }, brand, {
      fetch: async () => 'stockurl',
    })
    expect(r).toEqual({ kind: 'brand', ref: 'WarndreieckClip' })
  })

  it('faellt auf Stock, wenn keine Marke matcht aber eine Query trifft', async () => {
    const r = await resolveVisual({ typ: 'stock', queries: ['car accident'] }, emptyBrand, {
      fetch: async () => 'https://pexels/x.mp4',
    })
    expect(r).toEqual({ kind: 'stock', ref: 'https://pexels/x.mp4' })
  })

  it('faellt auf Grafik, wenn weder Marke noch Stock', async () => {
    const r = await resolveVisual({ typ: 'grafik' }, emptyBrand, noStock)
    expect(r).toEqual({ kind: 'graphic' })
  })

  it('marke ohne Bibliotheks-Treffer faellt auf Stock (Resolver-Kette wie im PoC)', async () => {
    const r = await resolveVisual({ typ: 'marke', tags: ['unbekannt'], queries: ['car'] }, emptyBrand, {
      fetch: async () => 'stock.mp4',
    })
    expect(r).toEqual({ kind: 'stock', ref: 'stock.mp4' })
  })
})

describe('pexelsStockFetcher', () => {
  it('waehlt die hoechste Portrait-Datei aus dem ersten Treffer', async () => {
    process.env.PEXELS_API_KEY = 'test'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          videos: [
            {
              video_files: [
                { link: 'land.mp4', width: 1920, height: 1080 },
                { link: 'port-sd.mp4', width: 540, height: 960 },
                { link: 'port-hd.mp4', width: 1080, height: 1920 },
              ],
            },
          ],
        }),
      }),
    )
    expect(await pexelsStockFetcher.fetch(['car'])).toBe('port-hd.mp4')
  })

  it('liefert null ohne API-Key', async () => {
    expect(await pexelsStockFetcher.fetch(['car'])).toBeNull()
  })
})
