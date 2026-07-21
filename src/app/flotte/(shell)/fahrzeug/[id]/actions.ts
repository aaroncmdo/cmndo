'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { bindeSchadenkarteAnFahrzeug } from '@/lib/schadenkarte/schadenkarte'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

/**
 * Bindet eine gescannte Schadenkarte an DIESES Fahrzeug (Fahrzeug-Detailseite,
 * Flottenmanager). Ownership-Gate: das Fahrzeug muss zur Firma des FM gehoeren;
 * bindeSchadenkarteAnFahrzeug prueft zusaetzlich firma_id + Status der Karte.
 */
export async function bindeKarteFuerFahrzeug(
  token: string,
  vehicleId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  const { data: owner } = await db
    .from('flotten_fahrzeuge')
    .select('id')
    .eq('firma_id', firma.id)
    .eq('vehicle_id', vehicleId)
    .maybeSingle()
  if (!owner) return { ok: false, error: 'Fahrzeug gehört nicht zu Ihrer Flotte.' }

  const res = await bindeSchadenkarteAnFahrzeug(db, {
    token,
    fahrzeugId: vehicleId,
    firmaId: firma.id,
    userId: user.id,
  })
  if (res.ok) {
    revalidatePath(`/flotte/fahrzeug/${vehicleId}`)
    revalidatePath('/flotte/karten')
  }
  return res
}
