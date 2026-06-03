import { createClient } from '@/lib/supabase/server'

// AAR-467 C1: Löst einen Promo-Code (z.B. MK-AB12) zur promotion_codes.id
// auf. Wird in C2 beim Lead-Insert genutzt, um die Makler-Provisions-Spur
// zu setzen. Nur aktive Codes matchen.

export async function resolvePromoCodeToId(code: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('promotion_codes')
    .select('id')
    .eq('code', code)
    .eq('aktiv', true)
    .maybeSingle()
  return data?.id ?? null
}
