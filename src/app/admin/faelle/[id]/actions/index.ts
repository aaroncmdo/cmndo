// AAR-162 / W2: Barrel-Re-Export für alle Fallakte-Actions.
//
// Schritt 1 des Actions-Domain-Splits: Das neue Inline-Edit (stammdaten.ts)
// liegt hier, alle anderen Actions bleiben vorläufig in ../actions.ts (46 KB
// Monolith — wird in einem Follow-up-Commit domain-gesplittet analog zum
// Dispatch-Lead-Actions-Refactor AAR-143).
//
// Consumer können bereits jetzt aus dem Barrel importieren:
//   import { updateFallField, updateFall } from './actions'  // aus Monolith
//
// Nach dem Follow-up-Split verschwindet nur das Source-File — Imports bleiben.

export { updateFallField } from './stammdaten'
export { triggerFinCallForFall, markDokumentNachgereicht } from './dokumente'

// Re-exports aus dem vorhandenen Monolith (wird später zerlegt):
export {
  updateFall,
  addTimelineEntry,
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
} from '../actions'
