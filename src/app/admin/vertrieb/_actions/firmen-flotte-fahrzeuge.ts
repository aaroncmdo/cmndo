'use server'

// Firmen-Flotten Admin-Actions: Fahrzeuge einer Flotte verwalten (staff-Variante).
// Wiederverwendet die geteilte mutate-flotte-Lib (NICHT firma-gated — der Ownership-Gate liegt
// beim Caller). Hier ist der Caller staff (requireRole admin/dispatch), darf also cross-firma.
import { requireRole } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { addFahrzeugToFlotte, removeFahrzeugFromFlotte } from '@/lib/flotte/mutate-flotte'
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
