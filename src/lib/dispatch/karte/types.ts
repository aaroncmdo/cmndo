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

export type LayerKey = 'leads' | 'svs' | 'termine'

export type SVPin = {
  id: string
  vorname: string | null
  nachname: string | null
  firmenname: string | null
  paket: string | null
  ort: string | null
  spezifikationen_top3: string[]
  bewertungs_durchschnitt: number | null
  bewertungs_anzahl: number | null
  lat: number
  lng: number
}

export type TerminPin = {
  id: string
  start_zeit: string
  status: string
  kunde_name: string | null
  sv_initialen: string | null
  claim_nummer: string | null
  fall_id: string | null
  lead_id: string | null
  lat: number
  lng: number
  geoSource: 'gps_ankunft' | 'lead_besichtigung' | 'sv_standort' | 'plz_centroid'
}

export type KarteSnapshot = {
  leads: TriageLeadPin[]
  svs: SVPin[]
  termine: TerminPin[]
  unlocalized: UnlocalizedLead[]
}

export type RawTerminForKarte = {
  id: string
  start_zeit: string
  status: string | null
  fall_id: string | null
  lead_id: string | null
  sv_id: string | null
  gps_lat_ankunft: number | null
  gps_lng_ankunft: number | null
  lead_lat: number | null
  lead_lng: number | null
  lead_vorname: string | null
  lead_nachname: string | null
  sv_lat: number | null
  sv_lng: number | null
  sv_vorname: string | null
  sv_nachname: string | null
  claim_nummer: string | null
}
