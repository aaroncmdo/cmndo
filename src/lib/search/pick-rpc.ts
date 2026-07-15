// Welche Such-RPC fuer welche Rolle?
//
// Makler haben KEIN claims-RLS -> search_global (SECURITY INVOKER) liefert ihnen 0 Claims
// und (via leads-RLS) Leads, die routeForEntity nach /dispatch/leads/[id] schickt (403 fuer
// Makler). Fuer sie laeuft daher die consent-gegatete DEFINER-RPC search_makler (nur eigene
// konsentierte Faelle, id=fall_id -> /makler/akten). Alle anderen Rollen: search_global.
export function pickSearchRpc(rolle: string | null | undefined): 'search_global' | 'search_makler' {
  return rolle === 'makler' ? 'search_makler' : 'search_global'
}
