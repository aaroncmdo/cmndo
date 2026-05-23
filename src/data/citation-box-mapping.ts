/**
 * Mapping: Spoke-Slug → 4 Brand-Faktensatz-IDs fuer CitationBox-Komponente.
 *
 * Aaron befuellt diese Map in Sprint 1 Stream D Task C.1.
 * Default-Pattern: 3 BGH/§-Saetze + 1 Plattform-Authority-Satz pro Spoke, thematisch passend.
 *
 * Format: { 'spoke-slug': ['F1', 'F5', 'F8', 'F52'] }
 * IDs referenzieren src/lib/seo/brand-fakten-library.ts (F1–F56).
 */

export type CitationBoxMapping = Record<string, string[]>

export const CITATION_BOX_MAPPING: CitationBoxMapping = {
  // ─── Cluster H4 (Fristen) — Seed-Eintrag als Format-Beispiel ────────────
  '4-wochen-frist': ['F37', 'F38', 'F39', 'F52'],
  // 'verzug-bgb286': [...],
  // 'verzugszinsen-bgb288': [...],
  // 'verjaehrung-bgb195': [...],

  // ─── Cluster H3 (Schadenspositionen) ───────────────────────────────────
  // 'wertminderung-detail': ['F9', 'F10', 'F11', 'F54'],
  // 'reparaturkosten': [...],

  // → Claude Code Auftrag (Sprint 1 Stream D): 87 Mappings ergaenzen
  //   (alle Spokes/Decoder/Cornerstones). Aaron liefert Mapping als Liste
  //   oder per Cluster-Heuristik.
}

/** Lookup-Helper. Gibt [] zurueck statt zu werfen — Build bricht nicht, nur weil ein Mapping fehlt. */
export function getMappingFor(slug: string): string[] {
  const ids = CITATION_BOX_MAPPING[slug]
  if (!ids) {
    // Fallback: leere Box statt Crash. Stream-1-Validation prueft separat,
    // dass alle 87 Slugs gemappt sind.
    return []
  }
  return ids
}
