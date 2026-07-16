import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Laedt notiz_intern aus gutachter_termine_intern (Staff-only-Tabelle) fuer die gegebenen
 * Termin-IDs -> Map termin_id -> notiz_intern.
 *
 * Teil der honorar/notiz-Auslagerung (Kunde-Leak-Fix, [[coordination-gutachter-termine-honorar-notiz-auslagerung]]):
 * notiz_intern lebt nicht mehr auf gutachter_termine (wo der Kunde sie via is_claim_user_party
 * per direktem PostgREST lesen konnte), sondern in gutachter_termine_intern mit Staff-only-RLS
 * (can_read_gutachter_termin_intern). Die Staff-Anzeige-Reader holen die Notiz jetzt hierueber;
 * ein Kunde bekommt eine leere Map (RLS filtert).
 *
 * gutachter_termine_intern ist (noch) nicht in database.types.ts -> as-any wie bei anderen
 * jungen Tabellen (embed_sites-Muster).
 */
export async function ladeInterneTerminNotizen(
  supabase: SupabaseClient,
  terminIds: (string | null | undefined)[],
): Promise<Record<string, string | null>> {
  const ids = [...new Set(terminIds.filter((x): x is string => Boolean(x)))]
  if (ids.length === 0) return {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('gutachter_termine_intern')
    .select('termin_id, notiz_intern')
    .in('termin_id', ids)
  const map: Record<string, string | null> = {}
  for (const r of (data ?? []) as Array<{ termin_id: string; notiz_intern: string | null }>) {
    map[r.termin_id] = r.notiz_intern
  }
  return map
}
