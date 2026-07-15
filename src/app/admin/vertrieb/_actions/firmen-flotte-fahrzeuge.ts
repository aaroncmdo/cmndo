'use server'

// Firmen-Flotten Admin-Actions: Fahrzeuge einer Flotte verwalten (staff-Variante).
// Wiederverwendet die geteilte mutate-flotte-Lib (NICHT firma-gated — der Ownership-Gate liegt
// beim Caller). Hier ist der Caller staff (requireRole admin/dispatch), darf also cross-firma.
import { requireRole } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { addFahrzeugToFlotte, removeFahrzeugFromFlotte } from '@/lib/flotte/mutate-flotte'
import { scanZb1FuerFlotte } from '@/lib/flotte/zb1-scan'
import { legeFlottenFahrzeugeAn, type BatchAnlageZeile, type BatchAnlageErgebnis } from '@/lib/flotte/zb1-batch-anlage'
import type { FahrzeugForm } from '@/lib/kunde/firma-flotte'

export async function fuegeFahrzeugZuFlotteHinzu(
  firmaId: string,
  form: FahrzeugForm,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  const admin = createAdminClient()
  const res = await addFahrzeugToFlotte(admin, firmaId, form, user.id)
  if (!res.ok) return res
  revalidatePath(`/admin/vertrieb/firmen-flotte/${firmaId}`)
  return { ok: true }
}

export async function entferneFahrzeugAusFlotte(
  firmaId: string,
  flottenFahrzeugId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const admin = createAdminClient()
  const res = await removeFahrzeugFromFlotte(admin, flottenFahrzeugId, firmaId)
  if (!res.ok) return res
  revalidatePath(`/admin/vertrieb/firmen-flotte/${firmaId}`)
  return { ok: true }
}

// ZB1-Batch-Anlage (staff-Variante, Task 8): firmaId kommt aus der Route (staff darf cross-firma).
export async function scanZb1KarteFuerFlotte(firmaId: string, base64: string) {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false as const, error: guard.error ?? 'Kein Zugriff' }
  const admin = createAdminClient()
  return scanZb1FuerFlotte(admin, base64, firmaId)
}

export async function legeZb1FahrzeugeFuerFlotte(
  firmaId: string,
  zeilen: BatchAnlageZeile[],
): Promise<BatchAnlageErgebnis[]> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) {
    return zeilen.map((z, i) => ({
      zeileIndex: i,
      kennzeichen: z.felder.kennzeichen,
      status: 'fehler' as const,
      error: guard.error ?? 'Kein Zugriff',
    }))
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return zeilen.map((z, i) => ({
      zeileIndex: i,
      kennzeichen: z.felder.kennzeichen,
      status: 'fehler' as const,
      error: 'Nicht eingeloggt.',
    }))
  }
  const admin = createAdminClient()
  const res = await legeFlottenFahrzeugeAn(admin, zeilen, firmaId, user.id)
  revalidatePath(`/admin/vertrieb/firmen-flotte/${firmaId}`)
  return res
}
