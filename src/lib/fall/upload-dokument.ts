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

import { createAdminClient } from '@/lib/supabase/admin'
import { uploadFallDokument } from '@/lib/dokumente/upload'
import { revalidatePath } from 'next/cache'

export type UploadResult =
  | { ok: true; dokumentId: string; pflichtdokumentId?: string | null }
  | { ok: false; error: string }

/**
 * Lädt eine Datei für einen Fall hoch. Wenn `slotId` gesetzt ist, wird
 * zusätzlich `pflichtdokumente.dokument_url/hochgeladen_am/status`
 * aktualisiert (reale Spaltennamen — AAR-386 Audit hat den Drift
 * aufgedeckt, Vorgänger-Code schrieb auf nicht-existente Spalten).
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
    // Admin-Client: `uploadFallDokument` hat oben bereits geprueft, dass dieser
    // User in DIESEN Fall schreiben darf — ohne die Berechtigung waere der Upload
    // gar nicht so weit gekommen. Der Write bleibt zusaetzlich auf
    // (slotId, fallId) eingegrenzt, kann also keinen fremden Slot treffen.
    // Ueber den RLS-Client lief er bei Rollen, die `pflichtdokumente__b1sel_au`
    // nicht kennt (z.B. Kundenbetreuer), auf 0 Zeilen — und wurde unten nur
    // geloggt, war also still. Gleiche Klasse wie #5736/#5754.
    const admin = createAdminClient()

    // Storage-Pfad der gerade angelegten fall_dokumente-Row lesen.
    const { data: doc } = await admin
      .from('fall_dokumente')
      .select('storage_path')
      .eq('id', upload.dokumentId)
      .single()

    if (doc) {
      const { error: pflErr } = await admin
        .from('pflichtdokumente')
        .update({
          status: 'hochgeladen',
          dokument_url: doc.storage_path,
          hochgeladen_am: new Date().toISOString(),
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
  revalidatePath(`/gutachter/feldmodus`)
  revalidatePath(`/kunde/faelle/${fallId}`)
  revalidatePath(`/faelle/${fallId}`)

  return { ok: true, dokumentId: upload.dokumentId, pflichtdokumentId: slotId ?? null }
}
