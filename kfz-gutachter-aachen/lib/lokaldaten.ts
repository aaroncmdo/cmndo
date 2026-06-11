// BRIEF 08l · Lokal-Daten-Layer (Quelle: 20b_LOKALDATEN_KOELN_AACHEN_2026-06-10,
// Cowork-Recherche: Unfallatlas/IT.NRW, Polizei Aachen/Dueren, Lokalpresse).
// REDAKTIONS-REGELN (bindend): keine Todesfaelle/Verletztenzahlen auf der LP —
// nur sachliche Muster ("von der Unfallkommission als Unfallhaeufungsstelle
// gefuehrt", "haeufige Abbiegeunfaelle"). Jede Zeile traegt Quelle + Jahr.
// GUARD-STEUERUNG (Status-Block 20b): Staedte ohne `brennpunkte`-Feld rendern
// den Brennpunkte-Block NICHT — Alsdorf ist 🟡 (Check), Eschweiler/Baesweiler/
// Herzogenrath sind 🔴 (Guard AUS); Eintraege liegen im 20b-Doc bereit.
// `koordinaten` optional: Karten-Pins rendern erst, wenn lat/lng ergaenzt sind
// (Unfallatlas-Check-Runde) — kein Pin ohne verifizierte Position.
// Vor Live: Kevin-Freigabe der Formulierungen (Doc 20).

export type BrennpunktTyp = 'abbiegen' | 'auffahren' | 'parken' | 'fahrrad'

export interface BrennpunktEintrag {
  ort: string
  typ: BrennpunktTyp
  hinweis: string
  quelle: string
  stand: string
  /** Optional — Pins auf der Leaflet-Karte erst nach Koordinaten-Verifikation. */
  koordinaten?: { lat: number; lng: number }
}

export interface LokalDaten {
  /** Stadtteile fuer Anfahrt & Tempo ("auch in X, Y oder Z"). */
  stadtteile: string[]
  /** Hauptachsen als Fliesstext-Fragment ("A4 und A44"). */
  achsen: string
  /** Brennpunkte — Feld weglassen = Daten-Guard AUS (kein Block, keine Pins). */
  brennpunkte?: BrennpunktEintrag[]
  /** Optionaler sachlicher Kontext-Satz (z. B. Stadt-Statistik). */
  kontextSatz?: { text: string; quelle: string; stand: string }
  /** 2 lokale FAQ (Position 1+2 im Accordion, mit Orts-Chip). */
  faqLokal?: { q: string; a: string }[]
}

