// Lokal-Daten-Layer (Bonn-Re-Skin): Struktur aus dem Koeln-Endstand uebernommen.
// Bonn-Spokes nutzen aktuell den `vorort`-Absatz aus SEO_BODY fuer die
// Einsatzgebiet-Lokalstrecke; LOKALDATEN ist hier (noch) leer — sobald gepruefte
// Unfallatlas-Brennpunkte je Bonn-Stadt vorliegen, hier ergaenzen
// (Redaktions-/Guard-Regeln wie im Koeln-Cluster: Quelle+Jahr, keine Opferzahlen,
// Pins erst nach Koordinaten-Verifikation).

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
  /** Hauptachsen als Fliesstext-Fragment ("A565, A59 und A562"). */
  achsen: string
  /** Brennpunkte — Feld weglassen = Daten-Guard AUS (kein Block, keine Pins). */
  brennpunkte?: BrennpunktEintrag[]
  /** Optionaler sachlicher Kontext-Satz (z. B. Kreis-Statistik). */
  kontextSatz?: { text: string; quelle: string; stand: string }
  /** 2 lokale FAQ (Position 1+2 im Accordion, mit Orts-Chip). */
  faqLokal?: { q: string; a: string }[]
}

export const LOKALDATEN: Record<string, LokalDaten> = {}
