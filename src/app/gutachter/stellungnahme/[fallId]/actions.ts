'use server'

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

  // Prüfe Zugehörigkeit + Status
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

  // Upload nach Supabase Storage
  const fileName = `technische_stellungnahme_${Date.now()}.pdf`
  const storagePath = `fall_dokumente/${fallId}/${fileName}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadErr } = await db.storage
    .from('dokumente')
    .upload(storagePath, arrayBuffer, { contentType: file.type || 'application/pdf' })

  if (uploadErr) return { success: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }

  const { data: urlData } = db.storage.from('dokumente').getPublicUrl(storagePath)

  // Dokument in DB speichern
  await db.from('fall_dokumente').insert({
    fall_id: fallId,
    typ: 'technische_stellungnahme',
    kategorie: 'technische_stellungnahme',
    datei_url: urlData.publicUrl,
    datei_name: file.name,
    datei_groesse: file.size,
    hochgeladen_von: user.id,
    hochgeladen_von_rolle: 'gutachter',
  })

  // Status aktualisieren
  await db.from('faelle').update({
    technische_stellungnahme_status: 'hochgeladen',
    technische_stellungnahme_hochgeladen_am: new Date().toISOString(),
  }).eq('id', fallId)

  // Timeline
  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'Technische Stellungnahme hochgeladen',
    beschreibung: notiz || 'SV hat technische Stellungnahme eingereicht. KB-Freigabe erforderlich.',
    erstellt_von: user.id,
  })

  // KB-Notification
  if (fall.kundenbetreuer_id) {
    await db.from('benachrichtigungen').insert({
      user_id: fall.kundenbetreuer_id,
      typ: 'stellungnahme-eingegangen',
      titel: `Stellungnahme eingegangen — Fall ${fall.fall_nummer ?? fallId.slice(0, 8)}`,
      beschreibung: 'SV hat technische Stellungnahme hochgeladen. Bitte Plausibilitäts-Check durchführen.',
      link: `/admin/faelle/${fallId}`,
    })
  }

  revalidatePath(`/gutachter/stellungnahme/${fallId}`)
  revalidatePath(`/admin/faelle/${fallId}`)
  return { success: true }
}
