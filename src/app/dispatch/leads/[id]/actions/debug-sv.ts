'use server'

// AAR-521: Server-Action für den "Warum?"-Button im SvDispatchPanel.
// Nur für Admin + Dispatch sichtbar — zeigt warum SVs gefiltert wurden.

import { createClient } from '@/lib/supabase/server'
import { debugSvMatchingByCoords, type DebugSvMatchingResponse } from '@/lib/dispatch/debugSvMatching'

export async function debugSvMatching(
  leadId: string,
): Promise<{ success: boolean; data?: DebugSvMatchingResponse; error?: string }> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  const rolle = (profile as { rolle: string } | null)?.rolle
  if (rolle !== 'admin' && rolle !== 'dispatch' && rolle !== 'kundenbetreuer') {
    return { success: false, error: 'Keine Berechtigung' }
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('unfallort_lat, unfallort_lng, kunde_lat, kunde_lng, wunschtermin')
    .eq('id', leadId)
    .single()

  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  const l = lead as {
    unfallort_lat: number | null
    unfallort_lng: number | null
    kunde_lat: number | null
    kunde_lng: number | null
    wunschtermin: string | null
  }
  const lat = l.unfallort_lat ?? l.kunde_lat
  const lng = l.unfallort_lng ?? l.kunde_lng
  if (lat == null || lng == null) {
    return { success: false, error: 'Lead hat keine Koordinaten (Unfallort/Kunden-Adresse fehlt)' }
  }

  const result = await debugSvMatchingByCoords(
    Number(lat),
    Number(lng),
    l.wunschtermin ?? undefined,
  )

  return { success: true, data: result }
}
