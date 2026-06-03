/**
 * Versicherer-Stammdaten — Single Source of Truth fuer Pillar D (Versicherer-Hubs).
 *
 * Warum hier (TS) und nicht im MD-Frontmatter:
 * Der handgerollte Frontmatter-Parser in `claimondo-mdx.ts` kann KEIN verschachteltes
 * YAML. Strukturierte/numerische Versicherer-Daten leben daher type-sicher hier; die
 * MD-Dateien unter src/content/claimondo/versicherer/ tragen nur flaches Frontmatter
 * (publish_status, url, type, primary_keyword, related, meta_description, last_modified)
 * + Body. Der Loader `getVersicherer()` joint MD x VERSICHERER_LISTE ueber den Slug.
 *
 * Datenquellen:
 *   - R1 (Profile), R4 (BaFin-Quoten 2024), R7 (Kontakt) aus
 *     marketing-strategy/sprint-1-versicherer-hubs/data/01-recherche-master-*.md
 *   - KORREKTUREN.md: K1 (DA Direkt = Zurich, CosmosDirekt = Generali), K2 (ERGO 4,7)
 *   - 02-r2-kuerzungs-praxis-vollstaendig.md Teil E/F (BaFin-Cross-Check)
 *
 * Tonalitaet/Belegbarkeit (B2): Wo die offizielle BaFin-Statistik 2024 einen Versicherer
 * NICHT separat ausweist (Generali, CosmosDirekt, DA Direkt, Zurich-neue-NL), steht
 * `bafinQuote2024: null` + `bafinNote` — KEINE Schaetzwerte als Fakt.
 */

/** BaFin-Kfz-Beschwerdequote-Branchenschnitt 2024 (Beschwerden je 100.000 Vertraege). */
// transparent-beraten.de auf BaFin-Basis 2024 (KORREKTUREN K2/K9). R4 nennt fuer die
// reine Kfz-Gesamtschau 1,9 — fuer den Hub-Vergleich gilt der KORREKTUREN-Wert 2,2.
export const BAFIN_BRANCHENSCHNITT_2024 = 2.2

export interface VersichererBaseInfo {
  /** kebab-case Slug = URL-Segment unter /versicherer/[slug] + MD-Dateiname. */
  slug: string
  /** Voller (juristischer) Name, z. B. "HUK-Coburg Allgemeine AG". */
  name: string
  /** Kurzer Anzeigename fuer Hero/Karten, z. B. "HUK-Coburg Allgemeine". */
  anzeigename: string
  rechtsform: string
  mutterkonzern: string
  /** Konzern-Slug fuer Cross-Linking verbundener Marken (K1-korrigiert). */
  konzernSlug: string
  hauptsitz: string
  gegruendet?: number
  vertraegeKfzHpMio?: number
  bruttopraemienKfzMrd?: number
  /** Bezugsjahr der Bruttopraemien (manche R1-Werte sind 2019). */
  bruttopraemienStand?: string
  marktanteilPct: number
  /** Absolute BaFin-Kfz-Beschwerden 2024; null wenn nicht separat ausgewiesen. */
  bafinBeschwerden2024: number | null
  /** Beschwerden je 100.000 Vertraege (BaFin 2024); null = offiziell nicht ausgewiesen. */
  bafinQuote2024: number | null
  /** Pflicht-Kontext wenn bafinQuote2024 null ODER erklaerungsbeduerftig (B2/K10). */
  bafinNote?: string
  vertriebsweg: string[]
  /** Dokumentierte Prüfdienstleister/Schadenapparat (R3). */
  pruefdienste?: string[]
  /** Kurze, belegbare Merkmale fuer die Profil-Karte (user-sichtbar → echtes Deutsch). */
  tags: string[]
  /** Hub-Bau-Prioritaet: 1 = Welle 2 (Top), 2 = Welle 3, 3 = Reserve/optional. */
  priority: 1 | 2 | 3
  /** Optionaler Logo-Pfad; fehlt → Initialen-Fallback (K11, keine Markenrechtsverletzung). */
  logoPath?: string
}

