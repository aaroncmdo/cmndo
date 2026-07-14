// Typen fuer das Admin-Firmen-Flotten-Detail (Task 2).
// Kein 'use server' — reiner Typ-Export, damit Client-Bundle sicher importieren kann.

export type FlottenFahrzeug = {
  flotten_fahrzeug_id: string
  vehicle_id: string
  kennzeichen: string | null
  hersteller: string | null
  modell: string | null
  status: string | null
  notiz: string | null
}

export type FlottenKontoInfo = {
  konto_id: string
  user_id: string
  status: string
  aktiviert_am: string | null
  email: string | null
  vorname: string | null
  nachname: string | null
  telefon: string | null
}

export type FlottenKarte = {
  id: string
  token: string
  status: string
  fahrzeug_id: string | null
  kennzeichen: string | null
}

export type FlottenSchaden = {
  claim_id: string
  claim_nummer: string | null
  vehicle_id: string
  kennzeichen: string | null
  status: string | null
  schadentag: string | null
  schadens_hoehe_netto: number | null
}

export type FirmenFlotteDetail = {
  firma: {
    id: string
    name: string
    ust_id: string | null
    rechtsform: string | null
    adresse_strasse: string | null
    adresse_plz: string | null
    adresse_ort: string | null
    telefon: string | null
    email: string | null
    webseite: string | null
    notiz: string | null
  }
  konten: FlottenKontoInfo[]
  fahrzeuge: FlottenFahrzeug[]
  karten: FlottenKarte[]
  schaeden: FlottenSchaden[]
}
