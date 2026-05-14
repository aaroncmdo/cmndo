// AAR-894 — Types für Dispatcher-Karte v1 (Leads-Triage-Layer).
// Reflektiert die echte DB-Schema: leads hat KEIN besichtigungsort_plz/stadt
// und KEIN unfallort_plz (nur freitext-`unfallort` + lat/lng). Strukturierte
// PLZ-Quellen sind kunde_plz und halter_plz.

export type TriageLeadPin = {
  id: string
  vorname: string | null
  nachname: string | null
  firma_name: string | null
  schadentyp: string | null
  plz: string | null
  ort: string | null
  lat: number
  lng: number
  geoSource: 'besichtigungsort' | 'unfallort' | 'plz_centroid'
  created_at: string
}

export type UnlocalizedLead = {
  id: string
  vorname: string | null
  nachname: string | null
  firma_name: string | null
  schadentyp: string | null
  plz: string | null
  created_at: string
}

export type TriageSnapshot = {
  pins: TriageLeadPin[]
  unlocalized: UnlocalizedLead[]
}

export type RawLeadForKarte = {
  id: string
  vorname: string | null
  nachname: string | null
  firma_name: string | null
  schadentyp: string | null
  besichtigungsort_lat: number | null
  besichtigungsort_lng: number | null
  unfallort_lat: number | null
  unfallort_lng: number | null
  kunde_plz: string | null
  kunde_stadt: string | null
  halter_plz: string | null
  halter_stadt: string | null
  created_at: string | null
}

export type PlzGeoRow = { plz: string; lat: number; lng: number; ort: string | null }
