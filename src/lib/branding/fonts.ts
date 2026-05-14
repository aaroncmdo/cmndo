// AAR-421: Typography-Registry für Whitelabeling V2.
//
// 9 kuratierte Google-Font-Paare in 3 Kategorien (Racing/Elegance/Kanoo).
// Die Empfehlung kommt aus Claude-Vision (AAR-420), das Rendering aus
// FontPreview (hier) bzw. dem BrandingProvider (AAR-424).
//
// Die Fonts sind reine Metadata — Font-Loading (via <link> im Preview bzw.
// next/font/google im Portal) passiert in den Consumern. Das hält diese
// Datei server-/client-agnostisch.

export type FontCategory = 'racing' | 'elegance' | 'kanoo'

export type FontPair = {
  id: string
  category: FontCategory
  label: string
  heading: { family: string; weights: number[] }
  body: { family: string; weights: number[] }
  cssStack: {
    heading: string
    body: string
  }
  preview: string
}

// System-Fallbacks für alle Pairs — verhindern FOIT/FOUT falls Google
// Fonts geblockt oder langsam sind.
const SANS_FALLBACK = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
const SERIF_FALLBACK = `Georgia, Cambria, 'Times New Roman', Times, serif`

export const FONT_PAIRS: Record<string, FontPair> = {
  // ── Racing (sportlich/dynamisch) ──
  racing_1: {
    id: 'racing_1',
    category: 'racing',
    label: 'Modern Tech',
    heading: { family: 'Space Grotesk', weights: [500, 700] },
    body: { family: 'Inter', weights: [400, 500, 600] },
    cssStack: {
      heading: `'Space Grotesk', ${SANS_FALLBACK}`,
      body: `'Inter', ${SANS_FALLBACK}`,
    },
    preview: 'Präzise. Schnell. Digital.',
  },
  racing_2: {
    id: 'racing_2',
    category: 'racing',
    label: 'Energetisch Universal',
    heading: { family: 'Montserrat', weights: [600, 700] },
    body: { family: 'Open Sans', weights: [400, 600] },
    cssStack: {
      heading: `'Montserrat', ${SANS_FALLBACK}`,
      body: `'Open Sans', ${SANS_FALLBACK}`,
    },
    preview: 'Energie trifft Klarheit.',
  },
  racing_3: {
    id: 'racing_3',
    category: 'racing',
    label: 'Bold Statement',
    heading: { family: 'Archivo Black', weights: [400] },
    body: { family: 'Archivo', weights: [400, 500, 600] },
    cssStack: {
      heading: `'Archivo Black', ${SANS_FALLBACK}`,
      body: `'Archivo', ${SANS_FALLBACK}`,
    },
    preview: 'Sag es laut.',
  },
  // 2026-05-14: Auto-affine Font-Pairs für KFZ-Branding (Aaron-Brief
  // "Schriftarten die mehr auf 'auto' angelehnt sind"). Schmale, technische
  // oder solide Sans-Serifs aus dem Werkstatt-/Motorsport-Vokabular.
  racing_4: {
    id: 'racing_4',
    category: 'racing',
    label: 'Werkstatt Industrial',
    heading: { family: 'Saira Condensed', weights: [600, 800] },
    body: { family: 'Inter', weights: [400, 500] },
    cssStack: {
      heading: `'Saira Condensed', ${SANS_FALLBACK}`,
      body: `'Inter', ${SANS_FALLBACK}`,
    },
    preview: 'KFZ. Schmal. Direkt.',
  },
  racing_5: {
    id: 'racing_5',
    category: 'racing',
    label: 'Tech Speed',
    heading: { family: 'Rajdhani', weights: [600, 700] },
    body: { family: 'Manrope', weights: [400, 500, 600] },
    cssStack: {
      heading: `'Rajdhani', ${SANS_FALLBACK}`,
      body: `'Manrope', ${SANS_FALLBACK}`,
    },
    preview: 'Tachometer-tauglich.',
  },
  racing_6: {
    id: 'racing_6',
    category: 'racing',
    label: 'Garage Solid',
    heading: { family: 'Russo One', weights: [400] },
    body: { family: 'Lato', weights: [400, 700] },
    cssStack: {
      heading: `'Russo One', ${SANS_FALLBACK}`,
      body: `'Lato', ${SANS_FALLBACK}`,
    },
    preview: 'Solid Mechanical.',
  },

  // ── Elegance (edel/klassisch) ──
  elegance_1: {
    id: 'elegance_1',
    category: 'elegance',
    label: 'Klassisch Serif',
    heading: { family: 'Playfair Display', weights: [500, 700] },
    body: { family: 'Lato', weights: [400, 700] },
    cssStack: {
      heading: `'Playfair Display', ${SERIF_FALLBACK}`,
      body: `'Lato', ${SANS_FALLBACK}`,
    },
    preview: 'Eleganz in jedem Detail.',
  },
  elegance_2: {
    id: 'elegance_2',
    category: 'elegance',
    label: 'Refined',
    heading: { family: 'Cormorant Garamond', weights: [500, 700] },
    body: { family: 'Source Sans 3', weights: [400, 600] },
    cssStack: {
      heading: `'Cormorant Garamond', ${SERIF_FALLBACK}`,
      body: `'Source Sans 3', ${SANS_FALLBACK}`,
    },
    preview: 'Klarheit als Haltung.',
  },
  elegance_3: {
    id: 'elegance_3',
    category: 'elegance',
    label: 'Zeitloses Serif',
    heading: { family: 'Libre Baskerville', weights: [400, 700] },
    body: { family: 'Inter', weights: [400, 500] },
    cssStack: {
      heading: `'Libre Baskerville', ${SERIF_FALLBACK}`,
      body: `'Inter', ${SANS_FALLBACK}`,
    },
    preview: 'Zeitlos gut.',
  },

  // ── Kanoo (funktional/freundlich) ──
  kanoo_1: {
    id: 'kanoo_1',
    category: 'kanoo',
    label: 'System Clean',
    heading: { family: 'Inter', weights: [600, 700] },
    body: { family: 'Inter', weights: [400, 500] },
    cssStack: {
      heading: `'Inter', ${SANS_FALLBACK}`,
      body: `'Inter', ${SANS_FALLBACK}`,
    },
    preview: 'Einfach funktional.',
  },
  kanoo_2: {
    id: 'kanoo_2',
    category: 'kanoo',
    label: 'Rund & Freundlich',
    heading: { family: 'Nunito', weights: [600, 700] },
    body: { family: 'Nunito Sans', weights: [400, 600] },
    cssStack: {
      heading: `'Nunito', ${SANS_FALLBACK}`,
      body: `'Nunito Sans', ${SANS_FALLBACK}`,
    },
    preview: 'Freundlich, aber klar.',
  },
  kanoo_3: {
    id: 'kanoo_3',
    category: 'kanoo',
    label: 'Modern Neutral',
    heading: { family: 'Manrope', weights: [600, 700] },
    body: { family: 'Manrope', weights: [400, 500] },
    cssStack: {
      heading: `'Manrope', ${SANS_FALLBACK}`,
      body: `'Manrope', ${SANS_FALLBACK}`,
    },
    preview: 'Ruhig, modern, präzise.',
  },
}

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  racing: 'Racing',
  elegance: 'Elegance',
  kanoo: 'Kanoo',
}

