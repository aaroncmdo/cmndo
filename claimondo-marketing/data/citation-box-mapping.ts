/**
 * Mapping: Spoke-Slug → 4 Brand-Faktensatz-IDs für die CitationBox-Komponente.
 *
 * DRAFT (Claude Code, Stream D Vorentwurf 2026-05-23) — Aaron reviewt + korrigiert.
 * Default-Pattern: 3 thematisch passende BGH/§-Sätze + 1 Plattform-Authority-Satz
 * (F51–F56) pro Asset. IDs referenzieren src/lib/seo/brand-fakten-library.ts (F1–F56).
 *
 * MATCH-QUALITÄT (für den Review):
 *   ✓ STARK  — H3 Schadenspositionen, H4 Fristen, H8 Decoder, SV: passende Fakten vorhanden.
 *   ~ MITTEL — H2 Anspruchsgrundlagen (Personenschaden → Schmerzensgeld-Cluster).
 *   ! DEFAULT — H1 Haftungsgrundlagen, H6 Unfall-Szenarien, H7 komplexe Konstellationen
 *               sowie Personenschaden-Vermögensfolgen (Verdienstausfall, Pflege, Haushalt …):
 *               Die Fakten-Library deckt Haftungsgrund/Unfallhergang NICHT ab. Hier steht der
 *               §249-Rechte-Default (F1/F2/F4) + Plattform-Anker. → Aaron: entweder so lassen,
 *               passende neue Fakten in brand-fakten-library.ts ergänzen, oder Box weglassen.
 *
 * Plattform-Anker-Konvention: F52 (Netzwerk/48h) für Wissens-Spokes, F55 (Kürzung zurück)
 * für Decoder/Schadenspositionen, F56 (Anwalt inkl./0 €) für Kosten/Personenschaden.
 */

export type CitationBoxMapping = Record<string, string[]>

