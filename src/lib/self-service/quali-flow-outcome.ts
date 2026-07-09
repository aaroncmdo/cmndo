// SP-B1: Reine Routing-Entscheidung des Flow-Quali-Gates. Komponiert SP-A
// resolveAbrechnungsweg + das bestehende bewerteSchuldfrage zu EINEM Ergebnis,
// das die admin-client-basierte Server-Action speichereQualiFlow nur noch
// ausfuehrt. Client-safe, keine Server-/DB-Imports.
import { resolveAbrechnungsweg, type Abrechnungsweg } from '@/lib/werkstatt/abrechnungsweg'
import { bewerteSchuldfrage, type QualiErgebnis } from '@/lib/self-service/quali-gate'

export type QualiFlowOutcome = {
  abrechnungsweg: Abrechnungsweg | null
  ergebnis: QualiErgebnis
  disqualifizieren: boolean
  reparaturwunsch: 'reparatur' | null
  // WS2: nur bei Kasko-Werkstattbindung gesetzt -> speichereQualiFlow labelt die Disqualifikation
  // korrekt (statt pauschal 'eigenverschulden').
  disqualifikationsGrundKey?: 'eigenverschulden' | 'werkstattbindung'
}

/**
 * Leitet aus Schuldfrage (+ Versicherungs-Folgefrage) die Flow-Quali-Entscheidung ab:
 * - gegner                          -> haftpflicht, weiter (kanonischer Flow, unveraendert)
 * - eigenverantwortung + Kasko      -> kasko, weiter + reparaturwunsch='reparatur' (Direct-Reparatur
 *                                      wie Selbstzahler; KEIN SV-Gutachten, Aaron 08.07.)
 * - eigenverantwortung ohne Kasko   -> selbstzahler, weiter + reparaturwunsch='reparatur'
 * - unklar / leer / offen           -> bestehendes bewerteSchuldfrage-Verhalten
 */
export function qualiFlowOutcome(
  schuldfrage: string | null,
  ueberEigeneVersicherung: boolean | null,
  freieWerkstattwahl: boolean | null = null,
): QualiFlowOutcome {
  const abrechnungsweg = resolveAbrechnungsweg({ schuldfrage, ueberEigeneVersicherung })
  if (abrechnungsweg === 'selbstzahler') {
    // NICHT disqualifizieren -> Werkstatt-Strecke; reparaturwunsch armiert das Gate.
    return { abrechnungsweg, ergebnis: 'weiter', disqualifizieren: false, reparaturwunsch: 'reparatur' }
  }
  if (abrechnungsweg === 'kasko') {
    // WS2 (Kasko-frei): nur bei EXPLIZITER Werkstattbindung (freieWerkstattwahl===false) abbrechen —
    // der Versicherer schreibt die Werkstatt vor, keine Vermittlung moeglich (KaskoEndansicht).
    // Freie Wahl ODER noch nicht gefragt (null) -> Werkstatt-Strecke wie Selbstzahler (Aaron 08.07.).
    if (freieWerkstattwahl === false) {
      return {
        abrechnungsweg,
        ergebnis: 'abbruch',
        disqualifizieren: true,
        reparaturwunsch: null,
        disqualifikationsGrundKey: 'werkstattbindung',
      }
    }
    return { abrechnungsweg, ergebnis: 'weiter', disqualifizieren: false, reparaturwunsch: 'reparatur' }
  }
  // haftpflicht (gegner) + null (unklar/leer/unbeantwortet): das bestehende Gate entscheidet.
  const ergebnis = bewerteSchuldfrage(schuldfrage)
  return { abrechnungsweg, ergebnis, disqualifizieren: ergebnis === 'abbruch', reparaturwunsch: null }
}
