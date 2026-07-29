// Freundes-Graph-Gate der Provisions-Suppression (Spec 1 §13b LOCKED, K2/K13). NICHT an den
// Inbound-Triggern (dort sind sv_id/reparatur_werkstatt_id NOCH NULL) — sondern an der RELEASE-Zeit
// (completion+7d), wo alle Zuweisungen stehen. Provision unterdrueckt, wenn der Inbound-Partner mit
// dem zugewiesenen Gegenpart (SV oder Reparatur-Werkstatt) befreundet ist. Makler/makler_empfehlung
// = extern (kein Graph-Knoten v1) -> nie unterdrueckt. service_role (v_netzwerk_freunde Definer-only).

import type { SupabaseClient } from '@supabase/supabase-js'
import { ladeFreundKandidatIds } from '@/lib/netzwerk/freunde'
import { resolveProvisionPartnerProfil, EXTERNE_PARTNER_TYPEN } from '@/lib/netzwerk/owner-resolution'

export type SuppressionClaim = { svId: string | null; reparaturWerkstattId: string | null }
export type SuppressionFreunde = { svIds: ReadonlySet<string>; werkstattIds: ReadonlySet<string> }

/** Pure: ist ein zugewiesener Gegenpart im Freundes-Set des Inbound-Partners? */
export function istIntraNetzwerk(claim: SuppressionClaim, freunde: SuppressionFreunde): boolean {
  if (claim.svId && freunde.svIds.has(claim.svId)) return true
  if (claim.reparaturWerkstattId && freunde.werkstattIds.has(claim.reparaturWerkstattId)) return true
  return false
}

export type SuppressionRow = { id: string; partner_typ: string; partner_id: string; claim_id: string | null }

/**
 * Batch-Gate: liefert die Provisions-Ids, die intra-Freundesnetzwerk sind (-> unterdruecken).
 * Robust: wirft NIE. Ein per-Row-Fehler (unaufloesbarer Partner/Claim) => Row NICHT im Set =>
 * Status quo (freigeben). Der claims-Read ist gebatcht; die Freund-Reads laufen pro graph-relevanter
 * Row — akzeptabel (Release ist ein taeglicher Low-Freq-Cron; K10s Batch-Mandat gilt dem Ranking-
 * Hot-Path, nicht diesem Cron).
 */
export async function bestimmeIntraNetzwerkProvisionen(
  admin: SupabaseClient,
  rows: SuppressionRow[],
): Promise<Set<string>> {
  const out = new Set<string>()
  const graphRows = rows.filter((r) => !EXTERNE_PARTNER_TYPEN.has(r.partner_typ) && r.claim_id)
  if (graphRows.length === 0) return out

  try {
    // Batch: sv_id + reparatur_werkstatt_id fuer alle betroffenen Claims.
    const claimIds = Array.from(new Set(graphRows.map((r) => r.claim_id as string)))
    const claimMap = new Map<string, SuppressionClaim>()
    const { data: claims, error } = await admin
      .from('claims')
      .select('id, sv_id, reparatur_werkstatt_id')
      .in('id', claimIds)
    if (error) {
      console.error('[provisions-suppression] claims-Read fehlgeschlagen — Status quo (freigeben):', error.message)
      return out
    }
    for (const c of (claims ?? []) as Record<string, unknown>[]) {
      claimMap.set(c.id as string, {
        svId: (c.sv_id as string | null) ?? null,
        reparaturWerkstattId: (c.reparatur_werkstatt_id as string | null) ?? null,
      })
    }

    for (const r of graphRows) {
      try {
        const claim = claimMap.get(r.claim_id as string)
        if (!claim) continue
        // Kein zugewiesener Gegenpart -> nichts zu unterdruecken (spart die Graph-Reads).
        if (!claim.svId && !claim.reparaturWerkstattId) continue
        const ownerProfil = await resolveProvisionPartnerProfil(admin, r.partner_typ, r.partner_id)
        if (!ownerProfil) continue // extern/unaufloesbar -> Status quo (freigeben)
        const [svIds, werkstattIds] = await Promise.all([
          ladeFreundKandidatIds(admin, ownerProfil, 'gutachter'),
          ladeFreundKandidatIds(admin, ownerProfil, 'werkstatt'),
        ])
        if (istIntraNetzwerk(claim, { svIds, werkstattIds })) out.add(r.id)
      } catch (err) {
        console.error(
          '[provisions-suppression] Row uebersprungen (bleibt freigebbar):',
          r.id,
          err instanceof Error ? err.message : err,
        )
      }
    }
  } catch (err) {
    console.error('[provisions-suppression] Batch fehlgeschlagen — Status quo (freigeben):', err instanceof Error ? err.message : err)
  }
  return out
}
