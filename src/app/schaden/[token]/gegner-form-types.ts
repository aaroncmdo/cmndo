// Plain module — NO 'use server'. Exported types must not come from a 'use server' file
// because the client bundle would receive undefined (AAR-664).

/** A single photo captured by the opponent during the accident flow. */
export type GegnerFoto = {
  /** Perspective of the photo. */
  typ: 'gegner_fahrzeug' | 'eigenes_fahrzeug' | 'unfallort'
  /** Raw base64 string (with or without data-URI prefix — server strips prefix). */
  base64: string
  /** MIME type reported by the client (e.g. 'image/jpeg', 'image/png'). */
  contentType: string
}

export type GegnerFormData = {
  name: string
  telefon?: string
  email?: string
  kennzeichen?: string
  fahrzeugtyp?: string
  versicherungId?: string // Gegner-Haftpflicht (versicherungen.id)
  /** Policennummer beim eigenen Haftpflichtversicherer. NICHT schadennummer (s.u.). */
  versicherungsnummer?: string
  /** Aktenzeichen/Schadennummer eines bereits laufenden Vorgangs beim Versicherer. */
  schadennummer?: string
  hergang?: string // Unfallhergang-Text (evtl. Groq-diktiert)
  consent: boolean // DPIA-Consent-Checkbox
  /** Optional photos captured by the opponent (both vehicles, accident scene). */
  fotos?: GegnerFoto[]
  /** Optional PNG signature data-URI from SignaturePadInput. */
  unterschrift?: string
  /** FU2: Unfallort (Schadenlocation) — Browser-Geolocation am Unfallort, best-effort.
   *  Getrennt vom Fahrzeug-Standort (Aaron 22.07.); landet auf leads.unfallort_lat/lng. */
  unfallortLat?: number
  unfallortLng?: number
}
