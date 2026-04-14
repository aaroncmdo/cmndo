'use server'

// AAR-93: SV-Portal Reklamations-Server-Action
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { revalidatePath } from 'next/cache'

export const REKLAMATIONS_GRUENDE = [
  { value: 'kunde-no-show', label: 'Kunde war nicht da (No-Show)' },
  { value: 'schaden-anders', label: 'Schaden anders als beschrieben' },
  { value: 'daten-unvollstaendig', label: 'Daten unvollstaendig' },
  { value: 'doppel-termin', label: 'Doppel-Termin' },
  { value: 'mehrfach-verschoben', label: 'Termin mehrfach verschoben' },
  { value: 'sonstiges', label: 'Sonstiges' },
] as const

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
    .or(`profile_id.eq.${user.id},user_id.eq.${user.id}`)
    .maybeSingle()
  if (!svData) return { success: false, error: 'Kein SV-Account gefunden' }

  const { data: reklamation, error } = await supabase
    .from('reklamationen')
    .insert({
      fall_id: data.fallId,
      gutachter_id: svData.id,
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
  const admin = createAdminClient()
  const { data: fall } = await admin
    .from('faelle')
    .select('kundenbetreuer_id, fall_nummer')
    .eq('id', data.fallId)
    .single()

  if (fall?.kundenbetreuer_id) {
    await createNotification(
      fall.kundenbetreuer_id,
      'reklamation-neu',
      `Neue Reklamation: Fall ${fall.fall_nummer ?? ''}`,
      `Grund: ${data.grund}. ${data.begruendung.slice(0, 100)}...`,
      `/admin/faelle/${data.fallId}?tab=reklamationen`,
    ).catch(() => {})
  }
  const { data: admins } = await admin.from('profiles').select('id').eq('rolle', 'admin')
  for (const a of admins ?? []) {
    await createNotification(
      a.id,
      'reklamation-neu',
      `SV-Reklamation: ${fall?.fall_nummer ?? 'Fall'}`,
      `${data.grund}: ${data.begruendung.slice(0, 100)}`,
      `/admin/faelle/${data.fallId}?tab=reklamationen`,
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
