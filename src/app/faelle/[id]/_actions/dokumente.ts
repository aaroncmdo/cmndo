// AAR-428 / W1: Dokumente-Actions (Upload, Pflichtdokumente, FIN-Call,
// Cardentity Typ B, Nachreichen).
// Der Hauptteil liegt bereits in actions/dokumente.ts — dieser Barrel
// konsolidiert zusätzlich die aus dem Monolith stammenden Upload-Actions.

export {
  triggerFinCallForFall,
  markDokumentNachgereicht,
  requestCardentityTypBForFall,
  // AAR-542 (C5): Matrix-Sync — legt fehlende pflichtdokumente-Rows
  // gemäß Katalog-Regel-Auswertung an.
  syncPflichtdokumenteForFall,
} from '../_actions/dokumente'

export {
  uploadPflichtdokument,
  uploadDatei,
} from '../_actions'
