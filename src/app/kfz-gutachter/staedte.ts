// Stadt-Daten für SEO-Stadt-Landingpages /kfz-gutachter/[stadt].
// Welle 1: 5 NRW-Städte als Template. Welle 2: 16 weitere NRW-Großstädte.
// Welle 3: 5 bundesweite Top-Städte. Welle 4: ~50 weitere Großstädte (≥100k Einw.)
// in allen 16 Bundesländern — Indexing-Surface-Erweiterung für GEO/SEO 2026.
//
// Partner-SVs-Zahlen für Welle 4 sind konservative Schätzwerte ohne harte Partner-
// zusagen — Aaron prüft pro Stadt im Onboarding-Sprint. Bis dahin werden die Zahlen
// in der UI als „bis zu X Partner in der Region" formuliert.

export type Stadt = {
  slug: string
  name: string
  bundesland: string
  plzPrefix: string
  bevoelkerung: string
  lat: number
  lng: number
  /** Spezifische lokale Anker — Gerichte, Anwaltskammer */
  lokal: {
    landgericht: string
    amtsgericht: string
    kammer: string
  }
  /** Honorar-Spannen nach BVSK-Honorartabelle für die Stadt */
  bvskHonorarSpanne: string
  /** Anzahl Partner-SVs in dieser Region */
  partnerSVs: number
  /** Heading-Suffix für H1 — manchmal nominativ, manchmal genitiv */
  h1Anker: string
  /**
   * Hyperlokale Tiefe (nur Hub-Cities). Macht die Stadtseite zur einzigartigen
   * Service-Area-Seite statt Doorway-Template. Optional — die ~67 Nicht-Hub-
   * Städte rendern ohne. Quellen: IT.NRW Unfallatlas / Polizei NRW (Doc 38).
   */
  hyperlocal?: HyperLocal
}

/** Ein Stadtbezirk mit seinen Stadtteilen/Quartieren. */
export type Stadtbezirk = {
  /** 'Bezirk 1' (Düsseldorf nummeriert) oder Eigenname ('Elberfeld', 'Beuel'). */
  name: string
  ortsteile: string[]
}

/** Realer Unfall-Schwerpunkt aus dem Unfallatlas / von der lokalen Polizei. */
export type UnfallHotspot = {
  ort: string
  /** Stadtbezirk-Zuordnung, falls bekannt. */
  bezirk?: string
  /** Knappe, faktische Beschreibung inkl. Zahl wo vorhanden (GEO: Statistik-Anker). */
  beschreibung: string
}

/** Hauptverkehrsachsen einer Stadt. */
export type Hauptachsen = {
  autobahnen: string[]
  bundesstrassen: string[]
  /** Verkehrsknoten, die zugleich Unfallschwerpunkte sind. */
  knoten: string[]
  /** Zeitgebundener Baustellen-/Sperrungs-Aufhänger (mit Enddatum wo bekannt). */
  aktuelleBaustelle?: string
}

/**
 * Hyperlokaler Datensatz einer Hub-City. Alle Werte verifizierbar gegen
 * öffentliche Quellen (Unfallatlas, Stadt-Webseiten) — Anti-Doorway-Kern + GEO.
 */
export type HyperLocal = {
  stadtbezirke: Stadtbezirk[]
  /** Verifizierter PLZ-Bereich. Die Voll-Liste ist Geo-Targeting-To-Do (Cluster 2). */
  plzBereich: string
  vorwahl: string
  /** Angrenzende Orte = „Wir kommen auch nach …" (deckt Spoke-Towns, Conversion). */
  angrenzendeOrte: string[]
  unfallHotspots: UnfallHotspot[]
  /** Quellverweis für die Hotspots (GEO: Cite-Sources +40 %). */
  hotspotQuelle: string
  hauptachsen: Hauptachsen
  /** Handgeschriebener Hero-Aufhänger (Cluster 2) — verankert konkrete Hotspots/Achsen. */
  heroAnker?: string
  /** Differenzierungs-Anker zur Topografie (Wuppertal-Tal, Bonn-Rhein). */
  topografieAnker?: string
  /** Stadtweite Unfallzahl — nur wo eine belastbare, aktuelle Zahl vorliegt. */
  unfallzahlStadt?: { jahr: number; text: string }
  /** Lokale, stadtspezifische FAQ (Cluster 4) — fließen ins FAQ-Akkordeon + FAQPage-Schema. */
  lokaleFaqs?: LokaleFaq[]
  /** Öffentliche Anlaufstellen nach einem Unfall (Cluster 3, nur verifizierte Behörden-Fakten). */
  oeffentlicheStellen?: OeffentlicheStellen
}

/** Lokale FAQ — Frage/Antwort, plain text (fließt 1:1 ins FAQPage-Schema). */
export type LokaleFaq = { frage: string; antwort: string }

/** Öffentliche Anlaufstellen einer Stadt (Polizei, Zulassungsstelle) — nur verifizierte Fakten. */
export type OeffentlicheStellen = {
  polizeipraesidium: { name: string; adresse: string; telefon: string }
  zulassungsstelle: { name: string; adresse: string; telefon: string; kennzeichen: string; oeffnungszeiten?: string }
  notruf: string
}

