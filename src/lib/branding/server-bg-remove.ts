// 2026-05-14: Server-seitiger Chroma-Key-BG-Remover.
//
// Wird nach dem Client-imgly-Schritt (oder als alleinige Bereinigung wenn der
// User Onboarding-Path nutzt) ausgeführt. imgly ist auf Foto-Segmentierung
// trainiert und schafft text-/wortmarken-lastige Logos auf solidem Hintergrund
// (Fronius, gall-Logo) nicht zuverlässig. Dieser Helper deckt den klassischen
// "Logo auf weißer/schwarzer Fläche"-Case sauber per RGB-Distanz ab.
//
// Strategie:
//   1. 4 Ecken samplen (2 Pixel Offset zum Rand wegen Anti-Alias)
//   2. Wenn alle ähnlich UND near-white ODER near-black → solider Hintergrund erkannt
//   3. Chroma-Key: alle Pixel mit RGB-Distanz < 28 zur Hintergrund-Farbe → alpha 0
//
// SVG wird übersprungen (Vektor, kein Pixel-BG zu entfernen).

import type { Buffer as NodeBuffer } from 'node:buffer'

export type ChromaKeyResult = {
  cleaned: NodeBuffer
  contentType: 'image/png'
  ext: 'png'
  applied: boolean
  bgColor?: { r: number; g: number; b: number }
}

export async function stripSolidBackground(srcBuffer: NodeBuffer): Promise<ChromaKeyResult> {
  const sharp = (await import('sharp')).default
  const meta = await sharp(srcBuffer).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width < 5 || height < 5) {
    // Zu klein für sinnvolles Sampling — Original zurückgeben.
    return {
      cleaned: srcBuffer,
      contentType: 'image/png',
      ext: 'png',
      applied: false,
    }
  }

  const rawImg = await sharp(srcBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { data: rawData, info } = rawImg

  const sampleAt = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels
    return { r: rawData[i], g: rawData[i + 1], b: rawData[i + 2] }
  }
  const corners = [
    sampleAt(2, 2),
    sampleAt(info.width - 3, 2),
    sampleAt(2, info.height - 3),
    sampleAt(info.width - 3, info.height - 3),
  ]
  const avg = {
    r: Math.round(corners.reduce((s, c) => s + c.r, 0) / 4),
    g: Math.round(corners.reduce((s, c) => s + c.g, 0) / 4),
    b: Math.round(corners.reduce((s, c) => s + c.b, 0) / 4),
  }
  const isUniform = corners.every(c =>
    Math.abs(c.r - avg.r) < 12
    && Math.abs(c.g - avg.g) < 12
    && Math.abs(c.b - avg.b) < 12,
  )
  const isNearWhite = avg.r > 235 && avg.g > 235 && avg.b > 235
  const isNearBlack = avg.r < 20 && avg.g < 20 && avg.b < 20
  if (!isUniform || (!isNearWhite && !isNearBlack)) {
    // Kein solider Hintergrund erkannt → Original durchreichen (aber als PNG
    // mit Alpha normalisiert, damit AVIF/etc. zu PNG werden für Vibrant).
    const normalized = await sharp(srcBuffer).png().toBuffer()
    return {
      cleaned: normalized,
      contentType: 'image/png',
      ext: 'png',
      applied: false,
    }
  }

  const THRESH = 28
  const out = Buffer.alloc(rawData.length)
  for (let i = 0; i < rawData.length; i += info.channels) {
    const dr = rawData[i] - avg.r
    const dg = rawData[i + 1] - avg.g
    const db = rawData[i + 2] - avg.b
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)
    out[i] = rawData[i]
    out[i + 1] = rawData[i + 1]
    out[i + 2] = rawData[i + 2]
    out[i + 3] = dist < THRESH ? 0 : rawData[i + 3]
  }
  const cleaned = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer()
  return {
    cleaned,
    contentType: 'image/png',
    ext: 'png',
    applied: true,
    bgColor: avg,
  }
}
