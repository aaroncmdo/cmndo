'use server'

// Firmen-Flotten Admin-Actions: Schaden-Karten minten + NFC beschreiben (staff-Variante).
// Wiederverwendet die KANONISCHE schadenkarte-Lib (89f501f6-owned, src/lib/schadenkarte/*);
// hier nur der staff-Wrapper hinter requireRole. Das Binden ans Fahrzeug macht der FM SELBST
// (Flotten-Portal / Tap-Panel) -> hier KEIN Bind-Wrapper mehr.
import { requireRole } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mintSchadenkarten, finalisiereSchadenkarte } from '@/lib/schadenkarte/schadenkarte'

// Zwei Mint-Wege (beide reuse mintSchadenkarten, firma-gebunden):
//   - minteKartenBatchStaff:        Batch (N Token -> QR-Druck), fuer vorgedruckte/QR-Karten.
//   - provisioniereKarteTokenStaff: mint-on-tap (1 Token) fuer den Tap-to-Provision-Weg
//     (NfcBlankoProvisionieren: Blanko-Chip antippen -> minten + schreiben in einem Zug).
// Das NFC-Schreiben eines bereits gemintenten Tokens laeuft ueber finalisiereKarteStaff
// (per-Karte-Button in der Tabelle). KEIN Bind-Wrapper (der FM bindet ans Fahrzeug).

/**
 * Batch-Mint (staff): N Blanko-Karten-Token fuer die gewaehlte Firma anlegen (status='bestellt').
 * Fuer vorgedruckte Karten: die Token werden ueber die Druckansicht als QR ausgegeben und
 * spaeter ans Fahrzeug gebunden. Optionale charge = Batch-Bezeichnung (fuer gezieltes Nachdrucken).
 */
export async function minteKartenBatchStaff(
  firmaId: string,
  anzahl: number,
  charge?: string | null,
): Promise<{ ok: true; anzahl: number; charge: string | null } | { ok: false; error: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const chargeVal = charge?.trim() || null
  const admin = createAdminClient()
  const res = await mintSchadenkarten(admin, { firmaId, anzahl, charge: chargeVal })
  if (!res.ok) return { ok: false, error: res.error }
  revalidatePath(`/admin/vertrieb/firmen-flotte/${firmaId}`)
  return { ok: true, anzahl: res.tokens.length, charge: chargeVal }
}

/** Blanko-Provisionierung (staff): einen frischen Karten-Token fuer die gewaehlte Firma minten
 *  (fuer den Tap-to-Provision-Weg NfcBlankoProvisionieren). KEIN Binden. */
export async function provisioniereKarteTokenStaff(
  firmaId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const admin = createAdminClient()
  const res = await mintSchadenkarten(admin, { firmaId, anzahl: 1 })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, token: res.tokens[0] }
}

/** Nach verifiziertem NFC-Schreiben (staff): Chip-UID vermerken + optional binden. */
export async function finalisiereKarteStaff(
  firmaId: string,
  token: string,
  nfcUid: string | null,
  fahrzeugId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  const admin = createAdminClient()
  const res = await finalisiereSchadenkarte(admin, { token, firmaId, userId: user.id, nfcUid, fahrzeugId })
  if (res.ok) revalidatePath(`/admin/vertrieb/firmen-flotte/${firmaId}`)
  return res
}
