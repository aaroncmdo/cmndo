'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// Loest einen Makler-Promo-Code (`m` aus der Funnel-URL) zur Makler-Firma auf, damit der
// Funnel (Tool/Finder) durchgehend „Empfohlen von <Firma>" zeigen kann (Brand-Kontinuitaet
// vom Makler-Hub /m/<code> bis zur Buchung). Nur AKTIVE Codes + aktive Makler; leere/
// ungueltige/inaktive -> null. Service-Role (promotion_codes/makler sind RLS-gegated).
// Spiegelt marketing resolveMaklerByPromoCode (promotion_codes -> makler(firma, status)).
const CODE_RE = /^MK-[A-Z0-9]{4,12}$/i

export async function getMaklerEmpfehlung(
  code: string | null | undefined,
): Promise<{ firma: string } | null> {
  if (!code) return null
  const normalized = code.trim().toUpperCase()
  if (!CODE_RE.test(normalized)) return null

  const { data } = await createAdminClient()
    .from('promotion_codes')
    .select('makler:makler_id(firma, status)')
    .eq('code', normalized)
    .eq('aktiv', true)
    .maybeSingle()
  if (!data) return null

  // Nested-FK je nach Kardinalitaet Array|Objekt -> normalisieren (AGENTS.md §Inkonsistenz).
  const raw = (data as { makler: unknown }).makler
  const makler = (Array.isArray(raw) ? raw[0] : raw) as
    | { firma: string; status: string }
    | null
    | undefined
  if (!makler || makler.status !== 'aktiv') return null
  return { firma: makler.firma }
}