export const STAEDTE: Stadt[] = [
  {
    slug: 'koeln',
    name: 'Köln',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '50–51',
    bevoelkerung: '1,1 Mio.',
    lat: 50.9413,
    lng: 6.9583,
    lokal: {
      landgericht: 'Landgericht Köln',
      amtsgericht: 'Amtsgericht Köln',
      kammer: 'Rechtsanwaltskammer Köln',
    },
    bvskHonorarSpanne: '650–2.400 €',
    partnerSVs: 23,
    h1Anker: 'in Köln',
  },
  {
    slug: 'duesseldorf',
    name: 'Düsseldorf',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '40',
    bevoelkerung: '630 Tsd.',
    lat: 51.2277,
    lng: 6.7735,
    lokal: {
      landgericht: 'Landgericht Düsseldorf',
      amtsgericht: 'Amtsgericht Düsseldorf',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '650–2.400 €',
    partnerSVs: 18,
    h1Anker: 'in Düsseldorf',
  },
  {
    slug: 'bonn',
    name: 'Bonn',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '53',
    bevoelkerung: '335 Tsd.',
    lat: 50.7374,
    lng: 7.0982,
    lokal: {
      landgericht: 'Landgericht Bonn',
      amtsgericht: 'Amtsgericht Bonn',
      kammer: 'Rechtsanwaltskammer Köln',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 11,
    h1Anker: 'in Bonn',
  },
  {
    slug: 'aachen',
    name: 'Aachen',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '52',
    bevoelkerung: '250 Tsd.',
    lat: 50.7753,
    lng: 6.0839,
    lokal: {
      landgericht: 'Landgericht Aachen',
      amtsgericht: 'Amtsgericht Aachen',
      kammer: 'Rechtsanwaltskammer Köln',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 8,
    h1Anker: 'in Aachen',
  },
  {
    slug: 'dortmund',
    name: 'Dortmund',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '44',
    bevoelkerung: '590 Tsd.',
    lat: 51.5136,
    lng: 7.4653,
    lokal: {
      landgericht: 'Landgericht Dortmund',
      amtsgericht: 'Amtsgericht Dortmund',
      kammer: 'Rechtsanwaltskammer Hamm',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 14,
    h1Anker: 'in Dortmund',
  },
  // Welle 2: weitere NRW-Großstädte
  {
    slug: 'essen',
    name: 'Essen',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '45',
    bevoelkerung: '585 Tsd.',
    lat: 51.4556,
    lng: 7.0116,
    lokal: {
      landgericht: 'Landgericht Essen',
      amtsgericht: 'Amtsgericht Essen',
      kammer: 'Rechtsanwaltskammer Hamm',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 12,
    h1Anker: 'in Essen',
  },
  {
    slug: 'duisburg',
    name: 'Duisburg',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '47',
    bevoelkerung: '500 Tsd.',
    lat: 51.4344,
    lng: 6.7623,
    lokal: {
      landgericht: 'Landgericht Duisburg',
      amtsgericht: 'Amtsgericht Duisburg',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 12,
    h1Anker: 'in Duisburg',
  },
  {
    slug: 'bochum',
    name: 'Bochum',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '44',
    bevoelkerung: '365 Tsd.',
    lat: 51.4818,
    lng: 7.2162,
    lokal: {
      landgericht: 'Landgericht Bochum',
      amtsgericht: 'Amtsgericht Bochum',
      kammer: 'Rechtsanwaltskammer Hamm',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 9,
    h1Anker: 'in Bochum',
  },
  {
    slug: 'bielefeld',
    name: 'Bielefeld',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '33',
    bevoelkerung: '335 Tsd.',
    lat: 52.0302,
    lng: 8.5325,
    lokal: {
      landgericht: 'Landgericht Bielefeld',
      amtsgericht: 'Amtsgericht Bielefeld',
      kammer: 'Rechtsanwaltskammer Hamm',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 7,
    h1Anker: 'in Bielefeld',
  },
  {
    slug: 'muenster',
    name: 'Münster',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '48',
    bevoelkerung: '320 Tsd.',
    lat: 51.9607,
    lng: 7.6261,
    lokal: {
      landgericht: 'Landgericht Münster',
      amtsgericht: 'Amtsgericht Münster',
      kammer: 'Rechtsanwaltskammer Hamm',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 8,
    h1Anker: 'in Münster',
  },
  {
    slug: 'wuppertal',
    name: 'Wuppertal',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '42',
    bevoelkerung: '355 Tsd.',
    lat: 51.2562,
    lng: 7.1508,
    lokal: {
      landgericht: 'Landgericht Wuppertal',
      amtsgericht: 'Amtsgericht Wuppertal',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 8,
    h1Anker: 'in Wuppertal',
  },
  {
    slug: 'moenchengladbach',
    name: 'Mönchengladbach',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '41',
    bevoelkerung: '260 Tsd.',
    lat: 51.1805,
    lng: 6.4428,
    lokal: {
      landgericht: 'Landgericht Mönchengladbach',
      amtsgericht: 'Amtsgericht Mönchengladbach',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 7,
    h1Anker: 'in Mönchengladbach',
  },
  {
    slug: 'krefeld',
    name: 'Krefeld',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '47',
    bevoelkerung: '230 Tsd.',
    lat: 51.3388,
    lng: 6.5853,
    lokal: {
      landgericht: 'Landgericht Krefeld',
      amtsgericht: 'Amtsgericht Krefeld',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 7,
    h1Anker: 'in Krefeld',
  },
  {
    slug: 'oberhausen',
    name: 'Oberhausen',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '46',
    bevoelkerung: '210 Tsd.',
    lat: 51.4963,
    lng: 6.8632,
    lokal: {
      landgericht: 'Landgericht Duisburg',
      amtsgericht: 'Amtsgericht Oberhausen',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 6,
    h1Anker: 'in Oberhausen',
  },
  {
    slug: 'leverkusen',
    name: 'Leverkusen',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '51',
    bevoelkerung: '165 Tsd.',
    lat: 51.0303,
    lng: 6.9985,
    lokal: {
      landgericht: 'Landgericht Köln',
      amtsgericht: 'Amtsgericht Leverkusen',
      kammer: 'Rechtsanwaltskammer Köln',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 6,
    h1Anker: 'in Leverkusen',
  },
  {
    slug: 'paderborn',
    name: 'Paderborn',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '33',
    bevoelkerung: '155 Tsd.',
    lat: 51.7189,
    lng: 8.7575,
    lokal: {
      landgericht: 'Landgericht Paderborn',
      amtsgericht: 'Amtsgericht Paderborn',
      kammer: 'Rechtsanwaltskammer Hamm',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 5,
    h1Anker: 'in Paderborn',
  },
  {
    slug: 'hagen',
    name: 'Hagen',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '58',
    bevoelkerung: '190 Tsd.',
    lat: 51.3671,
    lng: 7.4633,
    lokal: {
      landgericht: 'Landgericht Hagen',
      amtsgericht: 'Amtsgericht Hagen',
      kammer: 'Rechtsanwaltskammer Hamm',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 5,
    h1Anker: 'in Hagen',
  },
  {
    slug: 'solingen',
    name: 'Solingen',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '42',
    bevoelkerung: '160 Tsd.',
    lat: 51.1657,
    lng: 7.0846,
    lokal: {
      landgericht: 'Landgericht Wuppertal',
      amtsgericht: 'Amtsgericht Solingen',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 5,
    h1Anker: 'in Solingen',
  },
  {
    slug: 'bergisch-gladbach',
    name: 'Bergisch Gladbach',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '51',
    bevoelkerung: '125 Tsd.',
    lat: 50.9856,
    lng: 7.1320,
    lokal: {
      landgericht: 'Landgericht Köln',
      amtsgericht: 'Amtsgericht Bergisch Gladbach',
      kammer: 'Rechtsanwaltskammer Köln',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 4,
    h1Anker: 'in Bergisch Gladbach',
  },
  {
    slug: 'remscheid',
    name: 'Remscheid',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '42',
    bevoelkerung: '110 Tsd.',
    lat: 51.1789,
    lng: 7.1925,
    lokal: {
      landgericht: 'Landgericht Wuppertal',
      amtsgericht: 'Amtsgericht Remscheid',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 4,
    h1Anker: 'in Remscheid',
  },
  // Welle 3: bundesweite Großstädte
  {
    slug: 'berlin',
    name: 'Berlin',
    bundesland: 'Berlin',
    plzPrefix: '10–14',
    bevoelkerung: '3,7 Mio.',
    lat: 52.5200,
    lng: 13.4050,
    lokal: {
      landgericht: 'Landgericht Berlin',
      amtsgericht: 'Amtsgericht Berlin-Mitte',
      kammer: 'Rechtsanwaltskammer Berlin',
    },
    bvskHonorarSpanne: '700–2.600 €',
    partnerSVs: 8,
    h1Anker: 'in Berlin',
  },
  {
    slug: 'hamburg',
    name: 'Hamburg',
    bundesland: 'Hamburg',
    plzPrefix: '20–22',
    bevoelkerung: '1,9 Mio.',
    lat: 53.5511,
    lng: 9.9937,
    lokal: {
      landgericht: 'Landgericht Hamburg',
      amtsgericht: 'Amtsgericht Hamburg',
      kammer: 'Hanseatische Rechtsanwaltskammer Hamburg',
    },
    bvskHonorarSpanne: '700–2.600 €',
    partnerSVs: 7,
    h1Anker: 'in Hamburg',
  },
  {
    slug: 'muenchen',
    name: 'München',
    bundesland: 'Bayern',
    plzPrefix: '80–81',
    bevoelkerung: '1,5 Mio.',
    lat: 48.1351,
    lng: 11.5820,
    lokal: {
      landgericht: 'Landgericht München I',
      amtsgericht: 'Amtsgericht München',
      kammer: 'Rechtsanwaltskammer München',
    },
    bvskHonorarSpanne: '700–2.600 €',
    partnerSVs: 6,
    h1Anker: 'in München',
  },
  {
    slug: 'frankfurt',
    name: 'Frankfurt am Main',
    bundesland: 'Hessen',
    plzPrefix: '60',
    bevoelkerung: '770 Tsd.',
    lat: 50.1109,
    lng: 8.6821,
    lokal: {
      landgericht: 'Landgericht Frankfurt am Main',
      amtsgericht: 'Amtsgericht Frankfurt am Main',
      kammer: 'Rechtsanwaltskammer Frankfurt am Main',
    },
    bvskHonorarSpanne: '650–2.500 €',
    partnerSVs: 5,
    h1Anker: 'in Frankfurt am Main',
  },
  {
    slug: 'stuttgart',
    name: 'Stuttgart',
    bundesland: 'Baden-Württemberg',
    plzPrefix: '70',
    bevoelkerung: '630 Tsd.',
    lat: 48.7758,
    lng: 9.1829,
    lokal: {
      landgericht: 'Landgericht Stuttgart',
      amtsgericht: 'Amtsgericht Stuttgart',
      kammer: 'Rechtsanwaltskammer Stuttgart',
    },
    bvskHonorarSpanne: '650–2.500 €',
    partnerSVs: 5,
    h1Anker: 'in Stuttgart',
  },
  // Welle 4 — weitere Großstädte (≥100k Einw.) für GEO/SEO-Indexing-Surface
  // Bayern
  {
    slug: 'nuernberg',
    name: 'Nürnberg',
    bundesland: 'Bayern',
    plzPrefix: '90',
    bevoelkerung: '520 Tsd.',
    lat: 49.4521,
    lng: 11.0767,
    lokal: {
      landgericht: 'Landgericht Nürnberg-Fürth',
      amtsgericht: 'Amtsgericht Nürnberg',
      kammer: 'Rechtsanwaltskammer Nürnberg',
    },
    bvskHonorarSpanne: '650–2.500 €',
    partnerSVs: 6,
    h1Anker: 'in Nürnberg',
  },
  {
    slug: 'augsburg',
    name: 'Augsburg',
    bundesland: 'Bayern',
    plzPrefix: '86',
    bevoelkerung: '300 Tsd.',
    lat: 48.3705,
    lng: 10.8978,
    lokal: {
      landgericht: 'Landgericht Augsburg',
      amtsgericht: 'Amtsgericht Augsburg',
      kammer: 'Rechtsanwaltskammer München',
    },
    bvskHonorarSpanne: '650–2.500 €',
    partnerSVs: 5,
    h1Anker: 'in Augsburg',
  },
  {
    slug: 'wuerzburg',
    name: 'Würzburg',
    bundesland: 'Bayern',
    plzPrefix: '97',
    bevoelkerung: '130 Tsd.',
    lat: 49.7913,
    lng: 9.9534,
    lokal: {
      landgericht: 'Landgericht Würzburg',
      amtsgericht: 'Amtsgericht Würzburg',
      kammer: 'Rechtsanwaltskammer Bamberg',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Würzburg',
  },
  {
    slug: 'regensburg',
    name: 'Regensburg',
    bundesland: 'Bayern',
    plzPrefix: '93',
    bevoelkerung: '155 Tsd.',
    lat: 49.0134,
    lng: 12.1016,
    lokal: {
      landgericht: 'Landgericht Regensburg',
      amtsgericht: 'Amtsgericht Regensburg',
      kammer: 'Rechtsanwaltskammer Nürnberg',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Regensburg',
  },
  {
    slug: 'ingolstadt',
    name: 'Ingolstadt',
    bundesland: 'Bayern',
    plzPrefix: '85',
    bevoelkerung: '140 Tsd.',
    lat: 48.7665,
    lng: 11.4258,
    lokal: {
      landgericht: 'Landgericht Ingolstadt',
      amtsgericht: 'Amtsgericht Ingolstadt',
      kammer: 'Rechtsanwaltskammer München',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Ingolstadt',
  },
  {
    slug: 'fuerth',
    name: 'Fürth',
    bundesland: 'Bayern',
    plzPrefix: '90',
    bevoelkerung: '130 Tsd.',
    lat: 49.4770,
    lng: 10.9886,
    lokal: {
      landgericht: 'Landgericht Nürnberg-Fürth',
      amtsgericht: 'Amtsgericht Fürth',
      kammer: 'Rechtsanwaltskammer Nürnberg',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Fürth',
  },
  {
    slug: 'erlangen',
    name: 'Erlangen',
    bundesland: 'Bayern',
    plzPrefix: '91',
    bevoelkerung: '115 Tsd.',
    lat: 49.5897,
    lng: 11.0078,
    lokal: {
      landgericht: 'Landgericht Nürnberg-Fürth',
      amtsgericht: 'Amtsgericht Erlangen',
      kammer: 'Rechtsanwaltskammer Nürnberg',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Erlangen',
  },
  // Baden-Württemberg
  {
    slug: 'mannheim',
    name: 'Mannheim',
    bundesland: 'Baden-Württemberg',
    plzPrefix: '68',
    bevoelkerung: '315 Tsd.',
    lat: 49.4875,
    lng: 8.4660,
    lokal: {
      landgericht: 'Landgericht Mannheim',
      amtsgericht: 'Amtsgericht Mannheim',
      kammer: 'Rechtsanwaltskammer Karlsruhe',
    },
    bvskHonorarSpanne: '650–2.500 €',
    partnerSVs: 6,
    h1Anker: 'in Mannheim',
  },
  {
    slug: 'karlsruhe',
    name: 'Karlsruhe',
    bundesland: 'Baden-Württemberg',
    plzPrefix: '76',
    bevoelkerung: '310 Tsd.',
    lat: 49.0069,
    lng: 8.4037,
    lokal: {
      landgericht: 'Landgericht Karlsruhe',
      amtsgericht: 'Amtsgericht Karlsruhe',
      kammer: 'Rechtsanwaltskammer Karlsruhe',
    },
    bvskHonorarSpanne: '650–2.500 €',
    partnerSVs: 6,
    h1Anker: 'in Karlsruhe',
  },
  {
    slug: 'freiburg',
    name: 'Freiburg im Breisgau',
    bundesland: 'Baden-Württemberg',
    plzPrefix: '79',
    bevoelkerung: '235 Tsd.',
    lat: 47.9990,
    lng: 7.8421,
    lokal: {
      landgericht: 'Landgericht Freiburg',
      amtsgericht: 'Amtsgericht Freiburg',
      kammer: 'Rechtsanwaltskammer Freiburg',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 5,
    h1Anker: 'in Freiburg im Breisgau',
  },
  {
    slug: 'heidelberg',
    name: 'Heidelberg',
    bundesland: 'Baden-Württemberg',
    plzPrefix: '69',
    bevoelkerung: '160 Tsd.',
    lat: 49.3988,
    lng: 8.6724,
    lokal: {
      landgericht: 'Landgericht Heidelberg',
      amtsgericht: 'Amtsgericht Heidelberg',
      kammer: 'Rechtsanwaltskammer Karlsruhe',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Heidelberg',
  },
  {
    slug: 'heilbronn',
    name: 'Heilbronn',
    bundesland: 'Baden-Württemberg',
    plzPrefix: '74',
    bevoelkerung: '125 Tsd.',
    lat: 49.1427,
    lng: 9.2109,
    lokal: {
      landgericht: 'Landgericht Heilbronn',
      amtsgericht: 'Amtsgericht Heilbronn',
      kammer: 'Rechtsanwaltskammer Stuttgart',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Heilbronn',
  },
  {
    slug: 'ulm',
    name: 'Ulm',
    bundesland: 'Baden-Württemberg',
    plzPrefix: '89',
    bevoelkerung: '130 Tsd.',
    lat: 48.3984,
    lng: 9.9916,
    lokal: {
      landgericht: 'Landgericht Ulm',
      amtsgericht: 'Amtsgericht Ulm',
      kammer: 'Rechtsanwaltskammer Tübingen',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Ulm',
  },
  {
    slug: 'pforzheim',
    name: 'Pforzheim',
    bundesland: 'Baden-Württemberg',
    plzPrefix: '75',
    bevoelkerung: '125 Tsd.',
    lat: 48.8920,
    lng: 8.6946,
    lokal: {
      landgericht: 'Landgericht Karlsruhe',
      amtsgericht: 'Amtsgericht Pforzheim',
      kammer: 'Rechtsanwaltskammer Karlsruhe',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 3,
    h1Anker: 'in Pforzheim',
  },
  {
    slug: 'reutlingen',
    name: 'Reutlingen',
    bundesland: 'Baden-Württemberg',
    plzPrefix: '72',
    bevoelkerung: '115 Tsd.',
    lat: 48.4910,
    lng: 9.2042,
    lokal: {
      landgericht: 'Landgericht Tübingen',
      amtsgericht: 'Amtsgericht Reutlingen',
      kammer: 'Rechtsanwaltskammer Tübingen',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 3,
    h1Anker: 'in Reutlingen',
  },
  // Hessen
  {
    slug: 'wiesbaden',
    name: 'Wiesbaden',
    bundesland: 'Hessen',
    plzPrefix: '65',
    bevoelkerung: '280 Tsd.',
    lat: 50.0826,
    lng: 8.2400,
    lokal: {
      landgericht: 'Landgericht Wiesbaden',
      amtsgericht: 'Amtsgericht Wiesbaden',
      kammer: 'Rechtsanwaltskammer Frankfurt am Main',
    },
    bvskHonorarSpanne: '650–2.500 €',
    partnerSVs: 5,
    h1Anker: 'in Wiesbaden',
  },
  {
    slug: 'kassel',
    name: 'Kassel',
    bundesland: 'Hessen',
    plzPrefix: '34',
    bevoelkerung: '200 Tsd.',
    lat: 51.3127,
    lng: 9.4797,
    lokal: {
      landgericht: 'Landgericht Kassel',
      amtsgericht: 'Amtsgericht Kassel',
      kammer: 'Rechtsanwaltskammer Frankfurt am Main',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Kassel',
  },
  {
    slug: 'darmstadt',
    name: 'Darmstadt',
    bundesland: 'Hessen',
    plzPrefix: '64',
    bevoelkerung: '160 Tsd.',
    lat: 49.8728,
    lng: 8.6512,
    lokal: {
      landgericht: 'Landgericht Darmstadt',
      amtsgericht: 'Amtsgericht Darmstadt',
      kammer: 'Rechtsanwaltskammer Frankfurt am Main',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Darmstadt',
  },
  {
    slug: 'offenbach',
    name: 'Offenbach am Main',
    bundesland: 'Hessen',
    plzPrefix: '63',
    bevoelkerung: '130 Tsd.',
    lat: 50.0955,
    lng: 8.7761,
    lokal: {
      landgericht: 'Landgericht Darmstadt',
      amtsgericht: 'Amtsgericht Offenbach am Main',
      kammer: 'Rechtsanwaltskammer Frankfurt am Main',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 3,
    h1Anker: 'in Offenbach am Main',
  },
  // Niedersachsen
  {
    slug: 'hannover',
    name: 'Hannover',
    bundesland: 'Niedersachsen',
    plzPrefix: '30',
    bevoelkerung: '535 Tsd.',
    lat: 52.3759,
    lng: 9.7320,
    lokal: {
      landgericht: 'Landgericht Hannover',
      amtsgericht: 'Amtsgericht Hannover',
      kammer: 'Rechtsanwaltskammer Celle',
    },
    bvskHonorarSpanne: '650–2.500 €',
    partnerSVs: 7,
    h1Anker: 'in Hannover',
  },
  {
    slug: 'braunschweig',
    name: 'Braunschweig',
    bundesland: 'Niedersachsen',
    plzPrefix: '38',
    bevoelkerung: '250 Tsd.',
    lat: 52.2689,
    lng: 10.5268,
    lokal: {
      landgericht: 'Landgericht Braunschweig',
      amtsgericht: 'Amtsgericht Braunschweig',
      kammer: 'Rechtsanwaltskammer Braunschweig',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 5,
    h1Anker: 'in Braunschweig',
  },
  {
    slug: 'oldenburg',
    name: 'Oldenburg',
    bundesland: 'Niedersachsen',
    plzPrefix: '26',
    bevoelkerung: '170 Tsd.',
    lat: 53.1435,
    lng: 8.2146,
    lokal: {
      landgericht: 'Landgericht Oldenburg',
      amtsgericht: 'Amtsgericht Oldenburg',
      kammer: 'Rechtsanwaltskammer Oldenburg',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Oldenburg',
  },
  {
    slug: 'osnabrueck',
    name: 'Osnabrück',
    bundesland: 'Niedersachsen',
    plzPrefix: '49',
    bevoelkerung: '165 Tsd.',
    lat: 52.2799,
    lng: 8.0472,
    lokal: {
      landgericht: 'Landgericht Osnabrück',
      amtsgericht: 'Amtsgericht Osnabrück',
      kammer: 'Rechtsanwaltskammer Oldenburg',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Osnabrück',
  },
  {
    slug: 'wolfsburg',
    name: 'Wolfsburg',
    bundesland: 'Niedersachsen',
    plzPrefix: '38',
    bevoelkerung: '125 Tsd.',
    lat: 52.4227,
    lng: 10.7865,
    lokal: {
      landgericht: 'Landgericht Braunschweig',
      amtsgericht: 'Amtsgericht Wolfsburg',
      kammer: 'Rechtsanwaltskammer Braunschweig',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 3,
    h1Anker: 'in Wolfsburg',
  },
  {
    slug: 'goettingen',
    name: 'Göttingen',
    bundesland: 'Niedersachsen',
    plzPrefix: '37',
    bevoelkerung: '120 Tsd.',
    lat: 51.5413,
    lng: 9.9158,
    lokal: {
      landgericht: 'Landgericht Göttingen',
      amtsgericht: 'Amtsgericht Göttingen',
      kammer: 'Rechtsanwaltskammer Celle',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 3,
    h1Anker: 'in Göttingen',
  },
  // Bremen
  {
    slug: 'bremen',
    name: 'Bremen',
    bundesland: 'Bremen',
    plzPrefix: '28',
    bevoelkerung: '570 Tsd.',
    lat: 53.0793,
    lng: 8.8017,
    lokal: {
      landgericht: 'Landgericht Bremen',
      amtsgericht: 'Amtsgericht Bremen',
      kammer: 'Rechtsanwaltskammer Bremen',
    },
    bvskHonorarSpanne: '650–2.500 €',
    partnerSVs: 6,
    h1Anker: 'in Bremen',
  },
  {
    slug: 'bremerhaven',
    name: 'Bremerhaven',
    bundesland: 'Bremen',
    plzPrefix: '27',
    bevoelkerung: '115 Tsd.',
    lat: 53.5396,
    lng: 8.5810,
    lokal: {
      landgericht: 'Landgericht Bremen',
      amtsgericht: 'Amtsgericht Bremerhaven',
      kammer: 'Rechtsanwaltskammer Bremen',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 3,
    h1Anker: 'in Bremerhaven',
  },
  // Schleswig-Holstein
  {
    slug: 'kiel',
    name: 'Kiel',
    bundesland: 'Schleswig-Holstein',
    plzPrefix: '24',
    bevoelkerung: '250 Tsd.',
    lat: 54.3233,
    lng: 10.1228,
    lokal: {
      landgericht: 'Landgericht Kiel',
      amtsgericht: 'Amtsgericht Kiel',
      kammer: 'Schleswig-Holsteinische Rechtsanwaltskammer',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 5,
    h1Anker: 'in Kiel',
  },
  {
    slug: 'luebeck',
    name: 'Lübeck',
    bundesland: 'Schleswig-Holstein',
    plzPrefix: '23',
    bevoelkerung: '220 Tsd.',
    lat: 53.8654,
    lng: 10.6866,
    lokal: {
      landgericht: 'Landgericht Lübeck',
      amtsgericht: 'Amtsgericht Lübeck',
      kammer: 'Schleswig-Holsteinische Rechtsanwaltskammer',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Lübeck',
  },
  // Rheinland-Pfalz
  {
    slug: 'mainz',
    name: 'Mainz',
    bundesland: 'Rheinland-Pfalz',
    plzPrefix: '55',
    bevoelkerung: '220 Tsd.',
    lat: 49.9929,
    lng: 8.2473,
    lokal: {
      landgericht: 'Landgericht Mainz',
      amtsgericht: 'Amtsgericht Mainz',
      kammer: 'Rechtsanwaltskammer Koblenz',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 5,
    h1Anker: 'in Mainz',
  },
  {
    slug: 'ludwigshafen',
    name: 'Ludwigshafen am Rhein',
    bundesland: 'Rheinland-Pfalz',
    plzPrefix: '67',
    bevoelkerung: '175 Tsd.',
    lat: 49.4774,
    lng: 8.4452,
    lokal: {
      landgericht: 'Landgericht Frankenthal (Pfalz)',
      amtsgericht: 'Amtsgericht Ludwigshafen am Rhein',
      kammer: 'Rechtsanwaltskammer Zweibrücken',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Ludwigshafen am Rhein',
  },
  {
    slug: 'koblenz',
    name: 'Koblenz',
    bundesland: 'Rheinland-Pfalz',
    plzPrefix: '56',
    bevoelkerung: '115 Tsd.',
    lat: 50.3569,
    lng: 7.5890,
    lokal: {
      landgericht: 'Landgericht Koblenz',
      amtsgericht: 'Amtsgericht Koblenz',
      kammer: 'Rechtsanwaltskammer Koblenz',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 3,
    h1Anker: 'in Koblenz',
  },
  {
    slug: 'trier',
    name: 'Trier',
    bundesland: 'Rheinland-Pfalz',
    plzPrefix: '54',
    bevoelkerung: '110 Tsd.',
    lat: 49.7596,
    lng: 6.6440,
    lokal: {
      landgericht: 'Landgericht Trier',
      amtsgericht: 'Amtsgericht Trier',
      kammer: 'Rechtsanwaltskammer Koblenz',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 3,
    h1Anker: 'in Trier',
  },
  // Saarland
  {
    slug: 'saarbruecken',
    name: 'Saarbrücken',
    bundesland: 'Saarland',
    plzPrefix: '66',
    bevoelkerung: '180 Tsd.',
    lat: 49.2402,
    lng: 6.9969,
    lokal: {
      landgericht: 'Landgericht Saarbrücken',
      amtsgericht: 'Amtsgericht Saarbrücken',
      kammer: 'Rechtsanwaltskammer des Saarlandes',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Saarbrücken',
  },
  // Sachsen
  {
    slug: 'leipzig',
    name: 'Leipzig',
    bundesland: 'Sachsen',
    plzPrefix: '04',
    bevoelkerung: '615 Tsd.',
    lat: 51.3397,
    lng: 12.3731,
    lokal: {
      landgericht: 'Landgericht Leipzig',
      amtsgericht: 'Amtsgericht Leipzig',
      kammer: 'Rechtsanwaltskammer Sachsen',
    },
    bvskHonorarSpanne: '650–2.500 €',
    partnerSVs: 7,
    h1Anker: 'in Leipzig',
  },
  {
    slug: 'dresden',
    name: 'Dresden',
    bundesland: 'Sachsen',
    plzPrefix: '01',
    bevoelkerung: '565 Tsd.',
    lat: 51.0504,
    lng: 13.7373,
    lokal: {
      landgericht: 'Landgericht Dresden',
      amtsgericht: 'Amtsgericht Dresden',
      kammer: 'Rechtsanwaltskammer Sachsen',
    },
    bvskHonorarSpanne: '650–2.500 €',
    partnerSVs: 6,
    h1Anker: 'in Dresden',
  },
  {
    slug: 'chemnitz',
    name: 'Chemnitz',
    bundesland: 'Sachsen',
    plzPrefix: '09',
    bevoelkerung: '245 Tsd.',
    lat: 50.8278,
    lng: 12.9214,
    lokal: {
      landgericht: 'Landgericht Chemnitz',
      amtsgericht: 'Amtsgericht Chemnitz',
      kammer: 'Rechtsanwaltskammer Sachsen',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Chemnitz',
  },
  // Sachsen-Anhalt
  {
    slug: 'halle',
    name: 'Halle (Saale)',
    bundesland: 'Sachsen-Anhalt',
    plzPrefix: '06',
    bevoelkerung: '240 Tsd.',
    lat: 51.4969,
    lng: 11.9690,
    lokal: {
      landgericht: 'Landgericht Halle',
      amtsgericht: 'Amtsgericht Halle (Saale)',
      kammer: 'Rechtsanwaltskammer Sachsen-Anhalt',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Halle (Saale)',
  },
  {
    slug: 'magdeburg',
    name: 'Magdeburg',
    bundesland: 'Sachsen-Anhalt',
    plzPrefix: '39',
    bevoelkerung: '240 Tsd.',
    lat: 52.1205,
    lng: 11.6276,
    lokal: {
      landgericht: 'Landgericht Magdeburg',
      amtsgericht: 'Amtsgericht Magdeburg',
      kammer: 'Rechtsanwaltskammer Sachsen-Anhalt',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Magdeburg',
  },
  // Thüringen
  {
    slug: 'erfurt',
    name: 'Erfurt',
    bundesland: 'Thüringen',
    plzPrefix: '99',
    bevoelkerung: '215 Tsd.',
    lat: 50.9787,
    lng: 11.0328,
    lokal: {
      landgericht: 'Landgericht Erfurt',
      amtsgericht: 'Amtsgericht Erfurt',
      kammer: 'Rechtsanwaltskammer Thüringen',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Erfurt',
  },
  {
    slug: 'jena',
    name: 'Jena',
    bundesland: 'Thüringen',
    plzPrefix: '07',
    bevoelkerung: '115 Tsd.',
    lat: 50.9272,
    lng: 11.5870,
    lokal: {
      landgericht: 'Landgericht Gera',
      amtsgericht: 'Amtsgericht Jena',
      kammer: 'Rechtsanwaltskammer Thüringen',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 3,
    h1Anker: 'in Jena',
  },
  // Brandenburg
  {
    slug: 'potsdam',
    name: 'Potsdam',
    bundesland: 'Brandenburg',
    plzPrefix: '14',
    bevoelkerung: '185 Tsd.',
    lat: 52.3906,
    lng: 13.0645,
    lokal: {
      landgericht: 'Landgericht Potsdam',
      amtsgericht: 'Amtsgericht Potsdam',
      kammer: 'Rechtsanwaltskammer Brandenburg',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Potsdam',
  },
  {
    slug: 'cottbus',
    name: 'Cottbus',
    bundesland: 'Brandenburg',
    plzPrefix: '03',
    bevoelkerung: '100 Tsd.',
    lat: 51.7563,
    lng: 14.3329,
    lokal: {
      landgericht: 'Landgericht Cottbus',
      amtsgericht: 'Amtsgericht Cottbus',
      kammer: 'Rechtsanwaltskammer Brandenburg',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 3,
    h1Anker: 'in Cottbus',
  },
  // Mecklenburg-Vorpommern
  {
    slug: 'rostock',
    name: 'Rostock',
    bundesland: 'Mecklenburg-Vorpommern',
    plzPrefix: '18',
    bevoelkerung: '210 Tsd.',
    lat: 54.0887,
    lng: 12.1422,
    lokal: {
      landgericht: 'Landgericht Rostock',
      amtsgericht: 'Amtsgericht Rostock',
      kammer: 'Rechtsanwaltskammer Mecklenburg-Vorpommern',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 4,
    h1Anker: 'in Rostock',
  },
  {
    slug: 'schwerin',
    name: 'Schwerin',
    bundesland: 'Mecklenburg-Vorpommern',
    plzPrefix: '19',
    bevoelkerung: '95 Tsd.',
    lat: 53.6355,
    lng: 11.4011,
    lokal: {
      landgericht: 'Landgericht Schwerin',
      amtsgericht: 'Amtsgericht Schwerin',
      kammer: 'Rechtsanwaltskammer Mecklenburg-Vorpommern',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 3,
    h1Anker: 'in Schwerin',
  },
]

/**
 * Hyperlokale Daten der drei Hub-Cities (Doc 38, Phase 1). Getrennt von der
 * STAEDTE-Liste gehalten, damit das Stadt-Verzeichnis scanbar bleibt — wird in
 * getStadtBySlug an die Stadt gemergt. Alle Fakten verifizierbar gegen die je
 * Stadt genannte hotspotQuelle (IT.NRW Unfallatlas 2024, Polizei NRW, Stadt-Webseiten).
 */
const HYPERLOCAL_DATA: Record<string, HyperLocal> = {
  duesseldorf: {
    plzBereich: '40210–40721',
    vorwahl: '0211',
    stadtbezirke: [
      { name: 'Bezirk 1', ortsteile: ['Altstadt', 'Carlstadt', 'Derendorf', 'Golzheim', 'Pempelfort', 'Stadtmitte'] },
      { name: 'Bezirk 2', ortsteile: ['Düsseltal', 'Flingern-Nord', 'Flingern-Süd'] },
      { name: 'Bezirk 3', ortsteile: ['Bilk', 'Flehe', 'Friedrichstadt', 'Hafen', 'Hamm', 'Oberbilk', 'Unterbilk', 'Volmerswerth'] },
      { name: 'Bezirk 4', ortsteile: ['Heerdt', 'Lörick', 'Niederkassel', 'Oberkassel'] },
      { name: 'Bezirk 5', ortsteile: ['Angermund', 'Kaiserswerth', 'Kalkum', 'Lohausen', 'Stockum', 'Wittlaer'] },
      { name: 'Bezirk 6', ortsteile: ['Lichtenbroich', 'Mörsenbroich', 'Rath', 'Unterrath'] },
      { name: 'Bezirk 7', ortsteile: ['Gerresheim', 'Grafenberg', 'Hubbelrath', 'Knittkuhl', 'Ludenberg'] },
      { name: 'Bezirk 8', ortsteile: ['Eller', 'Lierenfeld', 'Unterbach', 'Vennhausen'] },
      { name: 'Bezirk 9', ortsteile: ['Benrath', 'Hassels', 'Himmelgeist', 'Holthausen', 'Itter', 'Reisholz', 'Urdenbach', 'Wersten'] },
      { name: 'Bezirk 10', ortsteile: ['Garath', 'Hellerhof'] },
    ],
    angrenzendeOrte: ['Neuss', 'Ratingen', 'Meerbusch', 'Erkrath', 'Mettmann', 'Hilden', 'Langenfeld', 'Monheim', 'Dormagen', 'Kaarst', 'Korschenbroich'],
    unfallHotspots: [
      { ort: 'Stockumer Höfe / Danziger Straße', bezirk: 'Bezirk 5', beschreibung: '14 Pkw-Unfälle 2024 — der landesweit hervorgehobene neue Düsseldorfer Schwerpunkt, nahe dem Flughafen.' },
      { ort: 'Mörsenbroicher Ei', bezirk: 'Bezirk 6', beschreibung: 'Dauerschwerpunkt im Unfallatlas und zugleich Verkehrsknoten der A52/B1/B7-Verflechtung.' },
      { ort: 'Worringer Platz', bezirk: 'Bezirk 1', beschreibung: 'Wiederkehrender Schwerpunkt in Hauptbahnhof-Nähe.' },
      { ort: 'Südring / Münchener Straße und Südring / Völklinger Straße', bezirk: 'Bezirk 3', beschreibung: 'Wiederkehrende Kreuzungsunfälle.' },
    ],
    hotspotQuelle: 'IT.NRW Unfallatlas 2024 (PM 200/25) · Polizei Düsseldorf, Jahresbericht 2024',
    hauptachsen: {
      autobahnen: ['A46', 'A52', 'A57', 'A59', 'A524', 'A44', 'A3'],
      bundesstrassen: ['B1', 'B7', 'B8', 'B8a', 'B9', 'B228', 'B326'],
      knoten: ['Mörsenbroicher Ei (A52/B1/B7)'],
      aktuelleBaustelle: 'Autobahndreieck Düsseldorf-Süd (Großbaustelle, erhöhtes Unfallrisiko)',
    },
    heroAnker: 'Ob auf der A46 Richtung Neuss, an der unfallträchtigen Kreuzung Stockumer Höfe/Danziger Straße nahe dem Flughafen oder im dichten Verkehr am Mörsenbroicher Ei — nach einem Unfall in Düsseldorf sind wir schnell bei Ihnen vor Ort.',
    unfallzahlStadt: { jahr: 2024, text: '2.324 Verkehrsunfälle mit Personenschaden (−5,9 % gegenüber 2023)' },
    oeffentlicheStellen: {
      polizeipraesidium: { name: 'Polizeipräsidium Düsseldorf', adresse: 'Am Polizeipräsidium 1, 40219 Düsseldorf', telefon: '0211 870-0' },
      zulassungsstelle: { name: 'Straßenverkehrsamt Düsseldorf', adresse: 'Höherweg 99–101, 40233 Düsseldorf', telefon: '0211 8991', kennzeichen: 'D', oeffnungszeiten: 'Mo/Mi/Fr 7:00–12:30, Di/Do 13:00–18:00 (Termin erforderlich)' },
      notruf: '110',
    },
    lokaleFaqs: [
      { frage: 'Wie schnell ist ein Gutachter nach einem Unfall auf der A46 oder A52 vor Ort?', antwort: 'Nach Ihrer Meldung meldet sich ein Berater meist in wenigen Minuten; den Vor-Ort-Termin koordinieren wir in der Regel innerhalb von 48 Stunden, oft schon am Folgetag. Wir kommen zu jedem Unfallort im Düsseldorfer Stadtgebiet — von Bilk und Friedrichstadt über Oberkassel und Pempelfort bis Benrath, Kaiserswerth und Rath — sowie an die Anschlussstellen der A46, A52, A57, A59 und A3.' },
      { frage: 'Kommen Sie auch nach Neuss, Ratingen, Hilden oder Meerbusch?', antwort: 'Ja. Unser Einsatzgebiet umfasst das Düsseldorfer Umland — unter anderem Neuss, Meerbusch, Ratingen, Hilden, Erkrath, Mettmann, Langenfeld und Dormagen. Bei einem unverschuldeten Unfall trägt die gegnerische Haftpflichtversicherung auch die Anfahrtskosten.' },
      { frage: 'Wer zahlt das Gutachten bei einem unverschuldeten Unfall in Düsseldorf?', antwort: 'Die Haftpflichtversicherung des Unfallverursachers — gemäß §249 BGB. Sobald der Schaden über der Bagatellgrenze (BGH: 715,81 €, aktuelle Rechtsprechung rund 1.000 €) liegt, sind die Gutachterkosten erstattungsfähig. Für unverschuldet Geschädigte fallen 0 € an (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).' },
      { frage: 'Mein Auto steht nach einem Unfall am Kennedydamm — können Sie dort begutachten?', antwort: 'Ja. Der Sachverständige kommt zu jedem Standort: Straßenrand, Parkhaus, Abschlepphof oder zur Werkstatt Ihrer Wahl in Düsseldorf. Sie müssen das Fahrzeug nicht erst bewegen — das schützt sogar Ihre Ansprüche, falls verdeckte Schäden vorliegen.' },
      { frage: 'Brauche ich nach einem Parkrempler in einer Altstadt-Tiefgarage ein Vollgutachten?', antwort: 'Das hängt vom Schaden ab. Bei reinen Lackkratzern unter etwa 750 € genügt oft ein Kostenvoranschlag. Sobald die Stoßstange verformt ist oder Verdacht auf verdeckte Schäden besteht — häufig nach Parkremplern in engen Tiefgaragen rund um die Altstadt oder den Carlsplatz —, ist mindestens ein Kurzgutachten sinnvoll. Die telefonische Erstprüfung ist kostenfrei.' },
      { frage: 'Sind Sie auch am Wochenende oder abends erreichbar?', antwort: 'Telefonisch und per WhatsApp erreichen Sie uns jederzeit — auch am Wochenende. Den Besichtigungstermin stimmen wir anschließend kurzfristig mit dem Sachverständigen ab.' },
    ],
  },
  wuppertal: {
    plzBereich: '42103–42399',
    vorwahl: '0202',
    stadtbezirke: [
      { name: 'Elberfeld', ortsteile: ['Elberfeld-Mitte', 'Nordstadt', 'Ostersbaum', 'Südstadt', 'Grifflenberg'] },
      { name: 'Elberfeld-West', ortsteile: ['Sonnborn', 'Varresbeck', 'Nützenberg', 'Arrenberg', 'Zoo'] },
      { name: 'Uellendahl-Katernberg', ortsteile: ['Uellendahl-West', 'Uellendahl-Ost', 'Dönberg', 'Eckbusch'] },
      { name: 'Vohwinkel', ortsteile: ['Vohwinkel-Mitte', 'Osterholz', 'Schöller-Dornap', 'Lüntenbeck'] },
      { name: 'Cronenberg', ortsteile: ['Cronenberg-Mitte', 'Küllenhahn', 'Hahnerberg', 'Sudberg'] },
      { name: 'Barmen', ortsteile: ['Barmen-Mitte', 'Friedrich-Engels-Allee', 'Loh', 'Clausen', 'Sedansberg', 'Lichtenplatz'] },
      { name: 'Oberbarmen', ortsteile: ['Oberbarmen-Schwarzbach', 'Wichlinghausen'] },
      { name: 'Heckinghausen', ortsteile: ['Heckinghausen', 'Hammesberg'] },
      { name: 'Langerfeld-Beyenburg', ortsteile: ['Langerfeld-Mitte', 'Nächstebreck', 'Beyenburg'] },
      { name: 'Ronsdorf', ortsteile: ['Ronsdorf-Mitte', 'Erbschlö-Linde'] },
    ],
    angrenzendeOrte: ['Solingen', 'Remscheid', 'Velbert', 'Schwelm', 'Haan', 'Gevelsberg', 'Ennepetal', 'Sprockhövel', 'Radevormwald', 'Wülfrath'],
    unfallHotspots: [
      { ort: 'Gathe', bezirk: 'Elberfeld', beschreibung: 'Einer der zwei größten Wuppertaler Unfallschwerpunkte — mit vielen Radunfällen, für Fußgänger besonders gefährlich.' },
      { ort: 'Am Diek / „Vor der Beule"', bezirk: 'Oberbarmen', beschreibung: 'Zweiter Top-Schwerpunkt der Stadt (Wichlinghausen).' },
      { ort: 'B7 in Höhe Berliner Platz', bezirk: 'Oberbarmen', beschreibung: 'Langjähriger Schwerpunkt entlang der zentralen Talachse.' },
      { ort: 'Kreuzung Hochstraße / Marienstraße', beschreibung: '24 Unfälle in drei Jahren — Gefällelage, stark frequentiert.' },
      { ort: 'A46 zwischen Sonnborner Kreuz und Katernberg', beschreibung: 'Häufung mit Verletzten, eine Stufe unter den innerstädtischen Schwerpunkten.' },
    ],
    hotspotQuelle: 'Unfallatlas / Kreispolizeibehörde Wuppertal · Westdeutsche Zeitung · Radio Wuppertal',
    hauptachsen: {
      autobahnen: ['A1', 'A46', 'A535'],
      bundesstrassen: ['B7 (zentrale Talachse Elberfeld–Barmen–Oberbarmen)', 'B228'],
      knoten: ['Sonnborner Kreuz (A46/A535)', 'Kreuz Wuppertal-Nord (A1/A46)'],
      aktuelleBaustelle: 'Generalsanierung der Bahnstrecke Hagen–Wuppertal–Köln/Düsseldorf (06.02.–10.07.2026) — erheblicher Verlagerungsverkehr auf die Straße',
    },
    heroAnker: 'Die meisten Unfälle in Wuppertal passieren entlang der Talachse — auf der B7 zwischen Elberfeld, Barmen und Oberbarmen, an Brennpunkten wie der Gathe oder Am Diek in Wichlinghausen, oder auf der A46 am Sonnborner Kreuz. Genau dort sind wir schnell für Sie da.',
    topografieAnker: 'Wuppertals steile Hanglagen und die enge Tallage entlang der B7 führen häufig zu Auffahr- und Bremsunfällen — gerade bei Nässe und im Winter.',
    oeffentlicheStellen: {
      polizeipraesidium: { name: 'Polizeipräsidium Wuppertal', adresse: 'Friedrich-Engels-Allee 228, 42285 Wuppertal', telefon: '0202 284-0' },
      zulassungsstelle: { name: 'Straßenverkehrsamt Wuppertal', adresse: 'Döppersberg 41, 42103 Wuppertal', telefon: '0202 563-9006', kennzeichen: 'W', oeffnungszeiten: 'Mo–Mi 7:00–13:00, Do 7:00–13:00 + 14:00–17:00, Fr 7:00–12:00 (Termin erforderlich)' },
      notruf: '110',
    },
    lokaleFaqs: [
      { frage: 'Kommen Sie auch nach Solingen, Remscheid, Velbert oder Schwelm?', antwort: 'Ja. Wir bedienen das gesamte Bergische Land — neben Wuppertal auch Solingen, Remscheid, Velbert, Schwelm, Sprockhövel und Gevelsberg. Auch im westlichen Vohwinkel/Sonnborn nahe der A46-Anschlussstelle sowie in Langerfeld/Beyenburg nahe der A1 sind wir für Sie da.' },
      { frage: 'Unfall am Sonnborner Kreuz auf der A46 — wie schnell kann ein Sachverständiger kommen?', antwort: 'Nach Ihrer Meldung ruft Sie ein Berater meist binnen Minuten zurück; den Vor-Ort-Termin am Unfallort oder am Abschlepphof koordinieren wir in der Regel innerhalb von 48 Stunden, oft schon am Folgetag — auch entlang der A46 zwischen Sonnborner Kreuz und Wuppertal-Oberbarmen.' },
      { frage: 'Wir wohnen in Cronenberg oder Ronsdorf — kommt der Gutachter zu uns nach Hause?', antwort: 'Ja. Der Vor-Ort-Termin gehört zum Standard — wir kommen nach Cronenberg, Ronsdorf, Heckinghausen, Vohwinkel, Uellendahl-Katernberg oder in jeden anderen der zehn Wuppertaler Stadtbezirke. Auf Wunsch auch am Arbeitsplatz.' },
      { frage: 'Bagatellschaden in Wuppertal — lohnt sich überhaupt ein Gutachten?', antwort: 'Sobald die Reparaturkosten rund 750–1.000 € überschreiten (BGH-Grenze 715,81 € zzgl. aktueller Rechtsprechung), lohnt sich ein Vollgutachten — Sie sichern sich Wertminderung und Nutzungsausfall, die ein Kostenvoranschlag nicht abdeckt. Bei kleineren Lackschäden genügt ein Kurzgutachten. Die telefonische Erstprüfung ist kostenfrei.' },
      { frage: 'Was kostet das Gutachten bei einem unverschuldeten Unfall in Wuppertal?', antwort: 'Bei unverschuldetem Unfall trägt die gegnerische Haftpflichtversicherung die Gutachterkosten nach §249 BGB — für Sie 0 € (vorbehaltlich Anerkenntnis durch den gegnerischen Versicherer). Über eine Sicherungsabtretung rechnet der Sachverständige direkt mit der Versicherung ab, Sie gehen nicht in Vorkasse.' },
      { frage: 'Steile Straßenlage in Wuppertal — können Sie mein Fahrzeug auch am Hang sicher begutachten?', antwort: 'Ja. Wuppertals steile Hanglagen rund um die Talachse der Wupper kennen die Sachverständigen aus täglicher Praxis. Sie bringen mobile Ausrüstung mit — Lackschichtdickenmesser und Foto-Equipment — und begutachten Ihr Fahrzeug an jedem zugänglichen Standort.' },
    ],
  },
  bonn: {
    plzBereich: '53111–53229',
    vorwahl: '0228',
    stadtbezirke: [
      { name: 'Bonn', ortsteile: ['Auerberg', 'Bonn-Castell', 'Bonn-Zentrum', 'Buschdorf', 'Dottendorf', 'Dransdorf', 'Endenich', 'Graurheindorf', 'Gronau', 'Ippendorf', 'Kessenich', 'Lessenich/Meßdorf', 'Nordstadt', 'Poppelsdorf', 'Röttgen', 'Südstadt', 'Tannenbusch', 'Ückesdorf', 'Venusberg', 'Weststadt'] },
      { name: 'Bad Godesberg', ortsteile: ['Alt-Godesberg', 'Friesdorf', 'Godesberg-Nord', 'Godesberg-Villenviertel', 'Heiderhof', 'Hochkreuz', 'Lannesdorf', 'Mehlem', 'Muffendorf', 'Pennenfeld', 'Plittersdorf', 'Rüngsdorf', 'Schweinheim'] },
      { name: 'Beuel', ortsteile: ['Beuel-Mitte', 'Beuel-Ost', 'Geislar', 'Hoholz', 'Holtorf', 'Holzlar', 'Küdinghoven', 'Limperich', 'Oberkassel', 'Pützchen/Bechlinghoven', 'Ramersdorf', 'Schwarzrheindorf/Vilich-Rheindorf', 'Vilich', 'Vilich-Müldorf'] },
      { name: 'Hardtberg', ortsteile: ['Brüser Berg', 'Duisdorf', 'Hardthöhe', 'Lengsdorf'] },
    ],
    angrenzendeOrte: ['Siegburg', 'Troisdorf', 'Sankt Augustin', 'Hennef', 'Meckenheim', 'Bornheim', 'Königswinter', 'Bad Honnef', 'Alfter', 'Wachtberg', 'Lohmar', 'Niederkassel', 'Rheinbach', 'Swisttal'],
    unfallHotspots: [
      { ort: 'Bereich Hauptbahnhof / Höhe Poststraße', beschreibung: 'Wiederkehrender Schwerpunkt, vor allem mit Fahrradbeteiligung.' },
      { ort: 'Bertha-von-Suttner-Platz', bezirk: 'Bonn', beschreibung: 'Innenstadt (53111) — viele gemeldete Gefahrenstellen.' },
      { ort: 'Hochkreuzallee', bezirk: 'Bad Godesberg', beschreibung: 'Gefahrenstelle im Bereich Hochkreuz (53175).' },
      { ort: 'Hermannstraße', bezirk: 'Beuel', beschreibung: 'Viele gemeldete Gefahrenstellen (53225).' },
      { ort: 'Offizielle Unfallhäufungsstellen', beschreibung: 'Von der Unfallkommission festgelegt: 4 im Stadtbezirk Bonn, 2 in Hardtberg, je 1 in Beuel und Bad Godesberg.' },
    ],
    hotspotQuelle: 'IT.NRW Unfallatlas · Stadt Bonn, Unfallkommission · General-Anzeiger Bonn',
    hauptachsen: {
      autobahnen: ['A59', 'A555 (älteste Autobahn Deutschlands, Köln–Bonn)', 'A565 (Stadtautobahn)', 'A562', 'A560'],
      bundesstrassen: ['B9 (Rheinachse)', 'B42', 'B56'],
      knoten: ['Reuterstraße (B9-Anschluss, meistbefahrener innerstädtischer Korridor)'],
      aktuelleBaustelle: 'A565 Friedrich-Ebert-Brücke — Lkw-Sperrung über 7,5 t bis 31.12.2030; zusätzlich A59-Ausbau Sankt Augustin-West ↔ Bonn-Nordost',
    },
    heroAnker: 'Ob auf der A565 mitten durch die Stadt, an der stark befahrenen Reuterstraße oder im Bereich Hauptbahnhof/Poststraße — nach einem Unfall in Bonn erstellen wir Ihr Gutachten schnell und vor Ort.',
    topografieAnker: 'Der Rhein teilt Bonn — wir begutachten links- wie rechtsrheinisch, von Mehlem bis Oberkassel, mit Querung über Kennedy-, Friedrich-Ebert- und Konrad-Adenauer-Brücke.',
    oeffentlicheStellen: {
      polizeipraesidium: { name: 'Polizeipräsidium Bonn', adresse: 'Königswinterer Straße 500, 53227 Bonn', telefon: '0228 15-0' },
      zulassungsstelle: { name: 'Straßenverkehrsamt Bonn', adresse: 'Berliner Platz 2, 53111 Bonn', telefon: '0228 776677', kennzeichen: 'BN', oeffnungszeiten: 'Termin online buchbar · Umland: Rhein-Sieg-Kreis (SU) in Siegburg und Meckenheim' },
      notruf: '110',
    },
    lokaleFaqs: [
      { frage: 'Kommen Sie auch nach Bornheim, Sankt Augustin, Königswinter oder Bad Honnef?', antwort: 'Ja. Wir bedienen Bonn und den Rhein-Sieg-Kreis — unter anderem Bornheim, Sankt Augustin, Troisdorf, Siegburg, Königswinter, Bad Honnef, Niederkassel, Hennef und Meckenheim. Bei einem Haftpflichtfall trägt die gegnerische Versicherung die Anfahrt.' },
      { frage: 'Wer zahlt das Gutachten bei einem unverschuldeten Unfall in Bonn?', antwort: 'Die gegnerische Haftpflichtversicherung — gemäß §249 BGB. Bei Schäden über der Bagatellgrenze (BGH 715,81 €, aktuelle Rechtsprechung rund 1.000 €) zahlen Sie 0 € (vorbehaltlich Anerkenntnis durch den gegnerischen Versicherer). Der Sachverständige rechnet direkt mit der Versicherung ab.' },
      { frage: 'Unfall auf der B9, A555, A59 oder A565 — wie schnell sind Sie am Unfallort?', antwort: 'Nach Ihrer Meldung meldet sich ein Berater meist in wenigen Minuten; den Termin am Unfallort oder Abschlepphof koordinieren wir in der Regel innerhalb von 48 Stunden, oft schon am Folgetag — auch auf den Bonner Hauptachsen B9, A555 Richtung Köln, A59 Richtung Sankt Augustin und A565 Richtung Meckenheim.' },
      { frage: 'Kann ich Sie auch nachts oder am Wochenende erreichen?', antwort: 'Ja. Telefonisch und per WhatsApp erreichen Sie uns jederzeit — auch nachts und am Wochenende. Termine in den Bonner Stadtbezirken Innenstadt, Beuel, Bad Godesberg und Hardtberg stimmen wir kurzfristig mit dem Sachverständigen ab.' },
      { frage: 'Mein Auto wurde in der Bonner Südstadt beschädigt und der Verursacher ist weg — was tun?', antwort: 'Bei Fahrerflucht: zuerst die Polizei (Anzeige gegen Unbekannt), dann uns anrufen. Wir dokumentieren den Schaden gerichtsfest zur Beweissicherung — wird der Verursacher später ermittelt, haben Sie ein belastbares Gutachten. Wird er nicht gefunden, läuft die Regulierung über Ihre Kaskoversicherung (falls vorhanden).' },
      { frage: 'Können Sie auch Oldtimer und Elektrofahrzeuge bewerten?', antwort: 'Ja. Wir erstellen Wertgutachten für Klassiker, Youngtimer und H-Kennzeichen-Anträge sowie Schadens- und Akku-Gutachten für Elektrofahrzeuge (z. B. Tesla, ID-Modelle, e-tron). Je nach Fahrzeug nutzen die Sachverständigen DAT, Schwacke, Classic-Data oder classic-analytics.' },
    ],
  },
}

export function getStadtBySlug(slug: string): Stadt | null {
  const stadt = STAEDTE.find((s) => s.slug === slug)
  if (!stadt) return null
  const hyperlocal = HYPERLOCAL_DATA[slug]
  return hyperlocal ? { ...stadt, hyperlocal } : stadt
}