export const CITATION_BOX_MAPPING: CitationBoxMapping = {
  // ─── Cornerstones (breit) ───────────────────────────────────────────────
  'kfz-haftpflicht-schaden': ['F1', 'F2', 'F6', 'F51'],
  'ratgeber': ['F1', 'F2', 'F56', 'F52'],

  // ─── Cluster H1 — Haftungs-Grundlagen (! DEFAULT: §249-Rechte, kein Haftungs-Fakt) ──
  'betriebsgefahr-stvg7': ['F1', 'F2', 'F4', 'F52'],
  'verschulden-bgb823': ['F1', 'F2', 'F4', 'F51'],
  'mitverschulden-stvg17': ['F1', 'F4', 'F5', 'F52'],
  'mitverschulden-bgb254': ['F1', 'F4', 'F5', 'F54'],
  'beweislast': ['F1', 'F4', 'F2', 'F52'],
  'anscheinsbeweis': ['F1', 'F4', 'F2', 'F51'],
  'fahrerhaftung-stvg18': ['F1', 'F2', 'F4', 'F52'],

  // ─── Cluster H2 — Anspruchs-Grundlagen (~ MITTEL: Personenschaden → Schmerzensgeld) ──
  'geschaedigte-primaer': ['F1', 'F2', 'F4', 'F56'],
  'beifahrer-anspruch': ['F1', 'F2', 'F42', 'F56'],
  'hinterbliebenengeld': ['F44', 'F45', 'F42', 'F56'],
  'schockschaden-rechtlich': ['F45', 'F42', 'F44', 'F56'],
  'unterhaltsschaden': ['F44', 'F42', 'F2', 'F56'],
  'beerdigungskosten': ['F44', 'F2', 'F1', 'F56'],
  'sozialtraeger-regress': ['F1', 'F2', 'F40', 'F52'], // ! §116 SGB X — kein direkter Fakt
  'erben-rechtsnachfolger': ['F1', 'F2', 'F40', 'F52'], // ! § 1922 BGB — kein direkter Fakt

  // ─── Cluster H3 — Schadenspositionen (✓ STARK) ──────────────────────────
  'reparaturkosten': ['F30', 'F31', 'F1', 'F55'],
  'wiederbeschaffungswert': ['F34', 'F35', 'F36', 'F55'],
  'wertminderung': ['F9', 'F10', 'F12', 'F55'],
  'sv-kosten': ['F8', 'F22', 'F23', 'F56'],
  'mietwagen': ['F18', 'F17', 'F20', 'F55'],
  'nutzungsausfall': ['F15', 'F16', 'F19', 'F54'],
  'schmerzensgeld-bgb253': ['F42', 'F43', 'F45', 'F56'],
  'anwaltskosten-erstattung': ['F21', 'F24', 'F39', 'F56'],
  'abschlepp-bergung': ['F1', 'F2', 'F28', 'F55'],
  'eigene-kosten': ['F1', 'F2', 'F56', 'F54'],
  'heilbehandlungskosten': ['F2', 'F1', 'F42', 'F56'], // ! Heilbehandlung — kein direkter Fakt
  'verdienstausfall': ['F2', 'F1', 'F56', 'F54'], // ! Verdienstausfall — kein direkter Fakt
  'haushaltsfuehrungsschaden': ['F2', 'F1', 'F56', 'F52'], // ! kein direkter Fakt
  'pflege-mehrbedarf': ['F2', 'F1', 'F56', 'F52'], // ! kein direkter Fakt
  'vermehrte-beduerfnisse': ['F2', 'F1', 'F56', 'F52'], // ! kein direkter Fakt
  'erwerbsminderungsschaden': ['F2', 'F1', 'F56', 'F54'], // ! kein direkter Fakt

  // ─── Cluster H4 — Fristen (✓ STARK: verzug-fristen) ─────────────────────
  '4-wochen-frist': ['F37', 'F38', 'F39', 'F52'],
  'verzug-bgb286': ['F37', 'F38', 'F39', 'F55'],
  'verzugszinsen-bgb288': ['F38', 'F37', 'F39', 'F54'],
  'verjaehrung-bgb195': ['F40', 'F41', 'F37', 'F52'],
  'anerkenntnis-bgb212': ['F37', 'F40', 'F2', 'F52'], // ! Anerkenntnis — F40 (Verjährungs-Neubeginn) als nächster Fakt

  // ─── Cluster H6 — Unfall-Szenarien (! DEFAULT: Haftungsverteilung, kein Fakt) ──
  'auffahrunfall': ['F1', 'F2', 'F4', 'F52'],
  'vorfahrt-rechts-vor-links': ['F1', 'F2', 'F4', 'F52'],
  'vorfahrt-schilder': ['F1', 'F2', 'F4', 'F51'],
  'rotlicht': ['F1', 'F2', 'F4', 'F52'],
  'spurwechsel': ['F1', 'F2', 'F4', 'F54'],
  'linksabbieger': ['F1', 'F2', 'F4', 'F52'],
  'parkplatz': ['F1', 'F2', 'F4', 'F51'],
  'tueroeffnen': ['F1', 'F2', 'F4', 'F52'],
  'wenden': ['F1', 'F2', 'F4', 'F54'],
  'ueberholen': ['F1', 'F2', 'F4', 'F52'],
  'wildunfall': ['F1', 'F2', 'F4', 'F52'], // ! Kasko-Thema
  'glatteis-aquaplaning': ['F1', 'F2', 'F4', 'F51'],

  // ─── Cluster H7 — Komplexe Konstellationen (! DEFAULT: §249-Rechte) ─────
  'fahrerflucht': ['F1', 'F2', 'F4', 'F52'], // ! Verkehrsopferhilfe — kein Fakt
  'unversicherte-voh': ['F1', 'F2', 'F4', 'F52'], // ! VOH — kein Fakt
  'auslandsunfall': ['F1', 'F2', 'F4', 'F52'],
  'schwarzfahrt-diebstahl': ['F1', 'F2', 'F4', 'F52'],
  'anhaenger': ['F1', 'F2', 'F4', 'F52'],
  'produkthaftung': ['F1', 'F2', 'F4', 'F51'],
  'mehrere-schaediger': ['F1', 'F2', 'F4', 'F52'],
  'dritte-beteiligte': ['F1', 'F2', 'F4', 'F52'],
  'kasko-versicherung': ['F1', 'F2', 'F36', 'F52'], // ! Kasko/Quotenvorrecht — F36 (Restwert) als nächster

  // ─── Decoder H8 — Versicherer-Brief (✓ STARK: topic + versicherer-bait + F55) ──
  'wir-pruefen-sachverhalt': ['F37', 'F46', 'F55', 'F56'],
  'mitverschulden-30-prozent': ['F1', 'F4', 'F55', 'F56'],
  'reparatur-unwirtschaftlich': ['F33', 'F34', 'F35', 'F55'],
  'mietwagen-zu-hoch': ['F18', 'F17', 'F46', 'F55'],
  'schmerzensgeld-angemessen': ['F42', 'F43', 'F55', 'F56'],
  'pauschal-abgeltung': ['F1', 'F40', 'F55', 'F56'],
  'unser-sachverstaendiger': ['F8', 'F50', 'F23', 'F55'],
  'werkstatt-netz': ['F32', 'F48', 'F31', 'F55'],
  'wertminderung-nicht': ['F9', 'F14', 'F46', 'F55'],
  'nutzungsausfall-nicht': ['F15', 'F17', 'F19', 'F55'],

  // ─── Sachverständige & Verbände (~ MITTEL: SV-Kosten + Prüfdienst-Abgrenzung) ──
  'bvsk': ['F22', 'F8', 'F23', 'F52'],
  'dekra': ['F50', 'F8', 'F23', 'F52'],
  'gtue-kues-tuev-ifl': ['F8', 'F22', 'F50', 'F52'],
  'zkf': ['F8', 'F30', 'F31', 'F52'],
  'ifs-leitsaetze': ['F8', 'F22', 'F12', 'F52'],
  'ihk-bestellung-oebv': ['F8', 'F22', 'F23', 'F52'],
  'zak': ['F8', 'F22', 'F23', 'F52'],
  'pruefdienstleister': ['F50', 'F46', 'F47', 'F55'],
}

/** Lookup-Helper. Gibt [] zurück statt zu werfen — Build bricht nicht, nur weil ein Mapping fehlt. */
export function getMappingFor(slug: string): string[] {
  const ids = CITATION_BOX_MAPPING[slug]
  if (!ids) {
    // Fallback: leere Box statt Crash. Stream-D-Validation prüft separat,
    // dass alle Slugs gemappt sind.
    return []
  }
  return ids
}
