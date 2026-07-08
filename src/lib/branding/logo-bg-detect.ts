// 2026-07-02: Reine (canvas-/sharp-freie) Kern-Logik fuer die Logo-Background-
// Analyse. Alle Funktionen arbeiten ueber flachen RGBA-Byte-Arrays mit
// expliziter Kanal-Zahl (4 = RGBA) -> deterministisch unit-testbar ohne
// Browser/Node-Bildlibs.
//
// Zweck: Over-Cut-Guard fuer @imgly/background-removal. imgly (isnet) ist ein
// Salient-Object-Segmentierer, der auf Text-/Wortmarken-Logos regelmaessig zu
// viel wegschneidet (Logo wird loechrig/transparent — siehe server-bg-remove.ts
// Kopf-Kommentar + AGENTS.md). Dieser Helper misst, wieviel vom geschaetzten
// Logo-Vordergrund nach imgly ueberlebt hat, und entscheidet ob das Ergebnis
// verworfen werden soll (-> Original behalten, Server-Chroma-Key raeumt soliden
// BG deterministisch).
//
// Die BG-Erkennung spiegelt bewusst server-bg-remove.ts (gleiche Ecken-Sampling-
// Offsets + Schwellen), damit Client-Guard und Server-Chroma-Key dieselbe
// "solider BG?"-Frage identisch beantworten.

/** RGB-Distanz <= dieser Schwelle = "gehoert zum soliden Hintergrund". == server-bg-remove THRESH. */
export const BG_MATCH_THRESH = 28
/** alpha >= dieser Schwelle = "sichtbar/opak". */
export const ALPHA_OPAQUE_CUTOFF = 128
/** imgly muss mind. diesen Anteil des geschaetzten Vordergrunds behalten, sonst = Over-Cut. */
export const OVERCUT_MIN_RETENTION = 0.55
/** Weniger als dieser Anteil opaker Pixel im Ergebnis = Logo praktisch weg = Over-Cut. */
export const OVERCUT_ABSOLUTE_FLOOR = 0.004

type Pixels = ArrayLike<number>
type Rgb = { r: number; g: number; b: number }

function pxAt(data: Pixels, idx: number, channels: number) {
  const i = idx * channels
  return {
    r: data[i],
    g: data[i + 1],
    b: data[i + 2],
    a: channels >= 4 ? data[i + 3] : 255,
  }
}

/**
 * Sampelt die 4 Ecken mit 2px Offset zum Rand (Anti-Alias-Schutz) — identisch
 * zu server-bg-remove.ts.
 */
export function sampleCornerColors(data: Pixels, width: number, height: number, channels: number) {
  const at = (x: number, y: number) => pxAt(data, y * width + x, channels)
  return [
    at(2, 2),
    at(width - 3, 2),
    at(2, height - 3),
    at(width - 3, height - 3),
  ]
}

/**
 * Gibt die Hintergrund-Farbe zurueck wenn ein solider, near-white/near-black/
 * light-uniform Hintergrund erkannt wird — sonst null. Spiegelt die Klassifikation
 * aus server-bg-remove.ts (isUniform / isNearWhite / isNearBlack / isLightUniform).
 */
export function detectSolidBackground(
  data: Pixels,
  width: number,
  height: number,
  channels: number,
): Rgb | null {
  if (width < 5 || height < 5) return null
  const corners = sampleCornerColors(data, width, height, channels)
  // Transparente Ecke = echtes PNG-Padding -> das Logo hat schon Alpha-Info,
  // wir wuerden mit Chroma-Key den sichtbaren rgb(0,0,0) killen. Kein solider BG.
  if (corners.some((c) => c.a < 200)) return null

  const avg = {
    r: Math.round(corners.reduce((s, c) => s + c.r, 0) / 4),
    g: Math.round(corners.reduce((s, c) => s + c.g, 0) / 4),
    b: Math.round(corners.reduce((s, c) => s + c.b, 0) / 4),
  }
  const isUniform = corners.every(
    (c) =>
      Math.abs(c.r - avg.r) < 12 &&
      Math.abs(c.g - avg.g) < 12 &&
      Math.abs(c.b - avg.b) < 12,
  )
  if (!isUniform) return null

  const isNearWhite = avg.r > 235 && avg.g > 235 && avg.b > 235
  const isNearBlack = avg.r < 20 && avg.g < 20 && avg.b < 20
  const isLightUniform =
    avg.r > 200 &&
    avg.g > 200 &&
    avg.b > 200 &&
    Math.max(avg.r, avg.g, avg.b) - Math.min(avg.r, avg.g, avg.b) < 8
  if (!isNearWhite && !isNearBlack && !isLightUniform) return null

  return avg
}

