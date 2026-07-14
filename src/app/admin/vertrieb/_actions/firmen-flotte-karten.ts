'use server'

// Firmen-Flotten Admin-Actions: Schaden-Karten minten + an Fahrzeuge binden (staff-Variante).
// Wiederverwendet die KANONISCHE schadenkarte-Lib (89f501f6-owned, src/lib/schadenkarte/*);
// hier nur der staff-Wrapper hinter requireRole. Kein eigener Mint/Bind-Code.
import { requireRole } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mintSchadenkarten, bindeSchadenkarteAnFahrzeug } from '@/lib/schadenkarte/schadenkarte'

export async function minteKartenFuerFlotte(
  firmaId: string,
  anzahl: number,
  charge?: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const admin = createAdminClient()
  const res = await mintSchadenkarten(admin, { firmaId, anzahl, charge: charge?.trim() || null })
  if (!res.ok) return { ok: false, error: res.error }
  revalidatePath(`/admin/vertrieb/firmen-flotte/${firmaId}`)
  return { ok: true }
}

export async function bindeKarteAnFahrzeug(
  firmaId: string,
  token: string,
  fahrzeugId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  const admin = createAdminClient()
  const res = await bindeSchadenkarteAnFahrzeug(admin, { token, fahrzeugId, firmaId, userId: user.id })
  if (!res.ok) return { ok: false, error: res.error }
  revalidatePath(`/admin/vertrieb/firmen-flotte/${firmaId}`)
  return { ok: true }
}
