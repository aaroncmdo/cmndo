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

export { setLeadPhase, disqualifiziereLead, setServiceTyp } from './actions/qualification'
export { saveSchadentyp } from './actions/schadentyp'
export { startGespraech, endeGespraech } from './actions/gespraech'
export { saveRueckruf, markRueckrufErledigt } from './actions/rueckruf'
export { saveStammdaten } from './actions/stammdaten'
export { enrichLeadCardentity } from './actions/cardentity'
export { saveHardGate } from './actions/hard-gate'
export {
  listSvSuggestionsForLead,
  reserveSvTerminForLead,
  cancelSvTerminForLead,
  acceptGegenvorschlag,
  getNextFreeSlotsForSv,
} from './actions/sv-termin'
export { sendFlowLinkMultiChannel } from './actions/flowlink'
export { triggerZb1UploadRequest } from './actions/zb1'
export type { HardGateData, SvSuggestion, UnfallortKategorie } from './actions/types'
