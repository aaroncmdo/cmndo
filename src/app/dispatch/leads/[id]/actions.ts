// AAR-143: Re-Export-Barrel für die Domain-aufgesplitteten Server-Actions.
// Das ursprüngliche actions.ts (~30 KB, 16 Aktionen) ist nach domain split:
//   actions/qualification.ts  — setLeadPhase, disqualifiziereLead, setServiceTyp
//   actions/schadentyp.ts     — saveSchadentyp
//   actions/gespraech.ts      — startGespraech, endeGespraech
//   actions/rueckruf.ts       — saveRueckruf, markRueckrufErledigt
//   actions/stammdaten.ts     — saveStammdaten
//   actions/cardentity.ts     — enrichLeadCardentity
//   actions/hard-gate.ts      — saveHardGate
//   actions/sv-termin.ts      — listSvSuggestions, reserve, cancel, accept
//   actions/flowlink.ts       — sendFlowLinkMultiChannel
//   actions/types.ts          — HardGateData, SvSuggestion, UnfallortKategorie
// Bestehende Imports aus '../actions' funktionieren weiterhin via dieses Barrel.

export { setLeadPhase, disqualifiziereLead, setServiceTyp } from './_actions/qualification'
export { saveSchadentyp, clearSchadentyp } from './_actions/schadentyp'
export { startGespraech, endeGespraech } from './_actions/gespraech'
export { saveRueckruf, markRueckrufErledigt } from './_actions/rueckruf'
export { saveStammdaten } from './_actions/stammdaten'
export { enrichLeadCardentity } from './_actions/cardentity'
export { saveHardGate } from './_actions/hard-gate'
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
// AAR-352: triggerZb1UploadRequest + triggerPolizeiberichtUploadRequest ersetzt
// durch kombinierten Multi-Slot-Trigger. Legacy-Dateien sind gelöscht.
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
export type { HardGateData, SvSuggestion, UnfallortKategorie } from './_actions/types'
