// BRIEF 08l · Lokal-Daten-Layer (Quelle: 20b_LOKALDATEN_KOELN_AACHEN_2026-06-10,
// Cowork-Recherche: Unfallatlas/IT.NRW, Polizei Koeln/Rhein-Erft, Lokalpresse).
// REDAKTIONS-REGELN (bindend): keine Todesfaelle/Verletztenzahlen auf der LP —
// nur sachliche Muster ("von der Unfallkommission als Unfallhaeufungsstelle
// gefuehrt", "haeufige Abbiegeunfaelle"). Jede Zeile traegt Quelle + Jahr.
// GUARD-STEUERUNG (Status-Block 20b): Staedte ohne `brennpunkte`-Feld rendern
// den Brennpunkte-Block NICHT — Hürth/Wesseling sind 🟡 (erst nach Unfallatlas-
// Check durch Aaron/Cowork freischalten, Eintraege liegen im 20b-Doc bereit).
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
  /** Hauptachsen als Fliesstext-Fragment ("A1, A3 und A59"). */
  achsen: string
  /** Brennpunkte — Feld weglassen = Daten-Guard AUS (kein Block, keine Pins). */
  brennpunkte?: BrennpunktEintrag[]
  /** Optionaler sachlicher Kontext-Satz (z. B. Kreis-Statistik). */
  kontextSatz?: { text: string; quelle: string; stand: string }
  /** 2 lokale FAQ (Position 1+2 im Accordion, mit Orts-Chip). */
  faqLokal?: { q: string; a: string }[]
}

