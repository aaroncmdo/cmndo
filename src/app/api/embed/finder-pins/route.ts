// Dead-Pins (Tier-3 sv_leads) je KARTENAUSSCHNITT — nachgeladen statt im HTML mitgeliefert.
//
// WARUM: Gemessen am 09.09.2026 auf prod (375x812, 400 kbit/s): das Embed-HTML war 1.213 kB
// entpackt, davon 1.174 kB RSC-Payload mit 9.712 Koordinaten-Paaren = die Dead-Pins als
// `svLeads`-Prop. Der erste Pixel kam nach 12,6 s, das Dokument war erst nach 26,5 s da,
// bedienbar nach 33 s. Aaron: "34 Sekunden, das funktioniert leider nicht … einfach nur den
// Ausschnitt, der angezeigt wird, laden".
//
// WAS: Die Karte fragt beim Start und nach jeder Bewegung (moveend, entprellt) den sichtbaren
// Ausschnitt an. Unter dem Zoom-Umschlag (Heatmap) genuegen Koordinaten OHNE id als kompakte
// Tupel — der Deutschland-Ausschnitt schrumpft damit von 1,15 MB auf ~80 kB komprimiert und
// die Heatmap sieht aus wie vorher. Ab dem Umschlag (Einzelpins) kommen die Punkte MIT id, weil
// der Klick auf einen Pin (Wunschtermin) und die 15-km-Zaehlung sie brauchen.
//
// CACHE: Rohdaten eine Stunde im Prozess (Muster lib/cardentity/client.ts + finder-abdeckung),
// der Ausschnitt-Filter laeuft im Speicher — keine Datenbank-Anfrage pro Kartenbewegung.
// Bewusst `force-dynamic` (kein revalidate): ein statischer Handler wuerde beim Build
// vorgerendert, ohne Laufzeit-Umgebung (siehe finder-abdeckung/route.ts).

import { NextResponse } from 'next/server'
import { ladeSvLeads, type SvLeadPublic } from '@/lib/actions/gutachter-finder-actions'
import { ZOOM_UMSCHLAG } from '@/app/embed/gutachter-finder/_components/deadpin-layer'

export const dynamic = 'force-dynamic'

const CACHE_MS = 60 * 60 * 1000
// Ab hier liefern wir ids — genau ab dem Umschlag, ab dem die Symbol-Ebene sichtbar und
// klickbar wird. Gemessen 09.09. auf prod: der Start-Zoom des Embeds ist 8.5; mit der
// frueheren Grenze ZOOM_UMSCHLAG-0.5 kamen dort 2.515 Objekte mit id (193 kB), obwohl die
// Heatmap keine ids braucht. Tupel sind ein Viertel davon.
const ZOOM_MIT_ID = ZOOM_UMSCHLAG

let cache: { pins: SvLeadPublic[]; expiresAt: number } | null = null

async function rohdaten(): Promise<SvLeadPublic[] | null> {
  if (!cache || cache.expiresAt <= Date.now()) {
    const res = await ladeSvLeads()
    if (!res.ok) {
      console.error('[finder-pins] ladeSvLeads fehlgeschlagen:', res.error)
      return null // Fehlschlag NICHT cachen
    }
    cache = { pins: res.data, expiresAt: Date.now() + CACHE_MS }
  }
  return cache.pins
}

const leer = () => NextResponse.json({ pins: [] }, { status: 200 })

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const bbox = (params.get('bbox') ?? '').split(',').map(Number)
  const zoom = Number(params.get('zoom') ?? '0')
  // Ungueltige Anfrage → leere Liste mit 200: Die Karte ist ohne Dead-Pins voll bedienbar,
  // ein 4xx liesse den Finder als kaputt erscheinen.
  if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n)) || !Number.isFinite(zoom)) return leer()
  const [w, s, e, n] = bbox
  if (s > n || w > e) return leer()

  const alle = await rohdaten()
  if (!alle) return leer()

  const imAusschnitt = alle.filter((p) => p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e)
  const pins: SvLeadPublic[] | Array<[number, number]> =
    zoom >= ZOOM_MIT_ID
      ? imAusschnitt
      : // 4 Dezimalen ≈ 11 m — fuer eine Heatmap mehr als genug, spart ~40 % Bytes.
        imAusschnitt.map((p) => [Math.round(p.lat * 1e4) / 1e4, Math.round(p.lng * 1e4) / 1e4] as [number, number])

  return NextResponse.json(
    { pins },
    {
      status: 200,
      headers: {
        // Der Ausschnitt variiert pro Bewegung — ein Browser-Cache pro URL reicht; die Pins
        // aendern sich nur, wenn ein Lead dazukommt.
        'Cache-Control': 'public, max-age=600, stale-while-revalidate=600',
      },
    },
  )
}
