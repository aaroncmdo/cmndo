// Die vereinte Abdeckungsflaeche des Gutachter-Finders — nachgeladen statt mitgeliefert.
//
// WARUM ES DIESE ROUTE GIBT: Die Flaeche wurde bisher server-seitig berechnet und als
// Prop in den RSC-Payload der Embed-Seite geschrieben. Gemessen am 06.09.2026 auf prod:
//
//   HTML gesamt        1.653 kB
//   davon RSC-Payload  1.605 kB   (97 %)
//   darin              19.252 Koordinaten-Paare
//
// Bei gedrosseltem Mobilfunk (~400 kbit/s) braucht allein dieses Dokument rund 33
// Sekunden. Nach 10 Sekunden war auf dem Bildschirm genau ein Element sichtbar: der
// Sprung-Link. Der Nutzer sieht einen Ladespinner und geht — die Abdeckungsflaeche, die
// er nie zu Gesicht bekommt, hat ihn daran gehindert, ueberhaupt eine Adresse einzugeben.
//
// Die Flaeche ist KONTEXT, kein Bedienelement: Sie zeigt, wo Partner arbeiten. Sie darf
// deshalb nachkommen, nachdem die Oberflaeche bedienbar ist.
//
// WARUM CACHEBAR: Die Abdeckung aendert sich nur, wenn ein Sachverstaendiger dazukommt
// oder sein Einzugsgebiet wechselt — nicht pro Aufruf. Eine Stunde Cache spart die
// Neuberechnung (turf-union ueber alle Partner-Isochronen) bei jedem Seitenaufruf.

import { NextResponse } from 'next/server'
import { ladeAktiveSVs } from '@/lib/actions/gutachter-finder-actions'
import { unionIsochrones } from '@/lib/mapbox/union-isochrones'

// Die Daten stammen aus der Datenbank, nicht aus dem Request → kein Grund, pro Aufruf
// neu zu rendern. `revalidate` haelt das Ergebnis eine Stunde.
export const revalidate = 3600

export async function GET() {
  const res = await ladeAktiveSVs()
  if (!res.ok) {
    // Bewusst 200 mit leerer Flaeche statt 5xx: Die Karte ist ohne Abdeckung voll
    // bedienbar. Ein Fehler hier darf den Finder nicht als kaputt erscheinen lassen.
    console.error('[finder-abdeckung] ladeAktiveSVs fehlgeschlagen')
    return NextResponse.json({ abdeckung: null }, { status: 200 })
  }

  const abdeckung = unionIsochrones(res.data.map((s) => s.isochrone_polygon))

  return NextResponse.json(
    { abdeckung },
    {
      status: 200,
      headers: {
        // Eine Stunde frisch, danach eine weitere Stunde stale ausliefern waehrend im
        // Hintergrund neu gebaut wird — der Nutzer wartet nie auf die Neuberechnung.
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=3600',
        // KEIN CORS-Header noetig: Der Abruf kommt aus dem Embed, und der laeuft selbst
        // auf app.claimondo.de — also dieselbe Origin wie diese Route. Cross-origin ist
        // nur das VERHAELTNIS iframe↔Elternseite, nicht dieser Abruf.
      },
    },
  )
}
