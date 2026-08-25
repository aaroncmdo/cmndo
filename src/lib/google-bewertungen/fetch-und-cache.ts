// AAR-956: Geteilter Google-Bewertungs-Fetch + Cache-Upsert.
// Eine Quelle für (1) den nächtlichen Cron `/api/cron/google-bewertungen` UND
// (2) die SV-Selbst-Verknüpfung (verknuepfeGoogleBusiness) — damit die Sterne
// SOFORT erscheinen, sobald ein SV sein Google-Business-Profil hinterlegt,
// statt erst beim nächsten Cron-Lauf.
//
// Liest `profiles.google_place_id` (key = profile_id) → Places Details API →
// schreibt durchschnitt/anzahl/photo_reference in `google_bewertungen_cache`.

import { createAdminClient } from '@/lib/supabase/admin'
import { meldeGoogleFehler } from '@/lib/google-maps/melde-fehler'

const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place/details/json'

export type BewertungErgebnis =
  | { ok: true; durchschnitt: number | null; anzahl: number | null }
  | { ok: false; error: string }

/**
 * Holt Rating + Anzahl für `placeId` von der Places Details API und upsertet sie
 * in `google_bewertungen_cache` (onConflict profile_id). Best-effort: bei API-/
 * DB-Fehler wird `{ ok:false }` zurückgegeben — der Caller entscheidet, ob das
 * fatal ist (Cron: skip+weiter; SV-Verknüpfung: non-fatal, Cron zieht nach).
 */
export async function fetchUndCacheGoogleBewertung(
  profileId: string,
  placeId: string,
): Promise<BewertungErgebnis> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return { ok: false, error: 'GOOGLE_PLACES_API_KEY nicht konfiguriert' }

  try {
    const url = `${PLACES_API_BASE}?place_id=${encodeURIComponent(placeId)}&fields=rating,user_ratings_total,photos&key=${apiKey}`
    const res = await fetch(url)
    const json = (await res.json()) as {
      status: string
      result?: {
        rating?: number
        user_ratings_total?: number
        photos?: Array<{ photo_reference: string }>
      }
    }

    if (json.status !== 'OK' || !json.result) {
      // Kontingent erschoepft oder Zugang verweigert? Das darf nicht nur im
      // pm2-Log stehen — der Health-Check `google-maps-zugang` liest das hier.
      await meldeGoogleFehler('places-details (Bewertungen)', json.status, `profil ${profileId}`)
      return { ok: false, error: `Places API: ${json.status}` }
    }

    const durchschnitt = json.result.rating ?? null
    const anzahl = json.result.user_ratings_total ?? null

    const admin = createAdminClient()
    const { error } = await admin.from('google_bewertungen_cache').upsert(
      {
        profile_id: profileId,
        durchschnitt,
        anzahl_bewertungen: anzahl,
        photo_reference: json.result.photos?.[0]?.photo_reference ?? null,
        zuletzt_aktualisiert_am: new Date().toISOString(),
      },
      { onConflict: 'profile_id' },
    )
    if (error) return { ok: false, error: error.message }

    return { ok: true, durchschnitt, anzahl }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Fetch-Fehler' }
  }
}
