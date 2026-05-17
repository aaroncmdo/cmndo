'use server'

// AAR-93: SV-Portal Reklamations-Server-Action
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { revalidatePath } from 'next/cache'

// AAR-664 (Folge): Konstante REKLAMATIONS_GRUENDE in eigene Datei
// `./constants` extrahiert (Memory: `'use server'-Konstanten-Falle`).
// Wird in dieser Action nicht referenziert — Client importiert direkt.

export async function createReklamation(data: {
  fallId: string
  grund: string
  begruendung: string
  nachweisStoragePath?: string | null
}): Promise<{ success: boolean; reklamationId?: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  if (!data.begruendung || data.begruendung.trim().length < 30) {
    return { success: false, error: 'Begruendung muss mindestens 30 Zeichen haben.' }
  }

  // SV-ID des angemeldeten Users
  const { data: svData } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!svData) return { success: false, error: 'Kein SV-Account gefunden' }

  const { data: reklamation, error } = await supabase
    .from('reklamationen')
    .insert({
      fall_id: data.fallId,
      sv_id: svData.id,
      grund: data.grund,
      begruendung: data.begruendung.trim(),
      nachweis_storage_path: data.nachweisStoragePath ?? null,
      status: 'offen',
      eingereicht_am: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }

  // Benachrichtigungen via Admin-Client
  // CMM-44 SP-A: kundenbetreuer_id + claim_nummer aus dem claims-Embed (SSoT).
  const admin = createAdminClient()
  const { data: fall } = await admin
    .from('faelle')
    .select('claims:claim_id(kundenbetreuer_id, claim_nummer)')
    .eq('id', data.fallId)
    .single()
  const fallClaim = Array.isArray(fall?.claims) ? fall.claims[0] : fall?.claims

  if (fallClaim?.kundenbetreuer_id) {
    await createNotification(
      fallClaim.kundenbetreuer_id,
      'reklamation-neu',
      `Neue Reklamation: Fall ${(fallClaim?.claim_nummer as string | null) ?? ''}`,
      `Grund: ${data.grund}. ${data.begruendung.slice(0, 100)}...`,
      `/faelle/${data.fallId}?tab=reklamationen`,
    ).catch(() => {})
  }
  const { data: admins } = await admin.from('profiles').select('id').eq('rolle', 'admin')
  for (const a of admins ?? []) {
    await createNotification(
      a.id,
      'reklamation-neu',
      `SV-Reklamation: ${(fallClaim?.claim_nummer as string | null) ?? 'Fall'}`,
      `${data.grund}: ${data.begruendung.slice(0, 100)}`,
      `/faelle/${data.fallId}?tab=reklamationen`,
    ).catch(() => {})
  }

  // Timeline
  await admin.from('timeline').insert({
    fall_id: data.fallId,
    typ: 'reklamation',
    titel: 'SV-Reklamation eroeffnet',
    beschreibung: `Grund: ${data.grund}. ${data.begruendung.slice(0, 200)}`,
    erstellt_von: user.id,
  })

  revalidatePath('/gutachter/reklamationen')
  return { success: true, reklamationId: reklamation.id }
}