export const LOKALDATEN: Record<string, LokalDaten> = {
  aachen: {
    stadtteile: ['Brand', 'Eilendorf', 'Haaren', 'Laurensberg', 'Richterich'],
    achsen: 'A4 und A44 (Aachener Kreuz) sowie den Alleenring',
    brennpunkte: [
      { ort: 'Trierer Straße (B258)', typ: 'auffahren', hinweis: 'Zählt zu den unfallreichsten Straßen Deutschlands.', quelle: 't-online/AZ (MeinAuto-Auswertung)', stand: '2024' },
      { ort: 'Adalbertsteinweg (B258), Kaiserplatz–Aretzstraße', typ: 'fahrrad', hinweis: 'Von der Unfallkommission behandelt, viele Radunfälle.', quelle: 'Ratsinfo/Antenne AC', stand: '2020/2024' },
    ],
    kontextSatz: { text: 'Die Stadt führt aktuell 52 offene Unfallhäufungsstellen im Stadtgebiet.', quelle: 'Stadt Aachen', stand: '2024' },
    faqLokal: [
      { q: 'Wie schnell sind Sie in Brand oder Eilendorf?', a: 'Über A44 und A4 binnen 15 bis 20 Minuten.' },
      { q: 'Kommen Sie auch zu Werkstätten in Aachen?', a: 'Ja — alle Bezirke, über Alleenring und A544.' },
    ],
  },
  dueren: {
    stadtteile: ['Birkesdorf', 'Gürzenich', 'Rölsdorf', 'Lendersdorf', 'Arnoldsweiler'],
    achsen: 'A4 (AS Düren, Merzenich), B56 und B264',
    brennpunkte: [
      { ort: 'Kreuzung B56/B264 Kölner Landstraße', typ: 'abbiegen', hinweis: 'Polizeilich geführte Unfallhäufungsstelle.', quelle: 'Polizei Düren, VU-Statistik', stand: '2024' },
      { ort: 'Aachener Straße (B264) / Stürtzstraße', typ: 'auffahren', hinweis: 'Meistbefahrene Kreuzung der Stadt, wiederholt als Unfallhäufungsstelle erfasst.', quelle: 'Polizei Düren', stand: '2024/25' },
      { ort: 'Kreisverkehr Nippesstraße / Nideggener Straße (L249)', typ: 'abbiegen', hinweis: 'Unfallhäufungsstelle laut Kreis-Statistik.', quelle: 'Polizei Düren', stand: '2024/25' },
    ],
    faqLokal: [
      { q: 'Wie schnell sind Sie in Birkesdorf oder Gürzenich?', a: 'Über B56 und B264 binnen 15 Minuten ab Zentrum.' },
      { q: 'Kommen Sie auch zu Werkstätten in Düren?', a: 'Ja — über die Anschlussstellen Düren und Merzenich erreichen wir das ganze Stadtgebiet.' },
    ],
  },
  eschweiler: {
    // Beleglage DUENN 🔴 — Brennpunkte-Block AUS (Guard, 20b).
    stadtteile: ['Dürwiß', 'Weisweiler', 'Nothberg', 'Röhe'],
    achsen: 'A4 (drei Anschlussstellen) und B264',
    faqLokal: [
      { q: 'Wie schnell sind Sie in Dürwiß oder Weisweiler?', a: 'Über A4 und B264 binnen 15 bis 20 Minuten.' },
      { q: 'Kommen Sie auch zu Werkstätten in Eschweiler?', a: 'Ja — Innenstadt und alle Stadtteile.' },
    ],
  },
  stolberg: {
    stadtteile: ['Atsch', 'Büsbach', 'Breinig', 'Mausbach', 'Gressenich'],
    achsen: 'A4 (über Eilendorf), A44 (Brand) und L221/L238',
    brennpunkte: [
      { ort: 'Cockerillstraße / Fettberg / Schellerweg', typ: 'abbiegen', hinweis: 'Polizeilich erfasste Unfallhäufungsstelle, vor allem Linksabbiegeunfälle.', quelle: 'Mein Stolberg (Stadtverwaltung)', stand: '2023' },
      { ort: 'Eschweilerstraße / Steinfurt', typ: 'abbiegen', hinweis: 'Bekannter Schwerpunkt für Linksabbiege-Kollisionen.', quelle: 'Mein Stolberg', stand: '2023' },
    ],
    faqLokal: [
      { q: 'Wie schnell sind Sie in Breinig oder Mausbach?', a: 'Über A44 (Brand) und L238 binnen 15 bis 20 Minuten.' },
      { q: 'Kommen Sie auch zu Werkstätten in Stolberg?', a: 'Ja — alle Stadtteile.' },
    ],
  },
  alsdorf: {
    // Brennpunkte 🟡 — Guard AUS bis Unfallatlas-Check (20b).
    stadtteile: ['Hoengen', 'Mariadorf', 'Kellersberg'],
    achsen: 'A44 (AS Alsdorf, Broichweiden) und B57',
    faqLokal: [
      { q: 'Wie schnell sind Sie in Mariadorf oder Hoengen?', a: 'Über B57 und L240 binnen 15 bis 20 Minuten.' },
      { q: 'Kommen Sie auch zu Werkstätten in Alsdorf?', a: 'Ja — Kurt-Koblitz-Ring und Gewerbegebiet an der A44.' },
    ],
  },
  wuerselen: {
    stadtteile: ['Broichweiden', 'Bardenberg', 'Morsbach', 'Scherberg'],
    achsen: 'A4/A44 (Aachener Kreuz) und B57',
    brennpunkte: [
      { ort: 'Krefelder Straße (B57)', typ: 'auffahren', hinweis: 'Wiederholt schwere Unfälle, mehrere unabhängige Polizeimeldungen.', quelle: 'Polizei Aachen/AZ', stand: '2025/26' },
    ],
    faqLokal: [
      { q: 'Wie schnell sind Sie in Broichweiden oder Bardenberg?', a: 'Direkt am Aachener Kreuz — binnen 15 Minuten.' },
      { q: 'Kommen Sie auch zu Werkstätten in Würselen?', a: 'Ja — Krefelder und Aachener Straße.' },
    ],
  },
  baesweiler: {
    // Beleglage DUENN 🔴 — Brennpunkte-Block AUS (Guard, 20b).
    stadtteile: ['Setterich', 'Oidtweiler', 'Beggendorf'],
    achsen: 'B57, L240 und A44 (über AS Alsdorf/Aldenhoven)',
    faqLokal: [
      { q: 'Wie schnell sind Sie in Setterich oder Oidtweiler?', a: 'Über B57 und L240 binnen 20 Minuten.' },
      { q: 'Kommen Sie auch zu Werkstätten in Baesweiler?', a: 'Ja — zum Beispiel im Gewerbegebiet an der B57.' },
    ],
  },
  juelich: {
    stadtteile: ['Koslar', 'Kirchberg', 'Broich', 'Barmen'],
    achsen: 'A44 (AS Jülich-West/-Ost) und B56',
    brennpunkte: [
      { ort: 'Kreuzung B56/L253', typ: 'abbiegen', hinweis: 'Von der Polizei Düren als Unfallhäufungsstelle geführt.', quelle: 'Polizei Düren, VU-Statistik', stand: '2024' },
      { ort: 'Römerstraße / Dr.-Weyer-Straße', typ: 'abbiegen', hinweis: 'Unfallhäufungsstelle der Unfallkommission; 2025 kam Römerstraße/Finkenweg hinzu.', quelle: 'AZ/Polizei Düren', stand: '2025' },
    ],
    faqLokal: [
      { q: 'Wie schnell sind Sie in Koslar oder Barmen?', a: 'Über beide A44-Anschlüsse binnen 20 Minuten.' },
      { q: 'Kommen Sie auch zu Werkstätten in Jülich?', a: 'Ja — B56 und das Umfeld des Forschungszentrums.' },
    ],
  },
  herzogenrath: {
    // Beleglage DUENN 🔴 — Brennpunkte-Block AUS (Guard, 20b).
    stadtteile: ['Kohlscheid', 'Merkstein'],
    achsen: 'B221 und die Roermonder Straße (A4 über Laurensberg)',
    faqLokal: [
      { q: 'Wie schnell sind Sie in Kohlscheid oder Merkstein?', a: 'Über B221 und Roermonder Straße binnen 15 bis 20 Minuten.' },
      { q: 'Unfall im Grenzgebiet (Neustraße/Kerkrade)?', a: 'Kein Problem — Gutachten nach deutschem Recht, wir kommen auch grenznah.' },
    ],
  },
}
