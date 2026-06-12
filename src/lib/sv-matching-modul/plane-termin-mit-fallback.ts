// AAR-956 (Aaron 12.06.): Partner-vs-Dead-Pin-Diskriminierung IN DER ENGINE verankert —
// EINE Quelle für Karte (empfehleSvFuerOrt), Buchung + /flow, statt eines Embed-lokalen
// Duplikats. Reiner Combinator über die 2 bestehenden Primitive (planeTerminOeffentlich +
// ladeDeadPinFallback) — ändert KEINES davon (additiv, ab96fed4-Footprint unberührt).
//
// Regel (Aaron 12.06., „nur Isochrone, KEIN Radius"):
//   Partner zählt NUR, wenn der Ort in seiner ISOCHRONE (echte Fahrzeit-Zuständigkeit) liegt.
//   Der Luftlinien-Radius (paket_umkreis_km) wird fürs Matching NICHT mehr benutzt — ein
//   Partner, der den Ort nur über den Radius „erreicht" (außerhalb seiner Isochrone), ist NICHT
//   zuständig und wird NICHT vorgeschlagen. SVs ganz ohne Isochrone matchen nicht (Daten-Fehler
//   → Isochrone wird beim Profil-Speichern erzeugt). paket_umkreis_km bleibt nur die Eingabe-
//   GRÖSSE für die Isochrone-Generierung (calculateIsochrone), nicht das Match-Kriterium.
//
//   ≥1 zuständiger Partner mit Slot → { kind:'partner';  svs }   (svs[0] = engine-ranked Top)
//   sonst                          → { kind:'fallback'; deadPins } (Dead-Pins, deren 15-km-
//                                                                   Isochrone den Ort deckt)
// Echte (zuständige) Partner haben IMMER Vorrang — ein Dead-Pin verdrängt nie einen solchen.

import { createAdminClient } from '@/lib/supabase/admin'
import { parseIsochrone } from '@/lib/dispatch/isochrone-parse'
import { pointInPolygon } from '@/lib/termine/engine'
import { planeTerminOeffentlich, type PlaneTerminOeffentlichInput } from './plane-termin-oeffentlich'
import { ladeDeadPinFallback } from './lade-deadpin-fallback'
import type { OeffentlichesSvProfil } from './types'
import type { DeadPinOeffentlich } from './fallback'

export type PlaneTerminMitFallbackResult =
  | { kind: 'partner'; svs: OeffentlichesSvProfil[] }
  | { kind: 'fallback'; deadPins: DeadPinOeffentlich[] }

/**
 * Filtert die (auch Radius-)gematchten Partner auf die ISOCHRONE-zuständigen: der Ort muss im
 * Isochrone-Polygon des SV liegen. KEIN Radius-Fallback (Aaron 12.06.) — ein SV ohne gültiges
 * Isochrone-Polygon matcht nicht (wird geloggt, Daten-Problem). Reihenfolge (Engine-Ranking) bleibt.
 */
async function filtereZustaendige(
  svs: OeffentlichesSvProfil[],
  lat: number,
  lng: number,
): Promise<OeffentlichesSvProfil[]> {
  if (svs.length === 0) return svs
  const db = createAdminClient()
  const { data, error } = await db
    .from('sachverstaendige')
    .select('id, isochrone_polygon')
    .in('id', svs.map((s) => s.svId))
  if (error) {
    console.error('[planeTerminMitFallback] Isochrone-Lookup:', error.message)
    return svs // fail-open: lieber die Engine-Auswahl als gar nichts
  }
  const meta = new Map((data ?? []).map((r) => [r.id as string, r]))
  return svs.filter((s) => {
    const poly = parseIsochrone(meta.get(s.svId)?.isochrone_polygon)
    if (poly && poly.length >= 3) return pointInPolygon([lng, lat], poly)
    console.warn(`[planeTerminMitFallback] SV ${s.svId} ohne gültige Isochrone → nicht zuständig (kein Radius-Fallback)`)
    return false
  })
}

/**
 * Diskriminierte Termin-Planung: zuständige Partner zuerst, sonst Dead-Pin-Fallback.
 * `svs[0]` (im partner-Fall) ist der engine-ranked Top der ISOCHRONE-zuständigen — derselbe,
 * den der Buchungs-Step (SvSlotAuswahl) als #1/„empfohlen" zeigt → Karten-Route + Buchung
 * stimmen überein. Im fallback-Fall kann `deadPins` leer sein (weder zuständiger Partner noch
 * deckender Dead-Pin).
 */
export async function planeTerminMitFallback(
  input: PlaneTerminOeffentlichInput,
): Promise<PlaneTerminMitFallbackResult> {
  const svsRoh = await planeTerminOeffentlich(input)
  const svs = await filtereZustaendige(svsRoh, input.lat, input.lng)
  if (svs.some((s) => s.slots.length > 0)) return { kind: 'partner', svs }
  const deadPins = await ladeDeadPinFallback({ lat: input.lat, lng: input.lng })
  return { kind: 'fallback', deadPins }
}
