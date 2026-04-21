// AAR-162 / W2: Barrel-Re-Export für alle Fallakte-Actions.
//
// Schritt 1 des Actions-Domain-Splits: Das neue Inline-Edit (stammdaten.ts)
// liegt hier, alle anderen Actions bleiben vorläufig in ../actions.ts (46 KB
// Monolith — wird in einem Follow-up-Commit domain-gesplittet analog zum
// Dispatch-Lead-Actions-Refactor AAR-143).
//
// Consumer können bereits jetzt aus dem Barrel importieren:
//   import { updateFallField, updateFall } from './_actions'  // aus Monolith
//
// Nach dem Follow-up-Split verschwindet nur das Source-File — Imports bleiben.

export { updateFallField } from './stammdaten'
export { triggerFinCallForFall, markDokumentNachgereicht } from './dokumente'
export {
  requestTechnischeStellungnahme,
  freigebeTechnischeStellungnahme,
  startRuege,
  uebergebeFallKlage,
} from './prozess'
export { createKbVideoterminByKb } from './termine'
export { regenerateSvBriefing } from './briefing'

// AAR-684 Phase 2 (Lite): Monolith lebt jetzt als _monolith.ts IM _actions-
// Ordner — keine Datei mehr außerhalb der Actions-Domain. Thematischer
// Split der 22 Funktionen in 9 Module (filmcheck/chat/tasks/core/...)
// bleibt als Follow-up-Ticket — hier nur der Location-Fix.
export {
  updateFall,
  addTimelineEntry,
  uploadAnschlussschreiben,
  uploadPflichtdokument,
  setAnschlussschreibenDatum,
  recordZahlung,
  eskalation,
  updateSchadensAdresse,
  sendChatNachricht,
  uploadDatei,
  upsertQcCheckliste,
  qcBestanden,
  qcNachbesserung,
  saveKanzleiAnsprechpartner,
  createFallTask,
  updateTaskStatus,
  createTermin,
  updateTerminStatus,
  erfasseZahlungseingang,
  deleteFall,
  deactivateFall,
  reactivateFall,
  saveRegulierungsKlassifizierung,
} from './_monolith'
