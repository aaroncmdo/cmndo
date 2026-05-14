// AAR-420: Logo-Palette-Extraktion V2.
//
// V1 (extractTwoColors) bleibt erhalten für die Willkommen-Flow Call-Sites in
// branding-actions.ts. Neu in V2: extractBrandPalette() — Multi-Kandidaten-
// Extraktion + Claude-Vision-Quality-Check + triadische Fallbacks für
// Single-Color-Logos + WCAG-Safe-Cascade.

import { Vibrant } from 'node-vibrant/node'
import chroma from 'chroma-js'
import { ensureContrastSafe, generateTheme } from './theme'
import { analyzeLogo, type ClaudeLogoAnalysis } from './claude-vision'

// ─────────────────────────────────────────────────────────────────────────────
// V1 (Legacy — Willkommen-Flow)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * KFZ-139 / AAR-220: Zwei-Farben-Extraktion für den Willkommen-Flow. Bleibt
 * unverändert — der Solo/Büro-Onboarding-Wizard nutzt das. Neuere Consumer
 * sollen auf extractBrandPalette() migrieren.
 */
export async function extractTwoColors(imageUrl: string): Promise<{ primary: string; secondary: string }> {
  const palette = await Vibrant.from(imageUrl).getPalette()

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

  candidates.sort((a, b) => (b?.population ?? 0) - (a?.population ?? 0))

  const primaryHex = candidates[0]!.hex
  const primary = ensureContrast(primaryHex)

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

  if (chroma.deltaE(primary, secondary) < 15) {
    secondary = chroma(primary).brighten(1.5).hex()
  }

  return { primary, secondary }
}

