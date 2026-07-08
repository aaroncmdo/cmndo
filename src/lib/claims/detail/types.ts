// src/lib/claims/detail/types.ts
// Phase C: der geteilte Claim-Detail-Vertrag. EINE Datenschicht fuer alle
// Rollen-Praesentationen (Phase D), gegruendet auf die Claim-View (v_claim_full).
//
// Aaron-Korrektur 08.07.: die Detail-Views sind ALLE claim-base/claim-view-
// Projektionen (getKundeFallDetailRecord liest v_claim_full als Anker). getClaimDetail
// ist daher eine rollen-aware FACADE ueber die v_claim_full-geerdeten Loader:
//   - kunde -> getKundeFallDetailRecord (flaches, ownership-aufgeloestes Legacy-
//              Alias-Record; liest v_claim_full + claims-SSoT-Extras)
//   - staff -> getClaimForRole (v_claim_full; admin/kb = '*' = vollstaendig)
// + Sub-Entity-Bundle (lifecycle/auftraege/kanzleiFall/pflicht), rollen-gescoped.
//
// Plan: docs/superpowers/plans/2026-07-08-claim-C-getClaimDetail-loader.md
import type { ClaimFull, Rolle } from '@/lib/claims/types'
import type { ClaimLifecycle } from '@/lib/claims/lifecycle'
import type { AuftragRow } from '@/lib/auftrag/queries'
import type { KanzleiFallRow } from '@/lib/kanzlei-fall/queries'
import type { PflichtSlotForView } from '@/components/fall/PflichtdokumenteSection'

/** Kunde-Core = flaches, v_claim_full-geerdetes Detail-Record (Legacy-Alias-Shape,
 *  aus getKundeFallDetailRecord). Bewusst Record<> waehrend der Transition — der
 *  Loader liefert (noch) untyped; volle Typisierung ist ein Folge-Schritt. */
export type ClaimDetailCoreKunde = Record<string, unknown>

/** Sub-Entity-Bundle — rollen-unabhaengige Struktur (Werte rollen-gescoped im Loader). */
type ClaimDetailBundle = {
  lifecycle: ClaimLifecycle
  auftraege: AuftragRow[]
  kanzleiFall: KanzleiFallRow | null
  pflichtDokumente: PflichtSlotForView[]
}

/** Rollen-diskriminierte Union: kunde-Core = flaches Record, staff/sv-Core = ClaimFull. */
export type ClaimDetail =
  | ({ rolle: 'kunde'; core: ClaimDetailCoreKunde } & ClaimDetailBundle)
  | ({ rolle: Exclude<Rolle, 'kunde'>; core: ClaimFull } & ClaimDetailBundle)
