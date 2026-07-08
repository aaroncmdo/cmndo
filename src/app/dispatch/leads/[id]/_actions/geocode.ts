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
//
// 2026-07-08: Geocoding via geocodeMitFallback (Mapbox-first) statt inline-Google. Der frühere
// inline-Google-Call schlug server-seitig mit REQUEST_DENIED fehl: die Geocoding-API ist für
// unseren Browser-Key nicht aktiviert und es gibt keinen GOOGLE_MAPS_SERVER_KEY -> Fallback auf
// den referrer-beschränkten NEXT_PUBLIC-Key. Gleiche Ursache + Fix wie #3904 (addPrivatStop).

import { createClient } from '@/lib/supabase/server'
import { geocodeMitFallback } from '@/lib/termine/engine/geocode'

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

  // Kanonischer Produktions-Geocoder (Mapbox-first, Google-Fallback) — dieselbe Funktion wie
  // Termin-Engine + addPrivatStop. Liefert null bei Fehler/leerem Ergebnis (kein throw).
  const geo = await geocodeMitFallback(cleaned)
  if (!geo) return { success: false, error: 'Adresse nicht geocodierbar' }

  const supabase = await createClient()
  const { error: updErr } = await supabase
    .from('leads')
    .update({
      unfallort: geo.adresse ?? cleaned,
      unfallort_lat: geo.lat,
      unfallort_lng: geo.lng,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (updErr) return { success: false, error: updErr.message }
  return { success: true, lat: geo.lat, lng: geo.lng }
}
