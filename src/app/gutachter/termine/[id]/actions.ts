'use server'

// AAR-126: Server Action für Polizeibericht-Upload durch den SV.
// Wird vom Termin-Detail aufgerufen wenn der Kunde den Bericht nicht
// rechtzeitig hochgeladen hat und der SV ihn vor Ort einholt.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { revalidatePath } from 'next/cache'

export async function uploadPolizeiberichtAsSv(
  fallId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const file = formData.get('file') as File | null
  const aktenzeichen = (formData.get('aktenzeichen') as string | null)?.trim() || null

  if (!file || file.size === 0) {
    return { success: false, error: 'Keine Datei ausgewählt' }
  }

  // Auth: SV muss für diesen Fall zuständig sein
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein Sachverständigen-Profil' }

  const adminDb = createAdminClient()
  const { data: fall } = await adminDb
    .from('faelle')
    .select('id, sv_id')
    .eq('id', fallId)
    .single()

  if (!fall || fall.sv_id !== sv.id) {
    return { success: false, error: 'Fall nicht gefunden oder nicht zugewiesen' }
  }

  // Storage-Upload
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `gutachter/${fallId}/polizeibericht_${Date.now()}.${ext}`
  const { error: uploadErr } = await adminDb.storage
    .from('dokumente')
    .upload(path, file)
  if (uploadErr) return { success: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }

  const { data: urlData } = adminDb.storage.from('dokumente').getPublicUrl(path)
  const dokumentUrl = urlData.publicUrl

  // Pflichtdokumente-Row updaten ODER neu anlegen (für Pre-AAR-125 Fälle)
  const { data: existing } = await adminDb
    .from('pflichtdokumente')
    .select('id')
    .eq('fall_id', fallId)
    .eq('dokument_typ', 'polizeibericht')
    .maybeSingle()

  if (existing?.id) {
    const { error: upErr } = await adminDb
      .from('pflichtdokumente')
      .update({
        dokument_url: dokumentUrl,
        hochgeladen_am: new Date().toISOString(),
        status: 'hochgeladen',
        quelle: 'sachverstaendiger',
      })
      .eq('id', existing.id)
    if (upErr) return { success: false, error: `pflichtdokumente-Update: ${upErr.message}` }
  } else {
    // Backfill: row hat gefehlt (z.B. Pre-AAR-125 Fall)
    const { error: insErr } = await adminDb.from('pflichtdokumente').insert({
      fall_id: fallId,
      dokument_typ: 'polizeibericht',
      pflicht: true,
      status: 'hochgeladen',
      quelle: 'sachverstaendiger',
      dokument_url: dokumentUrl,
      hochgeladen_am: new Date().toISOString(),
    })
    if (insErr) return { success: false, error: `pflichtdokumente-Insert: ${insErr.message}` }
  }

  // dokumente-Row für Fallakte-Übersicht (gleicher Pattern wie uploadDokument)
  await adminDb.from('dokumente').insert({
    fall_id: fallId,
    typ: 'polizeibericht',
    datei_url: dokumentUrl,
    datei_name: file.name,
    datei_groesse: file.size,
    kategorie: 'kundendokument',
    quelle: 'gutachter',
    hochgeladen_von: user.id,
    hochgeladen_von_rolle: 'sachverstaendiger',
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  }).then(() => {}, () => {})

  // Aktenzeichen optional in faelle nachpflegen wenn vorhanden
  if (aktenzeichen) {
    await adminDb
      .from('faelle')
      .update({ polizei_aktenzeichen: aktenzeichen })
      .eq('id', fallId)
  }

  // Timeline-Eintrag
  await adminDb.from('timeline').insert({
    fall_id: fallId,
    typ: 'dokument',
    titel: 'Polizeibericht vor Ort aufgenommen',
    beschreibung: aktenzeichen
      ? `Der Sachverständige hat den Polizeibericht vor Ort eingeholt. Aktenzeichen: ${aktenzeichen}`
      : 'Der Sachverständige hat den Polizeibericht vor Ort eingeholt.',
    erstellt_von: user.id,
  }).then(() => {}, () => {})

  revalidatePath(`/gutachter/termine/${fallId}`)
  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath('/kunde')
  revalidatePath(`/kunde/faelle/${fallId}`)
  revalidatePath(`/admin/faelle/${fallId}`)

  return { success: true }
}
