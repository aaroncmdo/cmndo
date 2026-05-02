// AAR-684 Phase 2: Barrel-Re-Export aller Fallakte-Actions.
//
// Der Monolith `faelle/[id]/actions.ts` (1240 Zeilen, 26 Funktionen) wurde
// in 9 thematische Module gesplittet. Consumer importieren weiterhin aus
// diesem Barrel (`@/app/faelle/[id]/_actions`) — die neuen Modul-Dateien
// sind Implementation Detail.
//
// Modul-Karte:
//   stammdaten.ts   — updateFallField, updateFall, updateSchadensAdresse, saveFinVin
//   dokumente.ts    — triggerFinCallForFall, markDokumentNachgereicht,
//                     syncPflichtdokumenteForFall, requestCardentityTypBForFall,
//                     uploadDatei, uploadPflichtdokument, uploadAnschlussschreiben
//   prozess.ts      — requestTechnischeStellungnahme, freigebeTechnischeStellungnahme,
//                     startRuege, uebergebeFallKlage, eskalation
//   termine.ts      — createKbVideoterminByKb, createTermin, updateTerminStatus
//   kanzlei-paket.ts — applyKanzleiPaket, setAnschlussschreibenDatum, recordZahlung,
//                      saveKanzleiAnsprechpartner, erfasseZahlungseingang,
//                      saveRegulierungsKlassifizierung
//   briefing.ts     — regenerateSvBriefing, regenerateSvBriefingStruktur
//   filmcheck.ts    — saveFilmcheck, upsertQcCheckliste, qcBestanden, qcNachbesserung
//   chat.ts         — addTimelineEntry, sendManualWhatsAppAction, sendChatNachricht
//   tasks.ts        — createFallTask, updateTaskStatus
//   core.ts         — deleteFall, deactivateFall, reactivateFall

export {
  updateFallField,
  updateFall,
  updateSchadensAdresse,
  saveFinVin,
} from './stammdaten'

export {
  triggerFinCallForFall,
  markDokumentNachgereicht,
  uploadDatei,
  uploadPflichtdokument,
  uploadAnschlussschreiben,
} from './dokumente'

export {
  requestTechnischeStellungnahme,
  freigebeTechnischeStellungnahme,
  startRuege,
  uebergebeFallKlage,
  eskalation,
} from './prozess'

export {
  createKbVideoterminByKb,
  createTermin,
  updateTerminStatus,
} from './termine'

export {
  setAnschlussschreibenDatum,
  recordZahlung,
  saveKanzleiAnsprechpartner,
  erfasseZahlungseingang,
  saveRegulierungsKlassifizierung,
} from './kanzlei-paket'

export { regenerateSvBriefing } from './briefing'

export {
  saveFilmcheck,
  upsertQcCheckliste,
  qcBestanden,
  qcNachbesserung,
} from './filmcheck'

export {
  addTimelineEntry,
  sendManualWhatsAppAction,
  sendChatNachricht,
} from './chat'

export { createFallTask, updateTaskStatus } from './tasks'

export { deleteFall, deactivateFall, reactivateFall } from './core'

export {
  reRunGutachtenOcr,
  updateGutachtenOcrFelder,
} from './gutachten-ocr'