/** Euklidische RGB-Distanz. */
export function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * Anteil der Pixel, die (a) sichtbar sind (alpha > 0) UND (b) NICHT zur
 * Hintergrund-Farbe gehoeren (RGB-Distanz > thresh) — also der geschaetzte
 * Vordergrund-Anteil des Logos.
 */
export function nonBackgroundRatio(
  data: Pixels,
  width: number,
  height: number,
  channels: number,
  bg: Rgb,
  thresh: number = BG_MATCH_THRESH,
): number {
  const total = width * height
  if (total === 0) return 0
  let fg = 0
  for (let p = 0; p < total; p++) {
    const px = pxAt(data, p, channels)
    if (px.a <= 0) continue
    if (colorDistance(px, bg) > thresh) fg++
  }
  return fg / total
}

/** Anteil der Pixel mit alpha >= cutoff (== "sichtbar" im Ergebnis). */
export function opaqueRatio(
  data: Pixels,
  width: number,
  height: number,
  channels: number,
  cutoff: number = ALPHA_OPAQUE_CUTOFF,
): number {
  const total = width * height
  if (total === 0) return 0
  let opaque = 0
  for (let p = 0; p < total; p++) {
    const a = channels >= 4 ? data[p * channels + 3] : 255
    if (a >= cutoff) opaque++
  }
  return opaque / total
}

/**
 * Bestimmt die Retention-Referenz (der "Vordergrund vorher"-Wert) fuer den
 * Over-Cut-Guard aus dem ORIGINAL — 3-Wege, damit imgly-Erosion in beiden
 * realen Upload-Formen gefangen wird:
 *
 * - `alpha`: das Original hat schon Transparenz (Ecke alpha<200) -> Referenz =
 *   dessen opaker Anteil. Faengt "imgly erodiert ein bereits sauberes Logo".
 * - `solid-bg`: solider near-white/black/light BG erkannt -> Referenz =
 *   nonBackgroundRatio (Logo-Flaeche gegen den soliden BG).
 * - `none`: opaker, nicht-solider BG (Foto/Gradient) -> KEIN Urteil (null),
 *   dort ist imgly genuin noetig und darf viel entfernen.
 */
export function estimateForegroundReference(
  data: Pixels,
  width: number,
  height: number,
  channels: number,
): { ref: number | null; basis: 'alpha' | 'solid-bg' | 'none' } {
  if (width < 5 || height < 5) return { ref: null, basis: 'none' }
  const corners = sampleCornerColors(data, width, height, channels)
  if (corners.some((c) => c.a < 200)) {
    return { ref: opaqueRatio(data, width, height, channels), basis: 'alpha' }
  }
  const bg = detectSolidBackground(data, width, height, channels)
  if (bg) return { ref: nonBackgroundRatio(data, width, height, channels, bg), basis: 'solid-bg' }
  return { ref: null, basis: 'none' }
}

/**
 * Entscheidet ob imgly zu viel weggeschnitten hat.
 *
 * - `opaqueRatioAfter` < absoluteFloor -> Ergebnis quasi leer (Logo weg) -> Over-Cut.
 * - Wenn ein solider BG messbar war (`foregroundRatioBefore` != null): behaelt
 *   imgly weniger als `minRetention` des geschaetzten Vordergrunds -> Over-Cut.
 * - Sonst (BG nicht messbar, z.B. Foto-/Gradient-Hintergrund): kein Ratio-Urteil,
 *   nur der absolute Floor greift (konservativ — imgly ist dort genuin noetig).
 */
export function decideImglyOvercut(params: {
  foregroundRatioBefore: number | null
  opaqueRatioAfter: number
  minRetention?: number
  absoluteFloor?: number
}): { overcut: boolean; reason: string } {
  const minRet = params.minRetention ?? OVERCUT_MIN_RETENTION
  const floor = params.absoluteFloor ?? OVERCUT_ABSOLUTE_FLOOR

  if (params.opaqueRatioAfter < floor) {
    return { overcut: true, reason: `near-empty (${(params.opaqueRatioAfter * 100).toFixed(2)}% opak)` }
  }
  if (params.foregroundRatioBefore != null && params.foregroundRatioBefore > 0) {
    const retention = params.opaqueRatioAfter / params.foregroundRatioBefore
    if (retention < minRet) {
      return {
        overcut: true,
        reason: `retention ${Math.round(retention * 100)}% < ${Math.round(minRet * 100)}%`,
      }
    }
  }
  return { overcut: false, reason: 'ok' }
}
