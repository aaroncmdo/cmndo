// AAR-483 (M1): Query-Helper für Makler-Portal. Jede Funktion nutzt die
// auth-aware SSR-Client-Instanz, sodass die RLS-Policies aus
// aar483_m1_makler_additive_rls greifen und Makler nur ihre eigenen Rows
// sehen. Admins/KB/Dispatch sehen via anderer Policies weiterhin alles.

import { createClient } from '@/lib/supabase/server'

export type MaklerRow = {
  id: string
  user_id: string | null
  firma: string
  ansprechpartner_vorname: string
  status: string
  erstellt_am: string
}

/** Holt die Makler-Row für den eingeloggten User (oder null). */
export async function getCurrentMakler(): Promise<MaklerRow | null> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return null
  const { data } = await supabase
    .from('makler')
    .select('id, user_id, firma, ansprechpartner_vorname, status, erstellt_am')
    .eq('user_id', user.id)
    .maybeSingle()
  return data
}

/**
 * Leads für einen Makler — über promotion_code_id → promotion_codes.makler_id.
 * Nutzt Nested-FK-Filter via `!inner`, damit Leads ohne Promo-Code (optional
 * nullable FK) für Makler unsichtbar bleiben.
 */
export async function getMaklerLeads(maklerId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('leads')
    .select(`
      id, service_typ, status, erstellt_am,
      promotion_code:promotion_codes!inner(id, code, makler_id)
    `)
    .eq('promotion_code.makler_id', maklerId)
    .order('erstellt_am', { ascending: false })
  return data ?? []
}

/**
 * Fälle eines Maklers — nur mit aktivem Consent (widerrufen_am IS NULL).
 * Cardinality ist many-to-one, dennoch kann Supabase den Nested-Select je
 * nach Session als Array liefern — Consumer muss `Array.isArray(x) ? x[0] : x`
 * normalisieren.
 */
export async function getMaklerFaelle(maklerId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('makler_fall_consent')
    .select(`
      id, consent_scope, consent_gegeben_am, widerrufen_am,
      fall:faelle!inner(id, status, service_typ)
    `)
    .eq('makler_id', maklerId)
    .is('widerrufen_am', null)
    .order('consent_gegeben_am', { ascending: false })
  return data ?? []
}
