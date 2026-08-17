import type { Stadt } from './staedte'

// Der Weg von einer Stadtseite in den Karten-Finder.
//
// WARUM mit Parametern: Alle 92 Stadtseiten verlinkten `/gutachter-finden`
// nackt. Wer auf "Kfz-Gutachter Koeln" den Karten-CTA drueckte, landete auf dem
// NRW-Default mit Geolocation-Prompt — der Ortsbezug, wegen dem er geklickt hat,
// ging genau an der Stelle verloren.
//
// WARUM lat/lng UND stadt: Die Finder-Seite nimmt `?lat&lng` direkt und
// geocodet nur ersatzweise `?stadt` ueber Mapbox (5 s Timeout, kostenpflichtig).
// Unsere Koordinaten sind gepflegt und praeziser als ein Mapbox-Rateversuch,
// also gewinnt der schnelle Pfad. Der Name bleibt trotzdem in der URL: er macht
// sie lesbar, taugt fuer Auswertungen, und falls jemand die Koordinaten
// entfernt, greift der Geocode-Fallback mit einem sinnvollen Wert statt mit
// einem Slug.
//
// P3-A6. Die urspruengliche Spec-Idee (Stadt-Links AUF der Finder-Seite) waere
// gegen eine dokumentierte Entscheidung gelaufen: die Seite ist ein
// 100dvh-Embed, "bewusst KEIN Content darunter (sauberer Mobile-Scroll)".

/** Finder-Link mit dem Ortsbezug der aufrufenden Stadtseite. */
export function finderHrefFuerStadt(stadt: Pick<Stadt, 'name' | 'lat' | 'lng'>): string {
  const params = new URLSearchParams({
    stadt: stadt.name,
    lat: String(stadt.lat),
    lng: String(stadt.lng),
  })
  return `/gutachter-finden?${params.toString()}`
}
