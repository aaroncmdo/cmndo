import type { SupabaseClient } from '@supabase/supabase-js'
import type { MusikStimmung } from './schema'

/**
 * Musik-Bett-Resolver: mappt die vom Skript gewaehlte Stimmung auf einen kuratierten,
 * cleared/CC0-Track im Storage. Existenz wird geprueft -> fehlt der Track, gibt es KEIN
 * Bett (null) und die Pipeline rendert wie bisher (Stimme pur). So laeuft die Mechanik
 * schon, bevor Tracks kuratiert sind; das Hochladen der Tracks aktiviert das Bett automatisch.
 */

const BUCKET = 'marketing-content'
const PREFIX = 'music'

// Pro Stimmung ein Objekt-Key <PREFIX>/<stimmung>.mp3 im marketing-content-Bucket.
const TRACK_BY_MOOD: Record<MusikStimmung, string> = {
  ruhig: `${PREFIX}/ruhig.mp3`,
  dringlich: `${PREFIX}/dringlich.mp3`,
  aufbauend: `${PREFIX}/aufbauend.mp3`,
  serioes: `${PREFIX}/serioes.mp3`,
}

export async function resolveMusik(
  stimmung: MusikStimmung | undefined,
  supabase: SupabaseClient,
): Promise<string | null> {
  const key = TRACK_BY_MOOD[stimmung ?? 'serioes']
  const fileName = key.slice(PREFIX.length + 1)
  const { data, error } = await supabase.storage.from(BUCKET).list(PREFIX, { search: fileName })
  if (error || !data?.some((f) => f.name === fileName)) return null
  return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl
}