/**
 * WCAG AA Normal-Text: Kontrast ≥ 4.5:1 gegen Weiß. Dunkelt iterativ ab.
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

// ─────────────────────────────────────────────────────────────────────────────
// V2 — Multi-Kandidaten + Claude-Vision (AAR-420)
// ─────────────────────────────────────────────────────────────────────────────

export type BrandPaletteExtraction = {
  primary: string
  secondary: string
  accent: string
  candidates: {
    primary: string[]
    secondary: string[]
    accent: string[]
  }
  brandMood: ClaudeLogoAnalysis['brandMood']
  recommendedFontCategory: ClaudeLogoAnalysis['recommendedFontCategory']
  contrastSafe: boolean
  fallbackReason?: 'NO_COLORS' | 'WCAG_FAIL' | 'SINGLE_COLOR' | 'CLAUDE_OVERRIDE'
}

type RawSwatch = { hex: string; population: number; hsl: [number, number, number] }

function toRawSwatch(s: { hex: string; population: number; hsl: [number, number, number] } | null | undefined): RawSwatch | null {
  if (!s || typeof s.hex !== 'string') return null
  const h = Number.isFinite(s.hsl?.[0]) ? s.hsl[0] : 0
  const sat = Number.isFinite(s.hsl?.[1]) ? s.hsl[1] : 0
  const l = Number.isFinite(s.hsl?.[2]) ? s.hsl[2] : 0.5
  return { hex: s.hex.toUpperCase(), population: s.population ?? 0, hsl: [h, sat, l] }
}

// AAR-455: Neutral-Detection. Ein Swatch gilt als Hintergrund-Kandidat wenn
// er entweder sehr hell (Lightness ≥ 0.92), sehr dunkel (≤ 0.08) oder sehr
// desaturiert (Saturation < 0.15) ist. Solche Kandidaten dürfen die Primary
// nur dann gewinnen wenn gar keine echten Markenfarben vorhanden sind.
function isLikelyBackground(s: RawSwatch): boolean {
  const [, sat, l] = s.hsl
  return l >= 0.92 || l <= 0.08 || sat < 0.15
}

// 2026-05-14: Vibrancy-dominantes Ranking mit Population-Floor.
//
// Aaron-Brief „immer die knallige Farbe" — bei KARpro (Anthrazit-Body +
// Gelb-Akzent) gewann V1 das dunkle Anthrazit weil es 70% der Pixel macht.
// Knall-Gelb (kleine Fläche, hoch saturiert) ist aber das, was als Brand-
// Primary wahrgenommen wird.
//
// V2.1 (Edge-Pixel-Fix, 14.05. iter 2): reine Vibrancy-Gewichtung (0.7/0.3)
// belohnte allerdings Anti-Aliasing-Edge-Pixel — der Gelb→Schwarz-Übergang
// bei KARpro produziert Coral/Salmon-Pixel die zwar maximal saturiert sind,
// aber nur 1-3 % der Logo-Pixel ausmachen. Diese gewannen über das tatsächliche
// Gelb (5-15 % Population). Fix: Population-Floor (mindestens 8% der Max-
// Population), darunter wird ein Swatch nicht als Brand-Kandidat betrachtet.
//
// Vibrancy = saturation × (1 - distanceFromMidLightness). Schwarz/Weiß haben
// distance=1 → vibrancy=0. Mid-Sättigte mid-helle Farben haben distance=0
// → vibrancy=sat.
function rankByPopulationAndSaturation(swatches: RawSwatch[]): RawSwatch[] {
  if (swatches.length === 0) return []
  const maxPop = Math.max(...swatches.map(s => s.population)) || 1
  const POPULATION_FLOOR = 0.08 // 8% der dominanten Farbe — filtert Edge-Pixel

  // Edge-Artifact-Swatches kommen ans Ende, damit sie nur als letzter Notnagel
  // ausgewählt werden (für extrem sparse Logos).
  const significant = swatches.filter(s => s.population / maxPop >= POPULATION_FLOOR)
  const trace = swatches.filter(s => s.population / maxPop < POPULATION_FLOOR)

  const brand = significant.filter(s => !isLikelyBackground(s))
  const background = significant.filter(isLikelyBackground)

  const score = (s: RawSwatch) => {
    const [, sat, l] = s.hsl
    const distFromMid = Math.abs(l - 0.5)
    const vibrancy = sat * (1 - distFromMid)
    // Vibrancy 60%, Population 40%. Edge-Pixel sind durch Floor schon raus,
    // Population gibt jetzt Anti-Edge-Insurance + Real-Brand-Stabilität.
    return vibrancy * 0.6 + (s.population / maxPop) * 0.4
  }

  const sortedBrand = [...brand].sort((a, b) => score(b) - score(a))
  const sortedBg = [...background].sort((a, b) => score(b) - score(a))
  const sortedTrace = [...trace].sort((a, b) => score(b) - score(a))

  return [...sortedBrand, ...sortedBg, ...sortedTrace]
}

// Triadische Ableitung: Primary + 120° Hue + 240° Hue. Wird genutzt wenn
// das Logo nur 1-2 brauchbare Farben hat (zB monochromes Schwarz-Logo).
function deriveTriadic(primaryHex: string): { secondary: string; accent: string } {
  const [h, s, l] = chroma(primaryHex).hsl()
  const hSafe = Number.isFinite(h) ? h : 220
  // Für sehr desaturierte Primary (Schwarz/Weiß/Grau) S leicht anheben damit
  // die Triade überhaupt sichtbar wird.
  const sSafe = Math.max(s ?? 0, 0.35)
  const lSafe = Math.max(0.2, Math.min(0.7, l ?? 0.4))
  const secondary = chroma.hsl((hSafe + 120) % 360, sSafe, lSafe).hex().toUpperCase()
  const accent = chroma.hsl((hSafe + 240) % 360, sSafe, lSafe).hex().toUpperCase()
  return { secondary, accent }
}

// Picks zweite + dritte Farbe so, dass sie maximal distinkt zur Primary sind
// (deltaE). Fällt auf triadische Ableitung zurück wenn zu wenig Kandidaten.
function pickSecondaryAndAccent(primary: string, others: RawSwatch[]): {
  secondary: string
  accent: string
  usedTriadic: boolean
} {
  if (others.length === 0) {
    const t = deriveTriadic(primary)
    return { secondary: t.secondary, accent: t.accent, usedTriadic: true }
  }

  // Sortieren nach distance from primary (deltaE)
  const sorted = [...others].sort((a, b) => {
    return chroma.deltaE(primary, b.hex) - chroma.deltaE(primary, a.hex)
  })

  const secondary = sorted[0]?.hex ?? deriveTriadic(primary).secondary
  if (sorted.length < 2 || chroma.deltaE(primary, secondary) < 10) {
    const t = deriveTriadic(primary)
    return { secondary: t.secondary, accent: t.accent, usedTriadic: true }
  }

  const accent = sorted[1]?.hex ?? deriveTriadic(primary).accent
  return { secondary, accent, usedTriadic: false }
}

// WCAG-Cascade: Wenn ein generiertes Theme mit dieser Primary contrast-unsafe
// ist, dunkeln wir die Primary iterativ bis WCAG Large (≥3.0) erfüllt ist.
function enforceWcag(primary: string): { primary: string; safe: boolean } {
  let current = primary
  for (let i = 0; i < 10; i++) {
    const theme = generateTheme(current)
    if (ensureContrastSafe(theme)) return { primary: current.toUpperCase(), safe: true }
    current = chroma(current).darken(0.5).hex()
  }
  return { primary: current.toUpperCase(), safe: false }
}

/**
 * AAR-420: Haupt-Extraktion. Wird vom /api/branding/extract Endpoint + Child 4
 * UI aufgerufen. Deterministic für gleiche Logo-URL (modulo Claude-Vision das
 * geringfügig driftet — aber der Prompt ist strikt-JSON).
 */
