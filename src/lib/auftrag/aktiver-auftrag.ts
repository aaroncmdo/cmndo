'use server'

// CMM-36 / CMM-32d: Liefert den aktiven Auftrag des SVs für den Always-on-
// GPS-Hook. Lebt jetzt auf der auftraege-Sub-Entity (statt direkt auf
// gutachter_termine wie zuvor) — über den getNaechsterAktivenAuftragForSv
// Loader.

import { createClient } from '@/lib/supabase/server'
import { getNaechsterAktivenAuftragForSv } from '@/lib/auftrag/queries'

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

  // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
  const { data: fall } = await supabase
    .from('faelle')
    .select('besichtigungsort_lat, besichtigungsort_lng, claims:claim_id(schadenort_adresse, schadenort_plz, schadenort_ort)')
    .eq('id', result.auftrag.fall_id)
    .maybeSingle()
  const fallClaim = Array.isArray(fall?.claims) ? fall.claims[0] : fall?.claims

  const zielAdresse =
    [fallClaim?.schadenort_adresse, fallClaim?.schadenort_plz, fallClaim?.schadenort_ort].filter(Boolean).join(', ') || null

  return {
    modus: result.modus,
    terminId: result.terminId,
    fallId: result.auftrag.fall_id,
    startZeit: result.startZeit,
    geschaetzteFahrtzeitMin: result.geschaetzteFahrtzeitMin,
    zielLat: (fall?.besichtigungsort_lat as number | null) ?? null,
    zielLng: (fall?.besichtigungsort_lng as number | null) ?? null,
    zielAdresse,
  }
}
