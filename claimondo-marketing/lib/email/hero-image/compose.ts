// Token-Audit-Skip: server-seitige Hero-Bild-Generierung (sharp) — rohe Hex in SVG-Overlay.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
//
// P1b: Backt den Email-Hero zu EINEM Bild (email-sicher), statt Layer/Blur im Mail-Client
// zu riskieren: geblurrte Autowelt-Basis + Navy-Abdunkelung + blauer Glow + Kundenfahrzeug.
// Rein präsentational/pure (nimmt Buffers) → unit-testbar. Fetch/Storage = Caller (P1b-3).
import sharp from 'sharp'

export type HeroComposeOpts = {
  /** Ziel-Pixel (2x der Anzeigebreite empfohlen, z.B. 1200×620 für 600px-Mail). */
  width?: number
  height?: number
}

/**
 * Komponiert den Hero: Basis (cover+blur) → Navy/Glow-Overlay → optionales Fahrzeug
 * (zentriert, leicht über dem unteren Rand). Liefert ein JPG-Buffer.
 */
export async function composeHero(
  base: Buffer,
  car: Buffer | null,
  opts: HeroComposeOpts = {},
): Promise<Buffer> {
  const width = opts.width ?? 1200
  const height = opts.height ?? 620

  const baseLayer = await sharp(base)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .blur(16)
    .toBuffer()

  // Navy-Abdunkelung (Text-Lesbarkeit) + radialer blauer Glow hinter dem Fahrzeug.
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <defs>
         <radialGradient id="glow" cx="50%" cy="42%" r="58%">
           <stop offset="0%" stop-color="#7BA3CC" stop-opacity="0.42"/>
           <stop offset="100%" stop-color="#7BA3CC" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <rect width="100%" height="100%" fill="#0D1B3E" fill-opacity="0.62"/>
       <rect width="100%" height="100%" fill="url(#glow)"/>
     </svg>`,
  )

  const layers: sharp.OverlayOptions[] = [{ input: overlay, blend: 'over' }]

  if (car) {
    const carWidth = Math.round(width * 0.62)
    const carBuf = await sharp(car).resize({ width: carWidth, fit: 'inside', withoutEnlargement: true }).toBuffer()
    const meta = await sharp(carBuf).metadata()
    const cw = meta.width ?? carWidth
    const ch = meta.height ?? 0
    layers.push({
      input: carBuf,
      left: Math.max(0, Math.round((width - cw) / 2)),
      top: Math.max(0, Math.round(height - ch - height * 0.1)),
    })
  }

  return sharp(baseLayer).composite(layers).jpeg({ quality: 82 }).toBuffer()
}

/** Lädt ein Bild über HTTP in einen Buffer (imagin-Render etc.). null bei Fehler. */
export async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}
