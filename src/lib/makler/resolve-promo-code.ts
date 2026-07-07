import { createAdminClient } from '@/lib/supabase/admin'

// Loest einen Makler-Promo-Code (z.B. "MK-ABCD") zur promotion_codes.id auf.
// Nur AKTIVE Codes; leere/ungueltige/unbekannte/inaktive -> null. Service-Role, da
// Anon promotion_codes nicht lesen darf (RLS). Spiegelt die Inline-Logik in
// /api/promo/track (CODE_RE + aktiv-Gate) und marketing lib/makler/resolve-promo.
const CODE_RE = /^MK-[A-Z0-9]{4,12}$/i

export async function resolvePromoCodeToId(code: string | null | undefined): Promise<string | null> {
  if (!code) return null
  const normalized = code.trim().toUpperCase()
  if (!CODE_RE.test(normalized)) return null

  const { data } = await createAdminClient()
    .from('promotion_codes')
    .select('id, aktiv')
    .eq('code', normalized)
    .maybeSingle()

  if (!data || !data.aktiv) return null
  return data.id as string
}
