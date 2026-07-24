'use server'

// Firmen-Flotten Admin-Actions: Schaden-Karten minten + NFC-beschreiben (staff-Variante).
// Das BINDEN ans Fahrzeug macht der Flottenmanager selbst (bindeKarteFuerFahrzeug im FM-Portal)
// — der Admin erzeugt + beschreibt nur. Wiederverwendet die KANONISCHE schadenkarte-Lib
// (89f501f6-owned, src/lib/schadenkarte/*); hier nur der staff-Wrapper hinter requireRole.
import { requireRole } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mintSchadenkarten, finalisiereSchadenkarte } from '@/lib/schadenkarte/schadenkarte'

// Ein Mint-Weg (reuse mintSchadenkarten, firma-gebunden):
//   - minteKartenBatchStaff: Batch (N Token -> QR-Druck -> spaeter ans Fahrzeug binden).
// Das NFC-Schreiben eines bereits gemintenten Tokens laeuft ueber finalisiereKarteStaff
// (per-Karte-Button in der Tabelle); der write-first-Provisioner wurde entfernt.

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

/** Nach verifiziertem NFC-Schreiben (staff): Chip-UID vermerken. Bewusst OHNE Bind —
 *  der Admin schreibt nur, gebunden wird ausschliesslich vom Flottenmanager (FM-Portal). */
export async function finalisiereKarteStaff(
  firmaId: string,
  token: string,
  nfcUid: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  const admin = createAdminClient()
  const res = await finalisiereSchadenkarte(admin, { token, firmaId, userId: user.id, nfcUid, fahrzeugId: null })
  if (res.ok) revalidatePath(`/admin/vertrieb/firmen-flotte/${firmaId}`)
  return res
}
