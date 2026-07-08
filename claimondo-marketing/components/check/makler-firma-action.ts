'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { resolveMaklerByPromoCode } from '@/lib/makler/resolve-promo'

// Loest den Makler-Promo-Code (?m aus dem Funnel) zur Firma auf, damit /check „Empfohlen von
// <Firma>" zeigen kann (Brand-Kontinuitaet vom Makler-Hub /m/<code> durch den ganzen Funnel).
// Nur aktive Makler; leer/ungueltig/inaktiv -> null. Wrappt den bestehenden resolveMaklerByPromoCode
// als Server-Action, damit der /check-Client ihn ohne die Seite dynamisch zu machen aufrufen kann.
export async function getMaklerFirmaByCode(
  code: string | null | undefined,
): Promise<{ firma: string } | null> {
  if (!code) return null
  const target = await resolveMaklerByPromoCode(createServiceClient(), code)
  if (!target || !target.aktiv) return null
  return { firma: target.firma }
}
