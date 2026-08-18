'use server'

// AAR-761 Phase 3: KB/Admin-Review für Beleg-OCR-Extrakte.
// Quelle: fall_dokumente mit kategorie='rechnung' + quelle='kunde_upload_ocr'
// plus gefüllter ocr_extracted_data. Der Review-State (approved/rejected/
// offen) lebt komplett in ocr_extracted_data._review (jsonb) — NICHT in
// ocr_status. ocr_status ist der OCR-Pipeline-Zustand mit CHECK-Constraint
// (pending/processing/done/failed/skipped); der Review fasst ihn nicht an.
// Die reinen Lifecycle-Helper liegen in ./review-status.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { revalidatePath } from 'next/cache'
import type { BelegTyp, BelegExtraktion } from '@/lib/ocr-beleg/types'
import { getStorageUrl } from '@/lib/storage/url'
import {
  istOffenZumReview,
  buildApproveUpdate,
  buildRejectUpdate,
} from './review-status'

async function requireAdminOrKb(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  const rolle = (profile?.rolle as string | null) ?? null
  if (rolle !== 'admin' && rolle !== 'kundenbetreuer') {
    return { ok: false, error: 'Nicht berechtigt (nur Admin/KB)' }
  }
  return { ok: true, userId: user.id }
}

export type BelegReviewItem = {
  id: string
  fall_id: string
  typ: BelegTyp
  ocr_status: string | null
  ocr_extracted_data: BelegExtraktion | null
  hochgeladen_am: string
  original_filename: string | null
  storage_path: string
  preview_url: string | null
}

export async function listBelegeZumReview(
  fallId: string,
): Promise<BelegReviewItem[]> {
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('fall_dokumente')
    .select(
      'id, fall_id, dokument_typ, ocr_status, ocr_extracted_data, hochgeladen_am, original_filename, storage_path',
    )
    .eq('fall_id', fallId)
    .eq('kategorie', 'rechnung')
    .eq('quelle', 'kunde_upload_ocr')
    .is('geloescht_am', null)
    .order('hochgeladen_am', { ascending: false })

  if (!rows) return []

  // Queue = alle noch nicht approved/rejected Belege. Der Review-State liegt
  // im _review-JSONB, NICHT in ocr_status (das steht per Default auf 'pending').
  const pending = rows.filter((r) =>
    istOffenZumReview(r.ocr_extracted_data as unknown as Record<string, unknown> | null),
  )
  return Promise.all(
    pending.map(async (r) => {
      const path = r.storage_path as string
      // Inline-OCR-Uploads haben synthetische storage_path — wir zeigen
      // die URL nur wenn der Path nicht die Inline-Marker enthält.
      const preview_url = path.includes('ocr-extrakt/')
        ? null
        : await getStorageUrl(admin, 'fall-dokumente', path)
      return {
        id: r.id as string,
        fall_id: r.fall_id as string,
        typ: r.dokument_typ as BelegTyp,
        ocr_status: (r.ocr_status as string | null) ?? null,
        ocr_extracted_data:
          (r.ocr_extracted_data as unknown as BelegExtraktion | null) ?? null,
        hochgeladen_am: r.hochgeladen_am as string,
        original_filename: (r.original_filename as string | null) ?? null,
        storage_path: path,
        preview_url,
      }
    }),
  )
}

type ApproveInput = {
  dokumentId: string
  corrections?: Partial<BelegExtraktion>
}

export async function approveBeleg(
  input: ApproveInput,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdminOrKb()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = createAdminClient()
  const { data: dok } = await admin
    .from('fall_dokumente')
    .select('id, fall_id, dokument_typ, ocr_extracted_data')
    .eq('id', input.dokumentId)
    .maybeSingle()
  if (!dok) return { success: false, error: 'Dokument nicht gefunden' }

  // Corrections mergen — die vom KB korrigierten Felder überschreiben das
  // Claude-Extrakt. Der Review-Status landet im _review-JSONB, NICHT in
  // ocr_status (das würde den CHECK-Constraint verletzen).
  const update = buildApproveUpdate(
    dok.ocr_extracted_data as unknown as Record<string, unknown> | null,
    input.corrections as unknown as Record<string, unknown> | undefined,
    auth.userId,
    new Date().toISOString(),
  )

  const { error: upErr } = await admin
    .from('fall_dokumente')
    .update(update)
    .eq('id', input.dokumentId)
  if (upErr) return { success: false, error: upErr.message }

  // Fachliche Mappings. Weitere Typen + Feld-Schreibungen folgen in
  // nachgelagerten Tickets.
  // CMM-44 SP-B PR2c: mietwagen_rechnung_vorhanden lebt auf claims (SSoT) —
  // Write geht auf claims via claim_id.
  const typ = dok.dokument_typ as BelegTyp
  const fallId = dok.fall_id as string
  if (typ === 'mietwagen_rechnung') {
    const claimId = await resolveClaimId(admin, fallId)
    if (claimId) {
      const { error: belegFehler } = await admin
        .from('claims')
        .update({ mietwagen_rechnung_vorhanden: true })
        .eq('id', claimId)
      if (belegFehler) {
        console.error(`[beleg-review] Mietwagen-Rechnung nicht vermerkt (Claim ${claimId}):`, belegFehler.message)
      }
    }
  }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath(`/admin/faelle/${fallId}`)
  revalidatePath(`/kunde/faelle/${fallId}`)
  return { success: true }
}

type RejectInput = {
  dokumentId: string
  grund: string
}

export async function rejectBeleg(
  input: RejectInput,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdminOrKb()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!input.grund.trim()) return { success: false, error: 'Grund erforderlich' }

  const admin = createAdminClient()
  const { data: dok } = await admin
    .from('fall_dokumente')
    .select('id, fall_id, ocr_extracted_data')
    .eq('id', input.dokumentId)
    .maybeSingle()
  if (!dok) return { success: false, error: 'Dokument nicht gefunden' }

  const update = buildRejectUpdate(
    dok.ocr_extracted_data as unknown as Record<string, unknown> | null,
    auth.userId,
    new Date().toISOString(),
    input.grund.trim(),
  )

  const { error: upErr } = await admin
    .from('fall_dokumente')
    .update(update)
    .eq('id', input.dokumentId)
  if (upErr) return { success: false, error: upErr.message }

  const fallId = dok.fall_id as string
  revalidatePath(`/faelle/${fallId}`)
  revalidatePath(`/admin/faelle/${fallId}`)
  revalidatePath(`/kunde/faelle/${fallId}`)
  return { success: true }
}
