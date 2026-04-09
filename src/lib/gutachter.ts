import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Zentraler Gutachter-Lookup: Findet den sachverstaendige-Eintrag für einen Auth-User.
 * Prüft sowohl profile_id als auch user_id (OR).
 * ALLE Gutachter-Seiten müssen diese Funktion nutzen.
 *
 * ARCH-1 Phase 2 Update: nutzt jetzt .limit(1).maybeSingle() statt .single()
 * weil ein User mehrere SV-Eintraege haben kann (z.B. Buero-Inhaber UND
 * gleichzeitig Mitarbeiter eines Sub-Standorts mit derselben Email, oder
 * mehrere Sub-Standorte unter einer Email gemanaged von einer Person).
 * Limit 1 + maybeSingle() ist tolerant: bei 0 Treffern → null, bei >=1 → erster.
 */
export async function getGutachterForUser<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  userId: string,
  select = '*'
): Promise<T | null> {
  const { data } = await supabase
    .from('sachverstaendige')
    .select(select)
    .or(`profile_id.eq.${userId},user_id.eq.${userId}`)
    .limit(1)
    .maybeSingle()
  return (data ?? null) as T | null
}
