import { describe, it, expect, vi, beforeEach } from 'vitest'

// Email-Hero-Blur-Entsperren: der verschwommene Marken-Hero (Basis-Asset +
// Navy/Glow-Overlay) braucht KEIN imagin — nur das personalisierte Auto braucht
// den imagin-Customer-Key. Vorher gated `if (!imaginLive()) return null` den
// GESAMTEN Hero -> jede Kunden-Mail bekam nur den flachen Navy-Fallback.
// Jetzt: Blur-Hero immer backen; Auto nur mit imagin.

const composeHero = vi.fn((..._a: unknown[]): Promise<Buffer> => Promise.resolve(Buffer.from('jpg')))
const fetchImageBuffer = vi.fn((..._a: unknown[]): Promise<Buffer> => Promise.resolve(Buffer.from('car')))
vi.mock('../compose', () => ({
  composeHero: (...a: unknown[]) => composeHero(...a),
  fetchImageBuffer: (...a: unknown[]) => fetchImageBuffer(...a),
}))
vi.mock('@/lib/fahrzeug/imagin', () => ({ buildImaginUrl: () => 'https://imagin/car.png' }))
vi.mock('node:fs/promises', () => ({ readFile: vi.fn(async () => Buffer.from('base-asset')) }))

import { getOrCreateHeroImageUrl } from '../store'

type Upload = { key: string }
function makeDb(existing: Array<{ name: string }> = []) {
  const uploads: Upload[] = []
  const db = {
    storage: {
      from: () => ({
        getPublicUrl: (key: string) => ({ data: { publicUrl: `https://cdn/${key}` } }),
        list: async () => ({ data: existing }),
        upload: async (key: string) => {
          uploads.push({ key })
          return { error: null }
        },
      }),
    },
  }
  return { db: db as unknown as Parameters<typeof getOrCreateHeroImageUrl>[0], uploads }
}

const fz = { hersteller: 'BMW', modell: '320d', lackfarbe: null }

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_IMAGIN_CUSTOMER // → 'demo' → imagin OFF
  composeHero.mockClear()
  fetchImageBuffer.mockClear()
})

describe('getOrCreateHeroImageUrl — Blur-Hero entsperrt', () => {
  it('imagin OFF: backt trotzdem den Blur-Hero (Basis, OHNE Auto) + liefert URL', async () => {
    const { db, uploads } = makeDb()
    const url = await getOrCreateHeroImageUrl(db, fz)
    expect(url).not.toBeNull()
    expect(composeHero).toHaveBeenCalledTimes(1)
    // 2. Arg = car -> null (kein imagin)
    expect(composeHero.mock.calls[0][1]).toBeNull()
    // eine gemeinsame Basis-Datei, NICHT per-Fahrzeug
    expect(uploads[0].key).toBe('base-hero.jpg')
    expect(fetchImageBuffer).not.toHaveBeenCalled()
  })

  it('imagin ON + Hersteller: backt per-Fahrzeug MIT Auto', async () => {
    process.env.NEXT_PUBLIC_IMAGIN_CUSTOMER = 'echter-key'
    const { db, uploads } = makeDb()
    const url = await getOrCreateHeroImageUrl(db, fz)
    expect(url).not.toBeNull()
    expect(composeHero.mock.calls[0][1]).not.toBeNull() // Auto gebacken
    expect(uploads[0].key).toContain('bmw') // per-Fahrzeug-Key
  })

  it('Cache-Hit (Basis-Hero existiert): kein Re-Bake', async () => {
    const { db } = makeDb([{ name: 'base-hero.jpg' }])
    const url = await getOrCreateHeroImageUrl(db, { hersteller: null, modell: null, lackfarbe: null })
    expect(url).toBe('https://cdn/base-hero.jpg')
    expect(composeHero).not.toHaveBeenCalled()
  })
})
