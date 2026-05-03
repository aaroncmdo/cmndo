'use server'

// AAR-838: OCR-Pipeline Server-Actions
//
// 3 Actions:
//   uploadGutachtenPdf            — SV lädt PDF hoch, ocr_status=pending,
//                                    triggert Edge Function fire-and-forget
//   retryGutachtenOcr             — KB klickt Retry bei OCR-Fehler
//   manuallyOverrideGutachtenFields — KB nimmt Werte manuell auf bei OCR-Fail
//
// Edge-Function-Trigger: supabase.functions.invoke('gutachten-ocr', ...).
// Fire-and-forget — Cron-Recovery (alle 5 Min) holt stuck pending-Rows ab.

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitEvent } from '@/lib/notifications/emit'

type ActionResult = { ok: true; data?: Record<string, unknown> } | { ok: false; error: string }

const MAX_PDF_BYTES = 50 * 1024 * 1024 // 50 MB

// ── 1) uploadGutachtenPdf ──────────────────────────────────────────────────

export async function uploadGutachtenPdf(input: {
  gutachten_id: string
  /** PDF-Bytes als base64 (Client encodiert vor Senden) */
  pdf_base64: string
  filename: string
  size_bytes: number
}): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'sachverstaendiger'])
  if (!auth.success) return { ok: false, error: auth.error }

  if (input.size_bytes > MAX_PDF_BYTES) {
    return { ok: false, error: 'PDF zu groß (max. 50 MB)' }
  }

  const admin = createAdminClient()

  // Gutachten + claim_id laden
  const { data: gutachten, error: fetchErr } = await admin
    .from('gutachten')
    .select('id, claim_id, sv_id, status, ocr_status')
    .eq('id', input.gutachten_id)
    .maybeSingle()
  if (fetchErr || !gutachten) return { ok: false, error: 'Gutachten nicht gefunden' }

  // Ownership-Check für SV
  if (auth.user.rolle === 'sachverstaendiger') {
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('id')
      .eq('profile_id', auth.user.id)
      .maybeSingle()
    if (!sv || sv.id !== gutachten.sv_id) {
      return { ok: false, error: 'Nicht berechtigt für dieses Gutachten' }
    }
  }

  // Upload in Storage
  const pdfBuffer = Buffer.from(input.pdf_base64, 'base64')
  const storagePath = `${gutachten.claim_id}/${gutachten.id}/1_${Date.now()}.pdf`

  const { error: uploadErr } = await admin.storage
    .from('gutachten-pdfs')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    })
  if (uploadErr) return { ok: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }

  // Gutachten-Update: PDF-Metadaten + ocr_status=pending
  const { error: updateErr } = await admin
    .from('gutachten')
    .update({
      bericht_pdf_url:         storagePath,
      pdf_uploaded_at:         new Date().toISOString(),
      pdf_uploaded_by_user_id: auth.user.id,
      pdf_size_bytes:          input.size_bytes,
      ocr_status:              'pending',
    })
    .eq('id', input.gutachten_id)
  if (updateErr) return { ok: false, error: updateErr.message }

  // fall_id für emit + revalidate
  const { data: fall } = await admin
    .from('faelle')
    .select('id')
    .eq('claim_id', gutachten.claim_id as string)
    .maybeSingle()
  const fallId = (fall?.id as string | null) ?? null

  // Edge Function fire-and-forget triggern
  try {
    await admin.functions.invoke('gutachten-ocr', {
      body: { gutachten_id: input.gutachten_id, run_nummer: 1, triggered_by: 'auto_after_upload' },
    })
  } catch (err) {
    console.error('[AAR-838] Edge-Function-Trigger fehlgeschlagen:', err)
    // Non-blocking — Cron-Recovery holt pending-Row in 5 Min ab
  }

  if (fallId) revalidatePath(`/faelle/${fallId}`)
  return { ok: true, data: { storagePath, ocrStatus: 'pending' } }
}

// ── 2) retryGutachtenOcr ───────────────────────────────────────────────────

