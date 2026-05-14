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
  besichtigungsort_plz: string | null
  besichtigungsort_stadt: string | null
  unfallort_lat: number | null
  unfallort_lng: number | null
  unfallort_plz: string | null
  kunde_plz: string | null
  kunde_stadt: string | null
  created_at: string | null
}

export type PlzGeoRow = { plz: string; lat: number; lng: number; ort: string | null }
