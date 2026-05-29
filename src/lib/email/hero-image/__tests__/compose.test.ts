import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { composeHero } from '../compose'

function solid(w: number, h: number, rgb: { r: number; g: number; b: number }, alpha = 1) {
  return sharp({ create: { width: w, height: h, channels: 4, background: { ...rgb, alpha } } }).png().toBuffer()
}

describe('composeHero', () => {
  it('liefert ein JPEG in Zielgröße aus Basis + Fahrzeug', async () => {
    const base = await solid(400, 200, { r: 20, g: 40, b: 80 })
    const car = await solid(200, 100, { r: 200, g: 0, b: 0 })
    const out = await composeHero(base, car, { width: 400, height: 200 })
    expect(out.length).toBeGreaterThan(500)
    expect(out[0]).toBe(0xff) // JPEG SOI
    expect(out[1]).toBe(0xd8)
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(400)
    expect(meta.height).toBe(200)
  })

  it('funktioniert ohne Fahrzeug (nur Basis + Overlay)', async () => {
    const base = await solid(300, 150, { r: 10, g: 20, b: 40 })
    const out = await composeHero(base, null, { width: 300, height: 150 })
    expect(out[0]).toBe(0xff)
    expect(out[1]).toBe(0xd8)
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(300)
  })
})
