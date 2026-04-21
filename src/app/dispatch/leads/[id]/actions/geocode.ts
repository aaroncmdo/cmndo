'use server'

// AAR-262: Server-side Geocoding-Fallback wenn der Dispatcher die
// Unfallort-Adresse als Freitext eingibt (nicht via Google-Places-
// Dropdown). Der Name der Funktion war historisch `geocodeAndSaveBesichtigung`
// — missverständlich, weil tatsächlich auf `unfallort_*` geschrieben wird.
// Semantik-Fix 2026-04-21: der Unfallort ist nur für die Unfallskizze
// relevant; SV-Dispatch nutzt jetzt primär `besichtigungsort_*`, fällt aber
// auf `unfallort_*` zurück wenn letzterer leer ist (Legacy-Leads). Deshalb
// darf diese Action weiter auf unfallort schreiben — sie geocoded einen
// Unfallort-Freitext, keinen Besichtigungsort.

import { createClient } from '@/lib/supabase/server'

/**
 * Geocodiert einen Unfallort-Freitext und persistiert Adresse + Koordinaten
 * in `leads.unfallort*`. Wird von Phase 2 aufgerufen wenn der Dispatcher
 * die Adresse tippt statt aus dem Google-Places-Dropdown auszuwählen.
 */
export async function geocodeAndSaveUnfallort(
  leadId: string,
  adresse: string,
): Promise<{ success: boolean; lat?: number; lng?: number; error?: string }> {
  const cleaned = adresse.trim()
  if (!cleaned) return { success: false, error: 'Adresse leer' }

  const key = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  if (!key) return { success: false, error: 'Google Maps API Key fehlt' }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleaned)}&region=de&key=${key}`
    const resp = await fetch(url)
    const data = await resp.json()
    if (data.status !== 'OK' || !data.results?.length) {
      return { success: false, error: `Geocoding fehlgeschlagen: ${data.status}` }
    }
    const loc = data.results[0].geometry?.location
    if (!loc) return { success: false, error: 'Keine Koordinaten in Geocoding-Antwort' }

    const lat = Number(loc.lat)
    const lng = Number(loc.lng)
    const formatted = String(data.results[0].formatted_address ?? cleaned)

    const supabase = await createClient()
    const { error: updErr } = await supabase
      .from('leads')
      .update({
        unfallort: formatted,
        unfallort_lat: lat,
        unfallort_lng: lng,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)

    if (updErr) return { success: false, error: updErr.message }
    return { success: true, lat, lng }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Geocoding-Exception' }
  }
}