export async function extractBrandPalette(imageUrl: string): Promise<BrandPaletteExtraction> {
  // 1) node-vibrant: 6 Kandidaten.
  // 2026-05-14 iter 3: Pre-Processing für transparente Logos + Format-Normalisierung.
  // node-vibrant v4 hat keinen Custom-Filter mehr, also flatten wir den Alpha-
  // Channel auf Weiß (Vibrant's eingebauter Default-Filter verwirft Near-White
  // UND Near-Black → Ex-Transparent-Pixel verschwinden sauber aus dem Ranking).
  // Zusätzlich `.png()` als explizite Output-Konvertierung, damit AVIF/HEIC und
  // andere exotische Formate über sharp's Decoder gehen — Vibrant selbst kann
  // AVIF nicht lesen (Fronius hatte AVIF → komplette Extraktions-Failure).
  const sharp = (await import('sharp')).default
  const imgResp = await fetch(imageUrl)
  if (!imgResp.ok) throw new Error(`Logo-Fetch fehlgeschlagen: HTTP ${imgResp.status}`)
  const srcBuffer = Buffer.from(await imgResp.arrayBuffer())
  const flatBuffer = await sharp(srcBuffer)
    .flatten({ background: '#FFFFFF' })
    .png()
    .toBuffer()

  const palette = await Vibrant.from(flatBuffer).getPalette()
  const rawSwatches: RawSwatch[] = [
    palette.Vibrant, palette.DarkVibrant, palette.LightVibrant,
    palette.Muted, palette.DarkMuted, palette.LightMuted,
  ].map(toRawSwatch).filter((s): s is RawSwatch => s !== null)

  if (rawSwatches.length === 0) {
    return {
      primary: '#0D1B3E',
      secondary: '#4573A2',
      accent: '#7BA3CC',
      candidates: { primary: [], secondary: [], accent: [] },
      brandMood: 'unbekannt',
      recommendedFontCategory: 'kanoo',
      contrastSafe: true,
      fallbackReason: 'NO_COLORS',
    }
  }

  // 2) Ranking
  const ranked = rankByPopulationAndSaturation(rawSwatches)

  // 3) Claude-Vision mit Kandidatenliste — Claude wählt primary + secondary
  // aktiv aus den Vibrant-Swatches statt nur die schon vorgewählte Primary
  // zu bewerten. Bias: chromatischer Akzent schlägt neutrales Dominant-Grau
  // (KFZ-Logos mit grauem Body + farbigem Detail wie fronius-Grün oder
  // gall-Flammen-Orange).
  const primaryCandidate = ranked[0]!.hex
  const candidateHexes = ranked.map(s => s.hex)
  const visionPromise = analyzeLogo(imageUrl, primaryCandidate, candidateHexes)

  // 4) Single-Color-Detection
  const isSingleColor = ranked.length < 2
    || ranked.slice(1).every(s => chroma.deltaE(primaryCandidate, s.hex) < 10)

  // 5) Await Vision
  const vision = await visionPromise

  // 6) Claude darf primary überstimmen wenn die emotionale Brand-Farbe nicht
  //    das größte Cluster ist. Plus: Claude darf auch eine secondary picken.
  let primary = primaryCandidate
  let claudeOverride = false
  if (!vision.primaryColorOk && vision.primarySuggestion) {
    primary = vision.primarySuggestion
    claudeOverride = true
  }

  // 7) Secondary + Accent — Claude's Pick gewinnt wenn vorhanden, sonst
  //    deltaE-Fallback aus dem Ranking.
  const others = ranked.filter(s => s.hex !== primaryCandidate)
  let picked = pickSecondaryAndAccent(primary, others)
  if (vision.secondarySuggestion && chroma.deltaE(primary, vision.secondarySuggestion) >= 10) {
    // Claude hat eine secondary aus dem Logo gewählt — übernehmen. Accent
    // bleibt aus dem deltaE-Pick (zweit-distinkteste Farbe nach Claude's pick).
    const accentCandidates = others.filter(s =>
      s.hex !== vision.secondarySuggestion
      && chroma.deltaE(primary, s.hex) >= 10
      && chroma.deltaE(vision.secondarySuggestion!, s.hex) >= 10,
    )
    const accent = accentCandidates[0]?.hex ?? picked.accent
    picked = { secondary: vision.secondarySuggestion, accent, usedTriadic: false }
  }

  // 8) WCAG-Cascade
  const wcag = enforceWcag(primary)
  primary = wcag.primary

  // 9) Kandidaten für UI-Picker — alle gerankten Hexes, deduped.
  const allHexes = Array.from(new Set(ranked.map(s => s.hex)))
  const candidates = {
    primary: allHexes,
    secondary: allHexes.filter(h => chroma.deltaE(primary, h) >= 10),
    accent: allHexes.filter(h => chroma.deltaE(primary, h) >= 10 && h !== picked.secondary),
  }

  // 10) Fallback-Reason bestimmen (Priority-Order)
  let fallbackReason: BrandPaletteExtraction['fallbackReason']
  if (!wcag.safe) fallbackReason = 'WCAG_FAIL'
  else if (isSingleColor || picked.usedTriadic) fallbackReason = 'SINGLE_COLOR'
  else if (claudeOverride) fallbackReason = 'CLAUDE_OVERRIDE'

  return {
    primary,
    secondary: picked.secondary.toUpperCase(),
    accent: picked.accent.toUpperCase(),
    candidates,
    brandMood: vision.brandMood,
    recommendedFontCategory: vision.recommendedFontCategory,
    contrastSafe: wcag.safe,
    fallbackReason,
  }
}
