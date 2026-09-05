// src/lib/kasko-wb/types.ts
// Geteilte Typen der Kasko-Werkstattbindungs-Wissensbasis (client-safe, keine Server-Imports).
// Enum-Werte spiegeln die CHECK-Constraints aus Migration 1/3 — bei Aenderung BEIDE Seiten anpassen.

export type WbStatus = 'optional' | 'standard' | 'keine'
export type Bindungsumfang = 'keine' | 'voll' | 'nur_glas' | 'unklar'
export type Verlaesslichkeit = 'belegt' | 'abgeleitet' | 'nicht_belegt'
export type WerkstattbindungQuelle = 'tarif' | 'marker' | 'kunde' | 'dispatcher' | 'dokument' | 'unbekannt'
export type MarkerAntwort = 'ja' | 'nein' | 'unbekannt'

export type KaskoMarke = {
  id: string
  slug: string
  marke: string
  wbStatus: WbStatus
  wbMarker: string[]
  nichtWbMarker: string[]
  hinweis: string | null
  variantenHinweis: string | null
  /** Anzahl aktiver Tarifzeilen — 0 bei Marken ohne CHECK24-Listung (z.B. HDI). */
  tarifAnzahl: number
}

export type KaskoTarif = {
  id: string
  markeId: string
  anzeigename: string
  hatWerkstattbindung: boolean
  bindungsumfang: Bindungsumfang
  verlaesslichkeit: Verlaesslichkeit
}

/** Was der Kunde gewaehlt hat — Rohinput fuer die Server-Actions. */
export type KaskoTarifAuswahl = {
  markeId: string | null
  /** Marke oder Freitext („Meine Versicherung ist nicht dabei"). */
  markeName: string | null
  tarifId: string | null
  tarifName: string | null
  markerAntwort: MarkerAntwort | null
}

export type WbGrund =
  | 'keine_wb_bei_marke'
  | 'standard_wb'
  | 'tarif_ohne_wb'
  | 'tarif_mit_wb'
  | 'nur_glas_karosserie'
  | 'marker_bestaetigt'
  | 'marker_verneint'
  | 'unbekannt'

export type WbErgebnis = {
  /** true = frei (wir vermitteln) · false = gebunden · null = unbekannt */
  freieWerkstattwahl: boolean | null
  quelle: WerkstattbindungQuelle
  grund: WbGrund
}

/** Alles, was die Endseite / Mail / Dispatch ueber die Bindung anzeigen. */
export type KaskoBindungsInfo = {
  markeName: string | null
  tarifName: string | null
  wbMarker: string[]
  nachlassText: string | null
  sanktionText: string
  ausnahmenText: string
  partnernetz: string | null
  verlaesslichkeit: Verlaesslichkeit
  bindungsumfang: Bindungsumfang
  hotline: string | null
  schadenEmail: string | null
  webseite: string | null
  /** Datum der Tarifliste (ISO yyyy-mm-dd). */
  stand: string
}
