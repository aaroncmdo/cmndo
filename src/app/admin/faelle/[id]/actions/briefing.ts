'use server'

// AAR-377: Server-Action für den Regenerate-Button in der Fallakte.
// Nur Admin und Kundenbetreuer dürfen regenerieren — SV und Kunde nicht
// (das Briefing ist Dispatch-Output für den SV, der SV soll nicht seinen
// eigenen Input manipulieren).
//
// AAR-385: Zusätzlich `regenerateSvBriefingStruktur` für das strukturierte
// Briefing (kurzversion + hinweise[] + warnungen[] + checkliste_vor_ort[]).
// Rate-Limit: max. 1 Regeneration pro Fall pro 10min (außer Admin).

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { generateSvBriefing } from '@/lib/ai/briefing'
import { generateSvBriefingStruktur } from '@/lib/ai/briefing-structured'
import type { SvBriefingStruktur } from '@/lib/types/field-modus'

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

const RATE_LIMIT_MS = 10 * 60 * 1000 // 10 Minuten

export async function regenerateSvBriefingStruktur(fallId: string): Promise<{
  success: boolean
  briefing?: SvBriefingStruktur
  generated_by?: 'ai' | 'fallback'
  error?: string
}> {
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
    return {
      success: false,
      error: 'Nur Admin oder Kundenbetreuer dürfen das Briefing neu generieren',
    }
  }

  // Rate-Limit: 10min Sperre, Admin darf overriden.
  if (rolle !== 'admin') {
    const { data: fall } = await supabase
      .from('faelle')
      .select('updated_at, sv_briefing_struktur')
      .eq('id', fallId)
      .single()

    const struktur = fall?.sv_briefing_struktur as Record<string, unknown> | null
    const lastRun = (fall?.updated_at as string | null) ?? null
    if (struktur && lastRun) {
      const elapsed = Date.now() - new Date(lastRun).getTime()
      if (Number.isFinite(elapsed) && elapsed < RATE_LIMIT_MS) {
        const restMin = Math.ceil((RATE_LIMIT_MS - elapsed) / 60_000)
        return {
          success: false,
          error: `Rate-Limit: bitte in ${restMin}min erneut versuchen (Admin darf sofort).`,
        }
      }
    }
  }

  const result = await generateSvBriefingStruktur(fallId)
  if (!result.success) {
    return { success: false, error: result.error ?? 'Generierung fehlgeschlagen' }
  }

  revalidatePath(`/admin/faelle/${fallId}`)
  revalidatePath(`/gutachter/fall/${fallId}`)

  return {
    success: true,
    briefing: result.briefing,
    generated_by: result.generated_by,
  }
}
