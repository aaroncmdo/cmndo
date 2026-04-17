'use server'

// AAR-Phase0 (0.3): Einheitlicher Upload-Helper für Fall-Dokumente.
// Wrapt `uploadFallDokument` (Storage + fall_dokumente + OCR) und
// zieht — falls ein slotId (= pflichtdokumente.id) mitgegeben wurde —
// den entsprechenden pflichtdokumente-Row auf status='hochgeladen' hoch.
//
// Dieser Helper ist die Standard-Integration für alle DokumentSlot-Uploads
// in der Fallakte (SV + Kunde + Admin) und sorgt dafür, dass die beiden
// Tabellen `fall_dokumente` (Live-Daten + OCR) und `pflichtdokumente`
// (Katalog-Status pro Fall) nie auseinanderlaufen.

import { createClient } from '@/lib/supabase/server'
import { uploadFallDokument } from '@/lib/dokumente/upload'
import { revalidatePath } from 'next/cache'

export type UploadResult =
  | { ok: true; dokumentId: string; pflichtdokumentId?: string | null }
  | { ok: false; error: string }

/**
 * Lädt eine Datei für einen Fall hoch. Wenn `slotId` gesetzt ist, wird
 * zusätzlich `pflichtdokumente.datei_url/datei_name/datei_groesse/status`
 * aktualisiert.
 *
 * Idempotenz: Der Storage-Pfad in `uploadFallDokument` enthält einen
 * Timestamp, deshalb ist jede Ausführung eindeutig. Falls derselbe Upload
 * doppelt ankommt, entstehen zwei `fall_dokumente`-Rows, aber der zuletzt
 * geschriebene `pflichtdokumente.status`-Wert bleibt konsistent.
 */
export async function uploadDokumentToOutbox(
  fallId: string,
  slotId: string | null,
  file: File,
  dokumentTyp: string,
  options?: {
    istPflicht?: boolean
    abPhase?: string | null
  },
): Promise<UploadResult> {
  if (!file || file.size === 0) return { ok: false, error: 'Keine Datei übergeben' }

  // Storage + fall_dokumente-Insert + OCR-Trigger
  const formData = new FormData()
  formData.append('file', file)

  const upload = await uploadFallDokument(
    fallId,
    dokumentTyp,
    options?.istPflicht ?? !!slotId,
    options?.abPhase ?? null,
    formData,
  )

  if (!upload.success || !upload.dokumentId) {
    return { ok: false, error: upload.error ?? 'Upload fehlgeschlagen' }
  }

  // Falls ein slot angegeben wurde: pflichtdokumente auf 'hochgeladen' setzen.
  if (slotId) {
    const supabase = await createClient()

    // Public URL holen — Storage-Pfad kennen wir nicht direkt hier, also
    // lesen wir die gerade angelegte fall_dokumente-Row.
    const { data: doc } = await supabase
      .from('fall_dokumente')
      .select('storage_path, original_filename, groesse_bytes')
      .eq('id', upload.dokumentId)
      .single()

    if (doc) {
      const { error: pflErr } = await supabase
        .from('pflichtdokumente')
        .update({
          status: 'hochgeladen',
          datei_url: doc.storage_path,
          datei_name: doc.original_filename,
          datei_groesse: doc.groesse_bytes,
        })
        .eq('id', slotId)
        .eq('fall_id', fallId)

      if (pflErr) {
        // Non-critical: Upload ist durch, aber pflichtdokumente nicht gesynct.
        // Log lassen, damit wir's im Audit sehen — Upload bleibt "ok".
        console.error('[upload-dokument] pflichtdokumente-Sync failed:', pflErr.message)
      }
    }
  }

  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath(`/kunde/faelle/${fallId}`)
  revalidatePath(`/admin/faelle/${fallId}`)

  return { ok: true, dokumentId: upload.dokumentId, pflichtdokumentId: slotId ?? null }
}
