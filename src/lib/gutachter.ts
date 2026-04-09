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
 *
 * KFZ-154 Follow-up: ORDER BY ist_parent_account ASC + max_faelle_monat DESC
 * sodass im BUG-93-Fall (Inhaber-mit-Hauptbuero-Checkbox: 2 Rows mit gleichem
 * profile_id, eine rolle='inhaber' max=0, eine rolle='mitarbeiter' max>0) die
 * Mitarbeiter-Row deterministisch gewinnt — sonst wuerde der Inhaber im
 * Gutachter-Portal wechselnd 0 Faelle / 0 Werbebudget sehen. Die /willkommen-
 * Page ist NICHT betroffen weil sie eine eigene SV-Liste mit rolle-Prioritaet
 * laedt (siehe app/gutachter/willkommen/page.tsx).
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
    .order('ist_parent_account', { ascending: true, nullsFirst: true })
    .order('max_faelle_monat', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  return (data ?? null) as T | null
}
