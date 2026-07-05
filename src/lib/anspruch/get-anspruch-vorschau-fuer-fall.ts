import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { AnspruchPosition, AnspruchSpanne, Schweregrad, TotalschadenInfo } from './types'

/**
 * KI-Vorschaetzung (aus dem Anspruch-pruefen-Tool) fuer die SV-Fallakte laden.
 * `admin` MUSS der service-role-Client sein (anspruch_schaetzungen ist RLS-deny-all) und
 * darf NUR aufgerufen werden, NACHDEM die SV<->Fall-Ownership geprueft wurde (getFallForSv).
 * Pfad: claimId -> claims.lead_id -> anspruch_schaetzungen.lead_id (neueste Schaetzung).
 */
export type AnspruchVorschau = {
  spanne: AnspruchSpanne
  beschaedigteTeile: string[]
  schweregrad: Schweregrad | null
  segment: string | null
  beschreibung: string | null
  fahrbereit: boolean | null
  ezJahr: number | null
}

export async function getAnspruchVorschauFuerFall(
  admin: SupabaseClient<Database>,
  claimId: string,
): Promise<AnspruchVorschau | null> {
  const { data: claim } = await admin
    .from('claims')
    .select('lead_id')
    .eq('id', claimId)
    .maybeSingle()
  const leadId = claim?.lead_id
  if (!leadId) return null

  const { data: sess } = await admin
    .from('anspruch_schaetzungen')
    .select('vision_result, positionen, erkanntes_segment, schweregrad, fahrbereit, ez_jahr, totalschaden')
    .eq('lead_id', leadId)
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!sess) return null

  const positionen = Array.isArray(sess.positionen)
    ? (sess.positionen as unknown as AnspruchPosition[])
    : []
  if (positionen.length === 0) return null

  const summierbar = positionen.filter(
    (p) => !p.gedecktDurchGegner && p.minEur != null && p.maxEur != null,
  )
  const gesamtMinEur = Math.round(summierbar.reduce((s, p) => s + (p.minEur as number), 0))
  const gesamtMaxEur = Math.round(summierbar.reduce((s, p) => s + (p.maxEur as number), 0))

  const vision = (sess.vision_result ?? {}) as { beschaedigte_teile?: unknown; beschreibung?: unknown }
  const beschaedigteTeile = Array.isArray(vision.beschaedigte_teile)
    ? vision.beschaedigte_teile.filter((t): t is string => typeof t === 'string')
    : []

  return {
    spanne: {
      positionen,
      gesamtMinEur,
      gesamtMaxEur,
      hinweise: [],
      ...(sess.totalschaden ? { totalschaden: sess.totalschaden as unknown as TotalschadenInfo } : {}),
    },
    beschaedigteTeile,
    schweregrad: (sess.schweregrad as Schweregrad | null) ?? null,
    segment: sess.erkanntes_segment ?? null,
    beschreibung: typeof vision.beschreibung === 'string' ? vision.beschreibung : null,
    fahrbereit: sess.fahrbereit,
    ezJahr: sess.ez_jahr,
  }
}
