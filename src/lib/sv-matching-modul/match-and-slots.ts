// AAR-941 / Engine-Unifikation: matchAndSlots ist seit dem Fixer→Engine-Cutover ein
// THIN-WRAPPER auf planeTerminOeffentlich.
//
// Hintergrund: der GLOBAL-Case ging via #2551 bereits direkt auf planeTerminOeffentlich;
// danach war der SV-Embed-FIXER-Case (self-service-actions.ts:155, fixerSvId) der letzte
// Consumer, der noch über das alte onboarding-`ladeFreieSlots` → busy-slots → cache-busy
// lief. planeTerminOeffentlich kann den Fixer jetzt selbst (engine `freieSlots`/v_belegung:
// Buchungen ∪ externe Kalender-Busy ∪ Ausnahmen, Reachability + now-Floor) → matchAndSlots
// delegiert nur noch. Rückgabe + Leak-Schutz (OeffentlichesSvProfil[]) unverändert → KEIN
// Consumer-Change; der cache-busy-Pfad ist aus dem Matching raus.

import { planeTerminOeffentlich } from './plane-termin-oeffentlich'
import type { OeffentlichesSvProfil } from './types'

export type MatchAndSlotsInput = {
  /** Besichtigungsort. */
  lat: number
  lng: number
  /** Optionaler Wunschtermin (ISO/UTC) — Slot-Ranking. */
  wunschterminIso?: string | null
  /** SV-Weiche: gesetzt = SV-Embed → nur dieser SV. */
  fixerSvId?: string | null
  /** AAR-956 17.07.: Betrachter-Identitaet fuer den Test-SV-Angebots-Guard (Fixer-Pfad). */
  kundenIdentitaet?: { email?: string | null; name?: string | null } | null
  /** @deprecated ungenutzt seit Engine-Cutover (global = 2+1, fixer = 1 SV). */
  topN?: number
}

/**
 * @deprecated Thin-Wrapper auf `planeTerminOeffentlich` — neue Call-Sites importieren
 * diese direkt. Bleibt für die bestehende Fixer-Call-Site (mergeFixerUndAlternativen).
 */
export async function matchAndSlots(input: MatchAndSlotsInput): Promise<OeffentlichesSvProfil[]> {
  return planeTerminOeffentlich({
    lat: input.lat,
    lng: input.lng,
    wunschterminIso: input.wunschterminIso ?? null,
    fixerSvId: input.fixerSvId ?? null,
    kundenIdentitaet: input.kundenIdentitaet ?? null,
  })
}
