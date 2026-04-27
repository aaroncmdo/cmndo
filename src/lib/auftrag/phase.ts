// CMM-23: SV-Auftrags-Lebenszyklus.
//
// Aaron-Spec: drei Phasen, mit Gutachten-Upload ist der Auftrag durch.
// Danach geht der Lifecycle in den "Fall"-Lebenszyklus über (KB-QC,
// Kanzleipaket, Regulierung) — der SV sieht da nur noch eine schlanke
// Status-View ("Mein Fall") mit Auszahlung + LexDrive-Link.
//
// Phase-Mapping (in Reihenfolge der Auswertung):
//
//   1. termin          — Termin steht aus (kein Termin / reserviert /
//                        gegenvorschlag), oder Termin bestätigt aber Tag
//                        des Termins nicht erreicht
//   2. besichtigung    — Tag des Termins läuft (sv_unterwegs / sv_angekommen
//                        / Termin innerhalb des +/- 2h-Fensters), Gutachten
//                        noch nicht hochgeladen
//   3. gutachten       — Termin durchgeführt, Gutachten noch ausstehend
//                        ODER Upload läuft
//   4. abgeschlossen   — Gutachten finalisiert (gutachten_eingegangen_am +
//                        gutachten_final_freigegeben). Ab hier "Mein Fall".

export type AuftragsPhase = 'termin' | 'besichtigung' | 'gutachten' | 'abgeschlossen'

export type AuftragPhaseInput = {
  /** ISO timestamp wann der Termin stattfindet — gutachter_termine.start_zeit */
  terminStart: string | null
  /** Status des aktiven Termins. */
  terminStatus: 'reserviert' | 'gegenvorschlag' | 'bestaetigt' | 'durchgefuehrt' | 'storniert' | 'abgelehnt' | string | null
  /** SV ist losgefahren (gutachter_termine.kunde_losgefahren_am — wir nutzen das Pendant fürs SV-Tracking). */
  svUnterwegsSeit: string | null
  /** SV ist angekommen (gutachter_termine.kunde_angekommen_am). */
  svAngekommenAm: string | null
  /** Termin durchgeführt (gutachter_termine.durchgefuehrt_am). */
  terminDurchgefuehrtAm: string | null
  /** Gutachten ist eingegangen (faelle.gutachten_eingegangen_am). */
  gutachtenEingegangenAm: string | null
  /** Gutachten wurde final vom KB freigegeben — ab hier "Fall". */
  gutachtenFinalFreigegeben: boolean | null
}

const FENSTER_VOR_MS = 60 * 60 * 1000          // 1h vor Termin
const FENSTER_NACH_MS = 4 * 60 * 60 * 1000     // 4h nach Termin

export function getAuftragsPhase(input: AuftragPhaseInput): AuftragsPhase {
  // 4. abgeschlossen — Gutachten freigegeben
  if (input.gutachtenFinalFreigegeben) return 'abgeschlossen'

  // 3. gutachten — Termin ist gelaufen, Gutachten kommt noch
  if (input.terminDurchgefuehrtAm || input.gutachtenEingegangenAm) {
    return 'gutachten'
  }

  // 2. besichtigung — SV ist live unterwegs / vor Ort, oder Termin ist im
  // Zeitfenster +/- 2h.
  if (input.svUnterwegsSeit || input.svAngekommenAm) return 'besichtigung'

  if (input.terminStart && input.terminStatus === 'bestaetigt') {
    const t = new Date(input.terminStart).getTime()
    const now = Date.now()
    if (now >= t - FENSTER_VOR_MS && now <= t + FENSTER_NACH_MS) {
      return 'besichtigung'
    }
  }

  // 1. termin — Default
  return 'termin'
}

/** Display-Labels für den Stepper. */
export const AUFTRAGS_PHASE_LABEL: Record<AuftragsPhase, string> = {
  termin: 'Termin',
  besichtigung: 'Besichtigung',
  gutachten: 'Gutachten',
  abgeschlossen: 'Abgeschlossen',
}

/** Index einer Phase im Stepper (0-3). */
export const AUFTRAGS_PHASE_INDEX: Record<AuftragsPhase, number> = {
  termin: 0,
  besichtigung: 1,
  gutachten: 2,
  abgeschlossen: 3,
}
