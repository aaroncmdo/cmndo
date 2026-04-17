// AAR-428 / W1: Dokumente-Actions (Upload, Pflichtdokumente, FIN-Call,
// Cardentity Typ B, Nachreichen).
// Der Hauptteil liegt bereits in actions/dokumente.ts — dieser Barrel
// konsolidiert zusätzlich die aus dem Monolith stammenden Upload-Actions.

export {
  triggerFinCallForFall,
  markDokumentNachgereicht,
  requestCardentityTypBForFall,
} from '../actions/dokumente'

export {
  uploadPflichtdokument,
  uploadDatei,
} from '../actions'
