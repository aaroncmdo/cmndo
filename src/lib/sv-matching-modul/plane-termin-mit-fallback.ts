// AAR-956 (Aaron 12.06.): Partner-vs-Dead-Pin-Diskriminierung IN DER ENGINE verankert —
// EINE Quelle für Karte (empfehleSvFuerOrt), Buchung + /flow, statt eines Embed-lokalen
// Duplikats. Reiner Combinator über die 2 bestehenden Primitive (planeTerminOeffentlich +
// ladeDeadPinFallback) — ändert KEINES davon (additiv, ab96fed4-Footprint unberührt).
//
// Regel (= exakt der bisherige Embed-Diskriminator):
//   ≥1 Partner mit buchbarem Slot → { kind:'partner';  svs }   (svs[0] = engine-ranked Top)
//   0 buchbare Partner            → { kind:'fallback'; deadPins } (Dead-Pins, deren 15-km-
//                                                                   Ghost-Isochrone den Ort deckt)
// Echte Partner haben IMMER Vorrang — ein Dead-Pin verdrängt nie einen buchbaren Partner.

import { planeTerminOeffentlich, type PlaneTerminOeffentlichInput } from './plane-termin-oeffentlich'
import { ladeDeadPinFallback } from './lade-deadpin-fallback'
import type { OeffentlichesSvProfil } from './types'
import type { DeadPinOeffentlich } from './fallback'

export type PlaneTerminMitFallbackResult =
  | { kind: 'partner'; svs: OeffentlichesSvProfil[] }
  | { kind: 'fallback'; deadPins: DeadPinOeffentlich[] }

/**
 * Diskriminierte Termin-Planung: echte Partner zuerst, sonst Dead-Pin-Fallback.
 * `svs[0]` (im partner-Fall) ist der engine-ranked Top-SV — derselbe, den der Buchungs-
 * Step (SvSlotAuswahl) als #1/„empfohlen" zeigt → Karten-Route + Buchung stimmen überein.
 * Im fallback-Fall kann `deadPins` leer sein (weder Partner noch deckender Dead-Pin).
 */
export async function planeTerminMitFallback(
  input: PlaneTerminOeffentlichInput,
): Promise<PlaneTerminMitFallbackResult> {
  const svs = await planeTerminOeffentlich(input)
  if (svs.some((s) => s.slots.length > 0)) return { kind: 'partner', svs }
  const deadPins = await ladeDeadPinFallback({ lat: input.lat, lng: input.lng })
  return { kind: 'fallback', deadPins }
}
