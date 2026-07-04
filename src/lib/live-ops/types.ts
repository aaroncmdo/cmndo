export type LiveOpsRole = 'admin' | 'dispatch' | 'kundenbetreuer'

export type LiveOpsScope = {
  role: LiveOpsRole
  userId: string
  svIds: string[] | 'all'
  fallIds: string[] | 'all'
}

export type CarState = {
  mode: 'live' | 'unterwegs_derived' | 'none'
  lat: number | null
  lng: number | null
  heading: number | null
  zielLat: number | null
  zielLng: number | null
  terminId: string | null
  etaMinuten: number | null
}

export type SvLiveOps = {
  id: string
  name: string
  typ: string
  verifiziert: boolean
  paket: string
  genutzt: number
  gesamt: number
  gesperrt: boolean
  urlaub: boolean
  standortLat: number | null
  standortLng: number | null
  isochrone: unknown | null
  car: CarState
}

export type TerminPin = {
  id: string
  svId: string
  svName: string
  kundeName: string
  status: string
  startZeit: string
  lat: number
  lng: number
  adresse: string
  claimNummer: string
}

export type DeadPin = {
  id: string
  name: string
  firma: string
  status: string
  lat: number
  lng: number
  region: string
  quelle: string
}

export type UnterwegsRoute = {
  svId: string
  coords: [number, number][]
}

export type TagesRoute = {
  svId: string
  svName: string
  stops: {
    terminId: string
    lat: number
    lng: number
    startZeit: string
    reihenfolge: number
  }[]
}

export type LeadPin = {
  id: string
  name: string
  status: string
  lat: number
  lng: number
  ort: string | null
  kanal: string | null
  erstelltAm: string
}
