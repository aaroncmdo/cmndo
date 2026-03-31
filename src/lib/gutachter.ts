import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Zentraler Gutachter-Lookup: Findet den sachverstaendige-Eintrag für einen Auth-User.
 * Prüft sowohl profile_id als auch user_id (OR).
 * ALLE Gutachter-Seiten müssen diese Funktion nutzen.
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
    .single()
  return (data ?? null) as T | null
}
