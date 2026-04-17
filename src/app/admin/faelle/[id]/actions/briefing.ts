'use server'

// AAR-377: Server-Action für den Regenerate-Button in der Fallakte.
// Nur Admin und Kundenbetreuer dürfen regenerieren — SV und Kunde nicht
// (das Briefing ist Dispatch-Output für den SV, der SV soll nicht seinen
// eigenen Input manipulieren).

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { generateSvBriefing } from '@/lib/ai/briefing'

export async function regenerateSvBriefing(
  fallId: string,
): Promise<{ success: boolean; briefing?: string; version?: number; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  const rolle = profile?.rolle as string | undefined
  if (rolle !== 'admin' && rolle !== 'kundenbetreuer') {
    return { success: false, error: 'Nur Admin oder Kundenbetreuer dürfen das Briefing neu generieren' }
  }

  const result = await generateSvBriefing(fallId, { force: true })
  if (!result.success) {
    return { success: false, error: result.error ?? 'Generierung fehlgeschlagen' }
  }

  revalidatePath(`/admin/faelle/${fallId}`)
  revalidatePath(`/gutachter/fall/${fallId}`)

  return {
    success: true,
    briefing: result.briefing,
    version: result.version,
  }
}
