'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { revalidatePath } from 'next/cache'

// KFZ-172 Phase 2: Upload-Server-Action fuer Fall-Dokumente.
// Speichert in Supabase Storage Bucket 'fall-dokumente' und erstellt
// einen Eintrag in fall_dokumente mit ocr_status='pending'.
//
// Dieser Pfad war von `20260513220337_aar_storage_buckets_lock` (13.05.) bis heute
// TOT: Upload + Insert liefen ueber den RLS-Client, und die Migration sperrt
// `fall-dokumente` fuer JEDEN authenticated. In `fall_dokumente` gab es dadurch
// **0 Zeilen im Muster `<fallId>/<typ>_<ts>.<ext>`, jemals** (bei 174 Zeilen aus
// anderen, admin-basierten Pfaden). Auf prod gemessen als SV (30.08.):
// "Upload fehlgeschlagen: new row violates row-level security policy".
//
// ⛔ Der Fix ist NICHT nur "Client tauschen" — die Action hatte **keinen
// Fall-Bezug-Guard**: `fallId` kommt vom Aufrufer. Mit Admin-Client allein
// koennte jeder Eingeloggte mit fremder `fallId` in fremde Akten laden.
// Deshalb steht unten ZUERST der Guard (Sichtbarkeit ueber `v_claim_full` mit dem
// RLS-Client) und erst danach der Admin-Client fuer Storage + Insert — dieselbe
// Reihenfolge wie in `pflicht-for-fall.ts`.

export async function uploadFallDokument(
  fallId: string,
  dokumentTyp: string,
  istPflicht: boolean,
  abPhase: string | null,
  formData: FormData,
): Promise<{ success: boolean; error?: string; dokumentId?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const file = formData.get('file') as File | null
  if (!file) return { success: false, error: 'Keine Datei' }

  // Validierung
  const maxSize = 10 * 1024 * 1024 // 10 MB
  if (file.size > maxSize) return { success: false, error: 'Datei zu groß (max 10 MB)' }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: 'Nur JPG, PNG, WebP oder PDF erlaubt' }
  }

  // GUARD (vor jedem Admin-Zugriff): Darf dieser User in DIESEN Fall schreiben?
  // Gelesen wird mit dem RLS-Client ueber `v_claim_full` — die View traegt
  // `claim_sichtbar_fuer_aktuellen_user()`, also exakt die Sichtbarkeit, die auch
  // die Fallakte gewaehrt (Owner/Party/SV/Makler/Werkstatt/KB/Kanzlei/Admin).
  // Bewusst rollenunabhaengig: die Rolle steuert in `getClaimForRole` nur die
  // Spaltenauswahl, gefiltert wird ohnehin von der View.
  const claimId = await resolveClaimId(supabase, fallId)
  if (!claimId) return { success: false, error: 'Fall nicht gefunden' }

  const { data: sichtbar } = await supabase
    .from('v_claim_full')
    .select('id')
    .eq('id', claimId)
    .maybeSingle()
  if (!sichtbar) return { success: false, error: 'Kein Zugriff auf diesen Fall' }

  // Storage Path
  const ext = file.name.split('.').pop() ?? 'bin'
  const timestamp = Date.now()
  const storagePath = `${fallId}/${dokumentTyp}_${timestamp}.${ext}`

  // Ab hier Admin-Client: der Bucket ist fuer authenticated gesperrt (s.o.),
  // die Berechtigung ist mit dem Guard oben bereits geklaert.
  const admin = createAdminClient()

  // Upload in Storage
  const { error: uploadErr } = await admin.storage
    .from('fall-dokumente')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadErr) {
    // Falls Bucket noch nicht existiert: graceful error
    return { success: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }
  }

  // DB-Eintrag — ebenfalls Admin: die INSERT-Policy auf `fall_dokumente` kennt
  // nicht jede schreibberechtigte Rolle (gleiche Klasse wie #5736/#5754).
  const { data: row, error: insertErr } = await admin
    .from('fall_dokumente')
    .insert({
      fall_id: fallId,
      dokument_typ: dokumentTyp,
      ist_pflicht: istPflicht,
      ab_phase: abPhase,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      groesse_bytes: file.size,
      ocr_status: file.type === 'application/pdf' || file.type.startsWith('image/') ? 'pending' : 'skipped',
      hochgeladen_von_user_id: user.id,
    })
    .select('id')
    .single()

  if (insertErr || !row) {
    return { success: false, error: `DB-Eintrag fehlgeschlagen: ${insertErr?.message}` }
  }

  revalidatePath(`/faelle/${fallId}`, 'page')
  revalidatePath(`/gutachter/fall/${fallId}`, 'page')

  // KFZ-172 Phase 3: OCR triggern (fire & forget, async)
  if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
    fetch(`${baseUrl}/api/ocr-trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dokument_id: row.id }),
    }).catch(() => {})
  }

  return { success: true, dokumentId: row.id }
}

export async function deleteFallDokument(
  dokumentId: string,
  fallId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('fall_dokumente')
    .update({ geloescht_am: new Date().toISOString() })
    .eq('id', dokumentId)

  if (error) return { success: false, error: error.message }

  revalidatePath(`/faelle/${fallId}`, 'page')
  revalidatePath(`/gutachter/fall/${fallId}`, 'page')

  return { success: true }
}