export async function retryGutachtenOcr(input: {
  gutachten_id: string
  engine?: 'claude_vision' | 'google_vision'
  force_reset?: boolean
}): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'kundenbetreuer'])
  if (!auth.success) return { ok: false, error: auth.error }

  const admin = createAdminClient()

  // Aktuellen Run-Stand laden
  const { data: gutachten } = await admin
    .from('gutachten')
    .select('id, claim_id, ocr_status')
    .eq('id', input.gutachten_id)
    .maybeSingle()
  if (!gutachten) return { ok: false, error: 'Gutachten nicht gefunden' }

  // Aktuellen Run auf 'superseded' setzen
  await admin
    .from('ocr_runs')
    .update({ status: 'superseded', finished_at: new Date().toISOString() })
    .eq('gutachten_id', input.gutachten_id)
    .in('status', ['running', 'failed'])

  // Nächste run_nummer berechnen
  const { data: lastRun } = await admin
    .from('ocr_runs')
    .select('run_nummer')
    .eq('gutachten_id', input.gutachten_id)
    .order('run_nummer', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextRunNummer = ((lastRun?.run_nummer as number | null) ?? 0) + 1

  // Force-Reset: alte Positionen löschen
  if (input.force_reset) {
    await admin
      .from('gutachten_positionen')
      .delete()
      .eq('gutachten_id', input.gutachten_id)
  }

  // ocr_status zurück auf pending
  await admin
    .from('gutachten')
    .update({
      ocr_status:      'pending',
      ocr_started_at:  null,
      ocr_finished_at: null,
      ocr_error_jsonb: null,
    })
    .eq('id', input.gutachten_id)

  // Edge Function triggern
  try {
    await admin.functions.invoke('gutachten-ocr', {
      body: {
        gutachten_id:  input.gutachten_id,
        run_nummer:    nextRunNummer,
        triggered_by:  auth.user.rolle === 'admin' ? 'manual_admin_retry' : 'manual_kb_retry',
        engine_hint:   input.engine,
      },
    })
  } catch (err) {
    console.error('[AAR-838] Edge-Function-Retry-Trigger fehlgeschlagen:', err)
  }

  const { data: fall } = await admin
    .from('faelle')
    .select('id')
    .eq('claim_id', gutachten.claim_id as string)
    .maybeSingle()
  if (fall?.id) revalidatePath(`/faelle/${fall.id}`)

  return { ok: true, data: { run_nummer: nextRunNummer } }
}

// ── 3) manuallyOverrideGutachtenFields ─────────────────────────────────────

export async function manuallyOverrideGutachtenFields(input: {
  gutachten_id: string
  /** Felder die manuell gesetzt werden — Schema deckt nur die existierenden Spalten */
  fields: {
    gesamt_schadensbetrag?: number
    auftragsnummer?:        string
    notiz?:                 string
  }
  grund?: string
}): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'kundenbetreuer'])
  if (!auth.success) return { ok: false, error: auth.error }

  const admin = createAdminClient()

  // Quellen-Tracking: pro überschriebenem Feld 'manual' setzen
  const quelleUpdate: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.fields)) {
    if (value !== undefined && value !== null) quelleUpdate[key] = 'manual'
  }

  const { data: current } = await admin
    .from('gutachten')
    .select('felder_quelle_jsonb, claim_id')
    .eq('id', input.gutachten_id)
    .maybeSingle()
  if (!current) return { ok: false, error: 'Gutachten nicht gefunden' }

  const mergedQuelle = {
    ...((current.felder_quelle_jsonb as Record<string, string> | null) ?? {}),
    ...quelleUpdate,
  }

  const { error } = await admin
    .from('gutachten')
    .update({
      ...input.fields,
      felder_quelle_jsonb:  mergedQuelle,
      ocr_status:           'manuell_uebersteuert',
      ocr_engine:           'manual',
      ocr_finished_at:      new Date().toISOString(),
      status:               'final',
      notiz:                input.grund ?? `Manuell überschrieben durch ${auth.user.rolle}`,
    })
    .eq('id', input.gutachten_id)

  if (error) return { ok: false, error: error.message }

  // Notification an KB + Geschädigter
  const { data: fall } = await admin
    .from('faelle')
    .select('id')
    .eq('claim_id', current.claim_id as string)
    .maybeSingle()

  if (fall?.id) {
    try {
      await emitEvent(
        'gutachten.fertig',
        {
          fallId:       fall.id as string,
          gutachtenId:  input.gutachten_id,
          pdfUrl:       '',
        },
        { fallId: fall.id as string, triggeredBy: auth.user.id },
      )
    } catch (err) {
      console.error('[AAR-838] emit gutachten.fertig fehlgeschlagen:', err)
    }
    revalidatePath(`/faelle/${fall.id}`)
  }

  return { ok: true }
}
