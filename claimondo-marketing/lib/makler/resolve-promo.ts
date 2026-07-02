import type { SupabaseClient } from '@supabase/supabase-js'

// Loest einen Makler-Promo-Code (URL-Slug von /m/[code]) zum Makler auf.
// Genutzt vom Hub (/m/[code]) UND vom /check-Promo-Durchreichen (Leg 2).
// promotion_codes.code -> join makler_id -> { firma, status }. Nur aktive Codes.
export type MaklerHubTarget = {
  promotionCodeId: string
  maklerId: string
  firma: string
  aktiv: boolean
}

export async function resolveMaklerByPromoCode(
  sb: SupabaseClient,
  code: string,
): Promise<MaklerHubTarget | null> {
  const { data } = await sb
    .from('promotion_codes')
    .select('id, makler:makler_id(id, firma, status)')
    .eq('code', code)
    .eq('aktiv', true)
    .maybeSingle()

  if (!data) return null

  // Nested-FK je nach Kardinalitaet Array|Objekt -> normalisieren.
  const raw = (data as { makler: unknown }).makler
  const makler = (Array.isArray(raw) ? raw[0] : raw) as
    | { id: string; firma: string; status: string }
    | null
    | undefined
  if (!makler) return null

  return {
    promotionCodeId: (data as { id: string }).id,
    maklerId: makler.id,
    firma: makler.firma,
    aktiv: makler.status === 'aktiv',
  }
}
