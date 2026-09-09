'use client'

// Lazy-Variante von `./client` — mapbox-gl wird NICHT statisch importiert, sondern
// erst beim ersten Aufruf nachgeladen.
//
// WARUM (gemessen 09.09.2026 auf prod, /gutachter-finden mobil):
// mapbox-gl ist EIN Chunk von 1.698 kB — bei 2.808 kB Gesamt-JS des Embeds also
// 60 % der Last. Weil `./client` ihn auf Modul-Ebene importiert und FinderMap
// dieses Modul statisch zog, hing der Chunk im STATISCHEN Graph der Seite: React
// hydriert erst, wenn er geladen UND geparst ist. Folge: das Adressfeld war auf
// einem 4G-Profil (4 Mbit/s, 100 ms RTT, CPU 4x) erst nach 25,7 s tippbar,
// obwohl es nach 6,1 s sichtbar war. Der Nutzer sieht ein Eingabefeld, das
// 19 Sekunden lang nichts annimmt — genau der Zustand, in dem Anzeigen-Traffic
// abspringt ([[AUDIT-anzeigen-ohne-leads-landingpage-11-sekunden]]).
//
// Mit `await import()` wird mapbox-gl ein eigener, nachgeladener Chunk. Die
// Hydration braucht ihn nicht mehr; die Karte erscheint danach.
//
// ABGRENZUNG: `./client` bleibt unveraendert fuer die drei Karten, bei denen die
// Karte selbst der Seiteninhalt ist (Admin-Vertrieb, Werkstatt-Finder-Shell,
// LiveOps). Dort gibt es nichts, was frueher bedienbar waere — der Umbau haette
// dort keinen Nutzen, aber Risiko. Wer eine dieser Seiten spaeter umstellt,
// nutzt dieses Modul; zwei Wege zu mapbox-gl sind unkritisch, Webpack liefert
// dieselbe Modul-Instanz.
//
// WICHTIG (wie in `./client`): nur der Public-Token (pk.) darf ins Browser-Bundle.

import type mapboxglTyp from 'mapbox-gl'

type MapboxNamespace = typeof mapboxglTyp

let geladen: MapboxNamespace | null = null
let laufend: Promise<MapboxNamespace | null> | null = null

/**
 * Laedt mapbox-gl nach und setzt den Public-Token. Idempotent: mehrfache Aufrufe
 * teilen sich denselben Ladevorgang und liefern dieselbe Instanz.
 *
 * Liefert `null`, wenn `NEXT_PUBLIC_MAPBOX_TOKEN` fehlt — identisch zum Verhalten
 * von `ensureMapboxInitialized()` in `./client` (kein Wurf, damit der Build gruen
 * bleibt und der Aufrufer einen sichtbaren Fehlzustand rendern kann).
 */
export async function ladeMapbox(): Promise<MapboxNamespace | null> {
  if (geladen) return geladen
  if (laufend) return laufend

  laufend = (async () => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) {
      console.warn('[mapbox] NEXT_PUBLIC_MAPBOX_TOKEN fehlt — Karte wird nicht initialisiert')
      return null
    }
    const modul = await import('mapbox-gl')
    // Interop: je nach Bundler liegt der Namespace unter `default` oder direkt am Modul.
    const gl = ((modul as unknown as { default?: MapboxNamespace }).default ??
      (modul as unknown as MapboxNamespace))
    gl.accessToken = token
    geladen = gl
    return gl
  })()

  const ergebnis = await laufend
  // Fehlschlag nicht einbrennen: ein spaeterer Aufruf darf es erneut versuchen.
  if (!ergebnis) laufend = null
  return ergebnis
}
