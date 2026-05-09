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
    // Termin liegt in der Vergangenheit (> 4h), SV hat Besichtigung nicht
    // über App abgehakt → wir nehmen an dass sie stattgefunden hat und
    // zeigen Phase "gutachten" (GutachtenUploadBanner statt leerem Termin-State).
    if (now > t + FENSTER_NACH_MS) {
      return 'gutachten'
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

// ─── CMM-23 Fall-Lifecycle ────────────────────────────────────────────────
//
// Post-Auftrag-Phasen für die SV-"Mein Fall"-View. Aaron-Spec:
//
//   gutachten-freigegeben — KB hat das Gutachten freigegeben, geht raus zur
//                           Kanzlei. SV sieht Freigabe-Status + Gutachten.
//   bei-kanzlei            — Mandat liegt bei der Kanzlei. SV sieht den
//                           LexDrive-Deep-Link zum konkreten Vorgang.
//   stellungnahme          — Edge-Case: KB hat eine technische Stellungnahme
//                           angefordert. SV muss reagieren.
//   nachbesichtigung       — Edge-Case: Kunde / Kanzlei verlangt Nach-
//                           besichtigung mit dem SV.
//   auszahlung             — Honorar-Auszahlung läuft / ist eingegangen.
//   abgeschlossen-fall     — Fall ist final, SV sieht read-only.

export type FallPhase =
  | 'gutachten-freigegeben'
  | 'bei-kanzlei'
  | 'stellungnahme'
  | 'nachbesichtigung'
  | 'auszahlung'
  | 'abgeschlossen-fall'

export type SvLifecyclePhase = AuftragsPhase | FallPhase

export type FallPhaseInput = AuftragPhaseInput & {
  /** KB hat das Gutachten freigegeben. */
  gutachtenFinalFreigegeben: boolean | null
  /** Mandat ist bei der Kanzlei (Webhook von LexDrive oder manuell vom KB). */
  lexdriveCaseId: string | null
  /** Technische Stellungnahme angefordert. */
  technischeStellungnahmeStatus: string | null
  /** Nachbesichtigung angefordert oder läuft. */
  nachbesichtigungStatus: string | null
  /** SV-Honorar wurde ausgezahlt. */
  svHonorarEingegangenAm: string | null
  /** Fall final geschlossen. */
  fallStatus: string | null
}

export function getSvLifecyclePhase(input: FallPhaseInput): SvLifecyclePhase {
  // Wenn Auftrag noch nicht durch ist, normaler Auftrags-Phase.
  if (!input.gutachtenFinalFreigegeben) {
    return getAuftragsPhase(input)
  }

  // Edge-Cases haben Vorrang vor "normaler" Fall-Phase
  if (input.technischeStellungnahmeStatus === 'angefordert') return 'stellungnahme'
  if (input.nachbesichtigungStatus === 'angefordert' || input.nachbesichtigungStatus === 'termin-eingereicht') {
    return 'nachbesichtigung'
  }

  // Fall-Phasen
  if (input.svHonorarEingegangenAm) return 'auszahlung'
  if (input.lexdriveCaseId) return 'bei-kanzlei'
  if (input.fallStatus === 'abgeschlossen') return 'abgeschlossen-fall'

  return 'gutachten-freigegeben'
}

export function isFallPhase(phase: SvLifecyclePhase): phase is FallPhase {
  return (
    phase === 'gutachten-freigegeben' ||
    phase === 'bei-kanzlei' ||
    phase === 'stellungnahme' ||
    phase === 'nachbesichtigung' ||
    phase === 'auszahlung' ||
    phase === 'abgeschlossen-fall'
  )
}

export const FALL_PHASE_LABEL: Record<FallPhase, string> = {
  'gutachten-freigegeben': 'Gutachten freigegeben',
  'bei-kanzlei': 'Liegt bei Kanzlei',
  stellungnahme: 'Stellungnahme angefordert',
  nachbesichtigung: 'Nachbesichtigung',
  auszahlung: 'Auszahlung',
  'abgeschlossen-fall': 'Abgeschlossen',
}
