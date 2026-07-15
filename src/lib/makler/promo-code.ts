import 'server-only'

// Geteilte Makler-Promo-Code-Logik. Vorher modul-privat in admin/makler/actions.ts;
// extrahiert, damit der get-or-create-Pfad (Makler-Anfrage) denselben Generator nutzt
// statt zu duplizieren. Service-role-Client fuer den Insert (promotion_codes ist
// default-deny fuer authenticated).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

const PROMO_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // ohne I/O/0/1 (Verwechslungsschutz)

// Code-Laenge: MK- + 4 Zeichen (kurz + teilbar; kanonisches Format, Aaron 15.07.).
// Kollisionsraum 31^4 ≈ 923k — alle Insert-Pfade (anlege-makler/anlege-partner/getOrCreate)
// retryen 3x gegen die Unique-Constraint, daher bei realistischer Makler-Zahl unkritisch.
// Die Validatoren erwarten teils exakt {4} (schaden-melden/mini-wizard) -> 4 haelt sie alle ein.
const PROMO_CODE_LEN = 4

/** Generiert einen Makler-Promo-Code 'MK-XXXX' (4 Zeichen aus dem verwechslungsarmen Alphabet). */
export function generatePromoCode(): string {
  let s = ''
  const array = new Uint8Array(PROMO_CODE_LEN)
  crypto.getRandomValues(array)
  for (let i = 0; i < PROMO_CODE_LEN; i++) s += PROMO_CHARS[array[i] % PROMO_CHARS.length]
  return 'MK-' + s
}

/**
 * Liefert den primaeren aktiven Promo-Code des Maklers — legt einen an, falls keiner
 * existiert (Legacy-Makler oder deaktivierter Code). Die Makler-Attribution darf nie
 * an einem fehlenden Code scheitern (sonst Provision verloren). Retry bei Unique-Kollision.
 */
export async function getOrCreateMaklerPromoCode(
  admin: SupabaseClient<Database>,
  maklerId: string,
): Promise<{ id: string; code: string } | null> {
  const { data: vorhanden } = await admin
    .from('promotion_codes')
    .select('id, code')
    .eq('makler_id', maklerId)
    .eq('aktiv', true)
    .order('erstellt_am', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (vorhanden?.id) return { id: vorhanden.id as string, code: vorhanden.code as string }

  for (let i = 0; i < 3; i++) {
    const code = generatePromoCode()
    const { data, error } = await admin
      .from('promotion_codes')
      .insert({ makler_id: maklerId, code, aktiv: true })
      .select('id, code')
      .single()
    if (!error && data) return { id: data.id as string, code: data.code as string }
    if (error && !/duplicate|unique/i.test(error.message)) {
      console.error('[getOrCreateMaklerPromoCode] Insert fehlgeschlagen:', error.message)
      return null
    }
  }
  return null
}
