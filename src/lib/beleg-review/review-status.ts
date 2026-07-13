// AAR-761: Pure Helper für den Beleg-OCR-Review-Lifecycle.
//
// Der Review-Status (approved/rejected/offen) lebt in
// ocr_extracted_data._review.status — bewusst ENTKOPPELT von der
// OCR-Pipeline-Spalte `ocr_status`, deren CHECK-Constraint
// (fall_dokumente_ocr_status_check) nur pending/processing/done/failed/
// skipped erlaubt. Ein früherer Ansatz schrieb den Review-Status direkt in
// `ocr_status` → Postgres verwarf jeden Write → approveBeleg/rejectBeleg
// lieferten immer {success:false}.
//
// Kein 'use server' hier: diese synchronen Helper werden sowohl von der
// Server-Action (actions.ts) als auch vom Unit-Test importiert — Non-async-
// Exports aus 'use server'-Files sind verboten (AGENTS.md / AAR-664).

export type BelegReviewStatus = 'approved' | 'rejected'

type MaybeExtract = Record<string, unknown> | null | undefined

/**
 * Liest den terminalen Review-Status aus ocr_extracted_data._review.status.
 * Alles außer 'approved'/'rejected' (kein _review, Legacy 'pending_review',
 * null) gilt als "noch offen" → null.
 */
export function belegReviewStatus(extract: MaybeExtract): BelegReviewStatus | null {
  const status = (extract as { _review?: { status?: unknown } } | null | undefined)?._review
    ?.status
  return status === 'approved' || status === 'rejected' ? status : null
}

/** Ein Beleg ist offen zum Review, solange er nicht approved/rejected ist. */
export function istOffenZumReview(extract: MaybeExtract): boolean {
  return belegReviewStatus(extract) === null
}

/**
 * Baut das fall_dokumente-Update für die Freigabe. Schreibt bewusst KEIN
 * `ocr_status` (das würde den CHECK verletzen) — nur den gemergten Extrakt
 * inkl. _review-Metadaten. KB-Korrekturen überschreiben das Claude-Extrakt.
 */
export function buildApproveUpdate(
  existing: MaybeExtract,
  corrections: Record<string, unknown> | undefined,
  reviewedBy: string,
  reviewedAt: string,
): { ocr_extracted_data: Record<string, unknown> } {
  return {
    ocr_extracted_data: {
      ...(existing ?? {}),
      ...(corrections ?? {}),
      _review: { status: 'approved', reviewed_by: reviewedBy, reviewed_at: reviewedAt },
    },
  }
}

/**
 * Baut das fall_dokumente-Update für die Ablehnung. Ebenfalls OHNE
 * `ocr_status`; hält Reviewer, Zeitstempel und Ablehnungs-Grund im _review.
 */
export function buildRejectUpdate(
  existing: MaybeExtract,
  reviewedBy: string,
  reviewedAt: string,
  grund: string,
): { ocr_extracted_data: Record<string, unknown> } {
  return {
    ocr_extracted_data: {
      ...(existing ?? {}),
      _review: { status: 'rejected', reviewed_by: reviewedBy, reviewed_at: reviewedAt, grund },
    },
  }
}
