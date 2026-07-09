// src/lib/claims/detail/get-claim-detail.ts
// Phase C: rollen-aware Facade ueber die v_claim_full-geerdeten Claim-Loader.
// (Aaron 08.07.: „das ist ja auch eine detail view aus der claim base bzw claim view".)
//   - kunde -> getKundeFallDetailRecord (Ownership via ctx{userId,email})
//   - sv    -> getFallForSv (sv_id-Defense-in-Depth via ctx{svId})
//   - staff -> getClaimForRole (v_claim_full; admin/kb='*' vollstaendig; RLS-Gate)
// + Sub-Entity-Bundle (lifecycle/auftraege/kanzleiFall/pflicht), rollen-gescoped.
// 0 neue DB-Reads (reine Komposition existierender, live Loader). Liefert
// ClaimDetail | null (Loader-Konvention, KEIN {ok,error} — ist kein 'use server').
//
// Plan: docs/superpowers/plans/2026-07-08-claim-C-getClaimDetail-loader.md
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { Rolle } from '@/lib/claims/types'
import { getClaimForRole } from '@/lib/claims/get-claim-for-role'
import { getKundeFallDetailRecord } from '@/lib/claims/get-kunde-faelle'
import { getFallForSv } from '@/lib/fall/queries'
import { getClaimLifecycleForClaim } from '@/lib/claims/get-claim-lifecycle-for-claim'
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClaimDetail } from './types'

type DbClient = SupabaseClient<Database>

// Overloads: kunde/sv ERZWINGEN ihren Rollen-Kontext (ctx) und verengen den
// Rueckgabe-Typ aufs jeweilige Union-Member (Consumer brauchen kein Narrowing).
export function getClaimDetail(
  supabase: DbClient,
  claimId: string,
  rolle: 'kunde',
  ctx: { userId: string; email: string | null },
): Promise<Extract<ClaimDetail, { rolle: 'kunde' }> | null>
export function getClaimDetail(
  supabase: DbClient,
  claimId: string,
  rolle: 'sv',
  ctx: { svId: string },
): Promise<Extract<ClaimDetail, { rolle: 'sv' }> | null>
export function getClaimDetail(
  supabase: DbClient,
  claimId: string,
  rolle: Exclude<Rolle, 'kunde' | 'sv'>,
): Promise<Extract<ClaimDetail, { rolle: Exclude<Rolle, 'kunde' | 'sv'> }> | null>
export async function getClaimDetail(
  supabase: DbClient,
  claimId: string,
  rolle: Rolle,
  ctx?: { userId?: string; email?: string | null; svId?: string },
): Promise<ClaimDetail | null> {
  // Post-Gate-Loads (Lifecycle/Dokumente) laufen via Admin — getClaimLifecycle
  // braucht ALLE Sub-Entities fuer die A1-kanonische Phase; der jeweilige Core-
  // Loader unten prueft den Zugriff (RLS bzw. Ownership/sv_id) und ist das Gate.
  const admin = createAdminClient()

  if (rolle === 'sv') {
    // SV: getFallForSv (granted View + sv_id-Defense-in-Depth) ist das Gate —
    // null wenn der Fall nicht dem SV gehoert. Braucht ctx.svId (die Page hat die
    // SV-Profile-id via getGutachterForUser aufgeloest).
    if (!ctx?.svId) return null
    const core = await getFallForSv(supabase, claimId, ctx.svId)
    if (!core) return null
    const { lifecycle, auftraege, kanzleiFall } = await getClaimLifecycleForClaim(admin, claimId)
    // C1: getPflichtdokumenteForFall filtert pflichtdokumente/fall_dokumente per fall_id
    // (= faelle.id!). core.id ist die faelle.id (getFallForSv-View-id); claimId koennte
    // ein claim_id sein → 0 Treffer. Immer die faelle.id (core.id) durchreichen.
    const fallId = fallIdOf(core, claimId)
    const pflichtDokumente = await getPflichtdokumenteForFall(supabase, fallId, 'sv')
    return { rolle: 'sv', core, lifecycle, auftraege, kanzleiFall, pflichtDokumente }
  }

  if (rolle === 'kunde') {
    // Kunde: ownership-aufloesender Detail-Loader (liest v_claim_full-Anker +
    // claims-SSoT-Extras + Sub-Entities → flaches Legacy-Alias-Record, das die
    // Kunde-Sub-Components 1:1 konsumieren). Braucht ctx — die Kunde-Page hat
    // den User-Kontext (claim_parties/kunde_id/lead.email-Ownership).
    if (!ctx?.userId) return null
    const core = await getKundeFallDetailRecord(admin, ctx.userId, ctx.email ?? null, claimId)
    if (!core) return null
    const { lifecycle, auftraege, kanzleiFall } = await getClaimLifecycleForClaim(admin, claimId)
    // C1: pflicht per faelle.id (core.id = id:fall_id-Alias), NICHT claimId (auf der
    // canonical URL ist routeId der claim_id → 0 Pflichtdok/fall_dokumente-Treffer).
    const fallId = fallIdOf(core, claimId)
    const pflichtDokumente = await getPflichtdokumenteForFall(supabase, fallId, 'kunde')
    // Sub-Entities = die EIGENEN Claim-Daten (kein Leak — der Core-Loader hat den
    // Zugriff bereits gegated). Die Kunde-Page nutzt auftraege (erstgutachten/QC-Gates)
    // → mitliefern, sonst braeche die Migration die Gutachten-Anzeige.
    return { rolle: 'kunde', core, lifecycle, auftraege, kanzleiFall, pflichtDokumente }
  }

  // staff (kb/admin/kanzlei): RLS-Gate via getClaimForRole (v_claim_full; admin/kb='*').
  const core = await getClaimForRole(supabase, claimId, rolle)
  if (!core) return null
  const { lifecycle, auftraege, kanzleiFall } = await getClaimLifecycleForClaim(admin, claimId)
  // ⚠ D-admin-TODO: staff core.id = claims.id (claim_id), NICHT faelle.id. getPflichtdokumenteForFall
  // filtert per fall_id (=faelle.id) → wenn D-admin detail.pflichtDokumente konsumiert, hier
  // core.id→faelle.id via Bridge aufloesen. Aktuell KEIN staff-Consumer der Facade → claimId
  // belassen (nicht spekulativ fixen; die Monolith-Page laedt pflicht heute selbst korrekt).
  const pflichtDokumente = await getPflichtdokumenteForFall(supabase, claimId, rolle)
  // Sub-Entities = eigene Claim-Daten des (bereits gegateten) Claims → an alle
  // autorisierten Rollen (matcht das heutige Verhalten der Detail-Pages).
  return { rolle, core, lifecycle, auftraege, kanzleiFall, pflichtDokumente }
}

// core.id ist bei kunde (getKundeFallDetailRecord: id:fall_id) + sv (getFallForSv-View)
// die faelle.id — die getPflichtdokumenteForFall + andere fall_id-gekeyte Reads brauchen.
// Fallback claimId nur falls core kein id traegt (sollte nie).
function fallIdOf(core: Record<string, unknown>, claimId: string): string {
  const id = core.id
  return typeof id === 'string' && id.length > 0 ? id : claimId
}
