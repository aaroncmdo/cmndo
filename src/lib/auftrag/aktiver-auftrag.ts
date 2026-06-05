'use server'

// CMM-36 / CMM-32d: Liefert den aktiven Auftrag des SVs für den Always-on-
// GPS-Hook. Lebt jetzt auf der auftraege-Sub-Entity (statt direkt auf
// gutachter_termine wie zuvor) — über den getNaechsterAktivenAuftragForSv
// Loader.

import { createClient } from '@/lib/supabase/server'
import { getNaechsterAktivenAuftragForSv } from '@/lib/auftrag/queries'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'

export type AktiverAuftrag = {
  modus: 'anfahrt' | 'vor-ort'
  terminId: string
  fallId: string
  startZeit: string
  geschaetzteFahrtzeitMin: number | null
  zielLat: number | null
  zielLng: number | null
  zielAdresse: string | null
} | null

export async function getAktiverAuftrag(svId: string): Promise<AktiverAuftrag> {
  const supabase = await createClient()
  const result = await getNaechsterAktivenAuftragForSv(supabase, svId)
  if (!result) return null

  // CMM-49: schadenort_* direkt aus claims (SSoT) via resolveClaimId.
  // CMM-44 SP-D PR2a: besichtigungsort_lat/lng aus gutachter_termine (terminId = GT-Row, SSoT).
  const aaClaimId = await resolveClaimId(supabase, result.auftrag.fall_id)
  const { data: fallClaim } = aaClaimId
    ? await supabase
        .from('claims')
        .select('schadenort_adresse, schadenort_plz, schadenort_ort')
        .eq('id', aaClaimId)
        .maybeSingle()
    : { data: null }

  const { data: terminLoc } = await supabase
    .from('gutachter_termine')
    .select('besichtigungsort_lat, besichtigungsort_lng')
    .eq('id', result.terminId)
    .maybeSingle()

  const zielAdresse =
    [fallClaim?.schadenort_adresse, fallClaim?.schadenort_plz, fallClaim?.schadenort_ort].filter(Boolean).join(', ') || null

  return {
    modus: result.modus,
    terminId: result.terminId,
    fallId: result.auftrag.fall_id,
    startZeit: result.startZeit,
    geschaetzteFahrtzeitMin: result.geschaetzteFahrtzeitMin,
    zielLat: (terminLoc?.besichtigungsort_lat as number | null) ?? null,
    zielLng: (terminLoc?.besichtigungsort_lng as number | null) ?? null,
    zielAdresse,
  }
}
