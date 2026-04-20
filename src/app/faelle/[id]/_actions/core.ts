// AAR-428 / W1: Core-Actions — Fall-Level (Delete, Deactivate, Reactivate,
// Klassifizierung, generisches Update).
//
// Re-Export aus dem historischen Monolith `actions.ts`. Der Monolith wird
// in Folge-Commits schrittweise entleert; Consumer sollen ab jetzt aus
// `_actions/core` importieren statt aus `actions.ts`, damit der Split
// lokal bleibt.

export {
  updateFall,
  deleteFall,
  deactivateFall,
  reactivateFall,
  saveRegulierungsKlassifizierung,
  eskalation,
} from '../actions'
