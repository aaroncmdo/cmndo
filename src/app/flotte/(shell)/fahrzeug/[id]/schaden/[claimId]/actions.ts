'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

/**
 * Flottenmanager laedt ein Dokument zu einem Schaden seiner Flotte hoch.
 * Ownership-Gate identisch zu getFlottenClaimView: Fahrzeug->Firma + Claim->Fahrzeug.
 * Das Dokument wird fuer die bearbeitenden Rollen + den flottenmanager sichtbar gemacht.
 */
export async function ladeFlottenSchadenDokumentHoch(
  vehicleId: string,
  claimId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  // Gate 1: Fahrzeug gehoert zur Firma?
  const { data: owner } = await db
    .from('flotten_fahrzeuge')
    .select('id')
    .eq('firma_id', firma.id)
    .eq('vehicle_id', vehicleId)
    .maybeSingle()
  if (!owner) return { ok: false, error: 'Fahrzeug gehört nicht zu Ihrer Flotte.' }

  // Gate 2: Claim gehoert GENAU zu diesem Fahrzeug?
  const { data: claimRow } = await db
    .from('claims')
    .select('id,vehicle_id')
    .eq('id', claimId)
    .maybeSingle()
  const claim = claimRow as { id: string; vehicle_id: string | null } | null
  if (!claim || claim.vehicle_id !== vehicleId) {
    return { ok: false, error: 'Schaden gehört nicht zu diesem Fahrzeug.' }
  }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { ok: false, error: 'Bitte eine Datei auswählen.' }

  // fall_id via Bridge (fall_dokumente ist fall-gekeyt).
  const { data: bridgeRow } = await db
    .from('faelle_claim_bridge')
    .select('fall_id')
    .eq('claim_id', claimId)
    .maybeSingle()
  const fallId = ((bridgeRow as { fall_id?: string | null } | null)?.fall_id) ?? null

  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `claims/${claimId}/flottenmanager/${Date.now()}.${ext}`
  const { error: upErr } = await db.storage.from('fall-dokumente').upload(path, file)
  if (upErr) return { ok: false, error: upErr.message }

  const { error: insErr } = await db.from('fall_dokumente').insert({
    fall_id: fallId,
    claim_id: claimId,
    dokument_typ: 'sonstiges',
    kategorie: 'flottenmanager',
    storage_path: path,
    original_filename: file.name,
    groesse_bytes: file.size,
    mime_type: file.type || null,
    quelle: 'flottenmanager',
    hochgeladen_von_user_id: user.id,
    // Sichtbar fuer die bearbeitenden Rollen + den hochladenden Flottenmanager (nicht 'kunde'/'dispatch').
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'flottenmanager'],
  })
  if (insErr) return { ok: false, error: insErr.message }

  revalidatePath(`/flotte/fahrzeug/${vehicleId}/schaden/${claimId}`)
  return { ok: true }
}
