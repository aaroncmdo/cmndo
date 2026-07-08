'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPartnerRang } from '@/lib/partner-rang/get'
import type { Tier } from '@/lib/partner-rang/types'

// Loest einen Makler-Promo-Code (`m` aus der Funnel-URL) zur Makler-Firma auf, damit der
// Funnel (Tool/Finder) durchgehend „Empfohlen von <Firma>" zeigen kann (Brand-Kontinuitaet
// vom Makler-Hub /m/<code> bis zur Buchung). Nur AKTIVE Codes + aktive Makler; leere/
// ungueltige/inaktive -> null. Service-Role (promotion_codes/makler sind RLS-gegated).
// Spiegelt marketing resolveMaklerByPromoCode (promotion_codes -> makler(firma, status)).
const CODE_RE = /^MK-[A-Z0-9]{4,12}$/i

export async function getMaklerEmpfehlung(
  code: string | null | undefined,
): Promise<{ firma: string; tier: Tier | null } | null> {
  if (!code) return null
  const normalized = code.trim().toUpperCase()
  if (!CODE_RE.test(normalized)) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('promotion_codes')
    .select('makler_id, makler:makler_id(firma, status)')
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

  // Verdienter Tier fuer den Funnel-Badge ("Empfohlen von <Firma> · Gold-Partner").
  // getPartnerRang liefert null, wenn rang NULL ist — und rang ist per Cron-Invariante
  // (gateOk = aktiv; !aktiv => tier=null) genau dann NULL, wenn der Partner den Gate
  // nicht besteht. Also oeffentlich-ehrlich trotz Admin-Client (RLS-Bypass unschaedlich).
  const maklerId = (data as { makler_id: string | null }).makler_id
  const rang = maklerId ? await getPartnerRang(admin, 'makler', maklerId) : null
  return { firma: makler.firma, tier: rang?.tier ?? null }
}
