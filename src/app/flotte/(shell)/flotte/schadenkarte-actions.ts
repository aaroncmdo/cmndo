'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { bindeSchadenkarteAnFahrzeug } from '@/lib/schadenkarte/schadenkarte'

export async function bindeKarte(token: string, vehicleId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto.' }
  const res = await bindeSchadenkarteAnFahrzeug(db, { token, fahrzeugId: vehicleId, firmaId: firma.id, userId: user.id })
  if (res.ok) revalidatePath('/flotte/flotte')
  return res
}
