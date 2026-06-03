// AAR-956 §4: Resolver-State-Machine fuer den kanonischen /flow (Anfrage → Lead →
// FlowLink). REINE Entscheidungs-Funktion ueber den Lead-Zustand — KEIN I/O, KEINE
// neue Such-/Slot-Quelle. Sie sagt nur, WELCHER Zustand vorliegt; das eigentliche
// Matching bleibt `matchAndSlots`/`findBestSV` (eine Quelle, Spec §1). Konsumenten
// (self-service-actions.ladeMatchingFlow, FlowSlotStep, FlowWizardKfz) leiten ihr
// Verhalten aus diesem einen Zustand ab.
//
// Aaron-Prinzip (Spec §4): der FlowLink loest SV/Termin AKTIV auf — er zeigt nie
// einen passiven "wir suchen einen SV"/"wir melden uns telefonisch"-Wartezustand
// fuer einen termin-losen Lead. Jeder termin-lose, nicht-disqualifizierte Lead
// ergibt einen aktiven Zustand: buchen (fixer/global) oder Ort abfragen.

export type FlowTerminInput = {
  /** Reservierter/bestaetigter Termin mit aufgeloestem SV vorhanden (page.tsx terminMitSv). */
  hatTerminMitSv: boolean
  /** Fest zugeordneter SV (gfa.zugeordneter_sv_id) — Monika/Dispatcher-Pick. Sonst null. */
  fixerSvId: string | null
  /** Besichtigungsort (mit fahrzeug_standort-Fallback, in page.tsx/Action aufgeloest). */
  besichtigungsLat: number | null
  besichtigungsLng: number | null
  /** Eigenverschulden-Disqualifikation (Self-Service-Quali). */
  disqualifiziert: boolean
}

export type FlowTerminState =
  // Eigenverschulden → Kasko-Endansicht, kein Termin.
  | { kind: 'disqualifiziert' }
  // SV + Termin stehen → anzeigen, NICHT neu suchen (§4.1).
  | { kind: 'zeige_termin' }
  // Fest zugeordneter SV, kein Termin → nur SEINEN Kalender buchen (§4.2/§4.4 Monika).
  | { kind: 'buchen_fixer'; fixerSvId: string }
  // Weder SV noch Termin, Ort bekannt → global matchen + buchen (§4.3 „da").
  | { kind: 'buchen_global' }
  // Ort fehlt → im Flow abfragen, statt „wir melden uns telefonisch" (§4.3 „fehlt" / Task 3).
  | { kind: 'ort_abfragen' }

export function resolveFlowTerminState(input: FlowTerminInput): FlowTerminState {
  if (input.disqualifiziert) return { kind: 'disqualifiziert' }
  // Termin steht bereits (Ort war bei der Buchung bekannt) → ueberstimmt den Ort-Gate.
  if (input.hatTerminMitSv) return { kind: 'zeige_termin' }
  // Ort-Gate VOR der Buchung — gilt fuer fixer UND global (matchAndSlots braucht lat/lng).
  if (input.besichtigungsLat == null || input.besichtigungsLng == null) {
    return { kind: 'ort_abfragen' }
  }
  if (input.fixerSvId) return { kind: 'buchen_fixer', fixerSvId: input.fixerSvId }
  return { kind: 'buchen_global' }
}
