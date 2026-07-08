// AAR-956: Geocoding-Helper für partner_leads.
// Wrapt geocodeAddress, baut den Adress-String, erzwingt PLZ+Ort-Vollständigkeit.
// Wird an allen Partner-Lead-Intakes aufgerufen (create/csv/scrape/public-form).
// Non-critical beim Intake — Fehler brechen den Lead-Insert NICHT (nur Convert blockt hart).

import { geocodeAddress } from '@/lib/google-geocoding/geocode-address'

export type PartnerLeadGeoInput = {
  strasse?: string | null
  plz?: string | null
  ort?: string | null
}

export type PartnerLeadGeo =
  | { ok: true; lat: number; lng: number; place_id: string | null; formatted: string }
  | { ok: false; error: string; unvollstaendig: boolean }

/**
 * Baut einen Adress-String aus den Teilen zusammen.
 * Format: "Straße, PLZ Ort" oder "PLZ Ort" (ohne Straße).
 */
export function baueAdresse(input: PartnerLeadGeoInput): string {
  const plzOrt = [input.plz?.trim(), input.ort?.trim()].filter(Boolean).join(' ')
  return [input.strasse?.trim(), plzOrt].filter(Boolean).join(', ')
}

/**
 * Geokodiert einen Partner-Lead.
 * Vollständigkeits-Gate: PLZ + Ort sind Pflicht (Straße empfohlen, aber nicht erzwungen —
 * Google Maps findet PLZ+Ort auch ohne Straße ausreichend präzise für Partnerkarten-Pins).
 * Bei fehlendem PLZ/Ort wird kein Geocode-Call gemacht → { ok:false, unvollstaendig:true }.
 * Bei Geocoding-Fehler → { ok:false, unvollstaendig:false } (Lead bleibt erfassbar, Convert blockt).
 */
export async function geocodePartnerLead(input: PartnerLeadGeoInput): Promise<PartnerLeadGeo> {
  if (!input.plz?.trim() || !input.ort?.trim()) {
    return {
      ok: false,
      error: 'Adresse unvollständig (PLZ + Ort erforderlich).',
      unvollstaendig: true,
    }
  }

  const adresse = baueAdresse(input)
  const res = await geocodeAddress(adresse)

  if (!res.ok) {
    return { ok: false, error: res.error, unvollstaendig: false }
  }

  return {
    ok: true,
    lat: res.data.lat,
    lng: res.data.lng,
    place_id: res.data.place_id,
    formatted: res.data.formatted_address,
  }
}
