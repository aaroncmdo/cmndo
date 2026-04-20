'use server'

// AAR-400: Technische Stellungnahme — Inline-Upload aus der StellungnahmeCard
// heraus. Ersetzt die frühere Route /gutachter/stellungnahme/[fallId].
//
// Flow: PDF in Supabase Storage → fall_dokumente-Row → faelle.technische_
// stellungnahme_status='hochgeladen' → Timeline + KB-Notification.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { revalidatePath } from 'next/cache'

export async function uploadTechnischeStellungnahme(
  fallId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein SV-Profil' }

  const db = createAdminClient()

  const { data: fall } = await db
    .from('faelle')
    .select('id, fall_nummer, technische_stellungnahme_status, sv_id, kundenbetreuer_id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) return { success: false, error: 'Fall nicht gefunden oder nicht autorisiert' }
  if (fall.technische_stellungnahme_status !== 'beauftragt') {
    return { success: false, error: 'Keine offene Stellungnahme-Anforderung' }
  }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { success: false, error: 'Keine Datei ausgewählt' }
  if (file.size > 20 * 1024 * 1024) return { success: false, error: 'Datei zu groß (max 20 MB)' }

  const notiz = (formData.get('notiz') as string) ?? ''

  const fileName = `technische_stellungnahme_${Date.now()}.pdf`
  const storagePath = `fall_dokumente/${fallId}/${fileName}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadErr } = await db.storage
    .from('fall-dokumente')
    .upload(storagePath, arrayBuffer, { contentType: file.type || 'application/pdf' })

  if (uploadErr) return { success: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }

  await db.from('fall_dokumente').insert({
    fall_id: fallId,
    dokument_typ: 'technische_stellungnahme',
    ist_pflicht: false,
    ab_phase: '5',
    storage_path: storagePath,
    original_filename: file.name,
    mime_type: file.type || 'application/pdf',
    groesse_bytes: file.size,
    hochgeladen_von_user_id: user.id,
    uploaded_by_sv: true,
    uploaded_by_kunde: false,
  })

  await db
    .from('faelle')
    .update({
      technische_stellungnahme_status: 'hochgeladen',
      technische_stellungnahme_hochgeladen_am: new Date().toISOString(),
    })
    .eq('id', fallId)

  // Timeline (non-critical)
  try {
    await db.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: 'Technische Stellungnahme hochgeladen',
      beschreibung:
        notiz || 'SV hat technische Stellungnahme eingereicht. KB-Freigabe erforderlich.',
      erstellt_von: user.id,
    })
  } catch (err) {
    console.error('[uploadTechnischeStellungnahme] Timeline-Insert fehlgeschlagen:', err)
  }

  // KB-Notification (non-critical)
  if (fall.kundenbetreuer_id) {
    try {
      await db.from('benachrichtigungen').insert({
        user_id: fall.kundenbetreuer_id,
        typ: 'stellungnahme-eingegangen',
        titel: `Stellungnahme eingegangen — Fall ${fall.fall_nummer ?? fallId.slice(0, 8)}`,
        beschreibung:
          'SV hat technische Stellungnahme hochgeladen. Bitte Plausibilitäts-Check durchführen.',
        link: `/faelle/${fallId}`,
      })
    } catch (err) {
      console.error('[uploadTechnischeStellungnahme] Benachrichtigung fehlgeschlagen:', err)
    }
  }

  // AAR-431: Kanzlei-SLA „Rüge-Versand" (2 WT) starten
  try {
    const { startKanzleiSla } = await import('@/lib/sla/kanzlei-tracker')
    const { addWorkingDays } = await import('@/lib/sla/workdays')
    await startKanzleiSla(fallId, 'kanzlei_ruege_versand', {
      phase: 'technische_stellungnahme',
      deadline: addWorkingDays(new Date(), 2),
      target_rolle: 'kanzlei',
    })
  } catch (err) {
    console.error('[AAR-431] startKanzleiSla(ruege_versand) fehlgeschlagen:', err)
  }

  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}
