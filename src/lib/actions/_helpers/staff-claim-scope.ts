// Write-Path-Audit 2026-07-01, F6: reine Autorisierungs-Logik fuer Staff-Claim-Mutationen
// (import-frei → unit-testbar ohne Mocks).
//
// Spiegelt die claims-RLS-Write-Policy
//   is_admin() OR (is_kundenbetreuer() AND (kundenbetreuer_id = uid OR kundenbetreuer_id IS NULL))
// erweitert um `dispatch` (Routing-Rolle, global). admin/dispatch = global; kundenbetreuer = nur
// eigene ODER unassigned Claims. Nutzer der admin-client-Schreibpfade (z.B. transitionFallStatus)
// umgehen RLS → dieser Guard ist dort die einzige Autorisierung.
export function staffMayMutateClaim(params: {
  rolle: string | null | undefined
  claimKbId: string | null | undefined
  userId: string
}): boolean {
  const { rolle, claimKbId, userId } = params
  if (rolle === 'admin' || rolle === 'dispatch') return true
  if (rolle === 'kundenbetreuer') return claimKbId == null || claimKbId === userId
  return false
}
