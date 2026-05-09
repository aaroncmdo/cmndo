'use server'

// AAR-381: Server-Action-Wrapper für „Tagesmodus starten".
// Delegiert an Foundation-Lib `ensureTagesSession`.
//
// 2026-05-08 (C8): Optionaler `origin` (lat/lng) aus Browser-Geolocation
// wird als sachverstaendige.standort_lat/lng gespeichert — der Feldmodus
// nutzt das als Initial-Camera-Center. Vorher zeigte die Camera auf den
// stale Heimat-Standort (Aaron-Smoke „startpunkt ist der kölner dom"),
// jetzt auf die echte aktuelle SV-Position. RLS via auth-User identisch
// mit existing /api/track-Update-Path.

import { createClient } from '@/lib/supabase/server'
import { ensureTagesSession } from '@/lib/sv/tages-session'
import { getGutachterForUser } from '@/lib/gutachter'

export async function startOrResumeTagesSession(
  terminIds: string[],
  origin?: { lat: number; lng: number } | null,
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'unauthorized' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv?.id) return { success: false, error: 'no_sv' }

  if (terminIds.length === 0) {
    return { success: false, error: 'Keine Termine für heute gefunden.' }
  }

  // C8: aktuellen Standort als sachverstaendige.standort_lat/lng schreiben
  // damit FeldmodusPage beim Server-Render den echten Origin sieht.
  // Best-effort: Fehler hier brechen den Tagesmodus-Start NICHT.
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    try {
      await supabase
        .from('sachverstaendige')
        .update({ standort_lat: origin.lat, standort_lng: origin.lng })
        .eq('id', sv.id)
    } catch (err) {
      console.error('[startOrResumeTagesSession] origin-update failed:', err)
    }
  }

  const today = new Date()
  const session = await ensureTagesSession(sv.id, today, terminIds)
  if (!session) {
    return {
      success: false,
      error: 'Tagesroute konnte nicht angelegt werden. Bitte später nochmal versuchen oder Server-Log prüfen.',
    }
  }

  return { success: true, sessionId: session.id }
}