// Default-Pair pro Kategorie — wird gepickt wenn Vision nur eine Kategorie
// empfiehlt, aber kein spezifisches Pair.
export const DEFAULT_FONT_PER_CATEGORY: Record<FontCategory, string> = {
  racing: 'racing_1',
  elegance: 'elegance_1',
  kanoo: 'kanoo_1',
}

// Fallback wenn ein SV weder Branding noch Vision-Empfehlung hat.
// Claimondo-Standard ist Inter + Inter (kanoo_1).
export const CLAIMONDO_DEFAULT_FONT_PAIR_ID = 'kanoo_1'

// ─────────────────────────────────────────────────────────────────────────────
// Lookup + Helper
// ─────────────────────────────────────────────────────────────────────────────

export function getFontPair(id: string | null | undefined): FontPair {
  if (!id) return FONT_PAIRS[CLAIMONDO_DEFAULT_FONT_PAIR_ID]
  return FONT_PAIRS[id] ?? FONT_PAIRS[CLAIMONDO_DEFAULT_FONT_PAIR_ID]
}

export function getPairsByCategory(category: FontCategory): FontPair[] {
  return Object.values(FONT_PAIRS).filter(p => p.category === category)
}

// Baut die Google-Fonts-CSS2-URL für ein Paar. Wird im FontPreview für
// dynamisches Laden via <link>-Tag genutzt. Bundled CSS kommt später im
// BrandingProvider (AAR-424).
export function buildGoogleFontsUrl(pair: FontPair): string {
  const families = new Map<string, Set<number>>()
  const collect = (fam: string, weights: number[]) => {
    if (!families.has(fam)) families.set(fam, new Set())
    weights.forEach(w => families.get(fam)!.add(w))
  }
  collect(pair.heading.family, pair.heading.weights)
  collect(pair.body.family, pair.body.weights)

  const parts = Array.from(families.entries()).map(([fam, ws]) => {
    const weights = Array.from(ws).sort((a, b) => a - b).join(';')
    return `family=${encodeURIComponent(fam)}:wght@${weights}`
  })
  return `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`
}
