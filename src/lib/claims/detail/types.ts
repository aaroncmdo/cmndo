// src/lib/claims/detail/types.ts
// Phase C: der geteilte Claim-Detail-Vertrag. EINE Datenschicht fuer alle
// Rollen-Praesentationen (Phase D), gegruendet auf die Claim-View (v_claim_full).
//
// Aaron-Korrektur 08.07.: die Detail-Views sind ALLE claim-base/claim-view-
// Projektionen (getKundeFallDetailRecord liest v_claim_full als Anker). getClaimDetail
// ist daher eine rollen-aware FACADE ueber die v_claim_full-geerdeten Loader:
//   - kunde -> getKundeFallDetailRecord (flaches, ownership-aufgeloestes Legacy-
//              Alias-Record; liest v_claim_full + claims-SSoT-Extras)
//   - sv    -> getFallForSv (flaches Record, sv_id-Defense-in-Depth ueber RLS)
//   - staff -> getFallById (v_faelle_mit_aktuellem_termin, faelle.id-keyed; Route-gegated)
// + Sub-Entity-Bundle (lifecycle/auftraege/kanzleiFall/pflicht), rollen-gescoped.
//
// Plan: docs/superpowers/plans/2026-07-08-claim-C-getClaimDetail-loader.md
import type { Rolle } from '@/lib/claims/types'
import type { ClaimLifecycle } from '@/lib/claims/lifecycle'
import type { AuftragRow } from '@/lib/auftrag/queries'
import type { KanzleiFallRow } from '@/lib/kanzlei-fall/queries'
import type { PflichtSlotForView } from '@/components/fall/PflichtdokumenteSection'

/** Kunde-Core = flaches, v_claim_full-geerdetes Detail-Record (Legacy-Alias-Shape,
 *  aus getKundeFallDetailRecord). Bewusst Record<> waehrend der Transition — der
 *  Loader liefert (noch) untyped; volle Typisierung ist ein Folge-Schritt. */
export type ClaimDetailCoreKunde = Record<string, unknown>

/** SV-Core = flaches Record aus getFallForSv (v_faelle_mit_aktuellem_termin,
 *  granted View + sv_id-Defense-in-Depth). Wie Kunde: untyped waehrend der Transition. */
export type ClaimDetailCoreSv = Record<string, unknown>

/** Staff-Core (admin/kb/kanzlei) = flaches Record aus getFallById
 *  (v_faelle_mit_aktuellem_termin, faelle.id-keyed) — dieselbe Shape, die die
 *  Admin/KB/Kanzlei-Fallakte heute laedt. Wie kunde/sv untyped waehrend der Transition. */
export type ClaimDetailCoreStaff = Record<string, unknown>

/** Sub-Entity-Bundle — rollen-unabhaengige Struktur (Werte rollen-gescoped im Loader). */
type ClaimDetailBundle = {
  lifecycle: ClaimLifecycle
  auftraege: AuftragRow[]
  kanzleiFall: KanzleiFallRow | null
  pflichtDokumente: PflichtSlotForView[]
}

/** Rollen-diskriminierte Union — jede Rolle hat ihre eigene Detail-Core-Shape
 *  (alle v_claim_full-geerdet, aber rollen-spezifisch projiziert):
 *  kunde/sv/staff = flaches Record (kunde=v_claim_full-Alias, sv/staff=v_faelle). */
export type ClaimDetail =
  | ({ rolle: 'kunde'; core: ClaimDetailCoreKunde } & ClaimDetailBundle)
  | ({ rolle: 'sv'; core: ClaimDetailCoreSv } & ClaimDetailBundle)
  | ({ rolle: Exclude<Rolle, 'kunde' | 'sv'>; core: ClaimDetailCoreStaff } & ClaimDetailBundle)
