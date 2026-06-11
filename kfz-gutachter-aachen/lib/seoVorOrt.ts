import { seoTextFor } from './cluster'

// BRIEF 08l A2 · Der "Vor Ort in ganz {Stadt}"-Absatz zieht aus dem SEO-Body
// in Block 1 der Lokal-Strecke (EinsatzgebietSection) — Copy UNVERAENDERT,
// nur die Position. Gleiche Trigger-Regex wie der bisherige H3_CATALOG-
// 'vorort'-Eintrag; SeoBodySection schliesst den Treffer aus (kein Duplikat).
export const VORORT_TEST = /Stadtteil|binnen 60 Minuten/

export function vorortAbsatzFor(stadtSlug: string): string | null {
  const text = seoTextFor(stadtSlug)
  if (!text || text.includes('PLATZHALTER')) return null
  const paragraphs = text
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  // Absatz 0 (Intro) bleibt immer im SEO-Body — Suche ab Absatz 1 (wie H3-Logik).
  return paragraphs.slice(1).find((p) => VORORT_TEST.test(p)) ?? null
}
