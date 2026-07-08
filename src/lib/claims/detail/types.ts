// src/lib/claims/detail/types.ts
// Phase C: der geteilte Claim-Detail-Vertrag. EINE Datenschicht fuer alle drei
// Rollen-Praesentationen (Phase D). Reine Komposition existierender Loader-
// Rueckgabetypen — kein neuer DB-Read. Access-Gate = getClaimForRole (RLS).
//
// Task 1 (dieser Commit) landet die eindeutigen Kern-Felder. timeline/workItem/
// permissions folgen in Task 2/3, WENN der erste echte Renderer ihre Assembly-
// Shape festzurrt (consumer-drives-shape). Siehe
// docs/superpowers/plans/2026-07-08-claim-C-getClaimDetail-loader.md.
import type { ClaimFull, Rolle } from '@/lib/claims/types'
import type { ClaimLifecycle } from '@/lib/claims/lifecycle'
import type { AuftragRow } from '@/lib/auftrag/queries'
import type { KanzleiFallRow } from '@/lib/kanzlei-fall/queries'
import type { PflichtSlotForView } from '@/components/fall/PflichtdokumenteSection'

export type ClaimDetail = {
  /** Die anfragende Rolle — Renderer scopen ihre Sicht daran. */
  rolle: Rolle
  /** Claim-Kern + Sub-Entities (parties/vehicle/payments/…), rollen-spalten-gescoped via COLUMN_PROFILES. */
  claim: ClaimFull
  /** A1-kanonische Phase (mainPhase/subPhase/serviceTyp/aktiverAuftrag/aktiveSideQuests). */
  lifecycle: ClaimLifecycle
  /** SV-Auftraege. NUR kb/admin (sonst []) — kein Column-Profile auf auftraege, no-leak-Default. */
  auftraege: AuftragRow[]
  /** Regulierungs-Entity. NUR kb/admin/kanzlei (sonst null). */
  kanzleiFall: KanzleiFallRow | null
  /** Pflicht-Dokumente-Slots, rollen-gescoped (getPflichtdokumenteForFall gated intern). */
  pflichtDokumente: PflichtSlotForView[]
}
