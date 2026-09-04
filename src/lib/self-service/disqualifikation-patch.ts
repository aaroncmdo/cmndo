// src/lib/self-service/disqualifikation-patch.ts
// Der EINE Ort fuer den Disqualifikations-Schreibsatz eines Leads (bisher inline in speichereQualiFlow).
// Phase 1 Kasko-WB: der Embed-Werkstatt-Finder disqualifiziert gebundene Kunden ebenfalls -> ohne Helper
// gaebe es zwei Kopien desselben Literals. Pure, client-safe (kein DB-Import).

export type DisqualifikationsGrundKey = 'eigenverschulden' | 'werkstattbindung'

// Texte bewusst byte-identisch zum bisherigen Inline-Stand (Dispatch-Notiz, kein UI-Text).
export const DISQUALIFIKATION_GRUND_TEXT: Record<DisqualifikationsGrundKey, string> = {
  werkstattbindung:
    'Kasko mit Werkstattbindung — Reparatur nur in der vom Versicherer vorgeschriebenen Werkstatt, keine Vermittlung moeglich (Self-Service-Quali)',
  eigenverschulden:
    'Eigenverschulden — Gutachterkosten nicht über die gegnerische Haftpflicht regulierbar (Self-Service-Quali)',
}

export function buildDisqualifikationPatch(grundKey: DisqualifikationsGrundKey, nowIso: string): Record<string, unknown> {
  return {
    disqualifiziert: true,
    disqualifiziert_am: nowIso,
    disqualifiziert_grund_key: grundKey,
    disqualifiziert_grund: DISQUALIFIKATION_GRUND_TEXT[grundKey],
    status: 'disqualifiziert',
  }
}
