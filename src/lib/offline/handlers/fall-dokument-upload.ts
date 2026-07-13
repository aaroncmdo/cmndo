// src/lib/offline/handlers/fall-dokument-upload.ts
'use client'
import { createClient } from '@/lib/supabase/client'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface UploadPayload {
  fall_id: string
  dokument_typ: string
  ist_pflicht: boolean
  ab_phase: string | null
}

async function replay(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as UploadPayload
  const meta = op.blob_meta
  if (!op.blob || !meta) return { outcome: 'retry', error: 'Kein Blob im Op' }
  const supabase = createClient()

  const ext = meta.file_name.split('.').pop() ?? 'bin'
  const storagePath = `${p.fall_id}/${p.dokument_typ}_${op.idempotency_key}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('fall-dokumente')
    .upload(storagePath, op.blob, { contentType: meta.content_type, upsert: true })
  if (uploadErr) return { outcome: 'retry', error: uploadErr.message }

  const { data: user } = await supabase.auth.getUser()
  const isOcrable = meta.content_type === 'application/pdf' || meta.content_type.startsWith('image/')
  const { data: row, error: insertErr } = await supabase
    .from('fall_dokumente')
    .insert({
      idempotency_key: op.idempotency_key,
      fall_id: p.fall_id,
      dokument_typ: p.dokument_typ,
      ist_pflicht: p.ist_pflicht,
      ab_phase: p.ab_phase,
      storage_path: storagePath,
      original_filename: meta.file_name,
      mime_type: meta.content_type,
      groesse_bytes: meta.file_size,
      ocr_status: isOcrable ? 'pending' : 'skipped',
      hochgeladen_von_user_id: user?.user?.id ?? null,
    })
    .select('id')
    .single()

  if (insertErr) {
    if ((insertErr as { code?: string }).code === '23505') return { outcome: 'done' } // already synced
    return { outcome: 'retry', error: insertErr.message ?? 'DB-Insert fehlgeschlagen' }
  }
  if (!row) return { outcome: 'retry', error: 'Kein Row zurückgegeben' }

  if (isOcrable) {
    fetch('/api/ocr-trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dokument_id: row.id }),
    }).catch(() => {})
  }
  return { outcome: 'done' }
}

export const fallDokumentUploadHandler: OfflineHandler = { kind: 'fall_dokument_upload', replay }
registerHandler(fallDokumentUploadHandler)