export const LOKALDATEN: Record<string, LokalDaten> = {
  koeln: {
    stadtteile: ['Ehrenfeld', 'Nippes', 'Deutz', 'Lindenthal', 'Mülheim', 'Porz'],
    achsen: 'A1, A3 und A4 sowie die Innere Kanalstraße',
    brennpunkte: [
      { ort: 'Subbelrather Straße / Ehrenfeldgürtel', typ: 'fahrrad', hinweis: 'Auffälligste Stelle der Stadt, vor allem Radunfälle.', quelle: 'IT.NRW/Unfallatlas', stand: '2024' },
      { ort: 'Zülpicher Platz', typ: 'abbiegen', hinweis: 'Wiederkehrende Unfallhäufung im Kreuzungsbereich.', quelle: 'IT.NRW/Unfallatlas', stand: '2024' },
      { ort: 'Universitätsstr. / Aachener Str. / Innere Kanalstraße', typ: 'auffahren', hinweis: 'Einer der meistbelasteten Knoten im Stadtgebiet.', quelle: 'IT.NRW/Unfallatlas', stand: '2024' },
    ],
    faqLokal: [
      { q: 'Wie schnell sind Sie in Ehrenfeld oder Nippes?', a: 'Über die Innere Kanalstraße und den Ring sind wir meist am selben Tag bei Ihnen.' },
      { q: 'Kommen Sie auch zu Werkstätten in Köln?', a: 'Ja — wir begutachten direkt in der Werkstatt, links- wie rechtsrheinisch.' },
    ],
  },
  leverkusen: {
    stadtteile: ['Opladen', 'Schlebusch', 'Wiesdorf', 'Rheindorf', 'Manfort'],
    achsen: 'A1, A3 und A59',
    brennpunkte: [
      { ort: 'Kreisverkehr Berliner Platz (Opladen)', typ: 'abbiegen', hinweis: 'Von der Unfallkommission als Unfallhäufungsstelle geführt, 2025 umfassend umgebaut.', quelle: 'Stadt Leverkusen', stand: '2025' },
      { ort: 'Autobahnkreuz Leverkusen (A1/A3)', typ: 'auffahren', hinweis: 'Rund 250.000 Kfz am Tag — Verflechtungsbereiche mit erhöhtem Stau- und Unfallrisiko.', quelle: 'Autobahn GmbH/ADAC', stand: '2024/25' },
    ],
    faqLokal: [
      { q: 'Wie schnell sind Sie in Opladen oder Schlebusch?', a: 'Über A1, A3 und A59 meist binnen 24 Stunden.' },
      { q: 'Kommen Sie auch zu Werkstätten in Leverkusen?', a: 'Ja — von Wiesdorf bis Opladen, direkt in Ihre Werkstatt.' },
    ],
  },
  'bergisch-gladbach': {
    stadtteile: ['Bensberg', 'Refrath', 'Paffrath', 'Hand', 'Heidkamp'],
    achsen: 'A4 (Anschlussstellen Refrath und Bensberg) und B506',
    brennpunkte: [
      { ort: 'Stationsstraße (Stadtmitte)', typ: 'auffahren', hinweis: 'Auffälligste Strecke der Stadt, von der Unfallkommission behandelt.', quelle: 'Bürgerportal in-gl.de', stand: '2024' },
      { ort: 'Mülheimer Str. / Gierather Str.–Buchholzstraße', typ: 'abbiegen', hinweis: 'Abbiegeunfälle zwischen Kfz und Rad, Gelbblinker angeordnet.', quelle: 'in-gl.de', stand: '2024' },
      { ort: 'Bensberger Straße (Heidkamp)', typ: 'fahrrad', hinweis: 'Häufige Abbiege-Kollisionen mit dem Radverkehr.', quelle: 'in-gl.de', stand: '2024/26' },
    ],
    faqLokal: [
      { q: 'Wie schnell sind Sie in Bensberg oder Refrath?', a: 'Über die A4 und B506 am selben oder nächsten Tag.' },
      { q: 'Kommen Sie auch zu Werkstätten in Bergisch Gladbach?', a: 'Ja — von der Stadtmitte bis Paffrath.' },
    ],
  },
  huerth: {
    // Brennpunkte 🟡 (nur Einzelmeldungen) — Guard AUS bis Unfallatlas-Check (20b).
    stadtteile: ['Hermülheim', 'Efferen', 'Alt-Hürth', 'Gleuel', 'Kendenich'],
    achsen: 'B265 (Luxemburger Straße), A4 und A1',
    faqLokal: [
      { q: 'Wie schnell sind Sie in Efferen oder Hermülheim?', a: 'Über die B265 und A4 kurzfristig — meist am selben Tag.' },
      { q: 'Kommen Sie auch zu Werkstätten in Hürth?', a: 'Ja — rund um den Hürth Park oder in Alt-Hürth.' },
    ],
  },
  wesseling: {
    // Brennpunkte 🟡 — Guard AUS bis Unfallatlas-Check (20b).
    stadtteile: ['Berzdorf', 'Keldenich', 'Urfeld'],
    achsen: 'A555 (Anschlussstelle Wesseling) und B9',
    faqLokal: [
      { q: 'Wie schnell sind Sie in Keldenich oder Urfeld?', a: 'Über die A555 und B9 meist am selben Tag.' },
      { q: 'Kommen Sie auch zu Werkstätten oder Arbeitgebern in Wesseling?', a: 'Ja — auch an den Chemie-Standorten.' },
    ],
  },
  pulheim: {
    stadtteile: ['Brauweiler', 'Stommeln', 'Sinnersdorf', 'Geyen', 'Sinthern'],
    achsen: 'B59, A57 (AS Worringen) und A1 (AS Bocklemünd)',
    brennpunkte: [
      { ort: 'B59 / Venloer Straße (K24) bei Stommeln', typ: 'abbiegen', hinweis: 'Wiederholt dokumentierte Abbiege- und Auffahrunfälle.', quelle: 'Polizei Rhein-Erft', stand: '2021–2026' },
    ],
    faqLokal: [
      { q: 'Wie schnell sind Sie in Brauweiler oder Stommeln?', a: 'Über B59 und A1 binnen 30 bis 60 Minuten.' },
      { q: 'Kommen Sie auch zu Werkstätten in Pulheim?', a: 'Ja — von Sinnersdorf bis Geyen.' },
    ],
  },
  frechen: {
    stadtteile: ['Königsdorf', 'Bachem', 'Buschbell', 'Grefrath', 'Habbelrath'],
    achsen: 'A4 (AS Frechen/Frechen-Nord), A1 (Kreuz Köln-West) und B264',
    brennpunkte: [
      { ort: 'Bonnstraße (L183)', typ: 'abbiegen', hinweis: 'Von der Unfallkommission als Unfallhäufungsstelle geführt, 2019 baulich entschärft.', quelle: 'Rheinische Anzeigenblätter', stand: '2019' },
    ],
    faqLokal: [
      { q: 'Wie schnell sind Sie in Königsdorf?', a: 'Über die A4 (Frechen-Nord) meist am selben Tag.' },
      { q: 'Kommen Sie auch zu Werkstätten in Frechen?', a: 'Ja — Kölner Straße, Europark und alle Stadtteile.' },
    ],
  },
  bruehl: {
    stadtteile: ['Vochem', 'Kierberg', 'Pingsdorf', 'Badorf', 'Schwadorf'],
    achsen: 'A553 (AS Brühl-Ost/-Süd), A555 und B51',
    // Konkrete Orte sind 🟡 (Check) — LIVE-READY ist der Kreis-Statistik-Kontext.
    kontextSatz: { text: 'Brühl zählt laut Kreis-Statistik zu den Städten mit den meisten Personenschadensunfällen im Rhein-Erft-Kreis.', quelle: 'Polizei Rhein-Erft, VU-Statistik 2025', stand: '2026' },
    faqLokal: [
      { q: 'Wie schnell sind Sie in Badorf oder Vochem?', a: 'Über die A553 und B51 binnen 24 Stunden.' },
      { q: 'Kommen Sie auch zu Werkstätten in Brühl?', a: 'Ja — von der Mitte bis ins Gewerbegebiet Vochem.' },
    ],
  },
  kerpen: {
    stadtteile: ['Sindorf', 'Horrem', 'Türnich', 'Buir', 'Blatzheim'],
    achsen: 'A4 (AS Kerpen, Buir), A61 (AS Türnich) und B264',
    brennpunkte: [
      { ort: 'Kreuz Kerpen (A4/A61) + A4-Abschnitt Frechen-Nord–Kreuz Kerpen', typ: 'auffahren', hinweis: 'Stark belasteter Abschnitt, wiederholt Unfälle mit Sperrungen.', quelle: 'Aachener Zeitung/Radio Erft', stand: '2025' },
    ],
    kontextSatz: { text: 'Kerpen verzeichnet laut Kreis-Statistik die zweitmeisten Personenschadensunfälle im Rhein-Erft-Kreis.', quelle: 'Polizei Rhein-Erft, VU-Statistik 2025', stand: '2026' },
    faqLokal: [
      { q: 'Wie schnell sind Sie in Sindorf oder Horrem?', a: 'Durch die Lage an A4 und A61 sind wir kurzfristig bei Ihnen.' },
      { q: 'Kommen Sie auch zu Werkstätten in Kerpen?', a: 'Ja — B264 in Sindorf, Europastraße und alle Stadtteile.' },
    ],
  },
}
