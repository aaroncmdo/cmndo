'use server'

// AAR-262: Server-side Geocoding-Fallback wenn der Dispatcher die
// Besichtigungsadresse als Freitext eingibt (nicht via Google-Places-
// Dropdown). Ohne Koordinaten kann der SV-Vorschläge-Button nicht
// arbeiten — die Page wäre blockiert.

import { createClient } from '@/lib/supabase/server'

export async function geocodeAndSaveBesichtigung(
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
