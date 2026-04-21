import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Zentraler Gutachter-Lookup: Findet den sachverstaendige-Eintrag für einen Auth-User.
 *
 * AAR SV-Audit-Follow-up: Nutzt jetzt nur noch profile_id. Das Legacy-
 * user_id-Feld wird in der begleitenden Migration gedropt (inkl. RLS-
 * Policy-Update auf sv_update_own). ALLE Gutachter-Seiten nutzen diese Funktion.
 *
 * ARCH-1 Phase 2 Update: nutzt jetzt .limit(1).maybeSingle() statt .single()
 * weil ein User mehrere SV-Eintraege haben kann (z.B. Buero-Inhaber UND
 * gleichzeitig Mitarbeiter eines Sub-Standorts mit derselben Email, oder
 * mehrere Sub-Standorte unter einer Email gemanaged von einer Person).
 *
 * KFZ-154 Follow-up: ORDER BY ist_parent_account ASC + paket_faelle_gesamt DESC
 * sodass im BUG-93-Fall (Inhaber-mit-Hauptbuero-Checkbox: 2 Rows mit gleichem
 * profile_id, eine rolle='inhaber' max=0, eine rolle='mitarbeiter' max>0) die
 * Mitarbeiter-Row deterministisch gewinnt — sonst würde der Inhaber im
 * Gutachter-Portal wechselnd 0 Fälle / 0 Werbebudget sehen. Die /willkommen-
 * Page ist NICHT betroffen weil sie eine eigene SV-Liste mit rolle-Priorität
 * lädt (siehe app/gutachter/willkommen/page.tsx).
 */
export async function getGutachterForUser<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  userId: string,
  select = '*'
): Promise<T | null> {
  const { data } = await supabase
    .from('sachverstaendige')
    .select(select)
    .eq('profile_id', userId)
    .order('ist_parent_account', { ascending: true, nullsFirst: true })
    .order('paket_faelle_gesamt', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  return (data ?? null) as T | null
}
