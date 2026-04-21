'use server'

// AAR-539 (C2): Kanzlei-Paket-Reader Server-Action.
// Nimmt Paket-Typ + Feld-Werte + optional File entgegen,
// lädt die Datei in Supabase Storage hoch und ruft danach
// denselben C3-Webhook-Handler auf wie der echte LexDrive-Webhook.
// Side-Effects (SLA-Start, Mitteilungen, Status-Transition, Timeline)
// entstehen dadurch automatisch in process-event.ts — kein direktes
// UPDATE auf faelle aus dem UI.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  processLexDriveEvent,
  type LexDriveEventPayload,
} from '@/lib/lexdrive/process-event'
import { findPaketById } from '@/lib/fall/kanzlei-paket-config'

export interface ApplyKanzleiPaketInput {
  fallId: string
  paketId: string
  values: Record<string, string | number | boolean | null>
}

export interface ApplyKanzleiPaketResult {
  success: boolean
  error?: string
  eventRecordId?: string
  uploadedFilePath?: string
}

// FormData-Wrapper: Client schickt fields als JSON-String + optional File unter "file"
export async function applyKanzleiPaket(
  formData: FormData,
): Promise<ApplyKanzleiPaketResult> {
  const fallId = String(formData.get('fall_id') ?? '')
  const paketId = String(formData.get('paket_id') ?? '')
  const valuesRaw = String(formData.get('values') ?? '{}')
  const file = formData.get('file')

  if (!fallId) return { success: false, error: 'fall_id fehlt' }
  if (!paketId) return { success: false, error: 'paket_id fehlt' }

  const paket = findPaketById(paketId)
  if (!paket) return { success: false, error: `Paket-Typ "${paketId}" unbekannt` }

  let values: Record<string, unknown>
  try {
    values = JSON.parse(valuesRaw)
  } catch {
    return { success: false, error: 'Ungültige Feld-Werte (JSON-Parse-Fehler)' }
  }

  // Pflichtfeld-Validierung serverseitig
  for (const field of paket.fields) {
    if (field.type === 'computed') continue
    if (field.required) {
      const v = values[field.name]
      if (v === undefined || v === null || v === '') {
        return { success: false, error: `Pflichtfeld „${field.label}" fehlt` }
      }
    }
  }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (!['admin', 'kundenbetreuer'].includes(rolle ?? '')) {
    return {
      success: false,
      error: 'Nur Admin und Kundenbetreuer dürfen Kanzlei-Pakete einlesen',
    }
  }

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, fall_nummer')
    .eq('id', fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  // File-Upload falls konfiguriert und vorhanden
  let uploadedFilePath: string | undefined
  if (paket.file_upload && file instanceof File && file.size > 0) {
    const ext = file.name.split('.').pop() ?? 'pdf'
    const path = `kanzlei-pakete/${fallId}/${paket.id}-${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from('fall-dokumente')
      .upload(path, file)
    if (uploadErr) {
      return { success: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }
    }
    uploadedFilePath = path
    const { data: urlData } = supabase.storage.from('fall-dokumente').getPublicUrl(path)
    // upload_url in den Payload-Shape der C3-Handler spiegeln
    values.upload_url = urlData.publicUrl

    await supabase.from('fall_dokumente').insert({
      fall_id: fallId,
      dokument_typ: paket.file_upload.slot_id,
      original_filename: file.name,
      storage_path: path,
      groesse_bytes: file.size,
      mime_type: file.type || null,
      hochgeladen_von_user_id: user.id,
      quelle: 'kanzlei-paket',
    })
  }

  // Computed-Felder aus Config auswerten
  for (const field of paket.fields) {
    if (field.type === 'computed' && typeof field.computed === 'function') {
      values[field.name] = field.computed(values)
    }
  }

  const payload: LexDriveEventPayload = values as LexDriveEventPayload

  const result = await processLexDriveEvent({
    fallId,
    fallNr: fall.fall_nummer ?? fallId.slice(0, 8),
    eventType: paket.endpoint_event,
    payload,
    externalEventId: null,
    source: 'manual',
    triggeredByProfileId: user.id,
  })

  if (!result.success) {
    return { success: false, error: result.error, uploadedFilePath }
  }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath(`/faelle/${fallId}/prozess`)
  revalidatePath(`/faelle/${fallId}/dokumente`)

  return {
    success: true,
    eventRecordId: result.eventRecordId,
    uploadedFilePath,
  }
}
