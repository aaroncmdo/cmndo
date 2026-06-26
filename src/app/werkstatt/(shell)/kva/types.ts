// Shared types fuer das Werkstatt-KVA-Feature (kein 'use server').
// Importiert von actions.ts (server) und WerkstattKvaFlow.tsx (client).

export type WerkstattKvaInput = {
  vorname?: string | null
  nachname?: string | null
  email?: string | null
  telefon?: string | null
  fahrzeug_hersteller?: string | null
  fahrzeug_modell?: string | null
  kennzeichen?: string | null
  fin?: string | null
  erstzulassung?: string | null
  fahrzeug_baujahr?: number | null
  kostenvoranschlag_netto?: number | null
  kostenvoranschlag_brutto?: number | null
  ocrRoh?: unknown
  kvaBase64?: string | null
  kvaMediaType?: string | null
  perWhatsApp?: boolean
}
