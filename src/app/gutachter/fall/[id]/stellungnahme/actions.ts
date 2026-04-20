'use server'

// AAR-559 (C10): SV reicht technische Stellungnahme ein.
// Upload PDF → fall_dokumente → processLexDriveEvent('sv_stellungnahme_eingereicht')
// → faelle.technische_stellungnahme_status = 'hochgeladen' + KB-Mitteilung via Event.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { processLexDriveEvent } from '@/lib/lexdrive/process-event'
import { revalidatePath } from 'next/cache'

interface SubmitInput {
  fallId: string
  file: File
  notizSv?: string
}

export async function submitStellungnahme(
  input: SubmitInput,
): Promise<{ success: boolean; error?: string }> {
  if (!input.fallId) return { success: false, error: 'fall_id fehlt' }
  if (!input.file || input.file.size === 0) return { success: false, error: 'Keine Datei ausgewählt' }

  const MAX_MB = 20
  if (input.file.size > MAX_MB * 1024 * 1024) {
    return { success: false, error: `Datei zu groß (max. ${MAX_MB} MB)` }
  }
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']
  if (!allowedTypes.includes(input.file.type)) {
    return { success: false, error: 'Nur PDF, JPEG oder PNG erlaubt' }
  }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein SV-Profil gefunden' }

  const db = createAdminClient()
  const { data: fall } = await db
    .from('faelle')
    .select('id, fall_nummer, sv_id, technische_stellungnahme_status')
    .eq('id', input.fallId)
    .eq('sv_id', sv.id)
    .maybeSingle()

  if (!fall) return { success: false, error: 'Fall nicht gefunden oder nicht autorisiert' }
  if (fall.technische_stellungnahme_status === 'hochgeladen') {
    return { success: false, error: 'Stellungnahme wurde bereits eingereicht' }
  }

  const ext = input.file.name.split('.').pop() ?? 'pdf'
  const storagePath = `${input.fallId}/stellungnahme/sv_stellungnahme_${Date.now()}.${ext}`

  const arrayBuffer = await input.file.arrayBuffer()
  const { error: uploadErr } = await db.storage
    .from('fall-dokumente')
    .upload(storagePath, arrayBuffer, {
      contentType: input.file.type,
      upsert: false,
    })

  if (uploadErr) {
    return { success: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }
  }

  // Eintrag in fall_dokumente (sichtbar für Admin + KB + SV)
  await db.from('fall_dokumente').insert({
    fall_id: input.fallId,
    dokument_typ: 'technische_stellungnahme',
    storage_path: storagePath,
    original_filename: input.file.name,
    mime_type: input.file.type,
    groesse_bytes: input.file.size,
    hochgeladen_von_user_id: user.id,
    uploaded_by_sv: true,
    sichtbar_fuer: ['sachverstaendiger', 'kundenbetreuer', 'admin'],
  })

  // Notiz direkt auf faelle schreiben wenn vorhanden
  const notiz = input.notizSv?.trim() ?? ''
  if (notiz) {
    await db
      .from('faelle')
      .update({ technische_stellungnahme_notiz_sv: notiz })
      .eq('id', input.fallId)
  }

  // Event triggert: status = 'hochgeladen', hochgeladen_am + KB-Mitteilung
  const result = await processLexDriveEvent({
    fallId: input.fallId,
    fallNr: (fall.fall_nummer as string | null) ?? input.fallId.slice(0, 8),
    eventType: 'sv_stellungnahme_eingereicht',
    payload: {
      eingereicht_am: new Date().toISOString(),
      storage_path: storagePath,
      notiz_sv: notiz || undefined,
    },
    externalEventId: null,
    source: 'manual',
    triggeredByProfileId: user.id,
  })

  if (!result.success) {
    return { success: false, error: result.error ?? 'Speichern fehlgeschlagen' }
  }

  revalidatePath(`/gutachter/fall/${input.fallId}`)
  revalidatePath(`/gutachter/fall/${input.fallId}/stellungnahme`)
  revalidatePath(`/faelle/${input.fallId}`)
  revalidatePath(`/faelle/${input.fallId}/prozess`)
  return { success: true }
}
