'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { addFahrzeugToFlotte, removeFahrzeugFromFlotte } from '@/lib/flotte/mutate-flotte'
import type { FahrzeugForm } from '@/lib/kunde/firma-flotte'

export async function fuegeFahrzeugHinzu(form: FahrzeugForm): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto.' }
  const res = await addFahrzeugToFlotte(db, firma.id, form, user.id)
  if (res.ok) revalidatePath('/flotte/flotte')
  return res
}

export async function entferneFahrzeug(flottenId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto.' }
  const res = await removeFahrzeugFromFlotte(db, flottenId, firma.id)
  if (res.ok) revalidatePath('/flotte/flotte')
  return res
}
