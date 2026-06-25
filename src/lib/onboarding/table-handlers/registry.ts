import type { OnboardingTableHandler } from './types'
import { claimsHandler } from './claims-handler'
import { claimPartiesHandler } from './claim-parties-handler'
import { gfaHandler } from './gfa-handler'
import { leadsHandler } from './leads-handler'
import { profilesHandler } from './profiles-handler'
import { sachverstaendigeHandler } from './sachverstaendige-handler'

// CMM-49: Registry der bekannten db_target.tabelle -> Per-Tabelle-Handler. Eine Tabelle OHNE Eintrag
// wird vom Router als HARTER Fehler behandelt (kein stilles continue) -> tote/falsche Config-Targets
// werden sofort sichtbar. (_finalize/_termin/_self sind keine Tabellen -> Router skippt sie vorher.)
//
// KEIN vehicles-Handler: DB-verifiziert hat KEIN flow_key ein db_target.tabelle='vehicles' (der
// Spec-Vorschlag war spekulativ; die einzigen Fahrzeug-naehe Targets sind die 2 vestigialen
// kunde-onboarding-leads-Felder fahrzeugschein_foto/schadensfotos = Foto-Uploads, kein Feld-Write).
export const REGISTRY: Record<string, OnboardingTableHandler> = {
  [claimsHandler.tabelle]: claimsHandler,
  [claimPartiesHandler.tabelle]: claimPartiesHandler,
  [gfaHandler.tabelle]: gfaHandler,
  [leadsHandler.tabelle]: leadsHandler,
  [profilesHandler.tabelle]: profilesHandler,
  [sachverstaendigeHandler.tabelle]: sachverstaendigeHandler,
}