/**
 * 15 Versicherer als Referenz-Set. Ein Hub erscheint im Index/Sitemap NUR, wenn eine
 * live MD-Datei existiert (getVersicherer = MD ∩ VERSICHERER_LISTE) — diese Liste ist
 * die Faktenbasis, nicht die Veroeffentlichungs-Schaltung.
 *
 * Sortier-Hinweis: marktanteilPct sind per-Marke-Naeherungen (HUK-Gruppe gesamt ~15 %
 * laut V.E.R.S. 2023; die Einzelgesellschafts-Werte ueberlappen bewusst, dienen nur der
 * Reihenfolge). Endgueltige Zahlen im Content-Review (Kevin).
 */
export const VERSICHERER_LISTE: VersichererBaseInfo[] = [
  {
    slug: 'huk-coburg',
    name: 'HUK-Coburg VVaG',
    anzeigename: 'HUK-Coburg',
    rechtsform: 'VVaG',
    mutterkonzern: 'HUK-Coburg',
    konzernSlug: 'huk-coburg',
    hauptsitz: 'Coburg',
    vertraegeKfzHpMio: 7.3,
    bruttopraemienKfzMrd: 1.5,
    bruttopraemienStand: '2024',
    marktanteilPct: 18,
    bafinBeschwerden2024: 68,
    bafinQuote2024: 0.93,
    vertriebsweg: ['Ausschließlichkeitsvertrieb', 'Online'],
    pruefdienste: ['DEKRA', 'ControlExpert'],
    tags: ['Größter deutscher Kfz-Versicherer', 'VVaG', 'Eigene SV-Honorartabelle'],
    priority: 1,
  },
  {
    slug: 'huk-coburg-allgemeine',
    name: 'HUK-Coburg Allgemeine AG',
    anzeigename: 'HUK-Coburg Allgemeine',
    rechtsform: 'AG',
    mutterkonzern: 'HUK-Coburg VVaG',
    konzernSlug: 'huk-coburg',
    hauptsitz: 'Coburg',
    gegruendet: 1933,
    vertraegeKfzHpMio: 11.4,
    bruttopraemienKfzMrd: 1.53,
    bruttopraemienStand: '2024',
    marktanteilPct: 16,
    bafinBeschwerden2024: 310,
    bafinQuote2024: 2.73,
    bafinNote: 'Höchste BaFin-Beschwerdequote unter den Top-12 (2024).',
    vertriebsweg: ['Ausschließlichkeitsvertrieb', 'Online'],
    pruefdienste: ['DEKRA', 'Innovation Group', 'ControlExpert'],
    tags: ['Marktführer', 'Höchste BaFin-Quote der Top-12', 'Eigene SV-Honorartabelle'],
    priority: 1,
  },
  {
    slug: 'huk24',
    name: 'HUK24 AG',
    anzeigename: 'HUK24',
    rechtsform: 'AG',
    mutterkonzern: 'HUK-Coburg VVaG',
    konzernSlug: 'huk-coburg',
    hauptsitz: 'Coburg',
    vertraegeKfzHpMio: 5.8,
    bruttopraemienKfzMrd: 0.816,
    bruttopraemienStand: '2019',
    marktanteilPct: 8,
    bafinBeschwerden2024: 109,
    bafinQuote2024: 1.89,
    vertriebsweg: ['Direktversicherer', 'Online'],
    pruefdienste: ['DEKRA', 'ControlExpert'],
    tags: ['Direktmarke', 'Gleicher Schadenapparat wie HUK-Coburg'],
    priority: 1,
  },
  {
    slug: 'allianz',
    name: 'Allianz Versicherungs-AG',
    anzeigename: 'Allianz',
    rechtsform: 'AG',
    mutterkonzern: 'Allianz SE',
    konzernSlug: 'allianz',
    hauptsitz: 'München',
    vertraegeKfzHpMio: 7.34,
    bruttopraemienKfzMrd: 2.42,
    bruttopraemienStand: '2024',
    marktanteilPct: 13,
    bafinBeschwerden2024: 232,
    bafinQuote2024: 1.77,
    vertriebsweg: ['Ausschließlichkeitsvertrieb', 'Makler', 'Online'],
    pruefdienste: ['ControlExpert', 'LOGICHECK', 'AZT'],
    tags: ['ControlExpert-Mehrheit seit 2020', 'Markenführer'],
    priority: 1,
  },
  {
    slug: 'allianz-direct',
    name: 'Allianz Direct',
    anzeigename: 'Allianz Direct',
    rechtsform: 'AG',
    mutterkonzern: 'Allianz SE',
    konzernSlug: 'allianz',
    hauptsitz: 'München',
    vertraegeKfzHpMio: 0.99,
    bruttopraemienKfzMrd: 0.254,
    marktanteilPct: 1,
    bafinBeschwerden2024: 31,
    bafinQuote2024: 5.28,
    bafinNote: 'Quote 2023; 2024 ähnlich hoch. Höchste Quote unter den großen Direktversicherern.',
    vertriebsweg: ['Direktversicherer', 'Online'],
    pruefdienste: ['ControlExpert', 'LOGICHECK'],
    tags: ['Höchste Beschwerdequote der Direktversicherer'],
    priority: 2,
  },
  {
    slug: 'axa',
    name: 'AXA Versicherung AG',
    anzeigename: 'AXA',
    rechtsform: 'AG',
    mutterkonzern: 'AXA Group',
    konzernSlug: 'axa',
    hauptsitz: 'Köln',
    vertraegeKfzHpMio: 4.4,
    bruttopraemienKfzMrd: 0.778,
    bruttopraemienStand: '2024',
    marktanteilPct: 6,
    bafinBeschwerden2024: 100,
    bafinQuote2024: 2.27,
    vertriebsweg: ['Ausschließlichkeitsvertrieb', 'Makler'],
    pruefdienste: ['LOGICHECK', 'DEKRA', 'ControlExpert'],
    tags: ['SV-Honorar-Regresswelle seit 2022', 'F&B-Tarifrating 2024 schwach'],
    priority: 1,
  },
  {
    slug: 'axa-easy',
    name: 'AXA Easy Versicherung AG',
    anzeigename: 'AXA Easy',
    rechtsform: 'AG',
    mutterkonzern: 'AXA Group',
    konzernSlug: 'axa',
    hauptsitz: 'Köln',
    vertraegeKfzHpMio: 0.5,
    bruttopraemienKfzMrd: 0.08,
    marktanteilPct: 1,
    bafinBeschwerden2024: null,
    bafinQuote2024: 5.0,
    bafinNote: 'Spitzenwert >5 (Spezialgesellschaft fürs Wechselgeschäft); höchste Quote der AXA-Gruppe.',
    vertriebsweg: ['Direktversicherer', 'Online'],
    pruefdienste: ['LOGICHECK'],
    tags: ['Höchste Quote der AXA-Gruppe', 'Spezialgesellschaft'],
    priority: 3,
  },
  {
    slug: 'r-plus-v',
    name: 'R+V Allgemeine Versicherung AG',
    anzeigename: 'R+V',
    rechtsform: 'AG',
    mutterkonzern: 'R+V Versicherung AG (DZ BANK Gruppe)',
    konzernSlug: 'r-plus-v',
    hauptsitz: 'Wiesbaden',
    vertraegeKfzHpMio: 4.7,
    bruttopraemienKfzMrd: 1.14,
    bruttopraemienStand: '2024',
    marktanteilPct: 6,
    bafinBeschwerden2024: 36,
    bafinQuote2024: 0.77,
    bafinNote: 'Unterdurchschnittliche Beschwerdedichte trotz dokumentierter Einzelfälle (K10).',
    vertriebsweg: ['Volksbanken Raiffeisenbanken'],
    pruefdienste: ['Carexpert'],
    tags: ['Genossenschaftlicher Verbund', 'Sehr niedrige BaFin-Quote'],
    priority: 2,
  },
  {
    slug: 'generali',
    name: 'Generali Deutschland Versicherung AG',
    anzeigename: 'Generali',
    rechtsform: 'AG',
    mutterkonzern: 'Assicurazioni Generali S.p.A.',
    konzernSlug: 'generali',
    hauptsitz: 'München',
    vertraegeKfzHpMio: 3,
    bruttopraemienKfzMrd: 1.04,
    bruttopraemienStand: '2019',
    marktanteilPct: 5,
    bafinBeschwerden2024: null,
    bafinQuote2024: null,
    bafinNote: 'BaFin-Kfz-Wert 2024 nicht separat ausgewiesen (lag unter der ~4,0-Schwelle der Top-9).',
    vertriebsweg: ['Ausschließlichkeitsvertrieb', 'Makler'],
    pruefdienste: ['ClaimsControlling', 'Carexpert'],
    tags: ['Werkstattsteuerung über Partnernetz'],
    priority: 2,
  },
  {
    slug: 'cosmosdirekt',
    name: 'CosmosDirekt (Cosmos Versicherung AG)',
    anzeigename: 'CosmosDirekt',
    rechtsform: 'AG',
    mutterkonzern: 'Generali Deutschland',
    konzernSlug: 'generali',
    hauptsitz: 'Saarbrücken',
    vertraegeKfzHpMio: 1.7,
    bruttopraemienKfzMrd: 2.5,
    marktanteilPct: 3,
    bafinBeschwerden2024: null,
    bafinQuote2024: null,
    bafinNote: 'Größter deutscher Direktversicherer; BaFin-Kfz-Wert 2024 nicht separat ausgewiesen.',
    vertriebsweg: ['Direktversicherer', 'Online'],
    pruefdienste: ['Carexpert'],
    tags: ['Generali-Direkttochter', 'WerkstattservicePLUS-Bindung'],
    priority: 2,
  },
  {
    slug: 'lvm',
    name: 'LVM Sach',
    anzeigename: 'LVM',
    rechtsform: 'VVaG',
    mutterkonzern: 'LVM Versicherung',
    konzernSlug: 'lvm',
    hauptsitz: 'Münster',
    vertraegeKfzHpMio: 6.8,
    bruttopraemienKfzMrd: 1.32,
    bruttopraemienStand: '2019',
    marktanteilPct: 5,
    bafinBeschwerden2024: 54,
    bafinQuote2024: 0.76,
    bafinNote: 'Branchenbeste BaFin-Quote; gleichwohl von Kanzlei Schleyer dokumentierte Falschzitate in Kürzungsschreiben (K6).',
    vertriebsweg: ['Ausschließlichkeitsvertrieb (Agenturen)'],
    pruefdienste: ['ControlExpert'],
    tags: ['Branchenbeste BaFin-Quote', 'Agenturmodell'],
    priority: 2,
  },
  {
    slug: 'ergo',
    name: 'ERGO Versicherung AG',
    anzeigename: 'ERGO',
    rechtsform: 'AG',
    mutterkonzern: 'ERGO Group / Munich Re',
    konzernSlug: 'ergo',
    hauptsitz: 'Düsseldorf',
    vertraegeKfzHpMio: 2.7,
    bruttopraemienKfzMrd: 0.7,
    marktanteilPct: 4,
    bafinBeschwerden2024: 125,
    bafinQuote2024: 4.7,
    bafinNote: 'Höchste BaFin-Quote unter den großen Kfz-Versicherern 2024 (transparent-beraten.de auf BaFin-Basis; K2).',
    vertriebsweg: ['Ausschließlichkeitsvertrieb', 'Makler'],
    pruefdienste: ['Carexpert'],
    tags: ['Höchste BaFin-Quote der Großen', 'Carexpert-Nachbesichtigung'],
    priority: 2,
  },
  {
    slug: 'vhv',
    name: 'VHV Allgemeine Versicherung AG',
    anzeigename: 'VHV',
    rechtsform: 'AG',
    mutterkonzern: 'VHV Gruppe',
    konzernSlug: 'vhv',
    hauptsitz: 'Hannover',
    vertraegeKfzHpMio: 6.2,
    bruttopraemienKfzMrd: 0.95,
    marktanteilPct: 4,
    bafinBeschwerden2024: 116,
    bafinQuote2024: 1.87,
    vertriebsweg: ['Makler', 'Ausschließlichkeitsvertrieb'],
    pruefdienste: ['Carexpert', 'DEKRA'],
    tags: ['Offene „Grundsatzentscheidung" zum SV-Honorar', 'Eigener Gebührenrechner'],
    priority: 2,
  },
  {
    slug: 'zurich',
    name: 'Zurich Deutschland',
    anzeigename: 'Zurich',
    rechtsform: 'Niederlassung (Zurich Insurance Europe AG)',
    mutterkonzern: 'Zurich Insurance Group AG',
    konzernSlug: 'zurich',
    hauptsitz: 'Köln / Frankfurt',
    vertraegeKfzHpMio: 1.5,
    bruttopraemienKfzMrd: 0.4,
    marktanteilPct: 3,
    bafinBeschwerden2024: 31,
    bafinQuote2024: null,
    bafinNote: 'Quote 2024 nicht bildbar — neue Niederlassung (Zurich Insurance Europe AG), Bestand im Aufbau.',
    vertriebsweg: ['Makler', 'Direkt'],
    pruefdienste: ['LOGICHECK', 'ControlExpert', 'DEKRA'],
    tags: ['Eigenes Geschädigten-Formular'],
    priority: 3,
  },
  {
    slug: 'da-direkt',
    name: 'DA Direkt (DA Deutsche Allgemeine Versicherung AG)',
    anzeigename: 'DA Direkt',
    rechtsform: 'AG',
    mutterkonzern: 'Zurich Gruppe Deutschland',
    konzernSlug: 'zurich',
    hauptsitz: 'Oberursel',
    vertraegeKfzHpMio: 1,
    bruttopraemienKfzMrd: 0.25,
    marktanteilPct: 1,
    bafinBeschwerden2024: null,
    bafinQuote2024: null,
    bafinNote: 'Tochter der Zurich Gruppe (NICHT Generali; K1); BaFin-Kfz-Wert 2024 nicht separat ausgewiesen.',
    vertriebsweg: ['Direktversicherer', 'Online'],
    pruefdienste: ['LOGICHECK', 'ControlExpert', 'DEKRA'],
    tags: ['Zurich-Tochter', 'Gemeinsamer Schadenapparat mit Zurich'],
    priority: 3,
  },
]

const BY_SLUG: Map<string, VersichererBaseInfo> = new Map(
  VERSICHERER_LISTE.map((v) => [v.slug, v]),
)

/** Stammdaten zu einem Slug, oder undefined. */
export function getVersichererBaseInfo(slug: string): VersichererBaseInfo | undefined {
  return BY_SLUG.get(slug)
}

/** Alle bekannten Versicherer-Slugs (Referenz-Set, nicht zwingend live). */
export function getAllVersichererSlugs(): string[] {
  return VERSICHERER_LISTE.map((v) => v.slug)
}

/**
 * Verbundene Marken desselben Konzerns (K1-korrigiert), ohne den Versicherer selbst —
 * fuer Cross-Linking im Schadens-Netzwerk-Block (z. B. DA Direkt → Zurich).
 */
export function getKonzernSiblings(slug: string): VersichererBaseInfo[] {
  const self = BY_SLUG.get(slug)
  if (!self) return []
  return VERSICHERER_LISTE.filter(
    (v) => v.konzernSlug === self.konzernSlug && v.slug !== slug,
  )
}
