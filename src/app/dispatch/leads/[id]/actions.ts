// AAR-143: Re-Export-Barrel für die Domain-aufgesplitteten Server-Actions.
// Bestehende Imports aus '../actions' funktionieren weiterhin via dieses Barrel.
// P3b-Cutover (dispatch-config-unify): die Legacy-Phasen-Actions
// (qualification, hard-gate, schadentyp save/clear) sind entfernt — der flache
// v2-Form schreibt Felder via saveDispatchLeadFelder (+ derive-dispatch-felder).

export { startGespraech, endeGespraech } from './_actions/gespraech'
export { saveRueckruf, markRueckrufErledigt } from './_actions/rueckruf'
export { saveStammdaten } from './_actions/stammdaten'
export { enrichLeadCardentity } from './_actions/cardentity'
export {
  listSvSuggestionsForLead,
  reserveSvTerminForLead,
  cancelSvTerminForLead,
  acceptGegenvorschlag,
  getNextFreeSlotsForSv,
  getSvSuggestionsWithSlots,
} from './_actions/sv-termin'
export type { SlotMatchType, SlotCandidate } from './_actions/sv-termin'
export { sendFlowLinkMultiChannel } from './_actions/flowlink'
// AAR-521: Debug-Action für "Warum?"-Button im SvDispatchPanel.
export { debugSvMatching } from './_actions/debug-sv'
// AAR-352: kombinierter Multi-Slot-Upload-Trigger.
export { triggerDokumenteUploadRequest } from './_actions/dokumente-anfordern'
export type { SlotEingabe } from './_actions/dokumente-anfordern'
export { searchVersicherungen, getVersicherungById, type VersicherungSuggestion } from './_actions/versicherungen'
// AAR-358: Personenschäden-Personen-CRUD
export {
  listPersonenForLead,
  upsertPersonForLead,
  deletePersonForLead,
  type PersonenschadenPerson,
  type PersonenschadenPersonInput,
} from './_actions/personen'
export type { SvSuggestion, UnfallortKategorie } from './_actions/types'
