import { createAdminClient } from '@/lib/supabase/admin'
import { toE164 } from '@/lib/format/telefon'

/**
 * Aktiviert den passwordless Telefon-Login fuer einen User, indem die Nummer
 * (E.164, confirmed) nach auth.users.phone gespiegelt wird. signInWithOtp loest
 * beim Login GEGEN auth.users.phone auf (nicht gegen profiles/leads.telefon) —
 * ohne diesen Spiegel findet der Telefon-Login das Konto nicht.
 *
 * FAIL-SAFE + KOLLISIONSSICHER: auth.users.phone ist UNIQUE. Ist die Nummer schon
 * einem anderen Konto zugeordnet, schlaegt updateUserById fehl; wir fangen das ab
 * und geben false zurueck — das aeltere Konto behaelt die Nummer, dieses Konto
 * faellt auf Email/Magic-Link zurueck. Der Aufrufer darf NIE daran scheitern
 * (best-effort). Rueckgabe true = der Sync griff (Login-per-Nummer aktiv).
 */
export async function enablePhoneLogin(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  phone: string | null,
): Promise<boolean> {
  const e164 = toE164(phone)
  if (!e164) return false
  try {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      phone: e164,
      phone_confirm: true,
    })
    if (error) {
      console.warn(
        '[phone-login] auth.users.phone-Sync uebersprungen (evtl. Nummer bereits vergeben):',
        error.message,
      )
      return false
    }
    return true
  } catch (err) {
    console.warn('[phone-login] auth.users.phone-Sync Ausnahme (non-critical):', err)
    return false
  }
}
