// CMM-49 Onboarding-Writer-Kanonisierung: der gemeinsame Schreib-Kontext fuer den
// saveOnboardingFields-Router. EINE Quelle, die jeder Per-Tabelle-Handler bekommt — er loest
// daraus seine Target-Row + Ownership auf (claims via fallId->Bridge, leads via leadId/Token,
// sv via user, gfa via anfrageId). Pure Types (import type only) -> kein Runtime-Server-Dep,
// frei importierbar von Router + Handlern.
import type { createClient } from '@/lib/supabase/server'

// audience entscheidet den Ownership-/Schreib-Pfad, wo dieselbe Tabelle mehrere hat:
//   leads -> 'flow' (Token-validiert, admin, kein eingeloggter user) vs 'dispatcher' (eingeloggt
//            + derived columns). (claims/claim_parties='kunde', profiles/sachverstaendige='sv',
//            gutachter_finder_anfragen='anon'.)
export type OnboardingAudience = 'kunde' | 'dispatcher' | 'sv' | 'flow' | 'anon'

export type OnboardingWriteContext = {
  // User-Context-Client (RLS) fuer Ownership-Reads; Handler nutzen createAdminClient NACH dem Gate.
  // Im anon-/flow-Pfad ist das der anon-Client (gfa-Insert ist RLS-erlaubt; flow-Ownership = Token).
  supabase: Awaited<ReturnType<typeof createClient>>
  user: { id: string } | null
  audience: OnboardingAudience
  anfrageId?: string | null // gutachter_finder_anfragen (anon-Front; null => Shell-Insert)
  leadId?: string | null // leads (flow-Token-resolved bzw. dispatch-Route)
  fallId?: string | null // -> claimId via resolveClaimId (kunde-onboarding)
  svId?: string | null // sachverstaendige.id (sv-onboarding; sonst via user aufloesbar)
}
