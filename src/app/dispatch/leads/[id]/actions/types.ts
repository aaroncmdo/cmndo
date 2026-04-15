// AAR-143: Geteilte Typen für die Dispatch-Lead-Actions.
// 'use server'-Module dürfen nur async functions exportieren — Typen wandern
// daher in dieses pure Typ-File und werden von hard-gate.ts + sv-termin.ts
// importiert.

export type UnfallortKategorie =
  | 'parkplatz'
  | 'strasse'
  | 'autobahn'
  | 'kreuzung'
  | 'tankstelle'
  | 'innenstadt'
  | 'sonstiges'

export type HardGateData = {
  unfallhergang?: string
  schuldfrage?: 'gegner' | 'unklar' | 'eigenverantwortung'
  aufklaerung_teilschuld_bestaetigt?: boolean
  schaden_sichtbar?: boolean
  personenschaden_flag?: boolean
  mietwagen_flag?: boolean
  nutzungsausfall?: boolean
  hat_haftpflicht?: boolean
  unfallort?: string
  unfallort_kategorie?: UnfallortKategorie
  unfallort_lat?: number | null
  unfallort_lng?: number | null
  polizei_vor_ort?: boolean
  polizei_aktenzeichen?: string | null
  polizeibericht_pflicht?: boolean
  fahrzeug_fahrbereit?: boolean
}

export type SvSuggestion = {
  svId: string
  profileId: string | null
  name: string
  paket: string
  distanzKm: number
  offeneFaelle: number
  kontingentFrei: number
  ablehnungen30d: number
  score: number
  reasons: string[]
}
