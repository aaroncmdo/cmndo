// AAR-381: Helper für Einzelnavigation via Google Maps (extern).
//
// Kein Tracking, kein State-Update — reiner externer Link für Spontaneität
// (z. B. SV sitzt schon im Auto und will einen einzelnen Stop anfahren).

export interface GoogleMapsTerminInput {
  besichtigungsort_adresse: string | null
  besichtigungsort_place_id: string | null
  besichtigungsort_lat: number | null
  besichtigungsort_lng: number | null
  /** Fallback-Adresse wenn besichtigungsort_* fehlt. */
  schadens_adresse?: string | null
  schadens_plz?: string | null
  schadens_ort?: string | null
}

export interface SvOrigin {
  lat: number | null
  lng: number | null
}

/**
 * Baut den Google-Maps-Directions-URL. Präferenz:
 *   1. besichtigungsort_place_id (höchste Präzision)
 *   2. besichtigungsort_lat/lng
 *   3. besichtigungsort_adresse
 *   4. schadens_* Fallback-Adresse
 */
export function googleMapsLink(
  termin: GoogleMapsTerminInput,
  origin: SvOrigin | null = null,
): string {
  const params = new URLSearchParams()
  params.set('api', '1')
  params.set('travelmode', 'driving')

  if (origin?.lat != null && origin?.lng != null) {
    params.set('origin', `${origin.lat},${origin.lng}`)
  }

  if (termin.besichtigungsort_place_id) {
    params.set('destination_place_id', termin.besichtigungsort_place_id)
    // destination ist bei place_id trotzdem Pflicht → Adresse als Backup
    if (termin.besichtigungsort_adresse) {
      params.set('destination', termin.besichtigungsort_adresse)
    } else if (termin.besichtigungsort_lat && termin.besichtigungsort_lng) {
      params.set(
        'destination',
        `${termin.besichtigungsort_lat},${termin.besichtigungsort_lng}`,
      )
    }
  } else if (
    termin.besichtigungsort_lat != null &&
    termin.besichtigungsort_lng != null
  ) {
    params.set(
      'destination',
      `${termin.besichtigungsort_lat},${termin.besichtigungsort_lng}`,
    )
  } else if (termin.besichtigungsort_adresse) {
    params.set('destination', termin.besichtigungsort_adresse)
  } else {
    const fallback = [
      termin.schadens_adresse,
      termin.schadens_plz,
      termin.schadens_ort,
    ]
      .filter(Boolean)
      .join(', ')
    params.set('destination', fallback || 'Germany')
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`
}
