// AAR-143: Geteilte Typen für die Dispatch-Lead-Actions.
// 'use server'-Module dürfen nur async functions exportieren — Typen wandern
// daher in dieses pure Typ-File und werden von sv-termin.ts importiert.
// P3b-Cutover (dispatch-config-unify): HardGateData entfernt — die Legacy-
// hard-gate-Action ist gelöscht (v2 nutzt computeQualificationStatus + Flags).

export type UnfallortKategorie =
  | 'parkplatz'
  | 'strasse'
  | 'autobahn'
  | 'kreuzung'
  | 'tankstelle'
  | 'innenstadt'
  | 'sonstiges'

export type SvSuggestion = {
  svId: string
  profileId: string | null
  name: string
  paket: string
  distanzKm: number
  /** AAR-CMM: Echte Mapbox-Driving-ETA Büro → Fall in Minuten. null bei API-Fehler. */
  etaFromBueroMin: number | null
  offeneFaelle: number
  kontingentFrei: number
  ablehnungen30d: number
  score: number
  reasons: string[]
  // AAR-264: Wunschtermin-Verfügbarkeit (nur gesetzt wenn Lead Wunschtermin hat)
  verfuegbarAmWunschtermin?: boolean
  naechsterFreierSlot?: string | null
}
