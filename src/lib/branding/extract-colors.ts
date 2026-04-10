import * as VibrantModule from 'node-vibrant'
import chroma from 'chroma-js'

const Vibrant = (VibrantModule as { default?: typeof VibrantModule }).default ?? VibrantModule

/**
 * Extrahiert 2 Hauptfarben aus einem Bild.
 * Primary = kräftigste Farbe (Vibrant > DarkVibrant > Muted)
 * Secondary = zweitkräftigste oder abgedunkelte Variante
 */
export async function extractTwoColors(imageUrl: string): Promise<{ primary: string; secondary: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const palette = await (Vibrant as any).from(imageUrl).getPalette()

  const candidates = [
    palette.Vibrant,
    palette.DarkVibrant,
    palette.Muted,
    palette.DarkMuted,
    palette.LightVibrant,
    palette.LightMuted,
  ].filter(Boolean)

  if (candidates.length === 0) {
    return { primary: '#0D1B3E', secondary: '#4573A2' }
  }

  // Sort by population (most prominent first)
  candidates.sort((a, b) => (b?.population ?? 0) - (a?.population ?? 0))

  const primaryHex = candidates[0]!.hex
  const primary = ensureContrast(primaryHex)

  // Pick secondary: most distinct from primary
  let secondary = primary
  if (candidates.length > 1) {
    let maxDist = 0
    for (let i = 1; i < candidates.length; i++) {
      const hex = candidates[i]!.hex
      const dist = chroma.deltaE(primary, hex)
      if (dist > maxDist) {
        maxDist = dist
        secondary = hex
      }
    }
  }

  // If secondary is too similar to primary, lighten it
  if (chroma.deltaE(primary, secondary) < 15) {
    secondary = chroma(primary).brighten(1.5).hex()
  }

  return { primary, secondary }
}

/**
 * WCAG AA: Kontrast >= 4.5:1 gegen Weiss.
 * Dunkelt die Farbe automatisch ab wenn noetig.
 */
export function ensureContrast(hex: string): string {
  let color = chroma(hex)
  let attempts = 0
  while (chroma.contrast(color, 'white') < 4.5 && attempts < 20) {
    color = color.darken(0.3)
    attempts++
  }
  return color.hex()
}
